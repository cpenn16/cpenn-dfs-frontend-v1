// src/pages/mlb/PitcherData.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/* ============================ CONFIG ============================ */

const DATA_URL = "/data/mlb/latest/pitchers.json"; // <- point to your pitchers JSON
const TITLE = "MLB — Pitcher Data";

const SHOW_TEAM_LOGOS = true;
const HIDE_PLAYER_INFO_LABEL = true;

// logos served from: /public/logos/mlb/XXX.png  ->  /logos/mlb/XXX.png
const LOGO_BASE = "/logos/mlb";
const LOGO_EXT = "png";
const TEAM_FIX = {
  WSH: "WAS", JAC: "JAX", OAK: "OAK",  // MLB rarely needs these, left as examples
  TB: "TB", CHC: "CHC", SF: "SF", HOU: "HOU", NYY: "NYY", ATL: "ATL",
  TEX: "TEX", ARI: "ARI", KC: "KC", MIN: "MIN", COL: "COL", SEA: "SEA", LAA: "LAA",
};

/* ============================ HELPERS ============================ */

const norm = (s) => String(s ?? "").trim();
const lower = (s) => norm(s).toLowerCase();
const keynorm = (s) => lower(String(s).replace(/[\s._%/()\-]/g, ""));

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
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/i);
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
  return TEAM_FIX[c] || c;
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

/* ============================ COLUMNS & BANDS ============================ */
/*
Requested header bands & columns:

Player Info
  Hand, player, DK, FD
Matchup Info
  Team, Opp, Park, Time
Vegas
  Total, W%, K, Field, Rating
Opponent Splits vs Handedness
  K%, BB%, wOBA, ISO, wRC+
Advanced Stats
  IP, Velo, xFIP, K%, SwS%, BB%
Ratios
  K/9, BB/9, HR/9
Statcast
  GB%, FB%, HH%, Bar%, EV
Projections
  DK, Val, FD, Val
*/

// Column aliases to match flexible headers coming from sheets/exports
const ORDER = {
  "Player Info": [
    ["Hand", "Throws", "Handedness"],
    ["Player", "player", "Name"],
    ["DK", "DK Sal", "DK Salary"],
    ["FD", "FD Sal", "FD Salary"],
  ],
  "Matchup Info": [
    ["Team", "Tm"],
    ["Opp", "OPP", "Opponent"],
    ["Park", "Ballpark"],
    ["Time", "Start", "Start Time"],
  ],
  Vegas: [
    ["Total", "O/U", "Team Total", "TT"],
    ["W%", "Win%", "W%"],
    ["K", "Kline", "Ks"],
    ["Field", "Field%", "Field%Proj"],
    ["Rating", "Rate", "Proj Rating"],
  ],
  "Opponent Splits vs Handedness": [
    // We try “Opp …” first to avoid stealing generic “K%/BB%” from Advanced Stats
    ["Opp K%", "K% (Opp)", "K%_Opp", "OK%"],
    ["Opp BB%", "BB% (Opp)", "BB%_Opp", "OBB%"],
    ["Opp wOBA", "wOBA (Opp)", "wOBA_opp"],
    ["Opp ISO", "ISO (Opp)", "ISO_opp"],
    ["Opp wRC+", "wRC+ (Opp)", "wRC+_opp"],
  ],
  "Advanced Stats": [
    ["IP", "Innings", "IP/G"],
    ["Velo", "FB Velo", "Velocity"],
    ["xFIP", "xfip"],
    ["K% (P)", "K%_P", "K%"],
    ["SwS%", "SwStr%", "SwStr% (P)", "SwS% (P)"],
    ["BB% (P)", "BB%_P", "BB%"],
  ],
  Ratios: [
    ["K/9", "K9"],
    ["BB/9", "BB9"],
    ["HR/9", "HR9"],
  ],
  Statcast: [
    ["GB%", "GB% (P)"],
    ["FB%", "FB% (P)"],
    ["HH%", "HardHit%", "Hard%"],
    ["Bar%", "Barrel%", "Barrel%"],
    ["EV", "Avg EV", "Exit Velo"],
  ],
  Projections: [
    ["DK Proj", "DK", "DK Projection"],
    ["Val (DK)", "Val", "DK Val", "Value"],
    ["FD Proj", "FD", "FD Projection"],
    ["Val (FD)", "FD Val", "FD Value"],
  ],
};

const BAND_ORDER = [
  "Player Info",
  "Matchup Info",
  "Vegas",
  "Ballpark", // Note: “Park” column is in Matchup Info; if you later add ballpark factors, you can map them here.
  "Opponent Splits vs Handedness",
  "Advanced Stats",
  "Ratios",
  "Statcast",
  "Projections",
];

