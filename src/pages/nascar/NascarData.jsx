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

/* ============================ LOGO PATHS & SIZES ============================ */
const NUM_LOGO_BASE  = `${BASE}logos/nascar`;
const MAKE_LOGO_BASE = `${BASE}logos/nascar`;
const NUM_IMG_CLS  = "h-6 w-6 md:h-7 md:w-7";
const MAKE_IMG_CLS = "h-4 w-4 md:h-5 md:w-5";

/* ============================ HELPERS ============================ */
const norm  = (s) => String(s ?? "").trim();
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

/* ============================ JSON FETCH HOOK ============================ */
function useJson(url) {
  const [data, setData] = useState([]),
        [loading, setLoading] = useState(true),
        [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr("");
      try {
        const r = await fetch(`${url}?_=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status} at ${url}`);
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
    ["Driver","Name"], ["DK Salary","DK Sal","DK"], ["FD Salary","FD Sal","FD"],
    ["Qual","Qual Pos","Starting Pos","Start"], ["Odds","Bet Odds"],
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
  "GFS": [["GFS","GfS","GFS Score"], ["Overall"]], // keep “Overall” near GFS if present
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
    const hit = rawCols.find(
      (rc) => !used.has(rc) && keynorm(stripDupSuffix(rc)) === want
    );
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

/* ============ Conditional-formatting directions (higher vs lower) ============ */
const HIGHER_BETTER = new Set([
  "#ofraces","#ofracesraces","races",
  "avgdkpts","avgfdpts","avgdriverrating","wins","t5","t10","t15","t20",
  "avglapsled","avgfastlaps","avgflaps"
]);
const LOWER_BETTER = new Set(["avgfinish","avgrunningpos","avgrunpos"]);

function dirForCol(name) {
  const k = keynorm(stripDupSuffix(name));
  if (LOWER_BETTER.has(k)) return "lower";
  if (HIGHER_BETTER.has(k)) return "higher";
  return null;
}
function heat(min, max, v, dir) {
  const n = parseNumericLike(v);
  if (n == null || !Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;
  let t = (n - min) / (max - min);
  t = Math.max(0, Math.min(1, t));
  if (dir === "lower") t = 1 - t; // green when lower is better
  // soft pastel green→red
  const hue = 120 * t; // 0=green, 120=red (we inverted already for lower-better)
  return { backgroundColor: `hsl(${120 - hue} 75% 92%)`, color: `hsl(${120 - hue} 35% 18%)` };
}

/* ============================ UI ============================ */

export default function NascarData({ series = "cup" }) {
  const key   = String(series || "cup").toLowerCase();
  const src   = NASCAR_DATA_SOURCES[key] || NASCAR_DATA_SOURCES.cup;
  const title = TITLES[key] || "NASCAR — Data";
  const { data, loading, err } = useJson(src);

  const rawCols = useMemo(() => (data.length ? Object.keys(data[0]) : []), [data]);

  // Build columns; if “Overall” + “GFS” both exist, keep the GFS *band* but relabel the column to “Overall”
  const { columns, bands, idxOverall, idxGfs } = useMemo(() => {
    const res = buildColumnsAndBands(rawCols);
    const cols = [...res.columns];
    const iOverall = cols.findIndex((c) => keynorm(stripDupSuffix(c)) === "overall");
    const iGfs     = cols.findIndex((c) => keynorm(stripDupSuffix(c)) === "gfs");
    // if both present, remove the dup Overall (keep the GFS column but display header text “Overall”)
    if (iOverall !== -1 && iGfs !== -1) cols.splice(iOverall, 1);
    return { columns: cols, bands: res.bands, idxOverall: cols.findIndex((c) => keynorm(stripDupSuffix(c)) === "overall"), idxGfs: cols.findIndex((c) => keynorm(stripDupSuffix(c)) === "gfs") };
  }, [rawCols]);

  // search
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = lower(q); if (!s) return data;
    return data.filter((r) => {
      const driver = lower(r.Driver || r.Name || "");
      const team   = lower(r.Team || "");
      // make/manufacturer
      let makeVal = "";
      for (const c of rawCols) {
        const kn = keynorm(stripDupSuffix(c));
        if (kn === "carmake" || kn === "make" || kn === "manufacturer") { makeVal = r[c]; break; }
      }
      const make = lower(makeVal || "");
      return driver.includes(s) || team.includes(s) || make.includes(s);
    });
  }, [data, q, rawCols]);

  // sort
  const [sort, setSort] = useState({ key: columns[0] || "", dir: "desc" });
  const onSort = (k) => setSort((p) => (p.key === k ? { key: k, dir: p.dir === "asc" ? "desc" : "asc" } : { key: k, dir: dirForCol(k) === "lower" ? "asc" : "desc" }));
  function compareRows(a, b, k) {
    const av = parseNumericLike(a[k]), bv = parseNumericLike(b[k]);
    if (av != null && bv != null) return av - bv;
    return String(a[k] ?? "").localeCompare(String(b[k] ?? ""), undefined, { sensitivity: "base" });
  }
  const sorted = useMemo(() => {
    const arr = [...filtered]; const sgn = sort.dir === "asc" ? 1 : -1;
    if (sort.key) arr.sort((a, b) => sgn * compareRows(a, b, sort.key));
    return arr;
  }, [filtered, sort]);

  // heat stats per column (based on the current filtered set)
  const heatStats = useMemo(() => {
    const stats = {};
    if (!sorted.length) return stats;
    columns.forEach((c) => {
      const dir = dirForCol(c);
      if (!dir) return;
      let min = Infinity, max = -Infinity;
      for (const r of sorted) {
        const n = parseNumericLike(r?.[c]);
        if (n != null) { if (n < min) min = n; if (n > max) max = n; }
      }
      if (min !== Infinity && max !== -Infinity) stats[c] = { min, max, dir };
    });
    return stats;
  }, [sorted, columns]);

  // thick borders AFTER these columns + LEFT border before Overall
  const thickAfterSet = useMemo(() => {
    const wants = ["Odds","Crew Chief"].map((n) => keynorm(n));
    const set = new Set();
    columns.forEach((c, i) => {
      const k = keynorm(stripDupSuffix(c));
      if (wants.includes(k)) set.add(i);
      if (/avgfastlaps?/.test(k) || /avgflaps?/.test(k)) set.add(i);
    });
    return set;
  }, [columns]);

  // classes (compact on mobile)
  const textSz = "text-[11px] md:text-[12px]";
  const cellCls = "px-2 py-1";
  const headerCls = "px-2 py-1 font-semibold text-center whitespace-nowrap cursor-pointer select-none";

  // find “driver” and car # / make cols for logos
  const carNumColName = useMemo(() => {
    for (const c of rawCols) {
      const kn = keynorm(stripDupSuffix(c));
      if (kn === "car#" || kn === "number" || kn === "carnumber" || (/#/.test(c) && /car/i.test(c))) return c;
    }
    return null;
  }, [rawCols]);
  const carNumNorm = carNumColName ? keynorm(stripDupSuffix(carNumColName)) : "";
  const carMakeNorms = new Set(["carmake", "make", "manufacturer"]);

  return (
    <div className="px-3 md:px-6 py-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl md:text-3xl font-extrabold">{title}</h1>
          <div className="text-xs md:text-sm text-gray-600">
            {loading ? "Loading…" : err ? `Error: ${err}` : `${sorted.length.toLocaleString()} rows`}
          </div>
        </div>
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search driver / team / make…"
          className="h-9 w-full sm:w-80 rounded-lg border border-gray-300 px-3 text-sm focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-auto">
        <table className={`w-full border-separate ${textSz}`} style={{ borderSpacing: 0 }}>
          {columns.length > 0 && (
            <thead className="sticky top-0 z-20">
              {/* Band header row (frozen) */}
              <tr className="bg-blue-100 text-[10px] md:text-[11px] font-bold text-gray-700 uppercase">
                {bands.map((g) => (
                  <th
                    key={`${g.name}-${g.start}`}
                    colSpan={g.span}
                    className="px-2 py-1 text-center border-b border-blue-200"
                  >
                    {/* special case: if GFS band contains the Overall column, show “GFS” label */}
                    {g.name === "GFS" && idxGfs !== -1 ? "GFS" : g.name}
                  </th>
                ))}
              </tr>
              {/* Column header row (frozen) */}
              <tr className="bg-blue-50">
                {columns.map((c, i) => {
                  const dir = dirForCol(c);
                  const arrow = sort.key === c ? (sort.dir === "desc" ? "▼" : "▲") : (dir === "lower" ? "▲" : "▼");
                  const leftBorderForOverall = i === idxOverall ? "border-l-2 border-blue-300" : "";
                  return (
                    <th
                      key={c}
                      className={[
                        headerCls,
                        i === 0 ? "sticky left-0 z-30 bg-blue-50" : "",
                        leftBorderForOverall,
                        thickAfterSet.has(i) ? "border-r-2 border-blue-300" : "border-r border-blue-200",
                        keynorm(c) === "driver" ? "text-left" : "",
                      ].join(" ")}
                      onClick={() => onSort(c)}
                      title="Click to sort"
                    >
                      <span className="inline-flex items-center gap-1">
                        <span>
                          {(() => {
                            const name = stripDupSuffix(c);
                            const kn = keynorm(name);
                            // If this *column* is the GFS data, display header as “Overall”
                            if (kn === "gfs") return "Overall";
                            return name;
                          })()}
                        </span>
                        <span className={sort.key === c ? "text-gray-600" : "text-gray-300"}>{arrow}</span>
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
          )}

          <tbody>
            {loading && (
              <tr><td className={`${cellCls} text-center text-gray-500`} colSpan={columns.length}>Loading…</td></tr>
            )}
            {err && (
              <tr><td className={`${cellCls} text-center text-red-600`} colSpan={columns.length}>Failed to load: {err}</td></tr>
            )}

            {!loading && !err && sorted.map((row, rIdx) => {
              const rowBg = rIdx % 2 ? "bg-gray-50/40" : "bg-white";
              return (
                <tr key={rIdx} className={rowBg}>
                  {columns.map((c, i) => {
                    const nice = stripDupSuffix(c);
                    const kn   = keynorm(nice);
                    const isDriver = kn === "driver";
                    const isCarNumCol  = carNumColName && kn === carNumNorm;
                    const isCarMakeCol = carMakeNorms.has(kn);

                    const bordersR = thickAfterSet.has(i) ? "border-r-2 border-blue-300" : "border-r border-blue-50";
                    const borderLOverall = i === idxOverall ? "border-l-2 border-blue-300" : "";
                    const sticky  = i === 0 ? `sticky left-0 z-10 ${rIdx % 2 ? "bg-gray-50/40" : "bg-white"}` : "";

                    // heat
                    const hs = heatStats[c];
                    const style = hs ? heat(hs.min, hs.max, row?.[c], hs.dir) : null;

                    // number logo
                    if (isCarNumCol && key === "cup") {
                      const n = parseNumericLike(row[c]);
                      const src = n != null ? `${NUM_LOGO_BASE}/${Math.round(n)}.png` : "";
                      return (
                        <td key={`${c}-${rIdx}`} className={`text-center ${cellCls} ${bordersR} ${borderLOverall} ${sticky}`} style={style || undefined}>
                          <span className="inline-flex items-center justify-center">
                            {/* eslint-disable-next-line jsx-a11y/alt-text */}
                            <img
                              src={src}
                              className={NUM_IMG_CLS}
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

                    // make logo
                    if (isCarMakeCol) {
                      const slug0 = lower(String(row[c] || "")).replace(/[^a-z0-9]+/g, "");
                      const slug = slug0 === "chevy" || slug0 === "chev" ? "chevrolet" : slug0;
                      const src = slug ? `${MAKE_LOGO_BASE}/${slug}.png` : "";
                      return (
                        <td key={`${c}-${rIdx}`} className={`text-center ${cellCls} ${bordersR} ${borderLOverall} ${sticky}`} style={style || undefined}>
                          <span className="inline-flex items-center justify-center">
                            {/* eslint-disable-next-line jsx-a11y/alt-text */}
                            <img
                              src={src}
                              className={MAKE_IMG_CLS}
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
                          cellCls,
                          isDriver ? "text-left font-medium whitespace-nowrap overflow-hidden text-ellipsis" : "text-center",
                          bordersR,
                          borderLOverall,
                          sticky,
                        ].join(" ")}
                        style={style || undefined}
                        title={String(row?.[c] ?? "")}
                      >
                        {fmtCell(row[c])}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {!loading && !err && sorted.length === 0 && (
              <tr><td className={`${cellCls} text-center text-gray-500`} colSpan={columns.length}>No rows match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
