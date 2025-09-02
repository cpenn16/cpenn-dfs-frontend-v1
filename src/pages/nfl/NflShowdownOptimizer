// src/pages/nfl/NFLShowdownOptimizer.jsx
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
const escapeCSV = (s) => {
  const v = String(s ?? "");
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

function useStickyState(key, init) {
  const [v, setV] = useState(init);
  useEffect(() => {
    try { setV(JSON.parse(localStorage.getItem(key)) ?? init); } catch { setV(init); }
  }, [key]);
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  }, [key, v]);
  return [v, setV];
}

function useJson(url) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!url) { setData(null); setErr(null); setLoading(false); return; }
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

/* ----------------------------- sites ------------------------------- */
const SITES = {
  dk: {
    key: "dk",
    label: "DraftKings",
    cap: 50000,
    boostedTag: "CPT",
    projMult: 1.5,
    salMult: 1.5,
    slots: ["CPT", "FLEX", "FLEX", "FLEX", "FLEX", "FLEX"],
    salaryKey: (r) => r["DK Sal"] ?? r.dk_sal ?? r.Salary ?? r.salary,
    projKey:   (r) => r["DK Proj"] ?? r.dk_proj ?? r.Projection ?? r.Points,
  },
  fd: {
    key: "fd",
    label: "FanDuel",
    cap: 60000,
    boostedTag: "MVP",
    projMult: 1.5,
    salMult: 1.5,
    slots: ["MVP", "FLEX", "FLEX", "FLEX", "FLEX", "FLEX"],
    salaryKey: (r) => r["FD Sal"] ?? r.fd_sal ?? r.Salary ?? r.salary,
    projKey:   (r) => r["FD Proj"] ?? r.fd_proj ?? r.Projection ?? r.Points,
  },
};

const SOURCE = "/data/nfl/showdown/latest/projections.json";

