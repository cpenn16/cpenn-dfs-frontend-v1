// src/pages/nascar/CupCheatSheets.jsx
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
      .then((j) => {
        if (!alive) return;
        setData(j);
        setErr(null);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e);
        setData(null);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [url]);

  return { data, err, loading };
}

/* ------------------------- content-width table --------------------- */
function SimpleTable({ title, columns, rows }) {
  const cols = useMemo(() => {
    if (Array.isArray(columns) && columns.length) return columns;
    if (Array.isArray(rows) && rows.length) return Object.keys(rows[0]);
    return [];
  }, [columns, rows]);

  const isNumericCol = (c) => /(^qual$|^value$|sal$)/i.test(String(c).trim());

  return (
    <div className="mt-4 overflow-x-auto">
      <div className="inline-block max-w-full mx-auto rounded-xl shadow bg-white">
        <table className="w-auto">
          <caption className="text-left text-sm font-semibold mb-1 px-3 pt-3">
            {title}
          </caption>
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {cols.map((c) => (
                <th
                  key={c}
                  className={`text-left text-gray-900 font-semibold border-b border-gray-200 px-3 py-2 whitespace-nowrap ${
                    isNumericCol(c) ? "text-right" : ""
                  }`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((row, i) => (
              <tr key={i} className={i % 2 === 1 ? "bg-gray-50" : "bg-white"}>
                {cols.map((c) => (
                  <td
                    key={c}
                    className={`border-b border-gray-200 px-3 py-2 text-sm whitespace-nowrap ${
                      isNumericCol(c) ? "text-right tabular-nums" : ""
                    }`}
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

/* ---------------------------- page -------------------------------- */
export default function CupCheatSheets() {
  const SOURCE = "/data/nascar/cup/latest/cheatsheets.json";
  const { data, err, loading } = useJson(SOURCE);

  // Normalize -> [{ id, label, columns, rows }]
  const tables = useMemo(() => {
    const arr = Array.isArray(data?.tables) ? data.tables : [];
    return arr.map((t, i) => {
      const id =
        t.id ||
        (t.title ? t.title.toLowerCase().replace(/\s+/g, "_") : `table_${i}`);
      const label = t.label || t.title || `Table ${i + 1}`;
      const rows =
        Array.isArray(t.rows) ? t.rows : Array.isArray(t.data) ? t.data : [];
      const columns =
        Array.isArray(t.columns) && t.columns.length
          ? t.columns
          : rows.length
          ? Object.keys(rows[0])
          : [];
      return { id, label, columns, rows };
    });
  }, [data]);

  const [tableId, setTableId] = useState("");
  useEffect(() => {
    if (!tableId && tables.length) setTableId(tables[0].id);
  }, [tables, tableId]);

  const selected = useMemo(
    () => tables.find((t) => t.id === tableId),
    [tables, tableId]
  );

  return (
    <div className="px-5 py-6">
      <h1 className="text-3xl font-extrabold mb-2">NASCAR Cup — Cheat Sheets</h1>

      <div className="mb-3 flex items-center gap-3">
        <label className="text-sm font-medium">Choose a table:</label>
        <select
          value={tableId}
          onChange={(e) => setTableId(e.target.value)}
          className="border rounded-md px-3 py-2"
          style={{ color: "#111827", background: "#ffffff" }}
        >
          {tables.map((t) => (
            <option
              key={t.id}
              value={t.id}
              style={{ color: "#111827", background: "#ffffff" }}
            >
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="text-sm text-gray-600">Loading…</div>}
      {err && <div className="text-sm text-red-600">Failed to load: {String(err)}</div>}

      {!loading && !err && (!tables || tables.length === 0) && (
        <div className="text-sm text-gray-600">
          No tables found. Ensure{" "}
          <code>/public/data/nascar/cup/latest/cheatsheets.json</code> exists.
        </div>
      )}

      {!loading && !err && selected && (
        <SimpleTable
          title={selected.label}
          columns={selected.columns}
          rows={selected.rows}
        />
      )}
    </div>
  );

}
