// src/pages/nfl/NflShowdownOptimizer.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/* ----------------------------- API base ----------------------------- */
import API_BASE from "../../utils/api";

/* ----------------------------- tiny utils --------------------------- */
const clamp = (v, lo = 0, hi = 1e9) => Math.max(lo, Math.min(hi, v));
const num = (v) => {
  if (v == null) return undefined;
  const s = String(v).replace(/\$/g, "").replace(/[,  \s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};
const pct = (v) => {
  if (v == null) return undefined;
  const s = String(v).replace(/[%\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n / 100 : undefined;
};
const fmt0 = (n) => (Number.isFinite(n) ? n.toLocaleString() : "—");
const fmt1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : "—");
const escCSV = (s) => {
  const v = String(s ?? "");
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

/* ----------------------------- data hooks --------------------------- */
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
        const j = ct.includes("application/json")
          ? await res.json()
          : JSON.parse(await res.text());
        if (alive) { setData(j); setErr(null); }
      } catch (e) { if (alive) { setData(null); setErr(e); } }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [url]);
  return { data, err, loading };
}

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

/* ------------------------------ teams ------------------------------ */
const NFL_TEAMS = {
  ARI:{city:"Arizona",nickname:"Cardinals"}, ATL:{city:"Atlanta",nickname:"Falcons"}, BAL:{city:"Baltimore",nickname:"Ravens"},
  BUF:{city:"Buffalo",nickname:"Bills"}, CAR:{city:"Carolina",nickname:"Panthers"}, CHI:{city:"Chicago",nickname:"Bears"},
  CIN:{city:"Cincinnati",nickname:"Bengals"}, CLE:{city:"Cleveland",nickname:"Browns"}, DAL:{city:"Dallas",nickname:"Cowboys"},
  DEN:{city:"Denver",nickname:"Broncos"}, DET:{city:"Detroit",nickname:"Lions"}, GB:{city:"Green Bay",nickname:"Packers"},
  HOU:{city:"Houston",nickname:"Texans"}, IND:{city:"Indianapolis",nickname:"Colts"}, JAX:{city:"Jacksonville",nickname:"Jaguars"},
  KC:{city:"Kansas City",nickname:"Chiefs"}, LAC:{city:"Los Angeles",nickname:"Chargers"}, LAR:{city:"Los Angeles",nickname:"Rams"},
  LV:{city:"Las Vegas",nickname:"Raiders"}, MIA:{city:"Miami",nickname:"Dolphins"}, MIN:{city:"Minnesota",nickname:"Vikings"},
  NE:{city:"New England",nickname:"Patriots"}, NO:{city:"New Orleans",nickname:"Saints"}, NYG:{city:"New York",nickname:"Giants"},
  NYJ:{city:"New York",nickname:"Jets"}, PHI:{city:"Philadelphia",nickname:"Eagles"}, PIT:{city:"Pittsburgh",nickname:"Steelers"},
  SEA:{city:"Seattle",nickname:"Seahawks"}, SF:{city:"San Francisco",nickname:"49ers"}, TB:{city:"Tampa Bay",nickname:"Buccaneers"},
  TEN:{city:"Tennessee",nickname:"Titans"}, WAS:{city:"Washington",nickname:"Commanders"},
};
const TEAM_COLORS = {
  ARI:"#97233F", ATL:"#A71930", BAL:"#241773", BUF:"#00338D", CAR:"#0085CA",
  CHI:"#0B162A", CIN:"#FB4F14", CLE:"#311D00", DAL:"#041E42", DEN:"#FB4F14",
  DET:"#0076B6", GB:"#203731", HOU:"#03202F", IND:"#002C5F", JAX:"#006778",
  KC:"#E31837", LAC:"#0080C6", LAR:"#003594", LV:"#000000", MIA:"#008E97",
  MIN:"#4F2683", NE:"#002244", NO:"#D3BC8D", NYG:"#0B2265", NYJ:"#125740",
  PHI:"#004C54", PIT:"#FFB612", SEA:"#002244", SF:"#AA0000", TB:"#D50A0A",
  TEN:"#0C2340", WAS:"#5A1414",
};
const hexToRGB = (hex) => {
  const h = (hex || "#888").replace("#", "");
  const v = parseInt(h, 16);
  return { r:(v>>16)&255, g:(v>>8)&255, b:v&255 };
};
const readableText = (hex) => {
  const {r,g,b} = hexToRGB(hex);
  const L = 0.2126*r + 0.7152*g + 0.0722*b;
  return L < 140 ? "#FFFFFF" : "#111111";
};
const TeamPill = ({ abbr, title }) => {
  const bg = TEAM_COLORS[abbr] || "#E5E7EB";
  const fg = readableText(bg);
  return (
    <span className="px-2 py-0.5 rounded" style={{ backgroundColor:bg, color:fg }} title={title || abbr}>
      {abbr || "—"}
    </span>
  );
};

/* ------------------------------ sources ---------------------------- */
const SOURCE = "/data/nfl/showdown/latest/projections.json";
const SITE_IDS_SOURCE = "/data/nfl/showdown/latest/site_ids.json";

/* --------------------------- sites/slots ---------------------------- */
const SHOWDOWN_SITES = {
  dk: {
    key: "dk",
    label: "DraftKings",
    logo: "/logos/dk.png",
    cap: 50000,
    slots: [
      { name: "CPT",  eligible: ["CPT-QB","CPT-RB","CPT-WR","CPT-TE","CPT-DST","CPT-K"] },
      { name: "FLEX", eligible: ["QB","RB","WR","TE","DST","K"] },
      { name: "FLEX", eligible: ["QB","RB","WR","TE","DST","K"] },
      { name: "FLEX", eligible: ["QB","RB","WR","TE","DST","K"] },
      { name: "FLEX", eligible: ["QB","RB","WR","TE","DST","K"] },
      { name: "FLEX", eligible: ["QB","RB","WR","TE","DST","K"] },
    ],
    capLabel: "CPT",
  },
  fd: {
    key: "fd",
    label: "FanDuel",
    logo: "/logos/fd.png",
    cap: 60000,
    slots: [
      { name: "MVP",  eligible: ["MVP-QB","MVP-RB","MVP-WR","MVP-TE","MVP-DST","MVP-K"] },
      { name: "FLEX", eligible: ["QB","RB","WR","TE","DST","K"] },
      { name: "FLEX", eligible: ["QB","RB","WR","TE","DST","K"] },
      { name: "FLEX", eligible: ["QB","RB","WR","TE","DST","K"] },
      { name: "FLEX", eligible: ["QB","RB","WR","TE","DST","K"] },
    ],
    capLabel: "MVP",
  },
};

/* ------------------------- showdown mappers ------------------------ */
const pick = (r, ...keys) => {
  for (const k of keys) {
    const v = r?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};

function mapShowdownRows(r, siteKey) {
  const capKey = siteKey === "fd" ? "mvp" : "cpt";
  const CAP = capKey.toUpperCase();
  const SITE = siteKey.toUpperCase();

  const name = String(r.player ?? r.Player ?? r.Name ?? r.playerName ?? r.name ?? "").trim();
  const basePos = String(r.pos ?? r.Pos ?? r.POS ?? r.Position ?? r.position ?? "").toUpperCase();
  const team = String(r.team ?? r.Team ?? r.TEAM ?? r.team_abbr ?? "").toUpperCase();
  const opp  = String(r.opp  ?? r.Opp  ?? r.OPP  ?? r.opponent ?? "").toUpperCase();
  const time = r.Time ?? r["Time ET"] ?? r.Start ?? r.time ?? "";

  // FLEX (explicit flex -> fallback)
  const flexProj = num(pick(r, `${siteKey}_flex_proj`, `${siteKey}_proj`)) ?? 0;
  const flexFloor = num(pick(r, `${siteKey}_flex_floor`, `${siteKey}_floor`)) ?? 0;
  const flexCeil  = num(pick(r, `${siteKey}_flex_ceil`,  `${siteKey}_ceil`))  ?? 0;
  const flexPOwn  = pct(pick(r, `${siteKey}_flex_pown%`, `${siteKey}_flex_pown`, `${siteKey}_pown%`, `${siteKey}_pown`)) ?? 0;
  const flexOpt   = pct(pick(r, `${siteKey}_flex_opt%`,  `${siteKey}_flex_opt`,  `${siteKey}_opt%`,  `${siteKey}_opt`))  ?? 0;
  const flexSal   = num(pick(r, `${siteKey}_flex_sal`, `${SITE} FLEX Sal`, `${siteKey}_sal`, `${SITE} Sal`)) ?? 0;
  const flexUid   = pick(r, `${siteKey}_flex_id`, `${siteKey}_id`, `${SITE} Flex id`, `${SITE} id`, "uid") ?? "";

  const flex = {
    tag: "FLEX",
    name,
    nameSolve: `FLEX: ${name}`,
    team, opp, time,
    pos: basePos,
    posSolve: basePos,
    salary: Math.round(flexSal),
    proj: flexProj, floor: flexFloor, ceil:flexCeil,
    pown: flexPOwn, opt: flexOpt,
    uid: flexUid,
  };

  // CAPTAIN (explicit -> base*1.5)
  const capProj = num(pick(r, `${siteKey}_${capKey}_proj`)) ?? (num(pick(r, `${siteKey}_proj`)) ?? 0) * 1.5;
  const capFloor = num(pick(r, `${siteKey}_${capKey}_floor`)) ?? (num(pick(r, `${siteKey}_floor`)) ?? 0) * 1.5;
  const capCeil = num(pick(r, `${siteKey}_${capKey}_ceil`)) ?? (num(pick(r, `${siteKey}_ceil`)) ?? 0) * 1.5;
  const capPOwn = pct(pick(r, `${siteKey}_${capKey}_pown%`, `${siteKey}_${capKey}_pown`, `${siteKey}_pown%`, `${siteKey}_pown`)) ?? 0;
  const capOpt  = pct(pick(r, `${siteKey}_${capKey}_opt%`, `${siteKey}_${capKey}_opt`, `${siteKey}_opt%`, `${siteKey}_opt`)) ?? 0;
  const capSal  = num(pick(r, `${siteKey}_${capKey}_sal`, `${SITE} ${CAP} Sal`, `${siteKey}_sal`, `${SITE} Sal`));
  const capUid  = pick(r, `${siteKey}_${capKey}_id`, `${SITE} ${CAP} id`, `${siteKey}_id`, "uid") ?? "";

  const cap = {
    tag: CAP,
    name,
    nameSolve: `${CAP}: ${name}`,
    team, opp, time,
    pos: `${CAP} - ${basePos}`,
    posSolve: `${CAP}-${basePos}`,
    salary: Math.round((capSal ?? 0) || Math.round((flexSal || 0) * 1.5)),
    proj: capProj, floor: capFloor, ceil: capCeil,
    pown: capPOwn, opt: capOpt,
    uid: capUid,
  };

  return [flex, cap];
}

function expandShowdownRows(raw, siteKey) {
  const arr = Array.isArray(raw?.rows) ? raw.rows
    : Array.isArray(raw?.players) ? raw.players
    : Array.isArray(raw?.data) ? raw.data
    : Array.isArray(raw) ? raw
    : [];
  const out = [];
  for (const r of arr) {
    const [flex, cap] = mapShowdownRows(r, siteKey);
    if (flex.name && flex.pos) out.push(flex);
    if (cap.name && cap.pos)   out.push(cap);
  }
  return out;
}

function showdownPlayersForSolve(rows) {
  return rows.map(r => ({
    name: r.nameSolve,
    pos: r.posSolve,
    team: r.team,
    opp: r.opp,
    salary: r.salary,
    proj: r.proj,
    floor: r.floor,
    ceil: r.ceil,
    pown: r.pown,
    opt: r.opt,
  }));
}

/* captain first, then QB, then skill, etc. */
function orderShowdownPlayersForExport(names, rowsByName) {
  const pool = names.map((n) => rowsByName.get(n)).filter(Boolean);
  const out = [];
  const capIdx = pool.findIndex((r) => r.tag === "CPT" || r.tag === "MVP");
  if (capIdx !== -1) out.push(pool.splice(capIdx, 1)[0]);
  const takeFirst = (pred) => {
    const i = pool.findIndex(pred);
    if (i !== -1) out.push(pool.splice(i, 1)[0]);
  };
  takeFirst((r) => r.posSolve === "QB");
  while (pool.length) {
    const i = pool.findIndex((r) => ["RB","WR","TE"].includes(r.posSolve));
    if (i !== -1) out.push(pool.splice(i, 1)[0]);
    else out.push(pool.shift());
  }
  return out;
}

/* ----------------------------- SSE solver -------------------------- */
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
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.done) onDone?.(evt);
        else onItem?.(evt);
      } catch {}
    }
  }
}

