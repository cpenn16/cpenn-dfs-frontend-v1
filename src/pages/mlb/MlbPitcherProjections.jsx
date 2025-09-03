// src/pages/mlb/MlbProjections.jsx
import React, { useEffect, useMemo, useState } from "react";

/* =========================
   Config
   ========================= */
const DATA_URL =
  import.meta.env?.VITE_MLB_PITCHERS_URL ||
  "/data/mlb_pitcher_projections.json"; // change to your exporter path if needed

/* =========================
   Small helpers
   ========================= */
const pick = (obj, keys) => {
  for (const k of keys) if (obj?.[k] !== undefined && obj?.[k] !== null && obj?.[k] !== "") return obj[k];
  return undefined;
};
const toNum = (v) => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
};
const toPct = (v) => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (Number.isNaN(n)) return undefined;
  return n <= 1 ? n * 100 : n; // accept 0–1 or 0–100
};
const fmtNum = (v, d = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : Number(v).toFixed(d);
const fmtWhole = (v) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : Math.round(Number(v)).toLocaleString();
const fmtMoney = (v) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : `$${Math.round(Number(v)).toLocaleString()}`;
const fmtPct = (v, d = 1) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(Number(v)).toFixed(d)}%`;
};

/* =========================
   Adapter: map MANY possible input keys -> our keys
   ========================= */
function adaptRow(r) {
  return {
    impTotal: toNum(pick(r, ["Imp. Total","ImpTotal","imp_total","impTotal","ImpliedTotal"])),
    hand: pick(r, ["H","Hand","handedness","BatsThrows","hand"]),
    player: pick(r, ["Player","Pitcher","Name","player"]),
    dkSal: toNum(pick(r, ["DK Sal","DK_Sal","DKSal","dk_salary","dkSal"])),
    fdSal: toNum(pick(r, ["FD Sal","FD_Sal","FDSal","fd_salary","fdSal"])),
    team: pick(r, ["Team","Tm","team"]),
    opp: pick(r, ["Opp","Opponent","opp"]),
    ip: toNum(pick(r, ["IP","ip_proj","ip"])),
    er: toNum(pick(r, ["ER","er_proj","er"])),
    k: toNum(pick(r, ["K","SO","k_proj","k"])),
    hits: toNum(pick(r, ["Hits","HitsAllowed","H_allowed","H_allwd","H_Allowed","hits"])),
    bb: toNum(pick(r, ["BB","Walks","walks","bb"])),
    hr: toNum(pick(r, ["HR","HomeRunsAllowed","hr"])),
    w: toPct(pick(r, ["W","Win","WinProb","win_prob","w"])),

    dkProj: toNum(pick(r, ["DK Proj","DK_Proj","DKProj","dk_points","dkProj"])),
    dkVal: toNum(pick(r, ["DK Val","DK_Val","DKVal","dk_val","dkVal"])),
    dkPOwn: toPct(pick(r, ["DK pOWN%","DK_pOWN","DKpOWN","dk_pown","dkPOwn"])),

    fdProj: toNum(pick(r, ["FD Proj","FD_Proj","FDProj","fd_points","fdProj"])),
    fdVal: toNum(pick(r, ["FD Val","FD_Val","FDVal","fd_val","fdVal"])),
    fdPOwn: toPct(pick(r, ["FD pOWN%","FD_pOWN","FDpOWN","fd_pown","fdPOwn"])),

    dkFloor: toNum(pick(r, ["DK Floor","DK_Floor","dk_floor","dkFloor"])),
    dkCeiling: toNum(pick(r, ["DK Ceiling","DK_Ceiling","dk_ceiling","dkCeiling"])),
    fdFloor: toNum(pick(r, ["FD Floor","FD_Floor","fd_floor","fdFloor"])),
    fdCeiling: toNum(pick(r, ["FD Ceiling","FD_Ceiling","fd_ceiling","fdCeiling"])),

    dkRtg: toNum(pick(r, ["DK Rtg","DK_Rtg","DKRating","dk_rating","dkRtg"])),
    fdRtg: toNum(pick(r, ["FD Rtg","FD_Rtg","FDRating","fd_rating","fdRtg"])),
  };
}

/* =========================
   Sorting
   ========================= */
const compare = (a, b, key, dir) => {
  const va = a?.[key]; const vb = b?.[key];
  const na = va ?? Number.NEGATIVE_INFINITY;
  const nb = vb ?? Number.NEGATIVE_INFINITY;
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

/* =========================
   Table header cell
   ========================= */
const Th = ({ col, sortKey, sortDir, onSort }) => {
  const active = sortKey === col.key;
  return (
    <th
      onClick={() => onSort(col.key)}
      style={{ cursor: "pointer", whiteSpace: "nowrap", position: "sticky", top: 0, background: "white", zIndex: 2 }}
      className="px-3 py-2 text-xs font-semibold text-slate-600 border-b"
      title={`Sort by ${col.label}`}
    >
      <span>{col.label}</span>{" "}
      <span style={{ opacity: active ? 1 : 0.25, fontSize: 12 }}>
        {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </th>
  );
};

/* =========================
   The page
   ========================= */
export default function MlbProjections() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  // fetch + normalize
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(DATA_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const raw = await res.json();
        const list = Array.isArray(raw) ? raw : raw?.data || raw?.items || [];
        const adapted = list.map(adaptRow).filter(r => r.player);
        if (mounted) setRows(adapted);
      } catch (e) {
        if (mounted) setErr(e.message || String(e));
        console.error("MLB pitcher projections load error:", e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // columns
  const cols = useMemo(() => [
    { key: "impTotal", label: "Imp. Total", render: r => fmtNum(r.impTotal, 1) },
    { key: "hand", label: "H", render: r => r.hand ?? "—" },
    { key: "player", label: "Player", render: r => r.player ?? "—" },
    { key: "dkSal", label: "DK Sal", render: r => fmtMoney(r.dkSal) },
    { key: "fdSal", label: "FD Sal", render: r => fmtMoney(r.fdSal) },
    { key: "team", label: "Team", render: r => r.team ?? "—" },
    { key: "opp", label: "Opp", render: r => r.opp ?? "—" },
    { key: "ip", label: "IP", render: r => fmtNum(r.ip, 2) },
    { key: "er", label: "ER", render: r => fmtNum(r.er, 2) },
    { key: "k", label: "K", render: r => fmtNum(r.k, 2) },
    { key: "hits", label: "H", render: r => fmtNum(r.hits, 2) },
    { key: "bb", label: "BB", render: r => fmtNum(r.bb, 2) },
    { key: "hr", label: "HR", render: r => fmtNum(r.hr, 2) },
    { key: "w", label: "W", render: r => fmtPct(r.w, 1) },
    { key: "dkProj", label: "DK Proj", render: r => fmtNum(r.dkProj, 2) },
    { key: "dkVal", label: "DK Val", render: r => fmtNum(r.dkVal, 2) },
    { key: "dkPOwn", label: "DK pOWN%", render: r => fmtPct(r.dkPOwn, 1) },
    { key: "fdProj", label: "FD Proj", render: r => fmtNum(r.fdProj, 2) },
    { key: "fdVal", label: "FD Val", render: r => fmtNum(r.fdVal, 2) },
    { key: "fdPOwn", label: "FD pOWN%", render: r => fmtPct(r.fdPOwn, 1) },
    { key: "dkFloor", label: "DK Floor", render: r => fmtNum(r.dkFloor, 2) },
    { key: "dkCeiling", label: "DK Ceiling", render: r => fmtNum(r.dkCeiling, 2) },
    { key: "fdFloor", label: "FD Floor", render: r => fmtNum(r.fdFloor, 2) },
    { key: "fdCeiling", label: "FD Ceiling", render: r => fmtNum(r.fdCeiling, 2) },
    { key: "dkRtg", label: "DK Rtg", render: r => fmtWhole(r.dkRtg) },
    { key: "fdRtg", label: "FD Rtg", render: r => fmtWhole(r.fdRtg) },
  ], []);

  // sorting
  const [sortKey, setSortKey] = useState("player");
  const [sortDir, setSortDir] = useState("asc");
  const onSort = (k) => (k === sortKey ? setSortDir(d => d === "asc" ? "desc" : "asc") : (setSortKey(k), setSortDir("asc")));

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => compare(a, b, sortKey, sortDir));
    return copy;
  }, [rows, sortKey, sortDir]);

  return (
    <div className="px-4 py-4">
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>MLB — Pitcher Projections</h1>

      {err && (
        <div style={{ marginBottom: 12, color: "#b91c1c", fontWeight: 600 }}>
          Data load error: {err}
        </div>
      )}

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", background: "white" }}>
        <div style={{ overflow: "auto", maxHeight: "78vh" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13.5 }}>
            <thead style={{ position: "sticky", top: 0, background: "white", boxShadow: "inset 0 -1px 0 #e5e7eb" }}>
              <tr>
                {cols.map(c => (
                  <Th key={c.key} col={c} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={cols.length} style={{ padding: 16, color: "#64748b" }}>No data.</td>
                </tr>
              ) : (
                sorted.map((r, i) => (
                  <tr key={`${r.player}-${i}`} style={{ background: i % 2 ? "#fafafa" : "#fff", borderBottom: "1px solid #f1f5f9" }}>
                    {cols.map(c => (
                      <td key={c.key} className="px-3 py-2 text-sm text-slate-800 whitespace-nowrap border-b">
                        {c.render(r)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
        <span style={{ marginRight: 12 }}>W = Win Probability</span>
        <span>pOWN% = Projected Ownership</span>
      </div>
    </div>
  );
}
