import React, { useEffect, useMemo, useState } from "react";

// Adjust this to however your app builds API base URLs
const API_BASE = "/api";

/* ----------------------------- helpers ----------------------------- */
const clamp = (v, lo = 0, hi = 1e9) => Math.max(lo, Math.min(hi, v));
const num = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/\$/g, "").replace(/[,\s]/g, "").replace(/%/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const pct = (v) => {
  if (v == null) return 0;
  const s = String(v).replace(/[%\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n / 100 : 0;
};

const normTeam = (s) => (s || "").toUpperCase().trim();
const normName = (s) => String(s || "").trim();

/* ----------------------------- sources ----------------------------- */
// Point this to your MLB export path
const SOURCE = "/data/mlb/classic/latest/projections.json";
const SITE_IDS_SOURCE = "/data/mlb/classic/latest/site_ids.json"; // optional

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
        let j;
        try {
          j = ct.includes("application/json") ? await res.json() : JSON.parse(await res.text());
        } catch (e) {
          const preview = await res.text();
          throw new Error(`Could not parse JSON. CT=${ct}. Preview: ${preview.slice(0,200)}`);
        }
        if (alive) { setData(j); setErr(null); }
      } catch (e) { if (alive) { setData(null); setErr(e); } }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [url]);
  return { data, err, loading };
}

/* ----------------------------- sites ------------------------------- */
const SITES = {
  dk: {
    key: "dk",
    label: "DraftKings",
    logo: "/logos/dk.png",
    cap: 50000,
    slots: [
      { name: "P1", eligible: ["P"] },
      { name: "P2", eligible: ["P"] },
      { name: "C",  eligible: ["C"] },
      { name: "1B", eligible: ["1B"] },
      { name: "2B", eligible: ["2B"] },
      { name: "3B", eligible: ["3B"] },
      { name: "SS", eligible: ["SS"] },
      { name: "OF1",eligible: ["OF"] },
      { name: "OF2",eligible: ["OF"] },
      { name: "OF3",eligible: ["OF"] },
      { name: "UTIL", eligible: ["C","1B","2B","3B","SS","OF"] },
    ],
    salary: "DK Sal",
    proj:   "DK Proj",
    floor:  "DK Floor",
    ceil:   "DK Ceiling",
  },
  fd: {
    key: "fd",
    label: "FanDuel",
    logo: "/logos/fd.png",
    cap: 35000,
    slots: [
      { name: "P",   eligible: ["P"] },
      { name: "C/1B",eligible: ["C","1B"] },
      { name: "2B",  eligible: ["2B"] },
      { name: "3B",  eligible: ["3B"] },
      { name: "SS",  eligible: ["SS"] },
      { name: "OF1", eligible: ["OF"] },
      { name: "OF2", eligible: ["OF"] },
      { name: "OF3", eligible: ["OF"] },
      { name: "UTIL",eligible: ["C","1B","2B","3B","SS","OF"] },
    ],
    salary: "FD Sal",
    proj:   "FD Proj",
    floor:  "FD Floor",
    ceil:   "FD Ceiling",
  },
};

/* ----------------------------- streaming --------------------------- */
async function solveStreamMLB(payload, onItem, onDone) {
  const res = await fetch(`${API_BASE}/solve_mlb_stream`, {
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
        if (evt.done) onDone?.(evt); else onItem?.(evt);
      } catch {}
    }
  }
}

