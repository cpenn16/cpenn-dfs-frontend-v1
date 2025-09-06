// src/components/nascar/LineupResultsWithExposure.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/** ----------------------------- helpers ----------------------------- **/
const fmt0 = (n) => (Number.isFinite(n) ? n.toLocaleString() : "—");
const fmt1 = (n) => (Number.isFinite(n) ? (Math.round(n * 10) / 10).toFixed(1) : "—");
const clamp = (v, lo = 0, hi = 1e9) => Math.max(lo, Math.min(hi, v));

/** create a lineup signature "A|B|C|..." regardless of order */
const sig = (drivers) => (Array.isArray(drivers) ? [...drivers].sort().join("|") : "");

/** export selected lineups to CSV */
function exportLineupsCSV(lineups, fname = "lineups.csv") {
  const header = ["#", "Salary", "Proj", "Win%", "Top10%", "Dupes", "Drivers"].join(",");
  const rows = (lineups || []).map((L, i) => [
    i + 1,
    L.salary ?? "",
    Number.isFinite(L.total) ? fmt1(L.total) : "",
    Number.isFinite(L.winPct) ? fmt1(L.winPct) : "",
    Number.isFinite(L.top10Pct) ? fmt1(L.top10Pct) : "",
    L.dupes ?? "",
    `"${(L.drivers || []).join(" • ")}"`,
  ].join(","));
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fname; a.click();
  URL.revokeObjectURL(url);
}

/** export exposure table to CSV */
function exportExposureCSV(exposures, fname = "exposure.csv") {
  const header = "Driver,Count,Exposure %";
  const rows = Object.entries(exposures)
    .sort((a, b) => b[1].pct - a[1].pct || a[0].localeCompare(b[0]))
    .map(([name, v]) => `${csvEscape(name)},${v.count},${fmt1(v.pct)}`);
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fname; a.click();
  URL.revokeObjectURL(url);
}
const csvEscape = (s) => /[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s);

/** ------------------------ main component --------------------------- **/
/**
 * props:
 * - results: [{ drivers: string[], salary: number, total: number, winPct?: number, top10Pct?: number, dupes?: number }]
 * - fieldLineups: [{ drivers: string[] }, ... ]  // used to compute duplicate counts if not provided
 * - onAddToPortfolio?: (selectedLineups) => void
 * - pageSize?: number
 */
