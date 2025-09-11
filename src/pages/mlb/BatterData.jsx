// src/pages/mlb/BatterData.jsx
import React, { useEffect, useMemo, useState } from "react";

/* ============================ CONFIG ============================ */
const DATA_URL = "/data/mlb/latest/batter_data.json";
const TITLE = "MLB — Batter Data";
const LOGO_BASE = "/logos/mlb";
const LOGO_EXT = "png";

/* ============================ HELPERS ============================ */
const norm = (v) => (v == null ? "" : String(v).trim());
const lower = (s) => norm(s).toLowerCase();
const squish = (s) => lower(s).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

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
  if (s.endsWith("%")) { hadPercent = true; s = s.slice(0, -1); }
  let n = num(s);
  if (n == null) return "";
  if (!hadPercent && Math.abs(n) <= 1) n *= 100;
  return `${n.toFixed(1)}%`;
}
const fmt1 = (v) => { const n = num(v); return n == null ? "" : n.toFixed(1).replace(/\.0$/, ""); };
const fmt2 = (v) => { const n = num(v); return n == null ? "" : n.toFixed(2).replace(/0$/, "").replace(/\.$/, ""); };
const fmt3 = (v) => { const n = num(v); return n == null ? "" : n.toFixed(3); };

function time12(s) {
  const v = norm(s);
  if (!v) return "";
  if (/\d{1,2}:\d{2}(:\d{2})?\s?[AP]M/i.test(v)) return v.toUpperCase().replace(/\s+/g, " ");
  const m = v.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return v;
  let hh = Number(m[1]); const mm = m[2];
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
      <img src={src} className="h-4 w-4 shrink-0" onError={(e) => (e.currentTarget.style.display = "none")} />
      <span>{abv}</span>
    </span>
  );
}

/* ---------------------- last-updated via meta.json -------------------- */
function toMetaUrl(urlLike) {
  return String(urlLike || "").replace(/[^/]+$/, "meta.json");
}
function parseMetaToDate(meta) {
  const iso =
    meta?.updated_iso ||
    meta?.updated_utc ||
    meta?.source_mtime_iso ||
    meta?.last_updated ||
    meta?.timestamp;
  if (iso) {
    const d = new Date(iso);
    if (!isNaN(d)) return d;
  }
  const epoch = meta?.updated_epoch ?? meta?.epoch;
  if (Number.isFinite(epoch)) {
    const d = new Date(epoch * (epoch > 10_000_000_000 ? 1 : 1000));
    if (!isNaN(d)) return d;
  }
  return null;
}
function useLastUpdatedFromSource(sourceUrl) {
  const metaUrl = useMemo(() => toMetaUrl(sourceUrl), [sourceUrl]);
  const [text, setText] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${metaUrl}?_=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const meta = await r.json();
        const d = parseMetaToDate(meta);
        if (!d) return;
        const t = d.toLocaleString(undefined, {
          month: "numeric",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        if (alive) setText(t);
      } catch {}
    })();
    return () => { alive = false; };
  }, [metaUrl]);
  return text;
}

