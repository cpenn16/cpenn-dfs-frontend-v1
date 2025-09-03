// src/pages/mlb/MlbPitcherProjections.jsx
import React, { useEffect, useMemo, useState, useLayoutEffect, useRef } from "react";

/* ------------------------------- config ------------------------------- */
const SOURCE = "/data/mlb/latest/pitcher_projections.json";

const SITES = {
  dk: { key: "dk", label: "DK", logo: "/logos/dk.png" },
  fd: { key: "fd", label: "FD", logo: "/logos/fd.png" },
  both: { key: "both", label: "Both" },
};

/** Header aliases we’ll tolerate coming from the sheet -> canonical keys */
const ALIASES = {
  player: ["player", "name", "pitcher", "player name"],
  pos: ["pos", "position"],
  team: ["team", "teamabbrev", "tm"],
  opp: ["opp", "opponent"],

  dk_sal: ["dk sal", "dk salary", "draftkings salary", "dk$"],
  fd_sal: ["fd sal", "fd salary", "fanduel salary", "fd$"],

  dk_proj: ["dk proj", "dk projection", "dk pts", "draftkings proj"],
  fd_proj: ["fd proj", "fd projection", "fd pts", "fanduel proj"],

  dk_val: ["dk val", "dk value"],
  fd_val: ["fd val", "fd value"],

  dk_pown: ["dk pown%", "dk pown", "dk own%", "dk ownership%"],
  fd_pown: ["fd pown%", "fd pown", "fd own%", "fd ownership%"],

  dk_opt: ["dk opt%", "dk opt"],
  fd_opt: ["fd opt%", "fd opt"],

  dk_lev: ["dk lev%", "dk leverage%", "dk lev"],
  fd_lev: ["fd lev%", "fd leverage%", "fd lev"],

  dk_rtg: ["dk rtg", "dk rating"],
  fd_rtg: ["fd rtg", "fd rating"],
};

/* ------------------------------ helpers ------------------------------- */
const lc = (s) => String(s ?? "").toLowerCase().trim();
const firstKey = (obj, names) => names.find((n) => Object.prototype.hasOwnProperty.call(obj, n));
const getVal = (row, keys) => row[firstKey(row, keys) ?? ""];

/** Normalize a single incoming row to canonical keys using ALIASES */
function normalizeRow(row) {
  const low = {};
  // build a lower-cased key map to be case/space tolerant
  for (const [k, v] of Object.entries(row)) low[lc(k)] = v;

  const out = {};
  for (const [canon, alts] of Object.entries(ALIASES)) {
    const key = firstKey(low, alts.map(lc));
    if (key) out[canon] = low[key];
  }
  // pass through common fields verbatim if we already matched
  return out;
}

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[,$%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const fmt0 = (v) => {
  const n = num(v);
  return n === null ? "" : n.toLocaleString();
};
const fmt1 = (v) => {
  const n = num(v);
  return n === null ? "" : n.toFixed(1);
};

const teamLogo = (team) => `/logos/mlb/${String(team || "").toUpperCase()}.png`;

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
        const raw = Array.isArray(j) ? j : j?.rows ?? [];
        const data = raw.map(normalizeRow);
        if (alive) setRows(data);
      } catch (e) {
        if (alive) setErr(String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [url]);
  return { rows, loading, err };
}

