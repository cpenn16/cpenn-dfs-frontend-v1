// src/pages/nfl/NflCheatSheets.jsx
import React, { useEffect, useMemo, useState } from "react";

const SOURCE = "/data/nfl/classic/latest/cheatsheets.json";
const teamLogo = (abbr) => (abbr ? `/logos/nfl/${String(abbr).toUpperCase()}.png` : "");

/* ---------- fetch ---------- */
function useCheatSheets(url) {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const r = await fetch(`${url}?_=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const arr = Array.isArray(j) ? j : j?.tables || [];
        if (alive) setTables(arr);
      } catch (e) {
        if (alive) setErr(String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [url]);

  return { tables, loading, err };
}

/* ---------- helpers ---------- */
const fmt = {
  smart(v) {
    if (v === null || v === undefined) return "";
    const n = Number(String(v).replace(/[, ]/g, ""));
    if (!Number.isFinite(n)) return String(v);
    return Number.isInteger(n) ? String(n) : String(n.toFixed(1)).replace(/\.0$/, "");
  },
};

// "Top 10 All DK Proj" -> "DK Proj"
function metricFromLabel(label) {
  const s = String(label || "").trim();
  const m = s.match(/top\s*\d+\s*all\s*(.*)$/i);
  if (m && m[1]) return m[1].trim();
  return "Value";
}

// Normalize display labels to always be [Player, Team, Metric]
function normalizeColumns(rawCols, label) {
  let cols = Array.isArray(rawCols) ? rawCols.map((c) => (c == null ? "" : String(c))) : [];
  const metric = metricFromLabel(label);
  if (cols.length < 3) return ["Player", "Team", metric];

  if (!cols[0] || /^top\s*\d+/i.test(cols[0])) cols[0] = "Player";
  if (!cols[1]) cols[1] = "Team";
  if (!cols[2]) cols[2] = metric;

  return cols.slice(0, 3);
}

/* ---------- page ---------- */
export default function NflCheatSheets() {
  const { tables, loading, err } = useCheatSheets(SOURCE);
  const [selId, setSelId] = useState("");

  const options = useMemo(
    () => tables.map((t) => ({ id: t.id, label: t.label })),
    [tables]
  );

  useEffect(() => {
    if (!selId && options.length) setSelId(options[0].id);
  }, [options, selId]);

  const table = useMemo(() => tables.find((t) => t.id === selId) || null, [tables, selId]);

  const visibleCols = useMemo(() => {
    if (!table) return [];
    return normalizeColumns(table.columns, table.label);
  }, [table]);

  // Use original column keys when reading row data, but show normalized labels
  const sourceKeys = useMemo(() => {
    if (!table) return [];
    const raw = Array.isArray(table.columns)
      ? table.columns.map((c) => (c == null ? "" : String(c)))
      : [];
    const vis = normalizeColumns(raw, table.label);
    return vis.map((_, i) => raw[i] || vis[i]);
  }, [table]);

  return (
    <div className="px-4 md:px-6 py-6">
      <div className="max-w-[860px] mx-auto">
        <h1 className="text-3xl font-extrabold mb-4">NFL — Cheat Sheets</h1>

        <div className="mb-3 flex items-center gap-3">
          <label className="text-sm font-medium">Choose a table:</label>
          <select
            className="h-8 rounded-md border border-gray-300 px-2 text-sm focus:ring-2 focus:ring-indigo-500"
            value={selId}
            onChange={(e) => setSelId(e.target.value)}
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading…</div>
          ) : err ? (
            <div className="p-8 text-center text-red-600">Error: {err}</div>
          ) : !table ? (
            <div className="p-8 text-center text-gray-500">
              No data. Make sure the exporter wrote <code>{SOURCE}</code>.
            </div>
          ) : (
            <>
              <div className="px-4 py-2 border-b bg-gray-50 font-semibold text-sm">
                {table.label}
              </div>
              <div className="overflow-x-auto">
                {/* compact styles: smaller text, tighter padding, tighter line-height */}
                <table className="min-w-full text-[12.5px] leading-tight">
                  <thead className="bg-gray-50">
                    <tr>
                      {visibleCols.map((label, i) => (
                        <th
                          key={i}
                          className="px-2.5 py-1.5 text-left font-semibold text-gray-700"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, i) => (
                      <tr
                        key={i}
                        className={
                          i % 2 ? "bg-gray-50/60" : "bg-white"
                        }
                      >
                        {sourceKeys.map((key, j) => {
                          const label = visibleCols[j] || "";
                          // Special render for the Team column: logo + abbr
                          if (label === "Team") {
                            const abbr = String(row[key] ?? "").toUpperCase();
                            const src = teamLogo(abbr);
                            return (
                              <td key={j} className="px-2.5 py-1.5">
                                <div className="flex items-center gap-2">
                                  {abbr && (
                                    <img
                                      src={src}
                                      alt={abbr}
                                      className="h-4 w-4 object-contain"
                                      loading="lazy"
                                      onError={(e) => {
                                        // hide broken logos gracefully
                                        e.currentTarget.style.display = "none";
                                      }}
                                    />
                                  )}
                                  <span className="tabular-nums">{abbr}</span>
                                </div>
                              </td>
                            );
                          }
                          // Default cell
                          return (
                            <td key={j} className="px-2.5 py-1.5">
                              {fmt.smart(row[key])}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
