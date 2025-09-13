// src/pages/nfl/PlayerPool.jsx
import React, { useEffect, useState } from "react";

/* ------------------------------- data urls ------------------------------ */
const POOL_URL = "/data/nfl/classic/latest/player_pool.json";
const META_URL = "/data/nfl/classic/latest/meta.json";

/* -------------------------------- utils --------------------------------- */
const teamLogo = (abv) => `/logos/nfl/${String(abv || "").toUpperCase()}.png`;

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[,$%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const fmt0 = (v) => {
  const n = num(v);
  return n == null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 0 });
};
const fmt1 = (v) => {
  const n = num(v);
  return n == null ? "—" : n.toFixed(1);
};
const fmtPct1 = (v) => {
  if (v == null || v === "") return "—";
  let s = String(v).trim();
  if (s.endsWith("%")) {
    const n = num(s.slice(0, -1));
    return n == null ? "—" : `${n.toFixed(1)}%`;
  }
  let n = num(s);
  if (n == null) return "—";
  if (Math.abs(n) <= 1) n *= 100;
  return `${n.toFixed(1)}%`;
};
const time12 = (v) => {
  if (!v) return "—";
  const s = String(v).trim();
  if (/\d{1,2}:\d{2}(:\d{2})?\s?[AP]M/i.test(s)) return s.toUpperCase();
  const m = s.match(/^(\d{1,2})\s*:\s*(\d{2})\s*([AP])?M?$/i);
  if (!m) return s;
  let hh = Number(m[1]), mm = m[2], ampm = (m[3] || "A").toUpperCase() === "A" ? "AM" : "PM";
  if (hh === 0) hh = 12;
  else if (hh === 12) ampm = "PM";
  else if (hh > 12) { hh -= 12; ampm = "PM"; }
  return `${hh}:${mm} ${ampm}`;
};

function useJson(url) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        const r = await fetch(`${url}?_=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (alive) setData(j);
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

/* ------------------------------- tiny UI -------------------------------- */
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

/* -------------------------------- page ---------------------------------- */
export default function PlayerPool() {
  const { data: pool, err, loading } = useJson(POOL_URL);
  const { data: meta } = useJson(META_URL);

  const byLabel = (label) => {
    const tbl = pool?.tables?.find((t) => (t?.label || "").trim().toLowerCase() === label.toLowerCase());
    return Array.isArray(tbl?.rows) ? tbl.rows : [];
  };

  const cols = ["Player","Salary","Team","Opp","O/U","Imp. Total","Time","Proj","Value","pOWN","Cash/GPP/Both"];

  const renderRow = (r) => (
    <>
      <td className={`${td} text-left`}>
        <div className="flex items-center gap-2">
          <TeamCell team={r.Team} />
          <div className="truncate">{r.Player || r.QB || r.RB || r.WR || r.TE || "—"}</div>
        </div>
      </td>
      <td className={`${td} tabular-nums`}>{fmt0(r.Salary)}</td>
      <td className={td}>{String(r.Team || "").toUpperCase()}</td>
      <td className={td}>{String(r.Opp || "").toUpperCase()}</td>
      <td className={`${td} tabular-nums`}>{fmt1(r["O/U"])}</td>
      <td className={`${td} tabular-nums`}>{fmt1(r["Imp. Total"] ?? r["Imp Total"])}</td>
      <td className={td}>{time12(r.Time || r.time)}</td>
      <td className={`${td} tabular-nums`}>{fmt1(r.Proj ?? r.Projection ?? r["DK Proj"])}</td>
      <td className={`${td} tabular-nums`}>{fmt1(r.Value ?? r["DK Val"])}</td>
      <td className={td}>{fmtPct1(r.pOWN || r["pOWN"] || r["DK pOWN%"])}</td>
      <td className={td}>{(r["Cash/GPP/Both"] || r.Role || "—")}</td>
    </>
  );

  const sectionsLeft  = ["QB","RB","WR"];
  const sectionsRight = ["TE","DST","Cash Core"];

  return (
    <div className="px-3 md:px-5 py-4">
      <div className="max-w-7xl mx-auto">
        {/* header bar */}
        <div className="w-full rounded-xl bg-yellow-300 text-black font-extrabold text-xl md:text-2xl px-4 py-2 mb-3 shadow-sm flex items-center justify-between">
          <span>Player Pool</span>
          <span className="text-[12px] font-semibold">
            {meta?.last_updated ? `Updated: ${new Date(meta.last_updated).toLocaleString()}` : ""}
          </span>
        </div>

        {err ? <div className="text-red-600 font-semibold mb-3">Failed to load: {err}</div> : null}

        {loading ? (
          <div className="text-gray-600">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* LEFT */}
            <div className="flex flex-col gap-3">
              {sectionsLeft.map((sec) => (
                <Block key={sec} title={sec}>
                  <table className="w-full border-separate text-sm" style={{ borderSpacing: 0 }}>
                    <HeadRow cols={cols} />
                    <tbody>
                      {byLabel(sec).map((r, i) => (
                        <tr key={`${sec}-${i}`} className="odd:bg-white even:bg-gray-50">
                          {renderRow(r)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Block>
              ))}
            </div>

            {/* RIGHT */}
            <div className="flex flex-col gap-3">
              {sectionsRight.map((sec) => (
                <Block key={sec} title={sec}>
                  <table className="w-full border-separate text-sm" style={{ borderSpacing: 0 }}>
                    <HeadRow cols={cols} />
                    <tbody>
                      {byLabel(sec).map((r, i) => (
                        <tr key={`${sec}-${i}`} className="odd:bg-white even:bg-gray-50">
                          {renderRow(r)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Block>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
