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
const HIDE_PLAYER_INFO_LABEL = true; // show/hide the "Player Info" band title

// logos are served from /public/logos/nfl/XXX.png -> /logos/nfl/XXX.png
const LOGO_BASE = "/logos/nfl";
const LOGO_EXT = "png";
const TEAM_ABBR_MAP = { WSH: "WAS", JAC: "JAX", OAK: "LV", SD: "LAC", STL: "LAR" };

/* ============================ UI THEME (compact-only) ============================ */

const THEME = {
  radius: "rounded-2xl",
  headerBg: "bg-slate-100",
  bandBg: "bg-slate-200",
  zebraOdd: "bg-white",
  zebraEven: "bg-slate-50/60",
  border: "border-slate-200",
  bandBorder: "border-slate-300",
};

const CELL_PAD = "px-2 py-1.5";
const HEADER_PAD = "px-2 py-1.5";
const TEXT_SZ = "text-[11.5px]";

/* ============================ HELPERS ============================ */

const norm = (s) => String(s ?? "").trim();
const lower = (s) => norm(s).toLowerCase();
const keynorm = (s) => lower(String(s).replace(/[\s._%]/g, "")); // unify keys like "Comp %" vs "Comp%"

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
      "Yards", "TD", ["Int", "INT"], "Attempts", "YPA", ["Comp %", "Comp%"],
      "Rush Yds", "Rush Att", "Rush TD", "YPC", "QBR",
    ],
    Matchup: ["DK Pts", "Rank", "Yards", "TD", "INT", "R. Yds", "R. TD"],
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

// desired header -> actual column name (handles aliases)
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
      if (real) { buckets.get(band).push(real); used.add(real); }
    }
  }
  const columns = BAND_ORDER.flatMap((b) => buckets.get(b));
  const bands = [];
  let start = 0;
  for (const b of BAND_ORDER) {
    const n = buckets.get(b).length;
    if (n > 0) { bands.push({ name: b, start, span: n }); start += n; }
  }
  return { columns, bands };
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

/* ============================ DIRECTION RULES + PALETTES ============================ */

// Always heat O/U & Imp Total as higher = better
const ALWAYS_HEAT_HIGH = [/^o\/u$/i, /^imp[\s._-]*total$/i];

// Regex direction rules (captures aliases like "R. Yds", "ReYds", etc.)
const DIR_RULES = [
  // higher is better
  { re: /^(yards?|yds)$/i, dir: "higher" },
  { re: /^rec[\s._-]*yds$|^re[\s._-]*yds$|^ru[\s._-]*yds$|^rush[\s._-]*yds$/i, dir: "higher" },
  { re: /^(td|ru[\s._-]*td|re[\s._-]*td|rush[\s._-]*td)$/i, dir: "higher" },
  { re: /^ypa$/i, dir: "higher" },
  { re: /^comp%$/i, dir: "higher" },
  { re: /^rush[\s._-]*att$|^attempts?$/i, dir: "higher" },
  { re: /^ypc$/i, dir: "higher" },
  { re: /^qbr$/i, dir: "higher" },
  { re: /^dk[\s._-]*pts?$/i, dir: "higher" },
  { re: /^rank$/i, dir: "higher" },
  { re: /^rec$/i, dir: "higher" },
  { re: /^targets?$/i, dir: "higher" },
  { re: /^tgt[\s._-]*shr$/i, dir: "higher" },
  { re: /^opr$/i, dir: "higher" },
  { re: /^adot$/i, dir: "higher" },
  { re: /^msair$/i, dir: "higher" },
  { re: /^routes%$/i, dir: "higher" },

  // lower is better
  { re: /^int$/i, dir: "lower" },
  { re: /^r[\s._-]*yds$/i, dir: "lower" },  // defense allowed "R. Yds"
  { re: /^r[\s._-]*td$/i, dir: "lower" },
  { re: /^dk[\s._-]*sal(ary)?$/i, dir: "lower" },
  { re: /^fd[\s._-]*sal(ary)?$/i, dir: "lower" },
  { re: /^block%$/i, dir: "lower" },
];

