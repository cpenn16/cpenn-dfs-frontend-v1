// src/pages/nascar/CupGFS.jsx
import React, { useEffect, useMemo, useState } from "react";

/* ------------ small fetch hook ------------ */
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
      .then((j) => { if (alive) { setData(j); setErr(null); } })
      .catch((e) => { if (alive) { setErr(e); setData(null); } })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [url]);

  return { data, err, loading };
}

/* ------------ helpers ------------ */
// robust numeric parse: ignore blanks/dashes/"NA", strip commas
const num = (v) => {
  if (v === null || v === undefined) return NaN;
  let s = String(v).replace(/[\u00A0]/g, " ").trim(); // NBSP->space
  if (!s || s === "-" || s === "—" || /^n\/?a$/i.test(s)) return NaN;
  s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const isNumeric = (v) => Number.isFinite(num(v));
const looksNumericCol = (c) =>
  /^\d+$/.test(String(c)) ||
  /(temp|wind|mph|^%|%$|deg|rank|prob|chance|index|score|lat|lon|elev|alt|spd|gust|precip|rain|snow|mm|cm|in$)/i.test(
    String(c)
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

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const findDriverKey = (row) =>
  Object.keys(row || {}).find((k) => /^driver\b/i.test(k)) || "Driver";

/* ---- LOWER-IS-BETTER flags ---- */
const LOWER_SET = [
  "intermediate",
  "short/flat",
  "road course",
  "this track",
  "similar tracks",
  "high tire wear",
  "tire codes",
  "overall",
];
function isLowerBetter(col) {
  const s = String(col || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (/^20\d{2}$/.test(s)) return true;             // years like 2022..2026
  return LOWER_SET.includes(s);
}

/* ---- heatmap palettes ---- */
function heatColor(min, max, v, dir = "lower", palette = "rdylgn") {
  if (palette === "none") return null;
  const n = num(v);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(n) || min === max) return null;

  let t = (n - min) / (max - min);
  t = clamp(t, 0, 1);
  if (dir === "lower") t = 1 - t; // greener for lower numbers

  if (palette === "blueorange") {
    // light blue -> white -> light orange (subtle, readable)
    if (t < 0.5) {
      const u = t / 0.5;  // 0..1
      const h = 220, s = 60 - u * 55, l = 90 + u * 7;
      return `hsl(${h} ${s}% ${l}%)`;
    } else {
      const u = (t - 0.5) / 0.5;
      const h = 30, s = 5 + u * 80, l = 97 - u * 7;
      return `hsl(${h} ${s}% ${l}%)`;
    }
  }
  // default Rd–Yl–Gn (light)
  if (t < 0.5) {
    const u = t / 0.5;
    const h = 0 + u * 60, s = 78 + u * 10, l = 94 - u * 2; // red -> yellow
    return `hsl(${h} ${s}% ${l}%)`;
  } else {
    const u = (t - 0.5) / 0.5;
    const h = 60 + u * 60, s = 88 - u * 18, l = 92 + u * 2; // yellow -> green
    return `hsl(${h} ${s}% ${l}%)`;
  }
}

/* ------------ page ------------ */
export default function CupGFS() {
  const SOURCE = "/data/nascar/cup/latest/gfs.json";
  const SHOW_SOURCE = false;

  const { data, err, loading } = useJson(SOURCE);

  // rows
  const rows = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.rows)) return data.rows;
    return [];
  }, [data]);

  // columns (in the order they appear in the JSON)
  const allCols = useMemo(() => (rows.length ? Object.keys(rows[0]) : []), [rows]);

  // detect driver column (if any) so we can freeze it & left-align
  const driverKey = useMemo(() => findDriverKey(rows[0] || {}), [rows]);

  // visible column toggles
  const [visibleCols, setVisibleCols] = useState([]);
  useEffect(() => {
    if (allCols.length) setVisibleCols(allCols.map(() => true));
  }, [allCols]);

  const toggleCol = (idx) =>
    setVisibleCols((prev) => {
      const next = [...prev];
      next[idx] = !next[idx];
      return next;
    });

  const showAll = () => setVisibleCols(allCols.map(() => true));
  const hideAll = () => setVisibleCols(allCols.map(() => false));
  const resetAll = () => {
    setQ("");
    setSort({ col: "", dir: "asc" });
    showAll();
  };

  const visibleColNames = allCols.filter((_, i) => visibleCols[i]);

  // search
  const [q, setQ] = useState("");
  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      allCols.some((c) => String(r?.[c] ?? "").toLowerCase().includes(needle))
    );
  }, [q, rows, allCols]);

  // sorting
  const [sort, setSort] = useState({ col: "", dir: "asc" });
  const sortedRows = useMemo(() => {
    if (!sort.col) return filteredRows;
    const { col, dir } = sort;
    return [...filteredRows].sort((a, b) => cmp(a?.[col], b?.[col], dir));
  }, [filteredRows, sort]);

  // auto-fit width (character-based) for each column
  const widthCh = useMemo(() => {
    const w = {};
    if (!rows.length) return w;
    const sample = rows.slice(0, 300); // sample to keep it fast

    for (const c of allCols) {
      let maxLen = 0;
      const headerLen = String(c).length;
      for (const r of sample) {
        const s = String(r?.[c] ?? "");
        if (s.length > maxLen) maxLen = s.length;
      }
      if (c === driverKey) {
        w[c] = clamp(Math.max(maxLen, 12), 12, 22);
      } else if (looksNumericCol(c)) {
        w[c] = clamp(Math.max(maxLen + 2, 6), 6, 12);
      } else {
        w[c] = clamp(Math.max(maxLen, Math.min(headerLen, 12)), 10, 16);
      }
    }
    return w;
  }, [rows, allCols, driverKey]);

  // 🔥 heat stats (only for lower-is-better columns) on the *current* dataset (filtered, visible)
  const heatStats = useMemo(() => {
    const stats = {};
    const cols = visibleColNames.length ? visibleColNames : allCols;
    if (!sortedRows.length) return stats;

    for (const c of cols) {
      if (!isLowerBetter(c)) continue;
      let min = Infinity, max = -Infinity;
      for (const r of sortedRows) {
        const n = num(r?.[c]);
        if (Number.isFinite(n)) {
          if (n < min) min = n;
          if (n > max) max = n;
        }
      }
      if (min !== Infinity && max !== -Infinity && max > min) {
        stats[c] = { min, max, dir: "lower" };
      }
    }
    return stats;
  }, [sortedRows, visibleColNames, allCols]);

  // palette toggle
  const [palette, setPalette] = useState("none"); // "none" | "rdylgn" | "blueorange"

  // export CSV for current view
  const exportCSV = () => {
    const cols = visibleColNames.length ? visibleColNames : allCols;
    const lines = [];
    const escapeCSV = (v) => {
      const s = String(v ?? "");
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    lines.push(cols.map(escapeCSV).join(","));
    for (const r of sortedRows) lines.push(cols.map((c) => escapeCSV(r?.[c] ?? "")).join(","));
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gfs_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /* ---- styling helpers ---- */
  const padCell = "px-2 py-1";
  const textSz = "text-xs";
  const headerWrap = "whitespace-normal break-words leading-tight";
  const cellWrap = "whitespace-normal break-words";

  return (
    <div className="px-5 py-6">
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h1 className="text-2xl sm:text-3xl font-extrabold">NASCAR Cup — GFS Data</h1>
        {SHOW_SOURCE && (
          <div className="text-sm text-gray-500">
            <code>{SOURCE}</code>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm text-gray-600 hidden sm:block">Palette</label>
          <select
            value={palette}
            onChange={(e) => setPalette(e.target.value)}
            className="h-8 rounded-lg border px-2 text-sm"
            title="Conditional formatting palette"
          >
            <option value="none">None</option>
            <option value="rdylgn">Rd–Yl–Gn</option>
            <option value="blueorange">Blue–Orange</option>
          </select>
        </div>
      </div>

      {/* controls */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="border rounded-lg px-3 py-2 w-64 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200" onClick={showAll}>
          Show all
        </button>
        <button className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200" onClick={hideAll}>
          Hide all
        </button>
        <button className="px-3 py-2 text-sm rounded-lg bg-white border hover:bg-gray-50" onClick={resetAll}>
          Reset
        </button>
        <button className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700" onClick={exportCSV}>
          Export CSV
        </button>
      </div>

      {/* chips */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        {allCols.map((c, i) => {
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
              title={on ? "Hide column" : "Show column"}
            >
              {on ? "✓ " : ""}
              {c}
            </button>
          );
        })}
      </div>

      {loading && <div className="text-sm text-gray-600">Loading…</div>}
      {err && <div className="text-sm text-red-600">Failed to load: {String(err)}</div>}

      {/* table */}
      {!loading && !err && (
        <div className="rounded-xl border bg-white shadow-sm overflow-auto">
          <table className="w-full table-fixed border-separate" style={{ borderSpacing: 0 }}>
            {/* col widths */}
            <colgroup>
              {visibleColNames.map((c) => (
                <col key={c} style={{ width: `${widthCh[c] ?? 10}ch` }} />
              ))}
            </colgroup>

            <thead>
              <tr>
                {visibleColNames.map((c) => {
                  const active = sort.col === c;
                  // show default “good” direction (▲ lower-better, ▼ higher-better)
                  const arrow = active
                    ? sort.dir === "asc" ? "▲" : "▼"
                    : isLowerBetter(c) ? "▲" : "▼";
                  const w = widthCh[c] ?? 10;
                  return (
                    <th
                      key={c}
                      onClick={() =>
                        setSort((s) =>
                          s.col === c
                            ? { col: c, dir: s.dir === "asc" ? "desc" : "asc" }
                            : { col: c, dir: isLowerBetter(c) ? "asc" : "desc" }
                        )
                      }
                      title={c}
                      className={[
                        "sticky top-0 z-30 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60",
                        "font-semibold border-b border-gray-200",
                        padCell,
                        textSz,
                        "cursor-pointer select-none",
                        c === driverKey ? "text-left" : "text-center",
                      ].join(" ")}
                      style={{ maxWidth: `${w}ch` }}
                    >
                      <div
                        className={[
                          "inline-flex items-center gap-1 justify-center w-full",
                          headerWrap,
                          c === driverKey ? "justify-start" : "",
                        ].join(" ")}
                      >
                        {c}{" "}
                        <span className={active ? "opacity-80 text-blue-600" : "opacity-50 text-gray-400"}>
                          {arrow}
                        </span>
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
                      const bg =
                        stat ? heatColor(stat.min, stat.max, r?.[c], stat.dir, palette) : null;

                      return (
                        <td
                          key={c}
                          className={[
                            "border-b border-gray-100",
                            padCell,
                            textSz,
                            c === driverKey ? `text-left` : "text-center",
                            isNumeric(r?.[c]) ? "tabular-nums" : "",
                            c === driverKey ? `sticky left-0 z-20 ${zebra} border-r` : "",
                          ].join(" ")}
                          style={{ maxWidth: `${widthCh[c] ?? 10}ch`, ...(bg ? { backgroundColor: bg } : {}) }}
                          title={String(r?.[c] ?? "")}
                        >
                          <div className={["w-full", cellWrap].join(" ")}>{r?.[c] ?? ""}</div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {!sortedRows.length && (
                <tr>
                  <td className={`${padCell} ${textSz} text-gray-500`} colSpan={visibleColNames.length || 1}>
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
