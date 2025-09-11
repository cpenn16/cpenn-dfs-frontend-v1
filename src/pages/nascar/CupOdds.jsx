// src/pages/nascar/CupBetting.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";

/* ---------------- LAST UPDATED (shared) ---------------- */
function useLastUpdated(mainUrl, metaUrl) {
  const [updatedAt, setUpdatedAt] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const h = await fetch(mainUrl, { method: "HEAD", cache: "no-store" });
        const lm = h.headers.get("last-modified");
        if (alive && lm) { setUpdatedAt(new Date(lm)); return; }
      } catch (_) {}

      try {
        const r = await fetch(mainUrl, { cache: "no-store" });
        const lm2 = r.headers.get("last-modified");
        if (alive && lm2) { setUpdatedAt(new Date(lm2)); return; }
      } catch (_) {}

      try {
        if (!metaUrl) return;
        const m = await fetch(`${metaUrl}?_=${Date.now()}`, { cache: "no-store" }).then(x => x.json());
        const iso = m?.updated_iso || m?.updated_utc || m?.updated || m?.lastUpdated || m?.timestamp;
        const ep  = m?.updated_epoch;
        const d   = iso ? new Date(iso) : (Number.isFinite(ep) ? new Date(ep * 1000) : null);
        if (alive && d && !isNaN(d)) setUpdatedAt(d);
      } catch (_) {}
    })();
    return () => { alive = false; };
  }, [mainUrl, metaUrl]);

  return updatedAt;
}
const fmtUpdated = (d) =>
  d ? d.toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