/* ----------------------------- page ------------------------------- */
export default function NflShowdownOptimizer() {
  const { data, err, loading } = useJson(SOURCE);
  const { data: siteIds } = useJson(SITE_IDS_SOURCE);

  const [site, setSite] = useStickyState("nflSD.site", "dk");
  const cfg = SHOWDOWN_SITES[site];

  const [viewTag, setViewTag] = useStickyState("nflSD.viewTag", "ALL"); // ALL | CAP | FLEX
  const capLabel = cfg.capLabel; // CPT | MVP

  const [optBy, setOptBy] = useStickyState("nflSD.optBy", "proj");
  const [numLineups, setNumLineups] = useStickyState("nflSD.N", 20);
  const [maxSalary, setMaxSalary] = useStickyState(`nflSD.${site}.cap`, cfg.cap);
  useEffect(() => { setMaxSalary(cfg.cap); }, [site]);
  const [maxOverlap, setMaxOverlap] = useStickyState("nflSD.maxOverlap", 5);

  const [globalMax, setGlobalMax] = useStickyState("nflSD.gmax", 100);
  const [randomness, setRandomness] = useStickyState("nflSD.rand", 0);
  const [maxLineupPown, setMaxLineupPown] = useStickyState("nflSD.maxLineupPown", "");

  const [locks, setLocks] = useState(() => new Set());
  const [excls, setExcls] = useState(() => new Set());
  const [minPct, setMinPct] = useState(() => ({}));
  const [maxPct, setMaxPct] = useState(() => ({}));
  const [boost, setBoost] = useState(() => ({}));

  // IF→THEN captain helper rule (UI builds these, server can optionally use)
  const [ifThenRules, setIfThenRules] = useStickyState(`nflSD.${site}.ifthen`, [
    // example default: IF (CPT/MVP) is QB THEN require at least 1 FLEX from RB/WR/TE on same team
    { ifPos: "QB", thenAtLeast: 1, fromPos: { RB:true, WR:true, TE:true }, side: "same" } // "same" | "opp" | "any"
  ]);

  const [lineups, setLineups] = useState([]);
  const [stopInfo, setStopInfo] = useState(null);
  const [progressActual, setProgressActual] = useState(0);
  const [isOptimizing, setIsOptimizing] = useState(false);

  useEffect(() => { setLineups([]); setStopInfo(null); setProgressActual(0); setLocks(new Set()); setExcls(new Set()); }, [site]);

  /* ----------------------------- rows ------------------------------ */
  const rows = useMemo(() => {
    if (!data) return [];
    const expanded = expandShowdownRows(data, site);
    // default sort: captain first, then projection
    expanded.sort((a,b) => {
      const ac = a.tag === "CPT" || a.tag === "MVP";
      const bc = b.tag === "CPT" || b.tag === "MVP";
      if (ac !== bc) return bc - ac;
      return (b.proj ?? 0) - (a.proj ?? 0) || a.name.localeCompare(b.name);
    });
    return expanded;
  }, [data, site]);

  const filteredRows = useMemo(() => {
    if (viewTag === "ALL") return rows;
    if (viewTag === "CAP") return rows.filter(r => r.tag === "CPT" || r.tag === "MVP");
    return rows.filter(r => r.tag === "FLEX");
  }, [rows, viewTag]);

  const allTeams = useMemo(() => {
    const s = new Set();
    for (const r of rows) { if (r.team) s.add(r.team); if (r.opp) s.add(r.opp); }
    return [...s].sort();
  }, [rows]);

  const [q, setQ] = useState("");
  const displayRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const ok = (r) =>
      !needle ||
      r.name.toLowerCase().includes(needle) ||
      r.team.toLowerCase().includes(needle) ||
      r.opp.toLowerCase().includes(needle) ||
      r.pos.toLowerCase().includes(needle) ||
      String(r.salary).includes(needle);
    return filteredRows.filter(ok);
  }, [filteredRows, q]);

  /* ------------------------------ table sort ----------------------- */
  const [sort, setSort] = useState({ col: "proj", dir: "desc" });
  const sortable = new Set(["tag","name","team","opp","pos","salary","proj","floor","ceil","pown","opt"]);
  const sortedRows = useMemo(() => {
    const { col, dir } = sort;
    const mult = dir === "asc" ? 1 : -1;
    const arr = [...displayRows];
    arr.sort((a,b) => {
      if (["tag","name","team","opp","pos"].includes(col)) {
        return (a[col]||"").localeCompare(b[col]||"") * mult;
      }
      const va = a[col] ?? 0, vb = b[col] ?? 0;
      if (va < vb) return -1 * mult;
      if (va > vb) return 1 * mult;
      return a.name.localeCompare(b.name) * mult;
    });
    return arr;
  }, [displayRows, sort]);
  const sortArrow = (key) => sort.col === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
  const onSort = (key) => {
    if (!sortable.has(key)) return;
    setSort((s) => s.col === key ? { col:key, dir: s.dir === "asc" ? "desc" : "asc" } : { col:key, dir:"desc" });
  };

  /* ----------------------------- actions --------------------------- */
  const bumpBoost = (name, step) => setBoost((m) => ({ ...m, [name]: clamp((m[name] || 0) + step, -6, 6) }));
  const toggleLock = (name) => setLocks((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const toggleExcl = (name) => setExcls((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });

  const resetConstraints = () => {
    setLocks(new Set()); setExcls(new Set()); setMinPct({}); setMaxPct({}); setBoost({});
  };

  /* ----------------------------- optimize -------------------------- */
  async function optimize() {
    if (!rows.length) return;
    setIsOptimizing(true); setLineups([]); setStopInfo(null); setProgressActual(0);

    const slotsForSolve = SHOWDOWN_SITES[site].slots;
    const roster = slotsForSolve.length;
    const minDiff = Math.max(1, roster - clamp(Number(maxOverlap)||0, 0, roster-1));

    const rowsBySolveName = new Map(rows.map(r => [r.nameSolve, r]));
    const lineupPownPct = (names) => names.reduce((s, n) => s + (((rowsBySolveName.get(n)?.pown) || 0) * 100), 0);
    const lineupCap = String(maxLineupPown).trim() === "" ? null : clamp(Number(maxLineupPown)||0, 0, 100);

    const players = showdownPlayersForSolve(rows).map((p) => ({
      ...p,
      // apply boost client-side to solve objective
      proj: p.proj * (1 + 0.03 * (boost[p.name.replace(/^FLEX:\s|^(CPT|MVP):\s/,"")] || 0)),
    }));

    // translate simple IF→THEN rules to a hint structure the backend may honor (optional)
    const captain_rules = (ifThenRules || []).map(r => ({
      if_captain_pos: r.ifPos,             // "QB","RB","WR","TE","DST","K"
      then_at_least: Math.max(0, Number(r.thenAtLeast)||0),
      pool_pos: Object.keys(r.fromPos||{}).filter(k => r.fromPos[k]),
      side: r.side || "same",              // "same" | "opp" | "any"
    }));

    const payload = {
      site,
      slots: slotsForSolve,
      players,
      n: Math.max(1, Number(numLineups) || 1),
      cap: Math.min(cfg.cap, Number(maxSalary) || cfg.cap),
      objective: optBy,
      locks: Array.from(locks),
      excludes: Array.from(excls),
      boosts: {}, // already applied above
      randomness: clamp(Number(randomness) || 0, 0, 100),
      global_max_pct: clamp(Number(globalMax) || 100, 0, 100),
      min_pct: Object.fromEntries(Object.entries(minPct).map(([k,v]) => [k, clamp(Number(v)||0, 0, 100)])),
      max_pct: Object.fromEntries(Object.entries(maxPct).map(([k,v]) => [k, clamp(Number(v)||100, 0, 100)])),
      min_diff: minDiff,
      time_limit_ms: 1500,

      // Optional extra for a captain-aware server (safe to include if ignored):
      captain_rules,
    };

    const out = [];
    try {
      await solveStreamNFL(
        payload,
        (evt) => {
          if (lineupCap != null && lineupPownPct(evt.drivers) > lineupCap) return;
          const L = { players: evt.drivers, salary: evt.salary, total: evt.total };
          out.push(L);
          setLineups((prev) => [...prev, L]);
          setProgressActual(out.length);
        },
        (done) => {
          if (done?.reason) setStopInfo(done);
          setIsOptimizing(false);
          if (lineupCap != null && out.length < payload.n) {
            setStopInfo({ produced: out.length, requested: payload.n, reason: "lineup_pown_cap" });
          }
        }
      );
    } catch (e) {
      const res = await fetch(`${API_BASE}/solve_nfl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        alert(`Solve failed: ${await res.text()}`);
        setIsOptimizing(false);
        return;
      }
      const j = await res.json();
      const raw = (j.lineups || []).map((L) => ({ players: L.drivers, salary: L.salary, total: L.total })) || [];
      const out2 = lineupCap == null ? raw : raw.filter((L) => lineupPownPct(L.players) <= lineupCap);
      setLineups(out2);
      setProgressActual(out2.length);
      setIsOptimizing(false);
      if (out2.length < payload.n) {
        setStopInfo({ produced: out2.length, requested: payload.n, reason: "lineup_pown_cap" });
      }
    }
  }

  /* ----------------------------- exposures ------------------------- */
  const rowsBySolve = useMemo(() => new Map(rows.map(r => [r.nameSolve, r])), [rows]);

  const lineupConfigs = useMemo(() => {
    // e.g., "3-3", "4-2", "5-1" by team counts
    const counts = new Map();
    for (const L of lineups) {
      const teams = L.players.map(n => rowsBySolve.get(n)?.team).filter(Boolean);
      const by = new Map();
      for (const t of teams) by.set(t, (by.get(t)||0) + 1);
      const arr = [...by.values()].sort((a,b) => b-a);
      if (!arr.length) continue;
      const total = teams.length;
      // normalize to "A-B" with A ≥ B
      const shape = `${arr[0]}-${total - arr[0]}`;
      const majorTeam = [...by.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] || "";
      const key = `${shape} (${majorTeam})`;
      counts.set(key, (counts.get(key)||0) + 1);
    }
    return [...counts.entries()].sort((a,b)=>b[1]-a[1]);
  }, [lineups, rowsBySolve]);

  const usagePct = useMemo(() => {
    if (!lineups.length) return {};
    const m = new Map();
    for (const L of lineups) for (const p of L.players) m.set(p, (m.get(p) || 0) + 1);
    const total = Math.max(1, lineups.length);
    const out = {};
    for (const [name, cnt] of m.entries()) out[name] = (cnt / total) * 100;
    return out;
  }, [lineups]);

  /* ----------------------------- export CSV ------------------------ */
  function downloadPlainCSV() {
    const rowsByName = new Map(rows.map(r => [r.nameSolve, r]));
    const header = ["#", "Salary", "Total", "Players"].join(",");
    const lines = lineups.map((L, idx) => {
      const ordered = orderShowdownPlayersForExport(L.players, rowsByName);
      const players = `"${ordered.map(r => (r.tag === "CPT" || r.tag === "MVP") ? `${r.name} (${r.tag})` : r.name).join(" • ")}"`;
      return [idx+1, L.salary, (L.total ?? 0).toFixed(1), players].join(",");
    });
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "nfl_showdown_lineups.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  /* ------------------------------- UI ------------------------------ */
  const header = "px-2 py-1 font-semibold text-center";
  const cell = "px-2 py-1 text-center";
  const textSz = "text-[12px]";

  const TABLE_COLS = [
    { key:"lock", label:"Lock" },
    { key:"excl", label:"Excl" },
    { key:"tag", label:"Tag", sortable:true },
    { key:"name", label:"Player", sortable:true },
    { key:"team", label:"Tm", sortable:true },
    { key:"opp", label:"Opp", sortable:true },
    { key:"pos", label:"Pos", sortable:true },
    { key:"salary", label:"Salary", sortable:true },
    { key:"proj", label:"Proj", sortable:true },
    { key:"floor", label:"Floor", sortable:true },
    { key:"ceil", label:"Ceiling", sortable:true },
    { key:"pown", label:"pOWN%", sortable:true },
    { key:"opt", label:"Opt%", sortable:true },
    { key:"min", label:"Min%" },
    { key:"max", label:"Max%" },
    { key:"boosts", label:"Boosts" },
  ];

  const capFlexToggle = (
    <div className="inline-flex bg-white border rounded-full overflow-hidden">
      <button
        className={`px-3 py-1 text-sm ${viewTag==="ALL"?"bg-blue-50 text-blue-800":"text-gray-700"}`}
        onClick={()=>setViewTag("ALL")}
      >
        All
      </button>
      <button
        className={`px-3 py-1 text-sm ${viewTag==="CAP"?"bg-blue-50 text-blue-800":"text-gray-700"}`}
        onClick={()=>setViewTag("CAP")}
      >
        {cfg.capLabel}
      </button>
      <button
        className={`px-3 py-1 text-sm ${viewTag==="FLEX"?"bg-blue-50 text-blue-800":"text-gray-700"}`}
        onClick={()=>setViewTag("FLEX")}
      >
        FLEX
      </button>
    </div>
  );

  return (
    <div className="px-4 md:px-6 py-5">
      <h1 className="text-2xl md:text-3xl font-extrabold mb-1">NFL — Showdown Optimizer</h1>

      {/* site toggle, view toggle, knobs */}
      <div className="mb-3 flex flex-wrap gap-2 items-center">
        {["dk","fd"].map((s) => (
          <button
            key={s}
            onClick={() => setSite(s)}
            className={`px-3 py-1.5 rounded-full border text-sm inline-flex items-center gap-2 ${
              site === s ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-white border-gray-300 text-gray-700"
            }`}
          >
            <img src={SHOWDOWN_SITES[s].logo} alt="" className="w-4 h-4" onError={(e)=>{e.currentTarget.style.display="none"}}/>
            <span>{SHOWDOWN_SITES[s].label}</span>
          </button>
        ))}
        <div className="ml-2">{capFlexToggle}</div>

        <label className="ml-4 text-[11px] text-gray-600">Lineups</label>
        <input className="w-20 border rounded-md px-2 py-1.5 text-sm" value={numLineups} onChange={(e)=>setNumLineups(e.target.value)} />

        <label className="ml-2 text-[11px] text-gray-600">Max salary</label>
        <input className="w-24 border rounded-md px-2 py-1.5 text-sm" value={maxSalary} onChange={(e)=>setMaxSalary(e.target.value)} />

        <label className="ml-2 text-[11px] text-gray-600">Max Overlap</label>
        <input className="w-16 border rounded-md px-2 py-1.5 text-sm" value={maxOverlap} onChange={(e)=>setMaxOverlap(e.target.value)} title="Number of shared players allowed between any two lineups (captain counts as different player)" />

        <label className="ml-2 text-[11px] text-gray-600">Optimize by</label>
        <select className="border rounded-md px-2 py-1.5 text-sm" value={optBy} onChange={(e)=>setOptBy(e.target.value)}>
          <option value="proj">Projection</option>
          <option value="floor">Floor</option>
          <option value="ceil">Ceiling</option>
          <option value="pown">pOWN%</option>
          <option value="opt">Opt%</option>
        </select>

        <button className="ml-auto px-2.5 py-1.5 text-sm rounded-lg bg-white border hover:bg-gray-50" onClick={resetConstraints}>
          Reset constraints
        </button>
        <button className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700" onClick={optimize} disabled={isOptimizing}>
          {isOptimizing ? "Optimizing…" : `Optimize ${numLineups}`}
        </button>
      </div>

      {/* IF→THEN builder (simple) */}
      <div className="mb-3 border rounded-md p-2">
        <div className="text-[11px] text-gray-600 mb-2">Conditional Rules (IF → THEN)</div>
        {ifThenRules.map((r, i) => (
          <div key={i} className="flex flex-wrap gap-2 items-center mb-2">
            <span className="text-sm">IF</span>
            <select className="border rounded px-2 py-1 text-sm" value={r.ifPos} onChange={(e)=>setIfThenRules(R => R.map((x,j)=>j===i?{...x, ifPos:e.target.value}:x))}>
              {["QB","RB","WR","TE","DST","K"].map(p => <option key={p} value={p}>{capLabel} is {p}</option>)}
            </select>
            <span className="text-sm">THEN require at least</span>
            <input className="w-14 border rounded px-2 py-1 text-sm" value={r.thenAtLeast} onChange={(e)=>setIfThenRules(R=>R.map((x,j)=>j===i?{...x, thenAtLeast:e.target.value}:x))}/>
            <span className="text-sm">from</span>
            {["QB","RB","WR","TE","DST","K"].map(p => (
              <label key={p} className={`px-2 py-1 border rounded text-sm cursor-pointer ${r.fromPos?.[p]?"bg-green-100 border-green-300":"bg-white"}`}>
                <input type="checkbox" className="mr-1" checked={!!r.fromPos?.[p]} onChange={(e)=>setIfThenRules(R=>R.map((x,j)=>j===i?{...x, fromPos:{ ...(x.fromPos||{}), [p]: e.target.checked }}:x))}/>
                {p}
              </label>
            ))}
            <select className="border rounded px-2 py-1 text-sm" value={r.side} onChange={(e)=>setIfThenRules(R=>R.map((x,j)=>j===i?{...x, side:e.target.value}:x))}>
              <option value="same">same team</option>
              <option value="opp">opp team</option>
              <option value="any">any team</option>
            </select>
            <button className="ml-2 px-2 py-1 text-sm border rounded hover:bg-gray-50" onClick={()=>setIfThenRules(R => R.filter((_,j)=>j!==i))}>Delete</button>
          </div>
        ))}
        <button className="px-2 py-1 text-sm border rounded hover:bg-gray-50" onClick={()=>setIfThenRules(R=>[...R,{ ifPos:"QB", thenAtLeast:1, fromPos:{RB:true,WR:true,TE:true}, side:"same" }])}>+ Add Rule</button>
      </div>

      {/* search */}
      <div className="mb-2">
        <input className="border rounded-md px-3 py-1.5 w-80 text-sm" placeholder="Search player / team / pos…" value={q} onChange={(e)=>setQ(e.target.value)} />
      </div>

      {/* Player table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-auto mb-6 max-h-[700px]">
        <table className={`w-full border-separate ${textSz}`} style={{ borderSpacing: 0 }}>
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {TABLE_COLS.map(({ key, label, sortable }) => (
                <th key={key} className={`${header} whitespace-nowrap cursor-${sortable ? "pointer" : "default"} select-none`} onClick={()=>sortable&&onSort(key)}>
                  {label}{sortable ? <span className="opacity-60">{sortArrow(key)}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className={`${cell} text-gray-500`} colSpan={TABLE_COLS.length}>Loading…</td></tr>}
            {err && <tr><td className={`${cell} text-red-600`} colSpan={TABLE_COLS.length}>Failed to load: {String(err)}</td></tr>}
            {!loading && !err && sortedRows.map((r) => (
              <tr key={r.nameSolve} className="odd:bg-white even:bg-gray-50 hover:bg-blue-50/60 transition-colors">
                <td className={cell}><input type="checkbox" checked={locks.has(r.nameSolve)} onChange={()=>toggleLock(r.nameSolve)} /></td>
                <td className={cell}><input type="checkbox" checked={excls.has(r.nameSolve)} onChange={()=>toggleExcl(r.nameSolve)} /></td>
                <td className={cell}>{r.tag}</td>
                <td className={`${cell} whitespace-nowrap`}>{r.name}</td>
                <td className={cell}><TeamPill abbr={r.team} /></td>
                <td className={cell}><TeamPill abbr={r.opp} /></td>
                <td className={cell}>{r.pos}</td>
                <td className={`${cell} tabular-nums`}>{fmt0(r.salary)}</td>
                <td className={`${cell} tabular-nums`}>{fmt1(r.proj)}</td>
                <td className={`${cell} tabular-nums`}>{fmt1(r.floor)}</td>
                <td className={`${cell} tabular-nums`}>{fmt1(r.ceil)}</td>
                <td className={`${cell} tabular-nums`}>{fmt1((r.pown||0)*100)}</td>
                <td className={`${cell} tabular-nums`}>{fmt1((r.opt||0)*100)}</td>
                <td className={cell}>
                  <input className="w-12 border rounded px-1.5 py-0.5 text-center" value={String(minPct[r.nameSolve] ?? "")} onChange={(e)=>setMinPct((m)=>({...m,[r.nameSolve]:e.target.value}))} placeholder="—" />
                </td>
                <td className={cell}>
                  <input className="w-12 border rounded px-1.5 py-0.5 text-center" value={String(maxPct[r.nameSolve] ?? "")} onChange={(e)=>setMaxPct((m)=>({...m,[r.nameSolve]:e.target.value}))} placeholder="—" />
                </td>
                <td className={cell}>
                  <div className="inline-flex items-center gap-1">
                    <button className="px-1.5 py-0.5 border rounded" title="+3%" onClick={()=>bumpBoost(r.name, +1)}>▲</button>
                    <span className="w-5 text-center">{boost[r.name] || 0}</span>
                    <button className="px-1.5 py-0.5 border rounded" title="-3%" onClick={()=>bumpBoost(r.name, -1)}>▼</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* results & exposures */}
      {!!lineups.length && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Lineups */}
          <section className="lg:col-span-8 rounded-lg border bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold">Lineups ({lineups.length})</h2>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 border rounded text-sm" onClick={downloadPlainCSV}>
                  Export CSV
                </button>
              </div>
            </div>
            <div className="overflow-auto max-h-[440px]">
              <table className="min-w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
                <thead className="bg-gray-50">
                  <tr>
                    <th className={header}>#</th>
                    <th className={header}>Salary</th>
                    <th className={header}>Total pOWN%</th>
                    <th className={header}>Total {optBy === "pown" || optBy === "opt" ? "Projection" : (optBy==="proj"?"Proj":optBy)}</th>
                    <th className={header}>Players</th>
                  </tr>
                </thead>
                <tbody>
                  {lineups.map((L, i) => {
                    const by = new Map(rows.map(r => [r.nameSolve, r]));
                    const ordered = orderShowdownPlayersForExport(L.players, by);
                    const totalPown = ordered.reduce((s, r) => s + ((r.pown || 0) * 100), 0);
                    return (
                      <tr key={i} className="odd:bg-white even:bg-gray-50">
                        <td className={cell}>{i + 1}</td>
                        <td className={`${cell} tabular-nums`}>{fmt0(L.salary)}</td>
                        <td className={`${cell} tabular-nums`}>{fmt1(totalPown)}</td>
                        <td className={`${cell} tabular-nums`}>{fmt1(L.total)}</td>
                        <td className={`${cell} leading-snug`}>
                          <span className="break-words">
                            {ordered.map((r, idx) => (
                              <span key={idx}>
                                {idx ? " • " : ""}{r.name}{(r.tag==="CPT"||r.tag==="MVP")?" ("+r.tag+")":""}
                              </span>
                            ))}
                          </span>
                        </td>
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

          {/* Lineup Configs (3-3 / 4-2 / 5-1, with major team) */}
          <section className="lg:col-span-4 rounded-lg border bg-white p-3">
            <h3 className="text-base font-semibold mb-2">Lineup Configs</h3>
            <table className="min-w-full text-[12px]">
              <thead><tr><th className={header}>Shape</th><th className={header}>Count</th><th className={header}>%</th></tr></thead>
              <tbody>
                {lineupConfigs.map(([shape, cnt]) => (
                  <tr key={shape}>
                    <td className={cell}>{shape}</td>
                    <td className={`${cell} tabular-nums`}>{fmt0(cnt)}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1((cnt/Math.max(1,lineups.length))*100)}</td>
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

/* ---------------------- Exposure helpers ------------------------ */
function ExposureTable({ lineups, rows }) {
  const meta = useMemo(() => new Map(rows.map(r => [r.nameSolve, r])), [rows]);
  const allRows = useMemo(() => {
    const m = new Map();
    for (const L of lineups) for (const p of L.players) m.set(p, (m.get(p) || 0) + 1);
    const total = Math.max(1, lineups.length);
    return [...m.entries()]
      .map(([name, cnt]) => {
        const r = meta.get(name);
        return { name: r?.name || name, tag: r?.tag || "", pos: r?.pos || "", count: cnt, pct: (cnt/total)*100, team: r?.team };
      })
      .sort((a,b)=>b.pct - a.pct || a.name.localeCompare(b.name));
  }, [lineups, meta]);

  if (!allRows.length) return null;
  const header = "px-2 py-1 font-semibold text-center";
  const cell = "px-2 py-1 text-center";
  return (
    <div className="overflow-auto max-h-[440px]">
      <table className="min-w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
        <thead className="bg-gray-50"><tr>
          <th className={header}>Player</th><th className={header}>Tag</th><th className={header}>Team</th>
          <th className={header}>Count</th><th className={header}>Exposure %</th>
        </tr></thead>
        <tbody>
          {allRows.map((r)=>(
            <tr key={`${r.name}-${r.tag}`} className="odd:bg-white even:bg-gray-50">
              <td className={cell}>{r.name}</td>
              <td className={cell}>{r.tag}</td>
              <td className={cell}><TeamPill abbr={r.team}/></td>
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
  const rowsBy = useMemo(()=>new Map(rows.map(r=>[r.nameSolve, r])), [rows]);
  const data = useMemo(() => {
    const counts = new Map();
    for (const L of lineups) {
      const chosenTeams = new Set(L.players.map(n => rowsBy.get(n)?.team).filter(Boolean));
      for (const t of chosenTeams) counts.set(t, (counts.get(t)||0)+1);
    }
    const total = Math.max(1, lineups.length);
    return [...counts.entries()].map(([team,cnt]) => ({ team, count:cnt, pct: (cnt/total)*100 }))
      .sort((a,b)=>b.pct - a.pct || a.team.localeCompare(b.team));
  }, [lineups, rowsBy]);
  if (!data.length) return null;
  const header = "px-2 py-1 font-semibold text-center";
  const cell = "px-2 py-1 text-center";
  return (
    <table className="min-w-full text-[12px]">
      <thead><tr><th className={header}>Team</th><th className={header}>Count</th><th className={header}>Exposure %</th></tr></thead>
      <tbody>{data.map(r=>(
        <tr key={r.team}><td className={cell}><TeamPill abbr={r.team}/></td><td className={`${cell} tabular-nums`}>{fmt0(r.count)}</td><td className={`${cell} tabular-nums`}>{fmt1(r.pct)}</td></tr>
      ))}</tbody>
    </table>
  );
}
