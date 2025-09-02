// src/pages/nfl/NFLShowdownOptimizer.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import API_BASE from "../../utils/api";

/* ----------------------- small utils ----------------------- */
const clamp = (v, lo = 0, hi = 1e9) => Math.max(lo, Math.min(hi, v));
const num = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/\$/g, "").replace(/[,  \s]/g, "").replace(/%/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const pct = (v) => {
  if (v == null) return 0;
  const s = String(v).replace(/[%\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n / 100 : 0;
};
const fmt0 = (n) => (Number.isFinite(n) ? n.toLocaleString() : "—");
const fmt1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : "—");
const escapeCSV = (s) => {
  const v = String(s ?? "");
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

/* ---------------------- data loaders ----------------------- */
function useJson(url) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        const j = ct.includes("application/json") ? await res.json() : JSON.parse(await res.text());
        if (alive) { setData(j); setErr(null); }
      } catch (e) { if (alive) { setData(null); setErr(e); } }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [url]);
  return { data, err, loading };
}

/* ---------------------- constants -------------------------- */
const SOURCE = "/data/nfl/showdown/latest/projections.json";
const SITE_IDS_SOURCE = "/data/nfl/showdown/latest/site_ids.json";

// we’ll use a single internal “cap pos” to gate the dedicated slot
const CAP_POS = "CPT_POS"; // internal only; not shown in UI

const SITES = {
  dk: {
    key: "dk",
    label: "DraftKings",
    cap: 50000,
    capLabel: "CPT",
    // 1 CPT + 5 FLEX
    slots: [
      { name: "CPT", eligible: [CAP_POS] },
      { name: "FLEX1", eligible: ["QB","RB","WR","TE","DST","K"] },
      { name: "FLEX2", eligible: ["QB","RB","WR","TE","DST","K"] },
      { name: "FLEX3", eligible: ["QB","RB","WR","TE","DST","K"] },
      { name: "FLEX4", eligible: ["QB","RB","WR","TE","DST","K"] },
      { name: "FLEX5", eligible: ["QB","RB","WR","TE","DST","K"] },
    ],
    logo: "/logos/dk.png",
  },
  fd: {
    key: "fd",
    label: "FanDuel",
    cap: 60000,
    capLabel: "MVP",
    // per your note: FD updated to match DK style (no STAR/PRO),
    // so 1 MVP + 4 FLEX
    slots: [
      { name: "MVP", eligible: [CAP_POS] },
      { name: "FLEX1", eligible: ["QB","RB","WR","TE","DST","K"] },
      { name: "FLEX2", eligible: ["QB","RB","WR","TE","DST","K"] },
      { name: "FLEX3", eligible: ["QB","RB","WR","TE","DST","K"] },
      { name: "FLEX4", eligible: ["QB","RB","WR","TE","DST","K"] },
    ],
    logo: "/logos/fd.png",
  },
};

/* ------------------ team chip helpers (optional) ------------- */
const TEAM_COLORS = {
  ARI: "#97233F", ATL: "#A71930", BAL: "#241773", BUF: "#00338D", CAR: "#0085CA",
  CHI: "#0B162A", CIN: "#FB4F14", CLE: "#311D00", DAL: "#041E42", DEN: "#FB4F14",
  DET: "#0076B6", GB: "#203731", HOU: "#03202F", IND: "#002C5F", JAX: "#006778",
  KC: "#E31837", LAC: "#0080C6", LAR: "#003594", LV: "#000000", MIA: "#008E97",
  MIN: "#4F2683", NE: "#002244", NO: "#D3BC8D", NYG: "#0B2265", NYJ: "#125740",
  PHI: "#004C54", PIT: "#FFB612", SEA: "#002244", SF: "#AA0000", TB: "#D50A0A",
  TEN: "#0C2340", WAS: "#5A1414",
};
const readableText = (hex) => {
  const h = (hex || "#888").replace("#", "");
  const v = parseInt(h, 16);
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  const L = 0.2126*r + 0.7152*g + 0.0722*b;
  return L < 140 ? "#FFFFFF" : "#111111";
};
const TeamPill = ({ abbr }) => {
  const bg = TEAM_COLORS[abbr] || "#E5E7EB";
  const fg = readableText(bg);
  return <span className="px-2 py-0.5 rounded" style={{ background: bg, color: fg }}>{abbr || "—"}</span>;
};

