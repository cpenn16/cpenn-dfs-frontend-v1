import React, { useEffect, useMemo, useRef, useState } from "react";

/* ============================ CONFIG ============================ */

const DATA_SOURCES = {
  QB: "/data/nfl/classic/latest/qb_data.json",
  RB: "/data/nfl/classic/latest/rb_data.json",
  WR: "/data/nfl/classic/latest/wr_data.json",
  TE: "/data/nfl/classic/latest/te_data.json",
  DST: "/data/nfl/classic/latest/dst_data.json",
};

const TITLES = {
  QB: "NFL — QB Data",
  RB: "NFL — RB Data",
  WR: "NFL — WR Data",
  TE: "NFL — TE Data",
  DST: "NFL — DST Data",
};

const SHOW_TEAM_LOGOS = true;
const HIDE_PLAYER_INFO_LABEL = true;

// logos are served from /public/logos/nfl/XXX.png -> /logos/nfl/XXX.png
const LOGO_BASE = "/logos/nfl";
const LOGO_EXT = "png";
const TEAM_ABBR_MAP = { WSH: "WAS", JAC: "JAX", OAK: "LV", SD: "LAC", STL: "LAR" };

/* ============================ HELPERS ============================ */

const norm = (s) => String(s ?? "").trim();
const lower = (s) => norm(s).toLowerCase();
const keynorm = (s) => lower(String(s).replace(/[\s._%]/g, "")); // unify keys