/* ===================== DISPLAY ORDER & HEADER BANDS ===================== */
const COLS = [
  // Player Info
  { id: "bo",     label: "BO",     keys: ["BO","Bat Order","Order"] },
  { id: "bh",     label: "BH",     keys: ["BH","Bats","Hand","Bat Hand"] },
  { id: "pos",    label: "Pos",    keys: ["Pos","Position"] },
  { id: "player", label: "Player", keys: ["Player","Name"] },
  { id: "dk",     label: "DK",     keys: ["DK","DK Sal","DK Salary"] },
  { id: "fd",     label: "FD",     keys: ["FD","FD Sal","FD Salary"] },

  // Matchup Info
  { id: "team",   label: "Team",  keys: ["Team","Tm"] },
  { id: "opp",    label: "Opp",   keys: ["Opp","OPP","Opponent"] },
  { id: "park",   label: "Park",  keys: ["Park","Ballpark"] },
  { id: "time",   label: "Time",  keys: ["Time","Start","Start Time"] },

  // Vegas
  { id: "total",  label: "Total",  keys: ["Total","Team Total","O/U","TT"] },
  { id: "field",  label: "Field",  keys: ["Field","Field%"] },
  { id: "rating", label: "Rating", keys: ["Rating","Rate"] },

  // Advanced Stats
  { id: "ab",     label: "AB",   keys: ["AB"] },
  { id: "iso",    label: "ISO",  keys: ["ISO"] },
  { id: "woba",   label: "wOBA", keys: ["wOBA"] },
  { id: "k_pct",  label: "K%",   keys: ["K%","Kpct"] },
  { id: "bb_pct", label: "BB%",  keys: ["BB%","BBpct"] },
  { id: "sbg",    label: "SB/g", keys: ["SB/g","SB per game","SBpg","SB G"] },

  // Ratios
  { id: "hr_fb",  label: "HR/FB", keys: ["HR/FB","HR-FB","HRFB"] },
  { id: "fb",     label: "FB",    keys: ["FB","FB%"] },
  { id: "gb",     label: "GB",    keys: ["GB","GB%"] },

  // Statcast
  { id: "cnt_pct", label: "Cnt%", keys: ["Cnt%","Contact%","Ct%","Con%"] },
  { id: "sws_pct", label: "SwS%", keys: ["SwS%","SwStr%"] },
  { id: "bar_pct", label: "Bar%", keys: ["Bar%","Barrel%","Barrels%"] },
  { id: "hh_pct",  label: "HH%",  keys: ["HH%","HardHit%","Hard%"] },
  { id: "ev",      label: "EV",   keys: ["EV","Avg EV","Exit Velo"] },

  // Opponent
  { id: "pitcher", label: "Pitcher", keys: ["Pitcher","Opp Pitcher","SP"] },
  { id: "ph",      label: "PH",      keys: ["PH","P Hand","Pitcher Hand","Opp P Hand"] },

  // Batter Splits vs P Handedness
  { id: "h_ab",     label: "H AB",     keys: ["H AB","Hand AB","Split AB"] },
  { id: "h_woba",   label: "H wOBA",   keys: ["H wOBA","Hand wOBA","Split wOBA"] },
  { id: "h_iso",    label: "H ISO",    keys: ["H ISO","Hand ISO","Split ISO"] },
  { id: "h_wrcplus",label: "H wRC+",   keys: ["H wRC+","Hand wRC+","Split wRC+"] },
  { id: "h_kpct",   label: "H K%",     keys: ["H K%","Hand K%","Split K%","H Kpct"] },
  { id: "h_bbpct",  label: "H BB%",    keys: ["H BB%","Hand BB%","Split BB%","H BBpct"] }
];

const BANDS = [
  ["PLAYER INFO", ["bo","bh","pos","player","dk","fd"]],
  ["MATCHUP INFO", ["team","opp","park","time"]],
  ["VEGAS", ["total","field","rating"]],
  ["ADVANCED STATS", ["ab","iso","woba","k_pct","bb_pct","sbg"]],
  ["RATIOS", ["hr_fb","fb","gb"]],
  ["STATCAST", ["cnt_pct","sws_pct","bar_pct","hh_pct","ev"]],
  ["OPPONENT", ["pitcher","ph"]],
  ["BATTER SPLITS vs P HANDEDNESS", ["h_ab","h_woba","h_iso","h_wrcplus","h_kpct","h_bbpct"]]
];

/* Which direction is “better” */
const HIGHER_IS_BETTER = new Set([
  "total","rating","ab","iso","woba","bb_pct","sbg","hr_fb","fb","gb","cnt_pct","bar_pct","hh_pct","ev",
  "h_ab","h_woba","h_iso","h_wrcplus","h_bbpct"
]);
const LOWER_IS_BETTER = new Set(["dk","fd","k_pct","sws_pct","h_kpct"]);

const PCT_IDS = new Set([
  "rating","k_pct","bb_pct","hr_fb","fb","gb","cnt_pct","sws_pct","bar_pct","hh_pct","h_kpct","h_bbpct"
]);

/* Thick borders for legibility */
const THICK_AFTER = new Set(["fd","time","total","rating","sbg","sws_pct","ev","ph","h_ab","h_bbpct"]);

