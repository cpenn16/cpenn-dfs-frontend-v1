// src/pages/mlb/BatterData.jsx
import React, { useEffect, useMemo, useState } from "react";

/* ============================ CONFIG ============================ */
const DATA_URL = "/data/mlb/latest/batter_data.json";
const META_URL = DATA_URL.replace(/[^/]+$/, "meta.json");
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
const fmt2 = (v) => { const n = num(v); return n == null ? "" : n.toFixed(2).replace(/0$/, "").replace(/\.$/,""); };
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

/* ============================ LAST UPDATED ============================ */
function useLastUpdated(mainUrl, metaUrl) {
  const [d, setD] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const h = await fetch(mainUrl, { method: "HEAD", cache: "no-store" });
        const lm = h.headers.get("last-modified");
        if (alive && lm) { setD(new Date(lm)); return; }
      } catch {}
      try {
        const r = await fetch(mainUrl, { cache: "no-store" });
        const lm = r.headers.get("last-modified");
        if (alive && lm) { setD(new Date(lm)); return; }
      } catch {}
      try {
        const m = await fetch(`${metaUrl}?_=${Date.now()}`, { cache: "no-store" }).then(x => x.json());
        const iso = m?.updated_iso || m?.updated_utc;
        const ep  = m?.updated_epoch;
        const dt  = iso ? new Date(iso) : Number.isFinite(ep) ? new Date(ep * 1000) : null;
        if (alive && dt && !isNaN(dt)) setD(dt);
      } catch {}
    })();
    return () => { alive = false; };
  }, [mainUrl, metaUrl]);
  return d;
}
const fmtUpdated = (d) =>
  d ? d.toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

