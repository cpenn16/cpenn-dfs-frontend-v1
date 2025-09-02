// src/pages/nfl/NflPosProjectionsShowdown.jsx
import React, { useEffect, useMemo, useState } from "react";

/**
 * Position projections (Showdown): QB / RB / WR / TE
 * - Very tolerant header mapping (handles NBSP, case, and variants)
 * - Never silently zeroes when a header is missing
 * - Cleans "%%" → "%"
 * - Sticky 1st column, compact layout
 * - Tries multiple JSON sources (qb_data, qb_projections) and picks the first that exists
 */

const BASE = "/data/nfl/showdown/latest";

// try these in order and use the first that loads
const POS_SOURCES = {
  QB: [`${BASE}/qb_data.json`, `${BASE}/qb_projections.json`],
  RB: [`${BASE}/rb_data.json`, `${BASE}/rb_projections.json`],
  WR: [`${BASE}/wr_data.json`, `${BASE}/wr_projections.json`],
  TE: [`${BASE}/te_data.json`, `${BASE}/te_projections.json`],
};

// simple team logos (png)
const TeamCell = ({ team }) => (
  <div className="flex items-center gap-2">
    <img src={`/logos/nfl/${(team || "").toUpperCase()}.png`} alt={team} className="w-5 h-5" />
    <span>{team}</span>
  </div>
);

// ---------------- helpers ----------------
const NBSP = /\u00A0/g;
const normKey = (s) => String(s ?? "").replace(NBSP, " ").trim();

const pick = (obj, keys) => {
  for (const k of keys) {
    if (k in obj && obj[k] !== "" && obj[k] != null) return obj[k];
  }
  return "";
};

