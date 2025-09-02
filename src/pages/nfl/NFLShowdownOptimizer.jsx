// src/pages/nfl/NFLShowdownOptimizer.jsx
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
const escapeCSV = (s) => {
  const v = String(s ?? "");
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

// persistent state
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
const TEAM_COLORS = {
  ARI:"#97233F", ATL:"#A71930", BAL:"#241773", BUF:"#00338D", CAR:"#0085CA", CHI:"#0B162A",
  CIN:"#FB4F14", CLE:"#311D00", DAL:"#041E42", DEN:"#FB4F14", DET:"#0076B6", GB:"#203731",
  HOU:"#03202F", IND:"#002C5F", JAX:"#006778", KC:"#E31837", LAC:"#0080C6", LAR:"#003594",
  LV:"#000000", MIA:"#008E97", MIN:"#4F2683", NE:"#002244", NO:"#D3BC8D", NYG:"#0B2265",
  NYJ:"#125740", PHI:"#004C54", PIT:"#FFB612", SEA:"#002244", SF:"#AA0000", TB:"#D50A0A",
  TEN:"#0C2340", WAS:"#5A1414",
};
const hexToRGB = (hex) => {
  const h = (hex || "#888").replace("#", "");
  const v = parseInt(h, 16);
  return { r: (v>>16)&255, g:(v>>8)&255, b:v&255 };
};
const readableText = (hex) => {
  const {r,g,b} = hexToRGB(hex);
  const L = 0.2126*r + 0.7152*g + 0.0722*b;
  return L < 140 ? "#FFFFFF" : "#111111";
};
const TeamPill = ({ abbr, title }) => {
  const bg = TEAM_COLORS[abbr] || "#E5E7EB";
  const fg = readableText(bg);
  return <span className="px-2 py-0.5 rounded" style={{backgroundColor:bg,color:fg}} title={title || abbr}>{abbr||"—"}</span>;
};

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
  dk: {
    key: "dk",
    label: "DraftKings",
    logo: "/logos/dk.png",
    cap: 50000,
    capTag: "CPT",
    mvpFieldPrefix: "DK CPT",
    flexFieldPrefix: "DK FLEX",
  },
  fd: {
    key: "fd",
    label: "FanDuel",
    logo: "/logos/fd.png",
    cap: 60000,
    capTag: "MVP",
    mvpFieldPrefix: "FD MVP",
    flexFieldPrefix: "FD FLEX",
  },
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

  // IF→THEN rules
  const [rules, setRules] = useStickyState(`sd.${site}.rules`, [
    // empty default; user can add
  ]);

  // CPT/MVP vs FLEX table filter
  const [tagFilter, setTagFilter] = useStickyState(`sd.${site}.tagFilter`, "ALL");

  // builds & results
  const [lineups, setLineups] = useState([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [progressUI, setProgressUI] = useState(0);
  const [progressActual, setProgressActual] = useState(0);
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
    setLineups([]); setProgressActual(0); setProgressUI(0); setIsOptimizing(false);
    setLocks(new Set()); setExcls(new Set()); setBoost({}); setMinPct({}); setMaxPct({});
  }, [site]);

  /* ------------------------------ rows ------------------------------ */
  const rows = useMemo(() => {
    if (!data) return [];
    const arr = Array.isArray(data?.rows) ? data.rows
      : Array.isArray(data?.players) ? data.players
      : Array.isArray(data?.data) ? data.data
      : Array.isArray(data) ? data : [];

    const siteKey = cfg.key; // dk|fd
    const capTag = cfg.capTag; // "CPT"|"MVP"

    const mapped = arr.map((r) => {
      const name = r.player ?? r.Player ?? r.Name ?? r.playerName ?? r.name ?? "";
      const pos  = String(r.pos ?? r.Pos ?? r.POS ?? r.Position ?? r.position ?? "").toUpperCase();
      const team = (r.team ?? r.Team ?? r.Tm ?? r.TEAM ?? r.team_abbr ?? r.TeamAbbrev ?? "").toUpperCase();
      const opp  = (r.opp  ?? r.Opp  ?? r.OPP ?? r.Opponent ?? r.opponent ?? "").toUpperCase();

      // FLEX metrics (robust)
      const flex_proj = num(pick(r, [`${siteKey} proj`, `${cfg.flexFieldPrefix} proj`, "proj","projection","points"], 0));
      const flex_floor = num(pick(r, [`${siteKey} floor`, `${cfg.flexFieldPrefix} floor`, "floor"], 0));
      const flex_ceil  = num(pick(r, [`${siteKey} ceil`, `${cfg.flexFieldPrefix} ceil`, "ceiling","ceil"], 0));
      const flex_pown  = num(pick(r, [`${siteKey} pown%`, `${cfg.flexFieldPrefix} pown%`, "pown%","pown"])) / 100;
      const flex_opt   = num(pick(r, [`${siteKey} opt%`, `${cfg.flexFieldPrefix} opt%`, "opt%","opt"])) / 100;
      const flex_sal   = num(
        pick(r, [
          `${siteKey} sal`, `${cfg.flexFieldPrefix} sal`, "salary", "sal",
          // a few common alternates seen in your feeds
          `${siteKey}_sal`, `${siteKey} flex sal`, `${siteKey}_flex_sal`
        ], 0)
      );

      // CAP/MVP metrics (read explicit fields; otherwise 1.5× flex)
      const cap_proj = num(pick(r, [`${siteKey} ${capTag.toLowerCase()} proj`, `${cfg.mvpFieldPrefix} proj`, `${siteKey}_${capTag.toLowerCase()}_proj`], flex_proj * 1.5));
      const cap_floor = num(pick(r, [`${siteKey} ${capTag.toLowerCase()} floor`, `${cfg.mvpFieldPrefix} floor`, `${siteKey}_${capTag.toLowerCase()}_floor`], flex_floor * 1.5));
      const cap_ceil  = num(pick(r, [`${siteKey} ${capTag.toLowerCase()} ceil`, `${cfg.mvpFieldPrefix} ceil`, `${siteKey}_${capTag.toLowerCase()}_ceil`], flex_ceil * 1.5));
      const cap_pown  = num(pick(r, [`${siteKey} ${capTag.toLowerCase()} pown%`, `${cfg.mvpFieldPrefix} pown%`, `${siteKey}_${capTag.toLowerCase()}_pown%`], flex_pown * 100)) / 100;
      const cap_opt   = num(pick(r, [`${siteKey} ${capTag.toLowerCase()} opt%`, `${cfg.mvpFieldPrefix} opt%`, `${siteKey}_${capTag.toLowerCase()}_opt%`], flex_opt * 100)) / 100;

      // **Important FD/DST salary fix**: try explicit MVP/CPT sal; else 1.5× FLEX sal; all positions inc. DST/K
      const cap_sal   = num(
        pick(r, [
          `${siteKey} ${capTag.toLowerCase()} sal`, `${cfg.mvpFieldPrefix} sal`,
          `${siteKey}_${capTag.toLowerCase()}_sal`,
        ], 0)
      ) || Math.round(flex_sal * 1.5);

      return {
        name, pos, team, opp,
        proj: flex_proj,  floor: flex_floor, ceil: flex_ceil, pown: flex_pown, opt: flex_opt, salary: flex_sal,
        cap_proj, cap_floor, cap_ceil, cap_pown, cap_opt, cap_salary: cap_sal,
        __raw: r,
      };
    });

    return mapped.filter((r) => r.name && r.pos);
  }, [data, site, cfg]);

  /* -------------------- table + search + sorting ------------------- */
  const [order, setOrder] = useState([]);
  const sortRef = useRef({ col: "proj", dir: "desc" });

  useEffect(() => {
    const initial = [...rows].sort((a, b) => b.proj - a.proj || a.name.localeCompare(b.name));
    setOrder(initial.map((r) => r.name + "::FLEX")); // stable key including tag for default (FLEX)
  }, [rows.length, site]); // eslint-disable-line

  const usagePct = useMemo(() => {
    if (!lineups.length) return {};
    const m = new Map();
    for (const L of lineups) {
      const [cap, ...flex] = L.players;
      // tag names for usage calc
      m.set(cap + "::CPT", (m.get(cap + "::CPT") || 0) + 1);
      for (const n of flex) m.set(n + "::FLEX", (m.get(n + "::FLEX") || 0) + 1);
    }
    const total = Math.max(1, lineups.length);
    const out = {};
    for (const [k, cnt] of m.entries()) out[k] = (cnt / total) * 100;
    return out;
  }, [lineups]);

  // Expand pool into 2 rows per player: CAP + FLEX (for display & controls)
  const expandedRows = useMemo(() => {
    const capTag = cfg.capTag;
    const res = [];
    for (const r of rows) {
      res.push({ ...r, tag: capTag, projDisplay: r.cap_proj, floorDisplay: r.cap_floor, ceilDisplay: r.cap_ceil, pownDisplay: r.cap_pown, optDisplay: r.cap_opt, salaryDisplay: r.cap_salary, key: r.name + "::CPT" });
      res.push({ ...r, tag: "FLEX", projDisplay: r.proj, floorDisplay: r.floor, ceilDisplay: r.ceil, pownDisplay: r.pown, optDisplay: r.opt, salaryDisplay: r.salary, key: r.name + "::FLEX" });
    }
    return res;
  }, [rows, cfg.capTag]);

  const displayRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const okTag = (t) => tagFilter === "ALL" ? true : t === tagFilter;
    const filtered = expandedRows.filter((r) =>
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
    // stable order / sorting
    const ids = new Set(order);
    const withKnown = filtered.filter((r) => ids.has(r.key));
    const others = filtered.filter((r) => !ids.has(r.key));
    return [...withKnown, ...others];
  }, [expandedRows, order, q, tagFilter]);

  const sortable = new Set(["tag","pos","team","opp","salary","proj","floor","ceil","pown","opt","usage"]);
  const setSort = (col) => {
    if (!sortable.has(col)) return;
    const dir = sortRef.current.col === col ? (sortRef.current.dir === "asc" ? "desc" : "asc") : "desc";
    sortRef.current = { col, dir };
    const mult = dir === "asc" ? 1 : -1;
    const sorted = [...displayRows].sort((a, b) => {
      if (["tag","pos","team","opp"].includes(col)) {
        const va = (col === "tag" ? a.tag : col === "pos" ? a.pos : col === "team" ? a.team : a.opp) || "";
        const vb = (col === "tag" ? b.tag : col === "pos" ? b.pos : col === "team" ? b.team : b.opp) || "";
        if (va < vb) return -1*mult; if (va > vb) return 1*mult;
        return a.name.localeCompare(b.name) * mult;
      }
      const map = {
        salary: "salaryDisplay",
        proj: "projDisplay",
        floor: "floorDisplay",
        ceil: "ceilDisplay",
        pown: "pownDisplay",
        opt: "optDisplay",
        usage: null,
      };
      const aV = col === "usage" ? (usagePct[a.key] || 0) : (a[map[col]] ?? 0);
      const bV = col === "usage" ? (usagePct[b.key] || 0) : (b[map[col]] ?? 0);
      if (aV < bV) return -1*mult; if (aV > bV) return 1*mult;
      return a.name.localeCompare(b.name) * mult;
    });
    setOrder(sorted.map((r) => r.key));
  };
  const sortArrow = (key) => sortRef.current.col === key ? (sortRef.current.dir === "asc" ? " ▲" : " ▼") : "";

  /* ------------------------------ actions ---------------------------- */
  const tagKey = (name, tag) => `${name}::${tag}`;
  const toggleLock = (name, tag) => setLocks((s) => { const k = tagKey(name, tag); const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleExcl = (name, tag) => setExcls((s) => { const k = tagKey(name, tag); const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const bumpBoost = (name, step) => setBoost((m) => ({ ...m, [name]: clamp((m[name] || 0) + step, -6, 6) }));

  const resetConstraints = () => {
    setLocks(new Set()); setExcls(new Set());
    setBoost({}); setMinPct({}); setMaxPct({});
    setRules([]);
  };

  /* --------------------------- optimize (SSE) ------------------------ */
  async function optimize() {
    if (!rows.length) return;

    setLineups([]); setProgressActual(0); setProgressUI(0); setIsOptimizing(true);

    // Build slots: 1 captain + 5 flex with base positions (NOT “MVP-QB” etc.)
    const basePos = ["QB","RB","WR","TE","DST","K"];
    const slots = [
      { name: cfg.capTag === "CPT" ? "CPT" : "MVP", eligible: basePos },
      { name: "FLEX", eligible: basePos },
      { name: "FLEX", eligible: basePos },
      { name: "FLEX", eligible: basePos },
      { name: "FLEX", eligible: basePos },
      { name: "FLEX", eligible: basePos },
    ];

    // payload players (single record per player; send base + cap overrides)
    const players = rows.map((r) => ({
      name: r.name, pos: r.pos, team: r.team, opp: r.opp,
      salary: Math.round(r.salary || 0),
      proj: r.proj || 0, floor: r.floor || 0, ceil: r.ceil || 0,
      pown: r.pown || 0, opt: r.opt || 0,
      cap_salary: Math.round(r.cap_salary || Math.round(r.salary * 1.5)),
      cap_proj: r.cap_proj, cap_floor: r.cap_floor, cap_ceil: r.cap_ceil,
      cap_pown: r.cap_pown, cap_opt: r.cap_opt,
    }));

    // transform rules to API shape
    const apiRules = (rules || []).map((r) => ({
      if_tag: cfg.capTag,              // the toggle maps to CPT or MVP, backend treats both as captain
      if_pos: r.if_pos || ["QB"],
      then_at_least: Math.max(0, Number(r.then_at_least) || 0),
      from_pos: r.from_pos || ["WR","TE"],
      team_scope: r.team_scope || "any",
    }));

    // convert locks/excludes with ::tag preserved
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
      min_pct: Object.fromEntries(Object.entries(minPct).map(([k, v]) => [k, clamp(Number(v) || 0, 0, 100)])),
      max_pct: Object.fromEntries(Object.entries(maxPct).map(([k, v]) => [k, clamp(Number(v) || 100, 0, 100)])),
      time_limit_ms: 1500,
      max_overlap: clamp(Number(maxOverlap) || 0, 0, 5),
      lineup_pown_max: String(lineupPownCap).trim() === "" ? null : clamp(Number(lineupPownCap) || 0, 0, 100),
      rules: apiRules,
    };

    const out = [];
    try {
      await solveStreamShowdown(
        payload,
        (evt) => {
          const L = { players: evt.drivers, salary: evt.salary, total: evt.total };
          out.push(L);
          setLineups((prev) => [...prev, L]);
          setProgressActual(out.length);
        },
        () => {
          setProgressActual(out.length || payload.n);
          setProgressUI(out.length || payload.n);
          setIsOptimizing(false);
          clearInterval(tickRef.current);
        }
      );
    } catch (e) {
      alert(`Solve failed: ${String(e?.message || e)}`);
      setIsOptimizing(false);
      clearInterval(tickRef.current);
    }
  }

  /* --------------------------- table schema ------------------------- */
  const TABLE_COLS = [
    { key: "lock",   label: "Lock" },
    { key: "excl",   label: "Excl" },
    { key: "boosts", label: "Boosts" },
    { key: "tag",    label: cfg.capTag, sortable: true },
    { key: "name",   label: "Player" },
    { key: "team",   label: "Tm", sortable: true },
    { key: "opp",    label: "Opp", sortable: true },
    { key: "pos",    label: "Pos", sortable: true },
    { key: "salary", label: "Salary", sortable: true },
    { key: "proj",   label: "Proj", sortable: true },
    { key: "floor",  label: "Floor", sortable: true },
    { key: "ceil",   label: "Ceiling", sortable: true },
    { key: "pown",   label: "pOWN%", sortable: true },
    { key: "opt",    label: "Opt%", sortable: true },
    { key: "min",    label: "Min%" },
    { key: "max",    label: "Max%" },
    { key: "usage",  label: "Usage%", sortable: true },
  ];

  /* --------------------------- rendering ---------------------------- */
  const cell = "px-2 py-1 text-center";
  const header = "px-2 py-1 font-semibold text-center";
  const textSz = "text-[12px]";

  return (
    <div className="px-4 md:px-6 py-5">
      <h1 className="text-2xl md:text-3xl font-extrabold mb-2">NFL — Showdown Optimizer</h1>

      {/* site toggle + view (CPT/MVP vs FLEX) */}
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
        <div className="ml-2 inline-flex rounded-full border overflow-hidden">
          {["ALL", cfg.capTag, "FLEX"].map((t) => (
            <button
              key={t}
              onClick={() => setTagFilter(t)}
              className={`px-2 py-1 text-sm ${tagFilter===t ? "bg-blue-600 text-white" : "bg-white"}`}
            >
              {t}
            </button>
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
            <option value="proj">Projection</option>
            <option value="floor">Floor</option>
            <option value="ceil">Ceiling</option>
            <option value="pown">pOWN%</option>
            <option value="opt">Opt%</option>
          </select>
          <button className="px-2.5 py-1.5 text-sm rounded-lg bg-white border hover:bg-gray-50" onClick={resetConstraints}>
            Reset constraints
          </button>
          <button className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700" onClick={optimize}>
            {`Optimize ${numLineups}`}
          </button>
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
          <button className="px-2 py-1 text-sm rounded-md border hover:bg-gray-50" onClick={() => setRules((R) => [...R, { if_pos:["QB"], then_at_least:1, from_pos:["WR","TE"], team_scope:"same_team" }])}>
            + Add Rule
          </button>
        </div>
        {rules.length === 0 ? (
          <div className="text-xs text-gray-500">No rules yet.</div>
        ) : (
          <div className="space-y-2">
            {rules.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="text-sm">IF</span>
                <span className="px-2 py-1 rounded bg-blue-50 text-blue-800 text-sm">{cfg.capTag}</span>
                <span className="text-sm">is</span>
                {["QB","RB","WR","TE","DST","K"].map((p) => (
                  <button
                    key={p}
                    className={`px-2 py-1 rounded border text-sm ${r.if_pos?.includes(p) ? "bg-blue-600 text-white" : "bg-white"}`}
                    onClick={() => setRules((R) => {
                      const copy = [...R]; const cur = new Set(copy[i].if_pos || []);
                      cur.has(p) ? cur.delete(p) : cur.add(p);
                      copy[i] = { ...copy[i], if_pos: [...cur] }; return copy;
                    })}
                  >
                    {p}
                  </button>
                ))}
                <span className="text-sm">THEN require at least</span>
                <input className="w-14 border rounded-md px-2 py-1 text-sm" value={r.then_at_least ?? 1} onChange={(e) => setRules((R)=>{const c=[...R]; c[i]={...c[i], then_at_least:e.target.value}; return c;})}/>
                <span className="text-sm">from</span>
                {["QB","RB","WR","TE","DST","K"].map((p) => (
                  <button
                    key={p}
                    className={`px-2 py-1 rounded border text-sm ${r.from_pos?.includes(p) ? "bg-green-600 text-white" : "bg-white"}`}
                    onClick={() => setRules((R) => {
                      const copy = [...R]; const cur = new Set(copy[i].from_pos || []);
                      cur.has(p) ? cur.delete(p) : cur.add(p);
                      copy[i] = { ...copy[i], from_pos: [...cur] }; return copy;
                    })}
                  >
                    {p}
                  </button>
                ))}
                <select className="border rounded-md px-2 py-1 text-sm" value={r.team_scope || "any"} onChange={(e)=>setRules((R)=>{const c=[...R]; c[i]={...c[i], team_scope:e.target.value}; return c;})}>
                  <option value="same_team">same team</option>
                  <option value="opp_team">opp team</option>
                  <option value="any">any team</option>
                </select>
                <button className="ml-auto px-2 py-1 text-sm rounded-md border hover:bg-gray-50" onClick={()=>setRules((R)=>R.filter((_,j)=>j!==i))}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* progress bar */}
      <div className="mb-2 flex items-center gap-3">
        <div className="flex-1 max-w-xs h-2 bg-gray-200 rounded overflow-hidden">
          <div className="h-2 bg-blue-500 rounded transition-all duration-300"
            style={{
              width: `${
                (Math.min(progressUI, Math.max(1, Number(numLineups) || 1)) /
                  Math.max(1, Number(numLineups) || 1)) * 100
              }%`,
            }}
          />
        </div>
        <div className="text-sm text-gray-600 min-w-[60px] text-right">
          {progressUI}/{numLineups}
        </div>
      </div>

      {/* Player table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-auto mb-6 max-h-[720px]">
        <table className={`w-full border-separate ${textSz}`} style={{ borderSpacing: 0 }}>
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {TABLE_COLS.map(({ key, label, sortable }) => (
                <th key={key} className={`${header} whitespace-nowrap cursor-${sortable ? "pointer" : "default"} select-none`} onClick={() => sortable && setSort(key)}>
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
              <tr key={r.key} className="odd:bg-white even:bg-gray-50 hover:bg-blue-50/60 transition-colors">
                <td className={cell}><input type="checkbox" checked={locks.has(tagKey(r.name, r.tag==="CPT"?"CPT":"FLEX"))} onChange={() => toggleLock(r.name, r.tag==="CPT"?"CPT":"FLEX")} /></td>
                <td className={cell}><input type="checkbox" checked={excls.has(tagKey(r.name, r.tag==="CPT"?"CPT":"FLEX"))} onChange={() => toggleExcl(r.name, r.tag==="CPT"?"CPT":"FLEX")} /></td>
                <td className={cell}>
                  <div className="inline-flex items-center gap-1">
                    <button className="px-1.5 py-0.5 border rounded" title="+3%" onClick={() => bumpBoost(r.name, +1)}>▲</button>
                    <span className="w-5 text-center">{boost[r.name] || 0}</span>
                    <button className="px-1.5 py-0.5 border rounded" title="-3%" onClick={() => bumpBoost(r.name, -1)}>▼</button>
                  </div>
                </td>
                <td className={cell}>{r.tag}</td>
                <td className={`${cell} whitespace-nowrap`}>{r.name}</td>
                <td className={cell}><TeamPill abbr={r.team} /></td>
                <td className={cell}><TeamPill abbr={r.opp} /></td>
                <td className={cell}>{r.pos}</td>
                <td className={`${cell} tabular-nums`}>{fmt0(r.salaryDisplay)}</td>
                <td className={`${cell} tabular-nums`}>{fmt1(r.projDisplay * (1 + 0.03 * (boost[r.name] || 0)))}</td>
                <td className={`${cell} tabular-nums`}>{fmt1(r.floorDisplay)}</td>
                <td className={`${cell} tabular-nums`}>{fmt1(r.ceilDisplay)}</td>
                <td className={`${cell} tabular-nums`}>{fmt1(r.pownDisplay * 100)}</td>
                <td className={`${cell} tabular-nums`}>{fmt1(r.optDisplay * 100)}</td>
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
                <td className={`${cell} tabular-nums`}>{usagePct[r.key] != null ? fmt1(usagePct[r.key]) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Results */}
      {!!lineups.length && (
        <div className="rounded-lg border bg-white p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold">Lineups ({lineups.length})</h2>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1.5 border rounded text-sm" onClick={() => downloadSiteLineupsCSV({ lineups, site, rows, siteIds, cfg })}>Export CSV (IDs)</button>
            </div>
          </div>
          <div className="overflow-auto max-h-[440px]">
            <table className="min-w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
              <thead className="bg-gray-50">
                <tr>
                  <th className={header}>#</th>
                  <th className={header}>Salary</th>
                  <th className={header}>Total {optBy === "pown" || optBy === "opt" ? "Projection" : optBy==="proj"?"Proj":optBy==="floor"?"Floor":"Ceil"}</th>
                  <th className={header}>Players</th>
                </tr>
              </thead>
              <tbody>
                {lineups.map((L, i) => (
                  <tr key={i} className="odd:bg-white even:bg-gray-50">
                    <td className={cell}>{i + 1}</td>
                    <td className={`${cell} tabular-nums`}>{fmt0(L.salary)}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1(L.total)}</td>
                    <td className={`${cell} leading-snug`}>
                      <span className="break-words">{L.players[0]} (CPT) • {L.players.slice(1).join(" • ")}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------- CSV (IDs) ---------------------------- */
function normName(s){return String(s||"").toLowerCase().replace(/\u2019/g,"'").replace(/\./g,"").replace(/,\s*(jr|sr)\b/g,"").replace(/\b(jr|sr)\b/g,"").replace(/[^a-z' -]/g,"").replace(/\s+/g," ").trim();}
function normTeam(s){return (s||"").toUpperCase().trim();}
function normPos(s){const raw=(s||"").toUpperCase().trim(); return raw;}
function inferTeamFromNameForDST(name) {
  const nm = normName(name);
  for (const [abbr, t] of Object.entries(NFL_TEAMS)) {
    const nick = normName(t.nickname);
    const city = normName(t.city);
    const full = normName(`${t.city} ${t.nickname}`);
    if (nm === nick || nm === city || nm === full || nm.includes(nick) || nm.includes(city) || nm.includes(full)) {
      return abbr;
    }
  }
  return "";
}
function orderPlayersForSiteShowdown(names, rowsMap) {
  // showdown order is [CPT/MVP, FLEX*5] as given
  return names.map((n)=>rowsMap.get(n)).filter(Boolean);
}
function downloadSiteLineupsCSV({ lineups, site, rows, siteIds, cfg, fname = "nfl_showdown_ids.csv" }) {
  const siteKey = site === "fd" ? "fd" : "dk";
  const list = Array.isArray(siteIds?.[siteKey]) ? siteIds[siteKey] : (siteIds?.sites?.[siteKey] ?? []);

  // FanDuel prefix (group id) if present – same as classic export
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
    else if (prefCounts.size > 1) fdPrefix = [...prefCounts.entries()].sort((a,b) => b[1]-a[1])[0][0];
  }

  const keyStrict = (n,t,p) => `${normName(n)}|${normTeam(t)}|${normPos(p)}`;
  const keyLoose  = (n,p)   => `${normName(n)}|${normPos(p)}`;
  const keyTeam   = (t,p)   => `${normTeam(t)}|${normPos(p)}`;

  const idIndex = new Map();
  const put = (k, rec) => { if (k && !idIndex.has(k)) idIndex.set(k, rec); };

  for (const r of list) {
    const id  = String(r.id);
    const nm0 = r.name ?? r.player ?? r.Player;
    let pos0  = r.pos ?? r.Pos ?? r.POS ?? r.Position ?? r.position;
    let tm0   = r.team ?? r.Team ?? r.TEAM ?? r.team_abbr ?? r.TeamAbbrev;
    const nm  = nm0 ? String(nm0) : "";
    const pos = normPos(pos0);
    let  tm   = normTeam(tm0);
    if (pos === "DST" && !tm) tm = inferTeamFromNameForDST(nm) || "";
    const rec = { id, nameFromSite: nm, team: tm, pos, capId: r.cpt_id ?? r.mvp_id ?? r["FD MVP ID"] ?? r["DK CPT ID"] ?? null };

    if (nm) { put(keyStrict(nm, tm, pos), rec); put(keyLoose(nm, pos), rec); }
    if (pos === "DST" && tm) {
      put(keyTeam(tm, "DST"), rec);
      const meta = NFL_TEAMS[tm];
      if (meta) {
        put(keyStrict(meta.nickname, tm, "DST"), rec);
        put(keyLoose(meta.nickname, "DST"), rec);
        put(keyStrict(`${meta.city} ${meta.nickname}`, tm, "DST"), rec);
        put(keyLoose(`${meta.city} ${meta.nickname}`, "DST"), rec);
        put(keyStrict(meta.city, tm, "DST"), rec);
        put(keyLoose(meta.city, "DST"), rec);
      }
    }
  }

  const rowsByName = new Map(rows.map(r => [r.name, r]));
  const header = ["#", "Salary", "Total", "D1","D2","D3","D4","D5","D6"];
  const lines = lineups.map((L, idx) => {
    const ordered = orderPlayersForSiteShowdown(L.players, rowsByName);
    const cells = ordered.map((meta, i) => {
      const name = meta.name; const pos = meta.pos; const tm = meta.team;
      const ks = keyStrict(name, tm, pos); const kl = keyLoose(name, pos);
      let rec = idIndex.get(ks) || idIndex.get(kl);
      if (!rec && pos === "DST") rec = idIndex.get(keyTeam(tm, "DST")) || rec;
      if (!rec) return escapeCSV(name);
      if (siteKey === "fd") {
        const outId = fdPrefix ? `${fdPrefix}-${rec.id}` : rec.id;
        return escapeCSV(`${outId}:${rec.nameFromSite || name}`);
      }
      // DK: CPT row must use CPT id if available
      const isCaptain = (i === 0);
      const outId = isCaptain && rec.capId ? rec.capId : rec.id;
      return escapeCSV(`${name} (${outId})`);
    });
    while (cells.length < 6) cells.push("");
    return [idx + 1, L.salary, L.total.toFixed(1), ...cells].join(",");
  });

  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fname; a.click();
  URL.revokeObjectURL(url);
}
