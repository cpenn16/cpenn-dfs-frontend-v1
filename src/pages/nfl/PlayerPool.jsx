// src/pages/nfl/PlayerPool.jsx
import React, { useEffect, useMemo, useState } from "react";

/* ------------------------------- config ------------------------------- */
const PLAYER_POOL_URL =
  import.meta.env?.VITE_NFL_PLAYER_POOL_URL ||
  "/data/nfl/classic/latest/player_pool.json";

const META_URL =
  import.meta.env?.VITE_NFL_META_URL ||
  "/data/nfl/classic/latest/meta.json";

/* ------------------------------ helpers ------------------------------- */
const teamLogo = (abv) => `/logos/nfl/${String(abv || "").toUpperCase()}.png`;

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
  const m = s.match(/^(\d{1,2})\s*:\s*(\d{2})$/);
  if (!m) return s;
  let hh = Number(m[1]), mm = m[2], ampm = "AM";
  if (hh === 0) hh = 12;
  else if (hh === 12) ampm = "PM";
  else if (hh > 12) { hh -= 12; ampm = "PM"; }
  return `${hh}:${mm} ${ampm}`;
};
const getAny = (obj, keys = []) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
};

function useJson(url, initial = null) {
  const [data, setData] = useState(initial);
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
        if (alive) setData(j ?? initial);
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

/* ---------------------------- compact table UI ------------------------ */
function Block({ title, children }) {
  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="px-3 py-2 font-semibold text-sm bg-gray-50">{title}</div>
      {children}
    </div>
  );
}

const th = "px-2 py-1 text-center font-semibold text-[10px] uppercase tracking-wide text-gray-700 whitespace-nowrap";
const td = "px-2 py-1 text-center text-[12px] whitespace-nowrap align-middle";

function HeadRow({ cols }) {
  return (
    <thead className="bg-gray-100 sticky top-0">
      <tr>{cols.map((c) => <th key={c} className={th}>{c}</th>)}</tr>
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
      <span className="font-medium text-[12px]">{abv}</span>
    </div>
  );
}