// Map desired header -> actual column name in the data (handles aliases)
// Ensures we don't double-claim the exact same raw column
function resolveOne(spec, rawCols, used) {
  const cands = Array.isArray(spec) ? spec : [spec];
  for (const cand of cands) {
    const want = keynorm(cand);
    const hit = rawCols.find((rc) => keynorm(rc) === want && !used.has(rc));
    if (hit) return hit;
  }
  return null;
}

function buildColumnsAndBands(rawCols) {
  const used = new Set();
  const buckets = new Map(BAND_ORDER.map((b) => [b, []]));

  for (const band of BAND_ORDER) {
    for (const item of ORDER[band] || []) {
      const real = resolveOne(item, rawCols, used);
      if (real) {
        buckets.get(band).push(real);
        used.add(real);
      }
    }
  }

  // Merge: if “Ballpark” ended empty (likely), we omit it.
  const bands = [];
  const columns = [];
  for (const b of BAND_ORDER) {
    const cols = buckets.get(b);
    if (!cols || cols.length === 0) continue;
    const start = columns.length;
    columns.push(...cols);
    bands.push({ name: b, start, span: cols.length });
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

/* ============================ MAIN ============================ */

export default function PitcherData() {
  const { data, loading, err } = useJson(DATA_URL);

  const rawCols = useMemo(() => (data.length ? Object.keys(data[0]) : []), [data]);
  const { columns, bands } = useMemo(() => buildColumnsAndBands(rawCols), [rawCols]);

  // search + player picker
  const [q, setQ] = useState("");
  const allPlayers = useMemo(() => {
    const s = new Set();
    for (const r of data) {
      const n = r.Player || r.player || r.Name;
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
      const name = String(r.Player || r.player || r.Name || "");
      if (restrict && !selected.has(name)) return false;
      if (!s) return true;
      const t = lower(r.Team || r.team || r.Tm);
      const o = lower(r.Opp || r.OPP || r.Opponent || r.opp);
      return lower(name).includes(s) || t.includes(s) || o.includes(s);
    });
  }, [data, q, selected]);

  // default sort: DK > FD > first col
  const [sort, setSort] = useState({ key: "Player", dir: "asc" });
  useEffect(() => {
    if (!columns || columns.length === 0) return;
    const dkKey = columns.find((c) => /\bdk(\s|_|-)?(sal|salary|proj)?\b/i.test(String(c)));
    const fdKey = columns.find((c) => /\bfd(\s|_|-)?(sal|salary|proj)?\b/i.test(String(c)));
    if (dkKey) setSort({ key: dkKey, dir: "desc" });
    else if (fdKey) setSort({ key: fdKey, dir: "desc" });
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
          <h1 className="text-2xl md:text-3xl font-extrabold">{TITLE}</h1>
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
              {selected.size === 0 ? "All pitchers" : `${selected.size} selected`}
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
            placeholder="Search pitcher / team / opp…"
            className="h-9 w-72 rounded-lg border border-gray-300 px-3 text-sm focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-auto">
        <table className={`w-full border-separate ${textSz}`} style={{ borderSpacing: 0 }}>
          {columns.length > 0 && (
            <thead className="sticky top-0 z-10">
              {/* merged band row */}
              <tr className="bg-blue-100 text-[11px] font-bold text-gray-700 uppercase">
                {bands.map((g) => (
                  <th key={`${g.name}-${g.start}`} colSpan={g.span} className="px-2 py-1 text-center border-b border-blue-200">
                    {HIDE_PLAYER_INFO_LABEL && g.name === "Player Info" ? "" : g.name}
                  </th>
                ))}
              </tr>
              {/* column headers */}
              <tr className="bg-blue-50">
                {columns.map((c, i) => {
                  const isBandEnd = bands.some((b) => b.start + b.span - 1 === i);
                  return (
                    <th
                      key={c}
                      className={[
                        headerCls,
                        isBandEnd ? "border-r-2 border-blue-300" : "border-r border-blue-200",
                        c === "Player" || c === "player" || c === "Name" ? "text-left" : "",
                        i === 1 ? "sticky left-0 z-20 bg-blue-50" : "", // freeze 2nd header cell
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
            {!loading &&
              !err &&
              sorted.map((row, rIdx) => (
                <tr key={rIdx} className={rIdx % 2 ? "bg-gray-50/40" : "bg-white"}>
                  {columns.map((c, i) => {
                    const raw = row[c];
                    const isTeam = keynorm(c) === keynorm("Team");
                    const isOpp = keynorm(c) === keynorm("Opp");
                    const isPlayer = ["player", "name", "playername", "player "].includes(keynorm(c)) || c === "Player";

                    const content = isTeam || isOpp ? <TeamWithLogo code={raw} /> : fmtCellValue(c, raw);
                    const isBandEnd = bands.some((b) => b.start + b.span - 1 === i);
                    const borders = isBandEnd ? "border-r-2 border-blue-300" : "border-r border-blue-200";

                    if (i === 1) {
                      // Freeze 2nd column (usually Player)
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
