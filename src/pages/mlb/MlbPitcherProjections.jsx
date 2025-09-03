// src/pages/mlb/PitcherProjections.jsx
import React, { useMemo, useState } from "react";

/**
 * DROP-IN USAGE
 * ---------------------------------------------------------
 * <PitcherProjections rows={yourDataArray} />
 *
 * Expected row shape (keys are case-sensitive):
 * {
 *   impTotal: number,        // implied runs against (e.g., 4.0)
 *   hand: "L" | "R",
 *   player: string,          // full name
 *   dkSal: number,           // DraftKings salary
 *   fdSal: number,           // FanDuel salary
 *   team: string,            // e.g., "SEA"
 *   opp: string,             // e.g., "TB"
 *   ip: number,
 *   er: number,
 *   k: number,
 *   hits: number,
 *   bb: number,
 *   hr: number,
 *   w: number,               // win probability (0–1 or 0–100)
 *   dkProj: number,
 *   dkVal: number,
 *   dkPOwn: number,          // DK projected ownership in %, use 0–100
 *   fdProj: number,
 *   fdVal: number,
 *   fdPOwn: number,          // FD projected ownership in %, use 0–100
 *   dkFloor: number,
 *   dkCeiling: number,
 *   fdFloor: number,
 *   fdCeiling: number,
 *   dkRtg: number,           // 0–100
 *   fdRtg: number            // 0–100
 * }
 *
 * If your win prob is 0–1, we'll auto-detect and convert to %.
 * Same for pOWN fields — pass either 0–1 or 0–100 and it will render correctly.
 */

const number = (v, d = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : Number(v).toFixed(d);

const whole = (v) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : Math.round(Number(v)).toLocaleString();

const money = (v) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : `$${Math.round(Number(v)).toLocaleString()}`;

const pct = (v, d = 1) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const n = Number(v);
  const asPct = n <= 1 ? n * 100 : n; // accept 0–1 or 0–100
  return `${asPct.toFixed(d)}%`;
};

// Sort utils
const compare = (a, b, key, dir) => {
  const va = a?.[key];
  const vb = b?.[key];
  const na = va === null || va === undefined ? Number.NEGATIVE_INFINITY : va;
  const nb = vb === null || vb === undefined ? Number.NEGATIVE_INFINITY : vb;

  if (typeof na === "string" || typeof nb === "string") {
    const sa = (va ?? "").toString().toLowerCase();
    const sb = (vb ?? "").toString().toLowerCase();
    if (sa < sb) return dir === "asc" ? -1 : 1;
    if (sa > sb) return dir === "asc" ? 1 : -1;
    return 0;
  }

  if (na < nb) return dir === "asc" ? -1 : 1;
  if (na > nb) return dir === "asc" ? 1 : -1;
  return 0;
};

const Th = ({ col, sortKey, sortDir, onSort }) => {
  const isActive = sortKey === col.key;
  return (
    <th
      onClick={() => onSort(col.key)}
      title={`Sort by ${col.label}`}
      style={{ cursor: "pointer", whiteSpace: "nowrap", position: "sticky", top: 0, background: "white", zIndex: 2 }}
      className="px-3 py-2 text-xs font-semibold text-slate-600 border-b"
    >
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span>{col.label}</span>
        <span style={{ opacity: isActive ? 1 : 0.25, fontSize: 12 }}>
          {isActive ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </div>
    </th>
  );
};

export default function PitcherProjections({ rows = [] }) {
  // columns definition
  const columns = useMemo(
    () => [
      { key: "impTotal", label: "Imp. Total", render: (r) => number(r.impTotal, 1) },
      { key: "hand", label: "H", render: (r) => (r.hand ?? "—") },
      { key: "player", label: "Player", render: (r) => r.player ?? "—" },
      { key: "dkSal", label: "DK Sal", render: (r) => money(r.dkSal) },
      { key: "fdSal", label: "FD Sal", render: (r) => money(r.fdSal) },
      { key: "team", label: "Team", render: (r) => r.team ?? "—" },
      { key: "opp", label: "Opp", render: (r) => r.opp ?? "—" },

      { key: "ip", label: "IP", render: (r) => number(r.ip, 2) },
      { key: "er", label: "ER", render: (r) => number(r.er, 2) },
      { key: "k", label: "K", render: (r) => number(r.k, 2) },
      { key: "hits", label: "H", render: (r) => number(r.hits, 2) },
      { key: "bb", label: "BB", render: (r) => number(r.bb, 2) },
      { key: "hr", label: "HR", render: (r) => number(r.hr, 2) },
      { key: "w", label: "W", render: (r) => pct(r.w, 1) },

      { key: "dkProj", label: "DK Proj", render: (r) => number(r.dkProj, 2) },
      { key: "dkVal", label: "DK Val", render: (r) => number(r.dkVal, 2) },
      { key: "dkPOwn", label: "DK pOWN%", render: (r) => pct(r.dkPOwn, 1) },

      { key: "fdProj", label: "FD Proj", render: (r) => number(r.fdProj, 2) },
      { key: "fdVal", label: "FD Val", render: (r) => number(r.fdVal, 2) },
      { key: "fdPOwn", label: "FD pOWN%", render: (r) => pct(r.fdPOwn, 1) },

      { key: "dkFloor", label: "DK Floor", render: (r) => number(r.dkFloor, 2) },
      { key: "dkCeiling", label: "DK Ceiling", render: (r) => number(r.dkCeiling, 2) },
      { key: "fdFloor", label: "FD Floor", render: (r) => number(r.fdFloor, 2) },
      { key: "fdCeiling", label: "FD Ceiling", render: (r) => number(r.fdCeiling, 2) },

      { key: "dkRtg", label: "DK Rtg", render: (r) => whole(r.dkRtg) },
      { key: "fdRtg", label: "FD Rtg", render: (r) => whole(r.fdRtg) },
    ],
    []
  );

  // sorting state
  const [sortKey, setSortKey] = useState("player");
  const [sortDir, setSortDir] = useState("asc"); // "asc" | "desc"

  const onSort = (key) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => compare(a, b, sortKey, sortDir));
    return copy;
  }, [rows, sortKey, sortDir]);

  // simple styles (tailwind-like classes added inline for easy drop-in anywhere)
  const wrapperStyle = {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    overflow: "hidden",
    background: "white",
  };

  const tableStyle = {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    fontSize: 13.5,
  };

  const headerStripe = {
    position: "sticky",
    top: 0,
    background: "white",
    boxShadow: "inset 0 -1px 0 #e5e7eb",
  };

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>MLB — Pitcher Projections</h1>

      <div style={wrapperStyle}>
        <div style={{ overflow: "auto", maxHeight: "78vh" }}>
          <table style={tableStyle}>
            <thead style={headerStripe}>
              <tr>
                {columns.map((col) => (
                  <Th
                    key={col.key}
                    col={col}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr
                  key={`${r.player}-${i}`}
                  style={{
                    background: i % 2 === 0 ? "#fff" : "#fafafa",
                    borderBottom: "1px solid #f1f5f9",
                  }}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-2 text-sm text-slate-800 whitespace-nowrap border-b">
                      {col.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={columns.length} style={{ padding: 16, color: "#64748b" }}>
                    No data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tiny legend for % fields (optional) */}
      <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
        <span style={{ marginRight: 12 }}>W = Win Probability</span>
        <span style={{ marginRight: 12 }}>pOWN% = Projected Ownership</span>
      </div>
    </div>
  );
}
