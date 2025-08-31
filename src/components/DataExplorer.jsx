// src/components/DataExplorer.jsx
import React, { useEffect, useMemo, useState } from "react";

/**
 * DataExplorer
 * - Fetches rows from dataUrl (or uses rows prop)
 * - Column pick/show/hide, search, robust stable sorting (tri-state)
 *
 * Props:
 *   - title, description
 *   - dataUrl?: string
 *   - rows?: Array<object>
 *   - columns?: string[]            // visible columns (order matters)
 *   - sortable?: boolean
 *   - defaultSort?: { col: string, dir: "asc"|"desc" }
 *   - dynamicColumnOrder?: (cols: string[]) => string[]
 *   - alignCells?: "left" | "center" | "right"
 */
export default function DataExplorer({
  title,
  description,
  dataUrl,
  rows: rowsProp,
  columns: columnsProp,
  sortable = true,
  defaultSort,
  dynamicColumnOrder,
  alignCells = "right",
}) {
  /* ------------------------------ data load ------------------------------ */
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(!!dataUrl);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!dataUrl) return;

    setLoading(true);
    setErr(null);

    fetch(dataUrl, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (!alive) return;
        const arr = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [];
        setRows(arr);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(String(e));
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [dataUrl]);

  // prefer incoming rows prop if provided
  const baseRows = rowsProp ?? rows;

  /* --------------------------- columns & search -------------------------- */
  const allColumns = useMemo(() => {
    const colsFromData =
      baseRows && baseRows.length
        ? Object.keys(baseRows[0])
        : [];
    const cols = columnsProp?.length ? columnsProp : colsFromData;

    return dynamicColumnOrder ? dynamicColumnOrder(cols) : cols;
  }, [baseRows, columnsProp, dynamicColumnOrder]);

  const [visibleCols, setVisibleCols] = useState(allColumns);
  useEffect(() => setVisibleCols(allColumns), [allColumns]);

  const [query, setQuery] = useState("");

  const filteredRows = useMemo(() => {
    if (!query.trim()) return baseRows ?? [];
    const q = query.trim().toLowerCase();
    return (baseRows ?? []).filter((r) =>
      allColumns.some((c) => String(r?.[c] ?? "").toLowerCase().includes(q))
    );
  }, [baseRows, query, allColumns]);

  /* ------------------------------ sorting -------------------------------- */
  // tri-state: 'none' | 'asc' | 'desc'
  const [sort, setSort] = useState(() => {
    if (defaultSort?.col && (defaultSort.dir === "asc" || defaultSort.dir === "desc")) {
      return { col: defaultSort.col, dir: defaultSort.dir };
    }
    return { col: null, dir: "none" };
  });

  // heuristic: a column is numeric if most non-blank values parse to finite numbers
  const isNumericMap = useMemo(() => {
    const map = {};
    for (const c of allColumns) {
      const sample = (filteredRows.length ? filteredRows : baseRows || []).slice(0, 200);
      let nonBlank = 0, numericish = 0;
      for (const r of sample) {
        const v = r?.[c];
        if (v === null || v === undefined || v === "" || v === "—") continue;
        nonBlank++;
        const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s,]/g, ""));
        if (Number.isFinite(n)) numericish++;
      }
      map[c] = nonBlank > 0 && numericish / nonBlank >= 0.7;
    }
    return map;
  }, [allColumns, filteredRows, baseRows]);

  const cycleSort = (col) => {
    if (!sortable) return;
    setSort((prev) => {
      if (prev.col !== col) return { col, dir: "asc" };
      if (prev.dir === "asc") return { col, dir: "desc" };
      if (prev.dir === "desc") return { col: null, dir: "none" }; // reset
      return { col, dir: "asc" };
    });
  };

  const BLANKSINK = (v) =>
    v === null || v === undefined || v === "" || v === "—";

  const sortedRows = useMemo(() => {
    if (!sortable || !sort.col || sort.dir === "none") return filteredRows;

    const col = sort.col;
    const dir = sort.dir === "asc" ? 1 : -1;
    const numeric = !!isNumericMap[col];

    // stable sort: include original index
    return [...filteredRows]
      .map((row, idx) => ({ row, idx }))
      .sort((a, b) => {
        const va = a.row?.[col];
        const vb = b.row?.[col];

        // blanks sink to bottom regardless of order
        const aBlank = BLANKSINK(va);
        const bBlank = BLANKSINK(vb);
        if (aBlank && bBlank) return a.idx - b.idx; // tie -> original order
        if (aBlank) return 1;
        if (bBlank) return -1;

        if (numeric) {
          const na =
            typeof va === "number"
              ? va
              : Number(String(va).replace(/[$,%\s,]/g, ""));
          const nb =
            typeof vb === "number"
              ? vb
              : Number(String(vb).replace(/[$,%\s,]/g, ""));
          if (Number.isFinite(na) && Number.isFinite(nb)) {
            if (na < nb) return -1 * dir;
            if (na > nb) return 1 * dir;
            return a.idx - b.idx; // stable tie
          }
          // fallback to string compare
        }

        const sa = String(va);
        const sb = String(vb);
        const cmp = sa.localeCompare(sb, undefined, { numeric: true, sensitivity: "base" });
        return cmp === 0 ? a.idx - b.idx : cmp * dir;
      })
      .map(({ row }) => row);
  }, [filteredRows, sortable, sort, isNumericMap]);

  /* ------------------------------ helpers -------------------------------- */
  const allShown = visibleCols.length === allColumns.length;
  const noneShown = visibleCols.length === 0;

  const toggleCol = (c) =>
    setVisibleCols((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );

  const showAll = () => setVisibleCols(allColumns);
  const hideAll = () => setVisibleCols([]);

  const cellAlign = (c) =>
    alignCells === "left"
      ? "text-left"
      : alignCells === "center"
      ? "text-center"
      : // default right for numbers, left otherwise
        (isNumericMap[c] ? "text-right" : "text-left");

  const sortIcon = (c) => {
    if (sort.col !== c || sort.dir === "none") return (
      <span className="inline-block opacity-40 ml-1">↕</span>
    );
    return sort.dir === "asc" ? (
      <span className="inline-block ml-1">▲</span>
    ) : (
      <span className="inline-block ml-1">▼</span>
    );
  };

  const visible = allColumns.filter((c) => visibleCols.includes(c));

  /* -------------------------------- render -------------------------------- */
  return (
    <div className="max-w-[1600px] mx-auto">
      {title && <h1 className="text-3xl font-extrabold mb-2">{title}</h1>}
      {description && (
        <div className="text-sm text-gray-500 mb-4">
          <code>{description}</code>
        </div>
      )}

      {/* controls */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input
          type="text"
          placeholder="Search…"
          className="px-3 py-2 border rounded-md w-64"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          onClick={showAll}
          className="px-3 py-2 border rounded-md bg-gray-50 hover:bg-gray-100"
        >
          Show all
        </button>
        <button
          onClick={hideAll}
          className="px-3 py-2 border rounded-md hover:bg-gray-50"
        >
          Hide all
        </button>
      </div>

      {/* column chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {allColumns.map((c) => {
          const on = visibleCols.includes(c);
          return (
            <button
              key={c}
              onClick={() => toggleCol(c)}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                on
                  ? "bg-blue-50 border-blue-600 text-blue-900"
                  : "bg-white border-gray-300 text-gray-700"
              }`}
              title={on ? "Click to hide" : "Click to show"}
            >
              {on ? "✓ " : ""}{c}
            </button>
          );
        })}
      </div>

      {/* table */}
      <div className="overflow-auto rounded-lg ring-1 ring-black/5 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {visible.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className={`px-3 py-2 font-bold select-none whitespace-nowrap ${cellAlign(c)} ${sortable ? "cursor-pointer" : ""}`}
                  onClick={() => cycleSort(c)}
                  title={sortable ? "Click to sort (cycles asc/desc/reset)" : ""}
                >
                  <span className="inline-flex items-center">
                    {c} {sortable && sortIcon(c)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-3 py-4 text-gray-500" colSpan={visible.length}>
                  Loading…
                </td>
              </tr>
            )}
            {err && !loading && (
              <tr>
                <td className="px-3 py-4 text-red-600" colSpan={visible.length}>
                  {err}
                </td>
              </tr>
            )}
            {!loading && !err && sortedRows.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-gray-600" colSpan={visible.length}>
                  No rows.
                </td>
              </tr>
            )}
            {!loading &&
              !err &&
              sortedRows.map((row, i) => (
                <tr key={i} className="odd:bg-white even:bg-gray-50">
                  {visible.map((c) => (
                    <td
                      key={c}
                      className={`border-t border-gray-200 px-3 py-2 whitespace-nowrap ${cellAlign(c)}`}
                    >
                      {row?.[c] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
