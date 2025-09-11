// src/pages/nascar/NascarData.jsx
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

  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr("");
      try {
        const r = await fetch(`${url}?_=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) {
          const body = await r.text();
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
    ["Engine","Engine Supplier","Engine Make","Power Unit"],
    ["Sponsor","Primary Sponsor"],
    ["Crew Chief","CrewChief","Crew Chief Name"],
  ],
  "Practice": [
    ["1 Lap","1Lap"], ["5 Lap","5Lap"], ["10 Lap","10Lap"], ["15 Lap","15Lap"],
    ["20 Lap","20Lap"], ["25 Lap","25Lap"], ["30 Lap","30Lap"],
    ["Overall","Practice Overall","Practice"],
  ],
  "GFS": [["GFS","GfS","GFS Score"], ["Overall"]], // Overall may exist separately; we’ll dedupe below
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
  let columns = BANDS.flatMap((b) => groups.get(b));
  let bands = [];
  let start = 0;
  for (const b of BANDS) {
    const n = groups.get(b).length;
    if (n > 0) { bands.push({ name: b, start, span: n }); start += n; }
  }

  // Deduplicate “Overall” if both Overall and GFS->Overall exist; keep the one under GFS band.
  const idxOverall = columns.findIndex((c) => keynorm(stripDupSuffix(c)) === "overall");
  const idxGfs     = columns.findIndex((c) => keynorm(stripDupSuffix(c)) === "gfs");
  if (idxOverall !== -1 && idxGfs !== -1) {
    // remove the standalone Overall, keep GFS (we’ll relabel the column header to “Overall”)
    columns = columns.filter((_, i) => i !== idxOverall);

    let cursor = 0;
    bands = bands.map((b) => {
      const start = cursor;
      const end = start + b.span - 1;
      const removeInThis = idxOverall >= start && idxOverall <= end;
      const span = b.span - (removeInThis ? 1 : 0);
      cursor += span;
      return span > 0 ? { ...b, span } : null;
    }).filter(Boolean);

    return { columns, bands, relabelGfsToOverall: true };
  }

  return { columns, bands, relabelGfsToOverall: false };
}

/* ============================ UI ============================ */

export default function NascarData({ series = "cup" }) {
  const key   = String(series || "cup").toLowerCase();
  const src   = NASCAR_DATA_SOURCES[key] || NASCAR_DATA_SOURCES.cup;
  const title = TITLES[key] || "NASCAR — Data";
  const { data, loading, err } = useJson(src);

  const rawCols = useMemo(() => (data.length ? Object.keys(data[0]) : []), [data]);

  const { columns, bands, relabelGfsToOverall } = useMemo(
    () => buildColumnsAndBands(rawCols),
    [rawCols]
  );

  // column indices for special styling (thick borders, overall left+right)
  const overallIdx = useMemo(() => {
    let i = columns.findIndex((c) => keynorm(stripDupSuffix(c)) === "overall");
    if (i === -1) i = columns.findIndex((c) => keynorm(stripDupSuffix(c)) === "gfs"); // relabeled case
    return i;
  }, [columns]);

  const thickAfterSet = useMemo(() => {
    // make right borders after these
    const wantsAfter = ["Odds", "Crew Chief", "30 Lap", "Avg Fast Laps"].map((n) => keynorm(n));
    const set = new Set();
    columns.forEach((c, i) => {
      const k = keynorm(stripDupSuffix(c));
      if (wantsAfter.includes(k)) set.add(i);
      if (/avgfastlaps?/.test(k) || /avgflaps?/.test(k)) set.add(i);
    });
    if (overallIdx !== -1) set.add(overallIdx); // right border for Overall
    return set;
  }, [columns, overallIdx]);

  // find canonical columns
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
      let makeVal = "";
      for (const c of rawCols) if (carMakeNorms.has(keynorm(stripDupSuffix(c)))) { makeVal = r[c]; break; }
      const make = lower(makeVal || "");
      return driver.includes(s) || team.includes(s) || make.includes(s);
    });
  }, [data, q, rawCols]);

  // sort (auto DK Salary desc if present)
  const [sort, setSort] = useState({ key: columns[0] || "DK Salary", dir: "desc" });
  useEffect(() => {
    // when columns resolve, auto-pick DK Salary if available
    const dk = columns.find((c) => keynorm(stripDupSuffix(c)) === "dksalary");
    if (dk) setSort({ key: dk, dir: "desc" });
  }, [columns]);

  const onSort = (k) =>
    setSort((p) => (p.key === k ? { key: k, dir: p.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "desc" }));

  function compareRows(a, b, k) {
    const av = parseNumericLike(a[k]), bv = parseNumericLike(b[k]);
    if (av != null && bv != null) return av - bv;
    return String(a[k] ?? "").localeCompare(String(b[k] ?? ""), undefined, { sensitivity: "base" });
  }
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const sgn = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => sgn * compareRows(a, b, sort.key));
    return arr;
  }, [filtered, sort]);

  // sizing + classes (mobile-friendly)
  const textSz = "text-[12px] md:text-[13px]";
  const cellCls = "px-2 py-1";
  const headerCls = "px-2 py-1 font-semibold text-center whitespace-nowrap cursor-pointer select-none";

  // width hints (Driver wider)
  const widthByColCh = useMemo(() => {
    const w = {};
    if (!sorted.length) return w;
    const sample = sorted.slice(0, 150);
    for (const c of columns) {
      let maxLen = String(stripDupSuffix(c)).length;
      for (const r of sample) maxLen = Math.max(maxLen, String(r?.[c] ?? "").length);
      const kn = keynorm(stripDupSuffix(c));
      if (kn === "driver" || kn === "name") w[c] = Math.min(Math.max(maxLen, 18), 26);
      else w[c] = Math.min(Math.max(maxLen + 2, 6), 14);
    }
    return w;
  }, [columns, sorted]);

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
          className="h-9 w-64 md:w-72 rounded-lg border border-gray-300 px-3 text-sm focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-auto">
        <table className={`w-full border-separate ${textSz}`} style={{ borderSpacing: 0 }}>
          {columns.length > 0 && (
            <thead className="sticky top-0 z-10">
              {/* Band row with blue background and vertical dividers */}
              <tr className="bg-blue-100 text-[11px] font-bold text-gray-700 uppercase">
                {bands.map((g, gi) => (
                  <th
                    key={`${g.name}-${g.start}`}
                    colSpan={g.span}
                    className={[
                      "px-2 py-1 text-center border-b border-blue-200",
                      gi > 0 ? "border-l border-blue-200" : "",
                    ].join(" ")}
                  >
                    {g.name === "GFS" ? "GFS" : g.name}
                  </th>
                ))}
              </tr>

              {/* Column headers */}
              <tr className="bg-blue-50">
                {columns.map((c, i) => (
                  <th
                    key={c}
                    className={[
                      headerCls,
                      // sticky header for first column
                      i === 0 ? "sticky left-0 z-20 bg-blue-50" : "",
                      // right border rules (thick or thin)
                      thickAfterSet.has(i) ? "border-r-2 border-blue-300" : "border-r border-blue-200",
                      // left thick border for Overall
                      i === overallIdx ? "border-l-2 border-blue-300" : "",
                      keynorm(c) === "driver" ? "text-left" : "",
                    ].join(" ")}
                    onClick={() => onSort(c)}
                    title="Click to sort"
                    style={{ minWidth: i === 0 ? "16ch" : undefined }}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>
                        {(() => {
                          const name = stripDupSuffix(c);
                          const kn = keynorm(name);
                          // show column label as "Overall" when it's the GFS column kept
                          if (relabelGfsToOverall && kn === "gfs") return "Overall";
                          return name;
                        })()}
                      </span>
                      {sort.key === c ? (
                        <span className="text-gray-500">{sort.dir === "desc" ? "▼" : "▲"}</span>
                      ) : (
                        <span className="text-gray-300">▲</span>
                      )}
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
              const zebra = rIdx % 2 ? "bg-gray-50/40" : "bg-white";
              return (
                <tr key={rIdx} className={["group", zebra, "hover:bg-blue-50/60 transition-colors"].join(" ")}>
                  {columns.map((c, i) => {
                    const nice = stripDupSuffix(c);
                    const kn   = keynorm(nice);
                    const isDriver = kn === "driver" || kn === "name";
                    const isCarNumCol  = carNumColName && kn === carNumNorm;
                    const isCarMakeCol = carMakeNorms.has(kn);

                    // base borders
                    const rightBorder = thickAfterSet.has(i) ? "border-r-2 border-blue-300" : "border-r border-blue-50";
                    const leftBorder  = i === overallIdx ? "border-l-2 border-blue-300" : "";
                    // sticky behavior + hover-follow for first column
                    const stickyFirst = i === 0
                      ? `sticky left-0 z-20 ${zebra} group-hover:bg-blue-50/60`
                      : "";

                    // common cell classes
                    const tdBase = [
                      cellCls,
                      isDriver ? "text-left font-medium" : "text-center",
                      rightBorder,
                      leftBorder,
                      stickyFirst,
                    ].join(" ");

                    // special renders
                    if (isCarNumCol && key === "cup") {
                      const n = parseNumericLike(row[c]);
                      const src = n != null ? `${NUM_LOGO_BASE}/${Math.round(n)}.png` : "";
                      return (
                        <td key={`${c}-${rIdx}`} className={tdBase} style={{ maxWidth: `${widthByColCh[c] ?? 10}ch` }}>
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
                        <td key={`${c}-${rIdx}`} className={tdBase} style={{ maxWidth: `${widthByColCh[c] ?? 10}ch` }}>
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

                    // default cell (single line + ellipsis so names never wrap)
                    return (
                      <td
                        key={`${c}-${rIdx}`}
                        className={tdBase}
                        style={{ maxWidth: `${widthByColCh[c] ?? 10}ch` }}
                        title={String(row?.[c] ?? "")}
                      >
                        <div className="whitespace-nowrap overflow-hidden text-ellipsis">
                          {fmtCell(row[c])}
                        </div>
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
