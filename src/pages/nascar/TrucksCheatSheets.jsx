// src/pages/nascar/TrucksCheatSheets.jsx
import React, { useEffect, useMemo, useState } from "react";

/* ------------------------ data fetch helper ------------------------ */
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

/* -------------------------- utils -------------------------- */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const escapeCSV = (v) => {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const isNumericCol = (c) =>
  /(^qual$|^value$|sal$|rank$|pts?$|proj|avg|score|own%?$|%$|^\d+$)/i.test(String(c).trim());

/* ---------------------- responsive table ---------------------- */
function SimpleTable({ title, rows }) {
  const columns = useMemo(() => {
    if (Array.isArray(rows) && rows.length) return Object.keys(rows[0]);
    return [];
  }, [rows]);

  // Auto-fit (ch) per column
  const widthCh = useMemo(() => {
    const w = {};
    const sample = rows.slice(0, 200);
    for (const c of columns) {
      let maxLen = String(c).length;
      for (const r of sample) {
        const s = String(r?.[c] ?? "");
        if (s.length > maxLen) maxLen = s.length;
      }
      const base = isNumericCol(c) ? clamp(maxLen + 2, 6, 12) : clamp(maxLen, 10, 24);
      w[c] = base;
    }
    return w;
  }, [rows, columns]);

  // Export just this table
  const exportCSV = () => {
    const lines = [];
    lines.push(columns.map(escapeCSV).join(","));
    for (const r of rows) lines.push(columns.map((c) => escapeCSV(r?.[c] ?? "")).join(","));
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/\s+/g, "_").toLowerCase()}_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="mt-3 rounded-xl border bg-white shadow-sm overflow-auto">
      <div className="flex items-center gap-2 px-3 pt-3">
        <h2 className="text-base sm:text-lg font-semibold">{title}</h2>
        <button
          onClick={exportCSV}
          className="ml-auto px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          Export CSV
        </button>
      </div>

      <table className="w-max min-w-full table-fixed border-separate mt-2" style={{ borderSpacing: 0 }}>
        <colgroup>
          {columns.map((c) => (
            <col key={c} style={{ width: `${widthCh[c] ?? 10}ch` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                className={[
                  "sticky top-0 z-10 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60",
                  "border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-900",
                  isNumericCol(c) ? "text-right" : "",
                ].join(" ")}
                title={c}
              >
                <div className="whitespace-normal break-words leading-tight">{c}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const zebra = i % 2 ? "bg-gray-50/60" : "bg-white";
            return (
              <tr key={i} className={zebra + " hover:bg-blue-50/60 transition-colors"}>
                {columns.map((c) => (
                  <td
                    key={c}
                    className={[
                      "border-b border-gray-100 px-3 py-2 text-sm whitespace-nowrap",
                      isNumericCol(c) ? "text-right tabular-nums" : "text-left",
                    ].join(" ")}
                    title={String(row?.[c] ?? "")}
                  >
                    {row?.[c] ?? ""}
                  </td>
                ))}
              </tr>
            );
          })}
          {!rows.length && (
            <tr>
              <td className="px-3 py-3 text-sm text-gray-500" colSpan={columns.length || 1}>
                No rows.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------- page -------------------------------- */
export default function CupCheatSheets() {
  const BASE = import.meta?.env?.BASE_URL ?? "/";
  const SOURCE = `${BASE}data/nascar/trucks/latest/cheatsheets.json`;
  const { data, err, loading } = useJson(SOURCE);

  // Normalize -> [{ id, label, rows }]
  const tables = useMemo(() => {
    const arr = Array.isArray(data?.tables) ? data.tables : [];
    return arr.map((t, i) => {
      const id = t.id || (t.title ? t.title.toLowerCase().replace(/\s+/g, "_") : `table_${i}`);
      const label = t.label || t.title || `Table ${i + 1}`;
      const rows = Array.isArray(t.rows) ? t.rows : Array.isArray(t.data) ? t.data : [];
      return { id, label, rows };
    });
  }, [data]);

  const [tableId, setTableId] = useState("");
  useEffect(() => {
    if (!tableId && tables.length) setTableId(tables[0].id);
  }, [tables, tableId]);

  const selected = useMemo(() => tables.find((t) => t.id === tableId), [tables, tableId]);

  // simple search within selected table
  const [q, setQ] = useState("");
  const filteredRows = useMemo(() => {
    if (!selected?.rows?.length) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return selected.rows;
    const cols = Object.keys(selected.rows[0] || {});
    return selected.rows.filter((r) =>
      cols.some((c) => String(r?.[c] ?? "").toLowerCase().includes(needle))
    );
  }, [selected, q]);

  return (
    <div className="px-5 py-6">
      <h1 className="text-2xl sm:text-3xl font-extrabold mb-3">NASCAR Trucks — Cheat Sheets</h1>

      <div className="flex items-center gap-3 flex-wrap mb-3">
        <label className="text-sm font-medium text-gray-700">Choose a table</label>
        <div className="inline-flex rounded-xl border bg-gray-100 p-1 shadow-inner">
          {tables.map((t) => {
            const on = tableId === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTableId(t.id)}
                className={[
                  "px-3 py-2 text-sm rounded-lg transition min-w-[7rem]",
                  on ? "bg-white shadow font-semibold" : "text-gray-700 hover:text-gray-900",
                ].join(" ")}
                aria-pressed={on}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search selected table…"
          className="ml-auto border rounded-lg px-3 py-2 w-56 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading && <div className="text-sm text-gray-600">Loading…</div>}
      {err && <div className="text-sm text-red-600">Failed to load: {String(err)}</div>}

      {!loading && !err && (!tables || tables.length === 0) && (
        <div className="text-sm text-gray-600">
          No tables found. Ensure <code>{`${BASE}data/nascar/trucks/latest/cheatsheets.json`}</code> exists.
        </div>
      )}

      {!loading && !err && selected && (
        <>
          <div className="text-xs text-gray-500 mb-1">{filteredRows.length.toLocaleString()} rows</div>
          <SimpleTable title={selected.label} rows={filteredRows} />
        </>
      )}
    </div>
  );
}