/* --------------------- API (SSE) ---------------------- */
async function solveStreamNFL(payload, onItem, onDone) {
  const res = await fetch(`${API_BASE}/solve_nfl_stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok || !res.body) throw new Error("Stream failed to start");
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const chunk of parts) {
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const evt = JSON.parse(line.slice(6));
      if (evt.done) onDone?.(evt);
      else onItem?.(evt);
    }
  }
}

/* =============== page ================= */
export default function NFLShowdownOptimizer() {
  const [site, setSite] = useState("dk"); // dk | fd
  const cfg = SITES[site];

  const { data, err, loading } = useJson(SOURCE);
  const { data: siteIds } = useJson(SITE_IDS_SOURCE);

  // controls
  const [numLineups, setNumLineups] = useState(20);
  const [maxSalary, setMaxSalary] = useState(cfg.cap);
  const [maxOverlap, setMaxOverlap] = useState(5); // “how many players 2 lineups can share”
  useEffect(() => setMaxSalary(SITES[site].cap), [site]);

  // rules (global + team override)
  // each rule: { ifTag: "CPT"|"FLEX", ifPos: Set(...), thenN: 1, thenTag: "FLEX"|"CPT",
  //              thenPos: Set(...), scope: "same"|"opp"|"any", team: "" (optional override) }
  const [rules, setRules] = useState([
    { ifTag: "CPT", ifPos: new Set(["QB"]), thenN: 1, thenTag: "FLEX", thenPos: new Set(["WR","TE","RB"]), scope: "same", team: "" },
  ]);

  // rows (CPT/MVP + FLEX)
  const rows = useMemo(() => {
    if (!data) return [];
    const arr = Array.isArray(data?.rows)
      ? data.rows
      : Array.isArray(data?.players)
      ? data.players
      : Array.isArray(data)
      ? data
      : [];

    // normalize one row per player
    const base = arr.map((r) => {
      const name = r.player ?? r.Player ?? r.Name ?? r.playerName ?? r.name ?? "";
      const pos  = String(r.pos ?? r.Pos ?? r.position ?? "").toUpperCase();
      const team = r.team ?? r.Team ?? r.team_abbr ?? "";
      const opp  = r.opp ?? r.Opp ?? r.opponent ?? "";
      const time = r.time ?? r["Time ET"] ?? r.Start ?? "";

      // DK & FD special showdown keys (present in your feed screenshot)
      return {
        name, pos, team, opp, time,
        // base projections (we’ll still 1.5x for CPT/MVP if needed)
        baseProj:  num(r.dk_proj ?? r.fd_proj ?? r.Projection ?? r.proj),
        baseFloor: num(r.dk_floor ?? r.fd_floor ?? r.Floor ?? r.floor),
        baseCeil:  num(r.dk_ceil  ?? r.fd_ceil  ?? r.Ceiling ?? r.ceil),

        dkFlexSal: num(r["DK Flex Sal"] ?? r.dk_flex_sal),
        dkCptSal:  num(r["DK CPT Sal"]  ?? r.dk_cpt_sal),
        dkFlexId:  String(r.dk_flex_id ?? r["DK Flex ID"] ?? ""),
        dkCptId:   String(r.dk_cpt_id  ?? r["DK CPT ID"]  ?? ""),
        dkFlexP:   pct(r["dk_flex_pown%"] ?? r.dk_flex_pown),
        dkCptP:    pct(r["dk_cpt_pown%"]  ?? r.dk_cpt_pown),
        dkFlexO:   pct(r["dk_flex_opt%"]  ?? r.dk_flex_opt),
        dkCptO:    pct(r["dk_cpt_opt%"]   ?? r.dk_cpt_opt),

        fdFlexSal: num(r["FD Flex Sal"] ?? r.fd_flex_sal),
        fdMvpSal:  num(r["FD MVP Sal"]  ?? r.fd_mvp_sal),
        fdFlexId:  String(r.fd_flex_id ?? r["FD Flex ID"] ?? ""),
        fdMvpId:   String(r.fd_mvp_id  ?? r["FD MVP ID"]  ?? ""),
        fdFlexP:   pct(r["fd_flex_pown%"] ?? r.fd_flex_pown),
        fdMvpP:    pct(r["fd_mvp_pown%"]  ?? r.fd_mvp_pown),
        fdFlexO:   pct(r["fd_flex_opt%"]  ?? r.fd_flex_opt),
        fdMvpO:    pct(r["fd_mvp_opt%"]   ?? r.fd_mvp_opt),
      };
    });

    const isDK = site === "dk";
    const capLabel = cfg.capLabel; // "CPT" | "MVP"
    const out = [];

    for (const b of base) {
      if (isDK) {
        // CAPTAIN (1.5x proj, 1.5x salary — but feed already has CPT sal)
        out.push({
          uid: b.dkCptId,
          tag: capLabel, isCaptain: true,
          name: `${b.name} (${capLabel})`,
          displayName: b.name,
          pos: CAP_POS, // internal gating
          dispPos: `${capLabel} • ${b.pos}`,
          team: b.team, opp: b.opp, time: b.time,
          salary: b.dkCptSal || Math.round((b.dkFlexSal || 0) * 1.5),
          proj: (b.baseProj || 0) * 1.5,
          floor: (b.baseFloor || 0) * 1.5,
          ceil: (b.baseCeil || 0) * 1.5,
          pown: b.dkCptP ?? 0,
          opt:  b.dkCptO ?? 0,
          baseName: b.name,
          basePos: b.pos,
        });
        // FLEX
        out.push({
          uid: b.dkFlexId,
          tag: "FLEX", isCaptain: false,
          name: b.name,
          displayName: b.name,
          pos: b.pos,  // normal pos for flex eligibility
          dispPos: b.pos,
          team: b.team, opp: b.opp, time: b.time,
          salary: b.dkFlexSal,
          proj: b.baseProj, floor: b.baseFloor, ceil: b.baseCeil,
          pown: b.dkFlexP ?? 0,
          opt:  b.dkFlexO ?? 0,
          baseName: b.name,
          basePos: b.pos,
        });
      } else {
        // FD MVP (feed provides MVP salary; projections 1.5x)
        out.push({
          uid: b.fdMvpId,
          tag: capLabel, isCaptain: true,
          name: `${b.name} (${capLabel})`,
          displayName: b.name,
          pos: CAP_POS,
          dispPos: `${capLabel} • ${b.pos}`,
          team: b.team, opp: b.opp, time: b.time,
          salary: b.fdMvpSal || Math.round((b.fdFlexSal || 0) * 1.5),
          proj: (b.baseProj || 0) * 1.5,
          floor: (b.baseFloor || 0) * 1.5,
          ceil: (b.baseCeil || 0) * 1.5,
          pown: b.fdMvpP ?? 0,
          opt:  b.fdMvpO ?? 0,
          baseName: b.name,
          basePos: b.pos,
        });
        // FLEX
        out.push({
          uid: b.fdFlexId,
          tag: "FLEX", isCaptain: false,
          name: b.name,
          displayName: b.name,
          pos: b.pos,
          dispPos: b.pos,
          team: b.team, opp: b.opp, time: b.time,
          salary: b.fdFlexSal,
          proj: b.baseProj, floor: b.baseFloor, ceil: b.baseCeil,
          pown: b.fdFlexP ?? 0,
          opt:  b.fdFlexO ?? 0,
          baseName: b.name,
          basePos: b.pos,
        });
      }
    }

    // drop empties / 0 salary
    return out.filter(r => r.name && r.pos && Number.isFinite(r.salary) && r.salary > 0);
  }, [data, site, cfg.capLabel]);

  // quick maps
  const byName = useMemo(() => new Map(rows.map(r => [r.name, r])), [rows]);
  const allTeams = useMemo(() => {
    const s = new Set();
    for (const r of rows) { if (r.team) s.add(r.team); if (r.opp) s.add(r.opp); }
    return [...s].sort();
  }, [rows]);

  /* -------------------- optimizing ------------------------ */
  const [lineups, setLineups] = useState([]);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressTimer = useRef(null);

  // IF/THEN evaluation on a built lineup (client-side filter)
  function satisfiesRules(names) {
    const chosen = names.map(n => byName.get(n)).filter(Boolean);
    const chosenByTag = (tag) => chosen.filter(p => (tag === cfg.capLabel ? p.isCaptain : !p.isCaptain));
    const hasIF = (rule) => {
      const tagCheck = rule.ifTag === cfg.capLabel ? (p) => p.isCaptain : (p) => !p.isCaptain;
      return chosen.some(p => tagCheck(p) && rule.ifPos.has(p.basePos));
    };
    const countTHEN = (rule) => {
      // which pool to count from — CPT/MVP or FLEX?
      const pool = rule.thenTag === cfg.capLabel ? chosenByTag(cfg.capLabel) : chosenByTag("FLEX");
      // scope: same team with IF anchor, opponent, or any
      if (rule.scope === "any") {
        return pool.filter(p => rule.thenPos.has(p.basePos)).length;
      }
      // get all IF anchors to determine teams/opp
      const anchors = chosen.filter(p => (rule.ifTag === cfg.capLabel ? p.isCaptain : !p.isCaptain) && rule.ifPos.has(p.basePos));
      if (!anchors.length) return 0;

      let total = 0;
      for (const a of anchors) {
        if (rule.scope === "same") {
          total = Math.max(total, pool.filter(p => p.team === a.team && rule.thenPos.has(p.basePos)).length);
        } else if (rule.scope === "opp") {
          total = Math.max(total, pool.filter(p => p.team === a.opp && rule.thenPos.has(p.basePos)).length);
        }
      }
      return total;
    };

    // optional team override: if rule.team is set, only trigger when the IF anchor's team == rule.team
    for (const r of rules) {
      if (!hasIF(r)) continue;
      if (r.team) {
        const anchors = chosen.filter(p => (r.ifTag === cfg.capLabel ? p.isCaptain : !p.isCaptain) && r.ifPos.has(p.basePos));
        if (anchors.every(a => a.team !== r.team)) continue; // ignore if team doesn't match
      }
      if (countTHEN(r) < (Number(r.thenN) || 0)) return false;
    }
    return true;
  }

  // create groups to prevent (Player CPT) + (Player FLEX) duplicates
  const noDupGroups = useMemo(() => {
    // group by baseName
    const m = new Map();
    for (const r of rows) {
      const k = r.baseName || r.displayName || r.name.replace(/\s+\((CPT|MVP)\)$/i, "");
      const list = m.get(k) || [];
      list.push(r.name);
      m.set(k, list);
    }
    // only keep where there are >= 2 entries
    const groups = [];
    for (const list of m.values()) {
      if (list.length >= 2) groups.push({ mode: "at_most", count: 1, players: list });
    }
    return groups;
  }, [rows]);

  async function optimize() {
    if (!rows.length) return;
    setLineups([]); setWorking(true); setProgress(0);
    clearInterval(progressTimer.current);
    progressTimer.current = setInterval(() => setProgress((p) => p + 1), 250);

    // solver slots
    const slots = cfg.slots;
    const roster = slots.length;

    // convert “max overlap” to server’s min_diff:
    // min_diff = roster_size - max_overlap
    const min_diff = Math.max(1, roster - clamp(Number(maxOverlap) || 0, 0, roster-1));

    // payload players (use the visible names; they’re unique: “Name (CPT)” vs “Name”)
    const payload = {
      site,
      slots,
      players: rows.map(r => ({
        name: r.name,        // unique choice ID
        pos: r.pos,          // CPT_POS or QB/RB/...
        team: r.team,
        opp: r.opp,
        salary: Math.round(r.salary || 0),
        proj: r.proj || 0,
        floor: r.floor || 0,
        ceil: r.ceil || 0,
        pown: r.pown || 0,
        opt:  r.opt  || 0,
      })),
      n: Math.max(1, Number(numLineups) || 1),
      cap: Math.min(cfg.cap, Number(maxSalary) || cfg.cap),
      objective: "proj",
      locks: [],
      excludes: [],
      boosts: {},
      randomness: 0,
      global_max_pct: 100,
      min_pct: {},
      max_pct: {},
      min_diff,              // ← derived from Max Overlap
      time_limit_ms: 1500,
      groups: noDupGroups,   // forbid “same player CPT + FLEX” dup
      qb_stack_min: 0, stack_allow_rb: true, bringback_min: 0, // no stacks in Showdown
      avoid_rb_vs_opp_dst: false, avoid_offense_vs_opp_dst: false,
      team_stack_rules: [],
      team_max_pct: {},
    };

    const out = [];
    const namesToPown = (names) => names.reduce((s,n)=>s+((byName.get(n)?.pown||0)*100),0);

    try {
      await solveStreamNFL(
        payload,
        (evt) => {
          const names = evt.drivers;
          // enforce IF/THEN client-side
          if (!satisfiesRules(names)) return;

          // satisfied — push lineup
          const L = {
            names,
            salary: evt.salary,
            total: evt.total,
            totalPown: namesToPown(names),
          };
          out.push(L);
          setLineups((prev) => [...prev, L]);
        },
        () => {
          clearInterval(progressTimer.current);
          setWorking(false);
          setProgress(out.length);
        }
      );
    } catch (e) {
      // fallback to batch endpoint
      const res = await fetch(`${API_BASE}/solve_nfl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      const raw = (j.lineups || []).map(L => ({
        names: L.drivers,
        salary: L.salary,
        total: L.total,
        totalPown: namesToPown(L.drivers),
      }));
      const filtered = raw.filter(L => satisfiesRules(L.names));
      setLineups(filtered);
      clearInterval(progressTimer.current);
      setWorking(false);
      setProgress(filtered.length);
    }
  }

  /* --------------------- UI helpers ---------------------- */
  const header = "px-2 py-1 font-semibold text-center";
  const cell = "px-2 py-1 text-center";
  const small = "text-[12px]";

  // lineup config exposure  (e.g., 3-3 / 4-2 by team)
  const lineupConfigs = useMemo(() => {
    if (!lineups.length) return [];
    const buildKey = (names) => {
      const tCounts = {};
      names.map(n => byName.get(n)).filter(Boolean).forEach(r => tCounts[r.team] = (tCounts[r.team] || 0) + 1);
      const arr = Object.entries(tCounts).sort((a,b)=>b[1]-a[1]); // team,count
      if (arr.length < 2) return `${arr[0]?.[1] || 0}-0 ${arr[0]?.[0] || ""}`;
      const [tA,cA] = arr[0], [tB,cB] = arr[1];
      // name the side with more players first
      return `${cA}-${cB} (${tA} over ${tB})`;
    };
    const m = new Map();
    for (const L of lineups) {
      const k = buildKey(L.names);
      m.set(k, (m.get(k) || 0) + 1);
    }
    const total = lineups.length || 1;
    return [...m.entries()].map(([k,c]) => ({ shape: k, count: c, pct: (c/total)*100 }))
      .sort((a,b)=>b.count-a.count);
  }, [lineups, byName]);

  // CSV (IDs) export, CPT/MVP first
  function downloadCSVWithIds() {
    const siteKey = site;
    const idsRoot = Array.isArray(siteIds?.sites?.[siteKey]) ? siteIds.sites[siteKey] :
                    Array.isArray(siteIds?.[siteKey]) ? siteIds[siteKey] : [];
    // build index name->id (our row.name is unique)
    const idIndex = new Map();
    for (const r of rows) {
      if (!r.uid) continue;
      idIndex.set(r.name, String(r.uid));
    }
    const header = ["#", "Salary", "Total", ...cfg.slots.map((_,i)=>`D${i+1}`)];
    const lines = lineups.map((L, idx) => {
      // order: CPT/MVP first, then any order for FLEX
      const cap = L.names.find(n => byName.get(n)?.isCaptain);
      const flex = L.names.filter(n => n !== cap);
      const ordered = [cap, ...flex];
      const cells = ordered.map((n) => {
        const row = byName.get(n);
        const id = idIndex.get(n) || "";
        const disp = row?.displayName || n;
        if (site === "fd") {
          return escapeCSV(`${id}:${disp}`);
        }
        // dk -> "Name (ID)"
        return escapeCSV(`${disp} (${id})`);
      });
      return [idx+1, L.salary, fmt1(L.total), ...cells].join(",");
    });
    const blob = new Blob([[header.join(",")].concat(lines).join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `NFL_showdown_${site}_ids.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="px-4 md:px-6 py-5">
      <h1 className="text-2xl md:text-3xl font-extrabold mb-3">NFL — Showdown Optimizer</h1>

      {/* site toggle & key inputs */}
      <div className="mb-3 flex flex-wrap gap-2 items-end">
        {["dk","fd"].map((s) => (
          <button
            key={s}
            onClick={() => setSite(s)}
            className={`px-3 py-1.5 rounded-full border text-sm inline-flex items-center gap-2 ${
              site === s ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-white border-gray-300 text-gray-700"
            }`}
          >
            <img src={SITES[s].logo} alt="" className="w-4 h-4" />
            <span>{SITES[s].label}</span>
          </button>
        ))}

        <div className="ml-2">
          <label className="block text-[11px] text-gray-600 mb-1">View</label>
          <select className="border rounded-md px-2 py-1 text-sm">
            <option>All</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] text-gray-600 mb-1">Lineups</label>
          <input className="border rounded-md px-2 py-1 text-sm w-20" value={numLineups} onChange={(e)=>setNumLineups(e.target.value)} />
        </div>

        <div>
          <label className="block text-[11px] text-gray-600 mb-1">Max salary</label>
          <input className="border rounded-md px-2 py-1 text-sm w-24" value={maxSalary} onChange={(e)=>setMaxSalary(e.target.value)} />
        </div>

        <div>
          <label className="block text-[11px] text-gray-600 mb-1">Max Overlap</label>
          <input
            className="border rounded-md px-2 py-1 text-sm w-16"
            value={maxOverlap}
            onChange={(e)=>setMaxOverlap(e.target.value)}
            title="Two lineups will share at most this many players (CPT/MVP counts as one of the players)."
          />
        </div>

        <button className="ml-auto px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700" onClick={optimize} disabled={working}>
          {working ? "Optimizing…" : `Optimize ${numLineups}`}
        </button>
      </div>

      {/* Conditional Rules */}
      <div className="rounded-md border p-2 mb-3">
        <div className="text-[11px] text-gray-600 mb-1">Conditional Rules (IF → THEN)</div>
        <div className="space-y-2">
          {rules.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span>IF</span>
              <select className="border rounded px-2 py-1 text-sm"
                value={r.ifTag}
                onChange={(e)=>setRules(R => R.map((x,j)=>j===i?{...x,ifTag:e.target.value}:x))}
              >
                <option value={cfg.capLabel}>{cfg.capLabel}</option>
                <option value="FLEX">FLEX</option>
              </select>
              <span>is</span>
              {["QB","RB","WR","TE","DST","K"].map(p => (
                <button
                  key={p}
                  onClick={()=>setRules(R=>R.map((x,j)=>j===i?{...x, ifPos:new Set([...x.ifPos ^ 0, ...(x.ifPos.has(p)?[]:[p])].filter(y=>y!==p || !x.ifPos.has(p))).has?x.ifPos: (x.ifPos.has(p)? new Set([...x.ifPos].filter(z=>z!==p)) : new Set([...x.ifPos, p]))}:x))}
                  className={`px-2 py-1 rounded border text-sm ${r.ifPos.has(p)?"bg-blue-600 text-white border-blue-600":"bg-white"}`}
                >
                  {p}
                </button>
              ))}
              <span className="ml-2">THEN require at least</span>
              <input
                className="w-14 border rounded px-2 py-1 text-sm"
                value={r.thenN}
                onChange={(e)=>setRules(R=>R.map((x,j)=>j===i?{...x, thenN:e.target.value}:x))}
              />
              <select className="border rounded px-2 py-1 text-sm"
                value={r.thenTag}
                onChange={(e)=>setRules(R=>R.map((x,j)=>j===i?{...x, thenTag:e.target.value}:x))}
              >
                <option value="FLEX">FLEX</option>
                <option value={cfg.capLabel}>{cfg.capLabel}</option>
              </select>
              <span>from</span>
              {["QB","RB","WR","TE","DST","K"].map(p => (
                <button
                  key={p}
                  onClick={()=>setRules(R=>R.map((x,j)=>j===i?{...x, thenPos:(x.thenPos.has(p)? new Set([...x.thenPos].filter(z=>z!==p)) : new Set([...x.thenPos, p]))}:x))}
                  className={`px-2 py-1 rounded border text-sm ${r.thenPos.has(p)?"bg-green-600 text-white border-green-600":"bg-white"}`}
                >
                  {p}
                </button>
              ))}
              <select
                className="border rounded px-2 py-1 text-sm"
                title="Scope of the THEN players relative to the IF anchor"
                value={r.scope}
                onChange={(e)=>setRules(R=>R.map((x,j)=>j===i?{...x, scope:e.target.value}:x))}
              >
                <option value="same">same team</option>
                <option value="opp">opponent</option>
                <option value="any">any team</option>
              </select>

              {/* optional team override (leave blank for global) */}
              <span className="ml-2">Team override</span>
              <select
                className="border rounded px-2 py-1 text-sm"
                value={r.team}
                onChange={(e)=>setRules(R=>R.map((x,j)=>j===i?{...x, team:e.target.value}:x))}
              >
                <option value="">—</option>
                {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              <button className="ml-auto px-2 py-1 text-sm border rounded" onClick={()=>setRules(R=>R.filter((_,j)=>j!==i))}>Delete</button>
            </div>
          ))}
        </div>
        <button className="mt-2 px-2 py-1 text-sm border rounded" onClick={()=>setRules(R=>[...R,{ ifTag:"CPT", ifPos:new Set(["QB"]), thenN:1, thenTag:"FLEX", thenPos:new Set(["WR","TE"]), scope:"same", team:""}])}>
          + Add Rule
        </button>
      </div>

      {/* table of players */}
      <div className="rounded-xl border bg-white shadow-sm overflow-auto mb-4 max-h-[560px]">
        <table className={`w-full border-separate ${small}`} style={{ borderSpacing: 0 }}>
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className={header}>Tag</th>
              <th className={header}>Player</th>
              <th className={header}>Team</th>
              <th className={header}>Pos</th>
              <th className={header}>Salary</th>
              <th className={header}>Proj</th>
              <th className={header}>UID</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className={cell} colSpan={7}>Loading…</td></tr>}
            {err && <tr><td className={cell} colSpan={7} style={{color:"#c00"}}>{String(err)}</td></tr>}
            {!loading && !err && rows.map((r, i) => (
              <tr key={`${r.name}-${i}`} className="odd:bg-white even:bg-gray-50">
                <td className={cell}>{r.isCaptain ? cfg.capLabel : "FLEX"}</td>
                <td className={`${cell} text-left`}>{r.displayName}</td>
                <td className={cell}><TeamPill abbr={r.team} /></td>
                <td className={cell}>{r.dispPos}</td>
                <td className={`${cell} tabular-nums`}>{fmt0(r.salary)}</td>
                <td className={`${cell} tabular-nums`}>{fmt1(r.proj)}</td>
                <td className={`${cell} tabular-nums`}>{r.uid || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* results */}
      {!!lineups.length && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <section className="lg:col-span-8 rounded-lg border bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold">Lineups ({lineups.length})</h2>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 border rounded text-sm" onClick={downloadCSVWithIds}>Export CSV (IDs)</button>
              </div>
            </div>
            <div className="overflow-auto max-h-[420px]">
              <table className="min-w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
                <thead className="bg-gray-50">
                  <tr>
                    <th className={header}>#</th>
                    <th className={header}>Salary</th>
                    <th className={header}>Total Proj</th>
                    <th className={header}>Total pOWN%</th>
                    <th className={header}>Players</th>
                  </tr>
                </thead>
                <tbody>
                  {lineups.map((L, i) => {
                    const cap = L.names.find(n => byName.get(n)?.isCaptain);
                    const flex = L.names.filter(n => n !== cap);
                    const ordered = [cap, ...flex].map(n => byName.get(n)?.displayName || n);
                    return (
                      <tr key={i} className="odd:bg-white even:bg-gray-50">
                        <td className={cell}>{i+1}</td>
                        <td className={`${cell} tabular-nums`}>{fmt0(L.salary)}</td>
                        <td className={`${cell} tabular-nums`}>{fmt1(L.total)}</td>
                        <td className={`${cell} tabular-nums`}>{fmt1(L.totalPown)}</td>
                        <td className={`${cell} text-left`}>{ordered.join(" • ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* lineup config exposure (3-3 / 4-2, etc.) */}
          <section className="lg:col-span-4 rounded-lg border bg-white p-3">
            <h3 className="text-base font-semibold mb-2">Lineup Configs</h3>
            <table className="min-w-full text-[12px]">
              <thead><tr><th className={header}>Shape</th><th className={header}>Count</th><th className={header}>%</th></tr></thead>
              <tbody>
                {lineupConfigs.map((r, idx) => (
                  <tr key={idx} className="odd:bg-white even:bg-gray-50">
                    <td className={cell}>{r.shape}</td>
                    <td className={`${cell} tabular-nums`}>{fmt0(r.count)}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1(r.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}
