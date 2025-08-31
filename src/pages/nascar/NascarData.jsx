import React, { useEffect, useMemo, useState } from "react";

/* ============================ DATA SOURCES ============================ */
// Use BASE so paths work on Netlify/GitHub Pages subpaths too
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
// files live in public/logos/nascar
const NUM_LOGO_BASE  = `${BASE}logos/nascar`;  // e.g. /logos/nascar/24.png
const MAKE_LOGO_BASE = `${BASE}logos/nascar`;  // e.g. /logos/nascar/ford.png
const NUM_IMG_CLS  = "h-7 w-7"; // car number size (28x28)
const MAKE_IMG_CLS = "h-5 w-5"; // make logo size  (20x20)

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

  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr("");
      try {
        const r = await fetch(`${url}?_=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) {
          const ct = r.headers.get("content-type") || "";
          const body = ct.includes("application/json") ? await r.text() : "";
          throw new Error(`HTTP ${r.status} at ${url}${body ? ` — ${body.slice(0,120)}…` : ""}`);
        }
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
    // widen aliases so missing fields show up
    ["Engine","Engine Supplier","Engine Make","Power Unit"],
    ["Sponsor","Primary Sponsor"],
    ["Crew Chief","CrewChief","Crew Chief Name"],
  ],
  "Practice": [
    ["1 Lap","1Lap"], ["5 Lap","5Lap"], ["10 Lap","10Lap"], ["15 Lap","15Lap"],
    ["20 Lap","20Lap"], ["25 Lap","25Lap"], ["30 Lap","30Lap"],
    ["Overall","Practice Overall","Practice"],
  ],
  "GFS": [["GFS","GfS","GFS Score"]],
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

/* ============================ UI ============================ */

export default function NascarData({ series = "cup" }) {
  const key   = String(series || "cup").toLowerCase();
  const src   = NASCAR_DATA_SOURCES[key] || NASCAR_DATA_SOURCES.cup;
  const title = TITLES[key] || "NASCAR — Data";
  const { data, loading, err } = useJson(src);

  const rawCols = useMemo(() => (data.length ? Object.keys(data[0]) : []), [data]);

  // Build columns, then hide duplicate "Overall" and relabel "GFS" → "Overall" if both exist
  const { columns, bands, relabelGfsToOverall } = useMemo(() => {
    const res = buildColumnsAndBands(rawCols);
    let cols = [...res.columns];
    let bnds = [...res.bands];

    const idxOverall = cols.findIndex((c) => keynorm(stripDupSuffix(c)) === "overall");
    const idxGfs     = cols.findIndex((c) => keynorm(stripDupSuffix(c)) === "gfs");

    let needRelabel = false;
    if (idxOverall !== -1 && idxGfs !== -1) {
      cols = cols.filter((_, i) => i !== idxOverall);

      // adjust band spans for removed column
      let cursor = 0;
      bnds = bnds.map((b) => {
        const start = cursor;
        const end = start + b.span - 1;
        const removeInThis = idxOverall >= start && idxOverall <= end;
        const span = b.span - (removeInThis ? 1 : 0);
        cursor += span;
        return span > 0 ? { ...b, span } : null;
      }).filter(Boolean);

      needRelabel = true;
    }

    return { columns: cols, bands: bnds, relabelGfsToOverall: needRelabel };
  }, [rawCols]);

  // find canonical col names present in this file
  const carNumColName = useMemo(() => {
    for (const c of rawCols) {
      const kn = keynorm(stripDupSuffix(c));
      if (kn === "car#" || kn === "number" || kn === "carnumber" || (/#/.test(c) && /car/i.test(c))) return c;
    }
    return null;
  }, [rawCols]);
  const carNumNorm = carNumColName ? keynorm(stripDupSuffix(carNumColName)) : "";
  const carMakeNorms = new Set(["carmake", "make", "manufacturer"]);

  // search
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = lower(q); if (!s) return data;
    return data.filter((r) => {
      const driver = lower(r.Driver || r.Name || "");
      const team   = lower(r.Team || "");
      // try any make-like column
      let makeVal = "";
      for (const c of rawCols) if (carMakeNorms.has(keynorm(stripDupSuffix(c)))) { makeVal = r[c]; break; }
      const make = lower(makeVal || "");
      return driver.includes(s) || team.includes(s) || make.includes(s);
    });
  }, [data, q, rawCols]);

  // sort
  const [sort, setSort] = useState({ key: columns[0] || "DK Salary", dir: "desc" });
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

  // thick borders AFTER these columns (display index)
  const thickAfterSet = useMemo(() => {
    const wants = ["Odds", "Crew Chief", "Overall","GFS"].map((n) => keynorm(n));
    const set = new Set();
    columns.forEach((c, i) => {
      const k = keynorm(stripDupSuffix(c));
      if (wants.includes(k)) set.add(i);
      if (/avgfastlaps?/.test(k) || /avgflaps?/.test(k)) set.add(i);
    });
    return set;
  }, [columns]);

  // classes
  const textSz = "text-[12px]";
  const cellCls = "px-2 py-1";
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
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search driver / team / make…"
          className="h-9 w-72 rounded-lg border border-gray-300 px-3 text-sm focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-auto">
        <table className={`w-full border-separate ${textSz}`} style={{ borderSpacing: 0 }}>
          {columns.length > 0 && (
            <thead className="sticky top-0 z-10">
              <tr className="bg-blue-100 text-[11px] font-bold text-gray-700 uppercase">
                {bands.map((g) => (
                  <th key={`${g.name}-${g.start}`} colSpan={g.span} className="px-2 py-1 text-center border-b border-blue-200">
                    {g.name}
                  </th>
                ))}
              </tr>
              <tr className="bg-blue-50">
                {columns.map((c, i) => (
                  <th
                    key={c}
                    className={[
                      headerCls,
                      i === 0 ? "sticky left-0 z-20 bg-blue-50" : "",
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
                          if (relabelGfsToOverall && kn === "gfs") return "Overall";
                          return name;
                        })()}
                      </span>
                      {sort.key === c ? <span className="text-gray-500">{sort.dir === "desc" ? "▼" : "▲"}</span> : <span className="text-gray-300">▲</span>}
                    </span>
                  </th>
                ))}
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

                    const borders = thickAfterSet.has(i) ? "border-r-2 border-blue-300" : "border-r border-blue-50";
                    const sticky  = i === 0 ? `sticky left-0 z-10 ${rIdx % 2 ? "bg-gray-50/40" : "bg-white"}` : "";

                    // Replacement cells:
                    if (isCarNumCol && key === "cup") {
                      const n = parseNumericLike(row[c]);
                      const src = n != null ? `${NUM_LOGO_BASE}/${Math.round(n)}.png` : "";
                      return (
                        <td key={`${c}-${rIdx}`} className={`text-center ${cellCls} ${borders} ${sticky}`}>
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

                    if (isCarMakeCol) {
                      const slug0 = lower(String(row[c] || "")).replace(/[^a-z0-9]+/g, "");
                      const slug = slug0 === "chevy" || slug0 === "chev" ? "chevrolet" : slug0;
                      const src = slug ? `${MAKE_LOGO_BASE}/${slug}.png` : "";
                      return (
                        <td key={`${c}-${rIdx}`} className={`text-center ${cellCls} ${borders} ${sticky}`}>
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
                          isDriver ? "text-left font-medium" : "text-center",
                          borders,
                          sticky,
                        ].join(" ")}
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
