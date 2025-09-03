// src/pages/mlb/PitcherData.jsx
import React, { useEffect, useMemo, useState } from "react";

/* ============================ CONFIG ============================ */
const DATA_URL = "/data/mlb/latest/pitcher_data.json"; // <- matches your exporter
const TITLE = "MLB — Pitcher Data";
const LOGO_BASE = "/logos/mlb";
const LOGO_EXT = "png";

/* ============================ HELPERS ============================ */
const norm = (v) => (v == null ? "" : String(v).trim());
const lower = (s) => norm(s).toLowerCase();

const num = (v) => {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  const clean = s.replace(/[,\s]/g, "").replace(/%$/, "");
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
};

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
const fmt1 = (v) => {
  const n = num(v);
  return n == null ? "" : n.toFixed(1).replace(/\.0$/, "");
};
const fmt3 = (v) => {
  const n = num(v);
  return n == null ? "" : n.toFixed(3);
};

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
const COLS = [
  // Player Info
  { id: "hand",        label: "Hand",  keys: ["Hand","Throws","Handedness"] },
  { id: "player",      label: "player", keys: ["player","Player","Name"] },
  { id: "dk",          label: "DK",    keys: ["DK","DK Sal","DK Salary"] },
  { id: "fd",          label: "FD",    keys: ["FD","FD Sal","FD Salary"] },

  // Matchup Info
  { id: "team",        label: "Team",  keys: ["Team","Tm"] },
  { id: "opp",         label: "Opp",   keys: ["Opp","OPP","Opponent"] },
  { id: "park",        label: "Park",  keys: ["Park","Ballpark"] },
  { id: "time",        label: "Time",  keys: ["Time","Start","Start Time"] },

  // Vegas
  { id: "total",       label: "Total",  keys: ["Total","O/U","Team Total","TT"] },
  { id: "winpct",      label: "W%",     keys: ["W%","Win%"] },
  { id: "kline",       label: "K",      keys: ["K","Kline","Ks"] },
  { id: "field",       label: "Field",  keys: ["Field","Field%"] },
  { id: "rating",      label: "Rating", keys: ["Rating","Rate"] },

  // Opponent Splits vs Handedness
  { id: "opp_kpct",    label: "K%",   keys: ["Opp K%","K% (Opp)","K% vs Hand","K% (Team)","K% (Opp Team)","K%"] },
  { id: "opp_bbpct",   label: "BB%",  keys: ["Opp BB%","BB% (Opp)","BB% vs Hand","BB% (Team)","BB% (Opp Team)","BB%"] },
  { id: "woba",        label: "wOBA", keys: ["wOBA","Opp wOBA"] },
  { id: "iso",         label: "ISO",  keys: ["ISO","Opp ISO"] },
  { id: "wrcplus",     label: "wRC+", keys: ["wRC+","Opp wRC+"] },

  // Advanced (pitcher)
  { id: "ip",          label: "IP",    keys: ["IP","IP/G"] },
  { id: "velo",        label: "Velo",  keys: ["Velo","FB Velo","Velocity"] },
  { id: "xfip",        label: "xFIP",  keys: ["xFIP","xfip"] },
  { id: "p_kpct",      label: "K%",    keys: ["K% (P)","Pitch K%","K%_P","K%"] },
  { id: "sws",         label: "SwS%",  keys: ["SwS%","SwStr%"] },
  { id: "p_bbpct",     label: "BB%",   keys: ["BB% (P)","Pitch BB%","BB%_P","BB%"] },

  // Ratios
  { id: "k9",          label: "K/9",  keys: ["K/9","K9"] },
  { id: "bb9",         label: "BB/9", keys: ["BB/9","BB9"] },
  { id: "hr9",         label: "HR/9", keys: ["HR/9","HR9"] },

  // Statcast
  { id: "gbpct",       label: "GB%",  keys: ["GB%","GB% (P)"] },
  { id: "fbpct",       label: "FB%",  keys: ["FB%","FB% (P)"] },
  { id: "hhpct",       label: "HH%",  keys: ["HH%","HardHit%","Hard%"] },
  { id: "barpct",      label: "Bar%", keys: ["Bar%","Barrel%"] },
  { id: "ev",          label: "EV",   keys: ["EV","Avg EV","Exit Velo"] }
];

