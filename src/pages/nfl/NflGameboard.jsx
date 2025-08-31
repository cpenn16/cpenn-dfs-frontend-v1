import React, { useEffect, useMemo, useState } from "react";

/* ----------------------------- tiny helpers ----------------------------- */

const COLORS = {
  ARI:"#97233F", ATL:"#A71930", BAL:"#241773", BUF:"#00338D", CAR:"#0085CA",
  CHI:"#0B162A", CIN:"#FB4F14", CLE:"#311D00", DAL:"#041E42", DEN:"#002244",
  DET:"#0076B6", GB:"#203731", HOU:"#03202F", IND:"#002C5F", JAX:"#006778",
  KC:"#E31837", LAC:"#0080C6", LAR:"#003594", LV:"#000000", MIA:"#008E97",
  MIN:"#4F2683", NE:"#002244", NO:"#101820", NYG:"#0B2265", NYJ:"#125740",
  OAK:"#000000", PHI:"#004C54", PIT:"#101820", SEA:"#002244", SF:"#AA0000",
  TB:"#D50A0A", TEN:"#0C2340", WAS:"#5A1414"
};

const YELLOW = "#f5c842";
const CHIP_BG = "#2c62f0";

const onlyPlayers = (lines = []) => {
  const re = /^(QB|RB\d?|WR\d?|TE\d?):/i;
  return lines.filter((s) => re.test((s || "").trim()));
};

const logoSrc = (abbr) => `/logos/nfl/${(abbr || "").toUpperCase()}.png`;

/* --------------------------- gameboard component --------------------------- */

