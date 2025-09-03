// src/pages/mlb/MlbCheatSheet.jsx
import React, { useEffect, useMemo, useState } from "react";

/* ------------------------------- config ------------------------------- */
const CHEAT_URL = "/data/mlb/latest/cheat_sheet.json";
const teamLogo = (abv) => `/logos/mlb/${String(abv || "").toUpperCase()}.png`;

/* ------------------------------ helpers ------------------------------- */
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ""); // case & punctuation insensitive

// find a column by any of these aliases (first hit wins)
function findCol(columns, aliases) {
  const want = (Array.isArray(aliases) ? aliases : [aliases]).map(norm);
  for (let i = 0; i < columns.length; i++) {
    const c = norm(columns[i]);
    if (want.includes(c)) return columns[i];
  }
  return null;
}

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

/* ------------------------------ data hook ------------------------------ */
function useCheat(url) {
  const [sections, setSections] = useState([]);
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
        const arr = Array.isArray(j?.sections) ? j.sections : [];
        if (alive) setSections(arr);
      } catch (e) {
        if (alive) setErr(String(e.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => (alive = false);
  }, [url]);
  return { sections, err, loading };
}

/* ----------------------------- layout atoms ---------------------------- */
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
    <thead className="bg-gray-100">
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

/* ---------------------------- row renderers ---------------------------- */
// Generic player row with (Player, Salary, Team, Matchup, Vegas, Time, Proj, Value, pOWN)
function PlayerRows({ columns, rows }) {
  // locate columns robustly
  const C = {
    player: findCol(columns, "player"),
    salary: findCol(columns, ["salary", "dk sal", "dk_sal", "dksal"]),
    team: findCol(columns, "team"),
    matchup: findCol(columns, "matchup"),
    vegas: findCol(columns, ["vegas", "imp total", "imp. total", "total", "v"]),
    time: findCol(columns, "time"),
    proj: findCol(columns, ["proj", "dk proj", "projection"]),
    value: findCol(columns, ["value", "dk val"]),
    pown: findCol(columns, ["pown", "dk pown%", "dk pown"]),
  };

  const cols = ["Player", "Salary", "Team", "Matchup", "Vegas", "Time", "Proj", "Value", "pOWN"];

  return (
    <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
      <HeadRow cols={cols} />
      <tbody>
        {rows.map((r, i) => {
          const player = r[C.player];
          const sal = r[C.salary];
          const team = r[C.team];
          const opp = r[C.matchup];
          const vegas = r[C.vegas];
          const t = r[C.time];
          const proj = r[C.proj];
          const val = r[C.value];
          const pown = r[C.pown];

          return (
            <tr key={i} className="odd:bg-white even:bg-gray-50">
              <td className={`${td} text-left`}>
                <div className="flex items-center gap-2">
                  <TeamCell team={team} />
                  <div className="truncate">{player ?? ""}</div>
                </div>
                <div className="text-[11px] text-gray-500">{fmtPct1(pown)}</div>
              </td>
              <td className={`${td} tabular-nums`}>{fmtMoney0(sal)}</td>
              <td className={td}>{String(team || "").toUpperCase()}</td>
              <td className={td}>{String(opp || "")}</td>
              <td className={td}>{fmt1(vegas)}</td>
              <td className={td}>{time12(t)}</td>
              <td className={`${td} tabular-nums`}>{fmt1(proj)}</td>
              <td className={`${td} tabular-nums`}>{fmt1(val)}</td>
              <td className={td}>{fmtPct1(pown)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Top Stacks row renderer (Team, Salary, Opp, Opp Pitcher, Vegas, Time, Proj, Value, pOWN)
function StackRows({ columns, rows }) {
  const C = {
    team: findCol(columns, "team"),
    salary: findCol(columns, ["salary", "dk sal", "dk_sal"]),
    opp: findCol(columns, ["opp", "opponent"]),
    oppPitcher: findCol(columns, ["opp pitcher", "opppitcher"]),
    vegas: findCol(columns, ["vegas", "v", "total", "imp. total"]),
    time: findCol(columns, "time"),
    proj: findCol(columns, ["proj", "projection"]),
    value: findCol(columns, ["value", "dk val"]),
    pown: findCol(columns, ["pown", "dk pown%", "dk pown"]),
  };

  const cols = ["Team", "Salary", "Opp", "Opp Pitcher", "Vegas", "Time", "Proj", "Value", "pOWN"];

  return (
    <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
      <HeadRow cols={cols} />
      <tbody>
        {rows.map((r, i) => {
          const team = r[C.team];
          return (
            <tr key={i} className="odd:bg-white even:bg-gray-50">
              <td className={td}>
                <TeamCell team={team} />
              </td>
              {/* Salary with NO decimals */}
              <td className={`${td} tabular-nums`}>{fmtMoney0(r[C.salary])}</td>
              <td className={td}>{String(r[C.opp] || "")}</td>
              <td className={`${td} text-left`}>{r[C.oppPitcher] ?? ""}</td>
              <td className={td}>{fmt1(r[C.vegas])}</td>
              <td className={td}>{time12(r[C.time])}</td>
              <td className={`${td} tabular-nums`}>{fmt1(r[C.proj])}</td>
              <td className={`${td} tabular-nums`}>{fmt1(r[C.value])}</td>
              <td className={td}>{fmtPct1(r[C.pown])}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* -------------------------------- page -------------------------------- */
export default function MlbCheatSheet() {
  const { sections, err, loading } = useCheat(CHEAT_URL);

  const getSec = (name) => sections.find((s) => String(s.section || "").toLowerCase() === name.toLowerCase()) || { columns: [], rows: [] };

  // The sheet already picked the rows. We just render them.
  const S = {
    Pitcher: getSec("Pitcher"),
    C: getSec("C"),
    B1: getSec("1B"),
    B2: getSec("2B"),
    B3: getSec("3B"),
    SS: getSec("SS"),
    OF: getSec("OF"),
    Cash: getSec("Cash Core"),
    Stacks: getSec("Top Stacks"),
  };

  // Split OF into two blocks of 3 like your layout (handles >= 6 gracefully)
  const of1 = { columns: S.OF.columns, rows: (S.OF.rows || []).slice(0, 3) };
  const of2 = { columns: S.OF.columns, rows: (S.OF.rows || []).slice(3, 6) };

  return (
    <div className="px-4 md:px-6 py-5">
      {/* Centered yellow header */}
      <div className="w-full rounded-xl bg-yellow-300 text-black font-extrabold text-xl md:text-2xl px-4 py-2 mb-4 shadow-sm text-center">
        Cheat Sheet
      </div>

      {err ? <div className="text-red-600 font-semibold mb-3">Failed to load: {err}</div> : null}
      {loading ? <div className="text-gray-600">Loading…</div> : null}

      {!loading && !err ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* LEFT COLUMN */}
          <div className="flex flex-col gap-4">
            <Block title="Pitcher">
              <PlayerRows columns={S.Pitcher.columns} rows={S.Pitcher.rows} />
            </Block>

            <Block title="C">
              <PlayerRows columns={S.C.columns} rows={S.C.rows} />
            </Block>

            <Block title="1B">
              <PlayerRows columns={S.B1.columns} rows={S.B1.rows} />
            </Block>

            <Block title="2B">
              <PlayerRows columns={S.B2.columns} rows={S.B2.rows} />
            </Block>

            <Block title="3B">
              <PlayerRows columns={S.B3.columns} rows={S.B3.rows} />
            </Block>

            <Block title="SS">
              <PlayerRows columns={S.SS.columns} rows={S.SS.rows} />
            </Block>
          </div>

          {/* RIGHT COLUMN */}
          <div className="flex flex-col gap-4">
            <Block title="OF">
              <PlayerRows columns={of1.columns} rows={of1.rows} />
            </Block>

            <Block title="OF">
              <PlayerRows columns={of2.columns} rows={of2.rows} />
            </Block>

            <Block title="Cash Core">
              <PlayerRows columns={S.Cash.columns} rows={S.Cash.rows} />
            </Block>

            <Block title="Top Stacks">
              <StackRows columns={S.Stacks.columns} rows={S.Stacks.rows} />
            </Block>
          </div>
        </div>
      ) : null}
    </div>
  );
}