/* CSV export (only visible columns) */
const escapeCSV = (s) => {
  const v = String(s ?? "");
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
function downloadCSV(rows, cols, fname = "mlb_pitcher_projections.csv") {
  const header = cols.map((c) => c.label).join(",");
  const body = rows
    .map((r) =>
      cols
        .map((c) => {
          const val = r[c.key];
          if (c.type === "num1-force") return escapeCSV(fmt1(val));
          if (c.type === "num1") return escapeCSV(fmt1(val));
          if (c.type === "money") return escapeCSV(fmt0(val));
          return escapeCSV(val ?? "");
        })
        .join(",")
    )
    .join("\n");
  const blob = new Blob([header + "\n" + body], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fname;
  a.click();
  URL.revokeObjectURL(url);
}

/* small checkbox dropdown (for Teams) */
function TeamsDropdown({ allTeams, selected, onChange }) {
  const allSet = new Set(selected);
  const count = selected.length;
  const total = allTeams.length;

  const toggle = (tm) => {
    const next = new Set(allSet);
    if (next.has(tm)) next.delete(tm);
    else next.add(tm);
    onChange(Array.from(next));
  };

  const selectAll = () => onChange([...allTeams]);
  const clearAll = () => onChange([]);

  return (
    <details className="relative">
      <summary className="list-none cursor-pointer">
        <span className="px-3 py-1.5 rounded-lg bg-white shadow font-medium text-sm">
          Teams ({count}/{total})
        </span>
      </summary>
      <div className="absolute mt-2 z-20 bg-white border rounded-xl shadow-lg p-2 w-[260px]">
        <div className="flex items-center justify-between mb-2">
          <button
            className="text-xs px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200"
            onClick={(e) => {
              e.preventDefault();
              selectAll();
            }}
          >
            Select all
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1 max-h-64 overflow-auto pr-1">
          {allTeams.map((t) => (
            <label key={t} className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                className="accent-indigo-600"
                checked={allSet.has(t)}
                onChange={() => toggle(t)}
              />
              <span>{t}</span>
            </label>
          ))}
        </div>
        <div className="mt-2 text-right">
          <button
            className="text-xs text-gray-600 hover:text-gray-800"
            onClick={(e) => {
              e.preventDefault();
              clearAll();
            }}
          >
            Clear
          </button>
        </div>
      </div>
    </details>
  );
}

/* ------------------------------- page -------------------------------- */
export default function MlbPitcherProjections() {
  const { rows, loading, err } = useJson(SOURCE);

  const [site, setSite] = useState("both"); // "dk" | "fd" | "both"
  const [q, setQ] = useState("");

  // position + team filters (for pitchers: SP/RP/P)
  const posOptions = ["SP", "RP", "P"];
  const [posSel, setPosSel] = useState([...posOptions]);

  const allTeams = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => String(r.team || "").toUpperCase()).filter(Boolean))).sort(),
    [rows]
  );
  const [teamsSel, setTeamsSel] = useState(allTeams);

  useEffect(() => {
    if (allTeams.length && (!teamsSel || teamsSel.length === 0)) {
      setTeamsSel(allTeams);
    }
  }, [allTeams]); // eslint-disable-line

  /* Columns: only render ones we actually have */
  const COLS_COMMON = useMemo(
    () =>
      [
        { key: "player", label: "Pitcher", type: "text", w: "min-w-[6rem]" },
        { key: "pos", label: "Pos", type: "text" },
        { key: "team", label: "Team", type: "text" },
        { key: "opp", label: "Opp", type: "text" },
      ].filter((c) => rows.some((r) => r[c.key] != null)),
    [rows]
  );

  const COLS_DK = useMemo(
    () =>
      [
        { key: "dk_sal", label: "DK Sal", type: "money" },
        { key: "dk_proj", label: "DK Proj", type: "num1" },
        { key: "dk_val", label: "DK Val", type: "num1" },
        { key: "dk_pown", label: "DK pOWN%", type: "pct" },
        { key: "dk_opt", label: "DK Opt%", type: "pct" },
        { key: "dk_lev", label: "DK Lev%", type: "pct" },
        { key: "dk_rtg", label: "DK Rtg", type: "num1-force" },
      ].filter((c) => rows.some((r) => r[c.key] != null)),
    [rows]
  );

  const COLS_FD = useMemo(
    () =>
      [
        { key: "fd_sal", label: "FD Sal", type: "money" },
        { key: "fd_proj", label: "FD Proj", type: "num1" },
        { key: "fd_val", label: "FD Val", type: "num1" },
        { key: "fd_pown", label: "FD pOWN%", type: "pct" },
        { key: "fd_opt", label: "FD Opt%", type: "pct" },
        { key: "fd_lev", label: "FD Lev%", type: "pct" },
        { key: "fd_rtg", label: "FD Rtg", type: "num1-force" },
      ].filter((c) => rows.some((r) => r[c.key] != null)),
    [rows]
  );

  const columns = useMemo(() => {
    if (site === "dk") return [...COLS_COMMON, ...COLS_DK];
    if (site === "fd") return [...COLS_COMMON, ...COLS_FD];
    return [...COLS_COMMON, ...COLS_DK, ...COLS_FD];
  }, [site, COLS_COMMON, COLS_DK, COLS_FD]);

  /* filtering */
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const posSet = new Set(posSel);
    const teamSet = new Set(teamsSel);
    return rows.filter((r) => {
      if (posSet.size && r.pos && !posSet.has(String(r.pos))) return false;
      if (teamSet.size && !teamSet.has(String(r.team || "").toUpperCase())) return false;
      if (!needle) return true;
      const bag = `${r.player ?? ""} ${r.pos ?? ""} ${r.team ?? ""} ${r.opp ?? ""}`.toLowerCase();
      return bag.includes(needle);
    });
  }, [rows, q, posSel, teamsSel]);

  /* sorting */
  const [sort, setSort] = useState({ key: "dk_proj", dir: "desc" });
  const sorted = useMemo(() => {
    const { key, dir } = sort;
    const sgn = dir === "asc" ? 1 : -1;
    const arr = [...filtered];
    const typ = (k) => columns.find((c) => c.key === k)?.type;

    arr.sort((a, b) => {
      const t = typ(key);
      const av = num(a[key]);
      const bv = num(b[key]);

      // numeric-first sort with graceful fallback to string compare
      if (av === null && bv === null) {
        const sa = String(a[key] ?? "");
        const sb = String(b[key] ?? "");
        return sa.localeCompare(sb) * sgn;
      }
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * sgn;
    });
    return arr;
  }, [filtered, sort, columns]);

  const onSort = (col) => {
    setSort((prev) => {
      if (prev.key !== col.key) return { key: col.key, dir: "desc" };
      return { key: col.key, dir: prev.dir === "desc" ? "asc" : "desc" };
    });
  };

  /* --- measure Player column width to offset Team's sticky left --- */
  const playerThRef = useRef(null);
  const [playerColWidth, setPlayerColWidth] = useState(0);

  useLayoutEffect(() => {
    const calc = () => {
      if (playerThRef.current) {
        const w = playerThRef.current.getBoundingClientRect().width;
        setPlayerColWidth(w);
      }
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [columns, sorted]);

  /* styling */
  const cell = "px-2 py-1 text-center";
  const header = "px-2 py-1 font-semibold text-center";
  const textSz = "text-[12px]";

  return (
    <div className="px-4 md:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold mb-0.5">MLB — Pitcher Projections</h1>
        </div>

        {/* site toggle + filters + search + export */}
        <div className="flex items-center gap-2">
          {/* site toggle */}
          <div className="inline-flex items-center gap-2 rounded-xl bg-gray-100 p-1">
            {["dk", "fd", "both"].map((k) => (
              <button
                key={k}
                onClick={() => setSite(k)}
                className={`px-3 py-1.5 rounded-lg text-sm inline-flex items-center gap-1 ${
                  site === k ? "bg-white shadow font-semibold" : "text-gray-700"
                }`}
              >
                {k !== "both" ? (
                  <img src={SITES[k].logo} alt={SITES[k].label} className="w-4 h-4" title={SITES[k].label} />
                ) : null}
                <span>{SITES[k].label}</span>
              </button>
            ))}
          </div>

          {/* Positions */}
          <div className="hidden md:flex items-center gap-1 ml-1">
            {posOptions.map((p) => {
              const active = posSel.includes(p);
              return (
                <button
                  key={p}
                  onClick={() =>
                    setPosSel((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))
                  }
                  className={`px-2.5 py-1 rounded-lg text-xs ${
                    active ? "bg-white shadow font-medium" : "bg-gray-100 text-gray-700"
                  }`}
                  title="Toggle position"
                >
                  {p}
                </button>
              );
            })}
          </div>

          {/* Teams dropdown */}
          <div className="ml-1">
            <TeamsDropdown allTeams={allTeams} selected={teamsSel} onChange={setTeamsSel} />
          </div>

          {/* search */}
          <input
            className="h-9 w-64 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search pitcher / team / opp…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
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

      <div className="rounded-xl border bg-white shadow-sm overflow-auto">
        <table className={`w-full border-separate ${textSz}`} style={{ borderSpacing: 0 }}>
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  ref={c.key === "player" ? playerThRef : undefined}
                  className={`${header} whitespace-nowrap cursor-pointer select-none ${c.w || ""} ${
                    c.key === "player"
                      ? "sticky left-0 z-20 bg-gray-50"
                      : c.key === "team"
                      ? "sticky z-20 bg-gray-50"
                      : ""
                  }`}
                  style={c.key === "team" ? { left: playerColWidth } : undefined}
                  onClick={() => onSort(c)}
                  title="Click to sort"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>{c.label}</span>
                    {/* simple chevron indicator */}
                    <span className="text-gray-400">
                      {sort.key === c.key ? (sort.dir === "desc" ? "▼" : "▲") : "▲"}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className={`${cell} text-gray-500`} colSpan={columns.length}>
                  Loading…
                </td>
              </tr>
            )}
            {err && (
              <tr>
                <td className={`${cell} text-red-600`} colSpan={columns.length}>
                  Failed to load: {err}
                </td>
              </tr>
            )}
            {!loading &&
              !err &&
              sorted.map((r, i) => (
                <tr key={`${r.player}-${i}`} className="odd:bg-white even:bg-gray-50">
                  {columns.map((c) => {
                    if (c.key === "player") {
                      return (
                        <td
                          key={c.key}
                          className={`px-2 py-1 text-left sticky left-0 z-10 ${
                            i % 2 === 0 ? "bg-white" : "bg-gray-50"
                          } shadow-[inset_-6px_0_6px_-6px_rgba(0,0,0,0.15)]`}
                        >
                          <div className="flex items-center gap-2">
                            <img
                              src={teamLogo(r.team)}
                              alt=""
                              className="w-4 h-4 rounded-sm object-contain"
                              onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                            />
                            <span className="whitespace-nowrap">{r.player}</span>
                          </div>
                        </td>
                      );
                    }
                    if (c.key === "team") {
                      return (
                        <td
                          key={c.key}
                          className={`px-2 py-1 text-center sticky z-10 ${
                            i % 2 === 0 ? "bg-white" : "bg-gray-50"
                          } shadow-[inset_-6px_0_6px_-6px_rgba(0,0,0,0.15)]`}
                          style={{ left: playerColWidth }}
                        >
                          {r.team}
                        </td>
                      );
                    }

                    const cls = c.type === "text" ? "px-2 py-1 text-center" : `${cell} tabular-nums`;
                    let val = r[c.key];
                    if (c.type === "num1-force") val = fmt1(val);
                    if (c.type === "num1") val = fmt1(val);
                    if (c.type === "money") val = fmt0(val);
                    return (
                      <td key={c.key} className={cls}>
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
