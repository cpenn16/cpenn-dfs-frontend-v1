// src/pages/nascar/CupPractice.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import PracticeOverlayChart from "../../components/PracticeOverlayChart";

/* ------------------------ data fetch hook ------------------------ */
function useJson(url) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(url, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (alive) {
          setData(j);
          setErr(null);
        }
      })
      .catch((e) => {
        if (alive) {
          setErr(e);
          setData(null);
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [url]);

  return { data, err, loading };
}

/* ----------------------------- helpers ----------------------------- */
// Treat blanks/dashes/NA as non-numeric so they won't be considered mins
const num = (v) => {
  if (v === null || v === undefined) return NaN;
  let s = String(v).trim();
  if (s === "" || s === "-" || s === "—" || /^n\/?a$/i.test(s)) return NaN;
  s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const isNumeric = (v) => Number.isFinite(num(v));
const numericColName = (c) => /^\d+$/.test(String(c).trim());
const looksNumericCol = (c) =>
  numericColName(c) ||
  /(^rank$|^avg|average|laps?$|^std\s*dev$|sal$|qual$|value$)/i.test(
    String(c).trim()
  );

const cmp = (a, b, dir = "asc") => {
  const na = isNumeric(a);
  const nb = isNumeric(b);
  if (na && nb) {
    const va = num(a);
    const vb = num(b);
    return dir === "asc" ? va - vb : vb - va;
  }
  const sa = String(a ?? "").toLowerCase();
  const sb = String(b ?? "").toLowerCase();
  if (sa < sb) return dir === "asc" ? -1 : 1;
  if (sa > sb) return dir === "asc" ? 1 : -1;
  return 0;
};

const findDriverKey = (row) =>
  Object.keys(row || {}).find((k) => /^driver\b/i.test(k)) || "Driver_1";

/** Reorder LAP-BY-LAP so the “main block” is first, then 1..N lap columns, then rest. */
function reorderLapCols(cols) {
  const START = ["Rank", "Average_1", "Driver_1", "#of Laps", "Group"];
  const LAP_BLOCKS = [
    ["1 Lap_1", "1 Lap"],
    ["3 Lap_1", "3 Lap"],
    ["5 Lap_1", "5 Lap"],
    ["10 Lap_1", "10 Lap"],
  ];
  const END = ["Std Dev", "Average"];
  const pick = (pair) => pair.find((name) => cols.includes(name));
  const mainBlock = [
    ...START.filter((c) => cols.includes(c)),
    ...LAP_BLOCKS.map(pick).filter(Boolean),
    ...END.filter((c) => cols.includes(c)),
  ];
  const numeric = cols
    .filter((c) => /^\d+$/.test(String(c)))
    .map(Number)
    .sort((a, b) => a - b)
    .map(String);
  const rest = cols.filter((c) => !mainBlock.includes(c) && !numeric.includes(c));
  return [...mainBlock, ...numeric, ...rest];
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const escapeCSV = (v) => {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const isClose = (a, b, eps = 1e-9) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps;

/* Lower = better for these columns (handles alt names like "1 Lap_1") */
const lowerIsBetter = (c) => {
  const s = String(c).trim().toLowerCase();
  if (s === "rank") return true;
  if (s === "average_1") return true;
  if (/^(1|3|5|10)\s*lap(_1)?$/.test(s)) return true;
  return false;
};

/* ----------------------------- page ----------------------------- */
export default function CupPractice() {
  const SUMMARY_SRC = "/data/nascar/cup/latest/practice_cons.json";
  const LAPS_SRC = "/data/nascar/cup/latest/practice_laps.json";
  const SHOW_SOURCES = false; // flip to true to show JSON paths under title

  const { data: consData, err: consErr, loading: consLoading } = useJson(SUMMARY_SRC);
  const { data: lapsData, err: lapsErr, loading: lapsLoading } = useJson(LAPS_SRC);

  const summaryRows = useMemo(() => {
    if (!consData) return [];
    if (Array.isArray(consData)) return consData;
    if (Array.isArray(consData?.rows)) return consData.rows;
    return [];
  }, [consData]);

  const rows = useMemo(() => {
    if (!lapsData) return [];
    if (Array.isArray(lapsData)) return lapsData;
    if (Array.isArray(lapsData?.rows)) return lapsData.rows;
    return [];
  }, [lapsData]);

  const summaryColsRaw = useMemo(
    () => (summaryRows.length ? Object.keys(summaryRows[0]) : []),
    [summaryRows]
  );
  const lapColsRaw = useMemo(
    () => (rows.length ? reorderLapCols(Object.keys(rows[0])) : []),
    [rows]
  );

  const driverKey = useMemo(() => findDriverKey(rows[0] || {}), [rows]);
  const groupKey = useMemo(
    () => Object.keys(rows[0] || {}).find((k) => /^group$/i.test(k)) || "Group",
    [rows]
  );

  /* -------------------- PRACTICE SUMMARY -------------------- */
  const [sumVisible, setSumVisible] = useState([]);
  useEffect(() => {
    if (summaryColsRaw.length) setSumVisible(summaryColsRaw.map(() => true));
  }, [summaryColsRaw]);

  const sumShowAll = () => setSumVisible(summaryColsRaw.map(() => true));
  const sumHideAll = () => setSumVisible(summaryColsRaw.map(() => false));
  const sumToggleCol = (i) =>
    setSumVisible((v) => {
      const n = [...v];
      n[i] = !n[i];
      return n;
    });
  const summaryCols = summaryColsRaw.filter((_, i) => sumVisible[i]);

  const [sumSort, setSumSort] = useState({ col: "", dir: "asc" });
  const summarySorted = useMemo(() => {
    if (!sumSort.col) return summaryRows;
    return [...summaryRows].sort((a, b) =>
      cmp(a?.[sumSort.col], b?.[sumSort.col], sumSort.dir)
    );
  }, [summaryRows, sumSort]);

  // auto-fit widths for summary
  const sumWidthCh = useMemo(() => {
    const w = {};
    if (!summaryRows.length) return w;
    const sample = summaryRows.slice(0, 200);
    for (const c of summaryColsRaw) {
      let maxLen = 0;
      const headerLen = String(c).length;
      for (const r of sample) {
        const s = String(r?.[c] ?? "");
        maxLen = Math.max(maxLen, s.length);
      }
      if (/^driver/i.test(c)) w[c] = clamp(Math.max(maxLen, 12), 12, 22);
      else if (looksNumericCol(c)) w[c] = clamp(Math.max(maxLen + 2, 6), 6, 12);
      else w[c] = clamp(Math.max(maxLen, Math.min(headerLen, 12)), 10, 16);
    }
    return w;
  }, [summaryRows, summaryColsRaw]);

  const exportSummaryCSV = () => {
    const cols = summaryCols.length ? summaryCols : summaryColsRaw;
    const lines = [];
    lines.push(cols.map(escapeCSV).join(","));
    for (const r of summarySorted)
      lines.push(cols.map((c) => escapeCSV(r?.[c] ?? "")).join(","));
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `practice_summary_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /* -------------------- LAP BY LAP -------------------- */
  const [q, setQ] = useState("");
  const [visibleCols, setVisibleCols] = useState([]);
  useEffect(() => {
    if (lapColsRaw.length) setVisibleCols(lapColsRaw.map(() => true));
  }, [lapColsRaw]);

  const toggleCol = (i) =>
    setVisibleCols((v) => {
      const n = [...v];
      n[i] = !n[i];
      return n;
    });
  const showAll = () => setVisibleCols(lapColsRaw.map(() => true));
  const hideAll = () => setVisibleCols(lapColsRaw.map(() => false));
  const visibleColNames = lapColsRaw.filter((_, i) => visibleCols[i]);

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      lapColsRaw.some((c) => String(r?.[c] ?? "").toLowerCase().includes(needle))
    );
  }, [rows, lapColsRaw, q]);

  const [sort, setSort] = useState({ col: "", dir: "asc" });
  const sortedRows = useMemo(() => {
    if (!sort.col) return filteredRows;
    return [...filteredRows].sort((a, b) =>
      cmp(a?.[sort.col], b?.[sort.col], sort.dir)
    );
  }, [filteredRows, sort]);

  // auto-fit widths for lap table (+ small Plot column after Driver)
  const lapWidthCh = useMemo(() => {
    const w = {};
    if (!rows.length) return w;
    const sample = rows.slice(0, 200);
    for (const c of lapColsRaw) {
      let maxLen = 0;
      const headerLen = String(c).length;
      for (const r of sample) {
        const s = String(r?.[c] ?? "");
        maxLen = Math.max(maxLen, s.length);
      }
      if (/^driver/i.test(c)) w[c] = clamp(Math.max(maxLen, 12), 12, 22);
      else if (looksNumericCol(c)) w[c] = clamp(Math.max(maxLen + 2, 6), 6, 12);
      else w[c] = clamp(Math.max(maxLen, Math.min(headerLen, 12)), 10, 16);
    }
    w.__PLOT__ = 6; // injected Plot column width
    return w;
  }, [rows, lapColsRaw]);

  // 🔦 best (lowest) value per numeric lap column among the visible, filtered rows
  const minPerCol = useMemo(() => {
    const mins = {};
    for (const c of visibleColNames) {
      if (!numericColName(c)) continue;
      let m = Infinity;
      for (const r of sortedRows) {
        const v = num(r?.[c]);
        if (Number.isFinite(v) && v < m) m = v;
      }
      if (m < Infinity) mins[c] = m;
    }
    return mins;
  }, [sortedRows, visibleColNames]);

  // 🔥 heatmap stats (lower = better) for targeted columns
  const heatStats = useMemo(() => {
    const stats = {};
    for (const c of visibleColNames) {
      if (!lowerIsBetter(c)) continue;
      let min = Infinity, max = -Infinity;
      for (const r of sortedRows) {
        const v = num(r?.[c]);
        if (Number.isFinite(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      if (min < Infinity && max > -Infinity && max > min) {
        stats[c] = { min, max };
      }
    }
    return stats;
  }, [sortedRows, visibleColNames]);

  /* ---------- plot selection ---------- */
  const [selectedNames, setSelectedNames] = useState(() => new Set());

  const toggleRow = useCallback((name) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedNames.has(r?.[driverKey])),
    [rows, selectedNames, driverKey]
  );

  const selectGroup = useCallback(
    (letter) => {
      const wanted = rows
        .filter(
          (r) =>
            String(r?.[groupKey] ?? "")
              .trim()
              .toUpperCase() === String(letter).toUpperCase()
        )
        .map((r) => r?.[driverKey])
        .filter(Boolean);
      setSelectedNames(new Set(wanted));
    },
    [rows, driverKey, groupKey]
  );

  const resetLapUI = () => {
    setQ("");
    setSort({ col: "", dir: "asc" });
    showAll();
    setSelectedNames(new Set());
  };

  const exportLapCSV = () => {
    const cols = visibleColNames.length ? visibleColNames : lapColsRaw;
    const lines = [];
    lines.push(cols.map(escapeCSV).join(","));
    for (const r of sortedRows)
      lines.push(cols.map((c) => escapeCSV(r?.[c] ?? "")).join(","));
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `practice_laps_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /* -------------------- render -------------------- */
  const padCell = "px-2 py-1";
  const textSz = "text-xs";
  const headerWrap = "whitespace-normal break-words leading-tight";
  const cellWrap = "whitespace-normal break-words";

  return (
    <div className="px-5 py-6">
      <h1 className="text-3xl font-extrabold mb-1">Cup Lap-by-Lap Data</h1>
      {SHOW_SOURCES && (
        <div className="text-sm text-gray-500 mb-6">
          Summary: <code>{SUMMARY_SRC}</code> | Laps: <code>{LAPS_SRC}</code>
        </div>
      )}

      {/* -------- Practice Summary -------- */}
      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-xl font-bold">Practice Summary</h2>
        <div className="ml-auto flex items-center gap-2">
          <button className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200" onClick={sumShowAll}>
            Show all
          </button>
          <button className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200" onClick={sumHideAll}>
            Hide all
          </button>
          <button className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700" onClick={exportSummaryCSV}>
            Export CSV
          </button>
        </div>
      </div>

      {/* chips */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        {summaryColsRaw.map((c, i) => {
          const on = !!sumVisible[i];
          return (
            <button
              key={c}
              onClick={() => sumToggleCol(i)}
              className={[
                "px-2 py-1 rounded-full text-xs border transition",
                on
                  ? "bg-blue-50 border-blue-300 text-blue-800"
                  : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50",
              ].join(" ")}
            >
              {on ? "✓ " : ""}
              {c}
            </button>
          );
        })}
      </div>

      {consLoading && <div className="text-sm text-gray-600 mb-6">Loading…</div>}
      {consErr && <div className="text-sm text-red-600 mb-6">Failed to load: {String(consErr)}</div>}

      {!consLoading && !consErr && (
        <div className="rounded-xl border bg-white shadow-sm overflow-auto mb-8">
          <table className="w-full table-fixed border-separate" style={{ borderSpacing: 0 }}>
            <colgroup>
              {summaryCols.map((c) => (
                <col key={c} style={{ width: `${sumWidthCh[c] ?? 10}ch` }} />
              ))}
            </colgroup>

            <thead>
              <tr>
                {summaryCols.map((c) => {
                  const active = sumSort.col === c;
                  const arrow = active ? (sumSort.dir === "asc" ? "▲" : "▼") : "▲";
                  const w = sumWidthCh[c] ?? 10;
                  return (
                    <th
                      key={c}
                      onClick={() =>
                        setSumSort((s) => (s.col === c ? { col: c, dir: s.dir === "asc" ? "desc" : "asc" } : { col: c, dir: "asc" }))
                      }
                      title={c}
                      className={[
                        "sticky top-0 z-30 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60",
                        "font-semibold border-b border-gray-200",
                        padCell,
                        textSz,
                        "cursor-pointer select-none text-center",
                        /^driver/i.test(c) ? "left-0" : "",
                      ].join(" ")}
                      style={{ maxWidth: `${w}ch` }}
                    >
                      <div className={["inline-flex items-center gap-1 justify-center w-full", headerWrap].join(" ")}>
                        {c} <span className="opacity-60">{arrow}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {summarySorted.map((r, i) => {
                const zebra = i % 2 ? "bg-gray-50/60" : "bg-white";
                return (
                  <tr key={i} className={[zebra, "hover:bg-blue-50/60 transition-colors"].join(" ")}>
                    {summaryCols.map((c) => (
                      <td
                        key={c}
                        className={[
                          "border-b border-gray-100",
                          padCell,
                          textSz,
                          "text-center tabular-nums",
                          /^driver/i.test(c) ? `sticky left-0 z-20 ${zebra} border-r` : "",
                        ].join(" ")}
                        style={{ maxWidth: `${sumWidthCh[c] ?? 10}ch` }}
                        title={String(r?.[c] ?? "")}
                      >
                        <div className={["w-full", cellWrap].join(" ")}>{r?.[c] ?? ""}</div>
                      </td>
                    ))}
                  </tr>
                );
              })}
              {!summarySorted.length && (
                <tr>
                  <td className={`${padCell} ${textSz} text-gray-500`} colSpan={summaryCols.length}>
                    No rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* -------- Lap-by-Lap -------- */}
      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-xl font-bold">Lap-by-Lap</h2>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="border rounded-lg px-3 py-2 w-56 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200" onClick={() => selectGroup("A")}>
            Select Group A
          </button>
          <button className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200" onClick={() => selectGroup("B")}>
            Select Group B
          </button>
          <button className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200" onClick={showAll}>
            Show all
          </button>
          <button className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200" onClick={hideAll}>
            Hide all
          </button>
          <button className="px-3 py-2 text-sm rounded-lg bg-white border hover:bg-gray-50" onClick={resetLapUI}>
            Reset
          </button>
          <button className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700" onClick={exportLapCSV}>
            Export CSV
          </button>
        </div>
      </div>

      {/* chips */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        {lapColsRaw.map((c, i) => {
          const on = !!visibleCols[i];
          return (
            <button
              key={c}
              onClick={() => toggleCol(i)}
              className={[
                "px-2 py-1 rounded-full text-xs border transition",
                on
                  ? "bg-blue-50 border-blue-300 text-blue-800"
                  : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50",
              ].join(" ")}
            >
              {on ? "✓ " : ""}
              {c}
            </button>
          );
        })}
      </div>

      {lapsLoading && <div className="text-sm text-gray-600">Loading…</div>}
      {lapsErr && <div className="text-sm text-red-600">Failed to load: {String(lapsErr)}</div>}

      {!lapsLoading && !lapsErr && (
        <div className="rounded-xl border bg-white shadow-sm overflow-auto">
          <table className="w-full table-fixed border-separate" style={{ borderSpacing: 0 }}>
            {/* widths (and add a small "Plot" column after the Driver) */}
            <colgroup>
              {visibleColNames.map((c) => (
                <React.Fragment key={c}>
                  <col style={{ width: `${lapWidthCh[c] ?? 10}ch` }} />
                  {c === driverKey && <col key="plot" style={{ width: `${lapWidthCh.__PLOT__}ch` }} />}
                </React.Fragment>
              ))}
            </colgroup>

            <thead>
              <tr>
                {visibleColNames.map((c) => {
                  const active = sort.col === c;
                  const arrow = active ? (sort.dir === "asc" ? "▲" : "▼") : "▲";
                  const w = lapWidthCh[c] ?? 10;
                  return (
                    <React.Fragment key={c}>
                      <th
                        onClick={() =>
                          setSort((s) => (s.col === c ? { col: c, dir: s.dir === "asc" ? "desc" : "asc" } : { col: c, dir: "asc" }))
                        }
                        title={c}
                        className={[
                          "sticky top-0 z-30 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60",
                          "font-semibold border-b border-gray-200",
                          padCell,
                          textSz,
                          "cursor-pointer select-none text-center",
                          c === driverKey ? "left-0" : "",
                        ].join(" ")}
                        style={{ maxWidth: `${w}ch` }}
                      >
                        <div className={["inline-flex items-center gap-1 justify-center w-full", headerWrap].join(" ")}>
                          {c} <span className="opacity-60">{arrow}</span>
                        </div>
                      </th>

                      {c === driverKey && (
                        <th
                          className={[
                            "sticky top-0 z-30 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60",
                            "font-semibold border-b border-gray-200",
                            padCell,
                            textSz,
                            "text-center",
                          ].join(" ")}
                          style={{ maxWidth: `${lapWidthCh.__PLOT__}ch` }}
                        >
                          <div className={["w-full", headerWrap].join(" ")}>Plot</div>
                        </th>
                      )}
                    </React.Fragment>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {sortedRows.map((r, i) => {
                const zebra = i % 2 ? "bg-gray-50/60" : "bg-white";
                return (
                  <tr key={i} className={[zebra, "hover:bg-blue-50/60 transition-colors"].join(" ")}>
                    {visibleColNames.map((c) => {
                      const valNum = num(r?.[c]);
                      const isLap = numericColName(c);
                      const isBest = isLap && isClose(valNum, minPerCol[c]);

                      // Heat color (lower = greener) for targeted columns:
                      let heatStyle = {};
                      if (lowerIsBetter(c) && Number.isFinite(valNum) && heatStats[c]) {
                        const { min, max } = heatStats[c];
                        const t = clamp((valNum - min) / (max - min), 0, 1); // 0 best → 1 worst
                        const hue = 120 * (1 - t); // 120=green, 0=red
                        heatStyle = {
                          backgroundColor: `hsl(${hue} 80% 92%)`,
                          color: `hsl(${hue} 30% 20%)`,
                        };
                      }

                      return (
                        <React.Fragment key={c}>
                          <td
                            className={[
                              "border-b border-gray-100",
                              padCell,
                              textSz,
                              "text-center tabular-nums",
                              c === driverKey ? `sticky left-0 z-20 ${zebra} border-r` : "",
                              isBest ? "bg-lime-100 text-lime-900 font-semibold ring-1 ring-lime-300" : "",
                            ].join(" ")}
                            style={{ maxWidth: `${lapWidthCh[c] ?? 10}ch`, ...heatStyle }}
                            title={String(r?.[c] ?? "")}
                          >
                            <div className={["w-full", cellWrap].join(" ")}>{r?.[c] ?? ""}</div>
                          </td>

                          {c === driverKey && (
                            <td
                              className={["border-b border-gray-100", padCell, textSz, "text-center"].join(" ")}
                              style={{ maxWidth: `${lapWidthCh.__PLOT__}ch` }}
                            >
                              <input
                                type="checkbox"
                                checked={selectedNames.has(r?.[driverKey])}
                                onChange={() => toggleRow(r?.[driverKey])}
                              />
                            </td>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })}
              {!sortedRows.length && (
                <tr>
                  <td className={`${padCell} ${textSz} text-gray-500`} colSpan={visibleColNames.length + 1}>
                    No rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* overlay chart */}
      <div className="mt-8">
        <PracticeOverlayChart rows={selectedRows} driverKey={driverKey} />
      </div>
    </div>
  );
}
