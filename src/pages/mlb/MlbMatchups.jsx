import React, { useEffect, useMemo, useState } from "react";

/* ----------------------------- team colors ----------------------------- */
// Primary brand-ish color per team (fallbacks if not found)
const COLORS = {
  ARI:"#A71930", ATL:"#CE1141", BAL:"#DF4601", BOS:"#BD3039", CHC:"#0E3386",
  CIN:"#C6011F", CLE:"#0C2340", COL:"#333366", CWS:"#27251F", DET:"#0C2340",
  HOU:"#002D62", KC:"#004687", LAA:"#BA0021", LAD:"#005A9C", MIA:"#00A3E0",
  MIL:"#12284B", MIN:"#002B5C", NYM:"#002D72", NYY:"#0C2340", OAK:"#003831",
  PHI:"#E81828", PIT:"#27251F", SD:"#2F241D", SEA:"#0C2C56", SF:"#FD5A1E",
  STL:"#C41E3A", TB:"#092C5C", TEX:"#003278", TOR:"#134A8E", WSH:"#AB0003",
};

const YELLOW  = "#f5c842";
const CHIP_BG = "#2c62f0";

/* ------------------------------- config ------------------------------- */
const DATA_URL =
  import.meta.env?.VITE_MLB_MATCHUPS_URL || "/data/mlb/latest/matchups.json";

/* -------------------------------- utils -------------------------------- */
const logo = (abv) => `/logos/mlb/${String(abv || "").toUpperCase()}.png`;

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[,$%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const fmt0 = (v) => {
  const n = num(v);
  return n == null ? "" : n.toLocaleString(undefined, { maximumFractionDigits: 0 });
};
const fmt1 = (v) => {
  const n = num(v);
  return n == null ? "" : (Math.round(n * 10) / 10).toString();
};
const fmtMl = (v) => {
  const n = num(v);
  if (n == null) return "";
  return n > 0 ? `+${n}` : `${n}`;
};

function useJson(url) {
  const [data, setData] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const r = await fetch(`${url}?_=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (alive) setData(Array.isArray(j) ? j : []);
      } catch (e) {
        if (alive) setErr(String(e.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [url]);
  return { data, err, loading };
}

/* --------------------------------- UI --------------------------------- */
function TeamChip({ abv, className = "" }) {
  const A = String(abv || "").toUpperCase();
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <img
        src={logo(A)}
        alt=""
        className="w-4 h-4"
        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
      />
      <span className="font-medium">{A}</span>
    </span>
  );
}

function TogglePill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-[13px] shadow transition ${
        active ? "" : "opacity-40"
      }`}
      style={{ background: CHIP_BG }}
    >
      {children}
    </button>
  );
}