function directionForColumn(colName) {
  const k = String(colName).trim();
  if (ALWAYS_HEAT_HIGH.some((rx) => rx.test(k))) return "higher";
  for (const { re, dir } of DIR_RULES) if (re.test(k)) return dir;
  return null;
}

// palette: 'rdylgn' (red→yellow→green), 'blueorange' (blue→white→orange, orange=better), 'none' (off)
function heatColor(min, max, v, dir, palette) {
  if (palette === "none") return null;
  if (v == null || min == null || max == null || min === max || !dir) return null;
  let t = (v - min) / (max - min);
  t = Math.max(0, Math.min(1, t));
  if (dir === "lower") t = 1 - t;

  // Blue → White → Orange
  if (palette === "blueorange") {
    if (t < 0.5) {
      const u = t / 0.5;                 // blue → white
      const h = 220;                      // blue hue
      const s = 60 - u * 55;
      const l = 90 + u * 7;
      return `hsl(${h}, ${s}%, ${l}%)`;
    } else {
      const u = (t - 0.5) / 0.5;          // white → orange
      const h = 30;                        // orange hue
      const s = 5 + u * 80;
      const l = 97 - u * 7;
      return `hsl(${h}, ${s}%, ${l}%)`;
    }
  }

  // default Rd→Yl→Gn with soft mid
  if (t < 0.5) {
    const u = t / 0.5;
    const h = 0 + u * 60;   // red → yellow
    const s = 78 + u * 10;
    const l = 94 - u * 2;
    return `hsl(${h}, ${s}%, ${l}%)`;
  } else {
    const u = (t - 0.5) / 0.5;
    const h = 60 + u * 60;  // yellow → green
    const s = 88 - u * 18;
    const l = 92 + u * 2;
    return `hsl(${h}, ${s}%, ${l}%)`;
  }
}

/* ============================ MAIN ============================ */

