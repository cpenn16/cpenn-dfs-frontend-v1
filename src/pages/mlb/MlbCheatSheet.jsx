// src/pages/mlb/MlbCheatSheet.jsx
import React, { useEffect, useMemo, useState } from "react";

/* ------------------------------- config ------------------------------- */
/** Override with env if you like */
const PITCHERS_URL =
  import.meta.env?.VITE_MLB_PITCHERS_URL || "/data/mlb/latest/pitcher_projections.json";
const BATTERS_URL =
  import.meta.env?.VITE_MLB_BATTERS_URL || "/data/mlb/latest/batter_projections.json";
const STACKS_URL =
  import.meta.env?.VITE_MLB_STACKS_URL || "/data/mlb/latest/stacks.json";

/* ------------------------------ helpers ------------------------------- */
const teamLogo = (abv) => `/logos/mlb/${String(abv || "").toUpperCase()}.png`;

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[,$%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const fmtMoney = (v) => {
  const n = num(v);
  return n == null ? "" : n.toLocaleString();
};
const fmt1 = (v) => {
  const n = num(v);
  return n == null ? "" : n.toFixed(1);
};
const fmtPct = (v) => {
  if (v == null || v === "") return "";
  let s = String(v).trim();
  if (s.endsWith("%")) {
    const n = num(s.slice(0, -1));
    return n == null ? "" : `${n.toFixed(1)}%`;
  }
  let n = num(s);
  if (n == null) return "";
  if (Math.abs(n) <= 1) n *= 100;
  return `${n.toFixed(1)}%`;
};
const time12 = (v) => {
  if (!v) return "";
  // works with "19:40" or "7:40 PM" or full "7:40:00 PM"
  const s = String(v).trim();
  if (/\d{1,2}:\d{2}(:\d{2})?\s?[AP]M/i.test(s)) return s.toUpperCase();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return s;
  let hh = Number(m[1]),
    mm = m[2],
    ampm = "AM";
  if (hh === 0) hh = 12;
  else if (hh === 12) ampm = "PM";
  else if (hh > 12) {
    hh -= 12;
    ampm = "PM";
  }
  return `${hh}:${mm}:00 ${ampm}`;
};

/** value getter tolerant to many header names */
const get = (row, keys) => {
  if (!row) return undefined;
  for (const k of (Array.isArray(keys) ? keys : [keys])) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  return undefined;
};

/* unified rows (accept common alias variants) */
const adaptPitcher = (r) => ({
  player: get(r, ["Player", "Pitcher", "Name"]),
  team: get(r, ["Team", "Tm"]),
  opp: get(r, ["Opp", "Opponent"]),
  vegas: get(r, ["Imp. Total", "ImpTotal", "ImpliedTotal", "Total", "Vegas", "O/U"]),
  time: get(r, ["Time", "time"]),
  dkSal: num(get(r, ["DK Sal", "DK_Sal", "DKSal", "dk_salary", "dk_sal"])),
  dkProj: num(get(r, ["DK Proj", "dk_points", "DKProj", "dk_proj"])),
  dkVal: num(get(r, ["DK Val", "dk_val", "DKVal"])),
  dkOwn: get(r, ["DK pOWN%", "dk_pown", "dk_pown%"]),
});

const adaptBatter = (r) => ({
  player: get(r, ["Player", "Name"]),
  pos: String(get(r, ["Pos", "Position", "POS"]) || "").toUpperCase(),
  team: get(r, ["Team", "Tm"]),
  opp: get(r, ["Opp", "Opponent"]),
  vegas: get(r, ["Vegas", "Total", "Imp. Total", "Implied Total", "ImpTotal"]),
  time: get(r, ["Time", "time"]),
  dkSal: num(get(r, ["DK Sal", "DK_Sal", "DKSal", "dk_salary", "dk_sal"])),
  dkProj: num(get(r, ["DK Proj", "dk_points", "DKProj", "dk_proj"])),
  dkVal: num(get(r, ["DK Val", "dk_val", "DKVal"])),
  dkOwn: get(r, ["DK pOWN%", "dk_pown", "dk_pown%"]),
});

const adaptStack = (r) => ({
  team: get(r, ["Team", "team"]),
  opp: get(r, ["Opp", "opp"]),
  oppPitcher: get(r, ["Opp Pitcher", "opp_pitcher", "oppPitcher"]),
  vegas: get(r, ["Total", "total", "Imp. Tot", "Implied Total", "ImpTotal"]),
  time: get(r, ["Time", "time"]),
  dkSal: num(get(r, ["DK Sal", "dk_sal", "DK Sal"])),
  dkProj: num(get(r, ["DK Proj", "dk_proj", "DK Proj"])),
  dkVal: num(get(r, ["DK Val", "dk_val", "DK Val"])),
  dkOwn: get(r, ["DK pOWN%", "dk_pown", "dk_pown%"]),
});

/* basic fetch hook */
function useJson(url) {
  const [rows, setRows] = useState([]);
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
        const data = Array.isArray(j) ? j : j?.rows || j?.data || j?.items || [];
        if (alive) setRows(data);
      } catch (e) {
        if (alive) setErr(String(e.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => (alive = false);
  }, [url]);
  return { rows, err, loading };
}

/* ------------------------------- tables ------------------------------- */

function SectionHeader({ children }) {
  return (
    <div className="bg-gray-100 text-xs font-semibold grid grid-cols-9 gap-2 px-2 py-1 rounded-t">
      {children}
    </div>
  );
}

function RowPitcher({ r }) {
  const abv = String(r.team || "").toUpperCase();
  return (
    <div className="grid grid-cols-9 gap-2 px-2 py-1 text-[12px] odd:bg-white even:bg-gray-50">
      <div className="col-span-2 flex items-center gap-2">
        <img
          src={teamLogo(abv)}
          alt=""
          className="w-4 h-4"
          onError={(e) => (e.currentTarget.style.visibility = "hidden")}
        />
        <span className="truncate" title={r.player}>
          {r.player}
        </span>
      </div>
      <div className="text-center tabular-nums">{fmtMoney(r.dkSal)}</div>
      <div className="text-center">{abv}</div>
      <div className="text-center">{String(r.opp || "")}</div>
      <div className="text-center">{fmt1(r.vegas)}</div>
      <div className="text-center">{time12(r.time)}</div>
      <div className="text-center tabular-nums">{fmt1(r.dkProj)}</div>
      <div className="text-center tabular-nums">{fmt1(r.dkVal)}</div>
      <div className="text-center">{fmtPct(r.dkOwn)}</div>
    </div>
  );
}

function RowBatter({ r }) {
  const abv = String(r.team || "").toUpperCase();
  return (
    <div className="grid grid-cols-9 gap-2 px-2 py-1 text-[12px] odd:bg-white even:bg-gray-50">
      <div className="col-span-2 flex items-center gap-2">
        <img
          src={teamLogo(abv)}
          alt=""
          className="w-4 h-4"
          onError={(e) => (e.currentTarget.style.visibility = "hidden")}
        />
        <span className="truncate" title={`${r.player} (${r.pos})`}>
          {r.player}
        </span>
      </div>
      <div className="text-center tabular-nums">{fmtMoney(r.dkSal)}</div>
      <div className="text-center">{abv}</div>
      <div className="text-center">{String(r.opp || "")}</div>
      <div className="text-center">{fmt1(r.vegas)}</div>
      <div className="text-center">{time12(r.time)}</div>
      <div className="text-center tabular-nums">{fmt1(r.dkProj)}</div>
      <div className="text-center tabular-nums">{fmt1(r.dkVal)}</div>
      <div className="text-center">{fmtPct(r.dkOwn)}</div>
    </div>
  );
}

function RowStack({ r }) {
  const abv = String(r.team || "").toUpperCase();
  return (
    <div className="grid grid-cols-10 gap-2 px-2 py-1 text-[12px] odd:bg-white even:bg-gray-50">
      <div className="flex items-center gap-2">
        <img
          src={teamLogo(abv)}
          alt=""
          className="w-4 h-4"
          onError={(e) => (e.currentTarget.style.visibility = "hidden")}
        />
        <span className="font-medium">{abv}</span>
      </div>
      <div className="text-center tabular-nums">{fmtMoney(r.dkSal)}</div>
      <div className="text-center">{String(r.opp || "")}</div>
      <div className="text-left truncate" title={r.oppPitcher || ""}>
        {r.oppPitcher || ""}
      </div>
      <div className="text-center">{fmt1(r.vegas)}</div>
      <div className="text-center">{time12(r.time)}</div>
      <div className="text-center tabular-nums">{fmt1(r.dkProj)}</div>
      <div className="text-center tabular-nums">{fmt1(r.dkVal)}</div>
      <div className="text-center">{fmtPct(r.dkOwn)}</div>
    </div>
  );
}

/* -------------------------------- page -------------------------------- */
export default function MlbCheatSheet() {
  const pitchers = useJson(PITCHERS_URL);
  const batters = useJson(BATTERS_URL);
  const stacks = useJson(STACKS_URL);

  const pRows = useMemo(
    () =>
      (pitchers.rows || [])
        .map(adaptPitcher)
        .filter((r) => r.player)
        .sort((a, b) => (b.dkProj ?? 0) - (a.dkProj ?? 0))
        .slice(0, 6),
    [pitchers.rows]
  );

  const bAll = useMemo(
    () =>
      (batters.rows || [])
        .map(adaptBatter)
        .filter((r) => r.player && r.pos),
    [batters.rows]
  );

  const byPos = (pos, n = 3, offset = 0) =>
    bAll
      .filter((r) => r.pos.split(/[ ,/]/).includes(pos))
      .sort((a, b) => (b.dkProj ?? 0) - (a.dkProj ?? 0))
      .slice(offset, offset + n);

  // OF Top 3 and Next 3 like your sheet
  const ofTop = byPos("OF", 3, 0);
  const ofNext = byPos("OF", 3, 3);

  const cTop = byPos("C", 3);
  const b1Top = byPos("1B", 3);
  const b2Top = byPos("2B", 3);
  const b3Top = byPos("3B", 3);
  const ssTop = byPos("SS", 3);

  // Cash core (simple: top P + top two bats by value)
  const cashP = pRows[0];
  const coreBats = [...bAll].sort((a, b) => (b.dkVal ?? 0) - (a.dkVal ?? 0)).slice(0, 2);

  const sRows = useMemo(
    () =>
      (stacks.rows || [])
        .map(adaptStack)
        .filter((r) => r.team)
        .sort((a, b) => (b.dkProj ?? 0) - (a.dkProj ?? 0))
        .slice(0, 8),
    [stacks.rows]
  );

  const loading = pitchers.loading || batters.loading || stacks.loading;
  const err = pitchers.err || batters.err || stacks.err;

  return (
    <div className="px-4 md:px-6 py-5">
      {/* Yellow merged header bar */}
      <div className="w-full rounded-xl bg-yellow-300 text-black font-extrabold text-xl md:text-2xl px-4 py-2 mb-4 shadow-sm">
        Cheat Sheet
      </div>

      {err ? <div className="text-red-600 font-semibold mb-3">Failed to load: {err}</div> : null}

      {loading ? (
        <div className="text-gray-600">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT COLUMN */}
          <div className="flex flex-col gap-4">
            {/* Pitchers */}
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-3 py-2 font-bold">Pitcher</div>
              <SectionHeader>
                <div className="col-span-2">Player</div>
                <div>Salary</div>
                <div>Team</div>
                <div>Matchup</div>
                <div>Vegas</div>
                <div>Time</div>
                <div>Proj</div>
                <div>Value</div>
                <div>pOWN</div>
              </SectionHeader>
              <div>{pRows.map((r, i) => <RowPitcher key={`${r.player}-${i}`} r={r} />)}</div>
            </div>

            {/* C */}
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-3 py-2 font-bold">C</div>
              <SectionHeader>
                <div className="col-span-2">Player</div>
                <div>Salary</div>
                <div>Team</div>
                <div>Matchup</div>
                <div>Vegas</div>
                <div>Time</div>
                <div>Proj</div>
                <div>Value</div>
                <div>pOWN</div>
              </SectionHeader>
              <div>{cTop.map((r, i) => <RowBatter key={`${r.player}-${i}`} r={r} />)}</div>
            </div>

            {/* 1B */}
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-3 py-2 font-bold">1B</div>
              <SectionHeader>
                <div className="col-span-2">Player</div>
                <div>Salary</div>
                <div>Team</div>
                <div>Matchup</div>
                <div>Vegas</div>
                <div>Time</div>
                <div>Proj</div>
                <div>Value</div>
                <div>pOWN</div>
              </SectionHeader>
              <div>{b1Top.map((r, i) => <RowBatter key={`${r.player}-${i}`} r={r} />)}</div>
            </div>

            {/* 2B */}
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-3 py-2 font-bold">2B</div>
              <SectionHeader>
                <div className="col-span-2">Player</div>
                <div>Salary</div>
                <div>Team</div>
                <div>Matchup</div>
                <div>Vegas</div>
                <div>Time</div>
                <div>Proj</div>
                <div>Value</div>
                <div>pOWN</div>
              </SectionHeader>
              <div>{b2Top.map((r, i) => <RowBatter key={`${r.player}-${i}`} r={r} />)}</div>
            </div>

            {/* 3B */}
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-3 py-2 font-bold">3B</div>
              <SectionHeader>
                <div className="col-span-2">Player</div>
                <div>Salary</div>
                <div>Team</div>
                <div>Matchup</div>
                <div>Vegas</div>
                <div>Time</div>
                <div>Proj</div>
                <div>Value</div>
                <div>pOWN</div>
              </SectionHeader>
              <div>{b3Top.map((r, i) => <RowBatter key={`${r.player}-${i}`} r={r} />)}</div>
            </div>

            {/* SS */}
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-3 py-2 font-bold">SS</div>
              <SectionHeader>
                <div className="col-span-2">Player</div>
                <div>Salary</div>
                <div>Team</div>
                <div>Matchup</div>
                <div>Vegas</div>
                <div>Time</div>
                <div>Proj</div>
                <div>Value</div>
                <div>pOWN</div>
              </SectionHeader>
              <div>{ssTop.map((r, i) => <RowBatter key={`${r.player}-${i}`} r={r} />)}</div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="flex flex-col gap-4">
            {/* OF block 1 */}
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-3 py-2 font-bold">OF</div>
              <SectionHeader>
                <div className="col-span-2">Player</div>
                <div>Salary</div>
                <div>Team</div>
                <div>Matchup</div>
                <div>Vegas</div>
                <div>Time</div>
                <div>Proj</div>
                <div>Value</div>
                <div>pOWN</div>
              </SectionHeader>
              <div>{ofTop.map((r, i) => <RowBatter key={`${r.player}-${i}`} r={r} />)}</div>
            </div>

            {/* OF block 2 */}
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-3 py-2 font-bold">OF</div>
              <SectionHeader>
                <div className="col-span-2">Player</div>
                <div>Salary</div>
                <div>Team</div>
                <div>Matchup</div>
                <div>Vegas</div>
                <div>Time</div>
                <div>Proj</div>
                <div>Value</div>
                <div>pOWN</div>
              </SectionHeader>
              <div>{ofNext.map((r, i) => <RowBatter key={`${r.player}-${i}`} r={r} />)}</div>
            </div>

            {/* Cash Core */}
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-3 py-2 font-bold">Cash Core</div>
              <SectionHeader>
                <div className="col-span-2">Player</div>
                <div>Salary</div>
                <div>Team</div>
                <div>Matchup</div>
                <div>Vegas</div>
                <div>Time</div>
                <div>Proj</div>
                <div>Value</div>
                <div>pOWN</div>
              </SectionHeader>
              <div>
                {cashP ? <RowPitcher r={cashP} /> : null}
                {coreBats.map((r, i) => (
                  <RowBatter key={`${r.player}-core-${i}`} r={r} />
                ))}
              </div>
            </div>

            {/* Top Stacks */}
            <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-3 py-2 font-bold">Top Stacks</div>
              <div className="bg-gray-100 text-xs font-semibold grid grid-cols-10 gap-2 px-2 py-1 rounded-t">
                <div>Team</div>
                <div>Salary</div>
                <div>Opp</div>
                <div>Opp Pitcher</div>
                <div>Vegas</div>
                <div>Time</div>
                <div>Proj</div>
                <div>Value</div>
                <div>pOWN</div>
              </div>
              <div>
                {sRows.map((r, i) => (
                  <RowStack key={`${r.team}-${i}`} r={r} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