const BANDS = [
  ["PLAYER INFO", ["hand","player","dk","fd"]],
  ["MATCHUP INFO", ["team","opp","park","time"]],
  ["VEGAS", ["total","winpct","kline","field","rating"]],
  ["OPPONENT SPLITS VS HANDEDNESS", ["opp_kpct","opp_bbpct","woba","iso","wrcplus"]],
  ["ADVANCED STATS", ["ip","velo","xfip","p_kpct","sws","p_bbpct"]],
  ["RATIOS", ["k9","bb9","hr9"]],
  ["STATCAST", ["gbpct","fbpct","hhpct","barpct","ev"]]
];

const PCT_IDS = new Set([
  "winpct","rating","opp_kpct","opp_bbpct","p_kpct","sws","p_bbpct",
  "gbpct","fbpct","hhpct","barpct"
]);

// Thick borders after: FD, Time, K, Rating, wRC+, BB% (P), HH%, EV
const THICK_AFTER = new Set(["fd", "time", "kline", "rating", "wrcplus", "p_bbpct", "hhpct", "ev"]);

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
  const rawCols = useMemo(() => (rows[0] ? Object.keys(rows[0]) : []), [rows]);
  const rawLower = useMemo(() => rawCols.map((c) => lower(c)), [rawCols]);

  // helpers to detect generic K% / BB% regardless of suffixes
  const isKpct = (lc) => lc.includes("k%") || lc.includes("kpct");
  const isBBpct = (lc) => lc.includes("bb%") || lc.includes("bbpct");

  // find first index matching predicate starting at fromIdx
  const findIdx = (pred, fromIdx = 0, notUsedIdx = new Set()) => {
    for (let i = fromIdx; i < rawLower.length; i++) {
      if (pred(rawLower[i]) && !notUsedIdx.has(i)) return i;
    }
    return -1;
  };

  // Map id -> data key. Also respect “first K%/BB% is Opp; second is Pitcher”.
  const idToKey = useMemo(() => {
    const usedIdx = new Set();
    const m = new Map();

    // 1) normal one-pass for non-duplicate columns (prefer unique keys)
    for (const c of COLS) {
      if (["opp_kpct","p_kpct","opp_bbpct","p_bbpct"].includes(c.id)) continue; // handle later
      let hit = null;
      for (const cand of c.keys) {
        const idx = rawLower.findIndex((lc, i) => lc === lower(cand) && !usedIdx.has(i));
        if (idx !== -1) { hit = rawCols[idx]; usedIdx.add(idx); break; }
      }
      if (hit) m.set(c.id, hit);
      else m.set(c.id, null);
    }

    // 2) Opp/Pitcher K%: prefer explicit labels; else use first & second generic K%
    // Opp K%
    let oppK = null, oppKIdx = -1;
    for (const cand of ["Opp K%","K% (Opp)","K% vs Hand","K% (Team)","K% (Opp Team)"]) {
      const idx = rawLower.findIndex((lc, i) => lc === lower(cand) && !usedIdx.has(i));
      if (idx !== -1) { oppK = rawCols[idx]; oppKIdx = idx; usedIdx.add(idx); break; }
    }
    if (!oppK) {
      const idx = findIdx(isKpct, 0, usedIdx);
      if (idx !== -1) { oppK = rawCols[idx]; oppKIdx = idx; usedIdx.add(idx); }
    }
    m.set("opp_kpct", oppK);

    // Pitcher K%: prefer explicit; else the next generic after opp
    let pK = null;
    for (const cand of ["K% (P)","Pitch K%","K%_P"]) {
      const idx = rawLower.findIndex((lc, i) => lc === lower(cand) && !usedIdx.has(i));
      if (idx !== -1) { pK = rawCols[idx]; usedIdx.add(idx); break; }
    }
    if (!pK) {
      const start = oppKIdx >= 0 ? oppKIdx + 1 : 0;
      const idxNext = findIdx(isKpct, start, usedIdx);
      if (idxNext !== -1) { pK = rawCols[idxNext]; usedIdx.add(idxNext); }
    }
    m.set("p_kpct", pK || null);

    // 3) Opp/Pitcher BB%
    let oppBB = null, oppBBIdx = -1;
    for (const cand of ["Opp BB%","BB% (Opp)","BB% vs Hand","BB% (Team)","BB% (Opp Team)"]) {
      const idx = rawLower.findIndex((lc, i) => lc === lower(cand) && !usedIdx.has(i));
      if (idx !== -1) { oppBB = rawCols[idx]; oppBBIdx = idx; usedIdx.add(idx); break; }
    }
    if (!oppBB) {
      const idx = findIdx(isBBpct, 0, usedIdx);
      if (idx !== -1) { oppBB = rawCols[idx]; oppBBIdx = idx; usedIdx.add(idx); }
    }
    m.set("opp_bbpct", oppBB);

    let pBB = null;
    for (const cand of ["BB% (P)","Pitch BB%","BB%_P"]) {
      const idx = rawLower.findIndex((lc, i) => lc === lower(cand) && !usedIdx.has(i));
      if (idx !== -1) { pBB = rawCols[idx]; usedIdx.add(idx); break; }
    }
    if (!pBB) {
      const start = oppBBIdx >= 0 ? oppBBIdx + 1 : 0;
      const idxNext = findIdx(isBBpct, start, usedIdx);
      if (idxNext !== -1) { pBB = rawCols[idxNext]; usedIdx.add(idxNext); }
    }
    m.set("p_bbpct", pBB || null);

    return m;
  }, [rawCols, rawLower]);

  // Search
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

  // Sorting (default DK desc or player asc)
  const dkKey = idToKey.get("dk");
  const playerKey = idToKey.get("player");
  const [sort, setSort] = useState({ key: dkKey || playerKey || "", dir: dkKey ? "desc" : "asc" });

  useEffect(() => {
    const dk = idToKey.get("dk");
    const pl = idToKey.get("player");
    setSort({ key: dk || pl || "", dir: dk ? "desc" : "asc" });
  }, [idToKey]);

  const onSort = (id) => {
    const k = idToKey.get(id);
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

  const renderVal = (id, key, row) => {
    const raw = key ? row[key] : "";
    if (id === "time") return time12(raw);
    if (id === "team" || id === "opp") return <TeamWithLogo code={raw} />;
    if (id === "woba" || id === "iso") return fmt3(raw);
    if (PCT_IDS.has(id)) return fmtPct1(raw);
    const n = num(raw);
    return n == null ? String(raw ?? "") : fmt1(n);
  };

  // Flatten columns in band order for rendering
  const flatIds = BANDS.flatMap(([, ids]) => ids);

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
            {/* Merged band headers (reverted) */}
            <tr className="bg-blue-100 text-[11px] font-bold text-gray-700 uppercase">
              {BANDS.map(([name, ids]) => (
                <th
                  key={name}
                  colSpan={ids.length}
                  className="px-2 py-1 text-center border-b border-blue-200"
                >
                  {name}
                </th>
              ))}
            </tr>

            {/* Column header row */}
            <tr className="bg-blue-50">
              {flatIds.map((id) => {
                const col = COLS.find((c) => c.id === id);
                const key = idToKey.get(id);
                const isSorted = key && key === sort.key;
                const thick = THICK_AFTER.has(id);
                return (
                  <th
                    key={id}
                    className={`${headerCls} ${thick ? "border-r-2 border-blue-300" : "border-r border-blue-200"}`}
                    onClick={() => onSort(id)}
                    title="Click to sort"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>{col.label}</span>
                      {isSorted ? (
                        <span className="text-gray-500">{sort.dir === "desc" ? "▼" : "▲"}</span>
                      ) : (
                        <span className="text-gray-300">▲</span>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className={`${cellCls} text-gray-500`} colSpan={flatIds.length}>Loading…</td>
              </tr>
            ) : err ? (
              <tr>
                <td className={`${cellCls} text-red-600`} colSpan={flatIds.length}>
                  Failed to load: {err}
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td className={`${cellCls} text-gray-500`} colSpan={flatIds.length}>
                  No rows match your filters.
                </td>
              </tr>
            ) : (
              sorted.map((row, rIdx) => (
                <tr key={rIdx} className={rIdx % 2 ? "bg-gray-50/40" : "bg-white"}>
                  {flatIds.map((id) => {
                    const key = idToKey.get(id);
                    const thick = THICK_AFTER.has(id);
                    const isPlayer = id === "player";
                    return (
                      <td
                        key={id + "-" + rIdx}
                        className={`${cellCls} ${isPlayer ? "text-left font-medium" : ""} ${
                          thick ? "border-r-2 border-blue-300" : "border-r border-blue-200"
                        }`}
                      >
                        {renderVal(id, key, row)}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
