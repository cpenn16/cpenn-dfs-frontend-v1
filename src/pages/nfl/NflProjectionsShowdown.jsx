// src/pages/nfl/NflProjectionsShowdown.jsx
import React, { useEffect, useMemo, useState } from "react";

/* ------------------------------------------------------------------
   Unified showdown table (compact like classic)
   - DK/FD site toggle
   - Flex vs CPT (DK) / Flex vs MVP (FD)
   - Auto 1.5x for CPT/MVP
   - Sort, search, CSV export
   - PNG logos
   - FD DST salary fix: backfill from site_ids.json by team if missing
   - Frozen first column + auto-fit column widths
   - Optional heatmap palette (default: None)
------------------------------------------------------------------- */

const PROJ_SRC = "/data/nfl/showdown/latest/projections.json";
const IDS_SRC  = "/data/nfl/showdown/latest/site_ids.json";

/* Full-team names for DST display */
const TEAM_FULL = {
  ARI: "Arizona Cardinals", ATL: "Atlanta Falcons", BAL: "Baltimore Ravens",
  BUF: "Buffalo Bills", CAR: "Carolina Panthers", CHI: "Chicago Bears",
  CIN: "Cincinnati Bengals", CLE: "Cleveland Browns", DAL: "Dallas Cowboys",
  DEN: "Denver Broncos", DET: "Detroit Lions", GB: "Green Bay Packers",
  HOU: "Houston Texans", IND: "Indianapolis Colts", JAX: "Jacksonville Jaguars",
  KC: "Kansas City Chiefs", LV: "Las Vegas Raiders", LAC: "Los Angeles Chargers",
  LAR: "Los Angeles Rams", MIA: "Miami Dolphins", MIN: "Minnesota Vikings",
  NE: "New England Patriots", NO: "New Orleans Saints", NYG: "New York Giants",
  NYJ: "New York Jets", PHI: "Philadelphia Eagles", PIT: "Pittsburgh Steelers",
  SEA: "Seattle Seahawks", SF: "San Francisco 49ers", TB: "Tampa Bay Buccaneers",
  TEN: "Tennessee Titans", WAS: "Washington Commanders",
};

