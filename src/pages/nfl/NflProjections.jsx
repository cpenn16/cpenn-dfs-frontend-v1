// src/pages/nfl/NflProjections.jsx
import React, { useEffect, useMemo, useState, useLayoutEffect, useRef } from "react";

/* ------------------------------- config ------------------------------- */
const SOURCE = "/data/nfl/classic/latest/projections.json";

const SITES = {
  dk: { key: "dk", label: "DK", logo: "/logos/dk.png" },
  fd: { key: "fd", label: "FD", logo: "/logos/fd.png" },
  both: { key: "both", label: "Both" },
};

/* Column definitions (key in JSON, header label, type) */
const COLS_COMMON = [
  { key: "player", label: "Player", type: "text", w: "min-w-[5rem]" },
  { key: "pos", label: "Pos", type: "text" },
  { key: "team", label: "Team", type: "text" },
  { key: "opp", label: "Opp", type: "text" },
];

const COLS_DK = [
  { key: "dk_sal", label: "DK Sal", type: "money" }, // no coloring
  { key: "dk_proj", label: "DK Proj", type: "num1" },
  { key: "dk_val", label: "DK Val", type: "num1" },
  { key: "dk_pown", label: "DK pOWN%", type: "pct" },
  { key: "dk_opt", label: "DK Opt%", type: "pct" },
  { key: "dk_lev", label: "DK Lev%", type: "pct" },
  { key: "dk_rtg", label: "DK Rtg", type: "num1-force" },
];

const COLS_FD = [
  { key: "fd_sal", label: "FD Sal", type: "money" }, // no coloring
  { key: "fd_proj", label: "FD Proj", type: "num1" },
  { key: "fd_val", label: "FD Val", type: "num1" },
  { key: "fd_pown", label: "FD pOWN%", type: "pct" },
  { key: "fd_opt", label: "FD Opt%", type: "pct" },
  { key: "fd_lev", label: "FD Lev%", type: "pct" },
  { key: "fd_rtg", label: "FD Rtg", type: "num1-force" },
];

/* ------------------------------ helpers ------------------------------- */
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

