// src/pages/mlb/PitcherData.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/* ============================ CONFIG ============================ */
// JSON path (matches your exporter outfile: pitcher_data.json)
const DATA_URL = "/data/mlb/latest/pitchers_data.json";
const TITLE = "MLB — Pitcher Data";

const LOGO_BASE = "/logos/mlb";
const LOGO_EXT = "png";

/* ============================ HELPERS ============================ */
const norm = (v) => (v == null ? "" : String(v).trim());
const lower = (s) => norm(s).toLowerCase();

const num = (v) => {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  // strip commas, % and spaces
  const clean = s.replace(/[,\s]/g, "").replace(/%$/, "");
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
};

// Percent that accepts "12%", 12, or 0.12 and outputs "12.0%"
function fmtPct1(v) {
  if (v == null || v === "") return "";
  let s = String(v).trim();
  let hadPercent = false;
  if (s.endsWith("%")) {
    hadPercent = true;
    s = s.slice(0, -1);
  }
  let n = num(s);
  if (n == null) return "";
  if (!hadPercent && Math.abs(n) <= 1) n *= 100; // 0.12 -> 12%
  return `${n.toFixed(1)}%`;
}

function fmt1(v) {
  const n = num(v);
  if (n == null) return "";
  return n.toFixed(1).replace(/\.0$/, "");
}

// time → "7:40 PM" style
function time12(s) {
  const v = norm(s);
  if (!v) return "";
  if (/\d{1,2}:\d{2}(:\d{2})?\s?[AP]M/i.test(v)) return v.toUpperCase().replace(/\s+/g, " ");
  const m = v.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return v;
  let hh = Number(m[1]);
  const mm = m[2];
  const ampm = hh >= 12 ? "PM" : "AM";
  hh = ((hh + 11) % 12) + 1;
  return `${hh}:${mm} ${ampm}`;
}

function TeamWithLogo({ code }) {
  const abv = String(code || "").toUpperCase();
  if (!abv) return null;
  const src = `${LOGO_BASE}/${abv}.${LOGO_EXT}`;
  return (
    <span className="inline-flex items-center gap-1">
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <img
        src={src}
        className="h-4 w-4 shrink-0"
        onError={(e) => (e.currentTarget.style.display = "none")}
      />
      <span>{abv}</span>
    </span>
  );
}

/* ===================== DISPLAY ORDER & HEADER BANDS ===================== */
/**
 * We render exactly these labels in this order.
 * Each label lists possible source keys to read from (first match wins).
 * We also prevent reusing the same raw column twice (so Opp vs Pitcher K% don’t collide).
 */