/* ---------- helpers ---------- */
const toNum = (v) => {
  const n = Number(String(v ?? "").replace(/[,$%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const fmt0 = (v) => (toNum(v) == null ? "" : toNum(v).toLocaleString());
const fmt1 = (v) => (toNum(v) == null ? "" : toNum(v).toFixed(1));
const fmtPct = (v) => {
  if (v == null || v === "") return "";
  const s = String(v).trim();
  if (/%$/.test(s)) return s.replace(/%+$/, "%");
  const n = toNum(s);
  return n == null ? "" : `${n.toFixed(1)}%`;
};
const pick = (obj, keys, fallback = "") => {
  for (const k of keys) if (k in obj && obj[k] !== "" && obj[k] != null) return obj[k];
  return fallback;
};
const computeVal = (proj, sal) => {
  const p = toNum(proj);
  const s = toNum(sal);
  if (p == null || s == null || s === 0) return "";
  return (p / (s / 1000)).toFixed(1); // points per $1k
};
const isDSTPos = (pos) => /^(DST|D\/ST|DEF|DEFENSE|D)$/i.test(String(pos).trim());

/* PNG logos */
const logoSrc    = (abbr) => `/logos/nfl/${String(abbr || "").toUpperCase()}.png`;
const logoSrcAlt = (abbr) => `/logos/${String(abbr || "").toUpperCase()}.png`;

/* fetch with cache-bust */
function useJson(url) {
  const [data, setData] = useState(null);
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
        if (alive) setData(j);
      } catch (e) {
        if (alive) setErr(String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [url]);
  return { data, loading, err };
}

/* CSV */
const escapeCSV = (s) => {
  const v = String(s ?? "");
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
function downloadCSV(rows, cols, fname = "nfl_showdown_projections.csv") {
  const header = cols.map((c) => c.label).join(",");
  const body = rows.map((r) =>
    cols.map((c) => {
      let val = r[c.key];
      if (c.type === "money") val = fmt0(val);
      if (c.type === "num1")  val = fmt1(val);
      if (c.type === "pct")   val = fmtPct(val);
      return escapeCSV(val ?? "");
    }).join(",")
  ).join("\n");
  const blob = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fname; a.click();
  URL.revokeObjectURL(url);
}

/* ---------------- heatmap rules + palettes ---------------- */
// Direction: higher/lower for table field keys (we normalize to sal/proj/val/pOwn/opt)
function dirForKey(k) {
  if (!k) return null;
  const id = String(k).toLowerCase();
  if (id === "sal") return null;         // never color salaries
  if (id === "pown") return "lower";     // ownership lower = better (Flex/CPT/MVP all treated the same)
  if (id === "opt")  return "higher";    // opt% higher = better
  if (id === "proj" || id === "val") return "higher";
  return null;
}

// palette: 'rdylgn' (red→yellow→green), 'blueorange' (blue→white→orange), 'none'
function heatColor(min, max, v, dir, palette) {
  if (palette === "none") return null;
  if (v == null || min == null || max == null || min === max || !dir) return null;
  let t = (v - min) / (max - min);
  t = Math.max(0, Math.min(1, t));
  if (dir === "lower") t = 1 - t;

  if (palette === "blueorange") {
    if (t < 0.5) {
      const u = t / 0.5; // blue → white
      const h = 220, s = 60 - u * 55, l = 90 + u * 7;
      return `hsl(${h}, ${s}%, ${l}%)`;
    } else {
      const u = (t - 0.5) / 0.5; // white → orange
      const h = 30, s = 5 + u * 80, l = 97 - u * 7;
      return `hsl(${h}, ${s}%, ${l}%)`;
    }
  }
  // rd → yl → gn
  if (t < 0.5) {
    const u = t / 0.5, h = 0 + u * 60, s = 78 + u * 10, l = 94 - u * 2;
    return `hsl(${h}, ${s}%, ${l}%)`;
  } else {
    const u = (t - 0.5) / 0.5, h = 60 + u * 60, s = 88 - u * 18, l = 92 + u * 2;
    return `hsl(${h}, ${s}%, ${l}%)`;
  }
}
const legendStyle = (palette) =>
  palette === "blueorange"
    ? { background: "linear-gradient(90deg, hsl(220,60%,90%) 0%, hsl(0,0%,97%) 50%, hsl(30,85%,90%) 100%)" }
    : palette === "none"
    ? { background: "linear-gradient(90deg, #f3f4f6, #e5e7eb)" }
    : { background: "linear-gradient(90deg, hsl(0,78%,94%) 0%, hsl(60,88%,92%) 50%, hsl(120,70%,94%) 100%)" };

/* ------------------------------- page ------------------------------- */
export default function NflProjectionsShowdown() {
  const { data: projRaw, loading: projLoading, err: projErr } = useJson(PROJ_SRC);
  const { data: idsRaw,  loading: idsLoading,  err: idsErr  } = useJson(IDS_SRC);

  const rawRows = useMemo(() => {
    const arr = Array.isArray(projRaw) ? projRaw : projRaw?.rows ?? projRaw?.data ?? [];
    return Array.isArray(arr) ? arr : [];
  }, [projRaw]);

  // Build FD salary maps from site_ids.json, by team for DST (nickname/full name mismatch safe)
  const fdSalaryByTeam = useMemo(() => {
    const out = { flex: new Map(), mvp: new Map() };
    const fd = idsRaw?.fd || [];
    for (const r of fd) {
      const team = String(r.team || "").toUpperCase();
      const pos  = String(r.pos || "").toUpperCase();
      if (!team) continue;
      if (pos === "D" || pos === "DST" || pos === "DEF" || pos === "DEFENSE") {
        const f = toNum(r.salary_flex);
        const m = toNum(r.salary_mvp);
        if (f != null && f > 0) out.flex.set(team, f);
        if (m != null && m > 0) out.mvp.set(team, m);
      }
    }
    return out;
  }, [idsRaw]);

  const [site, setSite] = useState("fd");  // default to FD
  const [slot, setSlot] = useState("flex");
  const [q, setQ] = useState("");
  const [palette, setPalette] = useState("none"); // default OFF

  // normalize rows + DST display (FD full team name, DK nickname)
  const rows = useMemo(() => {
    return rawRows.map((r) => {
      const pos  = r.pos ?? r.Pos ?? "";
      const team = (r.team ?? r.Team ?? "").toUpperCase();
      const opp  = (r.opp ?? r.Opp ?? r.OPP ?? "").toUpperCase();

      // projections
      const dk_proj = pick(r, ["DK Proj", "dk_proj", "dk_flex_proj", "DK Flex Proj", "dk_projection"]);
      const fd_proj = pick(r, ["FD Proj", "fd_proj", "fd_flex_proj", "FD Flex Proj", "fd_projection"]);

      // salaries
      const dk_sal     = pick(r, ["DK Sal", "dk_sal", "DK Flex Sal", "dk_flex_sal"]);
      const dk_cpt_sal = pick(r, ["DK CPT Sal", "dk_cpt_sal"]);
      const fd_sal     = pick(r, ["FD Sal", "fd_sal", "FD Flex Sal", "fd_flex_sal"]);
      const fd_mvp_sal = pick(r, ["FD MVP Sal", "fd_mvp_sal"]);

      // ownership / opt (we'll normalize to pOwn / opt later; here we just collect)
      const dk_flex_pown = pick(r, ["DK Flex pOWN%", "DK Flex pOWN", "dk_flex_pown", "dk_flex_own", "dk_pown"]);
      const dk_cpt_pown  = pick(r, ["DK CPT pOWN%", "DK CPT pOWN", "DK Cap pOWN%", "dk_cpt_pown", "dk_capt_pown", "dk_cpt_own", "dk_capt_own"]);
      const dk_flex_opt  = pick(r, ["DK Flex Opt%", "DK Flex Opt", "dk_flex_opt", "dk_opt"]);
      const dk_cpt_opt   = pick(r, ["DK CPT Opt%", "DK Cap Opt%", "dk_cpt_opt", "dk_capt_opt"]);

      const fd_flex_pown = pick(r, ["FD Flex pOWN%", "FD Flex pOWN", "fd_flex_pown", "fd_pown", "fd_flex_own"]);
      const fd_mvp_pown  = pick(r, ["FD MVP pOWN%", "FD MVP pOWN", "fd_mvp_pown", "fd_mvp_own"]);
      const fd_flex_opt  = pick(r, ["FD Flex Opt%", "FD Flex Opt", "fd_flex_opt", "fd_opt"]);
      const fd_mvp_opt   = pick(r, ["FD MVP Opt%", "FD MVP Opt", "fd_mvp_opt"]);

      // Player display (DST special case: FD full name, DK nickname)
      const basePlayer = r.player ?? r.Player ?? "";
      const player = isDSTPos(pos)
        ? (site === "dk" ? (TEAM_FULL[team]?.split(" ").slice(-1)[0] || basePlayer) : TEAM_FULL[team] || basePlayer)
        : basePlayer;

      return {
        player, pos, team, opp,
        dk_proj, dk_sal, dk_cpt_sal,
        dk_flex_pown, dk_cpt_pown, dk_flex_opt, dk_cpt_opt,
        fd_proj, fd_sal, fd_mvp_sal,
        fd_flex_pown, fd_mvp_pown, fd_flex_opt, fd_mvp_opt,
      };
    });
  }, [rawRows, site]);

  // search
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      `${r.player} ${r.pos} ${r.team} ${r.opp}`.toLowerCase().includes(s)
    );
  }, [rows, q]);

  // apply site/slot with backfill (Flex <-> CPT/MVP) + FD DST salary from site_ids
  const modeRows = useMemo(() => {
    const useCptOrMvp = slot !== "flex";
    const mult = useCptOrMvp ? 1.5 : 1.0;

    return filtered.map((r) => {
      if (site === "dk") {
        let baseSalNum = toNum(r.dk_sal);     // DK Flex
        let cptSalNum  = toNum(r.dk_cpt_sal); // DK CPT

        // cross-fill between flex <-> cpt
        if ((cptSalNum ?? 0) <= 0 && (baseSalNum ?? 0) > 0) cptSalNum  = Math.round(baseSalNum * 1.5);
        if ((baseSalNum ?? 0) <= 0 && (cptSalNum  ?? 0) > 0) baseSalNum = Math.round(cptSalNum / 1.5);

        const salNum = useCptOrMvp ? (cptSalNum ?? baseSalNum) : baseSalNum;

        const proj = toNum(r.dk_proj) == null ? "" : (toNum(r.dk_proj) * mult);
        const val  = computeVal(proj, salNum);
        const pOwn = useCptOrMvp ? r.dk_cpt_pown : r.dk_flex_pown;
        const opt  = useCptOrMvp ? r.dk_cpt_opt  : r.dk_flex_opt;

        return {
          ...r,
          sal: salNum, proj, val, pOwn, opt,
          salLabel: useCptOrMvp ? "DK CPT Sal" : "DK Sal",
          projLabel: useCptOrMvp ? "DK CPT Proj" : "DK Proj",
          pOwnLabel: useCptOrMvp ? "DK CPT pOWN%" : "DK Flex pOWN%",
          optLabel:  useCptOrMvp ? "DK CPT Opt%"  : "DK Flex Opt%",
        };
      }

      // FD branch
      let baseSalNum = toNum(r.fd_sal);     // FD Flex
      let mvpSalNum  = toNum(r.fd_mvp_sal); // FD MVP

      // If it's a DST and salaries are missing, pull from site_ids by team
      if (isDSTPos(r.pos)) {
        const teamKey = r.team; // already uppercased
        if ((baseSalNum ?? 0) <= 0) {
          const f = fdSalaryByTeam.flex.get(teamKey);
          if (f != null) baseSalNum = f;
        }
        if ((mvpSalNum ?? 0) <= 0) {
          const m = fdSalaryByTeam.mvp.get(teamKey);
          if (m != null) mvpSalNum = m;
        }
      }

      // cross-fill flex <-> mvp
      if ((mvpSalNum  ?? 0) <= 0 && (baseSalNum ?? 0) > 0) mvpSalNum  = Math.round(baseSalNum * 1.5);
      if ((baseSalNum ?? 0) <= 0 && (mvpSalNum  ?? 0) > 0) baseSalNum = Math.round(mvpSalNum / 1.5);

      const salNum = useCptOrMvp ? (mvpSalNum ?? baseSalNum) : baseSalNum;

      const proj = toNum(r.fd_proj) == null ? "" : (toNum(r.fd_proj) * mult);
      const val  = computeVal(proj, salNum);
      const pOwn = useCptOrMvp ? r.fd_mvp_pown : r.fd_flex_pown;
      const opt  = useCptOrMvp ? r.fd_mvp_opt  : r.fd_flex_opt;

      return {
        ...r,
        sal: salNum, proj, val, pOwn, opt,
        salLabel: useCptOrMvp ? "FD MVP Sal" : "FD Sal",
        projLabel: useCptOrMvp ? "FD MVP Proj" : "FD Proj",
        pOwnLabel: useCptOrMvp ? "FD MVP pOWN%" : "FD Flex pOWN%",
        optLabel:  useCptOrMvp ? "FD MVP Opt%"  : "FD Flex Opt%",
      };
    });
  }, [filtered, site, slot, fdSalaryByTeam]);

  // columns with width hints (auto-fit)
  const columns = useMemo(() => {
    const isDK = site === "dk";
    const sal  = isDK ? (slot === "flex" ? "DK Sal"      : "DK CPT Sal")
                      : (slot === "flex" ? "FD Sal"      : "FD MVP Sal");
    const proj = isDK ? (slot === "flex" ? "DK Proj"     : "DK CPT Proj")
                      : (slot === "flex" ? "FD Proj"     : "FD MVP Proj");
    const pown = isDK ? (slot === "flex" ? "DK Flex pOWN%" : "DK CPT pOWN%")
                      : (slot === "flex" ? "FD Flex pOWN%" : "FD MVP pOWN%");
    const opt  = isDK ? (slot === "flex" ? "DK Flex Opt%"  : "DK CPT Opt%")
                      : (slot === "flex" ? "FD Flex Opt%"  : "FD MVP Opt%");

    return [
      { key: "player", label: "Player", type: "text", thClass: "w-[160px]", tdClass: "w-[160px] max-w-[160px]" },
      { key: "pos",    label: "Pos",    type: "text",  thClass: "w-[52px]",     tdClass: "w-[52px]" },
      { key: "team",   label: "Team",   type: "text",  thClass: "w-[64px]",     tdClass: "w-[64px]" },
      { key: "opp",    label: "Opp",    type: "text",  thClass: "w-[64px]",     tdClass: "w-[64px]" },
      { key: "sal",    label: sal,      type: "money", thClass: "w-[92px]",     tdClass: "w-[92px]" },
      { key: "proj",   label: proj,     type: "num1",  thClass: "w-[72px]",     tdClass: "w-[72px]" },
      { key: "val",    label: isDK ? "DK Val" : "FD Val", type: "num1", thClass: "w-[72px]", tdClass: "w-[72px]" },
      { key: "pOwn",   label: pown,     type: "pct",   thClass: "w-[84px]",     tdClass: "w-[84px]" },
      { key: "opt",    label: opt,      type: "pct",   thClass: "w-[84px]",     tdClass: "w-[84px]" },
    ];
  }, [site, slot]);

  // sort
  const [sort, setSort] = useState({ key: "proj", dir: "desc" });
  useEffect(() => { setSort({ key: "proj", dir: "desc" }); }, [site, slot]);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const arr = [...modeRows];
    const typeFor = (k) => columns.find((c) => c.key === k)?.type;
    arr.sort((a, b) => {
      const t = typeFor(sort.key);
      const av = t === "text" ? String(a[sort.key] ?? "").toLowerCase() : toNum(a[sort.key]);
      const bv = t === "text" ? String(b[sort.key] ?? "").toLowerCase() : toNum(b[sort.key]);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (t === "text") return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
      return (av - bv) * dir;
    });
    return arr;
  }, [modeRows, sort, columns]);

  const onSort = (col) => {
    setSort((prev) => {
      if (prev.key !== col.key) return { key: col.key, dir: "desc" };
      return { key: col.key, dir: prev.dir === "desc" ? "asc" : "desc" };
    });
  };

  /* --------- heat stats over visible rows --------- */
  const heatStats = useMemo(() => {
    const stats = {};
    if (!sorted.length) return stats;
    for (const c of columns) {
      const dir = dirForKey(c.key);
      if (!dir) continue;
      let min = Infinity, max = -Infinity;
      for (const r of sorted) {
        // for % columns we allow "12%" strings; strip % for range
        const raw = c.type === "pct" ? String(r[c.key]).replace("%","") : r[c.key];
        const v = toNum(raw);
        if (v == null) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (min !== Infinity && max !== -Infinity) stats[c.key] = { min, max, dir };
    }
    return stats;
  }, [sorted, columns]);

  /* compact look */
  const textSz = "text-[11px]";
  const cell   = "px-1.5 py-1 text-center tabular-nums";
  const header = "px-1.5 py-1 font-semibold text-center";

  const loading = projLoading || idsLoading;
  const err = projErr || idsErr;

  return (
    // WIDTH CAP + centered content
    <div className="mx-auto max-w-[1200px] 2xl:max-w-[1400px] px-4 md:px-6 py-5">
      <div className="flex items-start md:items-center justify-between gap-3 mb-2 flex-col md:flex-row">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold mb-0.5">NFL — DFS Projections (Showdown)</h1>
          <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-2">
            <span>Lower ⟶ Higher</span>
            <span className="h-3 w-28 rounded" style={legendStyle(palette)} />
            <span className="ml-2">(color on Proj/Val/Opt = higher better; pOWN% = lower better)</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Site toggle */}
          <div className="inline-flex items-center gap-1 rounded-xl bg-gray-100 p-1">
            {["dk", "fd"].map((k) => (
              <button
                key={k}
                onClick={() => setSite(k)}
                className={`px-3 py-1.5 rounded-lg text-sm inline-flex items-center gap-1 ${
                  site === k ? "bg-white shadow font-semibold" : "text-gray-700"
                }`}
              >
                {k === "dk" ? <img src="/logos/dk.png" alt="DK" className="w-4 h-4" /> : <img src="/logos/fd.png" alt="FD" className="w-4 h-4" />}
                <span>{k.toUpperCase()}</span>
              </button>
            ))}
          </div>

          {/* Slot toggle */}
          <div className="inline-flex items-center gap-1 rounded-xl bg-gray-100 p-1">
            {site === "dk" ? (
              <>
                <button
                  className={`px-3 py-1.5 rounded-lg text-sm ${slot === "flex" ? "bg-white shadow font-semibold" : "text-gray-700"}`}
                  onClick={() => setSlot("flex")}
                >DK Flex</button>
                <button
                  className={`px-3 py-1.5 rounded-lg text-sm ${slot === "cpt" ? "bg-white shadow font-semibold" : "text-gray-700"}`}
                  onClick={() => setSlot("cpt")}
                >DK CPT</button>
              </>
            ) : (
              <>
                <button
                  className={`px-3 py-1.5 rounded-lg text-sm ${slot === "flex" ? "bg-white shadow font-semibold" : "text-gray-700"}`}
                  onClick={() => setSlot("flex")}
                >FD Flex</button>
                <button
                  className={`px-3 py-1.5 rounded-lg text-sm ${slot === "mvp" ? "bg-white shadow font-semibold" : "text-gray-700"}`}
                  onClick={() => setSlot("mvp")}
                >FD MVP</button>
              </>
            )}
          </div>

          {/* search */}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search player / team / opp…"
            className="px-3 py-2 rounded-lg border w-56 md:w-64 text-sm"
          />

          {/* palette (default None) */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600 hidden md:block">Palette</label>
            <select
              value={palette}
              onChange={(e) => setPalette(e.target.value)}
              className="h-8 rounded-lg border px-2 text-xs"
            >
              <option value="none">None</option>
              <option value="rdylgn">Rd–Yl–Gn</option>
              <option value="blueorange">Blue–Orange</option>
            </select>
          </div>

          {/* export */}
          <button
            className="ml-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
            onClick={() => downloadCSV(sorted, columns)}
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* table wrapper keeps horizontal scroll if needed */}
      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
        <table
          className={`border-separate table-auto w-max min-w-full ${textSz}`}
          style={{ borderSpacing: 0 }}
        >
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {columns.map((c, idx) => (
                <th
                  key={c.key}
                  className={`${header} whitespace-nowrap ${c.thClass || ""} cursor-pointer select-none ${
                    idx === 0 ? "sticky left-0 z-20 bg-gray-50 shadow-[inset_-6px_0_6px_-6px_rgba(0,0,0,0.15)]" : ""
                  }`}
                  onClick={() => onSort(c)}
                  title="Click to sort"
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
            { (projLoading || idsLoading) && (
              <tr><td className={`px-2 py-2 text-gray-500 text-center`} colSpan={columns.length}>Loading…</td></tr>
            )}
            { (projErr || idsErr) && !(projLoading || idsLoading) && (
              <tr><td className={`px-2 py-2 text-red-600 text-center`} colSpan={columns.length}>Failed to load: {projErr || idsErr}</td></tr>
            )}

            {!projLoading && !idsLoading && !(projErr || idsErr) && sorted.map((r, i) => (
              <tr key={`${r.player}-${i}`} className="odd:bg-white even:bg-gray-50">
                {columns.map((c, idx) => {
                  if (c.key === "player") {
                    // Frozen first column with logo + name
                    return (
                      <td
                        key={c.key}
                        className={`sticky left-0 z-10 px-2 py-1 text-left ${
                          i % 2 === 0 ? "bg-white" : "bg-gray-50"
                        } shadow-[inset_-6px_0_6px_-6px_rgba(0,0,0,0.15)] w-[160px] max-w-[160px]`}
                      >
                        <div className="flex items-center gap-1 min-w-0">
                          <img
                            src={logoSrc(r.team)}
                            alt={r.team}
                            className="w-4 h-4 flex-none"
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = logoSrcAlt(r.team);
                            }}
                          />
                          <span className="truncate">{r.player}</span>
                        </div>
                      </td>
                    );
                  }

                  // Heat background for metrics (proj/val/opt/pOwn)
                  const stat = heatStats[c.key];
                  // for % cells, strip % before parsing range value
                  const rawForRange = c.type === "pct" ? String(r[c.key]).replace("%","") : r[c.key];
                  const vNum = toNum(rawForRange);
                  const bg = stat ? heatColor(stat.min, stat.max, vNum, stat.dir, palette) : null;

                  let content = r[c.key];
                  if (c.type === "money") content = fmt0(content);
                  if (c.type === "num1")  content = fmt1(content);
                  if (c.type === "pct")   content = fmtPct(content);

                  const align = c.key === "player" ? "text-left" : "text-center";
                  return (
                    <td
                      key={c.key}
                      className={`${c.tdClass || ""} ${c.type === "text" ? "px-2" : ""} ${align} py-1 whitespace-nowrap ${c.type !== "text" ? "tabular-nums px-1.5" : ""}`}
                      style={bg ? { backgroundColor: bg } : undefined}
                      title={String(content ?? "")}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}

            {!projLoading && !idsLoading && !(projErr || idsErr) && !sorted.length && (
              <tr><td className={`px-2 py-2 text-gray-500 text-center`} colSpan={columns.length}>No data.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