export default function LineupResultsWithExposure({
  results = [],
  fieldLineups = [],
  onAddToPortfolio,
  pageSize = 100,
}) {
  // ---- compute dupes map from field (if dupes not provided on rows)
  const fieldDupes = useMemo(() => {
    const m = new Map();
    for (const L of fieldLineups || []) {
      const k = sig(L.drivers || []);
      if (!k) continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [fieldLineups]);

  // ---- normalize rows
  const rows = useMemo(() => {
    return (results || []).map((L, idx) => {
      const k = sig(L.drivers || []);
      const dupes = Number.isFinite(L.dupes) ? L.dupes : (fieldDupes.get(k) || 1);
      return {
        id: `${idx}:${k || idx}`,
        drivers: L.drivers || [],
        salary: Number(L.salary) || 0,
        total: Number(L.total) || 0,
        winPct: Number.isFinite(L.winPct) ? Number(L.winPct) : NaN,
        top10Pct: Number.isFinite(L.top10Pct) ? Number(L.top10Pct) : NaN,
        dupes,
      };
    });
  }, [results, fieldDupes]);

  // ---- sorting
  const [sort, setSort] = useState({ key: "total", dir: "desc" });
  const sortKeys = new Set(["total", "winPct", "top10Pct", "dupes", "salary"]);
  const sorted = useMemo(() => {
    const mult = sort.dir === "asc" ? 1 : -1;
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = a[sort.key]; const vb = b[sort.key];
      const na = Number.isFinite(va) ? va : -Infinity;
      const nb = Number.isFinite(vb) ? vb : -Infinity;
      if (na < nb) return -1 * mult;
      if (na > nb) return 1 * mult;
      return a.id.localeCompare(b.id) * mult;
    });
    return arr;
  }, [rows, sort]);

  // ---- paging
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [sorted.length]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageStart = (page - 1) * pageSize;
  const pageRows = sorted.slice(pageStart, pageStart + pageSize);

  // ---- selection
  const [selected, setSelected] = useState(() => new Set());
  useEffect(() => {
    // clear selection if data changes drastically
    setSelected((prev) => {
      const next = new Set();
      for (const r of rows) if (prev.has(r.id)) next.add(r.id);
      return next;
    });
  }, [rows]);

  const isRowSelected = (id) => selected.has(id);
  const toggleRow = (id, checked) => {
    setSelected((s) => {
      const n = new Set(s);
      if (checked) n.add(id); else n.delete(id);
      return n;
    });
  };
  const selectAllVisible = () => setSelected((s) => {
    const n = new Set(s);
    for (const r of pageRows) n.add(r.id);
    return n;
  });
  const clearSelection = () => setSelected(new Set());

  // Bulk: select top N by metric
  const [bulkMetric, setBulkMetric] = useState("winPct");
  const [bulkN, setBulkN] = useState(20);
  const selectTopN = () => {
    const key = sortKeys.has(bulkMetric) ? bulkMetric : "winPct";
    const arr = [...rows].sort((a, b) => {
      const na = Number.isFinite(a[key]) ? a[key] : -Infinity;
      const nb = Number.isFinite(b[key]) ? b[key] : -Infinity;
      return nb - na;
    }).slice(0, clamp(Number(bulkN) || 0, 0, rows.length));
    setSelected((_) => new Set(arr.map((r) => r.id)));
    // jump to page 1 so user sees many selected immediately
    setPage(1);
  };

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  // ---- live exposure from selection
  const exposure = useMemo(() => {
    const m = new Map();
    const total = Math.max(1, selectedRows.length);
    for (const L of selectedRows) {
      for (const d of (L.drivers || [])) {
        m.set(d, (m.get(d) || 0) + 1);
      }
    }
    const out = {};
    for (const [name, cnt] of m.entries()) out[name] = { count: cnt, pct: (cnt / total) * 100 };
    return out;
  }, [selectedRows]);

  // ---- CSV callbacks
  const exportSelectedLineups = () => exportLineupsCSV(selectedRows);
  const exportSelectedExposure = () => exportExposureCSV(exposure);

  // ---- small hook for sticky header shadow
  const tableRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 0);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const headerCell = "px-2 py-1.5 text-xs font-semibold text-center whitespace-nowrap";
  const cell = "px-2 py-1 text-center text-[12px] tabular-nums";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
      {/* ===================== Left: Lineups table ===================== */}
      <section className="xl:col-span-8 rounded-lg border bg-white shadow-sm">
        {/* top bar */}
        <div className="flex flex-wrap items-center gap-2 p-3 border-b">
          <div className="font-semibold">Lineups ({rows.length})</div>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <label className="text-gray-600">Sort by</label>
            <select
              value={sort.key}
              onChange={(e) => setSort((s) => ({ ...s, key: e.target.value }))}
              className="border rounded-md px-2 py-1 text-sm"
            >
              <option value="total">Proj</option>
              <option value="winPct">Win%</option>
              <option value="top10Pct">Top10%</option>
              <option value="dupes">Dupes</option>
              <option value="salary">Salary</option>
            </select>
            <select
              value={sort.dir}
              onChange={(e) => setSort((s) => ({ ...s, dir: e.target.value }))}
              className="border rounded-md px-2 py-1 text-sm"
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
        </div>

        {/* bulk bar */}
        <div className="flex flex-wrap items-center gap-2 p-3 border-b bg-gray-50/60">
          <button
            className="px-2.5 py-1 rounded-md border text-sm hover:bg-gray-100"
            onClick={selectAllVisible}
          >
            Select all on page
          </button>
          <button
            className="px-2.5 py-1 rounded-md border text-sm hover:bg-gray-100"
            onClick={clearSelection}
          >
            Clear selection
          </button>

          <div className="w-px h-6 bg-gray-300 mx-1" />

          <div className="flex items-center gap-2 text-sm">
            <span>Select top</span>
            <input
              className="w-16 border rounded-md px-2 py-1 text-sm"
              value={bulkN}
              onChange={(e) => setBulkN(e.target.value)}
            />
            <span>by</span>
            <select
              value={bulkMetric}
              onChange={(e) => setBulkMetric(e.target.value)}
              className="border rounded-md px-2 py-1 text-sm"
            >
              <option value="winPct">Win%</option>
              <option value="top10Pct">Top10%</option>
              <option value="total">Proj</option>
            </select>
            <button
              className="px-2.5 py-1 rounded-md border text-sm hover:bg-gray-100"
              onClick={selectTopN}
            >
              Go
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-gray-600">Selected:</span>
            <span className="font-semibold">{selected.size}</span>
            <button
              className="px-2.5 py-1 rounded-md border text-sm hover:bg-gray-100"
              onClick={exportSelectedLineups}
              disabled={selected.size === 0}
              title={selected.size === 0 ? "Select some lineups first" : "Export selected lineups to CSV"}
            >
              Export lineups
            </button>
          </div>
        </div>

        {/* table */}
        <div ref={tableRef} className="max-h-[540px] overflow-auto">
          <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
            <thead className={`sticky top-0 z-10 bg-gray-50 ${scrolled ? "shadow-sm" : ""}`}>
              <tr>
                <th className={`${headerCell} w-10`}></th>
                <th className={headerCell}>#</th>
                <th className={headerCell}>Salary</th>
                <th className={headerCell}>Proj</th>
                <th className={headerCell}>Win%</th>
                <th className={headerCell}>Top10%</th>
                <th className={headerCell}>Dupes</th>
                <th className={`${headerCell} text-left`}>Drivers</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-sm text-gray-500">
                    No lineups yet — run a simulation.
                  </td>
                </tr>
              ) : (
                pageRows.map((r, i) => (
                  <tr key={r.id} className="odd:bg-white even:bg-gray-50 hover:bg-blue-50/60 transition">
                    <td className="px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={isRowSelected(r.id)}
                        onChange={(e) => toggleRow(r.id, e.target.checked)}
                      />
                    </td>
                    <td className={cell}>{pageStart + i + 1}</td>
                    <td className={cell}>{fmt0(r.salary)}</td>
                    <td className={cell}>{fmt1(r.total)}</td>
                    <td className={cell}>{fmt1(r.winPct)}</td>
                    <td className={cell}>{fmt1(r.top10Pct)}</td>
                    <td className={cell}>{fmt0(r.dupes)}</td>
                    <td className="px-2 py-1 text-[12px] text-left">
                      <span className="break-words">{r.drivers.join(" • ")}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* pager */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t text-sm">
            <div>
              Showing <b>{pageStart + 1}</b>–<b>{Math.min(pageStart + pageSize, sorted.length)}</b> of{" "}
              <b>{sorted.length}</b>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="px-2 py-1 border rounded disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <span>Page {page} / {totalPages}</span>
              <button
                className="px-2 py-1 border rounded disabled:opacity-40"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ===================== Right: Portfolio & Exposure ============== */}
      <section className="xl:col-span-4 rounded-lg border bg-white shadow-sm p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold">Portfolio</h3>
          <div className="flex items-center gap-2">
            <button
              className="px-2.5 py-1 rounded-md border text-sm hover:bg-gray-100"
              onClick={exportSelectedExposure}
              disabled={selected.size === 0}
            >
              Export exposure
            </button>
            {typeof onAddToPortfolio === "function" && (
              <button
                className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
                onClick={() => onAddToPortfolio(selectedRows)}
                disabled={selected.size === 0}
                title={selected.size === 0 ? "Select some lineups first" : "Save selected to portfolio"}
              >
                Save selected
              </button>
            )}
          </div>
        </div>

        <div className="text-sm text-gray-600 mb-2">
          <b>{selected.size}</b> lineups selected.
        </div>

        {/* exposure table */}
        {Object.keys(exposure).length === 0 ? (
          <div className="text-sm text-gray-500">Select some lineups to see driver exposure.</div>
        ) : (
          <div className="overflow-auto max-h-[420px]">
            <table className="min-w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-1.5 text-xs font-semibold text-left">Driver</th>
                  <th className="px-2 py-1.5 text-xs font-semibold text-center">Count</th>
                  <th className="px-2 py-1.5 text-xs font-semibold text-center">Exposure %</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(exposure)
                  .sort((a, b) => b[1].pct - a[1].pct || a[0].localeCompare(b[0]))
                  .map(([name, v]) => (
                    <tr key={name} className="odd:bg-white even:bg-gray-50">
                      <td className="px-2 py-1 text-left">{name}</td>
                      <td className="px-2 py-1 text-center tabular-nums">{fmt0(v.count)}</td>
                      <td className="px-2 py-1 text-center tabular-nums">{fmt1(v.pct)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
