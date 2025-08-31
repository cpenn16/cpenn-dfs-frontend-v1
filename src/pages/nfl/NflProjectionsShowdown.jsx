import React, { useEffect, useMemo, useState } from "react";

/* ------------------------------- config ------------------------------- */
const SOURCE = "/data/nfl/showdown/latest/projections.json";

const SITES = {
  dk:   { key: "dk",   label: "DK",   logo: "/logos/dk.png" },
  fd:   { key: "fd",   label: "FD",   logo: "/logos/fd.png" },
  both: { key: "both", label: "BOTH", logo: null },
};

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

/* ------------------------------ helpers ------------------------------- */
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
  if (v == null || v === "") return "";
  const s = String(v).trim();
  if (/%$/.test(s)) return s.replace(/%+$/, "%"); // collapse %% → %
  const n = toNum(s);
  return n == null ? "" : `${n.toFixed(1)}%`;
};
const pick = (obj, keys, fallback = "") => {
  for (const k of keys) {
    if (k in obj && obj[k] !== "" && obj[k] != null) return obj[k];
  }
  return fallback;
};

/* fetch with cache-bust during dev */
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

/* ----------------------------- UI bits ------------------------------ */
function Toggle({ value, onChange }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-gray-100 p-1">
      {["dk", "fd", "both"].map((k) => (
        <button
          key={k}
          className={`px-2.5 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 ${
            value === k ? "bg-white shadow" : "text-gray-700 hover:text-gray-900"
          }`}
          onClick={() => onChange(k)}
        >
          {SITES[k].logo ? <img src={SITES[k].logo} alt="" className="w-4 h-4" /> : null}
          <span>{SITES[k].label}</span>
        </button>
      ))}
    </div>
  );
}

function SortChevron({ dir }) {
  if (!dir) return null;
  return <span className="ml-1 text-gray-500">{dir === "asc" ? "▲" : "▼"}</span>;
}

function sortValue(type, v) {
  if (type === "money" || type === "num1" || type === "pct") return toNum(v) ?? -Infinity;
  return String(v ?? "").toLowerCase();
}

