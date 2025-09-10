// src/pages/nascar/CupProjections.jsx
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
  const n = Number(String(v ?? "").replace(/[,$%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const isNumeric = (v) => Number.isFinite(num(v));
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
const looksNumericCol = (c) =>
  /(^rank$|avg|average|proj|pp$|rtg|lev|own|pown|sal|ceiling|floor|dom|fin|val|^p?ll$|^p?fl$)/i.test(
    String(c).trim()
  ) || /^\d+$/.test(String(c));
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

/* ---------------- heatmap palettes + direction rules ---------------- */

// Direction: return "higher" | "lower" | null
const dirForCol = (colName) => {
  const k = String(colName || "").toLowerCase().replace(/\s+/g, " ").trim();

  // Always lower (NASCAR specific)
  if (/^proj\s*fin$/i.test(colName)) return "lower";

  // Salaries lower
  if (/\bsal(ary)?\b/i.test(colName)) return "lower";

  // Ownership lower
  if (/\b(p?own%?|ownership)\b/i.test(k)) return "lower";

  // Higher metrics (additions you requested)
  if (
    /\b(pll|pfl)\b/i.test(k) ||                  // pLL / pFL
    /\b(pp)\b/.test(k) ||                        // DK PP / FD PP
    /\b(dom)\b/i.test(k) ||                      // DK Dom / FD Dom
    /\bfloor\b/i.test(k) ||                      // DK/FD Floor
    /\bceiling\b/i.test(k)                       // DK/FD Ceiling
  ) return "higher";

  // Usual higher metrics
  if (
    /\bproj(?!\s*fin)\b/i.test(k) ||             // projections (not proj fin)
    /\bval(ue)?\b/i.test(k) ||                   // value
    /\brtg|rating\b/i.test(k) ||                 // rating
    /\blev%?\b/i.test(k) ||                      // leverage
    /\bopt%?\b/i.test(k)                         // opt%
  ) return "higher";

  return null;
};

// Palette helper
function heatColor(min, max, v, dir, palette) {
  if (palette === "none") return null;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const n = num(v);
  if (!Number.isFinite(n) || min === max) return null;

  let t = (n - min) / (max - min);
  t = Math.max(0, Math.min(1, t));
  if (dir === "lower") t = 1 - t;

  if (palette === "blueorange") {
    // blue → white → orange
    if (t < 0.5) {
      const u = t / 0.5; // blue → white
      const h = 220, s = 60 - u * 55, l = 90 + u * 7;
      return `hsl(${h}, ${s}%, ${l}%)`;
    } else {
      const u = (t - 0.5) / 0.5; // white → orange
      const h = 30, s = 5 + u * 80, l = 97 - u * 7;
      return `hsl(${h}, ${s}%, ${l}%)`;
    }
  }
  // default red → yellow → green
  if (t < 0.5) {
    const u = t / 0.5;
    const h = 0 + u * 60, s = 78 + u * 10, l = 94 - u * 2;
    return `hsl(${h}, ${s}%, ${l}%)`;
  } else {
    const u = (t - 0.5) / 0.5;
    const h = 60 + u * 60, s = 88 - u * 18, l = 92 + u * 2;
    return `hsl(${h}, ${s}%, ${l}%)`;
  }
}

/* ----------------------------- page ----------------------------- */
export default function CupProjections() {
  const SOURCE = "/data/nascar/cup/latest/projections.json";
  const SHOW_SOURCE = false;

  const { data, err, loading } = useJson(SOURCE);

  const rows = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.rows)) return data.rows;
    return [];
  }, [data]);

  const allColsRaw = useMemo(() => (rows.length ? Object.keys(rows[0]) : []), [rows]);
  const driverKey = useMemo(() => findDriverKey(rows[0] || {}), [rows]);

  /* --------- compact + wrapped -------- */
  const padCell = "px-2 py-1";
  const textSz = "text-xs";
  const headerWrap = "whitespace-normal break-words leading-tight";
  const cellWrap = "whitespace-normal break-words";

  /* ---------- palette (default NONE) ---------- */
  const [palette, setPalette] = useState("none");

  /* ---------- Brand filter (DK / FD / Both) ---------- */
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

  /* ---------- heat stats (only visible columns, current rows) ---------- */
  const heatStats = useMemo(() => {
    const stats = {};
    if (!filteredRows.length) return stats;

    for (const c of visibleColNames) {
      const dir = dirForCol(c);
      if (!dir) continue;

      let min = Infinity, max = -Infinity;
      for (const r of filteredRows) {
        const n = num(r?.[c]);
        if (!Number.isFinite(n)) continue;
        if (n < min) min = n;
        if (n > max) max = n;
      }
      if (min !== Infinity && max !== -Infinity) stats[c] = { min, max, dir };
    }
    return stats;
  }, [filteredRows, visibleColNames]);

  /* ---------- sorting ---------- */
  const [sort, setSort] = useState({ col: "", dir: "asc" });
  const sortedRows = useMemo(() => {
    if (!sort.col) return filteredRows;
    return [...filteredRows].sort((a, b) => cmp(a?.[sort.col], b?.[sort.col], sort.dir));
  }, [filteredRows, sort]);

  /* ---------- reset & export ---------- */
  const resetUI = () => {
    setQ("");
    setSort({ col: "", dir: "asc" });
    showAll();
    setPalette("none");
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
    a.download = `cup_projections_${brand.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
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
      <div className="mb-3 flex items-start md:items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-extrabold tracking-tight">
          NASCAR Cup — DFS Projections
        </h1>

        {/* Brand segmented control */}
        <div
          role="tablist"
          className="inline-flex items-center rounded-xl bg-gray-100 p-1 border border-gray-200 shadow-inner"
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

        {/* Source path (hidden by default) */}
        {SHOW_SOURCE && <div className="text-xs text-gray-500"><code>{SOURCE}</code></div>}

        {/* Right-side actions (wrap on mobile) */}
        <div className="ml-auto flex items-center gap-2 md:gap-3 flex-wrap">
          {/* Palette (defaults to none) */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600 hidden md:block">Palette</label>
            <select
              value={palette}
              onChange={(e) => setPalette(e.target.value)}
              className="h-8 rounded-lg border px-2 text-xs"
            >
              <option value="none">None</option>
              <option value="rdylgn">Rd–Yl–Gn</option>
              <option value="blueorange">Blue–Orange</option>
            </select>
          </div>

          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="border rounded-lg px-3 py-2 w-48 md:w-56 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              {on ? "✓ " : ""}{c}
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
                <col key={c} style={{ width: `${(colWidthCh[c] ?? 10)}ch` }} />
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
                          s.col === c ? { col: c, dir: s.dir === "asc" ? "desc" : "asc" } : { col: c, dir: "asc" }
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
                    {visibleColNames.map((c) => {
                      const stat = heatStats[c];
                      const bg = stat ? heatColor(stat.min, stat.max, r?.[c], stat.dir, palette) : null;

                      return (
                        <td
                          key={c}
                          className={[
                            "border-b border-gray-100",
                            padCell,
                            textSz,
                            "text-center tabular-nums",
                            isDriverCol(c) ? `sticky left-0 z-20 ${zebra} border-r` : "",
                          ].join(" ")}
                          style={{ maxWidth: `${(colWidthCh[c] ?? 10)}ch`, ...(bg ? { backgroundColor: bg } : {}) }}
                          title={String(r?.[c] ?? "")}
                        >
                          <div className={["w-full", cellWrap, !isNumeric(r?.[c]) ? "" : ""].join(" ")}>
                            {r?.[c] ?? ""}
                          </div>
                        </td>
                      );
                    })}
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