/* ------------------------------- Card --------------------------------- */
function GameCard({ g }) {
  const away = String(g.away || "").toUpperCase();
  const home = String(g.home || "").toUpperCase();

  const impAway = fmt1(g.imp_away);
  const impHome = fmt1(g.imp_home);

  const awayBar = COLORS[away] || "#1e3a8a";
  const homeBar = COLORS[home] || "#1e3a8a";

  const parkBits = [];
  if (g?.park?.name) parkBits.push(`Park: ${g.park.name}`);
  if (g?.park?.batting_idx != null) parkBits.push(`Batting ${fmt1(g.park.batting_idx)}%`);
  if (g?.park?.pitching_idx != null) parkBits.push(`Pitching ${fmt1(g.park.pitching_idx)}%`);

  const spBits = [];
  if (g?.starters?.away || g?.starters?.home)
    spBits.push(`SP: ${g.starters.away || "—"} | SP: ${g.starters.home || "—"}`);

  const weatherBits = (() => {
    const w = g?.weather || {};
    if (w.is_dome) return "Dome";
    const parts = [];
    if (w.temp_f != null) parts.push(`${fmt1(w.temp_f)}°F`);
    if (w.humidity_pct != null) parts.push(`${fmt1(w.humidity_pct)}%`);
    if (w.wind_mph != null) parts.push(`${fmt1(w.wind_mph)} mph`);
    if (w.wind_dir) parts.push(w.wind_dir);
    if (w.conditions) parts.push(w.conditions);
    if (!parts.length && w.desc) parts.push(w.desc);
    return parts.join(" | ");
  })();

  const awayHdr = g?.team_blocks?.away?.header || `${away} (${impAway})`;
  const homeHdr = g?.team_blocks?.home?.header || `${home} (${impHome})`;
  const awayLines = g?.team_blocks?.away?.lines || [];
  const homeLines = g?.team_blocks?.home?.lines || [];

  return (
    <div className="rounded-xl overflow-hidden shadow ring-1 ring-black/10 bg-white">
      {/* Title bar */}
      <div className="px-4 py-2 text-center font-bold tracking-wide" style={{ background: YELLOW }}>
        <div className="flex items-center justify-center gap-2">
          <img src={logo(away)} alt={away} className="h-5 w-5 object-contain" />
          <span>{away}</span>
          <span className="opacity-70">@</span>
          <img src={logo(home)} alt={home} className="h-5 w-5 object-contain" />
          <span>{home}</span>
        </div>
      </div>

      {/* Meta */}
      <div className="px-4 pt-3 pb-1 text-center text-[13px] text-slate-700 space-y-1">
        <div><span className="font-semibold">O/U:</span> {fmt1(g.ou)}</div>
        <div className="text-slate-600">
          <span className="font-medium">ML</span> {away}: {fmtMl(g.ml_away)}{" "}
          <span className="mx-1">|</span>
          <span className="font-medium">ML</span> {home}: {fmtMl(g.ml_home)}{" "}
          <span className="mx-1">|</span>
          <span className="font-medium">Spread:</span> {fmt1(g.spread_home)}
        </div>
        <div className="text-slate-600">
          <span className="font-medium">Totals:</span> {away} {impAway}{" "}
          <span className="mx-1">|</span> {home} {impHome}
        </div>
        {parkBits.length ? <div className="text-slate-600">{parkBits.join(" | ")}</div> : null}
        {spBits.length ? <div className="text-slate-600">{spBits.join(" | ")}</div> : null}
        {weatherBits ? <div className="text-slate-500">{weatherBits}</div> : null}
      </div>

      {/* Team headers with team colors */}
      <div className="grid grid-cols-2">
        <div className="text-white font-semibold text-sm px-3 py-1.5 text-center" style={{ background: awayBar }}>
          {awayHdr}
        </div>
        <div className="text-white font-semibold text-sm px-3 py-1.5 text-center" style={{ background: homeBar }}>
          {homeHdr}
        </div>
      </div>

      {/* Lines */}
      <div className="grid grid-cols-2 gap-0">
        <div className="p-3 text-[13px] border-r border-slate-200">
          <ul className="space-y-1.5">
            {awayLines.length ? awayLines.map((s, i) => <li key={i} className="text-slate-800">{s}</li>) :
              <li className="text-slate-400 italic">No lines</li>}
          </ul>
        </div>
        <div className="p-3 text-[13px]">
          <ul className="space-y-1.5 text-right">
            {homeLines.length ? homeLines.map((s, i) => <li key={i} className="text-slate-800">{s}</li>) :
              <li className="text-slate-400 italic">No lines</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Page --------------------------------- */
export default function MlbMatchups() {
  const { data: games, err, loading } = useJson(DATA_URL);

  const [sel, setSel] = useState(new Set());

  // Initialize selection to "all"
  useEffect(() => {
    setSel(new Set(games.map((_, i) => i)));
  }, [games.length]);

  const visible = useMemo(
    () => games.map((g, i) => ({ ...g, __i: i })).filter((g) => sel.has(g.__i)),
    [games, sel]
  );

  const toggle = (i) =>
    setSel((prev) => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  const selectAll = () => setSel(new Set(games.map((_, i) => i)));
  const selectNone = () => setSel(new Set());

  return (
    <div className="px-4 sm:px-6 md:px-8 py-6">
      <h1 className="text-2xl font-extrabold mb-4">MLB — Matchups</h1>

      {/* controls */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <button
          onClick={selectAll}
          className="px-4 py-2 rounded-lg text-white font-semibold shadow"
          style={{ background: CHIP_BG }}
        >
          Select All
        </button>
        <button onClick={selectNone} className="px-3 py-2 rounded-lg bg-slate-200 text-slate-800">
          None
        </button>
        <span className="text-slate-500 text-sm">{sel.size}/{games.length} visible</span>

        <div className="w-full" />
        <div className="flex flex-wrap gap-2">
          {games.map((g, i) => {
            const a = (g.away || "").toUpperCase();
            const h = (g.home || "").toUpperCase();
            return (
              <TogglePill key={i} active={sel.has(i)} onClick={() => toggle(i)}>
                <img src={logo(a)} alt={a} className="h-4 w-4 object-contain" />
                {a} ({fmt1(g.imp_away)}) <span className="opacity-70">@</span>
                <img src={logo(h)} alt={h} className="h-4 w-4 object-contain" />
                {h} ({fmt1(g.imp_home)}) <span className="opacity-70">•</span> O/U {fmt1(g.ou)}
              </TogglePill>
            );
          })}
        </div>
      </div>

      {/* grid */}
      {err ? (
        <div className="text-red-600 font-semibold mb-3">Failed to load: {err}</div>
      ) : loading ? (
        <div className="text-slate-600">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {visible.map((g) => <GameCard key={g.__i} g={g} />)}
        </div>
      )}
    </div>
  );
}
