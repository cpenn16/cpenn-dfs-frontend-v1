// src/pages/mlb/MlbMatchups.jsx
import React, { useEffect, useMemo, useState } from "react";

/* ----------------------------- tiny helpers ----------------------------- */

// MLB team colors (primary-ish). Includes both CWS/CHW just in case.
const COLORS = {
  ARI: "#A71930",
  ATL: "#CE1141",
  BAL: "#DF4601",
  BOS: "#0D2B56",
  CHC: "#0E3386",
  CHW: "#27251F",
  CWS: "#27251F",
  CIN: "#C6011F",
  CLE: "#00385D",
  COL: "#333366",
  DET: "#0C2340",
  HOU: "#002D62",
  KC: "#004687",
  LAA: "#BA0021",
  LAD: "#005A9C",
  MIA: "#00A3E0",
  MIL: "#12284B",
  MIN: "#002B5C",
  NYM: "#002D72",
  NYY: "#0C2340",
  OAK: "#003831",
  PHI: "#E81828",
  PIT: "#FDB827",
  SD: "#2F241D",
  SEA: "#0C2C56",
  SF: "#FD5A1E",
  STL: "#C41E3A",
  TB: "#092C5C",
  TEX: "#003278",
  TOR: "#134A8E",
  WAS: "#AB0003",
};

const YELLOW = "#f5c842";
const CHIP_BG = "#2c62f0";

const logoSrc = (abbr) => `/logos/mlb/${(abbr || "").toUpperCase()}.png`;

// MLB lineups usually start "1 - ____". Keep those lines only.
const onlyHitters = (lines = []) => {
  const re = /^\s*\d+\s*[-–]/; // e.g., "1 - " or "9 - "
  return lines.filter((s) => re.test((s || "").trim()));
};

// Safe getter that tries multiple property names
function pick(obj, keys, fallback = undefined) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") {
      return obj[k];
    }
  }
  return fallback;
}

/* --------------------------- page-level component --------------------------- */

