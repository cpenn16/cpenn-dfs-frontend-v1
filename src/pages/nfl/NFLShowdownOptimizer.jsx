// src/pages/nfl/NFLShowdownOptimizer.jsx
// FULL DROP-IN — v3.9.5
// Fixes
// - Exposure tab: scope toggle (ALL / MVP|CPT / FLEX) with lineup-based denominators
// - ALL scope shows combined CPT/MVP+FLEX exposure per player (no slot split)
// - Build chips: persistent build history per site (select, delete, clear)
// - Main table: scrollable with sticky header
// - Streaming parser uses actual "\n" and "\n\n" sequences (kept)
// - CSV/solver logic unchanged

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

/* relative time (mm ago) */
const timeAgo = (iso) => {
  try {
    const d = typeof iso === "string" ? new Date(iso) : new Date(iso ?? 0);
    const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  } catch { return ""; }
};

// design tokens
const cls = {
  input: "h-8 px-2 text-sm rounded-md border border-gray-200 focus:ring-2 focus:ring-blue-200 focus:border-blue-400",
  btn: {
    primary: "h-8 px-4 rounded-md bg-blue-600 text-white hover:bg-blue-700",
    ghost:   "h-8 px-3 rounded-md border border-gray-200 hover:bg-gray-50",
    chip:    "px-3 py-1.5 text-xs font-medium rounded-full",
    iconSm:  "inline-flex items-center justify-center w-6 h-6 rounded-md border border-gray-200 hover:bg-gray-50"
  },
  card: "rounded-2xl border border-gray-200 bg-white shadow-sm",
  tableHead: "px-2 py-2 font-semibold text-xs text-gray-600 text-center select-none",
  cell: "px-2 py-1.5 text-center"
};

// persistent state
const useStickyState = (key, init) => {
  const [v, setV] = useState(init);
  useEffect(() => { try { setV(JSON.parse(localStorage.getItem(key)) ?? init); } catch { setV(init); } }, [key]);
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
};