/* team logo from /public/logos/nfl/XXX.png */
const teamLogo = (team) => `/logos/nfl/${String(team || "").toUpperCase()}.png`;

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
        const data = Array.isArray(j) ? j : j?.rows ?? [];
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
function downloadCSV(rows, cols, fname = "nfl_projections.csv") {
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

/* ======================= HEATMAP: rules + palettes ======================= */

/** Which columns get colored and in which direction */
function dirForKey(k) {
  if (/^(dk|fd)_(proj|val|opt|lev|rtg)$/i.test(k)) return "higher";
  if (/^(dk|fd)_pown$/i.test(k)) return "lower";
  return null; // no coloring (salaries, text, etc.)
}

/** Color palettes:
 *  - rdylgn: red → yellow → green (green = better)
 *  - blueorange: blue → white → orange (orange = better)
 *  - none: no background
 */
function heatColor(min, max, v, dir, palette) {
  if (palette === "none") return null;
  if (v == null || min == null || max == null || min === max || !dir) return null;

  let t = (v - min) / (max - min);
  t = Math.max(0, Math.min(1, t));
  if (dir === "lower") t = 1 - t;

  // Blue → White → Orange, with orange = better
  if (palette === "blueorange") {
    if (t < 0.5) {
      const u = t / 0.5; // blue → white
      const h = 220;
      const s = 60 - u * 55;
      const l = 90 + u * 7;
      return `hsl(${h}, ${s}%, ${l}%)`;
    } else {
      const u = (t - 0.5) / 0.5; // white → orange
      const h = 30;
      const s = 5 + u * 80;
      const l = 97 - u * 7;
      return `hsl(${h}, ${s}%, ${l}%)`;
    }
  }

  // Default: red → yellow → green
  if (t < 0.5) {
    const u = t / 0.5;
    const h = 0 + u * 60; // red → yellow
    const s = 78 + u * 10;
    const l = 94 - u * 2;
    return `hsl(${h}, ${s}%, ${l}%)`;
  } else {
    const u = (t - 0.5) / 0.5;
    const h = 60 + u * 60; // yellow → green
    const s = 88 - u * 18;
    const l = 92 + u * 2;
    return `hsl(${h}, ${s}%, ${l}%)`;
  }
}

function legendStyle(palette) {
  if (palette === "blueorange") {
    return {
      background:
        "linear-gradient(90deg, hsl(220,60%,90%) 0%, hsl(0,0%,97%) 50%, hsl(30,85%,90%) 100%)",
    };
  }
  if (palette === "none") {
    return { background: "linear-gradient(90deg, #f3f4f6, #e5e7eb)" };
  }
  return {
    background:
      "linear-gradient(90deg, hsl(0,78%,94%) 0%, hsl(60,88%,92%) 50%, hsl(120,70%,94%) 100%)",
  };
}

/* ------------------------------- page -------------------------------- */
export default function NflProjections() {
  const { rows, loading, err } = useJson(SOURCE);

  const [site, setSite] = useState("both"); // "dk" | "fd" | "both"
  const [q, setQ] = useState("");
  const [palette, setPalette] = useState("rdylgn"); // rdylgn | blueorange | none

  // position + team filters
  const posOptions = ["QB", "RB", "WR", "TE", "DST"];
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

  const columns = useMemo(() => {
    if (site === "dk") return [...COLS_COMMON, ...COLS_DK];
    if (site === "fd") return [...COLS_COMMON, ...COLS_FD];
    return [...COLS_COMMON, ...COLS_DK, ...COLS_FD];
  }, [site]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const posSet = new Set(posSel);
    const teamSet = new Set(teamsSel);
    return rows.filter((r) => {
      if (posSet.size && !posSet.has(String(r.pos || ""))) return false;
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
      if (t === "pct") {
        const av = num(a[key]);
        const bv = num(b[key]);
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (av - bv) * sgn;
      }
      const av = num(a[key]);
      const bv = num(b[key]);
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

  /* --------- compute per-column min/max for heatmap (visible rows only) -------- */
  const heatStats = useMemo(() => {
    const stats = {};
    if (!sorted.length) return stats;
    for (const col of columns) {
      const k = col.key;
      const dir = dirForKey(k);
      if (!dir) continue; // only our whitelisted metrics
      let min = Infinity;
      let max = -Infinity;
      for (const r of sorted) {
        const v = num(r[k]);
        if (v == null) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (min !== Infinity && max !== -Infinity) stats[k] = { min, max, dir };
    }
    return stats;
  }, [sorted, columns]);

  /* styling */
  const cell = "px-2 py-1 text-center";
  const header = "px-2 py-1 font-semibold text-center";
  const textSz = "text-[12px]";

  return (
    <div className="px-4 md:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold mb-0.5">NFL — DFS Projections</h1>
          <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-2">
            <span>Lower ⟶ Higher</span>
            <span className="h-3 w-28 rounded" style={legendStyle(palette)} />
            <span className="ml-2">(applies to projections/vals/opt/lev/rtg; pOWN% inverted)</span>
          </div>
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
            {["QB", "RB", "WR", "TE", "DST"].map((p) => {
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
            placeholder="Search player / team / opp…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          {/* palette */}
          <div className="hidden md:flex items-center gap-2">
            <label className="text-xs text-slate-600">Palette</label>
            <select
              value={palette}
              onChange={(e) => setPalette(e.target.value)}
              className="h-8 rounded-lg border px-2 text-xs"
            >
              <option value="rdylgn">Rd–Yl–Gn</option>
              <option value="blueorange">Blue–Orange</option>
              <option value="none">None</option>
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
                    const k = c.key;

                    // Sticky Player cell with logo
                    if (k === "player") {
                      return (
                        <td
                          key={k}
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

                    // Sticky Team cell
                    if (k === "team") {
                      return (
                        <td
                          key={k}
                          className={`px-2 py-1 text-center sticky z-10 ${
                            i % 2 === 0 ? "bg-white" : "bg-gray-50"
                          } shadow-[inset_-6px_0_6px_-6px_rgba(0,0,0,0.15)]`}
                          style={{ left: playerColWidth }}
                        >
                          {r.team}
                        </td>
                      );
                    }

                    // Heatmap background (only for whitelisted metrics)
                    const stat = heatStats[k];
                    const vNum = num(r[k]);
                    const bg = stat ? heatColor(stat.min, stat.max, vNum, stat.dir, palette) : null;

                    // Formatting
                    let val = r[k];
                    if (c.type === "num1-force") val = fmt1(val);
                    if (c.type === "num1") val = fmt1(val);
                    if (c.type === "money") val = fmt0(val);

                    return (
                      <td
                        key={k}
                        className={`${c.type === "text" ? "px-2 py-1 text-center" : `${cell} tabular-nums`}`}
                        style={bg ? { backgroundColor: bg } : undefined}
                      >
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
