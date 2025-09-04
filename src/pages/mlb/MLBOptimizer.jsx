// src/pages/mlb/MLBOptimizer.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import API_BASE from "../../utils/api";

/* ----------------------------- helpers ----------------------------- */
const clamp = (v, lo = 0, hi = 1e9) => Math.max(lo, Math.min(hi, v));
const num = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/\$/g, "").replace(/[,  \s]/g, "").replace(/%/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const fmt0 = (n) => (Number.isFinite(n) ? n.toLocaleString() : "—");
const fmt1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : "—");
const pct = (v) => {
  if (v == null) return 0;
  const s = String(v).replace(/[%\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n / 100 : 0;
};
const normTeam = (s) => (s || "").toUpperCase().trim();

/* ------------------------------ data ------------------------------- */
/** We now read pitchers & batters separately; if either is missing we fall back
 *  to /data/mlb/latest/projections.json (your old combined export). */
const BATTERS_SRC  = "/data/mlb/latest/batter_projections.json";
const PITCHERS_SRC = "/data/mlb/latest/pitcher_projections.json";
const LEGACY_SRC   = "/data/mlb/latest/projections.json";
const SITE_IDS_SRC = "/data/mlb/latest/site_ids.json";

/* ----------------------------- team colors ------------------------- */
const TEAM_COLORS = {
  // primary brand colors (feel free to tweak)
  ARI: "#A71930", ATL: "#CE1141", BAL: "#DF4601", BOS: "#BD3039",
  CHC: "#0E3386", CIN: "#C6011F", CLE: "#00385D", COL: "#333366",
  CWS: "#27251F", DET: "#0C2340", HOU: "#EB6E1F", KC:  "#004687",
  LAA: "#BA0021", LAD: "#005A9C", MIA: "#00A3E0", MIL: "#FFC52F",
  MIN: "#002B5C", NYM: "#FF5910", NYY: "#0C2340", OAK: "#003831",
  PHI: "#E81828", PIT: "#FDB827", SD:  "#2F241D", SEA: "#0C2C56",
  SF:  "#FD5A1E", STL: "#C41E3A", TB:  "#092C5C", TEX:"#003278",
  TOR:"#134A8E", WSH:"#AB0003",
};
/* returns a nice pill style for team chips */
const teamStyle = (abbr, active) => {
  const bg = TEAM_COLORS[abbr] || "#e5e7eb";
  const txt = "#fff";
  const cls = `px-2 py-1 rounded-md text-sm border transition-colors`;
  return {
    className: cls,
    style: active
      ? { backgroundColor: bg, color: txt, borderColor: bg }
      : { backgroundColor: "#fff", color: "#111827", borderColor: "#d1d5db" },
  };
};

/* ----------------------------- sites ------------------------------- */
const SITES = {
  dk: {
    key: "dk",
    label: "DraftKings",
    logo: "/logos/dk.png",
    cap: 50000,
    slots: [
      { name: "P1",   eligible: ["P"] },
      { name: "P2",   eligible: ["P"] },
      { name: "C",    eligible: ["C"] },
      { name: "1B",   eligible: ["1B"] },
      { name: "2B",   eligible: ["2B"] },
      { name: "3B",   eligible: ["3B"] },
      { name: "SS",   eligible: ["SS"] },
      { name: "OF1",  eligible: ["OF"] },
      { name: "OF2",  eligible: ["OF"] },
      { name: "OF3",  eligible: ["OF"] },
    ],
    pown: ["DK pOWN%","DK pOWN"], opt: ["DK Opt%","DK Opt"],
    salKey: "DK Sal", projKey: "DK Proj", floorKey: "DK Floor", ceilKey: "DK Ceiling",
  },
  fd: {
    key: "fd",
    label: "FanDuel",
    logo: "/logos/fd.png",
    cap: 35000,
    slots: [
      { name: "P",    eligible: ["P"] },
      { name: "C/1B", eligible: ["C","1B"] },
      { name: "2B",   eligible: ["2B"] },
      { name: "3B",   eligible: ["3B"] },
      { name: "SS",   eligible: ["SS"] },
      { name: "OF1",  eligible: ["OF"] },
      { name: "OF2",  eligible: ["OF"] },
      { name: "OF3",  eligible: ["OF"] },
      { name: "UTIL", eligible: ["C","1B","2B","3B","SS","OF"] },
    ],
    pown: ["FD pOWN%","FD pOWN"], opt: ["FD Opt%","FD Opt"],
    salKey: "FD Sal", projKey: "FD Proj", floorKey: "FD Floor", ceilKey: "FD Ceiling",
  },
};

/* ----------------------------- fetchers ---------------------------- */
function useJson(url) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(!!url);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const raw = await res.text();
        const cleaned = raw.replace(/^\uFEFF/, "").trim();
        const j = cleaned ? JSON.parse(cleaned) : null;
        if (alive) { setData(j); setErr(null); }
      } catch (e) {
        if (alive) { setData(null); setErr(e); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [url]);

  return { data, err, loading };
}

/* --------------------------- sticky state -------------------------- */
const useStickyState = (key, init) => {
  const [v, setV] = useState(init);
  useEffect(() => {
    try { setV(JSON.parse(localStorage.getItem(key)) ?? init); } catch { setV(init); }
  }, [key]);
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  }, [key, v]);
  return [v, setV];
};