/* ----------------------------- main component ------------------------- */
export default function PlayerPool() {
  const { data: pool, err, loading } = useJson(PLAYER_POOL_URL, {});
  const { data: meta } = useJson(META_URL, null);

  // Support both shapes: {tables:[{label,columns,rows}]} and {"QB":[...],...}
  const tablesByLabel = useMemo(() => {
    if (!pool) return {};
    if (Array.isArray(pool.tables)) {
      const map = {};
      for (const t of pool.tables) {
        const label = String(t?.label || "").trim();
        if (!label) continue;
        map[label] = { columns: t.columns || [], rows: Array.isArray(t.rows) ? t.rows : [] };
      }
      return map;
    }
    // object keyed by section
    const map = {};
    for (const [k, rows] of Object.entries(pool || {})) {
      if (Array.isArray(rows)) {
        map[k] = { columns: [], rows };
      }
    }
    return map;
  }, [pool]);

  const wantSectionsLeft  = ["QB", "RB", "WR"];
  const wantSectionsRight = ["TE", "DST", "Cash Core"];

  const colsPlayer = ["Player", "Salary", "Team", "Opp", "Time", "Proj", "Value", "pOWN"];
  const colsDST    = ["Team",   "Salary",          "Opp", "Time", "Proj", "Value", "pOWN"];

  const renderPlayerRow = (r) => {
    const player = getAny(r, ["Player", "Name", "QB", "RB", "WR", "TE"]);
    const team   = String(getAny(r, ["Team", "Tm", "TeamAbbrev", "team"])).toUpperCase();
    const opp    = getAny(r, ["Opp", "Matchup"]);
    const salary = getAny(r, ["Salary", "DK Sal", "FD Sal"]);
    const time   = getAny(r, ["Time", "Time ET", "Kickoff", "Start Time"]);
    const proj   = getAny(r, ["Proj", "DK Proj", "FD Proj"]);
    const val    = getAny(r, ["Value", "DK Val", "FD Val"]);
    const pown   = getAny(r, ["pOWN", "DK pOWN%", "FD pOWN%"]);

    return (
      <>
        <td className={`${td} text-left`}>
          <div className="flex items-center gap-2">
            <TeamCell team={team} />
            <div className="truncate">{player}</div>
          </div>
          {pown ? (
            <div className="text-[11px] text-gray-500 leading-tight">{fmtPct1(pown)}</div>
          ) : null}
        </td>
        <td className={`${td} tabular-nums`}>{fmt0(salary)}</td>
        <td className={td}>{team}</td>
        <td className={td}>{String(opp || "").toUpperCase()}</td>
        <td className={td}>{time12(time)}</td>
        <td className={`${td} tabular-nums`}>{fmt1(proj)}</td>
        <td className={`${td} tabular-nums`}>{fmt1(val)}</td>
        <td className={td}>{fmtPct1(pown)}</td>
      </>
    );
  };

  const renderDstRow = (r) => {
    const team   = String(getAny(r, ["Team", "DST", "Defense", "Tm", "TeamAbbrev"])).toUpperCase();
    const opp    = getAny(r, ["Opp", "Matchup"]);
    const salary = getAny(r, ["Salary", "DK Sal", "FD Sal"]);
    const time   = getAny(r, ["Time", "Time ET", "Kickoff", "Start Time"]);
    const proj   = getAny(r, ["Proj", "DK Proj", "FD Proj"]);
    const val    = getAny(r, ["Value", "DK Val", "FD Val"]);
    const pown   = getAny(r, ["pOWN", "DK pOWN%", "FD pOWN%"]);

    return (
      <>
        <td className={td}><TeamCell team={team} /></td>
        <td className={`${td} tabular-nums`}>{fmt0(salary)}</td>
        <td className={td}>{String(opp || "").toUpperCase()}</td>
        <td className={td}>{time12(time)}</td>
        <td className={`${td} tabular-nums`}>{fmt1(proj)}</td>
        <td className={`${td} tabular-nums`}>{fmt1(val)}</td>
        <td className={td}>{fmtPct1(pown)}</td>
      </>
    );
  };

  const Section = ({ label }) => {
    const t = tablesByLabel[label] || { columns: [], rows: [] };
    const rows = Array.isArray(t.rows) ? t.rows : [];

    // choose columns per section for consistency
    const cols = label === "DST" ? colsDST : colsPlayer;
    const rowRenderer = label === "DST" ? renderDstRow : renderPlayerRow;

    return (
      <Block title={label}>
        <table className="w-full border-separate text-sm" style={{ borderSpacing: 0 }}>
          <HeadRow cols={cols} />
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${label}-${i}`} className="odd:bg-white even:bg-gray-50">
                {rowRenderer(r)}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="text-center text-xs text-gray-500 py-3">
                  No rows.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Block>
    );
  };

  const updatedText = useMemo(() => {
    const ts = meta?.last_updated || meta?.updated_iso;
    if (!ts) return "";
    try {
      const d = new Date(ts);
      return isNaN(d.getTime()) ? ts : d.toLocaleString();
    } catch {
      return String(ts);
    }
  }, [meta]);

  return (
    <div className="px-3 md:px-5 py-4">
      {/* Header */}
      <div className="w-full rounded-xl bg-yellow-300 text-black font-extrabold text-xl md:text-2xl px-4 py-2 mb-3 shadow-sm flex items-center justify-between">
        <span>Player Pool</span>
        {updatedText ? (
          <span className="text-xs md:text-sm font-semibold text-black/80">
            Updated: {updatedText}
          </span>
        ) : null}
      </div>

      {err ? <div className="text-red-600 font-semibold mb-3">Failed to load: {err}</div> : null}

      {loading ? (
        <div className="text-gray-600">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* LEFT COLUMN */}
          <div className="flex flex-col gap-3">
            {wantSectionsLeft.map((sec) => (
              <Section key={sec} label={sec} />
            ))}
          </div>

          {/* RIGHT COLUMN */}
          <div className="flex flex-col gap-3">
            {wantSectionsRight.map((sec) => (
              <Section key={sec} label={sec} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
