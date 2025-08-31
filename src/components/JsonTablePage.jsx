import React, { useEffect, useMemo, useState } from "react";

/**
 * DataExplorer
 * - Fetches JSON (array of objects)
 * - Search, show/hide columns, click-to-sort headers
 * - Optional rename map, dynamic column ordering, default sort, and row transform
 *
 * Props:
 *  - title: string
 *  - dataUrl: string
 *  - description?: string
 *  - renameMap?: Record<string,string>
 *  - dynamicColumnOrder?: (cols: string[]) => string[]
 *  - initialHiddenColumns?: string[]
 *  - defaultSort?: { col: string, dir: "asc" | "desc" }
 *  - transformRows?: (rows: any[]) => any[]
 */
export default function JsonTablePage({
  title,
  dataUrl,
  description,
  renameMap = {},
  dynamicColumnOrder,
  initialHiddenColumns = [],
  defaultSort,
  transformRows,
}) {
  const [raw, setRaw] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  // Sorting state
  const [sortCol, setSortCol] = useState(defaultSort?.col ?? null);
  const [sortDir, setSortDir] = useState(defaultSort?.dir ?? "asc");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(dataUrl, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (!alive) return;
        const arr = Array.isArray(j) ? j : [];
        setRaw(transformRows ? transformRows(arr) : arr);
        setErr(null);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e);
        setRaw([]);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [dataUrl, transformRows]);

  // Column discovery
  const discoveredCols = useMemo(() => {
    const s = new Set();
    for (const r of raw) Object.keys(r || {}).forEach((k) => s.add(k));
    // rename on display only
    const cols = Array.from(s);
    return cols;
  }, [raw]);

  // Column order (optionally customized)
  const orderedCols = useMemo(() => {
    const cols = [...discoveredCols];
    return dynamicColumnOrder ? dynamicColumnOrder(cols) : cols;
  }, [discoveredCols, dynamicColumnOrder]);

  // Visible columns
  const [visible, setVisible] = useState(() => new Set(orderedCols));
  useEffect(() => setVisible(new Set(orderedCols)), [orderedCols]);

  const toggleCol = (c) => {
    const next = new Set(visible);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    setVisible(next);
  };
  const showAll = () => setVisible(new Set(orderedCols));
  const hideAll = () => setVisible(new Set());

  // Apply initial hidden columns (once columns exist)
  useEffect(() => {
    if (!orderedCols.length || !initialHiddenColumns.length) return;
    const next = new Set(orderedCols);
    initialHiddenColumns.forEach((c) => next.delete(c));
    setVisible(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedCols.join("|")]);

  const displayCols = orderedCols.filter((c) => visible.has(c));

  // Helpers
  const displayName = (c) => renameMap[c] ?? c;

  const parseNum = (v) => {
    if (v === null || v === undefined) return NaN;
    if (typeof v === "number") return v;
    const s = String(v)
      .replace(/,/g, "")
      .replace(/%$/g, "")
      .trim();
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
  };

  // Search + sort
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = raw;
    if (q) {
      rows = rows.filter((r) =>
        displayCols.some((c) => String(r?.[c] ?? "").toLowerCase().includes(q))
      );
    }
    if (sortCol) {
      const col = sortCol;
      const dir = sortDir === "desc" ? -1 : 1;
      rows = [...rows].sort((a, b) => {
        const av = a?.[col];
        const bv = b?.[col];
        const an = parseNum(av);
        const bn = parseNum(bv);
        const aNum = Number.isFinite(an);
        const bNum = Number.isFinite(bn);
        if (aNum || bNum) {
          if (!aNum && bNum) return 1;
          if (aNum && !bNum) return -1;
          if (an < bn) return -1 * dir;
          if (an > bn) return 1 * dir;
          return 0;
        }
        // string fallback
        const as = String(av ?? "").toLowerCase();
        const bs = String(bv ?? "").toLowerCase();
        if (as < bs) return -1 * dir;
        if (as > bs) return 1 * dir;
        return 0;
      });
    }
    return rows;
  }, [raw, query, sortCol, sortDir, displayCols]);

  const onSortClick = (c) => {
    if (sortCol === c) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(c);
      setSortDir("asc");
    }
  };

  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>{title}</h2>
        {description && (
          <div style={{ color: "#667085", fontSize: 12 }}>{description}</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, margin: "10px 0" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          style={{
            padding: "8px 12px",
            border: "1px solid #d0d5dd",
            borderRadius: 8,
            width: 280,
          }}
        />
        <button
          onClick={showAll}
          style={{ padding: "6px 10px", border: "1px solid #d0d5dd", borderRadius: 8 }}
        >
          Show all
        </button>
        <button
          onClick={hideAll}
          style={{ padding: "6px 10px", border: "1px solid #d0d5dd", borderRadius: 8 }}
        >
          Hide all
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {orderedCols.map((c) => (
          <label
            key={c}
            style={{
              border: "1px solid #e4e7ec",
              borderRadius: 999,
              padding: "6px 10px",
              fontSize: 12,
              cursor: "pointer",
              background: visible.has(c) ? "#eef2ff" : "#fff",
            }}
          >
            <input
              type="checkbox"
              checked={visible.has(c)}
              onChange={() => toggleCol(c)}
              style={{ marginRight: 6 }}
            />
            {String(displayName(c)).toUpperCase()}
          </label>
        ))}
      </div>

      <div style={{ border: "1px solid #e4e7ec", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead style={{ background: "#f8fafc" }}>
              <tr>
                {displayCols.map((c) => {
                  const active = sortCol === c;
                  const carets = active ? (sortDir === "asc" ? " ▲" : " ▼") : "";
                  return (
                    <th
                      key={c}
                      onClick={() => onSortClick(c)}
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        fontSize: 12,
                        color: "#475467",
                        borderBottom: "1px solid #e4e7ec",
                        whiteSpace: "nowrap",
                        cursor: "pointer",
                      }}
                      title="Click to sort"
                    >
                      {String(displayName(c)).toUpperCase()}
                      {carets}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={displayCols.length} style={{ padding: 16 }}>
                    Loading…
                  </td>
                </tr>
              )}
              {err && !loading && (
                <tr>
                  <td colSpan={displayCols.length} style={{ padding: 16, color: "red" }}>
                    Failed to load: {String(err)}
                  </td>
                </tr>
              )}
              {!loading && !err && filtered.length === 0 && (
                <tr>
                  <td colSpan={displayCols.length} style={{ padding: 16 }}>
                    No rows.
                  </td>
                </tr>
              )}
              {!loading &&
                !err &&
                filtered.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f2f4f7" }}>
                    {displayCols.map((c) => (
                      <td key={c} style={{ padding: "8px 12px", fontSize: 13 }}>
                        {row?.[c] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
