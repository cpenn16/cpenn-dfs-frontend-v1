// src/pages/nfl/NflShowdownOptimizer.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import API_BASE from "../../utils/api";

/* ---------------- small utils ---------------- */
const clamp = (v, lo = 0, hi = 1e9) => Math.max(lo, Math.min(hi, v));
const num = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/\$/g, "").replace(/[, \ss]/g, "").replace(/%/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const fmt0 = (n) => (Number.isFinite(n) ? n.toLocaleString() : "—");
const fmt1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : "—");
const escapeCSV = (s) => {
  const v = String(s ?? "");
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const normName = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/\./g, "")
    .replace(/,\s*(jr|sr)\b/g, "")
    .replace(/\b(jr|sr)\b/g, "")
    .replace(/[^a-z' -]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const normTeam = (s) => (s || "").toUpperCase().trim();
const normPos = (s) => {
  const raw = (s || "").toUpperCase().replace("/FLEX", "").trim();
  if (raw === "D" || raw === "DEF" || raw === "DEFENSE" || raw.includes("D/ST") || raw === "DST") return "DST";
  return raw;
};

/* -------- team pills / colors (same map as classic) -------- */
const TEAM_COLORS = {
  ARI:"#97233F",ATL:"#A71930",BAL:"#241773",BUF:"#00338D",CAR:"#0085CA",CHI:"#0B162A",CIN:"#FB4F14",CLE:"#311D00",
  DAL:"#041E42",DEN:"#FB4F14",DET:"#0076B6",GB:"#203731",HOU:"#03202F",IND:"#002C5F",JAX:"#006778",KC:"#E31837",
  LAC:"#0080C6",LAR:"#003594",LV:"#000000",MIA:"#008E97",MIN:"#4F2683",NE:"#002244",NO:"#D3BC8D",NYG:"#0B2265",
  NYJ:"#125740",PHI:"#004C54",PIT:"#FFB612",SEA:"#002244",SF:"#AA0000",TB:"#D50A0A",TEN:"#0C2340",WAS:"#5A1414",
};
const hexToRGB = (hex) => {
  const h = (hex || "#888").replace("#", ""); const v = parseInt(h,16);
  return {r:(v>>16)&255,g:(v>>8)&255,b:v&255};
};
const readableText = (hex) => {
  const {r,g,b} = hexToRGB(hex);
  const L = 0.2126*r + 0.7152*g + 0.0722*b;
  return L < 140 ? "#FFF" : "#111";
};
const TeamPill = ({ abbr, title }) => {
  const bg = TEAM_COLORS[abbr] || "#E5E7EB"; const fg = readableText(bg);
  return <span className="px-2 py-0.5 rounded" style={{backgroundColor:bg,color:fg}} title={title||abbr}>{abbr||"—"}</span>;
};

/* -------------------- sources -------------------- */
const SOURCE = "/data/nfl/showdown/latest/projections.json";
const SITE_IDS_SOURCE = "/data/nfl/showdown/latest/site_ids.json";

/* -------------------- site config -------------------- */
const SITES = {
  dk: { key:"dk", label:"DraftKings", cap:50000, roleCPT:"CPT", roleFLEX:"FLEX", salaryKeys:{ cpt:["dkcptsal","dk_cpt_sal","dkcptsalary","dk cpt sal","dk cpt salary","dk cpt"], flex:["dkflexsal","dk_flex_sal","dkflexsalary","dk flex sal","dk flex salary","dk"] } },
  fd: { key:"fd", label:"FanDuel",   cap:60000, roleCPT:"MVP", roleFLEX:"FLEX", salaryKeys:{ cpt:["fdmvpsal","fd_mvp_sal","fdmvpsalary","fd mvp sal","fd mvp salary"], flex:["fdflexsal","fd_flex_sal","fdflexsalary","fd flex sal","fd flex salary"] } },
};
const ROLE_ORDER = ["CPT","MVP","FLEX"]; // display ordering helper

/* ------------------ data loaders ------------------ */
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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const json = JSON.parse(text);
        if (alive) { setData(json); setErr(null); }
      } catch (e) { if (alive) { setData(null); setErr(e); } }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [url]);
  return { data, err, loading };
}