/* --------------------------- server (SSE) -------------------------- */
async function solveStreamShowdown(payload, onItem, onDone) {
  const res = await fetch(`${API_BASE}/solve_showdown_stream`, {
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

/* ----------------------- pool expansion helpers -------------------- */
const ALL_POS = ["QB", "RB", "WR", "TE", "DST", "K"];
const normPos = (s) => {
  const raw = (s || "").toUpperCase().replace("/FLEX","").trim();
  if (["D","DEF","DEFENSE"].includes(raw) || raw.includes("D/ST") || raw === "DST") return "DST";
  return raw;
};
function mapBaseRow(raw) {
  const name = raw.player ?? raw.Player ?? raw.Name ?? raw.name ?? "";
  const team = raw.team ?? raw.Team ?? raw.Tm ?? raw.team_abbr ?? "";
  const opp  = raw.opp  ?? raw.Opp  ?? raw.OPP ?? raw.Opponent ?? "";
  const pos  = normPos(raw.pos ?? raw.Pos ?? raw.POS ?? raw.Position ?? raw.position ?? "");
  return { name, team, opp, pos, __raw: raw };
}
function expandPool(base, siteCfg) {
  const out = [];
  for (const r0 of base) {
    const r = mapBaseRow(r0);
    if (!r.name || !r.pos) continue;
    const baseId = r0.id ?? `${r.name}|${r.team}`; // pairs boosted vs flex
    const salary = num(siteCfg.salaryKey(r0));
    const proj   = num(siteCfg.projKey(r0));
    if (!Number.isFinite(proj) || !salary) continue;

    // FLEX entry
    out.push({
      uid: `${siteCfg.key}|${baseId}|FLEX`,
      base_id: baseId,
      name: r.name,
      team: r.team,
      opp: r.opp,
      pos: r.pos,
      tag: "FLEX",
      salary,
      proj,
    });
    // Boosted entry (CPT/MVP)
    out.push({
      uid: `${siteCfg.key}|${baseId}|${siteCfg.boostedTag}`,
      base_id: baseId,
      name: r.name,
      team: r.team,
      opp: r.opp,
      pos: r.pos,
      tag: siteCfg.boostedTag,
      salary: Math.round(salary * siteCfg.salMult),
      proj: proj * siteCfg.projMult,
    });
  }
  return out;
}

/* ----------------------------- CSV export -------------------------- */
function lineupToOrderedCells(siteCfg, lineup) {
  // ensure boosted first, then the 5 FLEX (any order)
  const boosted = (lineup.players || []).find((p) => p.tag !== "FLEX");
  const flex = (lineup.players || []).filter((p) => p.tag === "FLEX");
  const names = [
    boosted ? `${boosted.tag}: ${boosted.name}` : "",
    ...flex.map((f, i) => `FLEX${i+1}: ${f.name}`).slice(0,5),
  ];
  while (names.length < 6) names.push("");
  return names;
}
function toPlainCSV(siteCfg, lineups) {
  const hdr = [siteCfg.boostedTag, "FLEX1","FLEX2","FLEX3","FLEX4","FLEX5","Salary","Proj","Mix","Majority"].join(",");
  const rows = lineups.map((L) => {
    const cells = lineupToOrderedCells(siteCfg, L);
    return [
      ...cells,
      L.total_salary ?? "",
      (L.total_proj ?? 0).toFixed(2),
      L.config?.mix ?? "",
      L.config?.majority ?? "",
    ].map(escapeCSV).join(",");
  });
  return [hdr, ...rows].join("\n");
}
function downloadCSV(siteKey, lineups, fname = "showdown_lineups.csv") {
  const csv = toPlainCSV(SITES[siteKey], lineups);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fname; a.click();
  URL.revokeObjectURL(url);
}

/* --------------------------- IF→THEN Rule UI ----------------------- */
function RuleRow({ siteKey, value, onChange, onDelete }) {
  const boosted = SITES[siteKey].boostedTag;
  const flip = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <div className="grid grid-cols-12 gap-2 items-center border rounded p-2">
      <div className="col-span-12 md:col-span-5 flex items-center gap-2">
        <span className="text-xs font-medium">IF</span>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={value.trigger.slot}
          onChange={(e) => onChange({ ...value, trigger: { ...value.trigger, slot: e.target.value } })}
        >
          <option value="boosted">{boosted}</option>
          <option value="flex">FLEX</option>
        </select>
        <span className="text-xs">is</span>
        <div className="flex flex-wrap gap-1">
          {ALL_POS.map((p) => (
            <button
              key={p}
              className={"px-2 py-0.5 border rounded text-xs " + (value.trigger.positions.includes(p) ? "bg-blue-600 text-white" : "bg-white")}
              onClick={() => onChange({ ...value, trigger: { ...value.trigger, positions: flip(value.trigger.positions, p) } })}
              type="button"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="col-span-12 md:col-span-7 flex items-center gap-2">
        <span className="text-xs font-medium">THEN require at least</span>
        <input
          type="number" min={0}
          className="w-16 border rounded px-2 py-1 text-sm"
          value={value.require.min_count}
          onChange={(e) => onChange({ ...value, require: { ...value.require, min_count: Math.max(0, Number(e.target.value)||0) } })}
        />
        <select
          className="border rounded px-2 py-1 text-sm"
          value={value.require.slots}
          onChange={(e) => onChange({ ...value, require: { ...value.require, slots: e.target.value } })}
        >
          <option value="flex">FLEX</option>
          <option value="boosted">{boosted}</option>
          <option value="any">ANY</option>
        </select>
        <span className="text-xs">from</span>
        <div className="flex flex-wrap gap-1">
          {ALL_POS.map((p) => (
            <button
              key={p}
              className={"px-2 py-0.5 border rounded text-xs " + (value.require.positions.includes(p) ? "bg-emerald-600 text-white" : "bg-white")}
              onClick={() => onChange({ ...value, require: { ...value.require, positions: flip(value.require.positions, p) } })}
              type="button"
            >
              {p}
            </button>
          ))}
        </div>
        <button type="button" className="ml-auto px-2 py-1 text-xs border rounded hover:bg-red-50" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

/* ============================== page =============================== */
export default function NFLShowdownOptimizer() {
  const { data, err, loading } = useJson(SOURCE);

  const [site, setSite] = useStickyState("sd.site", "dk");
  const cfg = SITES[site];

  const [numLineups, setNumLineups] = useStickyState("sd.N", 20);
  const [cap, setCap] = useStickyState(`sd.cap.${site}`, cfg.cap);
  useEffect(() => { setCap(SITES[site].cap); }, [site]);

  const [view, setView] = useStickyState("sd.view", "all"); // all | boosted | flex
  const [maxOverlap, setMaxOverlap] = useStickyState("sd.maxOverlap", 5); // 0..5 (6 slots total)
  const [rules, setRules] = useStickyState("sd.rules", [
    { id: "r1", trigger: { slot: "boosted", positions: ["QB"] }, require: { min_count: 1, slots: "flex", positions: ["WR","TE"] } },
  ]);

  const [lineups, setLineups] = useState([]);
  const [loadingSolve, setLoadingSolve] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressTick = useRef(null);

  /* ------------------------------ rows ------------------------------ */
  const baseRows = useMemo(() => {
    const arr = Array.isArray(data?.rows) ? data.rows
      : Array.isArray(data?.players) ? data.players
      : Array.isArray(data) ? data : [];
    return arr;
  }, [data]);

  const expanded = useMemo(() => expandPool(baseRows, cfg), [baseRows, cfg]);
  const displayRows = useMemo(() => {
    if (view === "all") return expanded;
    if (view === "boosted") return expanded.filter((r) => r.tag === cfg.boostedTag);
    return expanded.filter((r) => r.tag === "FLEX");
  }, [expanded, view, cfg]);

  const teams = useMemo(() => {
    const s = new Set();
    for (const r of expanded) { if (r.team) s.add(r.team); if (r.opp) s.add(r.opp); }
    return [...s].sort();
  }, [expanded]);

  /* --------------------------- optimize (SSE) ------------------------ */
  async function optimize() {
    if (!expanded.length) return;
    setLineups([]); setLoadingSolve(true); setProgress(0);
    clearInterval(progressTick.current);
    progressTick.current = setInterval(() =>
      setProgress((p) => Math.min(p + 1, Math.max(1, Number(numLineups)||1))), 250);

    const payload = {
      site,
      cap: Math.min(cfg.cap, Number(cap) || cfg.cap),
      slots: cfg.slots,                 // e.g., ["CPT","FLEX","FLEX","FLEX","FLEX","FLEX"]
      boosted_tag: cfg.boostedTag,
      min_teams: 2,
      max_overlap: clamp(Number(maxOverlap)||0, 0, 5),
      num_lineups: Math.max(1, Number(numLineups)||1),
      // pool to server
      pool: expanded.map((r) => ({
        uid: r.uid,
        base_id: r.base_id,
        name: r.name,
        team: r.team,
        opp: r.opp,
        pos: r.pos,
        tag: r.tag,
        salary: r.salary,
        proj: r.proj,
      })),
      // IF→THEN rules
      rules,
      time_limit_ms: 2000,
    };

    const out = [];
    try {
      await solveStreamShowdown(
        payload,
        (evt) => {
          if (!evt.players) return;
          out.push(evt);
          setLineups((L) => [...L, evt]);
          setProgress(out.length);
        },
        () => {
          setLoadingSolve(false);
          clearInterval(progressTick.current);
        }
      );
    } catch (e) {
      // non-SSE fallback
      try {
        const res = await fetch(`${API_BASE}/solve_showdown`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
        const j = await res.json();
        const arr = Array.isArray(j.lineups) ? j.lineups : [];
        setLineups(arr);
      } catch (e2) {
        alert(`Showdown solve failed: ${String(e2?.message || e2)}`);
      } finally {
        setLoadingSolve(false);
        clearInterval(progressTick.current);
        setProgress((p) => p);
      }
    }
  }

  /* ----------------------------- exposures -------------------------- */
  const exposures = useMemo(() => {
    const map = new Map();
    const cfgs = new Map();
    for (const L of lineups) {
      for (const p of (L.players||[])) map.set(p.name, (map.get(p.name)||0)+1);
      const key = `${L.config?.mix||""} ${L.config?.majority||""}`.trim();
      if (key) cfgs.set(key, (cfgs.get(key)||0)+1);
    }
    const total = Math.max(1, lineups.length);
    const playerRows = [...map.entries()].map(([name,cnt]) => ({ name, count: cnt, pct: (cnt/total)*100 }))
      .sort((a,b)=> b.count - a.count || a.name.localeCompare(b.name));
    const configRows = [...cfgs.entries()].map(([mix,cnt])=>({ mix, count: cnt, pct:(cnt/total)*100 }))
      .sort((a,b)=> b.count - a.count || a.mix.localeCompare(b.mix));
    return { playerRows, configRows, total };
  }, [lineups]);

  return (
    <div className="px-4 md:px-6 py-5">
      <h1 className="text-2xl md:text-3xl font-extrabold mb-1">NFL — Showdown Optimizer</h1>

      {/* Site / View / Controls */}
      <div className="mb-3 flex flex-wrap gap-2 items-end">
        <div className="flex gap-2">
          {["dk","fd"].map((s) => (
            <button
              key={s}
              onClick={() => setSite(s)}
              className={`px-3 py-1.5 rounded-full border text-sm ${site===s ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-white border-gray-300 text-gray-700"}`}
            >
              {SITES[s].label}
            </button>
          ))}
        </div>

        <div className="ml-2">
          <label className="block text-[11px] text-gray-600 mb-1">View</label>
          <select className="border rounded-md px-2 py-1.5 text-sm" value={view} onChange={(e)=>setView(e.target.value)}>
            <option value="all">All</option>
            <option value="boosted">{cfg.boostedTag}</option>
            <option value="flex">Flex only</option>
          </select>
        </div>

        <div className="ml-2">
          <label className="block text-[11px] text-gray-600 mb-1">Lineups</label>
          <input className="border rounded-md px-2 py-1.5 text-sm w-24" value={numLineups} onChange={(e)=>setNumLineups(e.target.value)} />
        </div>

        <div className="ml-2">
          <label className="block text-[11px] text-gray-600 mb-1">Max salary</label>
          <input className="border rounded-md px-2 py-1.5 text-sm w-28" value={cap} onChange={(e)=>setCap(e.target.value)} />
        </div>

        <div className="ml-2">
          <label className="block text-[11px] text-gray-600 mb-1">Max Overlap</label>
          <input className="border rounded-md px-2 py-1.5 text-sm w-24" value={maxOverlap} onChange={(e)=>setMaxOverlap(e.target.value)} />
        </div>

        <button className="ml-auto px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          onClick={optimize} disabled={loading || expanded.length===0 || loadingSolve}>
          {loadingSolve ? "Optimizing…" : `Optimize ${numLineups}`}
        </button>

        {lineups.length > 0 && (
          <button className="px-3 py-2 rounded border" onClick={()=>downloadCSV(site, lineups, `showdown_${site}.csv`)}>
            Export CSV
          </button>
        )}
      </div>

      {/* IF→THEN rules */}
      <div className="rounded-md border p-2 mb-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-gray-600">Conditional Rules (IF → THEN)</div>
          <button
            className="px-2 py-1 text-sm rounded-md border hover:bg-gray-50"
            onClick={() => setRules((rs)=>[
              ...rs,
              { id: `r${Math.random().toString(36).slice(2,8)}`, trigger: { slot: "boosted", positions: ["QB"] }, require: { min_count: 1, slots: "flex", positions: ["WR"] } }
            ])}
          >
            + Add Rule
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {rules.map((r) => (
            <RuleRow
              key={r.id}
              siteKey={site}
              value={r}
              onChange={(nv)=>setRules((rs)=>rs.map((x)=>x.id===r.id?nv:x))}
              onDelete={()=>setRules((rs)=>rs.filter((x)=>x.id!==r.id))}
            />
          ))}
        </div>
      </div>

      {/* Player table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-auto mb-6 max-h-[650px]">
        <table className="w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-2 py-1 text-left">Tag</th>
              <th className="px-2 py-1 text-left">Player</th>
              <th className="px-2 py-1 text-center">Team</th>
              <th className="px-2 py-1 text-center">Pos</th>
              <th className="px-2 py-1 text-right">Salary</th>
              <th className="px-2 py-1 text-right">Proj</th>
              <th className="px-2 py-1 text-left">UID</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="px-2 py-2 text-center text-gray-500" colSpan={7}>Loading…</td></tr>
            )}
            {!loading && err && (
              <tr><td className="px-2 py-2 text-center text-red-600" colSpan={7}>Failed to load: {String(err)}</td></tr>
            )}
            {!loading && !err && displayRows.map((r)=>(
              <tr key={r.uid} className="odd:bg-white even:bg-gray-50">
                <td className="px-2 py-1">{r.tag}</td>
                <td className="px-2 py-1">{r.name}</td>
                <td className="px-2 py-1 text-center">{r.team}</td>
                <td className="px-2 py-1 text-center">{r.pos}</td>
                <td className="px-2 py-1 text-right">{fmt0(r.salary)}</td>
                <td className="px-2 py-1 text-right">{fmt1(r.proj)}</td>
                <td className="px-2 py-1">{r.uid}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Results + exposures */}
      {!!lineups.length && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <section className="lg:col-span-8 rounded-lg border bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold">Lineups ({lineups.length})</h2>
            </div>
            <div className="overflow-auto max-h-[500px]">
              <table className="min-w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-1">#</th>
                    <th className="px-2 py-1">Salary</th>
                    <th className="px-2 py-1">Proj</th>
                    <th className="px-2 py-1">Mix</th>
                    <th className="px-2 py-1">Players (CPT/MVP first)</th>
                  </tr>
                </thead>
                <tbody>
                  {lineups.map((L, i) => {
                    const boosted = L.players.find((p)=>p.tag!=="FLEX");
                    const flex = L.players.filter((p)=>p.tag==="FLEX");
                    const names = [boosted ? `${boosted.tag}: ${boosted.name}` : "", ...flex.map((f)=>`FLEX: ${f.name}`)];
                    return (
                      <tr key={i} className="odd:bg-white even:bg-gray-50">
                        <td className="px-2 py-1">{i+1}</td>
                        <td className="px-2 py-1 tabular-nums">{fmt0(L.total_salary)}</td>
                        <td className="px-2 py-1 tabular-nums">{fmt1(L.total_proj)}</td>
                        <td className="px-2 py-1">{`${L.config.mix} ${L.config.majority}`}</td>
                        <td className="px-2 py-1">{names.join(" • ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="lg:col-span-4 rounded-lg border bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold">Exposure</h3>
              <div className="text-xs text-gray-500">Total lineups: {exposures.total}</div>
            </div>
            <div className="border rounded max-h-[240px] overflow-auto">
              <table className="min-w-full text-[12px]">
                <thead className="bg-gray-50"><tr><th className="px-2 py-1">Player</th><th className="px-2 py-1">Count</th><th className="px-2 py-1">%</th></tr></thead>
                <tbody>
                  {exposures.playerRows.map((r)=>(
                    <tr key={r.name} className="odd:bg-white even:bg-gray-50">
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1 text-right">{fmt0(r.count)}</td>
                      <td className="px-2 py-1 text-right">{fmt1(r.pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="text-base font-semibold mt-4 mb-1">Team Mix (5-1 / 4-2 / 3-3)</h3>
            <div className="border rounded max-h-[240px] overflow-auto">
              <table className="min-w-full text-[12px]">
                <thead className="bg-gray-50"><tr><th className="px-2 py-1">Mix</th><th className="px-2 py-1">Count</th><th className="px-2 py-1">%</th></tr></thead>
                <tbody>
                  {exposures.configRows.map((r)=>(
                    <tr key={r.mix} className="odd:bg-white even:bg-gray-50">
                      <td className="px-2 py-1">{r.mix}</td>
                      <td className="px-2 py-1 text-right">{fmt0(r.count)}</td>
                      <td className="px-2 py-1 text-right">{fmt1(r.pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {teams.length === 2 && (
        <div className="mt-3 text-xs text-gray-500">Teams detected: {teams.join(" vs ")}</div>
      )}
    </div>
  );
}
