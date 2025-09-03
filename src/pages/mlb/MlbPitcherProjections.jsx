// src/pages/mlb/PitcherProjectionsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import PitcherProjections from "./PitcherProjections";

// 1) Point this at your exporter URL or file.
//    You can override with an env var: VITE_MLB_PITCHERS_URL
const DATA_URL =
  import.meta.env?.VITE_MLB_PITCHERS_URL ||
  "/data/mlb_pitcher_projections.json"; // <- adjust if needed

// 2) Small helpers to read values even if your keys vary between exports
const pick = (obj, keys) => {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return undefined;
};

// auto %: accept 0–1 or 0–100
const toPct = (v) => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (Number.isNaN(n)) return undefined;
  return n <= 1 ? n * 100 : n;
};
const toNum = (v) => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
};

// 3) Adapter that maps MANY possible input names -> component keys
function adaptRow(r) {
  return {
    impTotal: toNum(pick(r, ["Imp. Total", "ImpTotal", "imp_total", "impTotal", "ImpliedTotal"])),
    hand: pick(r, ["H", "Hand", "handedness", "BatsThrows", "hand"]),
    player: pick(r, ["Player", "Pitcher", "Name", "player"]),
    dkSal: toNum(pick(r, ["DK Sal", "DK_Sal", "DKSal", "dk_salary", "dkSal"])),
    fdSal: toNum(pick(r, ["FD Sal", "FD_Sal", "FDSal", "fd_salary", "fdSal"])),
    team: pick(r, ["Team", "Tm", "team"]),
    opp: pick(r, ["Opp", "Opponent", "opp"]),
    ip: toNum(pick(r, ["IP", "ip_proj", "ip"])),
    er: toNum(pick(r, ["ER", "er_proj", "er"])),
    k: toNum(pick(r, ["K", "SO", "k_proj", "k"])),
    hits: toNum(pick(r, ["Hits", "HitsAllowed", "H_allowed", "H_allwd", "H_Allowed", "hits"])),
    bb: toNum(pick(r, ["BB", "Walks", "walks", "bb"])),
    hr: toNum(pick(r, ["HR", "HomeRunsAllowed", "hr"])),
    w: toPct(pick(r, ["W", "Win", "WinProb", "win_prob", "w"])),

    dkProj: toNum(pick(r, ["DK Proj", "DK_Proj", "DKProj", "dk_points", "dkProj"])),
    dkVal: toNum(pick(r, ["DK Val", "DK_Val", "DKVal", "dk_val", "dkVal"])),
    dkPOwn: toPct(pick(r, ["DK pOWN%", "DK_pOWN", "DKpOWN", "dk_pown", "dkPOwn"])),

    fdProj: toNum(pick(r, ["FD Proj", "FD_Proj", "FDProj", "fd_points", "fdProj"])),
    fdVal: toNum(pick(r, ["FD Val", "FD_Val", "FDVal", "fd_val", "fdVal"])),
    fdPOwn: toPct(pick(r, ["FD pOWN%", "FD_pOWN", "FDpOWN", "fd_pown", "fdPOwn"])),

    dkFloor: toNum(pick(r, ["DK Floor", "DK_Floor", "dk_floor", "dkFloor"])),
    dkCeiling: toNum(pick(r, ["DK Ceiling", "DK_Ceiling", "dk_ceiling", "dkCeiling"])),
    fdFloor: toNum(pick(r, ["FD Floor", "FD_Floor", "fd_floor", "fdFloor"])),
    fdCeiling: toNum(pick(r, ["FD Ceiling", "FD_Ceiling", "fd_ceiling", "fdCeiling"])),

    dkRtg: toNum(pick(r, ["DK Rtg", "DK_Rtg", "DKRating", "dk_rating", "dkRtg"])),
    fdRtg: toNum(pick(r, ["FD Rtg", "FD_Rtg", "FDRating", "fd_rating", "fdRtg"]))
  };
}

export default function PitcherProjectionsPage() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const res = await fetch(DATA_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const raw = await res.json();

        // Accept either an array or an object with a data/items property
        const list = Array.isArray(raw) ? raw : raw?.data || raw?.items || [];
        const adapted = list.map(adaptRow).filter((r) => r.player); // require player
        if (mounted) setRows(adapted);
      } catch (e) {
        if (mounted) setErr(e.message || String(e));
        console.error("PitcherProjections fetch error:", e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="px-4 py-4">
      {err && (
        <div style={{ marginBottom: 12, color: "#b91c1c", fontWeight: 600 }}>
          Data load error: {err}
        </div>
      )}
      <PitcherProjections rows={rows} />
    </div>
  );
}