/* --------------------------- SSE wrapper --------------------------- */
async function solveStreamMLB(payload, onItem, onDone) {
  const res = await fetch(`${API_BASE}/solve_mlb_stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok || !res.body) throw new Error("Stream failed");
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
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.done) onDone?.(evt);
        else onItem?.(evt);
      } catch {}
    }
  }
}

/* ---------------------------- page -------------------------------- */
export default function MLBOptimizer() {
  // Load separate feeds (falls back to legacy)
  const { data: batters, err: batErr, loading: batLoading } = useJson(BATTERS_SRC);
  const { data: pitchers, err: pitErr, loading: pitLoading } = useJson(PITCHERS_SRC);
  const legacy = useJson(!batters && !pitchers ? LEGACY_SRC : null);
  const { data: siteIds } = useJson(SITE_IDS_SRC);

  const [site, setSite] = useStickyState("mlbOpt.site", "dk");
  const cfg = SITES[site];

  const [optBy, setOptBy] = useStickyState("mlbOpt.optBy", "proj");
  const [numLineups, setNumLineups] = useStickyState("mlbOpt.N", 20);

  const [maxSalary, setMaxSalary] = useStickyState(`mlbOpt.${site}.cap`, cfg.cap);
  useEffect(() => { setMaxSalary(SITES[site].cap); }, [site]);

  const [globalMax, setGlobalMax] = useStickyState("mlbOpt.gmax", 100);
  const [randomness, setRandomness] = useStickyState("mlbOpt.rand", 0);
  const [lineupPownCap, setLineupPownCap] = useStickyState("mlbOpt.lineupPownCap", "");

  // Stacks (hitters only). Default DK=5-3, FD=4-4
  const [primaryStack, setPrimaryStack] = useStickyState(`mlbOpt.${site}.stack1`, site === "dk" ? 5 : 4);
  const [secondaryStack, setSecondaryStack] = useStickyState(`mlbOpt.${site}.stack2`, site === "dk" ? 3 : 4);

  const [avoidHittersVsOppP, setAvoidHittersVsOppP] = useStickyState("mlbOpt.avoidHittersVsOppP", true);
  const [maxHittersVsOppP, setMaxHittersVsOppP] = useStickyState("mlbOpt.maxHittersVsOppP", 0);
  const [minDiff, setMinDiff] = useStickyState("mlbOpt.minDiff", 1);

  const [locks, setLocks] = useState(() => new Set());
  const [excls, setExcls] = useState(() => new Set());
  const [minPct, setMinPct] = useState(() => ({}));
  const [maxPct, setMaxPct] = useState(() => ({}));
  const [boost, setBoost] = useState(() => ({}));

  // filters
  const [posFilter, setPosFilter] = useState("ALL");
  const [selectedTeams, setSelectedTeams] = useState(() => new Set());
  const [selectedGames, setSelectedGames] = useState(() => new Set());
  const [q, setQ] = useState("");

  const [lineups, setLineups] = useState([]);
  const [stopInfo, setStopInfo] = useState(null);
  const [progressActual, setProgressActual] = useState(0);
  const [progressUI,   setProgressUI] = useState(0);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const tickRef = useRef(null);

  useEffect(() => {
    if (!isOptimizing) return;
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setProgressUI((p) => {
        const N = Math.max(1, Number(numLineups) || 1);
        const target = Math.max(progressActual, 1);
        const ceiling = Math.max(0, N - 1);
        return Math.min(Math.max(p + 1, target), ceiling);
      });
    }, 250);
    return () => clearInterval(tickRef.current);
  }, [isOptimizing, progressActual, numLineups]);

  useEffect(() => {
    setLineups([]); setStopInfo(null); setProgressActual(0); setProgressUI(0); setIsOptimizing(false);
    setLocks(new Set()); setExcls(new Set());
  }, [site]);

  /* ------------------------------ rows ------------------------------ */
  const rows = useMemo(() => {
    const pickArray = (obj) => Array.isArray(obj?.rows) ? obj.rows
      : Array.isArray(obj?.players) ? obj.players
      : Array.isArray(obj?.data) ? obj.data
      : Array.isArray(obj) ? obj : [];

    // Build from separate sources if available; otherwise legacy
    const bat = pickArray(batters);
    const pit = pickArray(pitchers);
    const legacyArr = pickArray(legacy.data);

    const useSeparate = bat.length || pit.length;
    const srcBat = useSeparate ? bat : legacyArr.filter(r => String(r.Pos||r.POS||"").toUpperCase().includes("C") || String(r.Pos||"").includes("B") || /1B|2B|3B|SS|OF/i.test(String(r.Pos||"")));
    const srcPit = useSeparate ? pit : legacyArr.filter(r => /P|SP|RP/i.test(String(r.Pos||r.POS||"")));

    const siteKey = cfg.key;
    const projKeyLC = `${siteKey}_proj`;
    const salKeyLC  = `${siteKey}_sal`;
    const pownKeyLC = `${siteKey}_pown`;
    const optKeyLC  = `${siteKey}_opt`;

    const mapBatter = (r) => {
      const name = r.player ?? r.Player ?? r.Name ?? r.playerName ?? r.name ?? "";
      const rawPos = String(r.pos ?? r.Pos ?? r.POS ?? r.Position ?? "").toUpperCase();
      const parts = rawPos.split("/").map(s => s.trim()).filter(Boolean).map(p => (p === "SP" || p === "RP") ? "P" : p);
      const eligible = Array.from(new Set(parts));
      const team = normTeam(r.team ?? r.Team ?? r.Tm ?? r.TEAM ?? r.team_abbr ?? r.TeamAbbrev ?? "");
      const opp  = normTeam(r.opp  ?? r.Opp  ?? r.OPP ?? r.opponent ?? r.Opponent ?? "");
      const salary = num(r[salKeyLC] ?? r[cfg.salKey] ?? r.Salary ?? r.salary);
      const proj   = num(r[projKeyLC] ?? r[cfg.projKey] ?? r.Projection ?? r.Points);
      const floor  = num(r[`${cfg.key}_floor`] ?? r[cfg.floorKey] ?? r.Floor);
      const ceil   = num(r[`${cfg.key}_ceil`]  ?? r[cfg.ceilKey]  ?? r.Ceiling);
      const pown   = pct(r[pownKeyLC] ?? r[cfg.pown?.[0]] ?? r[cfg.pown?.[1]]);
      const opt    = pct(r[optKeyLC]  ?? r[cfg.opt?.[0]]  ?? r[cfg.opt?.[1]]);
      const val    = Number.isFinite(proj) && salary > 0 ? (proj / salary) * 1000 : 0;
      return { name, team, opp, eligible, isPitcher: false, salary, proj, floor, ceil, pown, opt, val, __raw: r };
    };

    const mapPitcher = (r) => {
      const name = r.player ?? r.Player ?? r.Name ?? r.playerName ?? r.name ?? "";
      const team = normTeam(r.team ?? r.Team ?? r.Tm ?? r.TEAM ?? r.team_abbr ?? r.TeamAbbrev ?? "");
      const opp  = normTeam(r.opp  ?? r.Opp  ?? r.OPP ?? r.opponent ?? r.Opponent ?? "");
      const salary = num(r[`${siteKey}_sal`] ?? r[cfg.salKey] ?? r.Salary ?? r.salary);
      const proj   = num(r[`${siteKey}_proj`] ?? r[cfg.projKey] ?? r.Projection ?? r.Points);
      const floor  = num(r[`${cfg.key}_floor`] ?? r[cfg.floorKey] ?? r.Floor);
      const ceil   = num(r[`${cfg.key}_ceil`]  ?? r[cfg.ceilKey]  ?? r.Ceiling);
      const pown   = pct(r[`${siteKey}_pown`] ?? r[cfg.pown?.[0]] ?? r[cfg.pown?.[1]]);
      const opt    = pct(r[`${siteKey}_opt`]  ?? r[cfg.opt?.[0]]  ?? r[cfg.opt?.[1]]);

      // 🔴 KEY FIX: if no position exists, FORCE ['P'] for pitchers
      const eligible = ["P"];
      const val = Number.isFinite(proj) && salary > 0 ? (proj / salary) * 1000 : 0;
      return { name, team, opp, eligible, isPitcher: true, salary, proj, floor, ceil, pown, opt, val, __raw: r };
    };

    const mapped = [...srcBat.map(mapBatter), ...srcPit.map(mapPitcher)]
      .filter(r => r.name && r.eligible.length);

    return mapped;
  }, [batters, pitchers, legacy.data, cfg]);

  const allTeams = useMemo(() => {
    const s = new Set();
    for (const r of rows) { if (r.team) s.add(r.team); if (r.opp) s.add(r.opp); }
    return [...s].sort();
  }, [rows]);

  const allGames = useMemo(() => {
    const s = new Set();
    for (const r of rows) {
      if (r.team && r.opp) s.add(`${r.team} @ ${r.opp}`);
    }
    return [...s].sort();
  }, [rows]);

  /* ----------------------- order / filter / sort -------------------- */
  const [order, setOrder] = useState([]);
  const sortRef = useRef({ col: "proj", dir: "desc" });

  useEffect(() => {
    const initial = [...rows].sort((a, b) => b.proj - a.proj || a.name.localeCompare(b.name));
    setOrder(initial.map((r) => r.name));
  }, [site, rows.length]); // eslint-disable-line

  const usagePct = useMemo(() => {
    if (!lineups.length) return {};
    const m = new Map();
    for (const L of lineups) for (const p of L.players) m.set(p, (m.get(p) || 0) + 1);
    const total = Math.max(1, lineups.length);
    const out = {};
    for (const [name, cnt] of m.entries()) out[name] = (cnt / total) * 100;
    return out;
  }, [lineups]);

  const posOK = (eligible) => {
    if (posFilter === "ALL") return true;
    if (posFilter === "UTIL") return eligible.some((p) => ["C","1B","2B","3B","SS","OF"].includes(p));
    return eligible.includes(posFilter);
  };

  const displayRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const textOK = (r) =>
      !needle ||
      r.name.toLowerCase().includes(needle) ||
      r.team.toLowerCase().includes(needle) ||
      r.opp.toLowerCase().includes(needle) ||
      r.eligible.join("/").toLowerCase().includes(needle) ||
      String(r.salary).includes(needle);

    const teamOK = (r) => selectedTeams.size === 0 || selectedTeams.has(r.team);
    const gameOK = (r) =>
      selectedGames.size === 0 || selectedGames.has(`${r.team} @ ${r.opp}`);

    const byName = new Map(rows.map((r) => [r.name, r]));
    const ordered = order.map((n) => byName.get(n)).filter(Boolean);
    const others = rows.filter((r) => !order.includes(r.name));
    const base = [...ordered, ...others];

    return base.filter((r) => posOK(r.eligible) && textOK(r) && teamOK(r) && gameOK(r));
  }, [rows, order, q, posFilter, selectedTeams, selectedGames]);

  const sortable = new Set(["team","opp","salary","proj","val","floor","ceil","pown","opt","usage"]);
  const setSort = (col) => {
    if (!sortable.has(col)) return;
    const dir = sortRef.current.col === col ? (sortRef.current.dir === "asc" ? "desc" : "asc") : "desc";
    sortRef.current = { col, dir };
    const mult = dir === "asc" ? 1 : -1;
    const sorted = [...displayRows].sort((a, b) => {
      if (["team","opp"].includes(col)) {
        const va = (a[col] || "").toString();
        const vb = (b[col] || "").toString();
        if (va < vb) return -1 * mult;
        if (va > vb) return 1 * mult;
        return a.name.localeCompare(b.name) * mult;
      }
      const va = col === "pown" || col === "opt" || col === "usage"
        ? ((col === "usage" ? usagePct[a.name] : a[col]) || 0) * 100
        : a[col] ?? 0;
      const vb = col === "pown" || col === "opt" || col === "usage"
        ? ((col === "usage" ? usagePct[b.name] : b[col]) || 0) * 100
        : b[col] ?? 0;
      if (va < vb) return -1 * mult;
      if (va > vb) return 1 * mult;
      return a.name.localeCompare(b.name) * mult;
    });
    setOrder(sorted.map((r) => r.name));
  };
  const sortArrow = (key) =>
    sortRef.current.col === key ? (sortRef.current.dir === "asc" ? " ▲" : " ▼") : "";

  /* ----------------------------- actions ---------------------------- */
  const bumpBoost = (name, step) => setBoost((m) => ({ ...m, [name]: clamp((m[name] || 0) + step, -6, 6) }));
  const toggleLock = (name) => setLocks((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const toggleExcl = (name) => setExcls((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });

  const resetConstraints = () => {
    setLocks(new Set()); setExcls(new Set()); setMinPct({}); setMaxPct({}); setBoost({});
  };

  /* --------------------------- optimize (SSE) ------------------------ */
  async function optimize() {
    if (!rows.length) return;
    setLineups([]); setStopInfo(null); setProgressActual(0); setProgressUI(0); setIsOptimizing(true);

    const N = Math.max(1, Number(numLineups) || 1);
    const capVal = Math.min(cfg.cap, Number(maxSalary) || cfg.cap);

    const payload = {
      site,
      slots: cfg.slots,
      players: rows.map((r) => ({
        name: r.name, team: r.team, opp: r.opp, eligible: r.eligible,
        salary: Math.round(r.salary || 0),
        proj: r.proj || 0, floor: r.floor || 0, ceil: r.ceil || 0,
        pown: r.pown || 0, opt: r.opt || 0,
      })),
      n: N,
      cap: capVal,
      objective: optBy,
      locks: Array.from(locks),
      excludes: Array.from(excls),
      boosts: boost,
      randomness: clamp(Number(randomness) || 0, 0, 100),
      global_max_pct: clamp(Number(globalMax) || 100, 0, 100),
      min_pct: Object.fromEntries(Object.entries(minPct).map(([k, v]) => [k, clamp(Number(v) || 0, 0, 100)])),
      max_pct: Object.fromEntries(Object.entries(maxPct).map(([k, v]) => [k, clamp(Number(v) || 100, 0, 100)])),
      min_diff: Math.max(1, Number(minDiff) || 1),
      time_limit_ms: 1500,
      primary_stack_size: Math.max(0, Number(primaryStack) || 0),
      secondary_stack_size: Math.max(0, Number(secondaryStack) || 0),
      avoid_hitters_vs_opp_pitcher: !!avoidHittersVsOppP,
      max_hitters_vs_opp_pitcher: Math.max(0, Number(maxHittersVsOppP) || 0),
      lineup_pown_max: String(lineupPownCap).trim() === "" ? null : clamp(Number(lineupPownCap)||0, 0, 500),
      min_distinct_teams: site === "fd" ? 3 : 2,
    };

    const out = [];
    try {
      await solveStreamMLB(
        payload,
        (evt) => {
          const L = { players: evt.drivers, salary: evt.salary, total: evt.total };
          out.push(L);
          setLineups((prev) => [...prev, L]);
          setProgressActual(out.length);
        },
        (done) => {
          if (done?.reason) setStopInfo(done);
          setProgressActual(out.length || payload.n);
          setProgressUI(out.length || payload.n);
          setIsOptimizing(false);
          clearInterval(tickRef.current);
        }
      );
    } catch (e) {
      const res = await fetch(`${API_BASE}/solve_mlb`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        alert(`Solve failed: ${await res.text()}`);
        setIsOptimizing(false);
        clearInterval(tickRef.current);
        return;
      }
      const j = await res.json();
      const raw = (j.lineups || []).map((L) => ({ players: L.drivers, salary: L.salary, total: L.total })) || [];
      setLineups(raw);
      setProgressActual(raw.length);
      setProgressUI(raw.length);
      setIsOptimizing(false);
      clearInterval(tickRef.current);
    }
  }

  /* ------------------------------- UI -------------------------------- */
  const metricLabel =
    optBy === "proj" ? "Proj" : optBy === "floor" ? "Floor" : optBy === "ceil" ? "Ceiling" : optBy === "pown" ? "pOWN%" : "Opt%";

  const cell = "px-2 py-1 text-center";
  const header = "px-2 py-1 font-semibold text-center";
  const textSz = "text-[12px]";

  const TABLE_COLS = [
    { key: "lock",   label: "Lock" },
    { key: "excl",   label: "Excl" },
    { key: "elig",   label: "Pos" },
    { key: "boosts", label: "Boosts" },
    { key: "name",   label: "Player" },
    { key: "team",   label: "Tm",   sortable: true },
    { key: "opp",    label: "Opp",  sortable: true },
    { key: "salary", label: "Salary", sortable: true },
    { key: "proj",   label: "Proj",   sortable: true },
    { key: "val",    label: "Val",    sortable: true },
    { key: "floor",  label: "Floor",  sortable: true },
    { key: "ceil",   label: "Ceiling",sortable: true },
    { key: "pown",   label: "pOWN%",  sortable: true },
    { key: "opt",    label: "Opt%",   sortable: true },
    { key: "min",    label: "Min%" },
    { key: "max",    label: "Max%" },
    { key: "usage",  label: "Usage%", sortable: true },
  ];

  const loading = (batLoading || pitLoading) && !legacy.data;
  const err = batErr || pitErr || legacy.err;

  return (
    <div className="px-4 md:px-6 py-5">
      <h1 className="text-2xl md:text-3xl font-extrabold mb-1">MLB — Optimizer</h1>

      {/* site toggle & reset */}
      <div className="mb-3 flex gap-2 items-center">
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
        <button className="ml-auto px-2.5 py-1.5 text-sm rounded-lg bg-white border hover:bg-gray-50" onClick={resetConstraints}>
          Reset constraints
        </button>
      </div>

      {/* controls */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end mb-2">
        <div className="md:col-span-2">
          <label className="block text-[11px] text-gray-600 mb-1">Optimize by</label>
          <select className="w-full border rounded-md px-2 py-1.5 text-sm" value={optBy} onChange={(e) => setOptBy(e.target.value)}>
            <option value="proj">Projection</option>
            <option value="floor">Floor</option>
            <option value="ceil">Ceiling</option>
            <option value="pown">pOWN%</option>
            <option value="opt">Opt%</option>
          </select>
        </div>
        <div className="md:col-span-1">
          <label className="block text-[11px] text-gray-600 mb-1">Lineups</label>
          <input className="w-full border rounded-md px-2 py-1.5 text-sm" value={numLineups} onChange={(e) => setNumLineups(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[11px] text-gray-600 mb-1">Max salary</label>
          <input className="w-full border rounded-md px-2 py-1.5 text-sm" value={maxSalary} onChange={(e) => setMaxSalary(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[11px] text-gray-600 mb-1">Global Max %</label>
          <input className="w-full border rounded-md px-2 py-1.5 text-sm" value={globalMax} onChange={(e) => setGlobalMax(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[11px] text-gray-600 mb-1">Randomness %</label>
          <input className="w-full border rounded-md px-2 py-1.5 text-sm" value={randomness} onChange={(e) => setRandomness(e.target.value)} />
        </div>

        {/* lineup-level cap */}
        <div className="md:col-span-2">
          <label className="block text-[11px] text-gray-600 mb-1">Max lineup pOWN% (sum)</label>
          <input
            className="w-full border rounded-md px-2 py-1.5 text-sm"
            placeholder="—"
            value={lineupPownCap}
            onChange={(e) => setLineupPownCap(e.target.value)}
            title="Reject lineups whose total pOWN% exceeds this value"
          />
        </div>

        {/* Stacks / pitcher rule */}
        <div className="md:col-span-12 rounded-md border p-2">
          <div className="text-[11px] text-gray-600 mb-1">Stacks (hitters only) &amp; Pitcher Rule</div>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <label className="text-sm">Primary Stack</label>
            <input type="number" className="w-16 border rounded-md px-2 py-1 text-sm" value={primaryStack} onChange={(e) => setPrimaryStack(e.target.value)} />
            <label className="text-sm ml-2">Secondary Stack</label>
            <input type="number" className="w-16 border rounded-md px-2 py-1 text-sm" value={secondaryStack} onChange={(e) => setSecondaryStack(e.target.value)} />
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={avoidHittersVsOppP} onChange={(e) => setAvoidHittersVsOppP(e.target.checked)} />
              Avoid hitters vs opp P
            </label>
            <label className="text-sm">Max hitters vs opp P</label>
            <input type="number" className="w-16 border rounded-md px-2 py-1 text-sm" value={maxHittersVsOppP} onChange={(e) => setMaxHittersVsOppP(e.target.value)} />
            <label className="text-sm">Min lineup diff</label>
            <input type="number" className="w-16 border rounded-md px-2 py-1 text-sm" value={minDiff} onChange={(e) => setMinDiff(e.target.value)} />
          </div>

          <div className="flex items-center gap-2">
            <button className="px-2 py-1 text-sm rounded-md border hover:bg-gray-50" onClick={() => {
              if (site === "dk") { setPrimaryStack(5); setSecondaryStack(3); }
              else { setPrimaryStack(4); setSecondaryStack(4); }
            }}>
              Preset: {site === "dk" ? "5-3" : "4-4"}
            </button>
            <button className="px-2 py-1 text-sm rounded-md border hover:bg-gray-50" onClick={() => { setPrimaryStack(5); setSecondaryStack(2); }}>
              Preset: 5-2-1
            </button>
            <button className="px-2 py-1 text-sm rounded-md border hover:bg-gray-50" onClick={() => { setPrimaryStack(4); setSecondaryStack(3); }}>
              Preset: 4-3-1
            </button>
          </div>
        </div>

        {/* progress + button */}
        <div className="md:col-span-12 flex items-end gap-3">
          <button className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700" onClick={optimize}>
            {`Optimize ${numLineups}`}
          </button>
          <div className="flex-1 max-w-xs h-2 bg-gray-200 rounded overflow-hidden">
            <div className="h-2 bg-blue-500 rounded transition-all duration-300"
              style={{ width: `${(Math.min(progressUI, Math.max(1, Number(numLineups) || 1)) / Math.max(1, Number(numLineups) || 1)) * 100}%` }} />
          </div>
          <div className="text-sm text-gray-600 min-w-[60px] text-right">
            {progressUI}/{numLineups}
          </div>
        </div>
      </div>

      {/* Position tabs */}
      <div className="mb-2 flex gap-3 text-sky-600 font-semibold text-sm">
        {["ALL","P","C","1B","2B","3B","SS","OF","UTIL"].map((p) => (
          <button key={p} onClick={() => setPosFilter(p)} className={posFilter === p ? "underline" : "opacity-80 hover:opacity-100"}>
            {p}
          </button>
        ))}
      </div>

      {/* Games filter */}
      {allGames.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          <button
            className="px-2 py-1 rounded-md border text-sm bg-white hover:bg-gray-50"
            onClick={() => setSelectedGames(new Set())}
          >
            All games
          </button>
          {allGames.map((g) => {
            const active = selectedGames.has(g);
            return (
              <button
                key={g}
                onClick={() =>
                  setSelectedGames((S) => {
                    const n = new Set(S);
                    active ? n.delete(g) : n.add(g);
                    return n;
                  })
                }
                className={`px-2 py-1 rounded-md border text-sm ${active ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-white border-gray-300"}`}
              >
                {g}
              </button>
            );
          })}
        </div>
      )}

      <div className="mb-2 flex gap-2">
        <input className="border rounded-md px-3 py-1.5 w-80 text-sm" placeholder="Search player / team / pos…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="px-2 py-1 rounded-md border text-sm bg-white hover:bg-gray-50" onClick={() => setSelectedTeams(new Set(allTeams))}>
          Select all teams
        </button>
        <button className="px-2 py-1 rounded-md border text-sm bg-white hover:bg-gray-50" onClick={() => setSelectedTeams(new Set())}>
          Clear teams
        </button>
      </div>

      {/* Team chips (colored) */}
      <div className="mb-3 flex flex-wrap gap-2">
        {allTeams.map((t) => {
          const active = selectedTeams.has(t);
          const style = teamStyle(t, active);
          return (
            <button
              key={t}
              onClick={() =>
                setSelectedTeams((S) => {
                  const n = new Set(S);
                  active ? n.delete(t) : n.add(t);
                  return n;
                })
              }
              {...style}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* Player table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-auto mb-6 max-h-[700px]">
        <table className={`w-full border-separate ${textSz}`} style={{ borderSpacing: 0 }}>
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {TABLE_COLS.map(({ key, label, sortable }) => (
                <th
                  key={key}
                  className={`${header} whitespace-nowrap cursor-${sortable ? "pointer" : "default"} select-none`}
                  onClick={() => sortable && setSort(key)}
                >
                  {label}{sortable ? <span className="opacity-60">{sortArrow(key)}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className={`${cell} text-gray-500`} colSpan={TABLE_COLS.length}>Loading…</td></tr>
            )}
            {err && (
              <tr><td className={`${cell} text-red-600`} colSpan={TABLE_COLS.length}>Failed to load: {String(err)}</td></tr>
            )}
            {!loading && !err && displayRows.map((r) => (
              <tr key={r.name} className="odd:bg-white even:bg-gray-50 hover:bg-blue-50/60 transition-colors">
                <td className={cell}><input type="checkbox" checked={locks.has(r.name)} onChange={() => toggleLock(r.name)} /></td>
                <td className={cell}><input type="checkbox" checked={excls.has(r.name)} onChange={() => toggleExcl(r.name)} /></td>
                <td className={cell}>{r.eligible.join("/")}</td>
                <td className={cell}>
                  <div className="inline-flex items-center gap-1">
                    <button className="px-1.5 py-0.5 border rounded" title="+3%" onClick={() => bumpBoost(r.name, +1)}>▲</button>
                    <span className="w-5 text-center">{boost[r.name] || 0}</span>
                    <button className="px-1.5 py-0.5 border rounded" title="-3%" onClick={() => bumpBoost(r.name, -1)}>▼</button>
                  </div>
                </td>
                <td className={`${cell} whitespace-nowrap`}>{r.name}</td>
                <td className={cell}>{r.team}</td>
                <td className={cell}>{r.opp}</td>
                <td className={`${cell} tabular-nums`}>{fmt0(r.salary)}</td>
                <td className={`${cell} tabular-nums`}>{fmt1(r.proj * (1 + 0.03 * (boost[r.name] || 0)))}</td>
                <td className={`${cell} tabular-nums`}>{fmt1(r.val)}</td>
                <td className={`${cell} tabular-nums`}>{fmt1(r.floor)}</td>
                <td className={`${cell} tabular-nums`}>{fmt1(r.ceil)}</td>
                <td className={`${cell} tabular-nums`}>{fmt1(r.pown * 100)}</td>
                <td className={`${cell} tabular-nums`}>{fmt1(r.opt * 100)}</td>
                <td className={cell}>
                  <div className="inline-flex items-center gap-1">
                    <button className="px-1.5 py-0.5 border rounded" onClick={() => setMinPct((m) => ({ ...m, [r.name]: clamp((num(m[r.name]) || 0) - 5, 0, 100) }))} title="-5%">–</button>
                    <input className="w-12 border rounded px-1.5 py-0.5 text-center" value={String(minPct[r.name] ?? "")} onChange={(e) => setMinPct((m) => ({ ...m, [r.name]: e.target.value }))} placeholder="—" />
                    <button className="px-1.5 py-0.5 border rounded" onClick={() => setMinPct((m) => ({ ...m, [r.name]: clamp((num(m[r.name]) || 0) + 5, 0, 100) }))} title="+5%">+</button>
                  </div>
                </td>
                <td className={cell}>
                  <div className="inline-flex items-center gap-1">
                    <button className="px-1.5 py-0.5 border rounded" onClick={() => setMaxPct((m) => ({ ...m, [r.name]: clamp((num(m[r.name]) || 100) - 5, 0, 100) }))} title="-5%">–</button>
                    <input className="w-12 border rounded px-1.5 py-0.5 text-center" value={String(maxPct[r.name] ?? "")} onChange={(e) => setMaxPct((m) => ({ ...m, [r.name]: e.target.value }))} placeholder="—" />
                    <button className="px-1.5 py-0.5 border rounded" onClick={() => setMaxPct((m) => ({ ...m, [r.name]: clamp((num(m[r.name]) || 100) + 5, 0, 100) }))} title="+5%">+</button>
                  </div>
                </td>
                <td className={`${cell} tabular-nums`}>{usagePct[r.name] != null ? fmt1(usagePct[r.name]) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* results & exposures (unchanged) */}
      {!!lineups.length && (
        <ResultsAndExposure
          lineups={lineups}
          rows={rows}
          optBy={optBy}
          TEAM_COLORS={TEAM_COLORS}
        />
      )}
    </div>
  );
}

/* ---------------------- results/exposure blocks -------------------- */
function ResultsAndExposure({ lineups, rows, optBy }) {
  const cell = "px-2 py-1 text-center";
  const header = "px-2 py-1 font-semibold text-center";
  const metricLabel =
    optBy === "proj" ? "Proj" : optBy === "floor" ? "Floor" : optBy === "ceil" ? "Ceiling" : optBy === "pown" ? "pOWN%" : "Opt%";

  const rowsByName = useMemo(() => new Map(rows.map(r => [r.name, r])), [rows]);

  const orderedForDisplay = (names) => {
    const pool = names.map((n) => rowsByName.get(n)).filter(Boolean);
    const take = (pred) => {
      const i = pool.findIndex(pred);
      if (i === -1) return null;
      return pool.splice(i, 1)[0];
    };
    const out = [];
    out.push(take((r) => r.eligible.includes("P")));
    out.push(take((r) => r.eligible.includes("P")));
    out.push(take((r) => r.eligible.includes("C") || r.eligible.includes("1B")));
    out.push(take((r) => r.eligible.includes("2B")));
    out.push(take((r) => r.eligible.includes("3B")));
    out.push(take((r) => r.eligible.includes("SS")));
    out.push(take((r) => r.eligible.includes("OF")));
    out.push(take((r) => r.eligible.includes("OF")));
    out.push(take((r) => r.eligible.includes("OF")));
    out.push(take((r) => ["C","1B","2B","3B","SS","OF"].some(p => r.eligible.includes(p))));
    return out.filter(Boolean).concat(pool);
  };

  const textSz = "text-[12px]";
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Lineups */}
      <section className="lg:col-span-8 rounded-lg border bg-white p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-bold">Lineups ({lineups.length})</h2>
        </div>
        <div className="overflow-auto max-h-[440px]">
          <table className={`min-w-full ${textSz} border-separate`} style={{ borderSpacing: 0 }}>
            <thead className="bg-gray-50">
              <tr>
                <th className={header}>#</th>
                <th className={header}>Salary</th>
                <th className={header}>Total pOWN%</th>
                <th className={header}>Total {optBy === "pown" || optBy === "opt" ? "Projection" : metricLabel}</th>
                <th className={header}>Players</th>
              </tr>
            </thead>
            <tbody>
              {lineups.map((L, i) => {
                const ordered = orderedForDisplay(L.players);
                const totalPown = ordered.reduce((s, r) => s + ((r.pown || 0) * 100), 0);
                return (
                  <tr key={i} className="odd:bg-white even:bg-gray-50">
                    <td className={cell}>{i + 1}</td>
                    <td className={`${cell} tabular-nums`}>{fmt0(L.salary)}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1(totalPown)}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1(L.total)}</td>
                    <td className={`${cell} leading-snug`}><span className="break-words">{ordered.map((r) => r.name).join(" • ")}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Player Exposure */}
      <section className="lg:col-span-4 rounded-lg border bg-white p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold">Exposure</h3>
        </div>
        <ExposureTable lineups={lineups} rows={rows} />
      </section>

      {/* Team Exposure */}
      <section className="lg:col-span-4 rounded-lg border bg-white p-3">
        <h3 className="text-base font-semibold mb-2">Team Exposure</h3>
        <TeamExposureTable lineups={lineups} rows={rows} />
      </section>

      {/* Stack Shapes */}
      <section className="lg:col-span-4 rounded-lg border bg-white p-3">
        <h3 className="text-base font-semibold mb-2">Hitter Stack Shapes</h3>
        <StackShapesTable lineups={lineups} rows={rows} />
      </section>
    </div>
  );
}

/* ---------------------- CSV exposures helper ---------------------- */
function downloadPlainCSV(lineups, fname = "mlb_lineups.csv") {
  const header = ["#", "Salary", "Total", "Players"].join(",");
  const lines = lineups.map((L, i) => [i + 1, L.salary, L.total.toFixed(1), `"${L.players.join(" • ")}"`].join(","));
  const blob = new Blob([header + "\n" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fname; a.click();
  URL.revokeObjectURL(url);
}

/* --------------------------- Exposure tables --------------------------- */
function ExposureTable({ lineups, rows }) {
  const meta = useMemo(() => new Map(rows.map(r => [r.name, r])), [rows]);
  const allRows = useMemo(() => {
    const m = new Map();
    for (const L of lineups) for (const p of L.players) m.set(p, (m.get(p) || 0) + 1);
    const total = Math.max(1, lineups.length);
    return [...m.entries()]
      .map(([name, cnt]) => {
        const r = meta.get(name);
        return { name, count: cnt, pct: (cnt / total) * 100, pos: r?.eligible?.join("/") || "?" };
      })
      .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));
  }, [lineups, meta]);
  if (!allRows.length) return null;

  const cell = "px-2 py-1 text-center";
  const header = "px-2 py-1 font-semibold text-center";
  return (
    <div className="overflow-auto max-h-[440px]">
      <table className="min-w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
        <thead className="bg-gray-50">
          <tr><th className={header}>Player</th><th className={header}>Pos</th><th className={header}>Count</th><th className={header}>Exposure %</th></tr>
        </thead>
        <tbody>
          {allRows.map((r) => (
            <tr key={r.name} className="odd:bg-white even:bg-gray-50">
              <td className={cell}>{r.name}</td>
              <td className={cell}>{r.pos}</td>
              <td className={`${cell} tabular-nums`}>{fmt0(r.count)}</td>
              <td className={`${cell} tabular-nums`}>{fmt1(r.pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamExposureTable({ lineups, rows }) {
  const rowsByName = useMemo(() => new Map(rows.map(r => [r.name, r])), [rows]);
  const data = useMemo(() => {
    const counts = new Map(); // team -> lineups containing team
    for (const L of lineups) {
      const chosenTeams = new Set(
        L.players.map((n) => rowsByName.get(n)).filter(Boolean).map((r) => r.team).filter(Boolean)
      );
      for (const t of chosenTeams) counts.set(t, (counts.get(t) || 0) + 1);
    }
    const total = Math.max(1, lineups.length);
    return [...counts.entries()]
      .map(([team, cnt]) => ({ team, count: cnt, pct: (cnt / total) * 100 }))
      .sort((a, b) => b.pct - a.pct || a.team.localeCompare(b.team));
  }, [lineups, rowsByName]);
  if (!data.length) return null;

  const cell = "px-2 py-1 text-center";
  const header = "px-2 py-1 font-semibold text-center";
  return (
    <table className="min-w-full text:[12px]">
      <thead><tr><th className={header}>Team</th><th className={header}>Count</th><th className={header}>Exposure %</th></tr></thead>
      <tbody>{data.map(r => (
        <tr key={r.team}><td className={cell}>{r.team}</td><td className={`${cell} tabular-nums`}>{fmt0(r.count)}</td><td className={`${cell} tabular-nums`}>{fmt1(r.pct)}</td></tr>
      ))}</tbody>
    </table>
  );
}

function StackShapesTable({ lineups, rows }) {
  const rowsByName = useMemo(() => new Map(rows.map(r => [r.name, r])), [rows]);
  const data = useMemo(() => {
    const counts = {};
    for (const L of lineups) {
      const chosen = L.players.map((n) => rowsByName.get(n)).filter(Boolean);
      const hitters = chosen.filter(r => !r.isPitcher);
      const byTeam = new Map();
      for (const h of hitters) byTeam.set(h.team, (byTeam.get(h.team) || 0) + 1);
      const sizes = [...byTeam.values()].sort((a,b)=>b-a);
      const label = sizes.join("-") || "—";
      counts[label] = (counts[label] || 0) + 1;
    }
    const total = Math.max(1, lineups.length);
    return Object.entries(counts).map(([shape, cnt]) => ({ shape, count: cnt, pct: (cnt / total) * 100 }))
      .sort((a,b)=> b.count - a.count || a.shape.localeCompare(b.shape));
  }, [lineups, rowsByName]);
  if (!data.length) return null;

  const cell = "px-2 py-1 text-center";
  const header = "px-2 py-1 font-semibold text-center";
  return (
    <table className="min-w-full text-[12px]">
      <thead><tr><th className={header}>Shape</th><th className={header}>Count</th><th className={header}>%</th></tr></thead>
      <tbody>{data.map(r => (
        <tr key={r.shape}><td className={cell}>{r.shape}</td><td className={`${cell} tabular-nums`}>{fmt0(r.count)}</td><td className={`${cell} tabular-nums`}>{fmt1(r.pct)}</td></tr>
      ))}</tbody>
    </table>
  );
}
