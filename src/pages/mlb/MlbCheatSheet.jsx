// src/pages/mlb/MlbCheatSheet.jsx
import React, { useEffect, useMemo, useState } from "react";

/* ------------------------------- config ------------------------------- */
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
const fmtMoney0 = (v) => {
  const n = num(v);
  return n == null ? "" : n.toLocaleString(undefined, { maximumFractionDigits: 0 });
};
const fmt1 = (v) => {
  const n = num(v);
  return n == null ? "" : n.toFixed(1);
};
const fmtPct1 = (v) => {
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

/** tolerant getter for multiple header names */
const get = (row, keys) => {
  if (!row) return undefined;
  for (const k of (Array.isArray(keys) ? keys : [keys])) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  return undefined;
};

/* unified rows (broad key coverage) */
const adaptPitcher = (r) => ({
  player: get(r, ["Player", "Pitcher", "Name"]),
  team: get(r, ["Team", "Tm"]),
  opp: get(r, ["Opp", "Opponent"]),
  vegas: get(r, [
    "Imp. Total",
    "Imp Total",
    "ImpTotal",
    "Implied Total",
    "implied_total",
    "Vegas",
    "Total",
    "v",
  ]),
  time: get(r, ["Time", "time", "Start", "Start Time", "start_time"]),
  dkSal: num(get(r, ["DK Sal", "Salary", "DK_Sal", "DKSal", "dk_salary"])),
  dkProj: num(get(r, ["DK Proj", "Proj", "Projection", "dk_points", "DKProj"])),
  dkVal: num(get(r, ["DK Val", "Value", "dk_val", "DKVal"])),
  dkOwn: get(r, ["DK pOWN%", "dk_pown", "dk_pown%", "pOWN", "Ownership"]),
});

const adaptBatter = (r) => ({
  player: get(r, ["Player", "Name"]),
  pos: String(get(r, ["Pos", "Position", "POS"]) || "").toUpperCase(),
  team: get(r, ["Team", "Tm"]),
  opp: get(r, ["Opp", "Opponent"]),
  vegas: get(r, ["v", "Vegas", "Total", "Imp. Total", "Implied Total"]),
  time: get(r, ["Time", "time", "Start", "Start Time", "start_time"]),
  dkSal: num(get(r, ["DK Sal", "Salary", "DK_Sal", "DKSal", "dk_salary"])),
  dkProj: num(get(r, ["DK Proj", "Proj", "Projection", "dk_points", "DKProj"])),
  dkVal: num(get(r, ["DK Val", "Value", "dk_val", "DKVal"])),
  dkOwn: get(r, ["DK pOWN%", "dk_pown", "dk_pown%", "pOWN", "Ownership"]),
});

const adaptStack = (r) => ({
  team: get(r, ["Team", "team"]),
  opp: get(r, ["Opp", "opp"]),
  oppPitcher: get(r, ["Opp Pitcher", "opp_pitcher", "oppPitcher"]),
  vegas: get(r, ["v", "Total", "total", "Imp. Tot", "Implied Total"]),
  time: get(r, ["Time", "time", "Start", "Start Time", "start_time"]),
  dkSal: num(get(r, ["DK Sal", "dk_sal", "Salary"])),
  dkProj: num(get(r, ["DK Proj", "dk_proj", "Proj"])),
  dkVal: num(get(r, ["DK Val", "dk_val", "Value"])),
  dkOwn: get(r, ["DK pOWN%", "dk_pown", "pOWN"]),
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

/* ---------------------------- small table UI --------------------------- */

function Block({ title, children }) {
  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="px-3 py-2 font-bold">{title}</div>
      {children}
    </div>
  );
}

const th = "px-2 py-1 text-center font-semibold text-[11px]";
const td = "px-2 py-1 text-center text-[12px]";

function HeadRow({ cols }) {
  return (
    <thead className="bg-gray-100 sticky top-0">
      <tr>
        {cols.map((c) => (
          <th key={c} className={th}>
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function TeamCell({ team }) {
  const abv = String(team || "").toUpperCase();
  return (
    <div className="flex items-center justify-center gap-1">
      <img
        src={teamLogo(abv)}
        alt=""
        className="w-4 h-4"
        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
      />
      <span className="font-medium">{abv}</span>
    </div>
  );
}

/* -------------------------------- page -------------------------------- */
export default function MlbCheatSheet() {
  const pitchers = useJson(PITCHERS_URL);
  const batters = useJson(BATTERS_URL);
  const stacks = useJson(STACKS_URL);

  /* Build ranked lists */
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

  const ofTop = byPos("OF", 3, 0);
  const ofNext = byPos("OF", 3, 3);

  const cTop = byPos("C", 3);
  const b1Top = byPos("1B", 3);
  const b2Top = byPos("2B", 3);
  const b3Top = byPos("3B", 3);
  const ssTop = byPos("SS", 3);

  // Cash Core: top P + two best value bats
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

  const smallCols = ["Player", "Salary", "Team", "Matchup", "Vegas", "Time", "Proj", "Value"];
  const smallRow = (r, showOwn = true) => (
    <>
      <td className={`${td} text-left`}>
        <div className="flex items-center gap-2">
          <TeamCell team={r.team} />
          <div className="truncate">{r.player}</div>
        </div>
        {showOwn ? <div className="text-[11px] text-gray-500">{fmtPct1(r.dkOwn)}</div> : null}
      </td>
      <td className={`${td} tabular-nums`}>{fmtMoney0(r.dkSal)}</td>
      <td className={td}>{String(r.team || "").toUpperCase()}</td>
      <td className={td}>{String(r.opp || "")}</td>
      <td className={td}>{fmt1(r.vegas)}</td>
      <td className={td}>{time12(r.time)}</td>
      <td className={`${td} tabular-nums`}>{fmt1(r.dkProj)}</td>
      <td className={`${td} tabular-nums`}>{fmt1(r.dkVal)}</td>
    </>
  );

  return (
    <div className="px-4 md:px-6 py-5">
      {/* Yellow merged header bar — centered */}
      <div className="w-full rounded-xl bg-yellow-300 text-black font-extrabold text-xl md:text-2xl px-4 py-2 mb-4 shadow-sm text-center">
        Cheat Sheet
      </div>

      {err ? (
        <div className="text-red-600 font-semibold mb-3">Failed to load: {err}</div>
      ) : null}

      {loading ? (
        <div className="text-gray-600">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT COLUMN */}
          <div className="flex flex-col gap-4">
            <Block title="Pitcher">
              <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
                <HeadRow cols={[...smallCols, ""] /* keep width like stacks by adding dummy */} />
                <tbody>
                  {pRows.map((r, i) => (
                    <tr key={`${r.player}-${i}`} className="odd:bg-white even:bg-gray-50 align-middle">
                      {smallRow(r)}
                      <td className={td} /> {/* dummy for consistent width */}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>

            <Block title="C">
              <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
                <HeadRow cols={smallCols} />
                <tbody>
                  {cTop.map((r, i) => (
                    <tr key={`${r.player}-c-${i}`} className="odd:bg-white even:bg-gray-50">
                      {smallRow(r)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>

            <Block title="1B">
              <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
                <HeadRow cols={smallCols} />
                <tbody>
                  {b1Top.map((r, i) => (
                    <tr key={`${r.player}-1b-${i}`} className="odd:bg-white even:bg-gray-50">
                      {smallRow(r)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>

            <Block title="2B">
              <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
                <HeadRow cols={smallCols} />
                <tbody>
                  {b2Top.map((r, i) => (
                    <tr key={`${r.player}-2b-${i}`} className="odd:bg-white even:bg-gray-50">
                      {smallRow(r)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>

            <Block title="3B">
              <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
                <HeadRow cols={smallCols} />
                <tbody>
                  {b3Top.map((r, i) => (
                    <tr key={`${r.player}-3b-${i}`} className="odd:bg-white even:bg-gray-50">
                      {smallRow(r)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>

            <Block title="SS">
              <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
                <HeadRow cols={smallCols} />
                <tbody>
                  {ssTop.map((r, i) => (
                    <tr key={`${r.player}-ss-${i}`} className="odd:bg-white even:bg-gray-50">
                      {smallRow(r)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>
          </div>

          {/* RIGHT COLUMN */}
          <div className="flex flex-col gap-4">
            <Block title="OF">
              <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
                <HeadRow cols={smallCols} />
                <tbody>
                  {ofTop.map((r, i) => (
                    <tr key={`${r.player}-of1-${i}`} className="odd:bg-white even:bg-gray-50">
                      {smallRow(r)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>

            <Block title="OF">
              <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
                <HeadRow cols={smallCols} />
                <tbody>
                  {ofNext.map((r, i) => (
                    <tr key={`${r.player}-of2-${i}`} className="odd:bg-white even:bg-gray-50">
                      {smallRow(r)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>

            <Block title="Cash Core">
              <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
                <HeadRow cols={smallCols} />
                <tbody>
                  {cashP ? (
                    <tr className="odd:bg-white even:bg-gray-50">{smallRow(cashP)}</tr>
                  ) : null}
                  {coreBats.map((r, i) => (
                    <tr key={`${r.player}-core-${i}`} className="odd:bg-white even:bg-gray-50">
                      {smallRow(r)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>

            <Block title="Top Stacks">
              <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
                <HeadRow cols={["Team", "Salary", "Opp", "Opp Pitcher", "Vegas", "Time", "Proj", "Value", "pOWN"]} />
                <tbody>
                  {sRows.map((r, i) => (
                    <tr key={`${r.team}-${i}`} className="odd:bg-white even:bg-gray-50">
                      <td className={td}>
                        <TeamCell team={r.team} />
                      </td>
                      <td className={`${td} tabular-nums`}>{fmtMoney0(r.dkSal)}</td>
                      <td className={td}>{String(r.opp || "")}</td>
                      <td className={`${td} text-left`}>{r.oppPitcher || ""}</td>
                      <td className={td}>{fmt1(r.vegas)}</td>
                      <td className={td}>{time12(r.time)}</td>
                      <td className={`${td} tabular-nums`}>{fmt1(r.dkProj)}</td>
                      <td className={`${td} tabular-nums`}>{fmt1(r.dkVal)}</td>
                      <td className={td}>{fmtPct1(r.dkOwn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>
          </div>
        </div>
      )}
    </div>
  );
}