// persistent Set (stored as array under the hood)
const useStickySet = (key, initArr = []) => {
  const [arr, setArr] = useStickyState(key, initArr);
  const set = useMemo(() => new Set(arr), [arr]);
  const setSet = (updater) => {
    setArr((prev) => {
      const next = typeof updater === "function" ? updater(new Set(prev)) : updater;
      return Array.from(next);
    });
  };
  return [set, setSet];
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
const TeamPill = ({ abbr, title }) => { const bg = TEAM_COLORS[abbr] || "#E5E7EB"; const fg = readableText(bg); return <span className="px-2 py-0.5 rounded text-[11px]" style={{backgroundColor:bg,color:fg}} title={title || abbr}>{abbr||"—"}</span>; };

/* --------- tag normalization for DK CPT vs FD MVP (state keys) ----- */
const makeTagKey = (capTag) => (name, tag) => `${name}::${(tag === "FLEX" ? "FLEX" : capTag)}`;

/* ------------------------------ data IO ---------------------------- */
const SOURCE = "/data/nfl/showdown/latest/projections.json";
const SITE_IDS_SOURCE = "/data/nfl/showdown/latest/site_ids.json";

function useJson(url, { autoMs = 0, enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [lastModified, setLastModified] = useState(null);

  const fetchOnce = async () => {
    try {
      setLoading(true);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const body = ct.includes("application/json") ? await res.json() : JSON.parse(await res.text());
      setData(body);
      setErr(null);
      setFetchedAt(new Date());
      const lm = res.headers.get("last-modified");
      if (lm) setLastModified(new Date(lm));
    } catch (e) {
      setData(null);
      setErr(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchOnce();
    let id = null;
    if (enabled && autoMs > 0) {
      id = setInterval(() => alive && fetchOnce(), autoMs);
    }
    return () => { alive = false; if (id) clearInterval(id); };
  }, [url, autoMs, enabled]);

  return { data, err, loading, fetchedAt, lastModified, refetch: fetchOnce };
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
  const [auto, setAuto] = useStickyState("sd.autoRefresh", true);
  const { data, err, loading, fetchedAt, lastModified, refetch } = useJson(SOURCE, { autoMs: auto ? 60000 : 0, enabled: true });
  const meta = useJson(SITE_IDS_SOURCE, { autoMs: auto ? 60000 : 0, enabled: true });

  const [site, setSite] = useStickyState("sd.site", "dk");
  const cfg = SITES[site];
  const tagKey = useMemo(() => makeTagKey(cfg.capTag), [cfg.capTag]);

  const [numLineups, setNumLineups] = useStickyState("sd.N", 20);
  const [maxSalary, setMaxSalary] = useStickyState(`sd.${site}.cap`, cfg.cap);
  useEffect(() => { setMaxSalary(SITES[site].cap); }, [site]);

  const [optBy, setOptBy] = useStickyState("sd.optBy", "proj");
  const [randomness, setRandomness] = useStickyState("sd.rand", 0);
  const [globalMax, setGlobalMax] = useStickyState("sd.gmax", 100);
  const [maxOverlap, setMaxOverlap] = useStickyState("sd.maxOverlap", 5);
  const [lineupPownCap, setLineupPownCap] = useStickyState("sd.lineupPownCap", "");
  const [q, setQ] = useState("");

  // sticky sets/maps for constraints
  const [locks, setLocks] = useStickySet(`sd.${site}.locks`, []);
  const [excls, setExcls] = useStickySet(`sd.${site}.excls`, []);
  const [boost, setBoost] = useStickyState(`sd.${site}.boost`, {});

  // per-slot exposure maps, keyed by "Player::CPT" or "Player::MVP" or "Player::FLEX"
  const [minPctTag, setMinPctTag] = useStickyState(`sd.${site}.minPctTag`, {});
  const [maxPctTag, setMaxPctTag] = useStickyState(`sd.${site}.maxPctTag`, {});

  // team override per slate team
  const [teamMaxPct, setTeamMaxPct] = useStickyState(`sd.${site}.teamMax`, {});

  // IF→THEN rules
  const [rules, setRules] = useStickyState(`sd.${site}.rules`, []);

  // CPT/MVP vs FLEX table filter
  const [tagFilter, setTagFilter] = useStickyState(`sd.${site}.tagFilter`, "ALL");

  // exposure tab scope
  const [expScope, setExpScope] = useStickyState(`sd.${site}.expScope`, "ALL"); // "ALL" | cfg.capTag | "FLEX"

  // right-panel tab
  const [tab, setTab] = useStickyState(`sd.${site}.rightTab`, "Exposure"); // Exposure | Teams | Stacks

  // builds & results (live view shows currently selected build's lineups)
  const [lineups, setLineups] = useState([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [progressUI, setProgressUI] = useState(0);
  const [progressActual, setProgressActual] = useState(0);
  const tickRef = useRef(null);

  // Build history (chips) — persistent per site
  const [builds, setBuilds] = useStickyState(`sd.${site}.builds`, []); // [{id, at, n, params, lineups}]
  const [activeBuild, setActiveBuild] = useStickyState(`sd.${site}.activeBuild`, -1);

  // live clock
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNowTick(Date.now()), 1000); return () => clearInterval(id); }, []);
  const fmtTime = (d) => d ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—";
  const rel = (d) => d ? Math.max(0, Math.round((nowTick - d.getTime()) / 1000)) : null;

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

  // On site switch, clear live results but keep build history (history is per-site via key)
  useEffect(() => {
    setLineups([]); setProgressActual(0); setProgressUI(0); setIsOptimizing(false);
  }, [site]);

  // If user selects a chip (activeBuild), load its lineups into the live view (unless we’re mid-build)
  useEffect(() => {
    if (!isOptimizing && activeBuild >= 0 && builds[activeBuild]) {
      setLineups(builds[activeBuild].lineups || []);
    }
  }, [activeBuild, builds, isOptimizing]);

  /* ------------------------------ rows ------------------------------ */
  const rows = useMemo(() => {
    if (!data?.data && !data?.rows && !data?.players && !Array.isArray(data)) return [];
    const arr = Array.isArray(data?.rows) ? data.rows : Array.isArray(data?.players) ? data.players : Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

    const siteKey = cfg.key; // dk|fd
    const siteIds = meta?.data;
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

      // FD DST salary lenient patch
      if (siteKey === "fd" && pos === "DST" && (!flex_sal || flex_sal === 0)) {
        const guess = fdList.find(x => normTeam(x.team) === team && normPosRaw(x.pos) === "D");
        if (guess) {
          const sFlex = num(guess.salary_flex || guess.salary || 0);
          const sMvp  = num(guess.salary_mvp || Math.round(sFlex * 1.5));
          if (!flex_sal) flex_sal = sFlex;
          if (!cap_sal) cap_sal = sMvp;
        }
      }

      return { name, pos, team, opp, proj: flex_proj, floor: flex_floor, ceil: flex_ceil, pown: flex_pown, opt: flex_opt, salary: flex_sal, cap_proj, cap_floor, cap_ceil, cap_pown, cap_opt, cap_salary: cap_sal, __raw: r };
    });

    return mapped.filter((r) => r.name && r.pos);
  }, [data, site, cfg, meta?.data]);

  /* slate teams (only 2 in showdown) */
  const slateTeams = useMemo(() => {
    const s = new Set(); for (const r of rows) { if (r.team) s.add(r.team); if (r.opp) s.add(r.opp); } return [...s].slice(0, 2);
  }, [rows]);

  /* -------------------- table + search + sorting ------------------- */
  const [sort, setSortState] = useState({ col: "proj", dir: "desc" });

  const usagePct = useMemo(() => {
    if (!lineups.length) return {};
    const m = new Map();
    for (const L of lineups) {
      const ps = Array.isArray(L.pairs)
        ? L.pairs
        : (L.players || []).map((n, i) => ({ slot: i === 0 ? cfg.capTag : "FLEX", name: n }));
      for (const p of ps) {
        const t = p.slot === "FLEX" ? "FLEX" : cfg.capTag;
        const k = `${p.name}::${t}`;
        m.set(k, (m.get(k) || 0) + 1);
      }
    }
    const total = Math.max(1, lineups.length);
    const out = {};
    for (const [k, cnt] of m.entries()) out[k] = (cnt / total) * 100;
    return out;
  }, [lineups, cfg.capTag]);

  const expandedRows = useMemo(() => {
    const res = []; for (const r of rows) {
      res.push({ ...r, tag: cfg.capTag,  projDisplay: r.cap_proj,  floorDisplay: r.cap_floor,  ceilDisplay: r.cap_ceil,  pownDisplay: r.cap_pown, optDisplay: r.cap_opt, salaryDisplay: r.cap_salary, key: `${r.name}::${cfg.capTag}` });
      res.push({ ...r, tag: "FLEX", projDisplay: r.proj, floorDisplay: r.floor, ceilDisplay: r.ceil, pownDisplay: r.pown, optDisplay: r.opt, salaryDisplay: r.salary, key: r.name + "::FLEX" });
    }
    return res;
  }, [rows, cfg.capTag]);

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

  const cmp = useMemo(() => {
    const { col, dir } = sort; const mult = dir === "asc" ? 1 : -1;
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
      const map = { salary:"salaryDisplay", proj:"projDisplay", floor:"floorDisplay", ceil:"ceilDisplay", pown:"pownDisplay", opt:"optDisplay", usage:null };
      const aV = col === "usage" ? (usagePct[a.key] || 0) : (a[map[col]] ?? 0);
      const bV = col === "usage" ? (usagePct[b.key] || 0) : (b[map[col]] ?? 0);
      if (aV < bV) return -1 * mult;
      if (aV > bV) return  1 * mult;
      return a.name.localeCompare(b.name) * mult;
    };
  }, [sort, cfg.capTag, usagePct]);

  const sortedRows = useMemo(() => [...filteredRows].sort(cmp), [filteredRows, cmp]);

  const sortable = new Set(["tag","pos","team","opp","salary","proj","floor","ceil","pown","opt","usage"]);
  const setSort = (col) => { if (!sortable.has(col)) return; setSortState((prev) => ({ col, dir: prev.col === col ? (prev.dir === "asc" ? "desc" : "asc") : "desc" })); };
  const sortArrow = (key) => sort.col === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "";

  /* ------------------------------ actions ---------------------------- */
  const toggleLock = (name, tag) => setLocks((s) => { const k = tagKey(name, tag); const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleExcl = (name, tag) => setExcls((s) => { const k = tagKey(name, tag); const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const bumpBoost = (name, step) => setBoost((m) => ({ ...m, [name]: clamp((m[name] || 0) + step, -6, 6) }));

  const resetConstraints = () => {
    setLocks(new Set()); setExcls(new Set()); setBoost({});
    setMinPctTag({}); setMaxPctTag({}); setRules([]); setTeamMaxPct({});
  };

  /* --------------------------- optimize (SSE) ------------------------ */
  async function optimize() {
    if (!rows.length) return; setLineups([]); setProgressActual(0); setProgressUI(0); setIsOptimizing(true);
    const basePos = ["QB","RB","WR","TE","DST","K"];
    const slots = [ { name: cfg.capTag === "CPT" ? "CPT" : "MVP", eligible: basePos }, ...Array.from({length:5},()=>({ name:"FLEX", eligible: basePos })) ];

    const players = rows.map((r) => ({
      name: r.name, pos: r.pos, team: r.team, opp: r.opp,
      salary: Math.round(r.salary || 0), proj: r.proj || 0, floor: r.floor || 0, ceil: r.ceil || 0,
      pown: r.pown || 0, opt: r.opt || 0,
      cap_salary: Math.round(r.cap_salary || Math.round(r.salary * 1.5)),
      cap_proj: r.cap_proj, cap_floor: r.cap_floor, cap_ceil: r.cap_ceil, cap_pown: r.cap_pown, cap_opt: r.cap_opt
    }));

    const apiRules = (rules || []).map((r) => ({
      if_slot: r.if_slot || (cfg.capTag),
      if_pos: r.if_pos || ["QB"],
      if_team_exact: r.if_team ? r.if_team : null,
      then_at_least: Math.max(0, Number(r.then_at_least) || 0),
      from_pos: r.from_pos || ["WR","TE"],
      team_scope: r.team_scope || "any",
      team_exact: (r.team_scope === "exact_team" && r.team_exact) ? r.team_exact : null
    }));

    // team max overrides (only provided teams)
    const teamMax = {};
    for (const tm of slateTeams) {
      const v = clamp(Number(teamMaxPct[tm]) || 0, 0, 100);
      if (String(teamMaxPct[tm] ?? "").trim() !== "") teamMax[tm] = v;
    }

    const min_pct_tag = Object.fromEntries(
      Object.entries(minPctTag).map(([k,v]) => [k, clamp(Number(v) || 0, 0, 100)])
    );
    const max_pct_tag = Object.fromEntries(
      Object.entries(maxPctTag).map(([k,v]) => [k, clamp(Number(v) || 100, 0, 100)])
    );

    const payload = {
      site, slots, players,
      n: Math.max(1, Number(numLineups) || 1),
      cap: Math.min(cfg.cap, Number(maxSalary) || cfg.cap),
      objective: optBy,
      locks: Array.from(locks),
      excludes: Array.from(excls),
      boosts: boost,
      randomness: clamp(Number(randomness) || 0, 0, 100),
      global_max_pct: clamp(Number(globalMax) || 100, 0, 100),
      team_max_pct: teamMax,
      min_pct: {},
      max_pct: {},
      min_pct_tag,
      max_pct_tag,
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
          const L = {
            players: evt.drivers,
            pairs: Array.isArray(evt.pairs)
              ? evt.pairs
              : (evt.drivers || []).map((n, i) => ({ slot: i === 0 ? cfg.capTag : "FLEX", name: n })),
            salary: evt.salary,
            total: evt.total,
          };
          out.push(L); setLineups((prev) => [...prev, L]); setProgressActual(out.length);
        },
        () => {
          setProgressActual(out.length || payload.n);
          setProgressUI(out.length || payload.n);
          setIsOptimizing(false);
          clearInterval(tickRef.current);

          // Save build in history and select it
          const rec = {
            id: Date.now(),
            at: new Date().toISOString(),
            n: out.length,
            params: { numLineups, optBy, randomness, maxSalary, maxOverlap, lineupPownCap },
            lineups: out
          };
          setBuilds((B) => {
            const next = [...B, rec];
            // select this new build
            setActiveBuild(next.length - 1);
            return next;
          });
        }
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
  const cell = cls.cell; const header = cls.tableHead; const textSz = "text-[12px]";

  /* --------------------- right-panel aggregates --------------------- */
  const slotLabel = (t) => (t === "ALL" ? "ALL" : (t === "FLEX" ? "FLEX" : cfg.capTag));

  // Exposures: lineup-based denominator; ALL scope = combined across slots
  const exposures = useMemo(() => {
    const denom = Math.max(1, lineups.length);

    // Per-slot counts: "Player::CPT|MVP" or "Player::FLEX"
    const perSlot = new Map();
    // Combined (ALL) counts: "Player" → appearances in any slot (dedupe within lineup)
    const perAll = new Map();

    for (const L of lineups) {
      const ps = Array.isArray(L.pairs)
        ? L.pairs
        : (L.players || []).map((n, i) => ({ slot: i === 0 ? cfg.capTag : "FLEX", name: n }));

      const seenThisLineup = new Set(); // avoid double-counting same player in one lineup

      for (const p of ps) {
        const t = p.slot === "FLEX" ? "FLEX" : cfg.capTag;
        const k = `${p.name}::${t}`;
        perSlot.set(k, (perSlot.get(k) || 0) + 1);

        if (!seenThisLineup.has(p.name)) {
          perAll.set(p.name, (perAll.get(p.name) || 0) + 1);
          seenThisLineup.add(p.name);
        }
      }
    }

    if (expScope === "ALL") {
      // single row per player, CPT/MVP + FLEX combined
      return [...perAll.entries()]
        .map(([name, c]) => ({ name, slot: "ALL", count: c, pct: +(100 * c / denom).toFixed(1) }))
        .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));
    }

    // Slot-specific (CPT/MVP or FLEX), still lineup-based denominator
    const needSlot = expScope === "FLEX" ? "FLEX" : cfg.capTag;
    return [...perSlot.entries()]
      .filter(([key]) => key.endsWith(`::${needSlot}`))
      .map(([key, c]) => {
        const [name, t] = key.split("::");
        return { name, slot: t, count: c, pct: +(100 * c / denom).toFixed(1) };
      })
      .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));
  }, [lineups, cfg.capTag, expScope]);

  const teamExposure = useMemo(() => {
    const cnt = new Map(); let slotsCount = 0;
    for (const L of lineups) {
      const ps = Array.isArray(L.pairs) ? L.pairs : (L.players || []).map((n,i)=>({ slot: i===0 ? cfg.capTag : "FLEX", name:n }));
      for (const p of ps) {
        const meta = rows.find(r => r.name === p.name);
        const tm = meta?.team || "";
        if (!tm) continue;
        cnt.set(tm, (cnt.get(tm) || 0) + 1);
        slotsCount += 1;
      }
    }
    return [...cnt.entries()].map(([tm, c]) => ({ team: tm, count: c, pct: slotsCount ? +(100*c/slotsCount).toFixed(1) : 0 })) .sort((a,b)=>b.pct-a.pct || a.team.localeCompare(b.team));
  }, [lineups, rows]);

  const stackShapes = useMemo(() => {
    const shapes = new Map();
    for (const L of lineups) {
      const names = (Array.isArray(L.players) ? L.players : []).slice();
      const teams = names.map((n)=>rows.find(r=>r.name===n)?.team).filter(Boolean);
      if (!teams.length) continue;
      const a = teams.filter(t=>t===teams[0]).length;
      const b = teams.length - a;
      const key = `${Math.max(a,b)}-${Math.min(a,b)}`;
      shapes.set(key, (shapes.get(key)||0)+1);
    }
    const total = lineups.length || 1;
    return [...shapes.entries()].map(([shape, c]) => ({ shape, count: c, pct: +(100*c/total).toFixed(1) })).sort((a,b)=>b.count-a.count);
  }, [lineups, rows]);

  /* ---------------------------- render ------------------------------ */
  // chip helpers
  const selectBuild = (idx) => { setActiveBuild(idx); if (builds[idx]) setLineups(builds[idx].lineups || []); };
  const removeBuild = (idx) => {
    setBuilds((B) => {
      const next = B.slice(0, idx).concat(B.slice(idx + 1));
      const newActive = next.length ? Math.min(idx, next.length - 1) : -1;
      setActiveBuild(newActive);
      setLineups(newActive >= 0 ? (next[newActive].lineups || []) : []);
      return next;
    });
  };
  const clearBuilds = () => { setBuilds([]); setActiveBuild(-1); setLineups([]); };

  return (
    <div className="px-4 md:px-6 py-5">
      <h1 className="text-2xl md:text-3xl font-extrabold mb-2">NFL — Showdown Optimizer</h1>

      {/* site toggle + view */}
      <div className="mb-3 flex flex-wrap gap-2 items-center">
        <div className="inline-flex rounded-full bg-white shadow-sm ring-1 ring-gray-200 overflow-hidden">
          {Object.keys(SITES).map((s) => (
            <button key={s} onClick={() => setSite(s)} className={`px-3 py-1.5 text-sm inline-flex items-center gap-2 transition ${site === s ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50"}`}>
              <img src={SITES[s].logo} alt="" className="w-4 h-4" /><span>{SITES[s].label}</span>
            </button>
          ))}
        </div>

        <div className="inline-flex rounded-full bg-white shadow-sm ring-1 ring-gray-200 overflow-hidden">
          {["ALL", cfg.capTag, "FLEX"].map((t) => (
            <button key={t} onClick={() => setTagFilter(t)} className={`px-3 py-1.5 text-xs font-medium transition ${tagFilter===t ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50"}`}>{t}</button>
          ))}
        </div>

        {/* Data updated + auto refresh controls */}
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-700">
          <div className="inline-flex items-center gap-2 px-2.5 h-8 rounded-full border border-gray-200 bg-white">
            <span className="w-2 h-2 rounded-full" style={{ background: loading ? "#f59e0b" : "#10b981" }} />
            <span className="font-mono">
              Data updated: { (lastModified || fetchedAt) ? `${fmtTime(lastModified || fetchedAt)} (${rel(lastModified || fetchedAt)}s ago)` : "—"}
            </span>
          </div>
          <button className={cls.btn.ghost} onClick={refetch}>Refresh</button>
          <label className={`inline-flex items-center gap-1 cursor-pointer px-2 h-8 rounded-md border border-gray-200`}>
            <input type="checkbox" checked={!!auto} onChange={(e) => setAuto(e.target.checked)} />
            Auto 60s
          </label>
        </div>
      </div>

      {/* Toolbar */}
      <div className={`${cls.card} p-3 grid md:grid-cols-6 gap-2 mb-3`}>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Lineups</label>
          <input className={cls.input} value={numLineups} onChange={(e) => setNumLineups(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Max salary</label>
          <input className={cls.input} value={maxSalary} onChange={(e) => setMaxSalary(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Max Overlap</label>
          <input className={cls.input} value={maxOverlap} onChange={(e) => setMaxOverlap(e.target.value)} title="How many FLEX names may overlap vs prior lineups" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Optimize by</label>
          <select className={cls.input} value={optBy} onChange={(e)=>setOptBy(e.target.value)}>
            <option value="proj">Projection</option><option value="floor">Floor</option><option value="ceil">Ceiling</option><option value="pown">pOWN%</option><option value="opt">Opt%</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button className={cls.btn.ghost} onClick={resetConstraints}>Reset</button>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button className={cls.btn.primary} onClick={optimize}>{`Build ${numLineups} lineups`}</button>
        </div>
      </div>

      {/* global knobs 2 */}
      <div className="mb-2 flex flex-wrap gap-3 items-end">
        <label className="text-sm">Randomness %</label>
        <input className={cls.input} style={{width:64}} value={randomness} onChange={(e) => setRandomness(e.target.value)} />
        <label className="text-sm">Max exposure %</label>
        <input className={cls.input} style={{width:64}} value={globalMax} onChange={(e) => setGlobalMax(e.target.value)} />
        <label className="text-sm">Max lineup pOWN% (sum)</label>
        <input className={cls.input} style={{width:84}} placeholder="—" value={lineupPownCap} onChange={(e) => setLineupPownCap(e.target.value)} />
        <input className={`${cls.input} ml-auto`} style={{width:320}} placeholder="Search player / team / pos…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {/* IF → THEN rules */}
      <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase mb-2">Conditional Rules</h3>
      <div className={`${cls.card} p-2 mb-3`}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] text-gray-600">IF → THEN constraints applied during build</div>
          <button className={cls.btn.ghost}
            onClick={() => setRules((R) => [...R, {
              if_slot: cfg.capTag, if_pos:["QB"], if_team:"",
              then_at_least:1, from_pos:["WR","TE"], team_scope:"same_team", team_exact:""
            }])}
          >+ Add Rule</button>
        </div>
        {rules.length === 0 ? (
          <div className="text-xs text-gray-500 px-1 py-2">No rules yet.</div>
        ) : (
          <div className="space-y-2">
            {rules.map((r, i) => {
              const destSelectValue = (r.team_scope === "exact_team" && r.team_exact)
                ? `exact:${r.team_exact}` : (r.team_scope || "any");
              const ifTeamValue = r.if_team || "";
              return (
                <div key={i} className="relative rounded-lg border border-gray-200 bg-white p-2 pl-3">
                  <span className="absolute inset-y-0 left-0 w-1 rounded-l-lg bg-blue-500" />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">IF</span>
                    <div className="inline-flex rounded-md overflow-hidden border border-gray-200">
                      {[cfg.capTag, "FLEX"].map((slot) => (
                        <button key={slot}
                          className={`px-2 py-1 text-sm ${ (r.if_slot||cfg.capTag)===slot ? "bg-blue-600 text-white" : "bg-white" }`}
                          onClick={()=>setRules((R)=>{const c=[...R]; c[i]={...c[i], if_slot:slot}; return c;})}
                        >{slot}</button>
                      ))}
                    </div>
                    <span className="text-sm">is</span>
                    {["QB","RB","WR","TE","DST","K"].map((p) => (
                      <button key={p}
                        className={`px-2 py-1 rounded border text-sm ${r.if_pos?.includes(p) ? "bg-blue-600 text-white border-blue-600" : "bg-white border-gray-200"}`}
                        onClick={() => setRules((R) => { const copy=[...R]; const cur=new Set(copy[i].if_pos||[]); cur.has(p)?cur.delete(p):cur.add(p); copy[i]={...copy[i], if_pos:[...cur]}; return copy; })}
                      >{p}</button>
                    ))}
                    <span className="text-sm">on team</span>
                    <select
                      className={cls.input}
                      value={ifTeamValue}
                      onChange={(e)=>setRules((R)=>{ const c=[...R]; c[i]={...c[i], if_team:e.target.value}; return c; })}
                    >
                      <option value="">any team</option>
                      {slateTeams.map((abbr)=> {
                        const label = `${abbr} — ${(NFL_TEAMS[abbr]?.city ?? abbr)} ${NFL_TEAMS[abbr]?.nickname ??""}`.trim();
                        return <option key={abbr} value={abbr}>{label}</option>;
                      })}
                    </select>
                    <span className="text-sm">THEN require at least</span>
                    <input
                      className={cls.input} style={{width:56}}
                      value={r.then_at_least ?? 1}
                      onChange={(e) =>
                        setRules((R) => {
                          const c = [...R];
                          c[i] = { ...c[i], then_at_least: e.target.value };
                          return c;
                        })
                      }
                    />
                    <span className="text-sm">from</span>
                    {["QB", "RB", "WR", "TE", "DST", "K"].map((p) => (
                      <button
                        key={p}
                        className={`px-2 py-1 rounded border text-sm ${r.from_pos?.includes(p) ? "bg-green-600 text-white border-green-600" : "bg-white border-gray-200"}`}
                        onClick={() =>
                          setRules((R) => {
                            const c = [...R];
                            const cur = new Set(c[i].from_pos || []);
                            cur.has(p) ? cur.delete(p) : cur.add(p);
                            c[i] = { ...c[i], from_pos: [...cur] };
                            return c;
                          })
                        }
                      >
                        {p}
                      </button>
                    ))}
                    <select
                      className={cls.input}
                      value={destSelectValue}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRules((R) => {
                          const c = [...R];
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
                      {slateTeams.map((abbr) => {
                        const label = `${abbr} — ${(NFL_TEAMS[abbr]?.city ?? abbr)} ${NFL_TEAMS[abbr]?.nickname ?? ""}`.trim();
                        return (
                          <option key={abbr} value={`exact:${abbr}`}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                    <button
                      className={`${cls.btn.ghost} ml-auto`}
                      onClick={() => setRules((R) => R.filter((_, j) => j !== i))}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Team Max% Overrides — only slate teams */}
      <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase mb-2">Team Max% Overrides</h3>
      <div className={`${cls.card} p-2 mb-3`}>
        <div className="text-[11px] text-gray-600 mb-2">Blank = use Max exposure %</div>
        <div className="flex flex-wrap gap-3">
          {slateTeams.map((abbr) => (
            <div key={abbr} className="flex items-center gap-2">
              <TeamPill abbr={abbr} />
              <input
                className={cls.input}
                style={{width:64}}
                placeholder="—"
                value={teamMaxPct[abbr] ?? ""}
                onChange={(e) => setTeamMaxPct((m) => ({ ...m, [abbr]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Build chips */}
      {builds.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {builds.map((b, idx) => {
            const active = idx === activeBuild;
            return (
              <div key={b.id} className={`inline-flex items-center gap-2 border ${active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-800 border-gray-200 hover:bg-gray-50"} ${cls.btn.chip}`}>
                <button onClick={() => selectBuild(idx)} className="inline-flex items-center gap-2">
                  <span className="font-semibold">Build {idx + 1}</span>
                  <span className="opacity-80">• {b.n} LUs</span>
                  <span className="opacity-60">{timeAgo(b.at)}</span>
                </button>
                <button onClick={() => removeBuild(idx)} className="ml-1 text-xs opacity-90 hover:opacity-100" title="Delete build">✕</button>
              </div>
            );
          })}
          <button className={cls.btn.ghost} onClick={clearBuilds}>Clear</button>
        </div>
      )}

      {/* progress bar */}
      <div className="mb-2 flex items-center gap-3">
        <div className="flex-1 max-w-xs h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${
                (Math.min(progressUI, Math.max(1, Number(numLineups) || 1)) /
                  Math.max(1, Number(numLineups) || 1)) *
                100
              }%`,
              background: "linear-gradient(90deg, #60a5fa, #2563eb)"
            }}
          />
        </div>
        <div className="text-sm text-gray-600 min-w-[60px] text-right">
          {progressUI}/{numLineups}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Player table */}
        <div className="xl:col-span-2 rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="max-h-[68vh] overflow-auto">
            <table className={`w-full border-separate ${textSz}`} style={{ borderSpacing: 0 }}>
              <thead className="bg-gray-50 sticky top-0 z-10 shadow-[0_1px_0_#e5e7eb]">
                <tr>
                  {TABLE_COLS.map(({ key, label, sortable }) => (
                    <th
                      key={key}
                      className={`${header} whitespace-nowrap ${sortable ? "cursor-pointer" : ""}`}
                      onClick={() => sortable && setSort(key)}
                    >
                      {label}
                      {sortable ? <span className="opacity-60">{sortArrow(key)}</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td className={`${header} text-gray-500`} colSpan={TABLE_COLS.length}>
                      Loading…
                    </td>
                  </tr>
                )}
                {err && (
                  <tr>
                    <td className={`${header} text-red-600`} colSpan={TABLE_COLS.length}>
                      Failed to load: {String(err)}
                    </td>
                  </tr>
                )}
                {!loading &&
                  !err &&
                  sortedRows.map((r) => {
                    const teamTitle = `${NFL_TEAMS[r.team]?.city ?? r.team} ${NFL_TEAMS[r.team]?.nickname ?? ""}`.trim();
                    const oppTitle = `${NFL_TEAMS[r.opp]?.city ?? r.opp} ${NFL_TEAMS[r.opp]?.nickname ?? ""}`.trim();
                    const key = r.key; // Player::CPT/MVP or Player::FLEX
                    return (
                      <tr
                        key={key}
                        className="odd:bg-white even:bg-gray-50 hover:bg-blue-50/60 transition-colors"
                      >
                        <td className={cell}>
                          <input
                            type="checkbox"
                            checked={locks.has(tagKey(r.name, r.tag))}
                            onChange={() => toggleLock(r.name, r.tag)}
                          />
                        </td>
                        <td className={cell}>
                          <input
                            type="checkbox"
                            checked={excls.has(tagKey(r.name, r.tag))}
                            onChange={() => toggleExcl(r.name, r.tag)}
                          />
                        </td>
                        <td className={cell}>
                          <div className="inline-flex items-center gap-1">
                            <button className={cls.btn.iconSm} title="+3%" onClick={() => bumpBoost(r.name, +1)}>+</button>
                            <span className="w-5 text-center">{boost[r.name] || 0}</span>
                            <button className={cls.btn.iconSm} title="-3%" onClick={() => bumpBoost(r.name, -1)}>–</button>
                          </div>
                        </td>
                        <td className={cell}>{r.tag === "FLEX" ? "FLEX" : cfg.capTag}</td>
                        <td className={`${cell} whitespace-nowrap text-left`}>{r.name}</td>
                        <td className={cell}>
                          <TeamPill abbr={r.team} title={teamTitle} />
                        </td>
                        <td className={cell}>
                          <TeamPill abbr={r.opp} title={oppTitle} />
                        </td>
                        <td className={cell}>{r.pos}</td>
                        <td className={`${cell} tabular-nums`}>{fmt0(r.salaryDisplay)}</td>
                        <td className={`${cell} tabular-nums`}>
                          {fmt1(r.projDisplay * (1 + 0.03 * (boost[r.name] || 0)))}
                        </td>
                        <td className={`${cell} tabular-nums`}>{fmt1(r.floorDisplay)}</td>
                        <td className={`${cell} tabular-nums`}>{fmt1(r.ceilDisplay)}</td>
                        <td className={`${cell} tabular-nums`}>{fmt1(r.pownDisplay * 100)}</td>
                        <td className={`${cell} tabular-nums`}>{fmt1(r.optDisplay * 100)}</td>

                        {/* Per-slot Min/Max wired to key = Player::CPT|MVP|FLEX */}
                        <td className={cell}>
                          <div className="inline-flex items-center gap-1">
                            <button className={cls.btn.iconSm}
                              onClick={() =>
                                setMinPctTag((m) => ({ ...m, [key]: clamp((num(m[key]) || 0) - 5, 0, 100) }))
                              }
                              title="-5%"
                            >
                              –
                            </button>
                            <input
                              className={`${cls.input} text-center`} style={{width:54}}
                              value={String(minPctTag[key] ?? "")}
                              onChange={(e) => setMinPctTag((m) => ({ ...m, [key]: e.target.value }))}
                              placeholder="—"
                            />
                            <button className={cls.btn.iconSm}
                              onClick={() =>
                                setMinPctTag((m) => ({ ...m, [key]: clamp((num(m[key]) || 0) + 5, 0, 100) }))
                              }
                              title="+5%"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className={cell}>
                          <div className="inline-flex items-center gap-1">
                            <button className={cls.btn.iconSm}
                              onClick={() =>
                                setMaxPctTag((m) => ({ ...m, [key]: clamp((num(m[key]) || 100) - 5, 0, 100) }))
                              }
                              title="-5%"
                            >
                              –
                            </button>
                            <input
                              className={`${cls.input} text-center`} style={{width:54}}
                              value={String(maxPctTag[key] ?? "")}
                              onChange={(e) => setMaxPctTag((m) => ({ ...m, [key]: e.target.value }))}
                              placeholder="—"
                            />
                            <button className={cls.btn.iconSm}
                              onClick={() =>
                                setMaxPctTag((m) => ({ ...m, [key]: clamp((num(m[key]) || 100) + 5, 0, 100) }))
                              }
                              title="+5%"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        <td className={`${cell} tabular-nums`}>
                          {usagePct[r.key] != null ? fmt1(usagePct[r.key]) : "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right panel: Tabs */}
        <div className="space-y-4">
          <div className={`${cls.card}`}>
            <div className="border-b border-gray-200 flex gap-2 p-2 text-sm">
              {["Exposure","Teams","Stacks"].map(t => (
                <button key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-md ${tab===t ? "bg-blue-600 text-white" : "hover:bg-gray-50"}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="p-3 max-h-[700px] overflow-auto">
              {tab==="Exposure" && (
                <>
                  <div className="mb-2 inline-flex rounded-full bg-white shadow-sm ring-1 ring-gray-200 overflow-hidden">
                    {["ALL", cfg.capTag, "FLEX"].map((t) => (
                      <button key={t} onClick={() => setExpScope(t)} className={`px-3 py-1.5 text-xs font-medium transition ${expScope===t ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-50"}`}>{t}</button>
                    ))}
                  </div>
                  <table className={`w-full ${textSz}`}>
                    <thead>
                      <tr>
                        <th className={header}>Slot</th>
                        <th className={header + " text-left"}>Player</th>
                        <th className={header}>Count</th>
                        <th className={header}>Exposure %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exposures.map((r, i) => (
                        <tr key={`${r.name}-${r.slot}-${i}`} className="odd:bg-white even:bg-gray-50">
                          <td className="px-2 py-1 text-center">{slotLabel(r.slot)}</td>
                          <td className="px-2 py-1 text-left">{r.name}</td>
                          <td className="px-2 py-1 text-center">{r.count}</td>
                          <td className="px-2 py-1 text-center">{fmt1(r.pct)}</td>
                        </tr>
                      ))}
                      {!exposures.length && (
                        <tr>
                          <td className="px-2 py-1 text-center text-gray-500" colSpan={4}>
                            No lineups yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </>
              )}
              {tab==="Teams" && (
                <table className={`w-full ${textSz}`}>
                  <thead>
                    <tr>
                      <th className={header}>Team</th>
                      <th className={header}>Count</th>
                      <th className={header}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamExposure.map((t, i) => (
                      <tr key={i} className="odd:bg-white even:bg-gray-50">
                        <td className="px-2 py-1 text-center">
                          <TeamPill abbr={t.team} />
                        </td>
                        <td className="px-2 py-1 text-center">{t.count}</td>
                        <td className="px-2 py-1 text-center">{fmt1(t.pct)}</td>
                      </tr>
                    ))}
                    {!teamExposure.length && (
                      <tr>
                        <td className="px-2 py-1 text-center text-gray-500" colSpan={3}>
                          —
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
              {tab==="Stacks" && (
                <table className={`w-full ${textSz}`}>
                  <thead>
                    <tr>
                      <th className={header}>Shape</th>
                      <th className={header}>Count</th>
                      <th className={header}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stackShapes.map((s, i) => (
                      <tr key={i} className="odd:bg-white even:bg-gray-50">
                        <td className="px-2 py-1 text-center">{s.shape}</td>
                        <td className="px-2 py-1 text-center">{s.count}</td>
                        <td className="px-2 py-1 text-center">{fmt1(s.pct)}</td>
                      </tr>
                    ))}
                    {!stackShapes.length && (
                      <tr>
                        <td className="px-2 py-1 text-center text-gray-500" colSpan={3}>
                          —
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Results: list + cards */}
      {!!lineups.length && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
          <div className={`${cls.card} p-3`}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold">Lineups ({lineups.length})</h2>
              <div className="flex items-center gap-2">
                <button
                  className={cls.btn.ghost}
                  onClick={() => downloadSiteLineupsCSV({ lineups, site, rows, siteIds: meta?.data, cfg })}
                >
                  Export CSV (IDs)
                </button>
              </div>
            </div>
            <div className="overflow-auto max-h-[440px]">
              <table className="min-w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
                <thead className="bg-gray-50">
                  <tr>
                    <th className={header}>#</th>
                    <th className={header}>Salary</th>
                    <th className={header}>Total {totalLabel}</th>
                    <th className={header + " text-left"}>Players</th>
                  </tr>
                </thead>
                <tbody>
                  {lineups.map((L, i) => (
                    <tr key={i} className="odd:bg-white even:bg-gray-50">
                      <td className={cell}>{i + 1}</td>
                      <td className={`${cell} tabular-nums`}>{fmt0(L.salary)}</td>
                      <td className={`${cell} tabular-nums`}>{fmt1(L.total)}</td>
                      <td className={`${cell} leading-snug text-left`}>
                        <span className="break-words">
                          {L.players[0]} ({cfg.capTag}) • {L.players.slice(1).join(" • ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cards like classic */}
          <div className={`${cls.card} p-3`}>
            <div className="font-semibold mb-2">Cards</div>
            <div className="grid md:grid-cols-2 gap-4">
              {lineups.map((L, idx) => (
                <div key={idx} className="rounded-xl border border-gray-200 shadow-sm">
                  <div className="px-3 py-2 text-sm font-semibold">Lineup #{idx + 1}</div>
                  <table className={`w-full ${textSz}`}>
                    <thead>
                      <tr>
                        <th className={header}>Slot</th>
                        <th className={header + " text-left"}>Player</th>
                        <th className={header}>Proj</th>
                        <th className={header}>Sal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {L.players.map((n, i) => {
                        const metaRow = rows.find((r) => r.name === n);
                        if (!metaRow)
                          return (
                            <tr key={`${n}-${i}`} className="odd:bg-white even:bg-gray-50">
                              <td className={cell}>{i === 0 ? cfg.capTag : "FLEX"}</td>
                              <td className="px-2 py-1 text-left">{n}</td>
                              <td className={`${cell}`}>—</td>
                              <td className={`${cell}`}>—</td>
                            </tr>
                          );
                        const proj = i === 0 ? metaRow.cap_proj : metaRow.proj;
                        const sal = i === 0 ? metaRow.cap_salary : metaRow.salary;
                        return (
                          <tr key={`${n}-${i}`} className="odd:bg-white even:bg-gray-50">
                            <td className={cell}>{i === 0 ? cfg.capTag : "FLEX"}</td>
                            <td className="px-2 py-1 text-left">{n}</td>
                            <td className={cell}>{fmt1(proj)}</td>
                            <td className={cell}>{fmt0(sal)}</td>
                          </tr>
                        );
                      })}
                      <tr className="bg-gray-50 font-medium">
                        <td className={cell}>Totals</td>
                        <td className="px-2 py-1"></td>
                        <td className={cell}>{fmt1(L.total)}</td>
                        <td className={cell}>{fmt0(L.salary)}</td>
                      </tr>
                    </tbody>
                  </table>
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
function orderPlayersForSiteShowdown(names, rowsMap) {
  return names.map((n) => rowsMap.get(n)).filter(Boolean);
}

function downloadSiteLineupsCSV({
  lineups,
  site,
  rows,
  siteIds,
  cfg,
  fname = "nfl_showdown_ids.csv",
}) {
  const siteKey = site === "fd" ? "fd" : "dk";
  const list = Array.isArray(siteIds?.[siteKey]) ? siteIds[siteKey] : siteIds?.sites?.[siteKey] ?? [];

  const rowsByName = new Map(rows.map((r) => [r.name, r]));

  // Key helpers
  const keyDK = (name, team, slot) => `${normName(name)}|${normTeam(team)}|${slot}`;
  const keyFD = (name, team, pos) => `${normName(name)}|${normTeam(team)}|${pos}`;

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
      if (px != null && px !== "") {
        const key = String(px);
        prefCounts.set(key, (prefCounts.get(key) || 0) + 1);
      }
    }
    if (prefCounts.size === 1) fdPrefix = [...prefCounts.keys()][0];
    else if (prefCounts.size > 1) fdPrefix = [...prefCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  for (const r of list) {
    const team = normTeam(r.team ?? r.Team ?? r.team_abbr ?? r.TeamAbbrev);
    const nameFromSite = String(r.name ?? r.player ?? r.Player ?? r.raw_name ?? "");
    const baseId = String(r.id ?? r.ID ?? r.Id ?? r["DK ID"] ?? r["FD ID"] ?? r.dk_id ?? r.fd_id ?? "");
    const posOrSlot = String(r.pos ?? r.slottype ?? "").toUpperCase(); // DK: "FLEX"/"CPT" ; FD: QB/WR/D etc.
    if (siteKey === "dk") {
      if (posOrSlot === "CPT") dkCPT.set(keyDK(nameFromSite, team, "CPT"), { id: baseId, nameFromSite, team });
      else dkFLEX.set(keyDK(nameFromSite, team, "FLEX"), { id: baseId, nameFromSite, team });
    } else {
      const pos = normPos(posOrSlot); // map D/DEF → DST
      fdAny.set(keyFD(nameFromSite, team, pos), { id: baseId, nameFromSite, team, pos });
      const meta = NFL_TEAMS[team];
      if (pos === "DST" && meta) {
        fdAny.set(keyFD(`${meta.city} ${meta.nickname}`, team, pos), { id: baseId, nameFromSite, team, pos });
        fdAny.set(keyFD(meta.nickname, team, pos), { id: baseId, nameFromSite, team, pos });
        fdAny.set(keyFD(meta.city, team, pos), { id: baseId, nameFromSite, team, pos });
      }
    }
  }

  // --- Correct site upload headers ---
  const header = siteKey === "dk"
    ? ["CPT", "FLEX", "FLEX", "FLEX", "FLEX", "FLEX"]
    : ["MVP - 1.5X Points", "AnyFLEX", "AnyFLEX", "AnyFLEX", "AnyFLEX", "AnyFLEX"];

  const findDK = (name, team, slot) => {
    let rec = dkCPT.get(keyDK(name, team, slot)) || dkFLEX.get(keyDK(name, team, slot));
    if (rec) return rec;
    const meta = NFL_TEAMS[team];
    if (meta) {
      rec =
        (slot === "CPT" ? dkCPT : dkFLEX).get(keyDK(meta.nickname, team, slot)) ||
        (slot === "CPT" ? dkCPT : dkFLEX).get(keyDK(`${meta.city} ${meta.nickname}`, team, slot));
      if (rec) return rec;
    }
    for (const [, v] of (slot === "CPT" ? dkCPT : dkFLEX).entries()) {
      if (normName(v.nameFromSite) === normName(name)) return v;
    }
    return null;
  };

  const findFD = (name, pos, team) => {
    return (
      fdAny.get(keyFD(name, team, pos)) ||
      (() => {
        const meta = NFL_TEAMS[team];
        if (!meta) return null;
        return (
          fdAny.get(keyFD(`${meta.city} ${meta.nickname}`, team, pos)) ||
          fdAny.get(keyFD(meta.nickname, team, pos)) ||
          fdAny.get(keyFD(meta.city, team, pos))
        );
      })()
    );
  };

  const lines = lineups.map((L) => {
    const rowsMap = new Map(rows.map((r) => [r.name, r]));
    const ordered = orderPlayersForSiteShowdown(L.players, rowsMap);
    const cells = ordered.map((meta, i) => {
      const name = meta.name;
      const tm = meta.team;
      if (siteKey === "fd") {
        const pos = meta.pos;
        const rec = findFD(name, pos, tm);
        if (!rec) return escapeCSV(name);
        const outId = fdPrefix ? `${fdPrefix}-${rec.id}` : rec.id;
        return escapeCSV(`${outId}:${rec.nameFromSite || name}`);
      } else {
        const slot = i === 0 ? "CPT" : "FLEX";
        const rec = findDK(name, tm, slot);
        if (!rec) return escapeCSV(`${name}`);
        return escapeCSV(`${name} (${rec.id})`);
      }
    });
    while (cells.length < 6) cells.push("");
    return cells.join(",");
  });

  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fname;
  a.click();
  URL.revokeObjectURL(url);
}
