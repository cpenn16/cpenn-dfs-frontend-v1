// src/pages/nascar/XfCheatSheets.jsx
import React, { useEffect, useMemo, useState } from "react";

/* ------------------------------------------------------------------ */
/* Data fetch helper                                                   */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/* Utils                                                               */
/* ------------------------------------------------------------------ */
const isNumericCol = (c) =>
  /(^qual$|^value$|sal$|rank$|pts?$|proj|avg|score|own%?$|%$|^\d+$)/i.test(
    String(c).trim()
  );

/* ------------------------------------------------------------------ */
/* Compact table (no export, no extras)                                */
/* ------------------------------------------------------------------ */
function CompactTable({ title, rows }) {
  const columns = useMemo(() => {
    if (Array.isArray(rows) && rows.length) return Object.keys(rows[0]);
    return [];
  }, [rows]);

  return (
    <div className="mt-3 max-w-3xl mx-auto"> {/* centered & capped width */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                {columns.map((c) => (
                  <th
                    key={c}
                    className={[
                      "px-4 py-2 text-gray-900 font-semibold border-b text-xs",
                      isNumericCol(c) ? "text-right" : "text-left",
                    ].join(" ")}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={i % 2 ? "bg-white" : "bg-gray-50/50"}>
                  {columns.map((c) => (
                    <td
                      key={c}
                      className={[
                        "px-4 py-2 border-b",
                        isNumericCol(c) ? "text-right tabular-nums" : "text-left",
                      ].join(" ")}
                    >
                      {row?.[c] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td
                    className="px-4 py-3 text-gray-500 border-b"
                    colSpan={columns.length || 1}
                  >
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

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function XfCheatSheets() {
  const BASE = import.meta?.env?.BASE_URL ?? "/";
  const SOURCE = `${BASE}data/nascar/xfinity/latest/cheatsheets.json`;
  const { data, err, loading } = useJson(SOURCE);

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

  const [tableId, setTableId] = useState("");
  useEffect(() => {
    if (!tableId && tables.length) setTableId(tables[0].id);
  }, [tables, tableId]);

  const selected = useMemo(
    () => tables.find((t) => t.id === tableId),
    [tables, tableId]
  );

  return (
    <div className="px-5 py-6 max-w-4xl mx-auto"> {/* center whole section */}
      <h1 className="text-2xl sm:text-3xl font-extrabold mb-4 text-center">
        NASCAR Xfinity — Cheat Sheets
      </h1>

      {/* Control row */}
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
          No tables found. Ensure{" "}
          <code>{`${BASE}data/nascar/xfinity/latest/cheatsheets.json`}</code>{" "}
          exists.
        </div>
      )}

      {!loading && !err && selected && (
        <CompactTable title={selected.label} rows={selected.rows || []} />
      )}
    </div>
  );
}
