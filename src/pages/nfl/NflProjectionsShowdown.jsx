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

  const [site, setSite] = useState("fd");  // default to FD since that's where issue was
  const [slot, setSlot] = useState("flex");
  const [q, setQ] = useState("");

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

      // ownership / opt
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
      { key: "player", label: "Player", type: "text",  thClass: "min-w-[180px]", tdClass: "" },
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

  /* compact look */
  const textSz = "text-[11px]"; // slightly smaller
  const cell   = "px-1.5 py-1 text-center tabular-nums";
  const header = "px-1.5 py-1 font-semibold text-center";

  const loading = projLoading || idsLoading;
  const err = projErr || idsErr;

  return (
    <div className="px-4 md:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h1 className="text-2xl md:text-3xl font-extrabold mb-0.5">NFL — DFS Projections (Showdown)</h1>
        <div className="flex items-center gap-2">
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
            className="px-3 py-2 rounded-lg border w-64"
          />

          {/* export */}
          <button
            className="ml-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
            onClick={() => downloadCSV(sorted, columns)}
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-auto">
        <table
          className={`w-full border-separate table-auto ${textSz}`}
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
            {loading && (
              <tr><td className={`${cell} text-gray-500`} colSpan={columns.length}>Loading…</td></tr>
            )}
            {err && !loading && (
              <tr><td className={`${cell} text-red-600`} colSpan={columns.length}>Failed to load: {err}</td></tr>
            )}

            {!loading && !err && sorted.map((r, i) => (
              <tr key={`${r.player}-${i}`} className="odd:bg-white even:bg-gray-50">
                {columns.map((c, idx) => {
                  if (c.key === "player") {
                    // Frozen first column with logo + name
                    return (
                      <td
                        key={c.key}
                        className={`px-2 py-1 text-left whitespace-nowrap sticky left-0 z-10 ${
                          i % 2 === 0 ? "bg-white" : "bg-gray-50"
                        } shadow-[inset_-6px_0_6px_-6px_rgba(0,0,0,0.15)] ${c.tdClass || ""}`}
                      >
                        <div className="flex items-center gap-2">
                          <img
                            src={logoSrc(r.team)}
                            alt={r.team}
                            className="w-5 h-5"
                            onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = logoSrcAlt(r.team); }}
                          />
                          <span>{r.player}</span>
                        </div>
                      </td>
                    );
                  }

                  // other cells
                  let content = r[c.key];
                  if (c.type === "money") content = fmt0(content);
                  if (c.type === "num1")  content = fmt1(content);
                  if (c.type === "pct")   content = fmtPct(content);

                  const align = c.type === "text" ? "text-left" : "text-center";
                  return (
                    <td
                      key={c.key}
                      className={`${c.tdClass || ""} ${c.type === "text" ? "px-2" : ""} ${align} py-1 whitespace-nowrap ${c.type !== "text" ? "tabular-nums px-1.5" : ""}`}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}

            {!loading && !err && !sorted.length && (
              <tr><td className={`${cell} text-gray-500`} colSpan={columns.length}>No data.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