const DISPLAY_COLS = [
  // Player Info
  { label: "Hand",  keys: ["Hand","Throws","Handedness"] },
  { label: "player", keys: ["player","Player","Name"] },
  { label: "DK",    keys: ["DK","DK Sal","DK Salary"] },
  { label: "FD",    keys: ["FD","FD Sal","FD Salary"] },

  // Matchup Info
  { label: "Team",  keys: ["Team","Tm"] },
  { label: "Opp",   keys: ["Opp","OPP","Opponent"] },
  { label: "Park",  keys: ["Park","Ballpark"] },
  { label: "Time",  keys: ["Time","Start","Start Time"] },

  // Vegas
  { label: "Total",  keys: ["Total","O/U","Team Total","TT"] },
  { label: "W%",     keys: ["W%","Win%"] },
  { label: "K",      keys: ["K","Kline","Ks"] },
  { label: "Field",  keys: ["Field","Field%"] },
  { label: "Rating", keys: ["Rating","Rate"] },

  // Opp splits (use Opp K%/BB% when available, otherwise fallback to generic)
  { label: "K% (Opp)",  keys: ["Opp K%","K% (Opp)","K% vs Hand","K% (Team)","K% (Opp Team)","K%"] },
  { label: "BB% (Opp)", keys: ["Opp BB%","BB% (Opp)","BB% vs Hand","BB% (Team)","BB% (Opp Team)","BB%"] },
  { label: "wOBA",      keys: ["wOBA","Opp wOBA"] },
  { label: "ISO",       keys: ["ISO","Opp ISO"] },
  { label: "wRC+",      keys: ["wRC+","Opp wRC+"] },

  // Advanced (pitcher)
  { label: "IP",    keys: ["IP","IP/G"] },
  { label: "Velo",  keys: ["Velo","FB Velo","Velocity"] },
  { label: "xFIP",  keys: ["xFIP","xfip"] },
  { label: "K% (P)",   keys: ["K% (P)","Pitch K%","K%_P","K%"] },
  { label: "SwS%",  keys: ["SwS%","SwStr%"] },
  { label: "BB% (P)",  keys: ["BB% (P)","Pitch BB%","BB%_P","BB%"] },

  // Ratios
  { label: "K/9",  keys: ["K/9","K9"] },
  { label: "BB/9", keys: ["BB/9","BB9"] },
  { label: "HR/9", keys: ["HR/9","HR9"] },

  // Statcast
  { label: "GB%",  keys: ["GB%","GB% (P)"] },
  { label: "FB%",  keys: ["FB%","FB% (P)"] },
  { label: "HH%",  keys: ["HH%","HardHit%","Hard%"] },
  { label: "Bar%", keys: ["Bar%","Barrel%"] },
  { label: "EV",   keys: ["EV","Avg EV","Exit Velo"] }
];

const BANDS = [
  ["PLAYER INFO", ["Hand","player","DK","FD"]],
  ["MATCHUP INFO", ["Team","Opp","Park","Time"]],
  ["VEGAS", ["Total","W%","K","Field","Rating"]],
  ["OPPONENT SPLITS VS HANDEDNESS", ["K% (Opp)","BB% (Opp)","wOBA","ISO","wRC+"]],
  ["ADVANCED STATS", ["IP","Velo","xFIP","K% (P)","SwS%","BB% (P)"]],
  ["RATIOS", ["K/9","BB/9","HR/9"]],
  ["STATCAST", ["GB%","FB%","HH%","Bar%","EV"]]
];

// Percent columns
const PERCENT_COLS = new Set([
  "W%","Rating","K% (Opp)","BB% (Opp)","K% (P)","SwS%","BB% (P)",
  "GB%","FB%","HH%","Bar%"
]);