export default function MLBOptimizer() {
  const { data } = useJson(SOURCE);
  const [site, setSite] = useState("dk");
  const cfg = SITES[site];

  const [optBy, setOptBy] = useState("proj");
  const [numLineups, setNumLineups] = useState(20);
  const [maxSalary, setMaxSalary] = useState(cfg.cap);
  useEffect(() => { setMaxSalary(SITES[site].cap); }, [site]);

  const [globalMax, setGlobalMax] = useState(100);
  const [randomness, setRandomness] = useState(0);
  const [locks, setLocks] = useState(() => new Set());
  const [excls, setExcls] = useState(() => new Set());
  const [minPct, setMinPct] = useState({});
  const [maxPct, setMaxPct] = useState({});
  const [boost, setBoost] = useState({});

  // stacks & pitcher rule
  const [primaryStack, setPrimaryStack] = useState(site === "dk" ? 5 : 4);
  const [secondaryStack, setSecondaryStack] = useState(site === "dk" ? 3 : 4);
  useEffect(() => {
    setPrimaryStack(site === "dk" ? 5 : 4);
    setSecondaryStack(site === "dk" ? 3 : 4);
  }, [site]);
  const [avoidHittersVsOppP, setAvoidHittersVsOppP] = useState(true);
  const [maxHittersVsOppP, setMaxHittersVsOppP] = useState(0);
  const [minDiff, setMinDiff] = useState(1);
  const [lineupPownCap, setLineupPownCap] = useState("");

  const rows = useMemo(() => {
    if (!data) return [];
    const arr = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : [];
    const mapped = arr.map((r) => {
      const name = r.player || r.Player || r.Name || r.name || r.playerName || "";
      const team = normTeam(r.team || r.Team || r.Tm || r.TEAM || r.team_abbr || r.TeamAbbrev || "");
      const opp  = normTeam(r.opp  || r.Opp  || r.OPP || r.opponent || r.Opponent || "");
      const rawPos = String(r.pos || r.Pos || r.POS || r.Position || "").toUpperCase();
      const parts = rawPos.split("/").map(s => s.trim()).filter(Boolean).map(p => (p === "SP" || p === "RP") ? "P" : p);
      const eligible = Array.from(new Set(parts));
      const siteKey = cfg.key; // dk/fd
      const proj = num(r[`${siteKey}_proj`] ?? r[`${cfg.label} Proj`] ?? r.Projection ?? r.Points);
      const salary = num(r[`${siteKey}_sal`] ?? r[`${cfg.label} Sal`] ?? r.Salary);
      const floor = num(r[`${siteKey}_floor`] ?? r[`${cfg.label} Floor`] ?? r.Floor);
      const ceil  = num(r[`${siteKey}_ceil`]  ?? r[`${cfg.label} Ceiling`] ?? r.Ceiling);
      const pown  = pct(r[`${siteKey}_pown`] ?? r["DK pOWN%"] ?? r["FD pOWN%"]);
      const opt   = pct(r[`${siteKey}_opt`]  ?? r["DK Opt%"] ?? r["FD Opt%"]);
      const order = num(r.BatOrder || r.BO || r.Order || r["Batting Order"]);
      return { name, team, opp, eligible, proj, salary, floor, ceil, pown, opt, order, __raw: r };
    });
    return mapped.filter(r => r.name && r.eligible && r.eligible.length);
  }, [data, site]);

  const toggleLock = (n) => setLocks(s => { const t = new Set(s); t.has(n) ? t.delete(n) : t.add(n); return t; });
  const toggleExcl = (n) => setExcls(s => { const t = new Set(s); t.has(n) ? t.delete(n) : t.add(n); return t; });
  const bumpBoost = (n, d) => setBoost(m => ({ ...m, [n]: clamp((m[n] || 0) + d, -6, 6) }));

  const [lineups, setLineups] = useState([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [progress, setProgress] = useState(0);

  async function optimize() {
    if (!rows.length) return;
    setIsOptimizing(true); setLineups([]); setProgress(0);

    const payload = {
      site,
      slots: cfg.slots,
      players: rows.map(r => ({
        name: r.name,
        team: r.team,
        opp: r.opp,
        eligible: r.eligible,
        salary: Math.round(r.salary || 0),
        proj: r.proj || 0,
        floor: r.floor || 0,
        ceil: r.ceil || 0,
        pown: r.pown || 0,
        opt: r.opt || 0,
      })),
      n: Math.max(1, Number(numLineups) || 1),
      cap: Math.min(cfg.cap, Number(maxSalary) || cfg.cap),
      objective: optBy,
      locks: Array.from(locks),
      excludes: Array.from(excls),
      boosts: boost,
      randomness: clamp(Number(randomness) || 0, 0, 100),
      global_max_pct: clamp(Number(globalMax) || 100, 0, 100),
      min_pct: {},
      max_pct: {},
      min_diff: Math.max(1, Number(minDiff) || 1),
      time_limit_ms: 1500,
      primary_stack_size: Math.max(0, Number(primaryStack) || 0),
      secondary_stack_size: Math.max(0, Number(secondaryStack) || 0),
      avoid_hitters_vs_opp_pitcher: !!avoidHittersVsOppP,
      max_hitters_vs_opp_pitcher: Math.max(0, Number(maxHittersVsOppP) || 0),
      lineup_pown_max: String(lineupPownCap).trim() === "" ? null : clamp(Number(lineupPownCap)||0, 0, 500),
    };

    const out = [];
    try {
      await solveStreamMLB(
        payload,
        (evt) => {
          out.push(evt);
          setLineups(prev => [...prev, { players: evt.drivers, salary: evt.salary, total: evt.total }]);
          setProgress(evt.index || out.length);
        },
        () => setIsOptimizing(false)
      );
    } catch (e) {
      const res = await fetch(`${API_BASE}/solve_mlb`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(payload) });
      if (!res.ok) { alert(`Solve failed: ${await res.text()}`); setIsOptimizing(false); return; }
      const j = await res.json();
      const raw = (j.lineups || []).map(L => ({ players: L.drivers, salary: L.salary, total: L.total }));
      setLineups(raw); setProgress(raw.length); setIsOptimizing(false);
    }
  }

  return (
    <div className="px-4 md:px-6 py-5">
      <h1 className="text-2xl md:text-3xl font-extrabold mb-1">MLB — Optimizer</h1>

      <div className="mb-3 flex gap-2 items-center">
        {["dk","fd"].map((s) => (
          <button key={s} onClick={() => setSite(s)} className={`px-3 py-1.5 rounded-full border text-sm ${site===s?"bg-blue-50 border-blue-300 text-blue-800":"bg-white border-gray-300 text-gray-700"}`}>
            <img src={SITES[s].logo} alt="" className="w-4 h-4 inline-block mr-1" />{SITES[s].label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-sm">
          <label>Cap <input type="number" className="border rounded px-2 py-1 w-24" value={maxSalary} onChange={(e)=>setMaxSalary(e.target.value)} /></label>
          <label>Lineups <input type="number" className="border rounded px-2 py-1 w-20" value={numLineups} onChange={(e)=>setNumLineups(e.target.value)} /></label>
          <label>Objective <select className="border rounded px-2 py-1" value={optBy} onChange={(e)=>setOptBy(e.target.value)}><option value="proj">Proj</option><option value="floor">Floor</option><option value="ceil">Ceiling</option><option value="pown">pOWN%</option><option value="opt">Opt%</option></select></label>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 text-sm">
        <label className="flex items-center gap-2">Random<input type="number" className="border rounded px-2 py-1 w-16" value={randomness} onChange={(e)=>setRandomness(e.target.value)} /></label>
        <label className="flex items-center gap-2">Global Max %<input type="number" className="border rounded px-2 py-1 w-16" value={globalMax} onChange={(e)=>setGlobalMax(e.target.value)} /></label>
        <label className="flex items-center gap-2">Min Diff<input type="number" className="border rounded px-2 py-1 w-16" value={minDiff} onChange={(e)=>setMinDiff(e.target.value)} /></label>
        <label className="flex items-center gap-2">Lineup pOWN Cap<input type="number" className="border rounded px-2 py-1 w-20" value={lineupPownCap} onChange={(e)=>setLineupPownCap(e.target.value)} /></label>
        <div className="flex items-center gap-2"><span>Stack</span>
          <input type="number" className="border rounded px-2 py-1 w-12" value={primaryStack} onChange={(e)=>setPrimaryStack(e.target.value)} />
          <span>-</span>
          <input type="number" className="border rounded px-2 py-1 w-12" value={secondaryStack} onChange={(e)=>setSecondaryStack(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 col-span-2">
          <input type="checkbox" checked={avoidHittersVsOppP} onChange={(e)=>setAvoidHittersVsOppP(e.target.checked)} />
          Avoid hitters vs opposing P (max <input type="number" className="border rounded px-1 py-0.5 w-12 ml-1" value={maxHittersVsOppP} onChange={(e)=>setMaxHittersVsOppP(e.target.value)} />)
        </label>
      </div>

      <RosterTable rows={rows} locks={locks} excls={excls} toggleLock={toggleLock} toggleExcl={toggleExcl} boost={boost} setBoost={setBoost} />

      <div className="mt-3 flex items-center gap-2">
        <button className="px-3 py-1.5 rounded bg-blue-600 text-white" onClick={optimize} disabled={isOptimizing}>Optimize</button>
        {isOptimizing && <span className="text-sm text-gray-600">Building… {progress}/{numLineups}</span>}
      </div>

      {lineups.length > 0 && (
        <div className="mt-4">
          <h2 className="font-bold mb-1">Lineups ({lineups.length})</h2>
          <div className="grid md:grid-cols-2 gap-2">
            {lineups.map((L, i) => (
              <div key={i} className="border rounded p-2 text-sm">
                <div className="flex justify-between mb-1"><strong>#{i+1}</strong><span>Sal {L.salary?.toLocaleString?.()||""} · {optBy}:{Number.isFinite(L.total)?L.total.toFixed(1):"—"}</span></div>
                <div className="text-xs">{(L.players||[]).join(" • ")}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RosterTable({ rows, locks, excls, toggleLock, toggleExcl, boost, setBoost }) {
  const [q, setQ] = useState("");
  const display = useMemo(() => {
    const n = q.trim().toLowerCase();
    return rows.filter(r => !n || r.name.toLowerCase().includes(n) || r.team.toLowerCase().includes(n) || r.opp.toLowerCase().includes(n));
  }, [rows, q]);
  const bumpBoost = (n, d) => setBoost(m => ({ ...m, [n]: clamp((m[n] || 0) + d, -6, 6) }));

  return (
    <div className="border rounded overflow-x-auto">
      <div className="p-2"><input className="border rounded px-2 py-1 text-sm" placeholder="Search" value={q} onChange={(e)=>setQ(e.target.value)} /></div>
      <table className="w-full text-[12px]">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1">Lock</th>
            <th className="px-2 py-1">Excl</th>
            <th className="px-2 py-1 text-left">Player</th>
            <th className="px-2 py-1">Team</th>
            <th className="px-2 py-1">Opp</th>
            <th className="px-2 py-1">Elig</th>
            <th className="px-2 py-1">Sal</th>
            <th className="px-2 py-1">Proj</th>
            <th className="px-2 py-1">Val</th>
            <th className="px-2 py-1">pOWN%</th>
            <th className="px-2 py-1">Opt%</th>
            <th className="px-2 py-1">Boost</th>
          </tr>
        </thead>
        <tbody>
          {display.map((r) => (
            <tr key={r.name} className="border-t">
              <td className="text-center"><input type="checkbox" checked={locks.has(r.name)} onChange={()=>toggleLock(r.name)} /></td>
              <td className="text-center"><input type="checkbox" checked={excls.has(r.name)} onChange={()=>toggleExcl(r.name)} /></td>
              <td className="px-2 py-1 text-left">{r.name}</td>
              <td className="px-2 py-1 text-center">{r.team}</td>
              <td className="px-2 py-1 text-center">{r.opp}</td>
              <td className="px-2 py-1 text-center">{r.eligible.join('/')}</td>
              <td className="px-2 py-1 text-right">{r.salary.toLocaleString()}</td>
              <td className="px-2 py-1 text-right">{Number.isFinite(r.proj)?r.proj.toFixed(1):"—"}</td>
              <td className="px-2 py-1 text-right">{r.salary>0?((r.proj/r.salary)*1000).toFixed(1):"—"}</td>
              <td className="px-2 py-1 text-right">{(r.pown*100).toFixed(1)}</td>
              <td className="px-2 py-1 text-right">{(r.opt*100).toFixed(1)}</td>
              <td className="px-2 py-1 text-center">
                <button className="px-1 mr-1 border rounded" onClick={()=>bumpBoost(r.name, +1)}>+ </button>
                <span>{boost[r.name] || 0}</span>
                <button className="px-1 ml-1 border rounded" onClick={()=>bumpBoost(r.name, -1)}>-</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