const toNum = (v) => {
  const n = Number(String(v ?? "").replace(/[,$%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const fmt0 = (v) => {
  const n = toNum(v);
  return n == null ? "" : n.toLocaleString();
};
const fmt1 = (v) => {
  const n = toNum(v);
  return n == null ? "" : n.toFixed(1);
};
const fmtPct = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/%$/.test(s)) return s.replace(/%+$/, "%"); // collapse 2%% → %
  const n = toNum(s);
  return n == null ? "" : `${n.toFixed(1)}%`;
};

// fetch first successful JSON from a list of URLs
async function fetchFirst(urls) {
  for (const url of urls) {
    try {
      const r = await fetch(`${url}?_=${Date.now()}`, { cache: "no-store" });
      if (r.ok) return await r.json();
    } catch {
      // continue
    }
  }
  throw new Error("No data source available");
}

function usePosData(pos) {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const raw = await fetchFirst(POS_SOURCES[pos] || []);
        const data = Array.isArray(raw) ? raw : raw?.rows ?? raw?.data ?? [];
        if (alive) setRows(data.map((r) => normalizeRow(r)));
      } catch (e) {
        if (alive) setErr(String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [pos]);

  return { rows, err, loading };
}

// tolerant normalization of one row
function normalizeRow(r) {
  // map keys (strip NBSP and collapse variants)
  const map = {};
  for (const [k, v] of Object.entries(r)) map[normKey(k)] = v;

  const pos = map["Pos"] ?? map["pos"] ?? "";
  const player = map["Player"] ?? map["player"] ?? "";
  const team = map["Team"] ?? map["team"] ?? "";
  const opp  = map["Opp"] ?? map["opp"] ?? map["OPP"] ?? "";

  // DK/FD salary & projections (some files include only site totals)
  const dk_sal = pick(map, ["DK Sal", "dk_sal"]);
  const fd_sal = pick(map, ["FD Sal", "fd_sal"]);

  const dk_proj = pick(map, ["DK Proj", "dk_proj"]);
  const dk_val  = pick(map, ["DK Val", "dk_val"]);
  const fd_proj = pick(map, ["FD Proj", "fd_proj"]);
  const fd_val  = pick(map, ["FD Val", "fd_val"]);

  // QB stats
  const pa_yards = pick(map, ["Pa Yards", "pa_yards"]);
  const pa_att   = pick(map, ["Pa Att", "pa_att"]);
  const pa_comp  = pick(map, ["Pa Comp", "pa_comp"]);
  const comp_pct = pick(map, ["Comp%", "pa_comp_pct", "Comp %"]);
  const pa_td    = pick(map, ["Pa TD", "pa_td"]);
  const ints     = pick(map, ["INT", "int"]);

  // rushing (common across positions)
  const ru_att   = pick(map, ["Ru Att", "ru_att", "Ru Attempts", "ru attempts"]);
  const ypc      = pick(map, ["YPC", "ypc"]);
  const ru_yds   = pick(map, ["Ru Yds", "ru_yards", "Ru Yards"]);
  const ru_td    = pick(map, ["Ru TD", "ru_td"]);

  // receiving (RB/WR/TE)
  const targets  = pick(map, ["Targets", "targets"]);
  const tgt_share= pick(map, ["Tgt Share", "tgt_share", "Tgt%", "tgt%"]);
  const rec      = pick(map, ["Rec", "rec"]);
  const rec_yds  = pick(map, ["Rec Yards", "rec_yards"]);
  const rec_td   = pick(map, ["Rec TD", "rec_td"]);

  return {
    player, pos, team, opp,
    dk_sal, fd_sal,
    dk_proj, dk_val, fd_proj, fd_val,

    // qb
    pa_yards, pa_att, pa_comp, comp_pct, pa_td, ints,

    // rushing
    ru_att, ypc, ru_yds, ru_td,

    // receiving
    targets, tgt_share, rec, rec_yds, rec_td,
  };
}

// columns per position
function colsForPos(pos) {
  const commonRight = [
    { key: "dk_proj", label: "DK Proj", type: "num1" },
    { key: "dk_val",  label: "DK Val",  type: "num1" },
    { key: "fd_proj", label: "FD Proj", type: "num1" },
    { key: "fd_val",  label: "FD Val",  type: "num1" },
  ];

  if (pos === "QB") {
    return [
      { key: "player", label: "Player", type: "text", sticky: true },
      { key: "team",   label: "Team",   type: "team" },
      { key: "dk_sal", label: "DK Sal", type: "money" },
      { key: "fd_sal", label: "FD Sal", type: "money" },
      { key: "pa_yards", label: "Pa Yards", type: "num1" },
      { key: "pa_att",   label: "Pa Att",   type: "num1" },
      { key: "pa_comp",  label: "Pa Comp",  type: "num1" },
      { key: "comp_pct", label: "Comp%",    type: "pct"  },
      { key: "pa_td",    label: "Pa TD",    type: "num1" },
      { key: "ints",     label: "INT",      type: "num1" },
      { key: "ru_att", label: "Ru Att", type: "num1" },
      { key: "ypc",    label: "YPC",    type: "num1" },
      { key: "ru_yds", label: "Ru Yds", type: "num1" },
      { key: "ru_td",  label: "Ru TD",  type: "num1" },
      ...commonRight,
    ];
  }

  if (pos === "RB") {
    return [
      { key: "player", label: "Player", type: "text", sticky: true },
      { key: "team",   label: "Team",   type: "team" },
      { key: "dk_sal", label: "DK Sal", type: "money" },
      { key: "fd_sal", label: "FD Sal", type: "money" },
      { key: "ru_att", label: "Ru Attempts", type: "num1" },
      { key: "ypc",    label: "YPC",         type: "num1" },
      { key: "ru_yds", label: "Ru Yards",    type: "num1" },
      { key: "ru_td",  label: "Ru TD",       type: "num1" },
      { key: "targets",  label: "Targets",  type: "num1" },
      { key: "tgt_share",label: "Tgt Share",type: "pct"  },
      { key: "rec",      label: "Rec",      type: "num1" },
      { key: "rec_yds",  label: "Rec Yards",type: "num1" },
      { key: "rec_td",   label: "Rec TD",   type: "num1" },
      ...commonRight,
    ];
  }

  if (pos === "WR") {
    return [
      { key: "player", label: "Player", type: "text", sticky: true },
      { key: "team",   label: "Team",   type: "team" },
      { key: "dk_sal", label: "DK Sal", type: "money" },
      { key: "fd_sal", label: "FD Sal", type: "money" },
      { key: "ru_att", label: "Ru Attempts", type: "num1" },
      { key: "ypc",    label: "YPC",         type: "num1" },
      { key: "ru_yds", label: "Ru Yards",    type: "num1" },
      { key: "ru_td",  label: "Ru TD",       type: "num1" },
      { key: "targets",  label: "Targets",  type: "num1" },
      { key: "tgt_share",label: "Tgt Share",type: "pct"  },
      { key: "rec",      label: "Rec",      type: "num1" },
      { key: "rec_yds",  label: "Rec Yards",type: "num1" },
      { key: "rec_td",   label: "Rec TD",   type: "num1" },
      ...commonRight,
    ];
  }

  // TE
  return [
    { key: "player", label: "Player", type: "text", sticky: true },
    { key: "team",   label: "Team",   type: "team" },
    { key: "dk_sal", label: "DK Sal", type: "money" },
    { key: "fd_sal", label: "FD Sal", type: "money" },
    { key: "targets",  label: "Targets",  type: "num1" },
    { key: "tgt_share",label: "Tgt Share",type: "pct"  },
    { key: "rec",      label: "Rec",      type: "num1" },
    { key: "rec_yds",  label: "Rec Yards",type: "num1" },
    { key: "rec_td",   label: "Rec TD",   type: "num1" },
    ...commonRight,
  ];
}

// -------- main component --------
export default function NflPosProjectionsShowdown({ pos: posProp }) {
  // infer POS from route text if not passed as prop
  const guessPos = () => {
    const p = (posProp || window.location.pathname || "").toUpperCase();
    if (p.includes("/QB")) return "QB";
    if (p.includes("/RB")) return "RB";
    if (p.includes("/WR")) return "WR";
    if (p.includes("/TE")) return "TE";
    return "QB";
  };
  const [pos] = useState(guessPos());

  const { rows, loading, err } = usePosData(pos);
  const [q, setQ] = useState("");

  const columns = useMemo(() => colsForPos(pos), [pos]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      `${r.player} ${r.team}`.toLowerCase().includes(s)
    );
  }, [rows, q]);

  const [sort, setSort] = useState({ key: "dk_proj", dir: "desc" });
  const onSort = (col) =>
    setSort((prev) =>
      prev.key === col.key ? { key: col.key, dir: prev.dir === "desc" ? "asc" : "desc" } : { key: col.key, dir: "desc" }
    );

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const typeFor = (k) => columns.find((c) => c.key === k)?.type;
    return [...filtered].sort((a, b) => {
      const t = typeFor(sort.key);
      const av = t === "text" || t === "team" ? String(a[sort.key] ?? "").toLowerCase() : toNum(a[sort.key]);
      const bv = t === "text" || t === "team" ? String(b[sort.key] ?? "").toLowerCase() : toNum(b[sort.key]);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (t === "text" || t === "team") return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
      return (av - bv) * dir;
    });
  }, [filtered, columns, sort]);

  const title = `NFL — ${pos} Projections`;

  const cell = "px-2 py-1 text-center";
  const header = "px-2 py-2 font-semibold text-center whitespace-nowrap";
  const sticky = "sticky left-0 bg-white [&.even\\:bg-gray-50]:bg-gray-50 z-10";

  return (
    <div className="px-4 md:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h1 className="text-2xl md:text-3xl font-extrabold">{title}</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search player / team…"
          className="px-3 py-2 rounded-lg border w-64"
        />
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-auto">
        <table className="w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`${header} ${c.sticky ? "sticky left-0 z-20" : ""} cursor-pointer select-none`}
                  onClick={() => onSort(c)}
                >
                  <div className="inline-flex items-center gap-1">
                    <span>{c.label}</span>
                    {sort.key === c.key ? (
                      <span className="text-gray-400">{sort.dir === "desc" ? "▼" : "▲"}</span>
                    ) : (
                      <span className="text-gray-300">▲</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className={`${cell}`} colSpan={columns.length}>Loading…</td></tr>
            )}
            {err && (
              <tr><td className={`${cell} text-red-600`} colSpan={columns.length}>Failed to load: {err}</td></tr>
            )}
            {!loading && !err && sorted.map((r, i) => (
              <tr key={`${r.player}-${i}`} className={i % 2 ? "even:bg-gray-50" : "odd:bg-white"}>
                {columns.map((c, j) => {
                  let val = r[c.key];
                  if (c.type === "money") val = fmt0(val);
                  if (c.type === "num1")  val = fmt1(val);
                  if (c.type === "pct")   val = fmtPct(val);

                  const clsBase = c.type === "text" ? "px-2 py-1 text-left whitespace-nowrap" : `${cell} tabular-nums`;
                  const cls = `${clsBase} ${c.sticky ? sticky : ""}`;
                  if (c.type === "team") {
                    return (
                      <td key={j} className={`${cell} ${c.sticky ? sticky : ""}`}>
                        <TeamCell team={r.team} />
                      </td>
                    );
                  }
                  return <td key={j} className={cls}>{val ?? ""}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
