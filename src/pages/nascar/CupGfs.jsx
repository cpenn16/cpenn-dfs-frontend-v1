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

/* ------------ page ------------ */
export default function CupGFS() {
  const SOURCE = "/data/nascar/cup/latest/gfs.json";
  const SHOW_SOURCE = false; // set true if you want to display the JSON path

  const { data, err, loading } = useJson(SOURCE);

  // rows
  const rows = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.rows)) return data.rows;
    return [];
  }, [data]);

  // columns (in the order they appear in the JSON)
  const allCols = useMemo(() => {
    if (!rows.length) return [];
    return Object.keys(rows[0]);
  }, [rows]);

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
        // wider for names
        w[c] = clamp(Math.max(maxLen, 12), 12, 22);
      } else if (looksNumericCol(c)) {
        // narrow numeric columns
        w[c] = clamp(Math.max(maxLen + 2, 6), 6, 12);
      } else {
        w[c] = clamp(Math.max(maxLen, Math.min(headerLen, 12)), 10, 16);
      }
    }
    return w;
  }, [rows, allCols, driverKey]);

  // export CSV for current view (sortedRows, visible columns)
  const exportCSV = () => {
    const cols = visibleColNames.length ? visibleColNames : allCols;
    const lines = [];
    const escapeCSV = (v) => {
      const s = String(v ?? "");
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    lines.push(cols.map(escapeCSV).join(","));
    for (const r of sortedRows) {
      lines.push(cols.map((c) => escapeCSV(r?.[c] ?? "")).join(","));
    }
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gfs_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /* ---- styling helpers (compact, wrapped, centered; driver left) ---- */
  const padCell = "px-2 py-1";
  const textSz = "text-xs";
  const headerWrap = "whitespace-normal break-words leading-tight";
  const cellWrap = "whitespace-normal break-words";

  return (
    <div className="px-5 py-6">
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-3xl font-extrabold">NASCAR Cup — GFS Data</h1>
        {SHOW_SOURCE && (
          <div className="text-sm text-gray-500">
            <code>{SOURCE}</code>
          </div>
        )}
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
                on ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50",
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
                  const arrow = active ? (sort.dir === "asc" ? "▲" : "▼") : "▲";
                  const w = widthCh[c] ?? 10;
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
                        "cursor-pointer select-none",
                        c === driverKey ? "text-left" : "text-center",
                      ].join(" ")}
                      style={{ maxWidth: `${w}ch` }}
                    >
                      <div className={["inline-flex items-center gap-1 justify-center w-full", headerWrap, c === driverKey ? "justify-start" : ""].join(" ")}>
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
                          c === driverKey ? `text-left` : "text-center",
                          isNumeric(r?.[c]) ? "tabular-nums" : "",
                          c === driverKey ? `sticky left-0 z-20 ${zebra} border-r` : "",
                        ].join(" ")}
                        style={{ maxWidth: `${widthCh[c] ?? 10}ch` }}
                        title={String(r?.[c] ?? "")}
                      >
                        <div className={["w-full", cellWrap].join(" ")}>{r?.[c] ?? ""}</div>
                      </td>
                    ))}
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
