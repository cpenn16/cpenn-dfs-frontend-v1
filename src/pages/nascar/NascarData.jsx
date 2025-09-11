// src/pages/nascar/CupData.jsx
import React, { useEffect, useMemo, useState } from "react";

/* ============================ DATA SOURCES ============================ */
const BASE = import.meta?.env?.BASE_URL ?? "/";
const NASCAR_DATA_SOURCES = {
  cup:     `${BASE}data/nascar/cup/latest/data.json`,
  xfinity: `${BASE}data/nascar/xfinity/latest/data.json`,
  trucks:  `${BASE}data/nascar/trucks/latest/data.json`,
};
const TITLES = {
  cup: "NASCAR — Cup Data",
  xfinity: "NASCAR — Xfinity Data",
  trucks: "NASCAR — Trucks Data",
};

/* ============================ LOGO PATHS ============================ */
const NUM_LOGO_BASE  = `${BASE}logos/nascar`;
const MAKE_LOGO_BASE = `${BASE}logos/nascar`;

/* ============================ HELPERS ============================ */
const norm = (s) => String(s ?? "").trim();
const lower = (s) => norm(s).toLowerCase();
const keynorm = (s) => lower(String(s).replace(/[\s._%]/g, ""));
const stripDupSuffix = (s) => String(s).replace(/_\d+$/, "");

function parseNumericLike(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  if (/%$/.test(s)) return Number(s.replace(/%/g, "")) ?? null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
function fmtCell(v) {
  const raw = norm(v);
  if (!raw) return "";
  if (/%$/.test(raw)) return raw;
  const n = parseNumericLike(raw);
  if (n == null) return raw;
  const f = n.toFixed(1);
  return f.endsWith(".0") ? f.slice(0, -2) : f;
}

/* ============================ FETCH ============================ */
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
      } catch (e) {
        if (alive) setErr(String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [url]);

  return { data, loading, err };
}

/* ============================ ORDER / BANDS ============================ */
const ORDER = {
  "Driver Info": [
    ["Driver","Name"],
    ["DK Salary","DK Sal","DK"],
    ["FD Salary","FD Sal","FD"],
    ["Qual","Qual Pos","Starting Pos","Start"],
    ["Odds","Bet Odds"],
  ],
  "Car Info": [
    ["Car #","Car#","Number","#"],
    ["Car Make","Make","Manufacturer"],
    ["Team","Race Team"],
    ["Engine","Engine Supplier","Engine Make","Power Unit"],
    ["Sponsor","Primary Sponsor"],
    ["Crew Chief","CrewChief","Crew Chief Name"],
  ],
  "Practice": [
    ["1 Lap","1Lap"], ["5 Lap","5Lap"], ["10 Lap","10Lap"], ["15 Lap","15Lap"],
    ["20 Lap","20Lap"], ["25 Lap","25Lap"], ["30 Lap","30Lap"],
    ["Overall","Practice Overall","Practice"],
  ],
  "GFS": [["GFS","GfS","GFS Score","Overall"]], // we’ll display the single “Overall” here
  "Track History Stats": [
    ["# of Races","Races"], ["Avg DK Pts"], ["Avg FD Pts"], ["Avg Finish"], ["Avg Running Pos","Avg Run Pos"],
    ["Avg Driver Rating","Avg Drv Rtg"], ["Wins"], ["T5","Top5"], ["T10","Top10"], ["T15","Top15"], ["T20","Top20"],
    ["Avg Laps Led","Avg LLed"], ["Avg Fast Laps","Avg FLaps"],
  ],
  "Similar Track Stats": [
    ["# of Races","Races"], ["Avg DK Pts"], ["Avg FD Pts"], ["Avg Finish"], ["Avg Running Pos","Avg Run Pos"],
    ["Avg Driver Rating","Avg Drv Rtg"], ["Wins"], ["T5","Top5"], ["T10","Top10"], ["T15","Top15"], ["T20","Top20"],
    ["Avg Laps Led","Avg LLed"], ["Avg Fast Laps","Avg FLaps"],
  ],
  "Season Stats": [
    ["# of Races","Races"], ["Avg DK Pts"], ["Avg FD Pts"], ["Avg Finish"], ["Avg Running Pos","Avg Run Pos"],
    ["Avg Driver Rating","Avg Drv Rtg"], ["Wins"], ["T5","Top5"], ["T10","Top10"], ["T15","Top15"], ["T20","Top20"],
    ["Avg Laps Led","Avg LLed"], ["Avg Fast Laps","Avg FLaps"],
  ],
};
const BANDS = [
  "Driver Info","Car Info","Practice","GFS","Track History Stats","Similar Track Stats","Season Stats",
];