function SiteGroup({ site, rows, cols, sort, onSort, compact = true }) {
  const sorted = useMemo(() => {
    if (!sort?.key) return rows;
    const c = cols.find((x) => x.key === sort.key);
    if (!c) return rows;
    const dir = sort.dir === "desc" ? -1 : 1;
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = sortValue(c.type, a[c.key]);
      const bv = sortValue(c.type, b[c.key]);
      if (av < bv) return -1 * dir;
      if (av > bv) return  1 * dir;
      return String(a.player).localeCompare(String(b.player)) * dir;
    });
    return arr;
  }, [rows, cols, sort]);

  const handleSort = (key) => {
    if (sort?.key === key) {
      onSort({ key, dir: sort.dir === "asc" ? "desc" : "asc" });
    } else {
      onSort({ key, dir: "desc" });
    }
  };

  const cellPad = compact ? "px-2 py-1" : "px-3 py-2";

  return (
    <div className="rounded-xl bg-white shadow ring-1 ring-black/5 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-gray-50">
        {site.logo && <img src={site.logo} alt="" className="w-5 h-5" />}
        <span className="font-semibold">{site.label}</span>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className={`${cellPad} text-left sticky left-0 z-10 bg-gray-50`}>Player</th>
              <th className={`${cellPad} text-center sticky left-[170px] z-10 bg-gray-50`}>Pos</th>
              <th className={`${cellPad} text-center sticky left-[220px] z-10 bg-gray-50`}>Team</th>
              <th className={`${cellPad} text-center sticky left-[270px] z-10 bg-gray-50`}>Opp</th>
              {cols.map((c) => {
                const active = sort?.key === c.key ? sort.dir : undefined;
                return (
                  <th
                    key={c.key}
                    className={`${cellPad} text-right font-semibold select-none cursor-pointer`}
                    onClick={() => handleSort(c.key)}
                    title="Click to sort"
                  >
                    <span className="inline-flex items-center">
                      {c.label}
                      <SortChevron dir={active} />
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} className={i % 2 ? "bg-white" : "bg-gray-50/40"}>
                {/* frozen left cells */}
                <td className={`${cellPad} text-left sticky left-0 bg-white whitespace-nowrap`}>
                  {r.player}
                </td>
                <td className={`${cellPad} text-center sticky left-[170px] bg-white`}>{r.pos}</td>
                <td className={`${cellPad} text-center sticky left-[220px] bg-white`}>{r.team}</td>
                <td className={`${cellPad} text-center sticky left-[270px] bg-white`}>{r.opp}</td>

                {/* dynamic value cells */}
                {cols.map((c) => {
                  let val = r[c.key];
                  if (c.type === "num1")  val = fmt1(val);
                  if (c.type === "money") val = fmt0(val);
                  if (c.type === "pct")   val = fmtPct(val);
                  return (
                    <td key={c.key} className={`${cellPad} text-right tabular-nums`}>
                      {val ?? ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------- page ------------------------------- */
export default function NflProjectionsShowdown() {
  const { rows: raw, loading, err } = useJson(SOURCE);

  // Map showdown feed keys → table keys.
  const rows = useMemo(() => {
    return raw.map((r) => {
      const pos  = r.pos ?? r.Pos ?? "";
      const team = r.team ?? r.Team ?? "";
      const opp  = r.opp ?? r.Opp ?? r.OPP ?? "";

      // FD/DK projections & value (allow header-like keys)
      const dk_proj = pick(r, ["dk_proj", "DK Proj", "dk_projection"]);
      const dk_val  = pick(r, ["dk_val",  "DK Val"]);
      const fd_proj = pick(r, ["fd_proj", "FD Proj", "fd_projection"]);
      const fd_val  = pick(r, ["fd_val",  "FD Val"]);

      // Salaries (prefer flex, then captain/MVP as fallback)
      const dk_sal = pick(r, ["dk_sal","dk_flex_sal","dk_cpt_sal"]);
      const fd_sal = pick(r, ["fd_sal","fd_flex_sal","fd_mvp_sal"]);

      // Ownership / Opt%
      const dk_flex_pown = pick(r, ["dk_flex_pown","dk_pown","dk_flex_own"]);
      const dk_flex_opt  = pick(r, ["dk_flex_opt","dk_opt"]);
      const dk_cpt_pown  = pick(r, ["dk_cpt_pown","dk_capt_pown","dk_cpt_own","dk_capt_own"]);
      const dk_cpt_opt   = pick(r, ["dk_cpt_opt","dk_capt_opt"]);

      const fd_flex_pown = pick(r, ["fd_flex_pown","fd_pown","fd_flex_own"]);
      const fd_flex_opt  = pick(r, ["fd_flex_opt","fd_opt"]);
      const fd_mvp_pown  = pick(r, ["fd_mvp_pown","fd_mvp_own"]);
      const fd_mvp_opt   = pick(r, ["fd_mvp_opt"]);

      // DST display name: use full team name
      const basePlayer = r.player ?? r.Player ?? "";
      const player =
        String(pos).toUpperCase() === "DST" && TEAM_FULL[team]
          ? TEAM_FULL[team]
          : basePlayer;

      return {
        player, pos, team, opp,
        dk_sal, dk_proj, dk_val,
        dk_flex_pown, dk_flex_opt, dk_cpt_pown, dk_cpt_opt,
        fd_sal, fd_proj, fd_val,
        fd_flex_pown, fd_flex_opt, fd_mvp_pown, fd_mvp_opt,
      };
    });
  }, [raw]);

  /* filters + sorts */
  const [site, setSite] = useState("both");
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      String(r.player).toLowerCase().includes(s) ||
      String(r.team).toLowerCase().includes(s) ||
      String(r.opp).toLowerCase().includes(s) ||
      String(r.pos).toLowerCase().includes(s)
    );
  }, [rows, q]);

  /* columns (compact view) */
  const COLS_DK = [
    { key: "dk_sal",       label: "DK Sal",        type: "money" },
    { key: "dk_proj",      label: "DK Proj",       type: "num1"  },
    { key: "dk_val",       label: "DK Val",        type: "num1"  },
    { key: "dk_flex_pown", label: "DK Flex pOWN%", type: "pct"   },
    { key: "dk_flex_opt",  label: "DK Flex Opt%",  type: "pct"   },
    { key: "dk_cpt_pown",  label: "DK CPT pOWN%",  type: "pct"   },
    { key: "dk_cpt_opt",   label: "DK CPT Opt%",   type: "pct"   },
  ];
  const COLS_FD = [
    { key: "fd_sal",       label: "FD Sal",        type: "money" },
    { key: "fd_proj",      label: "FD Proj",       type: "num1"  },
    { key: "fd_val",       label: "FD Val",        type: "num1"  },
    { key: "fd_flex_pown", label: "FD Flex pOWN%", type: "pct"   },
    { key: "fd_flex_opt",  label: "FD Flex Opt%",  type: "pct"   },
    { key: "fd_mvp_pown",  label: "FD MVP pOWN%",  type: "pct"   },
    { key: "fd_mvp_opt",   label: "FD MVP Opt%",   type: "pct"   },
  ];

  /* independent sorts for each table */
  const [sortDk, setSortDk] = useState({ key: "", dir: "desc" });
  const [sortFd, setSortFd] = useState({ key: "", dir: "desc" });

  return (
    <div className="px-4 md:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h1 className="text-2xl md:text-3xl font-extrabold mb-0.5">NFL — DFS Projections (Showdown)</h1>
        <div className="flex items-center gap-2">
          <Toggle value={site} onChange={setSite} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search player / team / opp…"
            className="px-3 py-2 rounded-lg border w-64"
          />
        </div>
      </div>

      {err && <div className="mb-3 text-red-600">Failed to load: <span className="font-mono">{String(err)}</span></div>}

      {loading ? (
        <div className="p-4">Loading…</div>
      ) : site === "dk" ? (
        <SiteGroup site={SITES.dk} rows={filtered} cols={COLS_DK} sort={sortDk} onSort={setSortDk} compact />
      ) : site === "fd" ? (
        <SiteGroup site={SITES.fd} rows={filtered} cols={COLS_FD} sort={sortFd} onSort={setSortFd} compact />
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <SiteGroup site={SITES.dk} rows={filtered} cols={COLS_DK} sort={sortDk} onSort={setSortDk} compact />
          <SiteGroup site={SITES.fd} rows={filtered} cols={COLS_FD} sort={sortFd} onSort={setSortFd} compact />
        </div>
      )}
    </div>
  );
}
