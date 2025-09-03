// src/pages/mlb/MlbPitcherProjections.jsx
import React, { useEffect, useMemo, useState, useLayoutEffect, useRef } from "react";

/* ------------------------------- config ------------------------------- */
/** Prefer env, fallback to your old path. Make sure this URL returns JSON. */
const SOURCE =
  import.meta.env?.VITE_MLB_PITCHERS_URL ||
  "/data/mlb/latest/pitcher_projections.json";

const SITES = {
  dk: { key: "dk", label: "DK", logo: "/logos/dk.png" },
  fd: { key: "fd", label: "FD", logo: "/logos/fd.png" },
  both: { key: "both", label: "Both" },
};

/** Header aliases we’ll tolerate coming from the sheet -> canonical keys */
const ALIASES = {
  // identity
  player: ["player", "name", "pitcher", "player name"],
  pos: ["pos", "position"],
  team: ["team", "teamabbrev", "tm"],
  opp: ["opp", "opponent"],

  // NEW: context / stats
  imp_total: ["imp. total", "imp total", "impliedtotal", "imp_total"],
  hand: ["h", "hand", "handedness", "throws", "batsthrows"],

  ip: ["ip", "innings", "innings pitched", "ip_proj"],
  er: ["er", "earned runs"],
  k: ["k", "so", "strikeouts", "k_proj"],
  hits_allowed: ["hits", "h_allowed", "hitsallowed", "h_allwd"],
  bb: ["bb", "walks"],
  hr: ["hr", "home runs allowed", "home_runs_allowed", "hr_allowed"],
  w_pct: ["w", "win", "winprob", "win_prob", "win%"],

  // DK
  dk_sal: ["dk sal", "dk salary", "draftkings salary", "dk$"],
  dk_proj: ["dk proj", "dk projection", "dk pts", "draftkings proj"],
  dk_val: ["dk val", "dk value"],
  dk_pown: ["dk pown%", "dk pown", "dk own%", "dk ownership%", "dk_pown"],
  dk_floor: ["dk floor", "dk_floor"],
  dk_ceiling: ["dk ceiling", "dk_ceiling"],
  dk_rtg: ["dk rtg", "dk rating", "dk_rating"],

  // FD
  fd_sal: ["fd sal", "fd salary", "fanduel salary", "fd$"],
  fd_proj: ["fd proj", "fd projection", "fd pts", "fanduel proj"],
  fd_val: ["fd val", "fd value"],
  fd_pown: ["fd pown%", "fd pown", "fd own%", "fd ownership%", "fd_pown"],
  fd_floor: ["fd floor", "fd_floor"],
  fd_ceiling: ["fd ceiling", "fd_ceiling"],
  fd_rtg: ["fd rtg", "fd rating", "fd_rating"],
};