function resolveOne(aliases, rawCols, used) {
  const cands = Array.isArray(aliases) ? aliases : [aliases];
  for (const cand of cands) {
    const want = keynorm(cand);
    const hit = rawCols.find((rc) => !used.has(rc) && keynorm(stripDupSuffix(rc)) === want);
    if (hit) return hit;
  }
  return null;
}
function buildColumnsAndBands(rawCols) {
  const used = new Set();
  const groups = new Map(BANDS.map((b) => [b, []]));
  for (const band of BANDS) for (const item of ORDER[band] || []) {
    const actual = resolveOne(item, rawCols, used);
    if (actual) { groups.get(band).push(actual); used.add(actual); }
  }
  const columns = BANDS.flatMap((b) => groups.get(b));
  const bands = [];
  let start = 0;
  for (const b of BANDS) {
    const n = groups.get(b).length;
    if (n > 0) { bands.push({ name: b, start, span: n }); start += n; }
  }
  return { columns, bands };
}

/* ============================ HEATMAP (dir + palettes) ============================ */
const HIGHER_GOOD = new Set([
  "#ofraces","avgdkpts","avgfdpts","avgdriverrating","wins","t5","t10","t15","t20","avglapsled","avgfastlaps"
]);
const LOWER_GOOD  = new Set(["avgfinish","avgrunningpos","avgrunpos"]);

function dirForCol(c) {
  const k = keynorm(stripDupSuffix(c));
  if (HIGHER_GOOD.has(k)) return "higher";
  if (LOWER_GOOD.has(k))  return "lower";
  return null;
}

