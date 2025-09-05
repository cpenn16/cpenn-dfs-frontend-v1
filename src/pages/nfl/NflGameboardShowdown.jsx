// src/pages/nfl/NflGameboard.jsx
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

const RE_TAG = /^(QB|RB\d?|WR\d?|TE\d?):/i;

const onlyPlayers = (lines = []) => lines.filter((s) => RE_TAG.test((s || "").trim()));
const logoSrc = (abbr) => `/logos/nfl/${(abbr || "").toUpperCase()}.png`;

/* ------------------- legacy → structured normalization ------------------- */
/** Split “QB: … | QB: …” into the away/home halves while keeping the tag. */
function splitPlayerRow(row) {
  const m = row.match(RE_TAG);
  if (!m) return { away: row.trim(), home: "" };
  const tag = m[1];
  // capture: (TAG: ...)( | TAG: ... )
  const re = new RegExp(`^(${tag}:.*?)(?:\\s\\|\\s*)(${tag}:.*)$`, "i");
  const parts = row.match(re);
  if (parts) return { away: parts[1].trim(), home: parts[2].trim() };
  return { away: row.trim(), home: "" };
}

/** Build the full object the UI needs from a record that only has “lines”. */
function normalizeFromLines(g) {
  // If it already looks structured, keep it (but make sure keys exist).
  if (g && g.team_blocks && (g.team_blocks.away || g.team_blocks.home)) {
    const a = (g.away || "").toUpperCase();
    const h = (g.home || "").toUpperCase();
    const imp_away = g.imp_away ?? null;
    const imp_home = g.imp_home ?? null;
    return {
      away: a, home: h,
      ou: g.ou ?? null,
      ml_away: g.ml_away ?? null,
      ml_home: g.ml_home ?? null,
      spread_home: g.spread_home ?? null,
      imp_away, imp_home,
      weather: g.weather ?? null,
      team_blocks: {
        away: {
          header: (g.team_blocks.away?.header) ?? `${a} (${fmtNum(imp_away)})`,
          lines: Array.isArray(g.team_blocks.away?.lines) ? g.team_blocks.away.lines : []
        },
        home: {
          header: (g.team_blocks.home?.header) ?? `${h} (${fmtNum(imp_home)})`,
          lines: Array.isArray(g.team_blocks.home?.lines) ? g.team_blocks.home.lines : []
        }
      }
    };
  }

  // Legacy shape with a single “lines” array.
  const a = (g.away || "").toUpperCase();
  const h = (g.home || "").toUpperCase();
  const all = Array.isArray(g.lines) ? g.lines : [];

  let ou = null, ml_away = null, ml_home = null, spread_home = null, imp_away = null, imp_home = null;

  for (const s of all) {
    const t = String(s || "").trim();

    // O/U: 45.5 | KC ML: -170 | LAC ML: 142
    if (/^O\/U:/i.test(t)) {
      const mOU = t.match(/O\/U:\s*([0-9.]+)/i);
      if (mOU) ou = Number(mOU[1]);
      const mA  = t.match(new RegExp(`${a}\\s*ML:\\s*([+-]?\\d+)`, "i"));
      const mH  = t.match(new RegExp(`${h}\\s*ML:\\s*([+-]?\\d+)`, "i"));
      if (mA) ml_away = Number(mA[1]);
      if (mH) ml_home = Number(mH[1]);
      continue;
    }

    // Spread: KC -3 | LAC 3
    if (/^Spread:/i.test(t)) {
      const mH = t.match(new RegExp(`${h}\\s*([+-]?\\d+(?:\\.\\d+)?)`, "i"));
      if (mH) spread_home = Number(mH[1]);
      continue;
    }

    // Totals: KC 24.5 | LAC 21.5
    if (/^Totals:/i.test(t)) {
      const tA = t.match(new RegExp(`${a}\\s*([\\d.]+)`, "i"));
      const tH = t.match(new RegExp(`${h}\\s*([\\d.]+)`, "i"));
      if (tA) imp_away = Number(tA[1]);
      if (tH) imp_home = Number(tH[1]);
      continue;
    }
  }

  const playerRows = onlyPlayers(all);
  const awayLines = [], homeLines = [];
  for (const row of playerRows) {
    const { away, home } = splitPlayerRow(row);
    if (away) awayLines.push(away);
    if (home) homeLines.push(home);
  }

  return {
    away: a, home: h,
    ou, ml_away, ml_home, spread_home, imp_away, imp_home,
    weather: g.weather ?? null,
    team_blocks: {
      away: { header: `${a} (${fmtNum(imp_away)})`, lines: awayLines },
      home: { header: `${h} (${fmtNum(imp_home)})`, lines: homeLines },
    },
  };
}

/* --------------------------- gameboard component --------------------------- */

export default function NflGameboard() {
  const [games, setGames] = useState([]);
  const [sel, setSel] = useState(new Set());

  useEffect(() => {
    fetch("/data/nfl/showdown/latest/nfl_gameboard.json", { cache: "no-store" })
      .then((r) => r.json())
      .then((arr) => {
        const clean = Array.isArray(arr) ? arr : [];
        const normalized = clean.map(normalizeFromLines);
        setGames(normalized);
        setSel(new Set(normalized.map((_, i) => i)));
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

  const awayLines = onlyPlayers(g?.team_blocks?.away?.lines || []);
  const homeLines = onlyPlayers(g?.team_blocks?.home?.lines || []);

  const awayHdr = g?.team_blocks?.away?.header ?? `${a} (${fmtNum(g.imp_away)})`;
  const homeHdr = g?.team_blocks?.home?.header ?? `${h} (${fmtNum(g.imp_home)})`;

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
        {g.weather && <div className="text-slate-500">{fmtWeather(g.weather)}</div>}
      </div>

      {/* Team headers */}
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
  if (w.desc) {
    const cleaned = String(w.desc)
      .replace(/\b\d+(\.\d+)?\s*(°?F|mph)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (cleaned) parts.push(cleaned);
  } else if (w.is_dome) {
    parts.push("Dome");
  }
  return parts.join(" | ");
}