/* ------------------------ conditional formatting ---------------------- */
function numericFromRaw(id, raw) {
  if (raw == null || raw === "") return null;
  let v = String(raw);
  if (v.endsWith("%")) v = v.slice(0, -1);
  let n = num(v);
  if (n == null) return null;
  if (PCT_IDS.has(id) && Math.abs(n) <= 1) n *= 100;
  return n;
}
function computeStats(rows, ids, idToKey) {
  const out = {};
  for (const id of ids) {
    const key = idToKey.get(id);
    if (!key) continue;
    if (!HIGHER_IS_BETTER.has(id) && !LOWER_IS_BETTER.has(id)) continue;
    let min = Infinity, max = -Infinity, any = false;
    for (const r of rows) {
      const n = numericFromRaw(id, r[key]);
      if (n == null || !Number.isFinite(n)) continue;
      any = true;
      if (n < min) min = n;
      if (n > max) max = n;
    }
    if (any && min !== max) out[id] = { min, max };
  }
  return out;
}
function colorFor(palette, id, raw, stats) {
  if (palette === "none") return null;
  const st = stats[id];
  if (!st) return null;
  const n = numericFromRaw(id, raw);
  if (n == null) return null;

  // t: 0 = column-min (bad if HIGHER_IS_BETTER), 1 = column-max
  let t = (n - st.min) / (st.max - st.min);
  t = Math.max(0, Math.min(1, t));
  if (LOWER_IS_BETTER.has(id)) t = 1 - t; // flip so higher 't' always better

  if (palette === "gyr") {
    // real red -> yellow -> green
    const hue = 0 + 120 * t;      // 0=red, 60=yellow, 120=green
    const sat = 85;
    const light = 96 - 14 * t;
    return `hsl(${hue} ${sat}% ${light}%)`;
  }
  if (palette === "orangeblue") {
    // orange = GOOD, blue = BAD (so invert again)
    const tt = 1 - t;
    if (tt < 0.5) {
      const u = tt / 0.5;         // orange -> white
      const h = 30, s = 70 - 40 * u, l = 96 - 4 * u;
      return `hsl(${h} ${s}% ${l}%)`;
    } else {
      const u = (tt - 0.5) / 0.5; // white -> blue
      const h = 220, s = 30 + 40 * u, l = 94 - 8 * u;
      return `hsl(${h} ${s}% ${l}%)`;
    }
  }
  return null;
}

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
        if (alive) setRows(Array.isArray(j) ? j : j?.data || j?.rows || []);
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
export default function BatterData() {
  const { rows, loading, err } = useJson(DATA_URL);
  const updatedText = useLastUpdatedFromSource(DATA_URL);

  const rawCols = useMemo(() => (rows[0] ? Object.keys(rows[0]) : []), [rows]);
  const rawLower = useMemo(() => rawCols.map(squish), [rawCols]);

  const findKey = (aliases, fuzzy) => {
    for (const alias of aliases) {
      const idx = rawLower.findIndex((lc) => lc === squish(alias));
      if (idx !== -1) return rawCols[idx];
    }
    if (fuzzy) {
      const idx = rawLower.findIndex(fuzzy);
      if (idx !== -1) return rawCols[idx];
    }
    return null;
  };

  // map id -> actual key
  const idToKey = useMemo(() => {
    const m = new Map();
    for (const c of COLS) {
      let fuzzy = null;
      if (c.id === "sbg")     fuzzy = (lc) => lc.includes("sb") && (lc.includes("/g") || lc.includes("per"));
      if (c.id === "cnt_pct") fuzzy = (lc) => lc.includes("cnt") || lc.includes("contact");
      if (c.id === "sws_pct") fuzzy = (lc) => lc.includes("sw") && (lc.includes("swstr") || lc.includes("sws%"));
      if (c.id === "bar_pct") fuzzy = (lc) => lc.includes("bar");
      if (c.id === "hh_pct")  fuzzy = (lc) => lc.includes("hard");
      if (c.id === "ev")      fuzzy = (lc) => lc.includes("exit") || lc.includes("velo");
      if (c.id === "ph")      fuzzy = (lc) => lc.includes("hand") && lc.includes("pitch");
      if (c.id.startsWith("h_")) {
        const base = c.id.replace(/^h_/, "");
        fuzzy = (lc) => lc.includes(base) && (lc.includes("hand") || lc.startsWith("h "));
      }
      m.set(c.id, findKey(c.keys, fuzzy));
    }
    return m;
  }, [rawCols, rawLower]);

  // search
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = lower(q);
    if (!s) return rows;
    return rows.filter((r) => {
      const name = lower(r.player || r.Player || r.Name || "");
      const t = lower(r.Team || "");
      const o = lower(r.Opp || r.OPP || r.Opponent || "");
      const p = lower(r.Pitcher || r["Opp Pitcher"] || "");
      return name.includes(s) || t.includes(s) || o.includes(s) || p.includes(s);
    });
  }, [rows, q]);

  // sorting (default DK desc)
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

  // palette
  const [palette, setPalette] = useState("none"); // none | gyr | orangeblue

  // coloring stats per visible columns
  const flatIds = useMemo(() => BANDS.flatMap(([, ids]) => ids), []);
  const stats = useMemo(() => computeStats(sorted, flatIds, idToKey), [sorted, flatIds, idToKey]);

  // UI
  const headerCls = "px-2 py-1 font-semibold text-center text-[11px] whitespace-nowrap cursor-pointer select-none";
  const cellCls = "px-2 py-1 text-center text-[12px]";

  const renderVal = (id, key, row) => {
    const raw = key ? row[key] : "";
    if (id === "time") return time12(raw);
    if (id === "team" || id === "opp") return <TeamWithLogo code={raw} />;
    if (id === "woba" || id === "iso" || id === "h_woba" || id === "h_iso") return fmt3(raw);
    if (id === "sbg") return fmt2(raw);
    if (PCT_IDS.has(id)) return fmtPct1(raw);
    const n = num(raw);
    return n == null ? String(raw ?? "") : fmt1(n);
  };

  return (
    <div className="px-4 md:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl md:text-3xl font-extrabold">{TITLE}</h1>
          <div className="text-sm text-gray-600">
            {loading ? "Loading…" : err ? `Error: ${err}` : `${sorted.length.toLocaleString()} rows`}
          </div>
          {useLastUpdatedFromSource && <div className="text-sm text-gray-500">Updated: {updatedText}</div>}
        </div>

        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search batter / team / opp / pitcher…"
            className="h-9 w-80 rounded-lg border border-gray-300 px-3 text-sm focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={palette}
            onChange={(e) => setPalette(e.target.value)}
            className="h-9 rounded-lg border px-2 text-sm"
            title="Cell coloring"
          >
            <option value="none">Coloring: None</option>
            <option value="gyr">Coloring: Green–Yellow–Red</option>
            <option value="orangeblue">Coloring: Orange–Blue</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-auto">
        <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
          <thead className="sticky top-0 z-10">
            {/* merged bands */}
            <tr className="bg-blue-100 text-[11px] font-bold text-gray-700 uppercase">
              {BANDS.map(([name, ids]) => (
                <th key={name} colSpan={ids.length} className="px-2 py-1 text-center border-b border-blue-200">
                  {name}
                </th>
              ))}
            </tr>
            {/* column headers */}
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
              <tr><td className={`${cellCls} text-gray-500`} colSpan={flatIds.length}>Loading…</td></tr>
            ) : err ? (
              <tr><td className={`${cellCls} text-red-600`} colSpan={flatIds.length}>Failed to load: {err}</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td className={`${cellCls} text-gray-500`} colSpan={flatIds.length}>No rows match your filters.</td></tr>
            ) : (
              sorted.map((row, rIdx) => (
                <tr key={rIdx} className={rIdx % 2 ? "bg-gray-50/40" : "bg-white"}>
                  {flatIds.map((id) => {
                    const key = idToKey.get(id);
                    const thick = THICK_AFTER.has(id);
                    const isPlayer = id === "player";
                    const raw = key ? row[key] : null;
                    const bg = colorFor(palette, id, raw, stats);
                    return (
                      <td
                        key={id + "-" + rIdx}
                        className={`${cellCls} ${isPlayer ? "text-left font-medium" : ""} ${
                          thick ? "border-r-2 border-blue-300" : "border-r border-blue-200"
                        } tabular-nums`}
                        style={bg ? { backgroundColor: bg } : undefined}
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