function heatColor(min, max, v, dir, palette) {
  if (palette === "none") return null;
  const n = parseNumericLike(v);
  if (n == null || !Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;

  let t = (n - min) / (max - min);
  t = Math.max(0, Math.min(1, t));
  if (dir === "lower") t = 1 - t;

  if (palette === "blueorange") {
    if (t < 0.5) {
      const u = t / 0.5; // blue -> white
      const h = 220, s = 60 - u * 55, l = 92 + u * 6;
      return `hsl(${h} ${s}% ${l}%)`;
    } else {
      const u = (t - 0.5) / 0.5; // white -> orange
      const h = 30, s = 8 + u * 80, l = 98 - u * 8;
      return `hsl(${h} ${s}% ${l}%)`;
    }
  }
  // default Rd–Yl–Gn
  if (t < 0.5) {
    const u = t / 0.5;
    const h = 0 + u * 60, s = 80, l = 96 - u * 6;
    return `hsl(${h} ${s}% ${l}%)`;
  } else {
    const u = (t - 0.5) / 0.5;
    const h = 60 + u * 60, s = 70, l = 92 - u * 4;
    return `hsl(${h} ${s}% ${l}%)`;
  }
}

/* ============================ UI ============================ */
export default function NascarData({ series = "cup" }) {
  const key   = String(series || "cup").toLowerCase();
  const src   = NASCAR_DATA_SOURCES[key] || NASCAR_DATA_SOURCES.cup;
  const title = TITLES[key] || "NASCAR — Data";
  const { data, loading, err } = useJson(src);

  const rawCols  = useMemo(() => (data.length ? Object.keys(data[0]) : []), [data]);
  const { columns, bands } = useMemo(() => buildColumnsAndBands(rawCols), [rawCols]);

  // indices for “Overall” (GFS band) to add thick borders
  const overallIndex = useMemo(() => {
    const i = columns.findIndex((c) => keynorm(stripDupSuffix(c)) === "overall" || keynorm(stripDupSuffix(c)) === "gfs");
    return i;
  }, [columns]);

  // find car number & make columns for logos
  const carNumColName = useMemo(() => {
    for (const c of rawCols) {
      const kn = keynorm(stripDupSuffix(c));
      if (kn === "car#" || kn === "number" || kn === "carnumber" || (/#/.test(c) && /car/i.test(c))) return c;
    }
    return null;
  }, [rawCols]);
  const carNumNorm = carNumColName ? keynorm(stripDupSuffix(carNumColName)) : "";
  const carMakeNorms = new Set(["carmake","make","manufacturer"]);

  /* ---- controls ---- */
  const [q, setQ] = useState("");
  const [compact, setCompact] = useState(true);
  const [palette, setPalette] = useState("none"); // default NONE

  const filtered = useMemo(() => {
    const s = lower(q); if (!s) return data;
    return data.filter((r) => {
      const driver = lower(r.Driver || r.Name || "");
      const team   = lower(r.Team || "");
      let makeVal = "";
      for (const c of rawCols) if (carMakeNorms.has(keynorm(stripDupSuffix(c)))) { makeVal = r[c]; break; }
      const make = lower(makeVal || "");
      return driver.includes(s) || team.includes(s) || make.includes(s);
    });
  }, [data, q, rawCols]);

  const [sort, setSort] = useState({ key: columns[0] || "Driver", dir: "asc" });
  const onSort = (k) => setSort((p) => (p.key === k ? { key: k, dir: p.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "desc" }));
  function compareRows(a, b, k) {
    const av = parseNumericLike(a[k]), bv = parseNumericLike(b[k]);
    if (av != null && bv != null) return av - bv;
    return String(a[k] ?? "").localeCompare(String(b[k] ?? ""), undefined, { sensitivity: "base" });
  }
  const sorted = useMemo(() => {
    const arr = [...filtered]; const sgn = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => sgn * compareRows(a, b, sort.key)); return arr;
  }, [filtered, sort]);

  // heat stats per column over current rows
  const heatStats = useMemo(() => {
    const stats = {};
    if (!sorted.length) return stats;
    for (const c of columns) {
      const dir = dirForCol(c);
      if (!dir) continue;
      let min = Infinity, max = -Infinity;
      for (const r of sorted) {
        const n = parseNumericLike(r?.[c]);
        if (n == null) continue;
        if (n < min) min = n;
        if (n > max) max = n;
      }
      if (min < Infinity && max > -Infinity && max > min) stats[c] = { min, max, dir };
    }
    return stats;
  }, [sorted, columns]);

  /* ---- styling ---- */
  const textSz  = compact ? "text-[11px]" : "text-[12px]";
  const headPad = compact ? "px-2 py-1" : "px-2 py-1.5";
  const cellPad = compact ? "px-2 py-1" : "px-2 py-1.5";
  const lineTight = "leading-tight";
  const headerCls = `font-semibold text-center whitespace-nowrap cursor-pointer select-none ${headPad} ${textSz} ${lineTight}`;
  const cellBase  = `whitespace-nowrap ${cellPad} ${textSz} ${lineTight}`;

  return (
    <div className="px-4 md:px-6 py-4">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl md:text-3xl font-extrabold">{title}</h1>
          <div className="text-sm text-gray-600">
            {loading ? "Loading…" : err ? `Error: ${err}` : `${sorted.length.toLocaleString()} rows`}
          </div>
        </div>
        <div className="sm:ml-auto flex items-center gap-2">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={compact} onChange={() => setCompact((v) => !v)} />
            Compact
          </label>
          <select
            value={palette}
            onChange={(e) => setPalette(e.target.value)}
            className="h-8 rounded-lg border px-2 text-sm"
            title="Heatmap palette"
          >
            <option value="none">Palette: None</option>
            <option value="rdylgn">Palette: Rd–Yl–Gn</option>
            <option value="blueorange">Palette: Blue–Orange</option>
          </select>
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search driver / team / make…"
            className="h-8 w-[14rem] sm:w-72 rounded-lg border border-gray-300 px-3 text-sm focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-auto">
        <table className={`w-full border-separate ${textSz}`} style={{ borderSpacing: 0 }}>
          {columns.length > 0 && (
            <thead className="sticky top-0 z-20">
              {/* band row */}
              <tr className="bg-blue-100 text-[11px] font-bold text-gray-700 uppercase">
                {bands.map((g, bi) => (
                  <th
                    key={`${g.name}-${bi}`}
                    colSpan={g.span}
                    className={`px-2 py-1 text-center border-b border-blue-200 sticky top-0 z-20`}
                  >
                    {g.name}
                  </th>
                ))}
              </tr>
              {/* column headers */}
              <tr className="bg-blue-50 sticky top-[26px] z-20">
                {columns.map((c, i) => {
                  const isDriver = keynorm(stripDupSuffix(c)) === "driver";
                  const thickLeft  = i === overallIndex;
                  const thickRight = i === overallIndex;
                  const rightBorder =
                    i === overallIndex
                      ? "border-r-2 border-blue-300"
                      : "border-r border-blue-200";
                  const leftBorder =
                    i === overallIndex
                      ? "border-l-2 border-blue-300"
                      : "border-l border-blue-200";

                  return (
                    <th
                      key={c}
                      className={[
                        headerCls,
                        i === 0 ? "sticky left-0 z-30 bg-blue-50" : "",
                        leftBorder,
                        rightBorder,
                        isDriver ? "text-left" : "",
                      ].join(" ")}
                      onClick={() => onSort(c)}
                      title="Click to sort"
                    >
                      <span className="inline-flex items-center gap-1">
                        <span>{stripDupSuffix(c) === "GFS" ? "Overall" : stripDupSuffix(c)}</span>
                        {sort.key === c ? (
                          <span className="text-gray-600">{sort.dir === "desc" ? "▼" : "▲"}</span>
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
              <tr><td className={`${cellBase} text-center text-gray-500`} colSpan={columns.length}>Loading…</td></tr>
            )}
            {err && (
              <tr><td className={`${cellBase} text-center text-red-600`} colSpan={columns.length}>Failed to load: {err}</td></tr>
            )}

            {!loading && !err && sorted.map((row, rIdx) => {
              const rowBg = rIdx % 2 ? "bg-gray-50/40" : "bg-white";
              return (
                <tr key={rIdx} className={`${rowBg}`}>
                  {columns.map((c, i) => {
                    const nice = stripDupSuffix(c);
                    const kn   = keynorm(nice);
                    const isDriver = kn === "driver";
                    const isCarNumCol  = carNumColName && kn === carNumNorm;
                    const isCarMakeCol = carMakeNorms.has(kn);

                    // borders (thick around Overall)
                    const leftBorder =
                      i === overallIndex ? "border-l-2 border-blue-300" : "border-l border-blue-50";
                    const rightBorder =
                      i === overallIndex ? "border-r-2 border-blue-300" : "border-r border-blue-50";

                    const sticky  = i === 0 ? `sticky left-0 z-10 ${rowBg}` : "";

                    // heat
                    const hs = heatStats[c];
                    const bg = hs ? heatColor(hs.min, hs.max, row?.[c], hs.dir, palette) : null;

                    // number logo replacement
                    if (isCarNumCol && key === "cup") {
                      const n = parseNumericLike(row[c]);
                      const src = n != null ? `${NUM_LOGO_BASE}/${Math.round(n)}.png` : "";
                      return (
                        <td key={`${c}-${rIdx}`} className={`text-center ${cellBase} ${leftBorder} ${rightBorder} ${sticky}`} style={{ backgroundColor: bg || undefined }}>
                          <span className="inline-flex items-center justify-center">
                            {/* eslint-disable-next-line jsx-a11y/alt-text */}
                            <img
                              src={src}
                              className="h-6 w-6"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = "inline";
                              }}
                            />
                            <span style={{ display: "none" }}>{fmtCell(row[c])}</span>
                          </span>
                        </td>
                      );
                    }

                    // make logo replacement
                    if (isCarMakeCol) {
                      const slug0 = lower(String(row[c] || "")).replace(/[^a-z0-9]+/g, "");
                      const slug = slug0 === "chevy" || slug0 === "chev" ? "chevrolet" : slug0;
                      const src = slug ? `${MAKE_LOGO_BASE}/${slug}.png` : "";
                      return (
                        <td key={`${c}-${rIdx}`} className={`text-center ${cellBase} ${leftBorder} ${rightBorder} ${sticky}`} style={{ backgroundColor: bg || undefined }}>
                          <span className="inline-flex items-center justify-center">
                            {/* eslint-disable-next-line jsx-a11y/alt-text */}
                            <img
                              src={src}
                              className="h-5 w-5"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = "inline";
                              }}
                            />
                            <span style={{ display: "none" }}>{fmtCell(row[c])}</span>
                          </span>
                        </td>
                      );
                    }

                    // default cell
                    return (
                      <td
                        key={`${c}-${rIdx}`}
                        className={[
                          cellBase,
                          isDriver ? "text-left font-medium truncate max-w-[16ch]" : "text-center",
                          leftBorder,
                          rightBorder,
                          sticky,
                        ].join(" ")}
                        style={{ backgroundColor: bg || undefined }}
                        title={isDriver ? String(row?.[c] ?? "") : undefined}
                      >
                        {fmtCell(row[c])}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {!loading && !err && sorted.length === 0 && (
              <tr><td className={`${cellBase} text-center text-gray-500`} colSpan={columns.length}>No rows match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