export default function NflPosData({ pos = "QB" }) {
  const key = String(pos || "QB").toUpperCase();
  const src = DATA_SOURCES[key] || DATA_SOURCES.QB;
  const title = TITLES[key] || "NFL — Data";
  const { data, loading, err } = useJson(src);

  // palette control — DEFAULT: none
  const [palette, setPalette] = useState("none");

  const rawCols = useMemo(() => (data.length ? Object.keys(data[0]) : []), [data]);
  const { columns, bands } = useMemo(() => buildColumnsAndBandsForPos(key, rawCols), [key, rawCols]);

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

  // Build min/max for any column we plan to color (based on current filtered set)
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
  const cellCls = `${CELL_PAD} text-center`;
  const headerCls = `${HEADER_PAD} font-semibold text-center whitespace-nowrap cursor-pointer select-none`;

  return (
    <div className="px-3 md:px-6 py-4 md:py-5">
      <div className="flex items-start md:items-center justify-between gap-3 mb-2 flex-col md:flex-row">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl md:text-3xl font-extrabold">{title}</h1>
          <div className="text-xs md:text-sm text-gray-600">
            {loading ? "Loading…" : err ? `Error: ${err}` : `${sorted.length.toLocaleString()} rows`}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Player picker */}
          <div className="relative" ref={pickerRef}>
            <button
              className="h-8 md:h-9 rounded-lg border border-slate-300 bg-white px-2.5 md:px-3 text-xs md:text-sm hover:bg-slate-50"
              onClick={() => setPickerOpen((v) => !v)}
            >
              {selected.size === 0 ? "All players" : `${selected.size} selected`}
            </button>
            {pickerOpen && (
              <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow p-2">
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
                  {(pickFilter
                    ? allPlayers.filter((n) => lower(n).includes(lower(pickFilter)))
                    : allPlayers
                  ).map((name) => (
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
            className="h-8 md:h-9 w-44 md:w-72 rounded-lg border border-slate-300 px-2 md:px-3 text-xs md:text-sm focus:ring-2 focus:ring-indigo-500"
          />

          {/* palette selector (default None) */}
          <div className="flex items-center gap-1 md:gap-2">
            <label className="text-xs text-slate-600 hidden md:block">Palette</label>
            <select
              value={palette}
              onChange={(e) => setPalette(e.target.value)}
              className="h-8 rounded-lg border px-2 text-xs"
            >
              <option value="none">None</option>
              <option value="rdylgn">Rd–Yl–Gn</option>
              <option value="blueorange">Blue–Orange</option>
            </select>
          </div>
        </div>
      </div>

      {/* legend removed */}

      <div className={`${THEME.radius} border ${THEME.border} bg-white shadow-sm overflow-auto`}>
        <table className={`w-full border-separate ${TEXT_SZ}`} style={{ borderSpacing: 0 }}>
          {columns.length > 0 && (
            <thead className="sticky top-0 z-10">
              {/* band row */}
              <tr className={`${THEME.bandBg} text-[11px] font-bold text-slate-700 uppercase`}>
                {bands.map((g, idx) => (
                  <th
                    key={`${g.name}-${g.start}`}
                    colSpan={g.span}
                    className={`px-2 py-1 text-center border-b ${THEME.bandBorder} ${
                      idx === 0 ? "first:rounded-tl-2xl" : ""
                    } ${idx === bands.length - 1 ? "last:rounded-tr-2xl" : ""}`}
                  >
                    {HIDE_PLAYER_INFO_LABEL && g.name === "Player Info" ? "" : g.name}
                  </th>
                ))}
              </tr>
              {/* column headers */}
              <tr className={`${THEME.headerBg}`}>
                {columns.map((c, i) => {
                  const isBandEnd = bands.some((b) => b.start + b.span - 1 === i);
                  return (
                    <th
                      key={c}
                      className={[
                        headerCls,
                        isBandEnd ? `border-r-2 ${THEME.bandBorder}` : `border-r ${THEME.border}`,
                        c === "Player" ? "text-left" : "",
                        i === 1 ? "sticky left-0 z-20 " + THEME.headerBg : "",
                      ].join(" ")}
                      onClick={() => onSort(c)}
                      title="Click to sort"
                    >
                      <span className="inline-flex items-center gap-1">
                        <span>{c}</span>
                        {sort.key === c ? (
                          <span className="text-slate-500">{sort.dir === "desc" ? "▼" : "▲"}</span>
                        ) : (
                          <span className="text-slate-300">▲</span>
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
              <tr
                key={rIdx}
                className={`${rIdx % 2 ? THEME.zebraEven : THEME.zebraOdd} hover:bg-sky-50/40 transition-colors`}
              >
                {columns.map((c, i) => {
                  const raw = row[c];
                  const isTeam = keynorm(c) === keynorm("Team");
                  const isOpp = keynorm(c) === keynorm("OPP");
                  const isPlayer = keynorm(c) === keynorm("Player");
                  const content = isTeam || isOpp ? <TeamWithLogo code={raw} /> : fmtCellValue(c, raw);

                  const borders =
                    bands.some((b) => b.start + b.span - 1 === i)
                      ? `border-r-2 ${THEME.bandBorder}`
                      : `border-r ${THEME.border}`;

                  const stat = heatStats[c];
                  const numVal = parseNumericLike(raw);
                  const bg = stat ? heatColor(stat.min, stat.max, numVal, stat.dir, palette) : null;

                  // sticky 2nd column
                  if (i === 1) {
                    return (
                      <td key={`${c}-${rIdx}`} className={[cellCls, isPlayer ? "text-left font-medium" : "text-center", borders].join(" ")}>
                        <div
                          className={`sticky left-0 z-10 ${
                            rIdx % 2 ? THEME.zebraEven : THEME.zebraOdd
                          } -ml-2 pl-2 pr-2 shadow-[inset_-5px_0_5px_-5px_rgba(0,0,0,0.12)]`}
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
