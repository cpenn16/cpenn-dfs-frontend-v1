// src/pages/nfl/NFLShowdownOptimizer.jsx
// FULL DROP-IN — v3.3
// Changes vs v3.2:
// - IF→THEN team scope control now includes slate teams directly in the dropdown
//   (e.g., "PHI — Philadelphia Eagles"). Selecting one sets team_scope=exact_team
//   and team_exact=<ABBR>. Much easier to discover.
// - Stable sorting and all previous fixes retained.

import React, { useEffect, useMemo, useRef, useState } from "react";
import API_BASE from "../../utils/api";

/* ----------------------------- helpers ----------------------------- */
const clamp = (v, lo = 0, hi = 1e9) => Math.max(lo, Math.min(hi, Number.isFinite(+v) ? +v : lo));
const num = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/\$/g, "").replace(/[,  \s]/g, "").replace(/%/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const fmt0 = (n) => (Number.isFinite(n) ? n.toLocaleString() : "—");
const fmt1 = (n) => (Number.isFinite(n) ? (+n).toFixed(1) : "—");
const escapeCSV = (s) => { const v = String(s ?? ""); return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };

// persistent state
const useStickyState = (key, init) => {
  const [v, setV] = useState(init);
  useEffect(() => { try { setV(JSON.parse(localStorage.getItem(key)) ?? init); } catch { setV(init); } }, [key]);
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
};

/* ----------------------------- team meta --------------------------- */
const NFL_TEAMS = {
  ARI:{city:"Arizona",nickname:"Cardinals"}, ATL:{city:"Atlanta",nickname:"Falcons"},
  BAL:{city:"Baltimore",nickname:"Ravens"}, BUF:{city:"Buffalo",nickname:"Bills"},
  CAR:{city:"Carolina",nickname:"Panthers"}, CHI:{city:"Chicago",nickname:"Bears"},
  CIN:{city:"Cincinnati",nickname:"Bengals"}, CLE:{city:"Cleveland",nickname:"Browns"},
  DAL:{city:"Dallas",nickname:"Cowboys"}, DEN:{city:"Denver",nickname:"Broncos"},
  DET:{city:"Detroit",nickname:"Lions"}, GB:{city:"Green Bay",nickname:"Packers"},
  HOU:{city:"Houston",nickname:"Texans"}, IND:{city:"Indianapolis",nickname:"Colts"},
  JAX:{city:"Jacksonville",nickname:"Jaguars"}, KC:{city:"Kansas City",nickname:"Chiefs"},
  LAC:{city:"Los Angeles",nickname:"Chargers"}, LAR:{city:"Los Angeles",nickname:"Rams"},
  LV:{city:"Las Vegas",nickname:"Raiders"}, MIA:{city:"Miami",nickname:"Dolphins"},
  MIN:{city:"Minnesota",nickname:"Vikings"}, NE:{city:"New England",nickname:"Patriots"},
  NO:{city:"New Orleans",nickname:"Saints"}, NYG:{city:"New York",nickname:"Giants"},
  NYJ:{city:"New York",nickname:"Jets"}, PHI:{city:"Philadelphia",nickname:"Eagles"},
  PIT:{city:"Pittsburgh",nickname:"Steelers"}, SEA:{city:"Seattle",nickname:"Seahawks"},
  SF:{city:"San Francisco",nickname:"49ers"}, TB:{city:"Tampa Bay",nickname:"Buccaneers"},
  TEN:{city:"Tennessee",nickname:"Titans"}, WAS:{city:"Washington",nickname:"Commanders"},
};
const TEAM_COLORS = { ARI:"#97233F", ATL:"#A71930", BAL:"#241773", BUF:"#00338D", CAR:"#0085CA", CHI:"#0B162A",
  CIN:"#FB4F14", CLE:"#311D00", DAL:"#041E42", DEN:"#FB4F14", DET:"#0076B6", GB:"#203731",
  HOU:"#03202F", IND:"#002C5F", JAX:"#006778", KC:"#E31837", LAC:"#0080C6", LAR:"#003594",
  LV:"#000000", MIA:"#008E97", MIN:"#4F2683", NE:"#002244", NO:"#D3BC8D", NYG:"#0B2265",
  NYJ:"#125740", PHI:"#004C54", PIT:"#FFB612", SEA:"#002244", SF:"#AA0000", TB:"#D50A0A",
  TEN:"#0C2340", WAS:"#5A1414" };
const hexToRGB = (hex) => { const h = (hex || "#888").replace("#", ""); const v = parseInt(h, 16); return { r: (v>>16)&255, g:(v>>8)&255, b:v&255 }; };
const readableText = (hex) => { const {r,g,b} = hexToRGB(hex); const L = 0.2126*r + 0.7152*g + 0.0722*b; return L < 140 ? "#FFFFFF" : "#111111"; };
const TeamPill = ({ abbr, title }) => { const bg = TEAM_COLORS[abbr] || "#E5E7EB"; const fg = readableText(bg); return <span className="px-2 py-0.5 rounded" style={{backgroundColor:bg,color:fg}} title={title || abbr}>{abbr||"—"}</span>; };

/* --------- tag normalization for DK CPT vs FD MVP (state keys) ----- */
const normCapTag = (t) => (t === "FLEX" ? "FLEX" : "CPT");
const tagKey = (name, tag) => `${name}::${normCapTag(tag)}`;

/* ------------------------------ data IO ---------------------------- */
const SOURCE = "/data/nfl/showdown/latest/projections.json";
const SITE_IDS_SOURCE = "/data/nfl/showdown/latest/site_ids.json";

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
        const body = ct.includes("application/json") ? await res.json() : JSON.parse(await res.text());
        if (alive) { setData(body); setErr(null); }
      } catch (e) { if (alive) { setData(null); setErr(e); } }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [url]);
  return { data, err, loading };
}

/* ----------------------------- API (SSE) --------------------------- */
async function solveStreamShowdown(payload, onItem, onDone) {
  const res = await fetch(`${API_BASE}/solve_showdown_stream`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!res.ok || !res.body) throw new Error("Stream failed to start");
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n"); buf = parts.pop() ?? "";
    for (const chunk of parts) {
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.done) onDone?.(evt); else onItem?.(evt);
      } catch {}
    }
  }
}

