// src/pages/nfl/NflProjectionsShowdown.jsx
import React, { useEffect, useMemo, useState } from "react";

/* ------------------------------------------------------------------
   Unified showdown table (single, compact table)
   - DK/FD site toggle
   - Flex vs CPT (DK) / Flex vs MVP (FD)
   - Auto 1.5x for CPT/MVP (and robust salary backfill Flex <-> CPT/MVP)
   - Sort, search, CSV export
   - Logos (PNG) and DST naming fixes (DK = nickname, FD = full)
   - Reads /data/nfl/showdown/latest/projections.json
------------------------------------------------------------------- */

const SOURCE = "/data/nfl/showdown/latest/projections.json";

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
  // value as points per $1k
  return (p / (s / 1000)).toFixed(1);
};
const isDSTPos = (pos) => /^(DST|D\/ST|DEF|DEFENSE)$/i.test(String(pos).trim());
const nickname = (abbr) => {
  const full = TEAM_FULL[abbr];
  if (!full) return abbr;
  const parts = full.split(" ");
  return parts[parts.length - 1]; // "Eagles"
};

/* PNG logos */
const logoSrc    = (abbr) => `/logos/nfl/${String(abbr || "").toUpperCase()}.png`;
const logoSrcAlt = (abbr) => `/logos/${String(abbr || "").toUpperCase()}.png`;