/* ============================ DATA FETCH ============================ */
function useJson(url) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr("");
      try {
        const r = await fetch(`${url}?_=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const ct = (r.headers.get("content-type") || "").toLowerCase();
        if (!ct.includes("application/json")) {
          const txt = await r.text();
          throw new Error(`Expected JSON, got ${ct || "unknown"}: ${txt.slice(0, 40)}`);
        }
        const j = await r.json();
        const data = Array.isArray(j) ? j : j?.data || j?.rows || [];
        if (alive) setRows(data);
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

/* Sort intent (for first-click direction) */
const LOWER_BETTER = new Set(["dk","fd","k_pct","sws_pct","h_kpct"]);
const HIGHER_BETTER = new Set([
  "total","rating","ab","iso","woba","bb_pct","sbg","hr_fb","fb","gb","cnt_pct","bar_pct","hh_pct","ev",
  "h_ab","h_woba","h_iso","h_wrcplus","h_bbpct"
]);

/* Percent columns */
const PCT_IDS = new Set([
  "rating","k_pct","bb_pct","hr_fb","fb","gb","cnt_pct","sws_pct","bar_pct","hh_pct","h_kpct","h_bbpct"
]);

/* Thick borders for legibility */
const THICK_AFTER = new Set(["fd","time","total","rating","sbg","sws_pct","ev","ph","h_ab","h_bbpct"]);

/* ============================== MAIN PAGE ============================== */
export default function BatterData() {
  const { rows, loading, err } = useJson(DATA_URL);
  const updatedAt = useLastUpdated(DATA_URL, META_URL);

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

  // sorting
  const dkKey = idToKey.get("dk");
  const playerKey = idToKey.get("player");
  const [sort, setSort] = useState({ key: dkKey || playerKey || "", dir: dkKey ? "desc" : "asc" });

  useEffect(() => {
    const dk = idToKey.get("dk");
    const pl = idToKey.get("player");
    setSort({ key: dk || pl || "", dir: dk ? "desc" : "asc" });
  }, [idToKey]);

  const firstClickDirFor = (id) => (LOWER_BETTER.has(id) ? "asc" : "desc");

  const onSort = (id) => {
    const k = idToKey.get(id);
    if (!k) return;
    setSort((prev) =>
      prev.key === k
        ? { key: k, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: k, dir: firstClickDirFor(id) }
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

  /* ---------------------- Conditional formatting ---------------------- */
  const heatThresholds = useMemo(() => {
    // Build { id -> [q20,q40,q60,q80] } for heat columns over *current* sorted rows
    const ids = [...HIGHER_BETTER, ...LOWER_BETTER];
    const map = new Map();
    for (const id of ids) {
      const key = idToKey.get(id);
      if (!key) continue;
      const values = sorted
        .map((r) => num(r[key]))
        .filter((v) => v != null && Number.isFinite(v))
        .sort((a, b) => a - b);
      if (values.length < 5) continue; // not enough to compute quantiles
      const q = (p) => {
        const idx = (values.length - 1) * p;
        const lo = Math.floor(idx), hi = Math.ceil(idx);
        return lo === hi ? values[lo] : values[lo] + (values[hi] - values[lo]) * (idx - lo);
      };
      map.set(id, [q(0.2), q(0.4), q(0.6), q(0.8)]);
    }
    return map;
  }, [sorted, idToKey]);

  const heatClass = (id, rawVal) => {
    const key = idToKey.get(id);
    if (!key) return "";
    const v = num(rawVal);
    if (v == null) return "";
    const qs = heatThresholds.get(id);
    if (!qs) return "";

    // tier 0..4
    let tier = 0;
    if (v >= qs[3]) tier = 4;
    else if (v >= qs[2]) tier = 3;
    else if (v >= qs[1]) tier = 2;
    else if (v >= qs[0]) tier = 1;
    else tier = 0;

    // map to classes depending on direction
    if (HIGHER_BETTER.has(id)) {
      // more green as tier increases
      return ["bg-red-50", "bg-green-50", "bg-green-100", "bg-green-150", "bg-green-200"][tier] || "";
    }
    if (LOWER_BETTER.has(id)) {
      // better when smaller ⇒ invert (lower tiers = good)
      const inv = 4 - tier;
      return ["bg-blue-200", "bg-blue-150", "bg-blue-100", "bg-blue-50", "bg-green-50"][inv] || "";
    }
    return "";
  };

  // Some Tailwind palettes (bg-green-150 isn't real; tailwind will treat unknowns as no-op.
  // If you want exact shades, switch the 150s to 100 or 200 as you prefer.)

  // UI
  const headerCls = "px-2 py-1 font-semibold text-center text-[11px] whitespace-nowrap cursor-pointer select-none";
  const cellCls = "px-2 py-1 text-center text-[12px]";
  const flatIds = useMemo(() => BANDS.flatMap(([, ids]) => ids), []);

  const renderVal = (id, key, row) => {
    const raw = key ? row[key] : "";
    if (id === "time") return time12(raw);
    if (id === "team" || id === "opp") return <TeamWithLogo code={raw} />;
    if (id === "woba" || id === "iso" || id === "h_woba" || id === "h_iso") return fmt3(raw);
    if (id === "sbg") return fmt2(raw); // SB/g
    if (PCT_IDS.has(id)) return fmtPct1(raw);
    const n = num(raw);
    return n == null ? String(raw ?? "") : fmt1(n);
  };

  return (
    <div className="px-4 md:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl md:text-3xl font-extrabold">{TITLE}</h1>
          <div className="text-sm text-gray-600">{loading ? "Loading…" : `${sorted.length.toLocaleString()} rows`}</div>
          {updatedAt && <div className="text-sm text-gray-500">Updated: {fmtUpdated(updatedAt)}</div>}
          {err && <div className="text-sm text-red-600">Error: {err}</div>}
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search batter / team / opp / pitcher…"
          className="h-9 w-80 rounded-lg border border-gray-300 px-3 text-sm focus:ring-2 focus:ring-indigo-500"
        />
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
                      <span className="text-gray-400">
                        {isSorted ? (sort.dir === "desc" ? "▼" : "▲") : (firstClickDirFor(id) === "desc" ? "▼" : "▲")}
                      </span>
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
                    const raw = key ? row[key] : "";
                    const heat = heatClass(id, raw);
                    return (
                      <td
                        key={id + "-" + rIdx}
                        className={`${cellCls} ${isPlayer ? "text-left font-medium" : ""} ${
                          thick ? "border-r-2 border-blue-300" : "border-r border-blue-200"
                        } ${heat} tabular-nums`}
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