export default function MlbMatchups() {
  const [games, setGames] = useState([]);
  const [sel, setSel] = useState(new Set());

  useEffect(() => {
    let cancelled = false;

    async function tryFetch(url) {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return null;
        const j = await r.json();
        return Array.isArray(j) ? j : (Array.isArray(j?.games) ? j.games : null);
      } catch {
        return null;
      }
    }

    (async () => {
      const candidates = [
        "/data/mlb/latest/matchups.json",
        "/data/mlb/latest/matchups/index.json",
        "/data/mlb/latest/mlb_matchups.json",
        "/data/mlb/latest/matchups_raw.json",
      ];
      let loaded = null;
      for (const u of candidates) {
        loaded = await tryFetch(u);
        if (loaded) break;
      }
      if (!loaded) loaded = [];
      if (!cancelled) {
        setGames(loaded);
        setSel(new Set(loaded.map((_, i) => i)));
      }
    })();

    return () => {
      cancelled = true;
    };
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
    const a = (pick(g, ["away", "team_away", "a"]) || "").toUpperCase();
    const h = (pick(g, ["home", "team_home", "h"]) || "").toUpperCase();

    const impAway = pick(g, ["imp_away", "away_imp", "implied_away", "away_runs", "away_total"]);
    const impHome = pick(g, ["imp_home", "home_imp", "implied_home", "home_runs", "home_total"]);
    const ou = pick(g, ["ou", "over_under", "total"]);

    const lab = `${a} (${fmtNum(impAway)}) @ ${h} (${fmtNum(impHome)}) • O/U ${fmtNum(ou)}`;

    return (
      <button
        onClick={() => toggle(i)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-[13px] shadow ${sel.has(i) ? "" : "opacity-40"}`}
        style={{ background: CHIP_BG }}
        title={lab}
      >
        <img src={logoSrc(a)} alt={a} className="h-4 w-4 object-contain" />
        {a} ({fmtNum(impAway)}) <span className="opacity-70">@</span>
        <img src={logoSrc(h)} alt={h} className="h-4 w-4 object-contain" />
        {h} ({fmtNum(impHome)}) <span className="opacity-70">•</span> O/U {fmtNum(ou)}
      </button>
    );
  };

  return (
    <div className="px-4 sm:px-6 md:px-8 py-6">
      <h1 className="text-2xl font-extrabold mb-4">MLB — Matchups</h1>

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
  const a = (pick(g, ["away", "team_away", "a"]) || "").toUpperCase();
  const h = (pick(g, ["home", "team_home", "h"]) || "").toUpperCase();

  const impAway = pick(g, ["imp_away", "away_imp", "implied_away", "away_runs", "away_total"]);
  const impHome = pick(g, ["imp_home", "home_imp", "implied_home", "home_runs", "home_total"]);

  // team_blocks shape mirrors NFL version: { away: { header, lines }, home: { header, lines } }
  const awayLines = onlyHitters(pick(pick(g, ["team_blocks"]), ["away", "a"], {}).lines || []);
  const homeLines = onlyHitters(pick(pick(g, ["team_blocks"]), ["home", "h"], {}).lines || []);

  const awayHdr =
    pick(pick(g, ["team_blocks"]), ["away", "a"], {}).header ||
    `${a} (${fmtNum(impAway)} Runs)`;
  const homeHdr =
    pick(pick(g, ["team_blocks"]), ["home", "h"], {}).header ||
    `${h} (${fmtNum(impHome)} Runs)`;

  const barA = COLORS[a] || "#1e3a8a";
  const barH = COLORS[h] || "#1e3a8a";

  // Meta
  const ou = pick(g, ["ou", "over_under", "total"]);
  const mlAway = pick(g, ["ml_away", "away_ml", "moneyline_away"]);
  const mlHome = pick(g, ["ml_home", "home_ml", "moneyline_home"]);
  const spread = pick(g, ["spread_home", "home_spread", "spread"]);
  const park = pick(g, ["park", "ballpark", "stadium"]);
  const battingPct = pick(g, ["batting_pct", "batting", "batting_factor"]);
  const pitchingPct = pick(g, ["pitching_pct", "pitching", "pitching_factor"]);

  const weather = pick(g, ["weather"], {});
  const spAway = pick(g, ["sp_away", "away_sp", "starter_away", "pitcher_away"]);
  const spHome = pick(g, ["sp_home", "home_sp", "starter_home", "pitcher_home"]);

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

      {/* Centered meta lines (to mirror your sheet) */}
      <div className="px-4 pt-3 pb-1 text-center text-[13px] text-slate-700 space-y-1">
        <div>
          <span className="font-semibold">O/U:</span> {fmtNum(ou)}{" "}
          <span className="mx-1">|</span>
          <span className="font-medium">{a} ML:</span> {fmtMl(mlAway)}{" "}
          <span className="mx-1">|</span>
          <span className="font-medium">{h} ML:</span> {fmtMl(mlHome)}
        </div>

        {(park || battingPct || pitchingPct) && (
          <div className="text-slate-600">
            {park ? <><span className="font-medium">Park:</span> {park}{" "}</> : null}
            {battingPct ? <>| <span className="font-medium">Batting</span> {fmtPct(battingPct)}{" "}</> : null}
            {pitchingPct ? <>| <span className="font-medium">Pitching</span> {fmtPct(pitchingPct)}</> : null}
          </div>
        )}

        {(weather?.temp_f || weather?.humidity || weather?.wind_mph || weather?.desc || weather?.is_dome) && (
          <div className="text-slate-600">
            {fmtWeather(weather)}
          </div>
        )}

        {(spAway || spHome) && (
          <div className="text-slate-600">
            {spAway ? <>SP: {spAway}{" "}</> : null}
            {spHome ? <>| SP: {spHome}</> : null}
          </div>
        )}

        <div className="text-slate-600">
          <span className="font-medium">Implied Totals:</span> {a} {fmtNum(impAway)}{" "}
          <span className="mx-1">|</span> {h} {fmtNum(impHome)}
          {spread !== undefined && spread !== null ? (
            <>
              {" "}<span className="mx-1">|</span>{" "}
              <span className="font-medium">Spread:</span> {fmtNum(spread)}
            </>
          ) : null}
        </div>
      </div>

      {/* Team headers (centered, color bars) */}
      <div className="grid grid-cols-2">
        <div className="text-white font-semibold text-sm px-3 py-1.5 text-center" style={{ background: barA }}>
          {awayHdr}
        </div>
        <div className="text-white font-semibold text-sm px-3 py-1.5 text-center" style={{ background: barH }}>
          {homeHdr}
        </div>
      </div>

      {/* Lineups */}
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

function fmtPct(x) {
  if (x === null || x === undefined || x === "") return "";
  const s = String(x);
  if (/%$/.test(s)) return s;
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  // If already 0–1, scale; if 0–200 assume it’s already percentage.
  const val = Math.abs(n) <= 1 ? n * 100 : n;
  return `${(Math.round(val * 10) / 10).toFixed(1)}%`;
}

function fmtWeather(w) {
  const parts = [];
  if (!w || typeof w !== "object") return "";

  if (w.temp_f !== undefined) parts.push(`${fmtNum(w.temp_f)}°F`);
  if (w.humidity !== undefined) parts.push(`${fmtNum(w.humidity)}% Humidity`);
  if (w.wind_mph !== undefined) {
    const wind = `${fmtNum(w.wind_mph)} mph`;
    const dir = w.wind_dir ? ` (${w.wind_dir})` : "";
    parts.push(`Wind: ${wind}${dir}`);
  }
  if (w.desc) {
    const cleaned = String(w.desc)
      .replace(/\b\d+(\.\d+)?\s*(°?F|mph)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (cleaned) parts.push(`Conditions: ${cleaned}`);
  } else if (w.is_dome) {
    parts.push("Dome");
  }

  return parts.join(" | ");
}