/* fetch with cache-bust */
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
        const data = Array.isArray(j) ? j : j?.rows ?? j?.data ?? [];
        if (alive) setRows(data);
      } catch (e) {
        if (alive) setErr(String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [url]);
  return { rows, loading, err };
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
  const { rows: raw, loading, err } = useJson(SOURCE);

  const [site, setSite] = useState("dk");   // "dk" | "fd"
  const [slot, setSlot] = useState("flex"); // "flex" | "cpt" (dk) | "mvp" (fd)
  const [q, setQ] = useState("");

  /* normalize rows + DST display by site (DK nickname, FD full) */
  const rows = useMemo(() => {
    return raw.map((r) => {
      const pos  = r.pos ?? r.Pos ?? "";
      const team = r.team ?? r.Team ?? "";
      const opp  = r.opp ?? r.Opp ?? r.OPP ?? "";

      // projections (allow multiple spellings)
      const dk_proj = pick(r, ["DK Proj", "dk_proj", "dk_flex_proj", "DK Flex Proj", "dk_projection"]);
      const fd_proj = pick(r, ["FD Proj", "fd_proj", "fd_flex_proj", "FD Flex Proj", "fd_projection"]);

      // salaries
      const dk_sal     = pick(r, ["DK Sal", "dk_sal", "DK Flex Sal", "dk_flex_sal"]);
      const dk_cpt_sal = pick(r, ["DK CPT Sal", "dk_cpt_sal"]);
      const fd_sal     = pick(r, ["FD Sal", "fd_sal", "FD Flex Sal", "fd_flex_sal"]);
      const fd_mvp_sal = pick(r, ["FD MVP Sal", "fd_mvp_sal"]);

      // ownership / opt (various spellings)
      const dk_flex_pown = pick(r, ["DK Flex pOWN%", "DK Flex pOWN", "dk_flex_pown", "dk_flex_own", "dk_pown"]);
      const dk_cpt_pown  = pick(r, ["DK CPT pOWN%", "DK CPT pOWN", "DK Cap pOWN%", "dk_cpt_pown", "dk_capt_pown", "dk_cpt_own", "dk_capt_own"]);
      const dk_flex_opt  = pick(r, ["DK Flex Opt%", "DK Flex Opt", "dk_flex_opt", "dk_opt"]);
      const dk_cpt_opt   = pick(r, ["DK CPT Opt%", "DK Cap Opt%", "dk_cpt_opt", "dk_capt_opt"]);

      const fd_flex_pown = pick(r, ["FD Flex pOWN%", "FD Flex pOWN", "fd_flex_pown", "fd_pown", "fd_flex_own"]);
      const fd_mvp_pown  = pick(r, ["FD MVP pOWN%", "FD MVP pOWN", "fd_mvp_pown", "fd_mvp_own"]);
      const fd_flex_opt  = pick(r, ["FD Flex Opt%", "FD Flex Opt", "fd_flex_opt", "fd_opt"]);
      const fd_mvp_opt   = pick(r, ["FD MVP Opt%", "FD MVP Opt", "fd_mvp_opt"]);

      // player display (DST special case depends on active site)
      const basePlayer = r.player ?? r.Player ?? "";
      const player = isDSTPos(pos)
        ? (site === "dk" ? nickname(team) : TEAM_FULL[team] || basePlayer)
        : basePlayer;

      return {
        player, pos, team, opp,
        dk_proj, dk_sal, dk_cpt_sal,
        dk_flex_pown, dk_cpt_pown, dk_flex_opt, dk_cpt_opt,
        fd_proj, fd_sal, fd_mvp_sal,
        fd_flex_pown, fd_mvp_pown, fd_flex_opt, fd_mvp_opt,
      };
    });
  }, [raw, site]);

  /* search filter */
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      `${r.player} ${r.pos} ${r.team} ${r.opp}`.toLowerCase().includes(s)
    );
  }, [rows, q]);

  /* apply site/slot + robust salary backfill (Flex <-> CPT/MVP) */
  const modeRows = useMemo(() => {
    const isDK = site === "dk";
    const useCptOrMvp = slot !== "flex";
    const mult = useCptOrMvp ? 1.5 : 1.0;

    return filtered.map((r) => {
      if (isDK) {
        let baseSalNum = toNum(r.dk_sal);      // Flex
        let cptSalNum  = toNum(r.dk_cpt_sal);  // CPT

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
      } else {
        let baseSalNum = toNum(r.fd_sal);      // Flex
        let mvpSalNum  = toNum(r.fd_mvp_sal);  // MVP

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
      }
    });
  }, [filtered, site, slot]);

  /* columns */
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
      { key: "player", label: "Player", type: "text" },
      { key: "pos",    label: "Pos",    type: "text" },
      { key: "team",   label: "Team",   type: "text" },
      { key: "opp",    label: "Opp",    type: "text" },
      { key: "sal",    label: sal,  type: "money" },
      { key: "proj",   label: proj, type: "num1"  },
      { key: "val",    label: isDK ? "DK Val" : "FD Val", type: "num1" },
      { key: "pOwn",   label: pown, type: "pct"   },
      { key: "opt",    label: opt,  type: "pct"   },
    ];
  }, [site, slot]);

  /* sort */
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
  const textSz = "text-[12px]";
  const cell   = "px-2 py-1 text-center";
  const header = "px-2 py-1 font-semibold text-center";

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
                title="Toggle site"
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
        <table className={`w-full border-separate ${textSz}`} style={{ borderSpacing: 0 }}>
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`${header} whitespace-nowrap cursor-pointer select-none`}
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
              <tr>
                <td className={`${cell} text-gray-500`} colSpan={columns.length}>Loading…</td>
              </tr>
            )}
            {err && (
              <tr>
                <td className={`${cell} text-red-600`} colSpan={columns.length}>Failed to load: {err}</td>
              </tr>
            )}
            {!loading && !err && sorted.map((r, i) => (
              <tr key={`${r.player}-${i}`} className="odd:bg-white even:bg-gray-50">
                {columns.map((c) => {
                  if (c.key === "player") {
                    return (
                      <td key={c.key} className="px-2 py-1 text-left whitespace-nowrap">
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
                  const cls = c.type === "text" ? "px-2 py-1 text-left whitespace-nowrap" : `${cell} tabular-nums`;
                  let val = r[c.key];
                  if (c.type === "money") val = fmt0(val);
                  if (c.type === "num1")  val = fmt1(val);
                  if (c.type === "pct")   val = fmtPct(val);
                  return <td key={c.key} className={cls}>{val ?? ""}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
