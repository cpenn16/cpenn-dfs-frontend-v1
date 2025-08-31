// src/pages/nascar/XfProjections.jsx
import React, { useEffect, useMemo, useState } from "react";

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
const num = (v) => {
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const isNumeric = (v) => Number.isFinite(num(v));
const looksNumericCol = (c) =>
  /(^rank$|avg|average|proj|pp$|rtg|lev|own|sal|ceiling|floor|dom|fin|val|^p?ll$)/i.test(
    String(c).trim()
  ) || /^\d+$/.test(String(c));
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
  Object.keys(row || {}).find((k) => /^driver\b/i.test(k)) || "Driver";
const isDriverCol = (c) => /^driver\b/i.test(String(c));
function colBrand(c) {
  const s = String(c).toLowerCase();
  if (/\bdk\b|\bdk\s|^dk/.test(s)) return "DK";
  if (/\bfd\b|\bfd\s|^fd/.test(s)) return "FD";
  return "NEUTRAL";
}
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const escapeCSV = (v) => {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/* ----------------------------- page ----------------------------- */
export default function CupProjections() {
  const SOURCE = "/data/nascar/xfinity/latest/projections.json";
  const SHOW_SOURCE = false; // hide the source path under the title

  const { data, err, loading } = useJson(SOURCE);

  const rows = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.rows)) return data.rows;
    return [];
  }, [data]);

  const allColsRaw = useMemo(
    () => (rows.length ? Object.keys(rows[0]) : []),
    [rows]
  );
  const driverKey = useMemo(() => findDriverKey(rows[0] || {}), [rows]); // for reference if needed

  /* --------- permanent style: compact + WRAPPED headers & cells -------- */
  const padCell = "px-2 py-1";   // compact density
  const textSz = "text-xs";      // compact type
  const headerWrap = "whitespace-normal break-words leading-tight"; // WRAP headers
  const cellWrap = "whitespace-normal break-words";                 // WRAP cells

  /* ------------------ Brand filter (DK / FD / Both) ------------------ */
  const [brand, setBrand] = useState("Both");
  const baseCols = useMemo(() => {
    if (!allColsRaw.length) return [];
    if (brand === "Both") return allColsRaw;
    return allColsRaw.filter((c) => {
      const b = colBrand(c);
      return b === "NEUTRAL" || b === brand;
    });
  }, [allColsRaw, brand]);

  /* ---------- column visibility ---------- */
  const [visibleCols, setVisibleCols] = useState([]);
  useEffect(() => {
    if (baseCols.length) setVisibleCols(baseCols.map(() => true));
  }, [baseCols]);
  const toggleCol = (i) =>
    setVisibleCols((v) => {
      const n = [...v];
      n[i] = !n[i];
      return n;
    });
  const showAll = () => setVisibleCols(baseCols.map(() => true));
  const hideAll = () => setVisibleCols(baseCols.map(() => false));
  const visibleColNames = baseCols.filter((_, i) => visibleCols[i]);

  /* ---------- search ---------- */
  const [q, setQ] = useState("");
  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      allColsRaw.some((c) => String(r?.[c] ?? "").toLowerCase().includes(needle))
    );
  }, [rows, allColsRaw, q]);

  /* ---------- sorting ---------- */
  const [sort, setSort] = useState({ col: "", dir: "asc" });
  const sortedRows = useMemo(() => {
    if (!sort.col) return filteredRows;
    return [...filteredRows].sort((a, b) =>
      cmp(a?.[sort.col], b?.[sort.col], sort.dir)
    );
  }, [filteredRows, sort]);

  /* ---------- reset & export ---------- */
  const resetUI = () => {
    setQ("");
    setSort({ col: "", dir: "asc" });
    showAll();
  };

  const exportCSV = () => {
    const cols = visibleColNames.length ? visibleColNames : baseCols;
    const lines = [];
    lines.push(cols.map(escapeCSV).join(","));
    for (const r of sortedRows) {
      lines.push(cols.map((c) => escapeCSV(r?.[c] ?? "")).join(","));
    }
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `xfinity_projections_${brand.toLowerCase()}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /* ---------- AUTO-FIT COLUMN WIDTHS (in ch units) ---------- */
  const colWidthCh = useMemo(() => {
    const widths = {};
    if (!rows.length) return widths;

    const sample = rows.slice(0, 200);
    for (const c of baseCols) {
      let maxLen = 0;
      const headerLen = String(c).length;

      for (const r of sample) {
        const s = String(r?.[c] ?? "");
        if (s.length > maxLen) maxLen = s.length;
      }

      const numeric = looksNumericCol(c);
      if (isDriverCol(c)) {
        widths[c] = clamp(Math.max(maxLen, 12), 12, 22);
      } else if (numeric) {
        widths[c] = clamp(Math.max(maxLen + 2, 6), 6, 12);
      } else {
        widths[c] = clamp(Math.max(maxLen, Math.min(headerLen, 12)), 10, 16);
      }
    }
    return widths;
  }, [rows, baseCols]);

  return (
    <div className="px-4 py-5">
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-extrabold tracking-tight">
          NASCAR Xfinity — DFS Projections
        </h1>

        {/* Brand segmented control with your logos */}
        <div
          role="tablist"
          className="ml-2 inline-flex items-center rounded-xl bg-gray-100 p-1 border border-gray-200 shadow-inner"
        >
          {[
            {
              key: "DK",
              label: (
                <>
                  <img src="/logos/dk.png" alt="DK" className="h-4 w-4 mr-1 object-contain" />
                  DK
                </>
              ),
            },
            {
              key: "FD",
              label: (
                <>
                  <img src="/logos/FD.png" alt="FD" className="h-4 w-4 mr-1 object-contain" />
                  FD
                </>
              ),
            },
            { key: "Both", label: "Both" },
          ].map((b) => {
            const active = brand === b.key;
            return (
              <button
                key={b.key}
                role="tab"
                aria-selected={active}
                onClick={() => setBrand(b.key)}
                className={[
                  "flex items-center gap-1 px-3 py-1 rounded-lg text-sm transition",
                  active
                    ? "bg-white text-gray-900 shadow border border-gray-200"
                    : "text-gray-700 hover:text-gray-900",
                ].join(" ")}
              >
                {b.label}
              </button>
            );
          })}
        </div>

        {/* (Hidden by default) data source path */}
        {SHOW_SOURCE && (
          <div className="text-xs text-gray-500">
            <code>{SOURCE}</code>
          </div>
        )}

        {/* Actions */}
        <div className="ml-auto flex items-center gap-3">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="border rounded-lg px-3 py-2 w-56 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200" onClick={showAll}>
            Show all
          </button>
          <button className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200" onClick={hideAll}>
            Hide all
          </button>
          <button
            className="px-3 py-2 text-sm rounded-lg bg-white border hover:bg-gray-50"
            onClick={resetUI}
            title="Clear search, sorting, and show all columns"
          >
            Reset
          </button>
          <button
            className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            onClick={exportCSV}
            title="Export visible columns & filtered/sorted rows"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Column chips */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        {baseCols.map((c, i) => {
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

      {loading && <div className="text-sm text-gray-600">Loading…</div>}
      {err && <div className="text-sm text-red-600">Failed to load: {String(err)}</div>}

      {!loading && !err && (
        <div className="rounded-xl border bg-white shadow-sm overflow-auto">
          <table className="w-full table-fixed border-separate" style={{ borderSpacing: 0 }}>
            {/* Enforced widths */}
            <colgroup>
              {visibleColNames.map((c) => (
                <col key={c} style={{ width: `${colWidthCh[c] ?? 10}ch` }} />
              ))}
            </colgroup>

            <thead>
              <tr>
                {visibleColNames.map((c) => {
                  const active = sort.col === c;
                  const arrow = active ? (sort.dir === "asc" ? "▲" : "▼") : "▲";
                  const w = colWidthCh[c] ?? 10;
                  return (
                    <th
                      key={c}
                      onClick={() =>
                        setSort((s) =>
                          s.col === c
                            ? { col: c, dir: s.dir === "asc" ? "desc" : "asc" }
                            : { col: c, dir: "asc" }
                        )
                      }
                      title={c}
                      className={[
                        "sticky top-0 z-30 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60",
                        "font-semibold border-b border-gray-200",
                        padCell,
                        textSz,
                        "cursor-pointer select-none text-center",
                        isDriverCol(c) ? "left-0" : "",
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
              {sortedRows.map((r, i) => {
                const zebra = i % 2 ? "bg-gray-50/60" : "bg-white";
                return (
                  <tr key={i} className={[zebra, "hover:bg-blue-50/60 transition-colors"].join(" ")}>
                    {visibleColNames.map((c) => (
                      <td
                        key={c}
                        className={[
                          "border-b border-gray-100",
                          padCell,
                          textSz,
                          "text-center tabular-nums",
                          isDriverCol(c) ? `sticky left-0 z-20 ${zebra} border-r` : "",
                        ].join(" ")}
                        style={{ maxWidth: `${colWidthCh[c] ?? 10}ch` }}
                        title={String(r?.[c] ?? "")}
                      >
                        <div className={["w-full", cellWrap].join(" ")}>
                          {r?.[c] ?? ""}
                        </div>
                      </td>
                    ))}
                  </tr>
                );
              })}
              {!sortedRows.length && (
                <tr>
                  <td className={`${padCell} ${textSz} text-gray-500`} colSpan={visibleColNames.length}>
                    No rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