export default function NflGameboard() {
  const [games, setGames] = useState([]);
  const [sel, setSel] = useState(new Set());

  useEffect(() => {
    fetch("/data/nfl/classic/latest/nfl_gameboard.json", { cache: "no-store" })
      .then((r) => r.json())
      .then((arr) => {
        const clean = Array.isArray(arr) ? arr : [];
        setGames(clean);
        setSel(new Set(clean.map((_, i) => i)));
      })
      .catch(() => setGames([]));
  }, []);

  const visibleGames = useMemo(
    () => games.map((g, i) => ({ ...g, __i: i })).filter((g) => sel.has(g.__i)),
    [games, sel]
  );

  const toggle = (i) =>
    setSel((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const selectAll = () => setSel(new Set(games.map((_, i) => i)));
  const selectNone = () => setSel(new Set());

  const Chip = ({ g, i }) => {
    const a = (g.away || "").toUpperCase();
    const h = (g.home || "").toUpperCase();
    const lab = `${a} (${fmtNum(g.imp_away)}) @ ${h} (${fmtNum(g.imp_home)}) • O/U ${fmtNum(g.ou)}`;
    return (
      <button
        onClick={() => toggle(i)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-[13px] shadow ${sel.has(i) ? "" : "opacity-40"}`}
        style={{ background: CHIP_BG }}
        title={lab}
      >
        <img src={logoSrc(a)} alt={a} className="h-4 w-4 object-contain" />
        {a} ({fmtNum(g.imp_away)}) <span className="opacity-70">@</span>
        <img src={logoSrc(h)} alt={h} className="h-4 w-4 object-contain" />
        {h} ({fmtNum(g.imp_home)}) <span className="opacity-70">•</span> O/U {fmtNum(g.ou)}
      </button>
    );
  };

  return (
    <div className="px-4 sm:px-6 md:px-8 py-6">
      <h1 className="text-2xl font-extrabold mb-4">NFL Gameboard</h1>

      {/* Picker row */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <button
          onClick={selectAll}
          className="px-4 py-2 rounded-lg text-white font-semibold shadow"
          style={{ background: CHIP_BG }}
        >
          Select All
        </button>
        <button
          onClick={selectNone}
          className="px-3 py-2 rounded-lg bg-slate-200 text-slate-800"
        >
          None
        </button>
        <span className="text-slate-500 text-sm">{sel.size}/{games.length} visible</span>

        <div className="w-full" />
        <div className="flex flex-wrap gap-2">
          {games.map((g, i) => (
            <Chip key={i} g={g} i={i} />
          ))}
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {visibleGames.map((g) => (
          <GameCard key={g.__i} g={g} />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- card view -------------------------------- */

function GameCard({ g }) {
  const a = (g.away || "").toUpperCase();
  const h = (g.home || "").toUpperCase();

  const awayLines = onlyPlayers((((g.team_blocks || {}).away || {}).lines) || []);
  const homeLines = onlyPlayers((((g.team_blocks || {}).home || {}).lines) || []);

  const awayHdr = ((g.team_blocks || {}).away || {}).header || `${a} (${fmtNum(g.imp_away)})`;
  const homeHdr = ((g.team_blocks || {}).home || {}).header || `${h} (${fmtNum(g.imp_home)})`;

  const barA = COLORS[a] || "#1e3a8a";
  const barH = COLORS[h] || "#1e3a8a";

  return (
    <div className="rounded-xl overflow-hidden shadow ring-1 ring-black/10 bg-white">
      {/* Title bar */}
      <div className="px-4 py-2 text-center font-bold tracking-wide" style={{ background: YELLOW }}>
        <div className="flex items-center justify-center gap-2">
          <img src={logoSrc(a)} alt={a} className="h-5 w-5 object-contain" />
          <span>{a}</span>
          <span className="opacity-70">@</span>
          <img src={logoSrc(h)} alt={h} className="h-5 w-5 object-contain" />
          <span>{h}</span>
        </div>
      </div>

      {/* Centered meta lines */}
      <div className="px-4 pt-3 pb-1 text-center text-[13px] text-slate-700 space-y-1">
        <div>
          <span className="font-semibold">O/U:</span> {fmtNum(g.ou)}
        </div>
        <div className="text-slate-600">
          <span className="font-medium">ML</span> {a}: {fmtMl(g.ml_away)}{" "}
          <span className="mx-1">|</span>
          <span className="font-medium">ML</span> {h}: {fmtMl(g.ml_home)}{" "}
          <span className="mx-1">|</span>
          <span className="font-medium">Spread:</span> {fmtNum(g.spread_home)}
        </div>
        <div className="text-slate-600">
          <span className="font-medium">Totals:</span> {a} {fmtNum(g.imp_away)}{" "}
          <span className="mx-1">|</span> {h} {fmtNum(g.imp_home)}
        </div>
        {g.weather && (
          <div className="text-slate-500">{fmtWeather(g.weather)}</div>
        )}
      </div>

      {/* Team headers (centered) */}
      <div className="grid grid-cols-2">
        <div className="text-white font-semibold text-sm px-3 py-1.5 text-center" style={{ background: barA }}>
          {awayHdr}
        </div>
        <div className="text-white font-semibold text-sm px-3 py-1.5 text-center" style={{ background: barH }}>
          {homeHdr}
        </div>
      </div>

      {/* Player lines */}
      <div className="grid grid-cols-2 gap-0">
        <div className="p-3 text-[13px] border-r border-slate-200">
          <LinesList lines={awayLines} />
        </div>
        <div className="p-3 text-[13px]">
          <LinesList lines={homeLines} align="right" />
        </div>
      </div>
    </div>
  );
}

function LinesList({ lines, align = "left" }) {
  if (!lines?.length) return <div className="text-slate-400 italic">No lines</div>;
  return (
    <ul className={`space-y-1.5 ${align === "right" ? "text-right" : ""}`}>
      {lines.map((s, i) => (
        <li key={i} className="text-slate-800">{s}</li>
      ))}
    </ul>
  );
}

/* -------------------------------- formatters -------------------------------- */

function fmtNum(x) {
  if (x === null || x === undefined || x === "") return "";
  const n = Number(x);
  return Number.isFinite(n) ? (Math.round(n * 10) / 10).toString() : String(x);
}

function fmtMl(x) {
  if (x === null || x === undefined || x === "") return "";
  const n = Number(x);
  if (!Number.isFinite(n)) return String(x);
  return n > 0 ? `+${n}` : `${n}`;
}

function fmtWeather(w) {
  if (!w || typeof w !== "object") return "";
  const parts = [];

  if (typeof w.temp_f === "number") parts.push(`${fmtNum(w.temp_f)}°F`);
  if (typeof w.wind_mph === "number") parts.push(`${fmtNum(w.wind_mph)} mph`);

  // Clean desc so it doesn't repeat temp/wind (e.g., "90.5°F 8.1 mph Clear Sky")
  if (w.desc) {
    const cleaned = String(w.desc)
      .replace(/\b\d+(\.\d+)?\s*(°?F|mph)\b/gi, "") // drop "90.5°F", "8.1 mph"
      .replace(/\s{2,}/g, " ")
      .trim();
    if (cleaned) parts.push(cleaned);
  } else if (w.is_dome) {
    parts.push("Dome");
  }

  return parts.join(" | ");
}