/* ------------------------------ SITES ------------------------------ */
const SITES = {
  dk: { key: "dk", label: "DraftKings", logo: "/logos/dk.png", cap: 50000, capTag: "CPT", mvpFieldPrefix: "DK CPT", flexFieldPrefix: "DK FLEX" },
  fd: { key: "fd", label: "FanDuel",  logo: "/logos/fd.png", cap: 60000, capTag: "MVP", mvpFieldPrefix: "FD MVP", flexFieldPrefix: "FD FLEX" },
};

/* ------------- robust field getter (handles many spellings) -------- */
function pick(obj, variants, fallback = 0) {
  for (const v of variants) {
    if (obj == null) break;
    for (const k of Object.keys(obj)) {
      if (k.toLowerCase().replace(/[^a-z0-9]/g,"") === v.toLowerCase().replace(/[^a-z0-9]/g,"")) {
        return obj[k];
      }
    }
  }
  return fallback;
}

/* --------------------- name/pos/team normalization ----------------- */
function normName(s){return String(s||"").toLowerCase().replace(/\u2019/g,"'").replace(/\./g,"").replace(/,\s*(jr|sr)\b/g,"").replace(/\b(jr|sr)\b/g,"").replace(/[^a-z' -]/g,"").replace(/\s+/g," ").trim();}
function normTeam(s){return (s||"").toUpperCase().trim();}
function normPosRaw(s){return (s||"").toUpperCase().trim();}
function normPos(s){ const p = normPosRaw(s); return (p === "D" || p === "DEF") ? "DST" : p; }
function inferTeamFromNameForDST(name) {
  const nm = normName(name);
  for (const [abbr, t] of Object.entries(NFL_TEAMS)) {
    const nick = normName(t.nickname); const city = normName(t.city); const full = normName(`${t.city} ${t.nickname}`);
    if (nm === nick || nm === city || nm === full || nm.includes(nick) || nm.includes(city) || nm.includes(full)) return abbr;
  } return "";
}

/* ============================== page =============================== */
export default function NFLShowdownOptimizer() {
  const { data, err, loading } = useJson(SOURCE);
  const { data: siteIds } = useJson(SITE_IDS_SOURCE);

  const [site, setSite] = useStickyState("sd.site", "dk");
  const cfg = SITES[site];

  const [numLineups, setNumLineups] = useStickyState("sd.N", 20);
  const [maxSalary, setMaxSalary] = useStickyState(`sd.${site}.cap`, cfg.cap);
  useEffect(() => { setMaxSalary(SITES[site].cap); }, [site]);

  const [optBy, setOptBy] = useStickyState("sd.optBy", "proj");
  const [randomness, setRandomness] = useStickyState("sd.rand", 0);
  const [globalMax, setGlobalMax] = useStickyState("sd.gmax", 100);
  const [maxOverlap, setMaxOverlap] = useStickyState("sd.maxOverlap", 5);
  const [lineupPownCap, setLineupPownCap] = useStickyState("sd.lineupPownCap", "");
  const [q, setQ] = useState("");

  const [locks, setLocks] = useState(() => new Set());
  const [excls, setExcls] = useState(() => new Set());
  const [boost, setBoost] = useState(() => ({}));
  const [minPct, setMinPct] = useState(() => ({}));
  const [maxPct, setMaxPct] = useState(() => ({}));

  // team override per slate team
  const [teamMaxPct, setTeamMaxPct] = useStickyState(`sd.${site}.teamMax`, {});

  // IF→THEN rules
  const [rules, setRules] = useStickyState(`sd.${site}.rules`, []);

  // CPT/MVP vs FLEX table filter
  const [tagFilter, setTagFilter] = useStickyState(`sd.${site}.tagFilter`, "ALL");

  // exposure tab state
  const [exposureView, setExposureView] = useStickyState(`sd.${site}.exposureView`, "ALL"); // ALL|CAP|FLEX

  // builds & results
  const [lineups, setLineups] = useState([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [progressUI, setProgressUI] = useState(0);
  const [progressActual, setProgressActual] = useState(0);
  const tickRef = useRef(null);

  useEffect(() => {
    if (!isOptimizing) return; clearInterval(tickRef.current);
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
    setLineups([]); setProgressActual(0); setProgressUI(0); setIsOptimizing(false);
    setLocks(new Set()); setExcls(new Set()); setBoost({}); setMinPct({}); setMaxPct({});
  }, [site]);

  /* ------------------------------ rows ------------------------------ */
  const rows = useMemo(() => {
    if (!data) return [];
    const arr = Array.isArray(data?.rows) ? data.rows : Array.isArray(data?.players) ? data.players : Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

    const siteKey = cfg.key; // dk|fd

    // pull FD list once
    const fdList = Array.isArray(siteIds?.fd) ? siteIds.fd : (siteIds?.sites?.fd ?? []);

    const mapped = arr.map((r) => {
      const name = r.player ?? r.Player ?? r.Name ?? r.playerName ?? r.name ?? "";
      const pos  = normPos(r.pos ?? r.Pos ?? r.POS ?? r.Position ?? r.position ?? "");
      let team = normTeam(r.team ?? r.Team ?? r.Tm ?? r.TEAM ?? r.team_abbr ?? r.TeamAbbrev ?? "");
      const opp  = normTeam(r.opp  ?? r.Opp  ?? r.OPP ?? r.Opponent ?? r.opponent ?? "");
      if (siteKey === "fd" && pos === "DST" && !team) team = inferTeamFromNameForDST(name) || team;

      const flex_proj = num(pick(r, [`${siteKey} proj`, `${SITES[siteKey].flexFieldPrefix} proj`, "proj","projection","points"], 0));
      const flex_floor = num(pick(r, [`${siteKey} floor`, `${SITES[siteKey].flexFieldPrefix} floor`, "floor"], 0));
      const flex_ceil  = num(pick(r, [`${siteKey} ceil`, `${SITES[siteKey].flexFieldPrefix} ceil`, "ceiling","ceil"], 0));
      const flex_pown  = num(pick(r, [`${siteKey} pown%`, `${SITES[siteKey].flexFieldPrefix} pown%`, "pown%","pown"])) / 100;
      const flex_opt   = num(pick(r, [`${siteKey} opt%`, `${SITES[siteKey].flexFieldPrefix} opt%`, "opt%","opt"])) / 100;
      let flex_sal   = num(pick(r, [`${siteKey} sal`, `${SITES[siteKey].flexFieldPrefix} sal`, "salary", "sal", `${siteKey} salary`, `${SITES[siteKey].flexFieldPrefix} salary`, `${siteKey}_sal`, `${siteKey}_salary`, `${siteKey} flex sal`, `${siteKey} flex salary`, `${siteKey}_flex_sal`, `${siteKey}_flex_salary` ], 0));

      const cap_proj = num(pick(r, [`${siteKey} ${SITES[siteKey].capTag.toLowerCase()} proj`, `${SITES[siteKey].mvpFieldPrefix} proj`, `${siteKey}_${SITES[siteKey].capTag.toLowerCase()}_proj`], flex_proj * 1.5));
      const cap_floor = num(pick(r, [`${siteKey} ${SITES[siteKey].capTag.toLowerCase()} floor`, `${SITES[siteKey].mvpFieldPrefix} floor`, `${siteKey}_${SITES[siteKey].capTag.toLowerCase()}_floor`], flex_floor * 1.5));
      const cap_ceil  = num(pick(r, [`${siteKey} ${SITES[siteKey].capTag.toLowerCase()} ceil`, `${SITES[siteKey].mvpFieldPrefix} ceil`, `${siteKey}_${SITES[siteKey].capTag.toLowerCase()}_ceil`], flex_ceil * 1.5));
      const cap_pown  = num(pick(r, [`${siteKey} ${SITES[siteKey].capTag.toLowerCase()} pown%`, `${SITES[siteKey].mvpFieldPrefix} pown%`, `${siteKey}_${SITES[siteKey].capTag.toLowerCase()}_pown%`], flex_pown * 100)) / 100;
      const cap_opt   = num(pick(r, [`${siteKey} ${SITES[siteKey].capTag.toLowerCase()} opt%`, `${SITES[siteKey].mvpFieldPrefix} opt%`, `${siteKey}_${SITES[siteKey].capTag.toLowerCase()}_opt%`], flex_opt * 100)) / 100;
      let cap_sal   = num(pick(r, [`${siteKey} ${SITES[siteKey].capTag.toLowerCase()} sal`, `${SITES[siteKey].mvpFieldPrefix} sal`, `${siteKey}_${SITES[siteKey].capTag.toLowerCase()}_sal`, `${siteKey} ${SITES[siteKey].capTag.toLowerCase()} salary`, `${SITES[siteKey].mvpFieldPrefix} salary`, `${siteKey}_${SITES[siteKey].capTag.toLowerCase()}_salary`], 0)) || Math.round(flex_sal * 1.5);

      // ---------- FD DST salary lenient patch ----------
      if (siteKey === "fd" && pos === "DST" && (!flex_sal || flex_sal === 0)) {
        const guess = fdList.find(x => normTeam(x.team) === team && normPosRaw(x.pos) === "D");
        if (guess) {
          const sFlex = num(guess.salary_flex || guess.salary || 0);
          const sMvp  = num(guess.salary_mvp || Math.round(sFlex * 1.5));
          if (!flex_sal) flex_sal = sFlex;
          if (!cap_sal) cap_sal = sMvp;
        }
      }
      // -------------------------------------------------

      return { name, pos, team, opp, proj: flex_proj, floor: flex_floor, ceil: flex_ceil, pown: flex_pown, opt: flex_opt, salary: flex_sal, cap_proj, cap_floor, cap_ceil, cap_pown, cap_opt, cap_salary: cap_sal, __raw: r };
    });

    return mapped.filter((r) => r.name && r.pos);
  }, [data, site, cfg, siteIds]);

  /* slate teams (only 2 in showdown) */
  const slateTeams = useMemo(() => {
    const s = new Set(); for (const r of rows) { if (r.team) s.add(r.team); if (r.opp) s.add(r.opp); } return [...s].slice(0, 2);
  }, [rows]);

  /* -------------------- table + search + sorting ------------------- */
  const [sort, setSortState] = useState({ col: "proj", dir: "desc" }); // stable sorting state

  const usagePct = useMemo(() => {
    if (!lineups.length) return {}; const m = new Map(); for (const L of lineups) { const [cap, ...flex] = L.players; m.set(cap + "::CPT", (m.get(cap + "::CPT") || 0) + 1); for (const n of flex) m.set(n + "::FLEX", (m.get(n + "::FLEX") || 0) + 1); }
    const total = Math.max(1, lineups.length); const out = {}; for (const [k, cnt] of m.entries()) out[k] = (cnt / total) * 100; return out;
  }, [lineups]);

  const expandedRows = useMemo(() => {
    const res = []; for (const r of rows) { res.push({ ...r, tag: "CPT",  projDisplay: r.cap_proj,  floorDisplay: r.cap_floor,  ceilDisplay: r.cap_ceil,  pownDisplay: r.cap_pown, optDisplay: r.cap_opt, salaryDisplay: r.cap_salary, key: r.name + "::CPT" }); res.push({ ...r, tag: "FLEX", projDisplay: r.proj, floorDisplay: r.floor, ceilDisplay: r.ceil, pownDisplay: r.pown, optDisplay: r.opt, salaryDisplay: r.salary, key: r.name + "::FLEX" }); } return res;
  }, [rows]);

  // Filter (by tag + search)
  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const okTag = (t) => tagFilter === "ALL" ? true : (t === "FLEX" ? "FLEX" : cfg.capTag) === tagFilter;
    return expandedRows.filter((r) =>
      okTag(r.tag) &&
      (
        !needle ||
        r.name.toLowerCase().includes(needle) ||
        r.team.toLowerCase().includes(needle) ||
        r.opp.toLowerCase().includes(needle) ||
        r.pos.toLowerCase().includes(needle) ||
        String(r.salaryDisplay).includes(needle)
      )
    );
  }, [expandedRows, q, tagFilter, cfg.capTag]);

  // Comparator (stable)
  const cmp = useMemo(() => {
    const { col, dir } = sort;
    const mult = dir === "asc" ? 1 : -1;

    return (a, b) => {
      if (["tag","pos","team","opp"].includes(col)) {
        const va = (col === "tag" ? (a.tag === "FLEX" ? "FLEX" : cfg.capTag) :
                    col === "pos" ? a.pos :
                    col === "team" ? a.team : a.opp) || "";
        const vb = (col === "tag" ? (b.tag === "FLEX" ? "FLEX" : cfg.capTag) :
                    col === "pos" ? b.pos :
                    col === "team" ? b.team : b.opp) || "";
        if (va < vb) return -1 * mult;
        if (va > vb) return  1 * mult;
        return a.name.localeCompare(b.name) * mult;
      }

      const map = {
        salary: "salaryDisplay",
        proj:   "projDisplay",
        floor:  "floorDisplay",
        ceil:   "ceilDisplay",
        pown:   "pownDisplay",
        opt:    "optDisplay",
        usage:  null
      };

      const aV = col === "usage" ? (usagePct[a.key] || 0) : (a[map[col]] ?? 0);
      const bV = col === "usage" ? (usagePct[b.key] || 0) : (b[map[col]] ?? 0);

      if (aV < bV) return -1 * mult;
      if (aV > bV) return  1 * mult;
      return a.name.localeCompare(b.name) * mult;
    };
  }, [sort, cfg.capTag, usagePct]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort(cmp);
  }, [filteredRows, cmp]);

  const sortable = new Set(["tag","pos","team","opp","salary","proj","floor","ceil","pown","opt","usage"]);
  const setSort = (col) => {
    if (!sortable.has(col)) return;
    setSortState((prev) => {
      const dir = prev.col === col ? (prev.dir === "asc" ? "desc" : "asc") : "desc";
      return { col, dir };
    });
  };
  const sortArrow = (key) => sort.col === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "";

  /* ------------------------------ actions ---------------------------- */
  const toggleLock = (name, tag) => setLocks((s) => { const k = tagKey(name, tag); const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleExcl = (name, tag) => setExcls((s) => { const k = tagKey(name, tag); const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const bumpBoost = (name, step) => setBoost((m) => ({ ...m, [name]: clamp((m[name] || 0) + step, -6, 6) }));

  const resetConstraints = () => { setLocks(new Set()); setExcls(new Set()); setBoost({}); setMinPct({}); setMaxPct({}); setRules([]); setTeamMaxPct({}); };

  /* --------------------------- optimize (SSE) ------------------------ */
  async function optimize() {
    if (!rows.length) return; setLineups([]); setProgressActual(0); setProgressUI(0); setIsOptimizing(true);
    const basePos = ["QB","RB","WR","TE","DST","K"]; const slots = [ { name: cfg.capTag === "CPT" ? "CPT" : "MVP", eligible: basePos }, ...Array.from({length:5},()=>({ name:"FLEX", eligible: basePos })) ];

    const players = rows.map((r) => ({ name: r.name, pos: r.pos, team: r.team, opp: r.opp, salary: Math.round(r.salary || 0), proj: r.proj || 0, floor: r.floor || 0, ceil: r.ceil || 0, pown: r.pown || 0, opt: r.opt || 0, cap_salary: Math.round(r.cap_salary || Math.round(r.salary * 1.5)), cap_proj: r.cap_proj, cap_floor: r.cap_floor, cap_ceil: r.cap_ceil, cap_pown: r.cap_pown, cap_opt: r.cap_opt }));

    const apiRules = (rules || []).map((r) => ({
      if_slot: r.if_slot || (cfg.capTag),
      if_pos: r.if_pos || ["QB"],
      then_at_least: Math.max(0, Number(r.then_at_least) || 0),
      from_pos: r.from_pos || ["WR","TE"],
      team_scope: r.team_scope || "any",
      team_exact: (r.team_scope === "exact_team" && r.team_exact) ? r.team_exact : null
    }));

    // prepare team max overrides (only provided teams)
    const teamMax = {}; for (const tm of slateTeams) { const v = clamp(Number(teamMaxPct[tm]) || 0, 0, 100); if (String(teamMaxPct[tm] ?? "").trim() !== "") teamMax[tm] = v; }

    const payload = {
      site,
      slots,
      players,
      n: Math.max(1, Number(numLineups) || 1),
      cap: Math.min(cfg.cap, Number(maxSalary) || cfg.cap),
      objective: optBy,
      locks: Array.from(locks),
      excludes: Array.from(excls),
      boosts: boost,
      randomness: clamp(Number(randomness) || 0, 0, 100),
      global_max_pct: clamp(Number(globalMax) || 100, 0, 100),
      team_max_pct: teamMax,
      min_pct: Object.fromEntries(Object.entries(minPct).map(([k, v]) => [k, clamp(Number(v) || 0, 0, 100)])),
      max_pct: Object.fromEntries(Object.entries(maxPct).map(([k, v]) => [k, clamp(Number(v) || 100, 0, 100)])),
      time_limit_ms: 1500,
      max_overlap: clamp(Number(maxOverlap) || 0, 0, 5),
      lineup_pown_max: String(lineupPownCap).trim() === "" ? null : clamp(Number(lineupPownCap) || 0, 0, 100),
      rules: apiRules
    };

    const out = [];
    try {
      await solveStreamShowdown(
        payload,
        (evt) => {
          const L = { players: evt.drivers, salary: evt.salary, total: evt.total };
          out.push(L); setLineups((prev) => [...prev, L]); setProgressActual(out.length);
        },
        () => { setProgressActual(out.length || payload.n); setProgressUI(out.length || payload.n); setIsOptimizing(false); clearInterval(tickRef.current); }
      );
    } catch (e) {
      alert(`Solve failed: ${String(e?.message || e)}`);
      setIsOptimizing(false); clearInterval(tickRef.current);
    }
  }

  /* --------------------------- table schema ------------------------- */
  const TABLE_COLS = [
    { key: "lock", label: "Lock" },
    { key: "excl", label: "Excl" },
    { key: "boosts", label: "Boosts" },
    { key: "tag", label: cfg.capTag, sortable: true },
    { key: "name", label: "Player" },
    { key: "team", label: "Tm", sortable: true },
    { key: "opp", label: "Opp", sortable: true },
    { key: "pos", label: "Pos", sortable: true },
    { key: "salary", label: "Salary", sortable: true },
    { key: "proj", label: "Proj", sortable: true },
    { key: "floor", label: "Floor", sortable: true },
    { key: "ceil", label: "Ceiling", sortable: true },
    { key: "pown", label: "pOWN%", sortable: true },
    { key: "opt", label: "Opt%", sortable: true },
    { key: "min", label: "Min%" },
    { key: "max", label: "Max%" },
    { key: "usage", label: "Usage%", sortable: true }
  ];

  const totalLabel = optBy === "proj" ? "Proj" : optBy === "floor" ? "Floor" : optBy === "ceil" ? "Ceil" : optBy === "pown" ? "pOWN%" : "Opt%";
  const cell = "px-2 py-1 text-center"; const header = "px-2 py-1 font-semibold text-center"; const textSz = "text-[12px]";

  /* --------------------- right-panel aggregates --------------------- */
  function filterByExposureView(names, view){ if(view==="ALL") return names; return names.filter((_,i)=> view==="CAP" ? i===0 : i>0 ); }
  const exposures = useMemo(() => {
    const map = new Map(); const count = lineups.length || 1;
    for (const L of lineups) for (const n of filterByExposureView(L.players, exposureView)) map.set(n, (map.get(n) || 0) + 1);
    return [...map.entries()].map(([name, c]) => ({ name, count: c, pct: +(100*c/count).toFixed(1) })).sort((a,b)=>b.pct-a.pct || a.name.localeCompare(b.name));
  }, [lineups, exposureView]);

  const teamExposure = useMemo(() => {
    const cnt = new Map(); let slotsCount = 0;
    for (const L of lineups) { const names = filterByExposureView(L.players, exposureView); slotsCount += names.length; for (const n of names) { const meta = rows.find(r => r.name === n); const tm = meta?.team || ""; if (!tm) continue; cnt.set(tm, (cnt.get(tm) || 0) + 1); }}
    return [...cnt.entries()].map(([tm, c]) => ({ team: tm, count: c, pct: slotsCount ? +(100*c/slotsCount).toFixed(1) : 0 })) .sort((a,b)=>b.pct-a.pct || a.team.localeCompare(b.team));
  }, [lineups, rows, exposureView]);

  const stackShapes = useMemo(() => {
    const shapes = new Map(); for (const L of lineups) { const teams = filterByExposureView(L.players, exposureView).map((n)=>rows.find(r=>r.name===n)?.team).filter(Boolean); if (!teams.length) continue; const a = teams.filter(t=>t===teams[0]).length; const b = teams.length - a; const key = `${Math.max(a,b)}-${Math.min(a,b)}`; shapes.set(key, (shapes.get(key)||0)+1); }
    const total = lineups.length || 1; return [...shapes.entries()].map(([shape, c]) => ({ shape, count: c, pct: +(100*c/total).toFixed(1) })).sort((a,b)=>b.count-a.count);
  }, [lineups, rows, exposureView]);

  /* ---------------------------- render ------------------------------ */
  return (
    <div className="px-4 md:px-6 py-5">
      <h1 className="text-2xl md:text-3xl font-extrabold mb-2">NFL — Showdown Optimizer</h1>

      {/* site toggle + view */}
      <div className="mb-3 flex gap-2 items-center">
        {Object.keys(SITES).map((s) => (
          <button key={s} onClick={() => setSite(s)} className={`px-3 py-1.5 rounded-full border text-sm inline-flex items-center gap-2 ${site === s ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-white border-gray-300 text-gray-700"}`}>
            <img src={SITES[s].logo} alt="" className="w-4 h-4" /><span>{SITES[s].label}</span>
          </button>
        ))}
        <div className="ml-2 inline-flex rounded-full border overflow-hidden">
          {["ALL", cfg.capTag, "FLEX"].map((t) => (
            <button key={t} onClick={() => setTagFilter(t)} className={`px-2 py-1 text-sm ${tagFilter===t ? "bg-blue-600 text-white" : "bg-white"}`}>{t}</button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="text-sm">Lineups</label>
          <input className="w-16 border rounded-md px-2 py-1 text-sm" value={numLineups} onChange={(e) => setNumLineups(e.target.value)} />
          <label className="text-sm">Max salary</label>
          <input className="w-24 border rounded-md px-2 py-1 text-sm" value={maxSalary} onChange={(e) => setMaxSalary(e.target.value)} />
          <label className="text-sm">Max Overlap</label>
          <input className="w-14 border rounded-md px-2 py-1 text-sm" value={maxOverlap} onChange={(e) => setMaxOverlap(e.target.value)} title="How many FLEX names may overlap vs prior lineups" />
          <label className="text-sm">Optimize by</label>
          <select className="border rounded-md px-2 py-1 text-sm" value={optBy} onChange={(e)=>setOptBy(e.target.value)}>
            <option value="proj">Projection</option><option value="floor">Floor</option><option value="ceil">Ceiling</option><option value="pown">pOWN%</option><option value="opt">Opt%</option>
          </select>
          <button className="px-2.5 py-1.5 text-sm rounded-lg bg-white border hover:bg-gray-50" onClick={resetConstraints}>Reset</button>
          <button className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700" onClick={optimize}>{`Optimize ${numLineups}`}</button>
        </div>
      </div>

      {/* global knobs */}
      <div className="mb-2 flex flex-wrap gap-3 items-end">
        <label className="text-sm">Randomness %</label>
        <input className="w-16 border rounded-md px-2 py-1 text-sm" value={randomness} onChange={(e) => setRandomness(e.target.value)} />
        <label className="text-sm">Global Max %</label>
        <input className="w-16 border rounded-md px-2 py-1 text-sm" value={globalMax} onChange={(e) => setGlobalMax(e.target.value)} />
        <label className="text-sm">Max lineup pOWN% (sum)</label>
        <input className="w-20 border rounded-md px-2 py-1 text-sm" placeholder="—" value={lineupPownCap} onChange={(e) => setLineupPownCap(e.target.value)} />
        <input className="border rounded-md px-3 py-1.5 w-80 text-sm ml-auto" placeholder="Search player / team / pos…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {/* IF → THEN rules */}
      <div className="mb-3 rounded-md border p-2">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] text-gray-600">Conditional Rules (IF → THEN)</div>
          <button className="px-2 py-1 text-sm rounded-md border hover:bg-gray-50" onClick={() => setRules((R) => [...R, { if_slot: cfg.capTag, if_pos:["QB"], then_at_least:1, from_pos:["WR","TE"], team_scope:"same_team", team_exact:"" }])}>+ Add Rule</button>
        </div>
        {rules.length === 0 ? (
          <div className="text-xs text-gray-500">No rules yet.</div>
        ) : (
          <div className="space-y-2">
            {rules.map((r, i) => {
              const teamSelectValue = (r.team_scope === "exact_team" && r.team_exact)
                ? `exact:${r.team_exact}`
                : (r.team_scope || "any");

              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">IF</span>
                  <div className="inline-flex rounded-md overflow-hidden border">
                    {[cfg.capTag, "FLEX"].map((slot) => (
                      <button key={slot} className={`px-2 py-1 text-sm ${ (r.if_slot||cfg.capTag)===slot ? "bg-blue-600 text-white" : "bg-white" }`} onClick={()=>setRules((R)=>{const c=[...R]; c[i]={...c[i], if_slot:slot}; return c;})}>{slot}</button>
                    ))}
                  </div>
                  <span className="text-sm">is</span>
                  {["QB","RB","WR","TE","DST","K"].map((p) => (
                    <button key={p} className={`px-2 py-1 rounded border text-sm ${r.if_pos?.includes(p) ? "bg-blue-600 text-white" : "bg-white"}`} onClick={() => setRules((R) => { const copy=[...R]; const cur=new Set(copy[i].if_pos||[]); cur.has(p)?cur.delete(p):cur.add(p); copy[i]={...copy[i], if_pos:[...cur]}; return copy; })}>{p}</button>
                  ))}
                  <span className="text-sm">THEN require at least</span>
                  <input className="w-14 border rounded-md px-2 py-1 text-sm" value={r.then_at_least ?? 1} onChange={(e) => setRules((R)=>{const c=[...R]; c[i]={...c[i], then_at_least:e.target.value}; return c;})}/>
                  <span className="text-sm">from</span>
                  {["QB","RB","WR","TE","DST","K"].map((p) => (
                    <button key={p} className={`px-2 py-1 rounded border text-sm ${r.from_pos?.includes(p) ? "bg-green-600 text-white" : "bg-white"}`} onClick={() => setRules((R) => { const copy=[...R]; const cur=new Set(copy[i].from_pos||[]); cur.has(p)?cur.delete(p):cur.add(p); copy[i]={...copy[i], from_pos:[...cur]}; return copy; })}>{p}</button>
                  ))}

                  {/* Team scope + exact team combined dropdown */}
                  <select
                    className="border rounded-md px-2 py-1 text-sm"
                    value={teamSelectValue}
                    onChange={(e)=>{
                      const val = e.target.value;
                      setRules((R)=> {
                        const c=[...R];
                        if (val.startsWith("exact:")) {
                          const abbr = val.split(":")[1] || "";
                          c[i] = { ...c[i], team_scope: "exact_team", team_exact: abbr };
                        } else {
                          c[i] = { ...c[i], team_scope: val, team_exact: "" };
                        }
                        return c;
                      });
                    }}
                  >
                    <option value="same_team">same team</option>
                    <option value="opp_team">opp team</option>
                    <option value="any">any</option>
                    {/* exact team options (slate teams) */}
                    {slateTeams.map((abbr)=> {
                      const label = `${abbr} — ${(NFL_TEAMS[abbr]?.city ?? abbr)} ${NFL_TEAMS[abbr]?.nickname ?? ""}`.trim();
                      return <option key={abbr} value={`exact:${abbr}`}>{label}</option>;
                    })}
                  </select>

                  <button className="ml-auto px-2 py-1 text-sm rounded-md border hover:bg-gray-50" onClick={()=>setRules((R)=>R.filter((_,j)=>j!==i))}>Delete</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Team Max% Overrides — only slate teams */}
      <div className="mb-3 rounded-md border p-2">
        <div className="text-[11px] text-gray-600 mb-2">Team Max% Overrides (blank = use Global Max)</div>
        <div className="flex flex-wrap gap-3">
          {slateTeams.map((abbr)=> (
            <div key={abbr} className="flex items-center gap-1">
              <TeamPill abbr={abbr} />
              <input className="w-16 border rounded-md px-2 py-0.5 text-sm" placeholder="—" value={teamMaxPct[abbr] ?? ""} onChange={(e)=>setTeamMaxPct((m)=>({...m,[abbr]:e.target.value}))} />
            </div>
          ))}
        </div>
      </div>

      {/* progress bar */}
      <div className="mb-2 flex items-center gap-3">
        <div className="flex-1 max-w-xs h-2 bg-gray-200 rounded overflow-hidden"><div className="h-2 bg-blue-500 rounded transition-all duration-300" style={{ width: `${(Math.min(progressUI, Math.max(1, Number(numLineups) || 1)) / Math.max(1, Number(numLineups) || 1)) * 100}%` }} /></div>
        <div className="text-sm text-gray-600 min-w-[60px] text-right">{progressUI}/{numLineups}</div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Player table */}
        <div className="xl:col-span-2 rounded-xl border bg-white shadow-sm overflow-auto max-h=[720px]">
          <table className={`w-full border-separate ${textSz}`} style={{ borderSpacing: 0 }}>
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {TABLE_COLS.map(({ key, label, sortable }) => (
                  <th key={key} className={`${header} whitespace-nowrap ${sortable?"cursor-pointer":""} select-none`} onClick={() => sortable && setSort(key)}>
                    {label}{sortable ? <span className="opacity-60">{sortArrow(key)}</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (<tr><td className={`${header} text-gray-500`} colSpan={TABLE_COLS.length}>Loading…</td></tr>)}
              {err && (<tr><td className={`${header} text-red-600`} colSpan={TABLE_COLS.length}>Failed to load: {String(err)}</td></tr>)}
              {!loading && !err && sortedRows.map((r) => {
                const teamTitle = `${NFL_TEAMS[r.team]?.city ?? r.team} ${NFL_TEAMS[r.team]?.nickname ?? ""}`.trim();
                const oppTitle  = `${NFL_TEAMS[r.opp]?.city ?? r.opp} ${NFL_TEAMS[r.opp]?.nickname ?? ""}`.trim();
                return (
                  <tr key={r.key} className="odd:bg-white even:bg-gray-50 hover:bg-blue-50/60 transition-colors">
                    <td className={cell}><input type="checkbox" checked={locks.has(tagKey(r.name, r.tag))} onChange={() => toggleLock(r.name, r.tag)} /></td>
                    <td className={cell}><input type="checkbox" checked={excls.has(tagKey(r.name, r.tag))} onChange={() => toggleExcl(r.name, r.tag)} /></td>
                    <td className={cell}><div className="inline-flex items-center gap-1"><button className="px-1.5 py-0.5 border rounded" title="+3%" onClick={() => bumpBoost(r.name, +1)}>▲</button><span className="w-5 text-center">{boost[r.name] || 0}</span><button className="px-1.5 py-0.5 border rounded" title="-3%" onClick={() => bumpBoost(r.name, -1)}>▼</button></div></td>
                    <td className={cell}>{r.tag === "FLEX" ? "FLEX" : cfg.capTag}</td>
                    <td className={`${cell} whitespace-nowrap`}>{r.name}</td>
                    <td className={cell}><TeamPill abbr={r.team} title={teamTitle} /></td>
                    <td className={cell}><TeamPill abbr={r.opp} title={oppTitle} /></td>
                    <td className={cell}>{r.pos}</td>
                    <td className={`${cell} tabular-nums`}>{fmt0(r.salaryDisplay)}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1(r.projDisplay * (1 + 0.03 * (boost[r.name] || 0)))}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1(r.floorDisplay)}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1(r.ceilDisplay)}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1(r.pownDisplay * 100)}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1(r.optDisplay * 100)}</td>
                    <td className={cell}><div className="inline-flex items-center gap-1"><button className="px-1.5 py-0.5 border rounded" onClick={() => setMinPct((m) => ({ ...m, [r.name]: clamp((num(m[r.name]) || 0) - 5, 0, 100) }))} title="-5%">–</button><input className="w-12 border rounded px-1.5 py-0.5 text-center" value={String(minPct[r.name] ?? "")} onChange={(e) => setMinPct((m) => ({ ...m, [r.name]: e.target.value }))} placeholder="—" /><button className="px-1.5 py-0.5 border rounded" onClick={() => setMinPct((m) => ({ ...m, [r.name]: clamp((num(m[r.name]) || 0) + 5, 0, 100) }))} title="+5%">+</button></div></td>
                    <td className={cell}><div className="inline-flex items-center gap-1"><button className="px-1.5 py-0.5 border rounded" onClick={() => setMaxPct((m) => ({ ...m, [r.name]: clamp((num(m[r.name]) || 100) - 5, 0, 100) }))} title="-5%">–</button><input className="w-12 border rounded px-1.5 py-0.5 text-center" value={String(maxPct[r.name] ?? "")} onChange={(e) => setMaxPct((m) => ({ ...m, [r.name]: e.target.value }))} placeholder="—" /><button className="px-1.5 py-0.5 border rounded" onClick={() => setMaxPct((m) => ({ ...m, [r.name]: clamp((num(m[r.name]) || 100) + 5, 0, 100) }))} title="+5%">+</button></div></td>
                    <td className={`${cell} tabular-nums`}>{usagePct[r.key] != null ? fmt1(usagePct[r.key]) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Right panel: Exposure / Team / Stacks */}
        <div className="space-y-4">
          <div className="rounded-lg border bg-white p-3 max-h-[700px] overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Exposure</div>
              <div className="inline-flex border rounded-md overflow-hidden text-xs">
                {[["ALL","All"],["CAP",cfg.capTag],["FLEX","FLEX"]].map(([k,label])=> (
                  <button key={k} onClick={()=>setExposureView(k)} className={`px-2 py-1 ${exposureView===k?"bg-blue-600 text-white":"bg-white"}`}>{label}</button>
                ))}
              </div>
            </div>
            <table className={`w-full ${textSz}`}><thead><tr><th className={header}>Player</th><th className={header}>Count</th><th className={header}>Exposure %</th></tr></thead><tbody>
              {exposures.map((r,i)=>(<tr key={i} className="odd:bg-white even:bg-gray-50"><td className="px-2 py-1">{r.name}</td><td className="px-2 py-1 text-center">{r.count}</td><td className="px-2 py-1 text-center">{fmt1(r.pct)}</td></tr>))}
              {!exposures.length && (<tr><td className="px-2 py-1 text-center text-gray-500" colSpan={3}>No lineups yet.</td></tr>)}
            </tbody></table>
            <div className="mt-3">
              <div className="font-semibold mb-1">Team Exposure</div>
              <table className={`w-full ${textSz}`}><thead><tr><th className={header}>Team</th><th className={header}>Count</th><th className={header}>%</th></tr></thead><tbody>
                {teamExposure.map((t,i)=>(<tr key={i} className="odd:bg-white even:bg-gray-50"><td className="px-2 py-1 text-center"><TeamPill abbr={t.team}/></td><td className="px-2 py-1 text-center">{t.count}</td><td className="px-2 py-1 text-center">{fmt1(t.pct)}</td></tr>))}
                {!teamExposure.length && (<tr><td className="px-2 py-1 text-center text-gray-500" colSpan={3}>—</td></tr>)}
              </tbody></table>
            </div>
            <div className="mt-3">
              <div className="font-semibold mb-1">Stack Shapes</div>
              <table className={`w-full ${textSz}`}><thead><tr><th className={header}>Shape</th><th className={header}>Count</th><th className={header}>%</th></tr></thead><tbody>
                {stackShapes.map((s,i)=>(<tr key={i} className="odd:bg-white even:bg-gray-50"><td className="px-2 py-1 text-center">{s.shape}</td><td className="px-2 py-1 text-center">{s.count}</td><td className="px-2 py-1 text-center">{fmt1(s.pct)}</td></tr>))}
                {!stackShapes.length && (<tr><td className="px-2 py-1 text-center text-gray-500" colSpan={3}>—</td></tr>)}
              </tbody></table>
            </div>
          </div>
        </div>
      </div>

      {/* Results: list + cards */}
      {!!lineups.length && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
          <div className="rounded-lg border bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold">Lineups ({lineups.length})</h2>
              <div className="flex items-center gap-2"><button className="px-3 py-1.5 border rounded text-sm" onClick={() => downloadSiteLineupsCSV({ lineups, site, rows, siteIds, cfg })}>Export CSV (IDs)</button></div>
            </div>
            <div className="overflow-auto max-h-[440px]">
              <table className="min-w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
                <thead className="bg-gray-50"><tr><th className={header}>#</th><th className={header}>Salary</th><th className={header}>Total {totalLabel}</th><th className={header}>Players</th></tr></thead>
                <tbody>
                  {lineups.map((L, i) => (
                    <tr key={i} className="odd:bg-white even:bg-gray-50"><td className={cell}>{i + 1}</td><td className={`${cell} tabular-nums`}>{fmt0(L.salary)}</td><td className={`${cell} tabular-nums`}>{fmt1(L.total)}</td><td className={`${cell} leading-snug`}><span className="break-words">{L.players[0]} ({cfg.capTag}) • {L.players.slice(1).join(" • ")}</span></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cards like classic */}
          <div className="rounded-lg border bg-white p-3">
            <div className="font-semibold mb-2">Cards</div>
            <div className="grid md:grid-cols-2 gap-3">
              {lineups.map((L, idx) => (
                <div key={idx} className="rounded-xl border shadow-sm">
                  <div className="px-3 py-2 text-sm font-semibold">Lineup #{idx+1}</div>
                  <table className={`w-full ${textSz}`}><thead><tr><th className={header}>Slot</th><th className={header}>Player</th><th className={header}>Proj</th><th className={header}>Sal</th></tr></thead><tbody>
                    {L.players.map((n,i)=>{ const meta = rows.find(r=>r.name===n); if(!meta) return (<tr key={`${n}-${i}`} className="odd:bg-white even:bg-gray-50"><td className={cell}>{i===0?cfg.capTag:"FLEX"}</td><td className="px-2 py-1">{n}</td><td className={`${cell}`}>—</td><td className={`${cell}`}>—</td></tr>); const proj = i===0?meta.cap_proj:meta.proj; const sal = i===0?meta.cap_salary:meta.salary; return (<tr key={`${n}-${i}`} className="odd:bg-white even:bg-gray-50"><td className={cell}>{i===0?cfg.capTag:"FLEX"}</td><td className="px-2 py-1">{n}</td><td className={cell}>{fmt1(proj)}</td><td className={cell}>{fmt0(sal)}</td></tr>); })}
                    <tr className="bg-gray-50 font-medium"><td className={cell}>Totals</td><td className="px-2 py-1"></td><td className={cell}>{fmt1(L.total)}</td><td className={cell}>{fmt0(L.salary)}</td></tr>
                  </tbody></table>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------- CSV (IDs) ---------------------------- */
function orderPlayersForSiteShowdown(names, rowsMap) { return names.map((n)=>rowsMap.get(n)).filter(Boolean); }

function downloadSiteLineupsCSV({ lineups, site, rows, siteIds, cfg, fname = "nfl_showdown_ids.csv" }) {
  const siteKey = site === "fd" ? "fd" : "dk";
  const list = Array.isArray(siteIds?.[siteKey]) ? siteIds[siteKey] : (siteIds?.sites?.[siteKey] ?? []);

  const rowsByName = new Map(rows.map(r => [r.name, r]));

  // Key helpers
  const keyDK = (name, team, slot) => `${normName(name)}|${normTeam(team)}|${slot}`;
  const keyFD = (name, team, pos)  => `${normName(name)}|${normTeam(team)}|${pos}`;

  // Build indices
  const dkCPT = new Map();
  const dkFLEX = new Map();
  const fdAny = new Map();

  // FD prefix (group id)
  let fdPrefix = null;
  if (siteKey === "fd") {
    const prefCounts = new Map();
    for (const r of list) {
      const px = r.slateId ?? r.slate_id ?? r.groupId ?? r.group_id ?? r.lid ?? r.prefix;
      if (px != null && px !== "") { const key = String(px); prefCounts.set(key, (prefCounts.get(key) || 0) + 1); }
    }
    if (prefCounts.size === 1) fdPrefix = [...prefCounts.keys()][0];
    else if (prefCounts.size > 1) fdPrefix = [...prefCounts.entries()].sort((a,b) => b[1]-a[1])[0][0];
  }

  for (const r of list) {
    const team = normTeam(r.team ?? r.Team ?? r.team_abbr ?? r.TeamAbbrev);
    const nameFromSite = String(r.name ?? r.player ?? r.Player ?? r.raw_name ?? "");
    const baseId = String(r.id ?? r.ID ?? r.Id ?? r["DK ID"] ?? r["FD ID"] ?? r.dk_id ?? r.fd_id ?? "");
    const posOrSlot = String(r.pos ?? r.slottype ?? "").toUpperCase(); // DK: "FLEX"/"CPT" ; FD: positions like QB/WR/D/etc.
    if (siteKey === "dk") {
      if (posOrSlot === "CPT") dkCPT.set(keyDK(nameFromSite, team, "CPT"), { id: baseId, nameFromSite, team });
      else dkFLEX.set(keyDK(nameFromSite, team, "FLEX"), { id: baseId, nameFromSite, team });
    } else {
      const pos = normPos(posOrSlot); // map D/DEF → DST
      fdAny.set(keyFD(nameFromSite, team, pos), { id: baseId, nameFromSite, team, pos });
      // DST team aliases
      const meta = NFL_TEAMS[team];
      if (pos === "DST" && meta) {
        fdAny.set(keyFD(`${meta.city} ${meta.nickname}`, team, pos), { id: baseId, nameFromSite, team, pos });
        fdAny.set(keyFD(meta.nickname, team, pos), { id: baseId, nameFromSite, team, pos });
        fdAny.set(keyFD(meta.city, team, pos), { id: baseId, nameFromSite, team, pos });
      }
    }
  }

  const header = ["#", "Salary", "Total", "D1","D2","D3","D4","D5","D6"];

  const findDK = (name, team, slot) => {
    let rec = dkCPT.get(keyDK(name, team, slot)) || dkFLEX.get(keyDK(name, team, slot));
    if (rec) return rec;
    const meta = NFL_TEAMS[team];
    if (meta) {
      rec = (slot==="CPT"?dkCPT:dkFLEX).get(keyDK(meta.nickname, team, slot)) ||
            (slot==="CPT"?dkCPT:dkFLEX).get(keyDK(`${meta.city} ${meta.nickname}`, team, slot));
      if (rec) return rec;
    }
    for (const [k,v] of (slot==="CPT"?dkCPT:dkFLEX).entries()) {
      if (k.startsWith(`${normName(name)}|`) ) return v;
    }
    return null;
  };

  const findFD = (name, pos, team) => {
    return fdAny.get(keyFD(name, team, pos)) ||
           (()=>{ const meta = NFL_TEAMS[team]; if (!meta) return null;
                  return fdAny.get(keyFD(`${meta.city} ${meta.nickname}`, team, pos)) ||
                         fdAny.get(keyFD(meta.nickname, team, pos)) ||
                         fdAny.get(keyFD(meta.city, team, pos)); })();
  };

  const lines = lineups.map((L, idx) => {
    const ordered = orderPlayersForSiteShowdown(L.players, rowsByName);
    const cells = ordered.map((meta, i) => {
      const name = meta.name; const tm = meta.team;
      if (siteKey === "fd") {
        const pos = meta.pos; const rec = findFD(name, pos, tm); if (!rec) return escapeCSV(name);
        const outId = fdPrefix ? `${fdPrefix}-${rec.id}` : rec.id; return escapeCSV(`${outId}:${rec.nameFromSite || name}`);
      } else {
        const slot = i===0 ? "CPT" : "FLEX"; const rec = findDK(name, tm, slot); if (!rec) return escapeCSV(`${name}`);
        return escapeCSV(`${name} (${rec.id})`);
      }
    });
    while (cells.length < 6) cells.push("");
    return [idx + 1, L.salary, L.total.toFixed(1), ...cells].join(",");
  });

  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = fname; a.click(); URL.revokeObjectURL(url);
}