/* ------------------------ tiny data hook ------------------------ */
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
      .then((j) => { if (alive) { setData(j); setErr(null); }})
      .catch((e) => { if (alive) { setErr(e); setData(null); }})
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
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
const isDriverCol = (c) => /^driver\b/i.test(String(c));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const escapeCSV = (v) => {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const looksNumericCol = (c) =>
  /(^rank$|avg|average|proj|odds|line|ev|edge|value|prob|%|rtg|dom|ceiling|floor|spread|total|ml$|p$)/i.test(
    String(c).trim()
  ) || /^\d+$/.test(String(c));

/* ---------------- heatmap rules + palettes ---------------- */
const dirForCol = (colName) => {
  const k = String(colName || "").toLowerCase();

  // Lower-better
  if (/^proj\s*fin$/.test(k)) return "lower";
  if (/^(win|t3|t5|t10)$/.test(k)) return "lower";
  if (/fair\s*odds/.test(k)) return "lower";

  // Higher-better
  if (/win\s*%/.test(k)) return "higher";
  if (/t(?:3|5|10)\s*%/.test(k)) return "higher";
  if (/^proj(?!.*fin)/.test(k)) return "higher";

  // Finish Dist P# columns (P1..)
  if (/^p\d+$/.test(k)) return "higher";

  return null;
};

function heatColor(min, max, v, dir, palette) {
  if (palette === "none") return null;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const n = num(v);
  if (!Number.isFinite(n) || min === max) return null;

  let t = (n - min) / (max - min);
  t = Math.max(0, Math.min(1, t));
  if (dir === "lower") t = 1 - t;

  if (palette === "blueorange") {
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
  // default Rd–Yl–Gn
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

/* ------------------------ Reusable Table Block (heatmap) ------------------------ */
function BettingTableBlock({ title, source, compact = false, maxHeight = "62vh", bounded = true, palette = "none" }) {
  const SHOW_SOURCE = false;
  const { data, err, loading } = useJson(source);

  const rows = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.rows)) return data.rows;
    return [];
  }, [data]);

  const allCols = useMemo(() => (rows.length ? Object.keys(rows[0]) : []), [rows]);

  // visible columns
  const [visibleCols, setVisibleCols] = useState([]);
  useEffect(() => {
    if (allCols.length) setVisibleCols(allCols.map(() => true));
  }, [allCols]);
  const toggleCol = (i) => setVisibleCols((v) => { const n = [...v]; n[i] = !n[i]; return n; });
  const showAll = () => setVisibleCols(allCols.map(() => true));
  const hideAll = () => setVisibleCols(allCols.map(() => false));
  const visibleColNames = allCols.filter((_, i) => visibleCols[i]);

  // search
  const [q, setQ] = useState("");
  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => allCols.some((c) => String(r?.[c] ?? "").toLowerCase().includes(needle)));
  }, [rows, allCols, q]);

  // heat stats (only visible cols & filtered rows)
  const heatStats = useMemo(() => {
    const stats = {};
    if (!filteredRows.length) return stats;
    const cols = visibleColNames.length ? visibleColNames : allCols;

    for (const c of cols) {
      const dir = dirForCol(c);
      if (!dir) continue;
      let min = Infinity, max = -Infinity;
      for (const r of filteredRows) {
        const n = num(r?.[c]);
        if (Number.isFinite(n)) { if (n < min) min = n; if (n > max) max = n; }
      }
      if (min !== Infinity && max !== -Infinity) stats[c] = { min, max, dir };
    }
    return stats;
  }, [filteredRows, visibleColNames, allCols]);

  // sort
  const [sort, setSort] = useState({ col: "", dir: "asc" });
  const sortedRows = useMemo(() => {
    if (!sort.col) return filteredRows;
    return [...filteredRows].sort((a, b) => cmp(a?.[sort.col], b?.[sort.col], sort.dir));
  }, [filteredRows, sort]);

  // auto-fit widths
  const colWidthCh = useMemo(() => {
    const widths = {};
    if (!rows.length) return widths;
    const sample = rows.slice(0, 200);
    for (const c of allCols) {
      let maxLen = 0;
      const headerLen = String(c).length;
      for (const r of sample) {
        const s = String(r?.[c] ?? "");
        if (s.length > maxLen) maxLen = s.length;
      }
      if (isDriverCol(c))       widths[c] = clamp(Math.max(maxLen, 12), 12, 22);
      else if (looksNumericCol(c)) widths[c] = clamp(Math.max(maxLen + 2, 6), 6, 12);
      else                      widths[c] = clamp(Math.max(maxLen, Math.min(headerLen, 12)), 10, 16);
    }
    return widths;
  }, [rows, allCols]);

  const resetUI = () => {
    setQ("");
    setSort({ col: "", dir: "asc" });
    showAll();
  };

  const exportCSV = () => {
    const cols = visibleColNames.length ? visibleColNames : allCols;
    const lines = [];
    lines.push(cols.map(escapeCSV).join(","));
    for (const r of sortedRows) lines.push(cols.map((c) => escapeCSV(r?.[c] ?? "")).join(","));
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/\s+/g, "_").toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const densityRow  = compact ? "px-1 py-1 text-[11px]" : "px-2 py-1 text-xs";
  const densityHead = compact ? "px-1 py-1 text-[11px]" : "px-2 py-1 text-xs";

  const colsInUse = visibleColNames.length ? visibleColNames : allCols;

  return (
    <section className={bounded ? "mb-8" : "mb-10"}>
      <div className="flex items-baseline gap-3 mb-2">
        <h2 className="text-xl sm:text-2xl font-extrabold">{title}</h2>
        {false && <code className="text-sm text-gray-500">{source}</code>}
        <div className="ml-auto flex items-center gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="border rounded-lg px-3 py-2 w-48 sm:w-56 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200" onClick={showAll}>Show all</button>
          <button className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200" onClick={hideAll}>Hide all</button>
          <button className="px-3 py-2 text-sm rounded-lg bg-white border hover:bg-gray-50" onClick={resetUI}>Reset</button>
          <button className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700" onClick={exportCSV}>Export CSV</button>
          <div className="text-xs text-gray-500">{sortedRows.length.toLocaleString()} rows</div>
        </div>
      </div>

      <details className="mb-2">
        <summary className="cursor-pointer text-xs text-gray-600 select-none">Show/Hide columns</summary>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {allCols.map((c, i) => {
            const on = !!visibleCols[i];
            return (
              <button
                key={c}
                onClick={() => toggleCol(i)}
                className={[
                  "px-2 py-1 rounded-full text-xs border transition",
                  on ? "bg-blue-50 border-blue-300 text-blue-800"
                     : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50",
                ].join(" ")}
              >
                {on ? "✓ " : ""}{c}
              </button>
            );
          })}
        </div>
      </details>

      {loading && <div className="text-sm text-gray-600">Loading…</div>}
      {err && <div className="text-sm text-red-600">Failed to load: {String(err)}</div>}

      {!loading && !err && (
        <div className="rounded-xl border bg-white shadow-sm overflow-auto" style={{ maxHeight }}>
          <table className="w-full table-fixed border-separate" style={{ borderSpacing: 0 }}>
            <colgroup>
              {colsInUse.map((c) => (<col key={c} style={{ width: `${colWidthCh[c] ?? 10}ch` }} />))}
            </colgroup>

            <thead>
              <tr>
                {colsInUse.map((c) => {
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
                        "font-semibold border-b border-gray-200 text-center cursor-pointer select-none",
                        densityHead,
                        isDriverCol(c) ? "left-0" : "",
                      ].join(" ")}
                      style={{ maxWidth: `${w}ch` }}
                    >
                      <div className="inline-flex items-center gap-1 justify-center w-full whitespace-normal break-words leading-tight">
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
                    {colsInUse.map((c) => {
                      const stat = heatStats[c];
                      const bg = stat ? heatColor(stat.min, stat.max, r?.[c], stat.dir, palette) : null;
                      return (
                        <td
                          key={c}
                          className={[
                            "border-b border-gray-100 text-center tabular-nums",
                            densityRow,
                            isDriverCol(c) ? `sticky left-0 z-20 ${zebra} border-r` : "",
                          ].join(" ")}
                          style={{ maxWidth: `${colWidthCh[c] ?? 10}ch`, ...(bg ? { backgroundColor: bg } : {}) }}
                          title={String(r?.[c] ?? "")}
                        >
                          <div className="w-full whitespace-normal break-words">{r?.[c] ?? ""}</div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {!sortedRows.length && (
                <tr>
                  <td className="px-2 py-1 text-xs text-gray-500" colSpan={colsInUse.length}>
                    No rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------- Manufacturer Sims split into 3 sections ------------- */
function ManufacturerSections({ source, compact = false }) {
  const { data, err, loading } = useJson(source);

  const rows = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.rows)) return data.rows;
    return [];
  }, [data]);

  const mkSection = (driverKey, projKey, oddsKey) => {
    const out = [];
    for (const r of rows) {
      const d = r?.[driverKey];
      if (!d || /wins/i.test(String(d))) continue; // skip summary rows
      const proj = r?.[projKey];
      const odds = r?.[oddsKey];
      if (d != null || proj != null || odds != null) {
        out.push({ Driver: d ?? "", Proj: proj ?? "", FairOdds: odds ?? "" });
      }
    }
    return out;
  };

  const ford = useMemo(() => mkSection("Ford Drivers", "Proj_1", "Fair Odds_1"), [rows]);
  const chevy = useMemo(() => mkSection("Chevrolet Drivers", "Proj_2", "Fair Odds_2"), [rows]);
  const toyota = useMemo(() => mkSection("Toyota Drivers", "Proj_3", "Fair Odds_3"), [rows]);

  return (
    <section className="mb-8">
      <h2 className="text-xl sm:text-2xl font-extrabold mb-3">Betting Dashboard (Manufacturer Sims)</h2>

      {loading && <div className="text-sm text-gray-600">Loading…</div>}
      {err && <div className="text-sm text-red-600">Failed to load: {String(err)}</div>}

      {!loading && !err && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <MiniTable title="Ford" rows={ford} defaultSortCol="FairOdds" compact={compact} />
          <MiniTable title="Chevrolet" rows={chevy} defaultSortCol="FairOdds" compact={compact} />
          <MiniTable title="Toyota" rows={toyota} defaultSortCol="FairOdds" compact={compact} />
        </div>
      )}
    </section>
  );
}

function MiniTable({ title, rows, defaultSortCol = "FairOdds", compact = false }) {
  const cols = ["Driver", "Proj", "FairOdds"];

  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => cols.some((c) => String(r?.[c] ?? "").toLowerCase().includes(s)));
  }, [rows, q]);

  const [sort, setSort] = useState({ col: defaultSortCol, dir: "asc" });
  const sorted = useMemo(() => [...filtered].sort((a, b) => cmp(a?.[sort.col], b?.[sort.col], sort.dir)), [filtered, sort]);

  const exportCSV = () => {
    const lines = [];
    lines.push(cols.join(","));
    for (const r of sorted) lines.push(cols.map((c) => escapeCSV(r?.[c] ?? "")).join(","));
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.toLowerCase()}_manufacturer_sims_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const widths = useMemo(() => {
    const w = {};
    const sample = rows.slice(0, 100);
    for (const c of cols) {
      let maxLen = c.length;
      for (const r of sample) maxLen = Math.max(maxLen, String(r?.[c] ?? "").length);
      w[c] = c === "Driver" ? clamp(Math.max(maxLen, 12), 12, 22) : clamp(Math.max(maxLen + 2, 6), 6, 12);
    }
    return w;
  }, [rows]);

  const densityRow = compact ? "px-1 py-1 text-[11px]" : "px-2 py-1 text-xs";
  const densityHead = compact ? "px-1 py-1 text-[11px]" : "px-2 py-1 text-xs";

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-auto p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-base sm:text-lg font-bold">{title}</div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search this section…"
          className="ml-auto h-8 w-40 sm:w-44 rounded-md border border-gray-300 px-2 text-sm focus:ring-2 focus:ring-indigo-500"
        />
        <button className="h-8 px-2 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700" onClick={exportCSV}>
          Export
        </button>
      </div>

      <table className="w-full table-fixed border-separate" style={{ borderSpacing: 0 }}>
        <colgroup>
          {cols.map((c) => (
            <col key={c} style={{ width: `${widths[c] ?? 10}ch` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="sticky top-0 bg-blue-50">
            {cols.map((c) => {
              const active = sort.col === c;
              const arrow = active ? (sort.dir === "asc" ? "▲" : "▼") : "▲";
              return (
                <th
                  key={c}
                  className={`text-center font-semibold cursor-pointer select-none ${densityHead}`}
                  onClick={() =>
                    setSort((s) => (s.col === c ? { col: c, dir: s.dir === "asc" ? "desc" : "asc" } : { col: c, dir: "asc" }))
                  }
                  title={c}
                >
                  <span className="inline-flex items-center gap-1">
                    {c} <span className="opacity-60">{arrow}</span>
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const zebra = i % 2 ? "bg-gray-50/60" : "bg-white";
            return (
              <tr key={i} className={[zebra, "hover:bg-blue-50/60"].join(" ")}>
                {cols.map((c) => (
                  <td
                    key={c}
                    className={[
                      "border-b border-gray-100 text-center tabular-nums",
                      densityRow,
                      c === "Driver" ? "text-left" : "",
                    ].join(" ")}
                    title={String(r?.[c] ?? "")}
                  >
                    {r?.[c] ?? ""}
                  </td>
                ))}
              </tr>
            );
          })}
          {!sorted.length && (
            <tr>
              <td className="px-2 py-2 text-xs text-gray-500" colSpan={cols.length}>
                No rows.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ----------------------------- Driver H2H Tool (with zoom) ----------------------------- */
function H2HMatrixTool({ source, compact = false, maxHeight = "78vh" }) {
  const SHOW_SOURCE = false;
  const { data, err, loading } = useJson(source);

  // normalize rows
  const rows = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.rows)) return data.rows;
    return [];
  }, [data]);

  const drivers = useMemo(() => {
    if (!rows.length) return [];
    const names = new Set();
    for (const r of rows) if (r?.Driver) names.add(String(r.Driver));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  // build grid lookup
  const grid = useMemo(() => {
    const g = {};
    for (const r of rows) {
      const d = String(r?.Driver ?? "");
      if (!d) continue;
      g[d] = g[d] || {};
      for (const [k, v] of Object.entries(r)) {
        if (k === "Driver") continue;
        const n = Number(String(v ?? "").toString().replace(/[,%\s]/g, ""));
        if (Number.isFinite(n)) g[d][k] = n;
      }
    }
    return g;
  }, [rows]);

  // selections
  const [A, setA] = useState("");
  const [B, setB] = useState("");
  useEffect(() => {
    if (!A && drivers.length) setA(drivers[0]);
    if (!B && drivers.length > 1) setB(drivers[1]);
  }, [drivers]); // init

  const getAB = useCallback((a, b) => {
    if (!a || !b || a === b) return NaN;
    const direct = grid?.[a]?.[b];
    if (Number.isFinite(direct)) return direct;
    const back = grid?.[b]?.[a];
    if (Number.isFinite(back)) return 100 - back;
    return NaN;
  }, [grid]);

  const probA = getAB(A, B);
  const probB = Number.isFinite(probA) ? 100 - probA : NaN;

  const toAmerican = (p) => {
    const q = p / 100;
    if (!(q > 0 && q < 1)) return "—";
    if (q >= 0.5) return Math.round((-100 * q) / (1 - q)).toString();
    return `+${Math.round((100 * (1 - q)) / q)}`;
  };
  const fmt1pct = (n) => (Number.isFinite(n) ? `${n.toFixed(1)}%` : "—");

  const exportCSV = () => {
    if (!rows.length) return;
    const cols = ["Driver", ...drivers];
    const header = cols.map(escapeCSV).join(",");
    const lines = [header];
    for (const d of drivers) {
      const r = grid[d] || {};
      const line = [d, ...drivers.map((op) => r?.[op] ?? (op === d ? "" : ""))].map(escapeCSV).join(",");
      lines.push(line);
    }
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `driver_h2h_matrix_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // ----- NEW: zoom + column/padding/font scaling -----
  const [zoom, setZoom] = useState(1.15);
  const baseCol = compact ? 64 : 76; // px
  const colW = Math.round(baseCol * zoom);
  const padY = zoom >= 1 ? 6 : 4;
  const padX = zoom >= 1 ? 8 : 6;
  const fontPx = Math.round((compact ? 11 : 12) * zoom);
  const density = compact ? "text-[11px]" : "text-xs";

  return (
    <section className="mb-8">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="text-xl sm:text-2xl font-extrabold">Driver H2H Tool</h2>
        {SHOW_SOURCE && <code className="text-[11px] ml-2 px-2 py-1 rounded bg-gray-50 border text-gray-600">{source}</code>}
        {loading && <span className="text-xs text-gray-500 ml-2">loading…</span>}
        {err && <span className="text-xs text-red-600 ml-2">error: {String(err)}</span>}
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs sm:text-sm">
            <span className="text-gray-600">Zoom</span>
            <input type="range" min="0.9" max="1.5" step="0.05" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="w-40" />
            <span className="w-10 text-right tabular-nums">{Math.round(zoom * 100)}%</span>
          </label>
          <button onClick={exportCSV} className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700">
            Export Matrix CSV
          </button>
        </div>
      </div>

      {/* Picker */}
      {!loading && !err && !!drivers.length && (
        <div className="rounded-xl border bg-white shadow-sm p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold mb-1">Driver A</label>
              <select value={A} onChange={(e) => setA(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
                {drivers.map((d) => <option key={`A-${d}`} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Driver B</label>
              <select value={B} onChange={(e) => setB(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm">
                {drivers.map((d) => <option key={`B-${d}`} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { const a=A,b=B; setA(b); setB(a); }} className="mt-5 px-3 py-2 text-sm rounded-lg border bg-white hover:bg-gray-50">
                Swap
              </button>
            </div>
          </div>

          {/* Result cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <div className="rounded-lg border p-3">
              <div className="text-sm text-gray-500">Chance {A || "—"} beats {B || "—"}</div>
              <div className="text-2xl font-extrabold">{fmt1pct(probA)}</div>
              <div className={density + " text-gray-600"}>Fair odds: {toAmerican(probA)}</div>
              <div className={density + " text-gray-600"}>Edge vs 50/50: {Number.isFinite(probA) ? (probA - 50).toFixed(1) + "%" : "—"}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-sm text-gray-500">Chance {B || "—"} beats {A || "—"}</div>
              <div className="text-2xl font-extrabold">{fmt1pct(probB)}</div>
              <div className={density + " text-gray-600"}>Fair odds: {toAmerican(probB)}</div>
              <div className={density + " text-gray-600"}>Edge vs 50/50: {Number.isFinite(probB) ? (probB - 50).toFixed(1) + "%" : "—"}</div>
            </div>
          </div>
        </div>
      )}

      {loading && <div className="text-sm text-gray-600">Loading…</div>}
      {err && <div className="text-sm text-red-600">Failed to load: {String(err)}</div>}

      {/* Heatmap table */}
      {!loading && !err && !!drivers.length && (
        <>
          <div className="rounded-xl border bg-white shadow-sm overflow-auto" style={{ maxHeight }}>
            <table
              className="w-full border-separate"
              style={{ borderSpacing: 0, fontSize: `${fontPx}px`, lineHeight: 1.15, minWidth: `${drivers.length * (colW + 2)}px` }}
            >
              <colgroup>
                <col style={{ width: `${Math.max(160, 140 * zoom)}px` }} />
                {drivers.map((d) => <col key={`colw-${d}`} style={{ width: `${colW}px` }} />)}
              </colgroup>

              <thead className="sticky top-0 z-20 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60">
                <tr>
                  <th className="font-semibold text-left sticky left-0 bg-white border-b" style={{ padding: `6px 8px` }}>
                    Driver
                  </th>
                  {drivers.map((d) => (
                    <th
                      key={`h2h-col-${d}`}
                      className="font-semibold border-b text-center"
                      style={{ padding: `6px 8px`, whiteSpace: "nowrap" }}
                      title={d}
                    >
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {drivers.map((rd, i) => {
                  const zebra = i % 2 ? "bg-gray-50/60" : "bg-white";
                  return (
                    <tr key={`row-${rd}`} className="hover:bg-blue-50/60 transition-colors">
                      <td className={`font-medium sticky left-0 ${zebra} border-r`} style={{ padding: `6px 8px` }}>
                        {rd}
                      </td>

                      {drivers.map((cd) => {
                        const v = rd === cd ? "" : grid?.[rd]?.[cd];
                        const p = Number.isFinite(v) ? v : (Number.isFinite(grid?.[cd]?.[rd]) ? 100 - grid[cd][rd] : NaN);
                        let bg = "";
                        if (Number.isFinite(p)) {
                          const t = Math.max(0, Math.min(100, p));
                          const g = Math.round(255 * Math.max(0, (t - 50) / 50));
                          const r = Math.round(255 * Math.max(0, (50 - t) / 50));
                          bg = `rgba(${r}, ${g}, 0, 0.12)`;
                        }
                        const isPick = (rd === A && cd === B) || (rd === B && cd === A);

                        return (
                          <td
                            key={`cell-${rd}-${cd}`}
                            className={`text-center border-b tabular-nums ${isPick ? "ring-2 ring-blue-400 ring-inset" : ""}`}
                            style={{ backgroundColor: Number.isFinite(p) ? bg : undefined, padding: `6px 8px` }}
                            title={Number.isFinite(p) ? `${rd} vs ${cd}: ${p.toFixed(1)}%` : ""}
                            onClick={() => { if (rd !== cd) { setA(rd); setB(cd); } }}
                          >
                            {rd === cd ? "—" : Number.isFinite(p) ? `${p.toFixed(1)}%` : ""}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-[11px] text-gray-500">
            Use the Zoom slider to scale cells and text. Headers + first column stay frozen while you scroll.
          </div>
        </>
      )}
    </section>
  );
}

/* ---------------------- Finish Distribution Table (click → chart, heatmap) ---------------------- */
function FinishDistTable({ source, compact = false, maxHeight = "62vh", palette = "none" }) {
  const { data, err, loading } = useJson(source);

  const rows = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.rows)) return data.rows;
    return [];
  }, [data]);

  const allCols = useMemo(() => (rows.length ? Object.keys(rows[0]) : []), [rows]);

  const posCols = useMemo(() => {
    const ps = allCols
      .filter((c) => /^P?\d+$/i.test(String(c)))
      .map((c) => {
        const m = String(c).match(/\d+/);
        return { src: c, n: m ? Number(m[0]) : 0 };
      })
      .sort((a, b) => a.n - b.n)
      .map((x) => x.src);
    const other = allCols.filter((c) => c !== "Driver" && !ps.includes(c));
    return ["Driver", ...ps, ...other];
  }, [allCols]);

  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => posCols.some((c) => String(r?.[c] ?? "").toLowerCase().includes(s)));
  }, [rows, posCols, q]);

  // heat stats for P# columns: higher better
  const heatStats = useMemo(() => {
    const stats = {};
    if (!filtered.length) return stats;
    for (const c of posCols) {
      if (c === "Driver") continue;
      const dir = /^P?\d+$/i.test(c) ? "higher" : dirForCol(c);
      if (!dir) continue;
      let min = Infinity, max = -Infinity;
      for (const r of filtered) {
        const n = num(r?.[c]);
        if (Number.isFinite(n)) { if (n < min) min = n; if (n > max) max = n; }
      }
      if (min !== Infinity && max !== -Infinity) stats[c] = { min, max, dir };
    }
    return stats;
  }, [filtered, posCols]);

  const [sort, setSort] = useState({ col: posCols[1] || "", dir: "desc" });
  const sorted = useMemo(() => {
    if (!sort.col) return filtered;
    return [...filtered].sort((a, b) => cmp(a?.[sort.col], b?.[sort.col], sort.dir));
  }, [filtered, sort]);

  const fmtPct = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? `${n.toFixed(1)}%` : "";
    };

  const colWidthCh = useMemo(() => {
    const widths = {};
    const sample = rows.slice(0, 150);
    for (const c of posCols) {
      let maxLen = c.length;
      for (const r of sample) maxLen = Math.max(maxLen, String(r?.[c] ?? "").length);
      widths[c] = c === "Driver" ? clamp(Math.max(maxLen, 16), 14, 26) : 6;
    }
    return widths;
  }, [rows, posCols]);

  const exportCSV = () => {
    const cols = posCols;
    const lines = [];
    lines.push(cols.map(escapeCSV).join(","));
    for (const r of sorted) {
      lines.push(cols.map((c) => {
        const v = r?.[c];
        return escapeCSV(c === "Driver" ? v : (Number.isFinite(+v) ? (+v).toFixed(1) : ""));
      }).join(","));
    }
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `finish_distribution_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const densityRow  = compact ? "px-1 py-1 text-[11px]" : "px-2 py-1 text-xs";
  const densityHead = compact ? "px-1 py-1 text-[11px]" : "px-2 py-1 text-xs";

  const [selected, setSelected] = useState(null);
  const posKeys = useMemo(() => posCols.filter((c) => c !== "Driver" && /^P?\d+$/i.test(String(c))), [posCols]);
  const chartData = useMemo(() => {
    if (!selected) return [];
    return posKeys.map((c) => {
      const n = Number(String(c).replace(/[^\d]/g, ""));
      const v = Number(selected?.[c]);
      return { pos: n, pct: Number.isFinite(v) ? Number(v.toFixed(1)) : 0 };
    });
  }, [selected, posKeys]);
  const expectedFinish = useMemo(() => {
    if (!chartData.length) return NaN;
    let wsum = 0, psum = 0;
    for (const { pos, pct } of chartData) {
      if (pct > 0) { const p = pct / 100.0; wsum += pos * p; psum += p; }
    }
    return psum > 0 ? wsum / psum : NaN;
  }, [chartData]);

  return (
    <section className="mb-8">
      <div className="flex items-baseline gap-3 mb-2">
        <h2 className="text-xl sm:text-2xl font-extrabold">Finish Distribution</h2>
        <div className="ml-auto flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search drivers…"
            className="border rounded-lg px-3 py-2 w-48 sm:w-56 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700" onClick={exportCSV}>
            Export CSV
          </button>
          <div className="text-xs text-gray-500">{sorted.length.toLocaleString()} rows</div>
        </div>
      </div>

      {selected && (
        <div className="rounded-xl border bg-white shadow-sm mb-4 p-3">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-lg font-bold">{selected.Driver}</div>
            <div className="text-xs text-gray-600">
              Expected finish: {Number.isFinite(expectedFinish) ? expectedFinish.toFixed(2) : "—"}
            </div>
            <button className="ml-auto px-2 py-1 text-xs rounded-md border bg-white hover:bg-gray-50" onClick={() => setSelected(null)} title="Close chart">
              Close
            </button>
          </div>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="pos" tickFormatter={(t) => `P${t}`} interval={0} height={40} />
                <YAxis unit="%" tickFormatter={(t) => t.toFixed(0)} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, "Probability"]} labelFormatter={(l) => `Position P${l}`} />
                <Bar dataKey="pct" />
                {Number.isFinite(expectedFinish) && (
                  <ReferenceLine
                    x={Number(expectedFinish.toFixed(2))}
                    stroke="#3b82f6"
                    strokeDasharray="4 4"
                    label={{ value: `EF ${expectedFinish.toFixed(2)}`, position: "top", fill: "#3b82f6", fontSize: 12 }}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            Bars show probability of each exact finishing position. The dashed line marks the expected finish.
          </div>
        </div>
      )}

      {loading && <div className="text-sm text-gray-600">Loading…</div>}
      {err && <div className="text-sm text-red-600">Failed to load: {String(err)}</div>}

      {!loading && !err && (
        <div className="rounded-xl border bg-white shadow-sm overflow-auto" style={{ maxHeight }}>
          <table className="w-full table-fixed border-separate" style={{ borderSpacing: 0 }}>
            <colgroup>
              {posCols.map((c) => (<col key={c} style={{ width: `${colWidthCh[c] ?? 8}ch` }} />))}
            </colgroup>
            <thead>
              <tr>
                {posCols.map((c) => {
                  const active = sort.col === c;
                  const arrow = active ? (sort.dir === "asc" ? "▲" : "▼") : "▲";
                  return (
                    <th
                      key={c}
                      onClick={() =>
                        setSort((s) => s.col === c ? { col: c, dir: s.dir === "asc" ? "desc" : "asc" } : { col: c, dir: "desc" }
                      )}
                      className={[
                        "sticky top-0 z-30 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60",
                        "font-semibold border-b border-gray-200",
                        c === "Driver" ? "text-left" : "text-center",
                        densityHead,
                      ].join(" ")}
                      title={c}
                    >
                      <span className="inline-flex items-center gap-1">
                        {c} <span className="opacity-60">{arrow}</span>
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const zebra = i % 2 ? "bg-gray-50/60" : "bg-white";
                return (
                  <tr key={i} className={[zebra, "hover:bg-blue-50/60 cursor-pointer"].join(" ")} onClick={() => setSelected(r)} title="Click to show chart">
                    {posCols.map((c) => {
                      const stat = heatStats[c];
                      const bg = stat ? heatColor(stat.min, stat.max, r?.[c], stat.dir, palette) : null;
                      return (
                        <td
                          key={c}
                          className={[
                            "border-b border-gray-100 tabular-nums",
                            c === "Driver" ? "text-left" : "text-center",
                            densityRow,
                          ].join(" ")}
                          style={{ ...(bg ? { backgroundColor: bg } : {}) }}
                        >
                          {c === "Driver" ? (r?.Driver ?? "") : fmtPct(r?.[c])}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {!sorted.length && (
                <tr>
                  <td className="px-2 py-2 text-xs text-gray-500" colSpan={posCols.length}>
                    No rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 text-[11px] text-gray-500">
        Click a driver row to see a histogram of their projected outcomes. Numbers are already in percent (0–100).
      </div>
    </section>
  );
}

/* ----------------------------- page with Tabs (prettier toggles + palette) ----------------------------- */
export default function CupBetting() {
  const BASE = import.meta?.env?.BASE_URL ?? "/";
  const MAIN   = `${BASE}data/nascar/cup/latest/odds_main.json`;
  const EXTRA  = `${BASE}data/nascar/cup/latest/odds_extra.json`;
  const H2H    = `${BASE}data/nascar/cup/latest/h2h_matrix.json`;
  const FINISH = `${BASE}data/nascar/cup/latest/finish_dist.json`;

  // meta.json fallbacks (optional on your server)
  const MAIN_META   = MAIN.replace(/odds_main\.json$/, "meta.json");
  const EXTRA_META  = EXTRA.replace(/odds_extra\.json$/, "meta.json");
  const H2H_META    = H2H.replace(/h2h_matrix\.json$/, "meta.json");
  const FINISH_META = FINISH.replace(/finish_dist\.json$/, "meta.json");

  // collect freshest timestamp across all tabs
  const upMain   = useLastUpdated(MAIN, MAIN_META);
  const upExtra  = useLastUpdated(EXTRA, EXTRA_META);
  const upH2H    = useLastUpdated(H2H, H2H_META);
  const upFinish = useLastUpdated(FINISH, FINISH_META);
  const updatedAt = useMemo(() => {
    const ds = [upMain, upExtra, upH2H, upFinish].filter(Boolean).map((d) => +d);
    return ds.length ? new Date(Math.max(...ds)) : null;
  }, [upMain, upExtra, upH2H, upFinish]);

  const TABS = [
    { id: "driver", label: "Driver Sims" },
    { id: "mfg",    label: "Manufacturer Sims" },
    { id: "h2h",    label: "H2H Tool" },
    { id: "finish", label: "Finish Dist" },
  ];

  const [active, setActive] = useState("driver");
  const [compact, setCompact] = useState(true);      // default ON
  const [palette, setPalette] = useState("none");    // default: no coloring

  return (
    <div className="px-5 py-6">
      {/* Page header + controls */}
      <div className="max-w-[1200px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
          <div className="flex items-end gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold">NASCAR Cup — Betting Sims</h1>
            {updatedAt && (
              <div className="text-sm text-gray-500">Updated: {fmtUpdated(updatedAt)}</div>
            )}
          </div>

          {/* prettier compact switch + palette */}
          <div className="sm:ml-auto flex items-center gap-3">
            <div className="inline-flex items-center gap-2">
              <span className="text-sm text-gray-600">Compact</span>
              <button
                onClick={() => setCompact((v) => !v)}
                className={[
                  "relative h-6 w-11 rounded-full transition",
                  compact ? "bg-blue-600" : "bg-gray-300",
                ].join(" ")}
                aria-pressed={compact}
              >
                <span
                  className={[
                    "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transform transition",
                    compact ? "translate-x-5" : "translate-x-0",
                  ].join(" ")}
                />
              </button>
            </div>

            <div className="inline-flex items-center gap-2">
              <span className="text-sm text-gray-600 hidden sm:block">Palette</span>
              <select
                value={palette}
                onChange={(e) => setPalette(e.target.value)}
                className="h-8 rounded-lg border px-2 text-sm"
              >
                <option value="none">None</option>
                <option value="rdylgn">Rd–Yl–Gn</option>
                <option value="blueorange">Blue–Orange</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tabs (segmented, more aesthetic) */}
        <div className="inline-flex rounded-xl border bg-gray-100 p-1 shadow-inner mb-5">
          {TABS.map((t) => {
            const on = active === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={[
                  "px-3 py-2 text-sm rounded-lg transition min-w-[8rem]",
                  on ? "bg-white shadow font-semibold" : "text-gray-700 hover:text-gray-900",
                ].join(" ")}
                aria-pressed={on}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content — H2H gets a wider container */}
      <div className={active === "h2h" ? "max-w-[min(1600px,95vw)] mx-auto" : "max-w-[1200px] mx-auto"}>
        {active === "driver" && (
          <BettingTableBlock title="Betting Dashboard (Driver Sims)" source={MAIN} compact={compact} maxHeight="70vh" palette={palette} />
        )}
        {active === "mfg" && <ManufacturerSections source={EXTRA} compact={compact} />}
        {active === "h2h" && <H2HMatrixTool source={H2H} compact={compact} maxHeight="78vh" />}
        {active === "finish" && <FinishDistTable source={FINISH} compact={compact} maxHeight="70vh" palette={palette} />}
      </div>
    </div>
  );
}