/* ============================== DATA FETCH ============================== */
function useJson(url) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const r = await fetch(`${url}?_=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (alive) setRows(Array.isArray(j) ? j : j?.data || []);
      } catch (e) {
        if (alive) setErr(String(e.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [url]);

  return { rows, loading, err };
}

/* ============================== MAIN PAGE ============================== */
export default function PitcherData() {
  const { rows, loading, err } = useJson(DATA_URL);

  // Build a mapping: display label -> raw key from data
  const rawCols = useMemo(() => (rows[0] ? Object.keys(rows[0]) : []), [rows]);

  const labelToKey = useMemo(() => {
    const used = new Set();
    const m = new Map();
    for (const col of DISPLAY_COLS) {
      let hit = null;
      for (const cand of col.keys) {
        const key = rawCols.find((rc) => lower(rc) === lower(cand) && !used.has(rc));
        if (key) { hit = key; break; }
      }
      if (hit) used.add(hit); // don’t allow the same raw key to fill two display labels
      m.set(col.label, hit || null);
    }
    return m;
  }, [rawCols]);

  // Search/filter
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = lower(q);
    if (!s) return rows;
    return rows.filter((r) => {
      const name = lower(r.player || r.Player || r.Name || "");
      const t = lower(r.Team || "");
      const o = lower(r.Opp || r.OPP || r.Opponent || "");
      return name.includes(s) || t.includes(s) || o.includes(s);
    });
  }, [rows, q]);

  // Sorting (default by DK if present)
  const [sort, setSort] = useState({ key: "player", dir: "asc" });
  useEffect(() => {
    const dk = labelToKey.get("DK");
    const player = labelToKey.get("player");
    if (dk) setSort({ key: dk, dir: "desc" });
    else if (player) setSort({ key: player, dir: "asc" });
  }, [labelToKey]);

  const onSort = (label) => {
    const k = labelToKey.get(label);
    if (!k) return;
    setSort((prev) =>
      prev.key === k ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "desc" }
    );
  };

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const k = sort.key;
    const dir = sort.dir === "asc" ? 1 : -1;
    if (!k) return arr;
    arr.sort((a, b) => {
      const av = a[k], bv = b[k];
      const an = num(av), bn = num(bv);
      if (an != null && bn != null) return dir * (an - bn);
      return dir * String(av ?? "").localeCompare(String(bv ?? ""), undefined, { sensitivity: "base" });
    });
    return arr;
  }, [filtered, sort]);

  // UI helpers
  const headerCls = "px-2 py-1 font-semibold text-center text-[11px] whitespace-nowrap cursor-pointer select-none";
  const cellCls = "px-2 py-1 text-center text-[12px]";

  const renderCell = (label, row) => {
    const key = labelToKey.get(label);
    const raw = key ? row[key] : "";

    // Specialized displays
    if (label === "Time") return time12(raw);
    if (label === "Team" || label === "Opp") return <TeamWithLogo code={raw} />;

    if (PERCENT_COLS.has(label)) return fmtPct1(raw);
    // everything else numeric → 1 decimal (no trailing .0), otherwise raw
    const n = num(raw);
    return n == null ? String(raw ?? "") : fmt1(n);
  };

  // Compose band → list of labels we actually have (or still render blanks to keep grid stable)
  const bandCols = BANDS.map(([band, labels]) => [band, labels]);

  return (
    <div className="px-4 md:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h1 className="text-2xl md:text-3xl font-extrabold">
          {TITLE}
          {err ? <span className="ml-3 text-sm text-red-600">Error: {err}</span> : null}
        </h1>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search pitcher / team / opp…"
          className="h-9 w-72 rounded-lg border border-gray-300 px-3 text-sm focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-auto">
        <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
          <thead className="sticky top-0 z-10">
            {/* Band row */}
            <tr className="bg-blue-100 text-[11px] font-bold text-gray-700 uppercase">
              {bandCols.map(([band, labels]) => (
                <th key={band} colSpan={labels.length} className="px-2 py-1 text-center border-b border-blue-200">
                  {band}
                </th>
              ))}
            </tr>
            {/* Column header row */}
            <tr className="bg-blue-50">
              {bandCols.flatMap(([, labels]) => labels).map((label, i) => (
                <th
                  key={label + i}
                  className={`${headerCls} border-r border-blue-200`}
                  onClick={() => onSort(label)}
                  title="Click to sort"
                >
                  <span className="inline-flex items-center gap-1">
                    <span>{label}</span>
                    {labelToKey.get(label) === sort.key ? (
                      <span className="text-gray-500">{sort.dir === "desc" ? "▼" : "▲"}</span>
                    ) : (
                      <span className="text-gray-300">▲</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className={`${cellCls} text-gray-500`} colSpan={DISPLAY_COLS.length}>Loading…</td>
              </tr>
            ) : err ? (
              <tr>
                <td className={`${cellCls} text-red-600`} colSpan={DISPLAY_COLS.length}>
                  Failed to load: {err}
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td className={`${cellCls} text-gray-500`} colSpan={DISPLAY_COLS.length}>
                  No rows match your filters.
                </td>
              </tr>
            ) : (
              sorted.map((row, rIdx) => (
                <tr key={rIdx} className={rIdx % 2 ? "bg-gray-50/40" : "bg-white"}>
                  {bandCols.flatMap(([, labels]) => labels).map((label, i) => (
                    <td key={label + "-" + rIdx + "-" + i} className={`${cellCls} border-r border-blue-200 ${label === "player" ? "text-left font-medium" : ""}`}>
                      {renderCell(label, row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