/* ------------------------------ helpers ------------------------------- */
const lc = (s) => String(s ?? "").toLowerCase().trim();
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[,$%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const pctNum = (v) => {
  const n = num(v);
  if (n === null) return null;
  return n <= 1 ? n * 100 : n; // accept 0–1 or 0–100
};
const fmt0 = (v) => (num(v) === null ? "" : num(v).toLocaleString());
const fmt1 = (v) => (num(v) === null ? "" : num(v).toFixed(1));
const fmtPct1 = (v) => (pctNum(v) === null ? "" : `${pctNum(v).toFixed(1)}%`);
const teamLogo = (team) => `/logos/mlb/${String(team || "").toUpperCase()}.png`;

const buildLowerMap = (row) => {
  const low = {};
  for (const [k, v] of Object.entries(row)) low[lc(k)] = v;
  return low;
};
const firstKey = (obj, names) => names.map(lc).find((n) => n in obj);
const pick = (obj, names) => obj[firstKey(obj, names) ?? ""];

function normalizeRow(row) {
  const low = buildLowerMap(row);
  const out = {};

  // identity
  out.player = pick(low, ALIASES.player);
  out.pos = pick(low, ALIASES.pos);
  out.team = (pick(low, ALIASES.team) || "").toUpperCase();
  out.opp = (pick(low, ALIASES.opp) || "").toUpperCase();

  // context / stats
  out.imp_total = num(pick(low, ALIASES.imp_total));
  out.hand = (pick(low, ALIASES.hand) || "").toUpperCase();
  out.ip = num(pick(low, ALIASES.ip));
  out.er = num(pick(low, ALIASES.er));
  out.k = num(pick(low, ALIASES.k));
  out.hits_allowed = num(pick(low, ALIASES.hits_allowed));
  out.bb = num(pick(low, ALIASES.bb));
  out.hr = num(pick(low, ALIASES.hr));
  out.w_pct = pctNum(pick(low, ALIASES.w_pct));

  // DK
  out.dk_sal = num(pick(low, ALIASES.dk_sal));
  out.dk_proj = num(pick(low, ALIASES.dk_proj));
  out.dk_val = num(pick(low, ALIASES.dk_val));
  out.dk_pown = pctNum(pick(low, ALIASES.dk_pown));
  out.dk_floor = num(pick(low, ALIASES.dk_floor));
  out.dk_ceiling = num(pick(low, ALIASES.dk_ceiling));
  out.dk_rtg = num(pick(low, ALIASES.dk_rtg));

  // FD
  out.fd_sal = num(pick(low, ALIASES.fd_sal));
  out.fd_proj = num(pick(low, ALIASES.fd_proj));
  out.fd_val = num(pick(low, ALIASES.fd_val));
  out.fd_pown = pctNum(pick(low, ALIASES.fd_pown));
  out.fd_floor = num(pick(low, ALIASES.fd_floor));
  out.fd_ceiling = num(pick(low, ALIASES.fd_ceiling));
  out.fd_rtg = num(pick(low, ALIASES.fd_rtg));

  return out;
}

/* fetch with better error for HTML responses */
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
        const ct = r.headers.get("content-type") || "";
        if (!ct.toLowerCase().includes("application/json")) {
          const text = await r.text();
          throw new Error(
            `Expected JSON but got ${ct || "unknown"}. First chars: ${text.slice(0, 30)}`
          );
        }
        const j = await r.json();
        const raw = Array.isArray(j) ? j : j?.rows || j?.data || j?.items || [];
        const data = raw.map(normalizeRow).filter((r) => r.player);
        if (alive) setRows(data);
      } catch (e) {
        if (alive) setErr(String(e.message || e));
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
          const key = c.key;
          let val = r[key];
          if (key.endsWith("_pown") || key === "w_pct") val = fmtPct1(val);
          else if (key.endsWith("_sal")) val = fmt0(val);
          else if (typeof val === "number") val = fmt1(val);
          return escapeCSV(val ?? "");
        })
        .join(",")
    )
    .join("\n");
  const blob = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fname;
  a.click();
  URL.revokeObjectURL(url);
}

