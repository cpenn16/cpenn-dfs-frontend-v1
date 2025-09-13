// src/pages/nascar/CupCheatSheets.jsx
import React, { useEffect, useMemo, useState } from "react";

/* --------------------------- data fetcher --------------------------- */
function useJson(url) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!url) return;
    setLoading(true);
    fetch(url, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => alive && (setData(j), setErr(null)))
      .catch((e) => alive && (setErr(e), setData(null)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [url]);

  return { data, err, loading };
}

/* ------------------------------- utils ------------------------------ */
const isNumericCol = (c) =>
  /(^qual$|^value$|sal$|rank$|pts?$|proj|avg|score|own%?$|%$|^\d+$)/i.test(
    String(c || "").trim()
  );

function fmtUpdated(meta) {
  const raw =
    meta?.updated || meta?.last_updated || meta?.lastUpdated || meta?.timestamp;
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d)) return "";
  return d.toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* --------------------------- compact table -------------------------- */
function CompactTable({ title, rows }) {
  const columns = useMemo(
    () => (Array.isArray(rows) && rows.length ? Object.keys(rows[0]) : []),
    [rows]
  );

  return (
    <div className="mt-3 max-w-2xl mx-auto">
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        {/* Title bar (brand blue) */}
        <div className="px-4 py-2 bg-blue-700 text-white">
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-gray-100">
                {columns.map((c, ci) => (
                  <th
                    key={c}
                    title={c}
                    className={[
                      "px-3 py-2 border-b font-semibold text-gray-900",
                      ci === 0
                        ? "text-center"
                        : isNumericCol(c)
                        ? "text-right"
                        : "text-left",
                      "text-xs",
                    ].join(" ")}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={i % 2 ? "bg-white" : "bg-gray-50"}>
                  {columns.map((c, ci) => (
                    <td
                      key={c}
                      title={String(row?.[c] ?? "")}
                      className={[
                        "px-3 py-1.5 border-b whitespace-nowrap",
                        ci === 0
                          ? "text-center"
                          : isNumericCol(c)
                          ? "text-right tabular-nums"
                          : "text-left",
                      ].join(" ")}
                    >
                      {row?.[c] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td className="px-3 py-3 text-gray-500 border-b" colSpan={columns.length || 1}>
                    No rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- page ------------------------------ */
export default function CupCheatSheets() {
  const BASE = import.meta?.env?.BASE_URL ?? "/";

  const DATA_URL = `${BASE}data/nascar/cup/latest/cheatsheets.json`;
  const META_URL = `${BASE}data/nascar/cup/latest/meta.json`;

  const { data, err, loading } = useJson(DATA_URL);
  const { data: meta } = useJson(META_URL);

  // Normalize -> [{ id, label, rows }]
  const tables = useMemo(() => {
    const arr = Array.isArray(data?.tables) ? data.tables : [];
    return arr.map((t, i) => {
      const id =
        t.id ||
        (t.title ? t.title.toLowerCase().replace(/\s+/g, "_") : `table_${i}`);
      const label = t.label || t.title || `Table ${i + 1}`;
      const rows = Array.isArray(t.rows)
        ? t.rows
        : Array.isArray(t.data)
        ? t.data
        : [];
      return { id, label, rows };
    });
  }, [data]);

  // selection
  const [tableId, setTableId] = useState("");
  useEffect(() => {
    if (!tableId && tables.length) setTableId(tables[0].id);
  }, [tables, tableId]);

  const selected = useMemo(
    () => tables.find((t) => t.id === tableId),
    [tables, tableId]
  );

  const updatedStr = fmtUpdated(meta);
  const rowCount = selected?.rows?.length ?? 0;

  return (
    <div className="px-5 py-6 max-w-4xl mx-auto">
      <h1 className="text-2xl sm:text-3xl font-extrabold text-center">
        NASCAR Cup — Cheat Sheets
      </h1>

      {/* Meta line: rows + updated */}
      <div className="mt-1 mb-4 text-center text-xs text-gray-600">
        {rowCount ? <span>{rowCount.toLocaleString()} rows</span> : null}
        {updatedStr ? (
          <span className={rowCount ? "ml-3" : ""}>Updated: {updatedStr}</span>
        ) : null}
      </div>

      {/* Controls (compact) */}
      <div className="mb-3 flex items-center gap-2 justify-center">
        <label className="text-sm font-medium text-gray-700">Choose a table:</label>
        <select
          className="border rounded-md px-3 py-2 text-sm"
          value={tableId}
          onChange={(e) => setTableId(e.target.value)}
        >
          {tables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="text-sm text-gray-600 text-center">Loading…</div>}
      {err && (
        <div className="text-sm text-red-600 text-center">
          Failed to load: {String(err)}
        </div>
      )}
      {!loading && !err && !tables.length && (
        <div className="text-sm text-gray-600 text-center">
          No tables found. Ensure <code>{DATA_URL}</code> exists.
        </div>
      )}

      {!loading && !err && selected && (
        <CompactTable title={selected.label} rows={selected.rows || []} />
      )}
    </div>
  );
}