/* -------------- SSE stream (server) -------------- */
async function solveStreamShowdown(payload, onItem, onDone) {
  const res = await fetch(`${API_BASE}/solve_showdown_stream`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!res.ok || !res.body) throw new Error("Stream failed to start");
  const reader = res.body.getReader(); const decoder = new TextDecoder("utf-8"); let buf = "";
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n"); buf = parts.pop() ?? "";
    for (const chunk of parts) {
      const line = chunk.split("\n").find((l) => l.startsWith("data: ")); if (!line) continue;
      try { const evt = JSON.parse(line.slice(6)); if (evt.done) onDone?.(evt); else onItem?.(evt); } catch {}
    }
  }
}

/* ---------------- Showdown page ---------------- */
export default function NflShowdownOptimizer() {
  const { data, err, loading } = useJson(SOURCE);
  const { data: siteIds } = useJson(SITE_IDS_SOURCE);

  const [site, setSite] = useState("dk"); // "dk" | "fd"
  const cfg = SITES[site];

  // view role filter (ALL/CPT/FLEX or ALL/MVP/FLEX)
  const [roleFilter, setRoleFilter] = useState("ALL");

  const [optBy, setOptBy] = useState("proj"); // "proj" | "floor" | "ceil" | "pown" | "opt"
  const [numLineups, setNumLineups] = useState(20);
  const [maxSalary, setMaxSalary] = useState(cfg.cap);
  useEffect(()=>setMaxSalary(SITES[site].cap),[site]);

  const [maxOverlap, setMaxOverlap] = useState(5); // distinct-player overlap cap across build

  const [globalMax, setGlobalMax] = useState(100);
  const [randomness, setRandomness] = useState(0);

  const [locks, setLocks] = useState(new Set());
  const [excls, setExcls] = useState(new Set());
  const [minPct, setMinPct] = useState({});
  const [maxPct, setMaxPct] = useState({});
  const [boost, setBoost] = useState({});

  const [lineups, setLineups] = useState([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [progress, setProgress] = useState(0);
  const tickRef = useRef(null);

  useEffect(() => {
    if (!isOptimizing) return;
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setProgress((p) => Math.min(Math.max(p + 1, 1), Math.max(1, Number(numLineups)||1)));
    }, 250);
    return () => clearInterval(tickRef.current);
  }, [isOptimizing, numLineups]);

  /* ---------- normalize + map showdown rows ---------- */
  const rows = useMemo(() => {
    if (!data) return [];
    const arr = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : [];
    // we’ll build a normalized lookup for forgiving key access
    const pick = (obj, ...keys) => {
      const table = new Map(Object.keys(obj||{}).map(k => [norm(k), k]));
      for (const k of keys) {
        const real = table.get(norm(k));
        if (real != null) return obj[real];
      }
      return undefined;
    };
    const pct = (v) => {
      if (v == null) return 0; const s = String(v).replace(/[%\s]/g,""); const n = Number(s);
      return Number.isFinite(n) ? n/100 : 0;
    };

    const mapped = arr.map((raw) => {
      const siteKey = cfg.key; // dk/fd
      const name = raw.player ?? raw.Player ?? raw.Name ?? raw.name ?? "";
      const role = (raw.tag ?? raw.role ?? raw.Tag ?? "").toString().toUpperCase().includes("CPT") ? "CPT"
                 : (raw.tag ?? raw.role ?? raw.Tag ?? "").toString().toUpperCase().includes("MVP") ? "MVP"
                 : (String(pick(raw, `${siteKey} role`, `${siteKey}_role`, "role")).toUpperCase().includes("MVP") ? "MVP"
                 : (String(pick(raw, `${siteKey} role`, `${siteKey}_role`, "role")).toUpperCase().includes("CPT") ? "CPT" : "FLEX"));

      const posRaw = raw.pos ?? raw.Pos ?? raw.POS ?? raw.Position ?? raw.position ?? "";
      const pos = (() => {
        const p = String(posRaw).toUpperCase();
        if (/CPT/.test(p)) return "CPT - " + p.replace(/.*CPT[^A-Z]*-?\s*/,"");
        if (/MVP/.test(p)) return "MVP - " + p.replace(/.*MVP[^A-Z]*-?\s*/,"");
        return p;
      })();

      const team = raw.team ?? raw.Team ?? raw.Tm ?? raw.team_abbr ?? "";
      const opp  = raw.opp ?? raw.Opp ?? raw.OPP ?? raw.opponent ?? "";
      const time = raw.time ?? raw.Time ?? raw["Time ET"] ?? "";

      // projections & salary: prefer role-specific, fall back to site generic
      const roleKey = (role === "CPT" ? (site==="fd"?"mvp":"cpt") : "flex");
      const proj = num(
        pick(raw, `${siteKey}_${roleKey}_proj`, `${siteKey} ${roleKey} proj`, `${siteKey}_${roleKey}`, `${siteKey} proj`, `${cfg.label} Proj`, "proj")
      );
      const floor = num(pick(raw, `${siteKey}_${roleKey}_floor`, `${cfg.label} Floor`, "floor"));
      const ceil  = num(pick(raw, `${siteKey}_${roleKey}_ceil`, `${cfg.label} Ceiling`, "ceiling","ceil"));
      const pown  = pct(pick(raw, `${siteKey}_${roleKey}_pown%`, `${cfg.label} ${roleKey.toUpperCase()} pOWN%`, `${siteKey} pown%`, `${cfg.label} pOWN%`, "pown"));
      const opt   = pct(pick(raw, `${siteKey}_${roleKey}_opt%`,  `${cfg.label} ${roleKey.toUpperCase()} Opt%`,  `${siteKey} opt%`,  `${cfg.label} Opt%`, "opt"));

      // salary
      const salKeys = role === "CPT" ? cfg.salaryKeys.cpt : cfg.salaryKeys.flex;
      const salaryFromAny = salKeys.map(k => pick(raw,k)).find(v => v != null);
      const salaryFallback = pick(raw, `${cfg.label} ${role==="CPT"?(site==="fd"?"MVP":"CPT"):"Flex"} Sal`, `${cfg.label} Sal`, `${siteKey}_sal`, "Salary");
      const salary = num(salaryFromAny ?? salaryFallback);

      return {
        name, pos, role, team, opp, time,
        proj, floor, ceil, pown, opt, salary,
        _site: site, _raw: raw,
      };
    });

    return mapped.filter(r => r.name && r.team);
  }, [data, site, cfg]);

  /* -------- usage% from produced lineups -------- */
  const usagePct = useMemo(() => {
    if (!lineups.length) return {};
    const m = new Map();
    for (const L of lineups) for (const p of L.players) m.set(p, (m.get(p) || 0) + 1);
    const total = Math.max(1, lineups.length);
    const out = {}; for (const [name,cnt] of m.entries()) out[name] = (cnt/total)*100;
    return out;
  }, [lineups]);

  /* -------------- table + sort/filter -------------- */
  const [q, setQ] = useState("");
  const [order, setOrder] = useState([]);
  const sortRef = useRef({ col:"proj", dir:"desc" });

  useEffect(() => {
    const initial = [...rows].sort((a,b)=> b.proj - a.proj || a.name.localeCompare(b.name));
    setOrder(initial.map(r=>r.name));
  }, [rows.length, site]); // rebuild order on data/site changes

  const displayRows = useMemo(() => {
    const text = q.trim().toLowerCase();
    const roleWanted = roleFilter;
    const ok = (r) => {
      const rOk = roleWanted==="ALL" ? true :
        (roleWanted==="MVP"||roleWanted==="CPT") ? r.role!=="FLEX" : r.role==="FLEX";
      const tOk = !text || r.name.toLowerCase().includes(text) || r.team.toLowerCase().includes(text) || r.opp.toLowerCase().includes(text) || r.pos.toLowerCase().includes(text) || String(r.salary).includes(text);
      return rOk && tOk;
    };
    const byName = new Map(rows.map(r=>[r.name,r]));
    const ordered = order.map(n=>byName.get(n)).filter(Boolean);
    const others = rows.filter(r=>!order.includes(r.name));
    return [...ordered,...others].filter(ok);
  }, [rows, order, q, roleFilter]);

  const sortable = new Set(["role","team","opp","salary","time","proj","floor","ceil","pown","opt","usage"]);
  const setSort = (col) => {
    if (!sortable.has(col)) return;
    const dir = sortRef.current.col===col ? (sortRef.current.dir==="asc"?"desc":"asc") : "desc";
    sortRef.current = { col, dir };
    const mult = dir==="asc"?1:-1;
    const sorted = [...displayRows].sort((a,b)=>{
      const get = (r)=> {
        if (col==="usage") return (usagePct[r.name]||0);
        if (["role","team","opp","time"].includes(col)) return (r[col]||"").toString();
        if (col==="pown" || col==="opt") return (r[col]||0)*100;
        return r[col] ?? 0;
      };
      const A=get(a), B=get(b);
      if (A < B) return -1*mult;
      if (A > B) return 1*mult;
      return a.name.localeCompare(b.name)*mult;
    });
    setOrder(sorted.map(r=>r.name));
  };
  const sortArrow = (key) => sortRef.current.col===key ? (sortRef.current.dir==="asc"?" ▲":" ▼") : "";

  /* ----------------- table actions ----------------- */
  const bumpBoost = (name, step) => setBoost(m => ({...m, [name]: clamp((m[name]||0)+step, -6, 6)}));
  const toggleLock = (name) => setLocks(s => { const n=new Set(s); n.has(name)?n.delete(name):n.add(name); return n; });
  const toggleExcl = (name) => setExcls(s => { const n=new Set(s); n.has(name)?n.delete(name):n.add(name); return n; });

  const resetConstraints = () => {
    setLocks(new Set()); setExcls(new Set());
    setMinPct({}); setMaxPct({}); setBoost({});
  };

  /* ----------------- optimize (SSE) ----------------- */
  async function optimize() {
    if (!rows.length) return;
    setLineups([]); setIsOptimizing(true); setProgress(0);

    // 6 slots: first is CPT/MVP, others FLEX; eligibility always base positions
    const slots = [
      { name: cfg.roleCPT,  eligible:["QB","RB","WR","TE","DST"] },
      { name: "FLEX",       eligible:["QB","RB","WR","TE","DST"] },
      { name: "FLEX",       eligible:["QB","RB","WR","TE","DST"] },
      { name: "FLEX",       eligible:["QB","RB","WR","TE","DST"] },
      { name: "FLEX",       eligible:["QB","RB","WR","TE","DST"] },
      { name: "FLEX",       eligible:["QB","RB","WR","TE","DST"] },
    ];

    const payload = {
      site,
      cap: Math.min(cfg.cap, Number(maxSalary)||cfg.cap),
      n: Math.max(1, Number(numLineups)||1),
      slots,
      objective: optBy,
      locks: [...locks],
      excludes: [...excls],
      boosts: boost,
      randomness: clamp(Number(randomness)||0,0,100),
      global_max_pct: clamp(Number(globalMax)||100,0,100),
      min_pct: Object.fromEntries(Object.entries(minPct).map(([k,v]) => [k, clamp(Number(v)||0,0,100)])),
      max_pct: Object.fromEntries(Object.entries(maxPct).map(([k,v]) => [k, clamp(Number(v)||100,0,100)])),
      min_diff: Math.max(1, Number(maxOverlap)||1),        // reuse as min Hamming distance complement
      time_limit_ms: 2000,

      // Players payload — IMPORTANT: send **base positions** only.
      players: rows.map(r => {
        // derive base pos (strip MVP/CPT prefix if present)
        const basePos = normPos(r.pos.replace(/^CPT\s*-\s*/i,"").replace(/^MVP\s*-\s*/i,""));
        return {
          name: r.name,
          pos: basePos,
          team: r.team,
          opp: r.opp,
          salary: Math.round(r.salary||0),
          proj: r.proj || 0,
          floor: r.floor || 0,
          ceil: r.ceil || 0,
          pown: r.pown || 0,
          opt:  r.opt  || 0,
          // server will model CPT/MVP vs FLEX with slot multiplier, not via pos name
        };
      }),
    };

    const out = [];
    try {
      await solveStreamShowdown(
        payload,
        (evt) => {
          // evt.drivers is an array of player names; server also returns positions per slot if you implemented that.
          const L = { players: evt.drivers, salary: evt.salary, total: evt.total };
          out.push(L);
          setLineups((prev)=>[...prev,L]);
          setProgress(out.length);
        },
        () => {
          setIsOptimizing(false); clearInterval(tickRef.current);
          setProgress(out.length || payload.n);
        }
      );
    } catch (e) {
      // fallback non-stream
      const res = await fetch(`${API_BASE}/solve_showdown`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { alert(`Solve failed: ${await res.text()}`); setIsOptimizing(false); clearInterval(tickRef.current); return; }
      const j = await res.json();
      const raw = (j.lineups||[]).map(L => ({ players:L.drivers, salary:L.salary, total:L.total })) || [];
      setLineups(raw); setProgress(raw.length); setIsOptimizing(false); clearInterval(tickRef.current);
    }
  }

  /* -------------------- EXPORTS -------------------- */
  function orderedShowdown(names, rowsMap) {
    // place CPT/MVP first if we can detect from row.pos
    const pool = names.map(n => rowsMap.get(n)).filter(Boolean);
    let cptIdx = pool.findIndex(r => /^CPT\s*-/.test(r.pos) || /^MVP\s*-/.test(r.pos));
    if (cptIdx === -1) {
      // best guess: highest projection to CPT/MVP
      let best = -1, idx = -1; for (let i=0;i<pool.length;i++){ if ((pool[i]?.proj||0) > best) {best = pool[i].proj; idx=i;} }
      cptIdx = idx;
    }
    if (cptIdx>0) { const [c] = pool.splice(cptIdx,1); pool.unshift(c); }
    return pool;
  }

  function inferTeamFromDSTName(name) {
    const map = {
      "cardinals":"ARI","falcons":"ATL","ravens":"BAL","bills":"BUF","panthers":"CAR","bears":"CHI","bengals":"CIN","browns":"CLE",
      "cowboys":"DAL","broncos":"DEN","lions":"DET","packers":"GB","texans":"HOU","colts":"IND","jaguars":"JAX","chiefs":"KC",
      "chargers":"LAC","rams":"LAR","raiders":"LV","dolphins":"MIA","vikings":"MIN","patriots":"NE","saints":"NO","giants":"NYG",
      "jets":"NYJ","eagles":"PHI","steelers":"PIT","seahawks":"SEA","49ers":"SF","buccaneers":"TB","titans":"TEN","commanders":"WAS"
    };
    const nm = normName(name);
    for (const [nick,abbr] of Object.entries(map)) {
      if (nm.includes(nick) || nm===nick) return abbr;
    }
    return "";
  }

  function downloadSiteLineupsCSV_Showdown({ lineups, rows, site, siteIds, fname = `NFL_Showdown_${site.toUpperCase()}_ids.csv` }) {
    const siteKey = site === "fd" ? "fd" : "dk";
    const list = Array.isArray(siteIds?.[siteKey]) ? siteIds[siteKey] : (siteIds?.sites?.[siteKey] ?? []);
    // Build id index with CPT/FLEX separation (DK) and unified (FD)
    const keyStrict = (n,t,p) => `${normName(n)}|${normTeam(t)}|${normPos(p)}`;
    const keyLoose  = (n,p)   => `${normName(n)}|${normPos(p)}`;
    const keyTeam   = (t,p)   => `${normTeam(t)}|${normPos(p)}`;

    const idIndex = new Map();
    const put = (k, rec) => { if (k && !idIndex.has(k)) idIndex.set(k, rec); };

    for (const r of list) {
      const nm  = String(r.name ?? r.player ?? r.Player ?? "");
      const pos = normPos(r.pos ?? r.Pos ?? r.position);
      let tm    = normTeam(r.team ?? r.Team ?? r.team_abbr ?? "");
      if (pos === "DST" && !tm) tm = inferTeamFromDSTName(nm) || "";

      const rec = {
        id: String(r.id ?? r.ID ?? r.playerId ?? r.PlayerID ?? ""),
        dk_cpt_id: String(r.dk_cpt_id ?? r["dk cpt id"] ?? r["DK CPT ID"] ?? ""),
        dk_flex_id: String(r.dk_flex_id ?? r["dk flex id"] ?? r["DK Flex ID"] ?? r["DK ID"] ?? r.id ?? ""),
        fd_id: String(r.fd_id ?? r["fd id"] ?? r["FD ID"] ?? r.id ?? ""),
        nameFromSite: nm,
        team: tm,
        pos,
      };

      if (nm) {
        put(keyStrict(nm, tm, pos), rec);
        put(keyLoose(nm, pos), rec);
      }
      if (pos === "DST" && tm) {
        put(keyTeam(tm, "DST"), rec);
      }
    }

    const rowsByName = new Map(rows.map(r => [r.name, r]));
    const header = ["#", "Salary", "Total", "P1", "P2", "P3", "P4", "P5", "P6"]; // P1 is CPT/MVP
    const lines = lineups.map((L, idx) => {
      const ordered = orderedShowdown(L.players, rowsByName);
      const cells = ordered.map(meta => {
        const pos = normPos(meta.pos.replace(/^CPT\s*-\s*/i,"").replace(/^MVP\s*-\s*/i,"") || meta.pos);
        const tm  = normTeam(meta.team);
        const name= meta.name;

        // resolve id
        let rec = idIndex.get(keyStrict(name, tm, pos)) || idIndex.get(keyLoose(name, pos));
        if (!rec && pos === "DST") rec = idIndex.get(keyTeam(tm, "DST")) || rec;

        // Build DK/FD token
        if (!rec) return escapeCSV(name);
        if (siteKey === "fd") {
          // same ID regardless of slot; MVP must be first in exported order (already ensured)
          return escapeCSV(`${rec.fd_id || rec.id}:${rec.nameFromSite || name}`);
        }
        // DK: CPT row needs CPT ID, FLEX rows need Flex ID
        const isCPT = /^CPT\s*-/.test(meta.pos);
        const tokenId = isCPT ? (rec.dk_cpt_id || rec.dk_flex_id || rec.id) : (rec.dk_flex_id || rec.id);
        return escapeCSV(`${name} (${tokenId})`);
      });

      while (cells.length < 6) cells.push("");
      return [idx+1, L.salary, L.total?.toFixed?.(1) ?? "", ...cells].join(",");
    });

    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = fname; a.click(); URL.revokeObjectURL(url);
  }

  /* -------------------- UI -------------------- */
  const TABLE_COLS = [
    { key:"lock",   label:"Lock" },
    { key:"excl",   label:"Excl" },
    { key:"boosts", label:"Boosts" },        // ← Boosts before Player
    { key:"role",   label:"Tag",  sortable:true },
    { key:"name",   label:"Player" },
    { key:"team",   label:"Tm",   sortable:true },
    { key:"opp",    label:"Opp",  sortable:true },
    { key:"pos",    label:"Pos" },
    { key:"salary", label:"Salary", sortable:true },
    { key:"proj",   label:"Proj",   sortable:true },
    { key:"floor",  label:"Floor",  sortable:true },
    { key:"ceil",   label:"Ceiling",sortable:true },
    { key:"pown",   label:"pOWN%",  sortable:true },
    { key:"opt",    label:"Opt%",   sortable:true },
    { key:"min",    label:"Min%" },
    { key:"max",    label:"Max%" },
    { key:"usage",  label:"Usage%", sortable:true },   // ← new
  ];

  const metricLabel =
    optBy === "proj" ? "Proj" : optBy === "floor" ? "Floor" : optBy === "ceil" ? "Ceiling" : optBy === "pown" ? "pOWN%" : "Opt%";

  return (
    <div className="px-4 md:px-6 py-5">
      <h1 className="text-2xl md:text-3xl font-extrabold mb-1">NFL — Showdown Optimizer</h1>

      {/* site + role filter */}
      <div className="mb-3 flex gap-2 items-center">
        {["dk","fd"].map((s)=>(
          <button key={s} onClick={()=>setSite(s)}
            className={`px-3 py-1.5 rounded-full border text-sm ${site===s?"bg-blue-50 border-blue-300 text-blue-800":"bg-white border-gray-300 text-gray-700"}`}>
            {SITES[s].label}
          </button>
        ))}

        <div className="ml-3 inline-flex rounded-full overflow-hidden border">
          {["ALL", cfg.roleCPT, cfg.roleFLEX].map((r)=>(
            <button key={r} onClick={()=>setRoleFilter(r)}
              className={`px-3 py-1.5 text-sm ${roleFilter===r?"bg-blue-50 text-blue-800":"bg-white"}`}>{r}</button>
          ))}
        </div>

        <div className="ml-auto flex gap-2">
          <label className="text-sm inline-flex items-center gap-1">Lineups
            <input className="w-16 border rounded px-2 py-1 text-sm ml-1" value={numLineups} onChange={(e)=>setNumLineups(e.target.value)} />
          </label>
          <label className="text-sm inline-flex items-center gap-1">Max salary
            <input className="w-24 border rounded px-2 py-1 text-sm ml-1" value={maxSalary} onChange={(e)=>setMaxSalary(e.target.value)} />
          </label>
          <label className="text-sm inline-flex items-center gap-1">Max Overlap
            <input className="w-16 border rounded px-2 py-1 text-sm ml-1" value={maxOverlap} onChange={(e)=>setMaxOverlap(e.target.value)} title="Max repeated players between consecutive lineups" />
          </label>
          <label className="text-sm inline-flex items-center gap-1">Optimize by
            <select className="border rounded px-2 py-1 text-sm ml-1" value={optBy} onChange={(e)=>setOptBy(e.target.value)}>
              <option value="proj">Projection</option>
              <option value="floor">Floor</option>
              <option value="ceil">Ceiling</option>
              <option value="pown">pOWN%</option>
              <option value="opt">Opt%</option>
            </select>
          </label>
          <button className="px-3 py-1.5 text-sm border rounded" onClick={resetConstraints}>Reset constraints</button>
          <button className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700" onClick={optimize}>
            {`Optimize ${numLineups}`}
          </button>
        </div>
      </div>

      {/* search */}
      <div className="mb-2">
        <input className="border rounded-md px-3 py-1.5 w-80 text-sm"
               placeholder="Search player / team / pos…" value={q} onChange={(e)=>setQ(e.target.value)} />
      </div>

      {/* table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-auto mb-6 max-h-[700px]">
        <table className="w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {TABLE_COLS.map(({ key, label, sortable }) => (
                <th key={key}
                    className={`px-2 py-1 font-semibold text-center whitespace-nowrap ${sortable?"cursor-pointer select-none":""}`}
                    onClick={()=> sortable && setSort(key)}>
                  {label}{sortable ? <span className="opacity-60">{sortArrow(key)}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className="px-2 py-1 text-center text-gray-500" colSpan={TABLE_COLS.length}>Loading…</td></tr>}
            {err && <tr><td className="px-2 py-1 text-center text-red-600" colSpan={TABLE_COLS.length}>Failed to load: {String(err)}</td></tr>}
            {!loading && !err && displayRows.map((r)=>(
              <tr key={`${r.name}|${r.role}`} className="odd:bg-white even:bg-gray-50 hover:bg-blue-50/60">
                <td className="px-2 py-1 text-center"><input type="checkbox" checked={locks.has(r.name)} onChange={()=>toggleLock(r.name)} /></td>
                <td className="px-2 py-1 text-center"><input type="checkbox" checked={excls.has(r.name)} onChange={()=>toggleExcl(r.name)} /></td>
                {/* Boosts column */}
                <td className="px-2 py-1 text-center">
                  <div className="inline-flex items-center gap-1">
                    <button className="px-1.5 py-0.5 border rounded" title="+3%" onClick={()=>bumpBoost(r.name,+1)}>▲</button>
                    <span className="w-5 text-center">{boost[r.name]||0}</span>
                    <button className="px-1.5 py-0.5 border rounded" title="-3%" onClick={()=>bumpBoost(r.name,-1)}>▼</button>
                  </div>
                </td>
                <td className="px-2 py-1 text-center">{r.role}</td>
                <td className="px-2 py-1 whitespace-nowrap">{r.name}</td>
                <td className="px-2 py-1 text-center"><TeamPill abbr={r.team} /></td>
                <td className="px-2 py-1 text-center"><TeamPill abbr={r.opp} /></td>
                <td className="px-2 py-1 text-center">{r.pos}</td>
                <td className="px-2 py-1 text-center tabular-nums">{fmt0(r.salary)}</td>
                <td className="px-2 py-1 text-center tabular-nums">{fmt1(r.proj * (1 + 0.03 * (boost[r.name]||0)))}</td>
                <td className="px-2 py-1 text-center tabular-nums">{fmt1(r.floor)}</td>
                <td className="px-2 py-1 text-center tabular-nums">{fmt1(r.ceil)}</td>
                <td className="px-2 py-1 text-center tabular-nums">{fmt1(r.pown*100)}</td>
                <td className="px-2 py-1 text-center tabular-nums">{fmt1(r.opt*100)}</td>
                <td className="px-2 py-1 text-center">
                  <div className="inline-flex items-center gap-1">
                    <button className="px-1.5 py-0.5 border rounded" onClick={()=>setMinPct(m=>({...m,[r.name]:clamp((num(m[r.name])||0)-5,0,100)}))} title="-5%">–</button>
                    <input className="w-12 border rounded px-1.5 py-0.5 text-center" value={String(minPct[r.name] ?? "")} onChange={(e)=>setMinPct(m=>({...m,[r.name]:e.target.value}))} placeholder="—" />
                    <button className="px-1.5 py-0.5 border rounded" onClick={()=>setMinPct(m=>({...m,[r.name]:clamp((num(m[r.name])||0)+5,0,100)}))} title="+5%">+</button>
                  </div>
                </td>
                <td className="px-2 py-1 text-center">
                  <div className="inline-flex items-center gap-1">
                    <button className="px-1.5 py-0.5 border rounded" onClick={()=>setMaxPct(m=>({...m,[r.name]:clamp((num(m[r.name])||100)-5,0,100)}))} title="-5%">–</button>
                    <input className="w-12 border rounded px-1.5 py-0.5 text-center" value={String(maxPct[r.name] ?? "")} onChange={(e)=>setMaxPct(m=>({...m,[r.name]:e.target.value}))} placeholder="—" />
                    <button className="px-1.5 py-0.5 border rounded" onClick={()=>setMaxPct(m=>({...m,[r.name]:clamp((num(m[r.name])||100)+5,0,100)}))} title="+5%">+</button>
                  </div>
                </td>
                <td className="px-2 py-1 text-center tabular-nums">{usagePct[r.name]!=null ? fmt1(usagePct[r.name]) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* actions under table */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 border rounded text-sm"
                  onClick={()=>downloadSiteLineupsCSV_Showdown({ lineups, rows, site, siteIds: siteIds||{} })}>
            Export CSV (IDs)
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 max-w-xs h-2 bg-gray-200 rounded overflow-hidden">
            <div className="h-2 bg-blue-500 rounded transition-all duration-300"
                 style={{ width: `${(Math.min(progress, Math.max(1, Number(numLineups)||1)) / Math.max(1, Number(numLineups)||1))*100}%` }} />
          </div>
          <div className="text-sm text-gray-600 min-w-[60px] text-right">
            {progress}/{numLineups}
          </div>
        </div>
      </div>
    </div>
  );
}