/* small checkbox dropdown (Teams) */
function TeamsDropdown({ allTeams, selected, onChange }) {
  const allSet = new Set(selected);
  const toggle = (tm) => {
    const next = new Set(allSet);
    next.has(tm) ? next.delete(tm) : next.add(tm);
    onChange(Array.from(next));
  };
  return (
    <details className="relative">
      <summary className="list-none cursor-pointer">
        <span className="px-3 py-1.5 rounded-lg bg-white shadow font-medium text-sm">
          Teams ({selected.length}/{allTeams.length})
        </span>
      </summary>
      <div className="absolute mt-2 z-20 bg-white border rounded-xl shadow-lg p-2 w-[260px]">
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
              onChange([]);
            }}
          >
            Clear all
          </button>
          <button
            className="ml-2 text-xs text-gray-600 hover:text-gray-800"
            onClick={(e) => {
              e.preventDefault();
              onChange([...allTeams]);
            }}
          >
            Select all
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

  const posOptions = ["SP", "RP", "P"];
  const [posSel, setPosSel] = useState([...posOptions]);

  const allTeams = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => String(r.team || "").toUpperCase()).filter(Boolean))).sort(),
    [rows]
  );
  const [teamsSel, setTeamsSel] = useState(allTeams);
  useEffect(() => {
    if (allTeams.length && (!teamsSel || teamsSel.length === 0)) setTeamsSel(allTeams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTeams]);

  /* Columns */
  const COLS_COMMON = useMemo(
    () =>
      [
        { key: "imp_total", label: "Imp. Total" },
        { key: "hand", label: "H" },
        { key: "player", label: "Player" },
        { key: "team", label: "Team" },
        { key: "opp", label: "Opp" },
        { key: "ip", label: "IP" },
        { key: "er", label: "ER" },
        { key: "k", label: "K" },
        { key: "hits_allowed", label: "H" },
        { key: "bb", label: "BB" },
        { key: "hr", label: "HR" },
        { key: "w_pct", label: "W" },
      ].filter((c) => rows.some((r) => r[c.key] != null)),
    [rows]
  );

  const COLS_DK = useMemo(
    () =>
      [
        { key: "dk_sal", label: "DK Sal" },
        { key: "dk_proj", label: "DK Proj" },
        { key: "dk_val", label: "DK Val" },
        { key: "dk_pown", label: "DK pOWN%" },
        { key: "dk_floor", label: "DK Floor" },
        { key: "dk_ceiling", label: "DK Ceiling" },
        { key: "dk_rtg", label: "DK Rtg" },
      ].filter((c) => rows.some((r) => r[c.key] != null)),
    [rows]
  );

  const COLS_FD = useMemo(
    () =>
      [
        { key: "fd_sal", label: "FD Sal" },
        { key: "fd_proj", label: "FD Proj" },
        { key: "fd_val", label: "FD Val" },
        { key: "fd_pown", label: "FD pOWN%" },
        { key: "fd_floor", label: "FD Floor" },
        { key: "fd_ceiling", label: "FD Ceiling" },
        { key: "fd_rtg", label: "FD Rtg" },
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
      return `${r.player ?? ""} ${r.pos ?? ""} ${r.team ?? ""} ${r.opp ?? ""}`.toLowerCase().includes(needle);
    });
  }, [rows, q, posSel, teamsSel]);

  /* sorting */
  const [sort, setSort] = useState({ key: "dk_proj", dir: "desc" });
  const sorted = useMemo(() => {
    const { key, dir } = sort;
    const sgn = dir === "asc" ? 1 : -1;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = num(a[key]);
      const bv = num(b[key]);
      if (av === null && bv === null) return String(a[key] ?? "").localeCompare(String(b[key] ?? "")) * sgn;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * sgn;
    });
    return arr;
  }, [filtered, sort]);

  const onSort = (col) => {
    setSort((prev) => (prev.key !== col.key ? { key: col.key, dir: "desc" } : { key: col.key, dir: prev.dir === "desc" ? "asc" : "desc" }));
  };

  /* sticky player/team */
  const playerThRef = useRef(null);
  const [playerColWidth, setPlayerColWidth] = useState(0);
  useLayoutEffect(() => {
    const calc = () => {
      if (playerThRef.current) setPlayerColWidth(playerThRef.current.getBoundingClientRect().width);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [columns, sorted]);

  const cell = "px-2 py-1 text-center";
  const header = "px-2 py-1 font-semibold text-center";
  const textSz = "text-[12px]";

  return (
    <div className="px-4 md:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h1 className="text-2xl md:text-3xl font-extrabold mb-0.5">MLB — Pitcher Projections</h1>

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
                {k !== "both" ? <img src={SITES[k].logo} alt={SITES[k].label} className="w-4 h-4" /> : null}
                <span>{SITES[k].label}</span>
              </button>
            ))}
          </div>

          {/* Positions */}
          <div className="hidden md:flex items-center gap-1 ml-1">
            {["SP", "RP", "P"].map((p) => {
              const active = posSel.includes(p);
              return (
                <button
                  key={p}
                  onClick={() => setPosSel((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))}
                  className={`px-2.5 py-1 rounded-lg text-xs ${active ? "bg-white shadow font-medium" : "bg-gray-100 text-gray-700"}`}
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

      {err && (
        <div className="mb-2 text-red-600 font-semibold">
          Data load error: {err}
          <div className="text-[12px] text-red-700 mt-1">
            Tip: If you see “Expected JSON but got text/html…”, the URL is wrong or protected. Put the JSON in
            <code className="mx-1 px-1 bg-red-50 rounded">public/</code> and point <code>SOURCE</code> to it, or set
            <code className="mx-1 px-1 bg-red-50 rounded">VITE_MLB_PITCHERS_URL</code>.
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white shadow-sm overflow-auto">
        <table className={`w-full border-separate ${textSz}`} style={{ borderSpacing: 0 }}>
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  ref={c.key === "player" ? playerThRef : undefined}
                  className={`${header} whitespace-nowrap cursor-pointer select-none ${
                    c.key === "player" ? "sticky left-0 z-20 bg-gray-50" : c.key === "team" ? "sticky z-20 bg-gray-50" : ""
                  }`}
                  style={c.key === "team" ? { left: playerColWidth } : undefined}
                  onClick={() => onSort(c)}
                  title="Click to sort"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>{c.label}</span>
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
            {!loading &&
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

                    let val = r[c.key];
                    if (c.key.endsWith("_pown") || c.key === "w_pct") val = fmtPct1(val);
                    else if (c.key.endsWith("_sal")) val = fmt0(val);
                    else if (typeof val === "number") val = fmt1(val);

                    return (
                      <td key={c.key} className={cell}>
                        {val ?? ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            {!loading && !sorted.length && (
              <tr>
                <td className={`${cell} text-gray-500`} colSpan={columns.length}>
                  No data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-[12px] text-gray-500">
        <span className="mr-3">W = Win Probability</span>
        <span>pOWN% = Projected Ownership</span>
      </div>
    </div>
  );
}