function parseNumericLike(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  if (/%$/.test(s)) {
    const n = Number(s.replace(/%/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function fmtTime(s) {
  const raw = norm(s);
  if (!raw) return "";
  if (/\b(am|pm)\b/i.test(raw))
    return raw.replace(/\s+/g, "").toUpperCase().replace("AM", " AM").replace("PM", " PM");
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return raw;
  let hh = Number(m[1]);
  const mm = m[2];
  const ampm = hh >= 12 ? "PM" : "AM";
  hh = ((hh + 11) % 12) + 1;
  return `${hh}:${mm} ${ampm}`;
}
function timeToMinutes(s) {
  const raw = norm(s);
  if (!raw) return null;
  const ap = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ap) {
    let h = Number(ap[1]), m = Number(ap[2]);
    const pm = /pm/i.test(ap[3]);
    if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12;
    return h * 60 + m;
  }
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function fmtCellValue(col, val) {
  const v = norm(val);
  if (!v) return "";
  if (/%$/.test(v)) return v;
  if (/^time$/i.test(col)) return fmtTime(v);
  if (/\b(sal|salary)\b/i.test(col)) {
    const n = parseNumericLike(v);
    return n == null ? v : Math.round(n).toLocaleString();
  }
  const n = parseNumericLike(v);
  if (n == null) return v;
  const f = n.toFixed(1);
  return f.endsWith(".0") ? f.slice(0, -2) : f;
}

function useJson(url) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const r = await fetch(`${url}?_=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const arr = Array.isArray(j) ? j : j?.rows || j?.data || [];
        if (alive) setData(arr);
      } catch (e) { if (alive) setErr(String(e)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [url]);
  return { data, loading, err };
}

/* ============================ LOGOS ============================ */

function fixAbbr(code) {
  const c = String(code || "").toUpperCase();
  return TEAM_ABBR_MAP[c] || c;
}
function TeamWithLogo({ code }) {
  const c = fixAbbr(code);
  if (!c) return null;
  if (!SHOW_TEAM_LOGOS) return <span>{c}</span>;
  const src = `${LOGO_BASE}/${c}.${LOGO_EXT}`;
  return (
    <span className="inline-flex items-center gap-1">
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <img src={src} className="h-4 w-4 shrink-0" onError={(e) => (e.currentTarget.style.display = "none")} />
      <span>{c}</span>
    </span>
  );
}

/* ============================ EXACT COLUMN ORDERS ============================ */

const ORDER = {
  QB: {
    "Player Info": ["POS", "Player", "DK Sal", "FD Sal"],
    "Matchup Info": ["Team", "OPP", "Home", "Time"],
    Vegas: ["O/U", "Imp Total", "Spread"],
    "Player Stats (Per Game)": [
      "Yards","TD",["Int","INT"],"Attempts","YPA",["Comp %","Comp%"],
      "Rush Yds","Rush Att","Rush TD","YPC","QBR",
    ],
    Matchup: ["DK Pts","Rank","Yards","TD","INT","R. Yds","R. TD"],
  },
  RB: {
    "Player Info": ["POS", "Player", "DK Sal", "FD Sal"],
    "Matchup Info": ["Team", "OPP", "Home", "Time"],
    Vegas: ["O/U", "Imp Total", "Spread"],
    "Player Stats (Per Game)": [
      "Rush Yds","Rush Att","Rush TD","YPC","Rec Yds","Targets","Rec","TD","Tgt Shr","Opr",
    ],
    Matchup: ["DK Pts","Rank","RuYds","RuTD","ReYds","Rec","ReTD"],
  },
  WR: {
    "Player Info": ["POS", "Player", "DK Sal", "FD Sal"],
    "Matchup Info": ["Team", "OPP", "Home", "Time"],
    Vegas: ["O/U", "Imp Total", "Line"],
    "Player Stats (Per Game)": ["Rec Yds","Rec","Targets","TD","Tgt Shr","MsAir","adot"],
    Matchup: ["DK Pts","Rank","Yards","TD"],
  },
  TE: {
    "Player Info": ["POS", "Player", "DK Sal", "FD Sal"],
    "Matchup Info": ["Team", "OPP", "Home", "Time"],
    Vegas: ["O/U", "Imp Total", "Line"],
    "Player Stats (Per Game)": ["Rec Yds","Rec","Targets","TD","Tgt Shr","Routes%","Block%","MsAir","adot"],
    Matchup: ["DK Pts","Rank","Yards","TD"],
  },
};

const BAND_ORDER = ["Player Info","Matchup Info","Vegas","Player Stats (Per Game)","Matchup"];

function resolveOne(spec, rawCols, used) {
  const cands = Array.isArray(spec) ? spec : [spec];
  for (const cand of cands) {
    const want = keynorm(cand);
    const hit = rawCols.find((rc) => keynorm(rc) === want && !used.has(rc));
    if (hit) return hit;
  }
  return null;
}

function buildColumnsAndBandsForPos(pos, rawCols) {
  const spec = ORDER[pos] || {};
  const used = new Set();
  const buckets = new Map(BAND_ORDER.map((b) => [b, []]));
  for (const band of BAND_ORDER) {
    for (const item of spec[band] || []) {
      const real = resolveOne(item, rawCols, used);
      if (real) {
        buckets.get(band).push(real);
        used.add(real);
      }
    }
  }
  const columns = BAND_ORDER.flatMap((b) => buckets.get(b));
  const bands = [];
  let start = 0;
  for (const b of BAND_ORDER) {
    const n = buckets.get(b).length;
    if (n > 0) {
      bands.push({ name: b, start, span: n });
      start += n;
    }
  }
  const boundaries = new Set(bands.map((s) => s.start + s.span - 1));
  return { columns, bands, boundaries };
}

/* ============================ PLAYER PICKER ============================ */

function useOutsideClick(ref, onClose) {
  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [ref, onClose]);
}

/* ============================ HEATMAP (direction-aware) ============================ */

/** columns where bigger is better (green when high) */
const HIGHER_BETTER = new Set([
  // from your list (normalize via keynorm below)
  "yards","td","ypa","comp%","rushyds","rushatt","ypc","qbr","dkpts","rank",
  "recyds","targets","rec","tgtshr","opr","ruyds","rutd","reyds","retd",
  "td","adot","msair","routes%",
  // aliases that show up in some sheets
  "recyards","recyds","recyd","dkpts","dkpoints","dkpt","dkp",
]);

/** columns where smaller is better (green when low) */
const LOWER_BETTER = new Set([
  // from your list
  "int","r.yds","r.td","dksal","fdsal","block%","bloxk%",
  // aliases
  "salary","dksalary","fdsalary","blocks%","rtd",
]);

// Always heatmap O/U and Imp Total as "higher is better" like you asked earlier
const ALWAYS_HEAT_HIGH = new Set([ "o/u", "imptotal", "imp total" ].map(keynorm));

function directionForColumn(colName) {
  const k = keynorm(colName);
  if (ALWAYS_HEAT_HIGH.has(k)) return "higher";
  if (HIGHER_BETTER.has(k)) return "higher";
  if (LOWER_BETTER.has(k)) return "lower";
  // special dotted aliases that keynorm collapses:
  if (k === "recyds" || k === "recyards") return "higher";
  if (k === "ruyds" || k === "rushyds") return "higher";
  if (k === "rtd" || k === "rtds" || k === "rtd") return "lower";
  return null; // no coloring
}

// red→green palette; invert when lower is better
function heatColor(min, max, v, dir /* 'higher' | 'lower' */) {
  if (v == null || !Number.isFinite(v) || min == null || max == null || min === max || !dir) return null;
  let t = Math.max(0, Math.min(1, (v - min) / (max - min))); // 0..1
  if (dir === "lower") t = 1 - t; // low values green
  const hue = 0 + t * 120; // 0=red → 120=green
  return `hsl(${hue}, 75%, 92%)`; // soft pastel bg
}

/* ============================ MAIN ============================ */

export default function NflPosData({ pos = "QB" }) {
  const key = String(pos || "QB").toUpperCase();
  const src = DATA_SOURCES[key] || DATA_SOURCES.QB;
  const title = TITLES[key] || "NFL — Data";
  const { data, loading, err } = useJson(src);

  const rawCols = useMemo(() => (data.length ? Object.keys(data[0]) : []), [data]);
  const { columns, bands, boundaries } = useMemo(() => buildColumnsAndBandsForPos(key, rawCols), [key, rawCols]);

  // search + player picker
  const [q, setQ] = useState("");
  const allPlayers = useMemo(() => {
    const s = new Set();
    for (const r of data) {
      const n = r.Player || r.player;
      if (n) s.add(String(n));
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [data]);
  const [selected, setSelected] = useState(new Set()); // empty => all
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickFilter, setPickFilter] = useState("");
  const pickerRef = useRef(null);
  useOutsideClick(pickerRef, () => setPickerOpen(false));

  const toggleOne = (name) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const filtered = useMemo(() => {
    const s = lower(q);
    const restrict = selected.size > 0;
    return data.filter((r) => {
      const name = String(r.Player || r.player || "");
      if (restrict && !selected.has(name)) return false;
      if (!s) return true;
      const t = lower(r.Team || r.team);
      const o = lower(r.OPP || r.Opp || r.opp);
      return lower(name).includes(s) || t.includes(s) || o.includes(s);
    });
  }, [data, q, selected]);

  // Build min/max for any column we plan to color
  const heatStats = useMemo(() => {
    const stats = {};
    if (!filtered.length) return stats;
    const cols = Object.keys(filtered[0] || {});
    for (const col of cols) {
      const dir = directionForColumn(col);
      if (!dir) continue;
      let min = Infinity, max = -Infinity;
      for (const row of filtered) {
        const n = parseNumericLike(row[col]);
        if (n == null) continue;
        if (n < min) min = n;
        if (n > max) max = n;
      }
      if (min !== Infinity && max !== -Infinity) stats[col] = { min, max, dir };
    }
    return stats;
  }, [filtered]);

  // default sort
  const [sort, setSort] = useState({ key: "Player", dir: "asc" });
  useEffect(() => {
    if (!columns || columns.length === 0) return;
    const dkSalKey = columns.find((c) => /\bdk\s*sal(ary)?\b/i.test(String(c)));
    if (dkSalKey) setSort({ key: dkSalKey, dir: "desc" });
    else setSort({ key: columns[0], dir: "asc" });
  }, [columns]);

  const onSort = (keyName) => {
    setSort((prev) =>
      prev.key === keyName ? { key: keyName, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: keyName, dir: "desc" }
    );
  };

  function compareCells(a, b, keyName) {
    if (/^time$/i.test(keyName)) {
      const av = timeToMinutes(a[keyName]);
      const bv = timeToMinutes(b[keyName]);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av - bv;
    }
    if (/\b(sal|salary)\b/i.test(keyName)) {
      const av = parseNumericLike(a[keyName]);
      const bv = parseNumericLike(b[keyName]);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av - bv;
    }
    const av = parseNumericLike(a[keyName]);
    const bv = parseNumericLike(b[keyName]);
    if (av != null && bv != null) return av - bv;
    const sa = String(a[keyName] ?? "");
    const sb = String(b[keyName] ?? "");
    return sa.localeCompare(sb, undefined, { sensitivity: "base" });
  }

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { key: k, dir } = sort;
    const sgn = dir === "asc" ? 1 : -1;
    arr.sort((a, b) => sgn * compareCells(a, b, k));
    return arr;
  }, [filtered, sort]);

  // UI classes
  const textSz = "text-[12px]";
  const cellCls = "px-2 py-1 text-center";
  const headerCls = "px-2 py-1 font-semibold text-center whitespace-nowrap cursor-pointer select-none";

  return (
    <div className="px-4 md:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl md:text-3xl font-extrabold">{title}</h1>
          <div className="text-sm text-gray-600">
            {loading ? "Loading…" : err ? `Error: ${err}` : `${sorted.length.toLocaleString()} rows`}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Player picker */}
          <div className="relative" ref={pickerRef}>
            <button
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm hover:bg-gray-50"
              onClick={() => setPickerOpen((v) => !v)}
            >
              {selected.size === 0 ? "All players" : `${selected.size} selected`}
            </button>
            {pickerOpen && (
              <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow p-2">
                <div className="mb-2 flex items-center gap-2">
                  <button onClick={() => setSelected(new Set(allPlayers))} className="px-2 py-1 text-xs rounded border">
                    All
                  </button>
                  <button onClick={() => setSelected(new Set())} className="px-2 py-1 text-xs rounded border">
                    None
                  </button>
                  <input
                    value={pickFilter}
                    onChange={(e) => setPickFilter(e.target.value)}
                    placeholder="Search players…"
                    className="ml-auto h-7 w-40 rounded border px-2 text-xs"
                  />
                </div>
                <div className="max-h-72 overflow-auto pr-1">
                  {(pickFilter ? allPlayers.filter((n) => lower(n).includes(lower(pickFilter))) : allPlayers).map((name) => (
                    <label key={name} className="flex items-center gap-2 py-1 text-xs">
                      <input
                        type="checkbox"
                        checked={selected.size === 0 ? true : selected.has(name)}
                        onChange={() => toggleOne(name)}
                      />
                      <span className="truncate">{name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* search */}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search player / team / opp…"
            className="h-9 w-72 rounded-lg border border-gray-300 px-3 text-sm focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-auto">
        <table className={`w-full border-separate ${textSz}`} style={{ borderSpacing: 0 }}>
          {columns.length > 0 && (
            <thead className="sticky top-0 z-10">
              {/* band row */}
              <tr className="bg-blue-100 text-[11px] font-bold text-gray-700 uppercase">
                {bands.map((g) => (
                  <th key={`${g.name}-${g.start}`} colSpan={g.span} className="px-2 py-1 text-center border-b border-blue-200">
                    {HIDE_PLAYER_INFO_LABEL && g.name === "Player Info" ? "" : g.name}
                  </th>
                ))}
              </tr>
              {/* header row */}
              <tr className="bg-blue-50">
                {columns.map((c, i) => {
                  const isBandEnd = bands.some((b) => b.start + b.span - 1 === i);
                  return (
                    <th
                      key={c}
                      className={[
                        headerCls,
                        isBandEnd ? "border-r-2 border-blue-300" : "border-r border-blue-200",
                        c === "Player" ? "text-left" : "",
                        i === 1 ? "sticky left-0 z-20 bg-blue-50" : "",
                      ].join(" ")}
                      onClick={() => onSort(c)}
                      title="Click to sort"
                    >
                      <span className="inline-flex items-center gap-1">
                        <span>{c}</span>
                        {sort.key === c ? (
                          <span className="text-gray-500">{sort.dir === "desc" ? "▼" : "▲"}</span>
                        ) : (
                          <span className="text-gray-300">▲</span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
          )}

          <tbody>
            {loading && (
              <tr>
                <td className={`${cellCls} text-gray-500`} colSpan={columns.length}>
                  Loading…
                </td>
              </tr>
            )}
            {err && (
              <tr>
                <td className={`${cellCls} text-red-600`} colSpan={columns.length}>
                  Failed to load: {err}
                </td>
              </tr>
            )}

            {!loading && !err && sorted.map((row, rIdx) => (
              <tr key={rIdx} className={rIdx % 2 ? "bg-gray-50/40" : "bg-white"}>
                {columns.map((c, i) => {
                  const raw = row[c];
                  const isTeam = keynorm(c) === keynorm("Team");
                  const isOpp = keynorm(c) === keynorm("OPP");
                  const isPlayer = keynorm(c) === keynorm("Player");

                  const content = isTeam || isOpp ? <TeamWithLogo code={raw} /> : fmtCellValue(c, raw);
                  const borders =
                    bands.some((b) => b.start + b.span - 1 === i)
                      ? "border-r-2 border-blue-300"
                      : "border-r border-blue-200";

                  // heat bg (direction aware)
                  const stat = heatStats[c];
                  const numVal = parseNumericLike(raw);
                  const bg = stat ? heatColor(stat.min, stat.max, numVal, stat.dir) : null;

                  // sticky 2nd column visual
                  if (i === 1) {
                    return (
                      <td
                        key={`${c}-${rIdx}`}
                        className={[cellCls, isPlayer ? "text-left font-medium" : "text-center", borders].join(" ")}
                      >
                        <div
                          className={`sticky left-0 z-10 ${
                            rIdx % 2 ? "bg-gray-50/40" : "bg-white"
                          } -ml-2 pl-2 pr-2 shadow-[inset_-6px_0_6px_-6px_rgba(0,0,0,0.15)]`}
                        >
                          {content}
                        </div>
                      </td>
                    );
                  }

                  return (
                    <td
                      key={`${c}-${rIdx}`}
                      className={[cellCls, isPlayer ? "text-left font-medium" : "text-center", borders].join(" ")}
                      style={bg ? { backgroundColor: bg } : undefined}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}

            {!loading && !err && sorted.length === 0 && (
              <tr>
                <td className={`${cellCls} text-gray-500`} colSpan={columns.length}>
                  No rows match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
