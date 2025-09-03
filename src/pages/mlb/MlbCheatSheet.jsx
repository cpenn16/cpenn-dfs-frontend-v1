// src/pages/mlb/MlbCheatSheet.jsx
import React, { useEffect, useState } from "react";

/* ------------------------------- config ------------------------------- */
const CHEAT_URL =
  import.meta.env?.VITE_MLB_CHEAT_SHEET_URL || "/data/mlb/latest/cheat_sheet.json";

/* ------------------------------ helpers ------------------------------- */
const teamLogo = (abv) => `/logos/mlb/${String(abv || "").toUpperCase()}.png`;

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
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return s;
  let hh = Number(m[1]), mm = m[2], ampm = "AM";
  if (hh === 0) hh = 12;
  else if (hh === 12) ampm = "PM";
  else if (hh > 12) { hh -= 12; ampm = "PM"; }
  return `${hh}:${mm}:00 ${ampm}`;
};

function useJson(url) {
  const [data, setData] = useState({});
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
        if (alive) setData(j || {});
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

// tighter paddings + small fonts
const th = "px-2 py-1 text-center font-semibold text-[10px] uppercase tracking-wide text-gray-700 whitespace-nowrap";
const td = "px-2 py-1 text-center text-[12px] whitespace-nowrap align-middle";

function HeadRow({ cols }) {
  return (
    <thead className="bg-gray-100 sticky top-0">
      <tr>
        {cols.map((c) => (
          <th key={c} className={th}>{c}</th>
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
      <span className="font-medium text-[12px]">{abv}</span>
    </div>
  );
}

/* -------------------------------- page -------------------------------- */
export default function MlbCheatSheet() {
  const { data: cheat, err, loading } = useJson(CHEAT_URL);

  const getSec = (k) => (Array.isArray(cheat?.[k]) ? cheat[k] : []);

  // keep original columns (including Team & pOWN column)
  const colsPlayer = ["Player", "Salary", "Team", "Opp", "Vegas", "Time", "Proj", "Value", "pOWN"];
  const colsStacks = ["Team", "Salary", "Opp", "Opp Pitcher", "Vegas", "Time", "Proj", "Value", "pOWN"];

  const renderPlayerRow = (r) => (
    <>
      {/* Player with logo + keep inline pOWN under name (unchanged) */}
      <td className={`${td} text-left`}>
        <div className="flex items-center gap-2">
          <TeamCell team={r.Team} />
          <div className="truncate">{r.Player}</div>
        </div>
        {r.pOWN ? (
          <div className="text-[11px] text-gray-500 leading-tight">{fmtPct1(r.pOWN)}</div>
        ) : null}
      </td>

      <td className={`${td} tabular-nums`}>{fmt0(r.Salary)}</td>
      <td className={td}>{String(r.Team || "").toUpperCase()}</td>
      <td className={td}>{String(r.Opp ?? r.Matchup ?? "")}</td>
      <td className={`${td} tabular-nums`}>{fmt1(r.Vegas ?? r["Imp. Total"] ?? r["Imp Total"])}</td>
      <td className={td}>{time12(r.Time)}</td>
      <td className={`${td} tabular-nums`}>{fmt1(r.Proj ?? r["Proj "] ?? r["DK Proj"])}</td>
      <td className={`${td} tabular-nums`}>{fmt1(r.Value ?? r["DK Val"])}</td>
      <td className={td}>{fmtPct1(r.pOWN || r["DK pOWN%"])}</td>
    </>
  );

  const renderStackRow = (r) => (
    <>
      <td className={td}><TeamCell team={r.Team} /></td>
      <td className={`${td} tabular-nums`}>{fmt0(r.Salary ?? r["DK Sal"])}</td>
      <td className={td}>{String(r.Opp || r["Opp "] || "").toUpperCase()}</td>
      <td className={`${td} text-left`}>{r["Opp Pitcher"] || ""}</td>
      <td className={`${td} tabular-nums`}>{fmt1(r.Vegas ?? r["Imp. Tot"] ?? r["Imp. Total"])}</td>
      <td className={td}>{time12(r.Time)}</td>
      <td className={`${td} tabular-nums`}>{fmt1(r.Proj ?? r["DK Proj"])}</td>
      <td className={`${td} tabular-nums`}>{fmt1(r.Value ?? r["DK Val"])}</td>
      <td className={td}>{fmtPct1(r.pOWN || r["DK pOWN%"])}</td>
    </>
  );

  return (
    <div className="px-3 md:px-5 py-4">
      {/* Yellow header bar */}
      <div className="w-full rounded-xl bg-yellow-300 text-black font-extrabold text-xl md:text-2xl px-4 py-2 mb-3 shadow-sm text-center">
        Cheat Sheet
      </div>

      {err ? <div className="text-red-600 font-semibold mb-3">Failed to load: {err}</div> : null}

      {loading ? (
        <div className="text-gray-600">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* LEFT COLUMN */}
          <div className="flex flex-col gap-3">
            {["Pitcher", "C", "1B", "2B", "3B", "SS"].map((sec) => (
              <Block key={sec} title={sec}>
                <table className="w-full border-separate text-sm" style={{ borderSpacing: 0 }}>
                  <HeadRow cols={colsPlayer} />
                  <tbody>
                    {getSec(sec).map((r, i) => (
                      <tr key={`${sec}-${i}`} className="odd:bg-white even:bg-gray-50">
                        {renderPlayerRow(r)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Block>
            ))}
          </div>

          {/* RIGHT COLUMN */}
          <div className="flex flex-col gap-3">
            <Block title="OF">
              <table className="w-full border-separate text-sm" style={{ borderSpacing: 0 }}>
                <HeadRow cols={colsPlayer} />
                <tbody>
                  {getSec("OF").map((r, i) => (
                    <tr key={`OF-${i}`} className="odd:bg-white even:bg-gray-50">
                      {renderPlayerRow(r)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>

            <Block title="Cash Core">
              <table className="w-full border-separate text-sm" style={{ borderSpacing: 0 }}>
                <HeadRow cols={colsPlayer} />
                <tbody>
                  {getSec("Cash Core").map((r, i) => (
                    <tr key={`Core-${i}`} className="odd:bg-white even:bg-gray-50">
                      {renderPlayerRow(r)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>

            <Block title="Top Stacks">
              <table className="w-full border-separate text-sm" style={{ borderSpacing: 0 }}>
                <HeadRow cols={colsStacks} />
                <tbody>
                  {getSec("Top Stacks").map((r, i) => (
                    <tr key={`Stack-${i}`} className="odd:bg-white even:bg-gray-50">
                      {renderStackRow(r)}
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
