// src/pages/mlb/BattersProjections.jsx
import React, {
  useEffect,
  useMemo,
  useState,
  useLayoutEffect,
  useRef,
} from "react";

/* ======================================================================
   CONFIG
   ====================================================================== */
const SOURCE =
  import.meta.env?.VITE_MLB_BATTERS_URL ||
  "/data/mlb/latest/batter_projections.json";

const SITES = {
  dk: { key: "dk", label: "DK", logo: "/logos/dk.png" },
  fd: { key: "fd", label: "FD", logo: "/logos/fd.png" },
  both: { key: "both", label: "Both" },
};

/* ======================================================================
   HEADER ALIASES  (sheet headers -> canonical keys)
   ====================================================================== */
// Two H columns in your sheet: early "H" = handedness, later "H" = hits.
const ALIASES = {
  bo: ["bo", "batting order", "order", "spot"],
  hand: ["h", "hand", "handedness", "throws", "bats"],
  pos: ["pos", "position"],
  v: ["v", "imp total", "imp. total", "impliedtotal", "imp_total"],

  player: ["player", "name", "batter", "hitter", "player name"],
  dk_sal: ["dk sal", "dk salary", "draftkings salary", "dk$"],
  fd_sal: ["fd sal", "fd salary", "fanduel salary", "fd$"],
  team: ["team", "teamabbrev", "tm"],
  opp: ["opp", "opponent"],

  ab: ["ab", "at bats", "at_bats"],
  hits: ["h__2", "h_2", "hits", "hits_total"],
  one_b: ["1b", "singles", "single"],
  two_b: ["2b", "doubles", "double"],
  three_b: ["3b", "triples", "triple"],
  hr: ["hr", "home runs", "homeruns"],
  rbi: ["rbi", "runs batted in", "runs_batted_in"],
  r: ["r", "runs"],
  sb: ["sb", "stolen bases", "stolen_bases"],
  bb: ["bb", "walks"],
  k: ["k", "so", "strikeouts"],

  dk_proj: ["dk proj", "dk projection", "dk pts", "draftkings proj"],
  dk_val: ["dk val", "dk value"],
  dk_pown: ["dk pown%", "dk pown", "dk own%", "dk ownership%", "dk_pown"],

  fd_proj: ["fd proj", "fd projection", "fd pts", "fanduel proj"],
  fd_val: ["fd val", "fd value"],
  fd_pown: ["fd pown%", "fd pown", "fd own%", "fd ownership%", "fd_pown"],

  dk_floor: ["dk floor", "dk_floor"],
  dk_ceiling: ["dk ceiling", "dk_ceiling"],
  fd_floor: ["fd floor", "fd_floor"],
  fd_ceiling: ["fd ceiling", "fd_ceiling"],
  dk_rtg: ["dk rtg", "dk rating", "dk_rating"],
  fd_rtg: ["fd rtg", "fd rating", "fd_rating"],
};

/* ======================================================================
   HELPERS
   ====================================================================== */
const lc = (s) => String(s ?? "").toLowerCase().trim();
const buildLowerMap = (row) => {
  const low = {};
  for (const [k, v] of Object.entries(row)) low[lc(k)] = v;
  return low;
};
const firstKey = (obj, names) => names.map(lc).find((n) => n in obj);
const pick = (obj, names) => obj[firstKey(obj, names) ?? ""];

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[,$%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const pctNum = (v) => {
  const n = num(v);
  if (n === null) return null;
  return Math.max(0, Math.min(100, n));
};

const fmtMoney0 = (v) => (num(v) === null ? "" : `$${num(v).toLocaleString()}`);
const fmt1 = (v) => (num(v) === null ? "" : num(v).toFixed(1));
const fmtPct1 = (v) =>
  v === null || v === undefined || v === "" ? "" : `${pctNum(v).toFixed(1)}%`;

const teamLogo = (team) => `/logos/mlb/${String(team || "").toUpperCase()}.png`;

/* ======================================================================
   NORMALIZER
   ====================================================================== */
function normalizeRow(row) {
  const low = buildLowerMap(row);
  return {
    bo: num(pick(low, ALIASES.bo)),
    hand: (pick(low, ALIASES.hand) || "").toUpperCase(),
    pos: (pick(low, ALIASES.pos) || "").toUpperCase(),
    v: num(pick(low, ALIASES.v)),
    player: pick(low, ALIASES.player),

    dk_sal: num(pick(low, ALIASES.dk_sal)),
    fd_sal: num(pick(low, ALIASES.fd_sal)),
    team: (pick(low, ALIASES.team) || "").toUpperCase(),
    opp: (pick(low, ALIASES.opp) || "").toUpperCase(),

    ab: num(pick(low, ALIASES.ab)),
    hits: num(pick(low, ALIASES.hits)),
    one_b: num(pick(low, ALIASES.one_b)),
    two_b: num(pick(low, ALIASES.two_b)),
    three_b: num(pick(low, ALIASES.three_b)),
    hr: num(pick(low, ALIASES.hr)),
    rbi: num(pick(low, ALIASES.rbi)),
    r: num(pick(low, ALIASES.r)),
    sb: num(pick(low, ALIASES.sb)),
    bb: num(pick(low, ALIASES.bb)),
    k: num(pick(low, ALIASES.k)),

    dk_proj: num(pick(low, ALIASES.dk_proj)),
    dk_val: num(pick(low, ALIASES.dk_val)),
    dk_pown: pctNum(pick(low, ALIASES.dk_pown)),

    fd_proj: num(pick(low, ALIASES.fd_proj)),
    fd_val: num(pick(low, ALIASES.fd_val)),
    fd_pown: pctNum(pick(low, ALIASES.fd_pown)),

    dk_floor: num(pick(low, ALIASES.dk_floor)),
    dk_ceiling: num(pick(low, ALIASES.dk_ceiling)),
    fd_floor: num(pick(low, ALIASES.fd_floor)),
    fd_ceiling: num(pick(low, ALIASES.fd_ceiling)),

    dk_rtg: num(pick(low, ALIASES.dk_rtg)),
    fd_rtg: num(pick(low, ALIASES.fd_rtg)),
  };
}

/* ======================================================================
   DATA HOOK (with HTML-vs-JSON guard)
   ====================================================================== */
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
        const ct = (r.headers.get("content-type") || "").toLowerCase();
        if (!ct.includes("application/json")) {
          const txt = await r.text();
          throw new Error(`Expected JSON, got ${ct || "unknown"}: ${txt.slice(0, 30)}…`);
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
    return () => { alive = false; };
  }, [url]);

  return { rows, loading, err };
}

/* ======================================================================
   LAST-UPDATED (reads meta.json beside SOURCE)
   ====================================================================== */
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
  const url = useMemo(() => toMetaUrl(sourceUrl), [sourceUrl]);
  const [date, setDate] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${url}?_=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const meta = await r.json();
        const d = parseMetaToDate(meta);
        if (alive) setDate(d);
      } catch (_) {}
    })();
    return () => { alive = false; };
  }, [url]);
  return date
    ? date.toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;
}

/* ======================================================================
   CSV EXPORT
   ====================================================================== */
const escapeCSV = (s) => {
  const v = String(s ?? "");
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
function downloadCSV(rows, cols, fname = "mlb_batter_projections.csv") {
  const header = cols.map((c) => c.label).join(",");
  const body = rows
    .map((r) =>
      cols.map((c) => {
        const k = c.key;
        let val = r[k];
        if (k === "dk_sal" || k === "fd_sal") val = fmtMoney0(val);
        else if (k === "dk_pown" || k === "fd_pown") val = fmtPct1(val);
        else if (typeof val === "number") val = fmt1(val);
        return escapeCSV(val ?? "");
      }).join(",")
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

/* ======================================================================
   TEAMS DROPDOWN
   ====================================================================== */
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
        <div className="flex items-center justify-between mb-2 text-xs">
          <button
            className="px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200"
            onClick={(e) => { e.preventDefault(); onChange([...allTeams]); }}
          >
            Select all
          </button>
          <button
            className="px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200"
            onClick={(e) => { e.preventDefault(); onChange([]); }}
          >
            Clear all
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
      </div>
    </details>
  );
}

/* ======================================================================
   CONDITIONAL FORMATTING
   ====================================================================== */
// Higher is better:
const HIGHER_IS_BETTER = new Set([
  "ab", "one_b", "two_b", "three_b", "hr", "rbi", "r", "sb", "bb", "k",
  "dk_proj", "dk_val", "fd_proj", "fd_val",
  "dk_floor", "dk_ceiling", "fd_floor", "fd_ceiling",
  "dk_rtg", "fd_rtg",
  "v" // implied team total
]);
// Lower is better:
const LOWER_IS_BETTER = new Set(["dk_pown", "fd_pown"]);

function computeStats(rows, cols) {
  const stats = {};
  for (const c of cols) {
    const key = c.key;
    let min = Infinity, max = -Infinity, any = false;
    for (const r of rows) {
      const v = r[key];
      if (v == null || isNaN(Number(v))) continue;
      const n = Number(v);
      any = true;
      if (n < min) min = n;
      if (n > max) max = n;
    }
    if (any && min !== max) stats[key] = { min, max };
  }
  return stats;
}
function colorFor(value, key, stats, palette) {
  if (!palette || palette === "none") return null;
  if (value == null || isNaN(Number(value))) return null;
  const st = stats[key];
  if (!st) return null;

  const dir = HIGHER_IS_BETTER.has(key)
    ? "higher"
    : LOWER_IS_BETTER.has(key)
    ? "lower"
    : null;
  if (!dir) return null;

  let t = (Number(value) - st.min) / (st.max - st.min);
  t = Math.max(0, Math.min(1, t));
  if (dir === "lower") t = 1 - t;

  if (palette === "gyr") {
    const h = 120 * t; // green (good) -> red (bad)
    const s = 75;
    const l = 96 - t * 8;
    return `hsl(${h} ${s}% ${l}%)`;
  }
  if (palette === "orangeblue") {
    if (t < 0.5) {
      const u = t / 0.5;
      const h = 220, s = 60 - u * 50, l = 95 + u * 2;
      return `hsl(${h} ${s}% ${l}%)`;
    } else {
      const u = (t - 0.5) / 0.5;
      const h = 28, s = 40 + u * 50, l = 95 - u * 6;
      return `hsl(${h} ${s}% ${l}%)`;
    }
  }
  return null;
}

/* ======================================================================
   PAGE
   ====================================================================== */
export default function BattersProjections() {
  const { rows, loading, err } = useJson(SOURCE);

  // Site toggle + filters
  const [site, setSite] = useState("both"); // dk | fd | both
  const posOptions = ["C", "1B", "2B", "3B", "SS", "OF", "UTIL"];
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

  // Search
  const [q, setQ] = useState("");

  // Columns (exact order)
  const COLS_ORDER = useMemo(
    () => [
      { key: "bo", label: "BO" },
      { key: "hand", label: "H" },
      { key: "pos", label: "Pos" },
      { key: "v", label: "V" },

      // sticky
      { key: "player", label: "Player", sticky: true },

      { key: "dk_sal", label: "DK Sal", site: "dk" },
      { key: "fd_sal", label: "FD Sal", site: "fd" },
      { key: "team", label: "Team" },
      { key: "opp", label: "Opp" },
      { key: "ab", label: "AB" },
      { key: "hits", label: "H" },
      { key: "one_b", label: "1B" },
      { key: "two_b", label: "2B" },
      { key: "three_b", label: "3B" },
      { key: "hr", label: "HR" },
      { key: "rbi", label: "RBI" },
      { key: "r", label: "R" },
      { key: "sb", label: "SB" },
      { key: "bb", label: "BB" },
      { key: "k", label: "K" },

      { key: "dk_proj", label: "DK Proj", site: "dk" },
      { key: "dk_val", label: "DK Val", site: "dk" },
      { key: "dk_pown", label: "DK pOWN%", site: "dk" },
      { key: "fd_proj", label: "FD Proj", site: "fd" },
      { key: "fd_val", label: "FD Val", site: "fd" },
      { key: "fd_pown", label: "FD pOWN%", site: "fd" },

      { key: "dk_floor", label: "DK Floor", site: "dk" },
      { key: "dk_ceiling", label: "DK Ceiling", site: "dk" },
      { key: "fd_floor", label: "FD Floor", site: "fd" },
      { key: "fd_ceiling", label: "FD Ceiling", site: "fd" },

      { key: "dk_rtg", label: "DK Rtg", site: "dk" },
      { key: "fd_rtg", label: "FD Rtg", site: "fd" },
    ],
    []
  );

  const columns = useMemo(() => {
    return COLS_ORDER.filter((c) => {
      if (site !== "both" && c.site && c.site !== site) return false;
      return rows.some((r) => r[c.key] !== null && r[c.key] !== undefined);
    });
  }, [COLS_ORDER, rows, site]);

  // Filtering
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const posSet = new Set(posSel);
    const teamSet = new Set(teamsSel);
    return rows.filter((r) => {
      if (posSet.size && r.pos && !posSet.has(String(r.pos))) return false;
      if (teamSet.size && !teamSet.has(String(r.team || "").toUpperCase())) return false;
      if (!needle) return true;
      return `${r.player ?? ""} ${r.team ?? ""} ${r.opp ?? ""}`.toLowerCase().includes(needle);
    });
  }, [rows, q, posSel, teamsSel]);

  // Sorting: default DK Proj desc
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
    setSort((prev) =>
      prev.key !== col.key
        ? { key: col.key, dir: "desc" }
        : { key: col.key, dir: prev.dir === "desc" ? "asc" : "desc" }
    );
  };

  // Sticky Player width
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

  // Conditional formatting + last updated
  const [palette, setPalette] = useState("none"); // none | gyr | orangeblue
  const stats = useMemo(() => computeStats(sorted, columns), [sorted, columns]);
  const updatedText = useLastUpdatedFromSource(SOURCE);

  // Classes
  const textSz = "text-[12px]";
  const headerCell =
    "px-2 py-1 font-semibold text-center whitespace-nowrap cursor-pointer select-none";
  const cellCls = "px-2 py-1 text-center";

  const renderCell = (key, r) => {
    switch (key) {
      case "bo":
      case "v":
      case "ab":
      case "hits":
      case "one_b":
      case "two_b":
      case "three_b":
      case "hr":
      case "rbi":
      case "r":
      case "sb":
      case "bb":
      case "k":
      case "dk_proj":
      case "dk_val":
      case "fd_proj":
      case "fd_val":
      case "dk_floor":
      case "dk_ceiling":
      case "fd_floor":
      case "fd_ceiling":
      case "dk_rtg":
      case "fd_rtg":
        return fmt1(r[key]);
      case "dk_pown":
      case "fd_pown":
        return fmtPct1(r[key]);
      case "dk_sal":
      case "fd_sal":
        return fmtMoney0(r[key]);
      case "hand":
      case "pos":
      case "team":
      case "opp":
        return r[key] || "";
      case "player":
        return r.player || "";
      default:
        return r[key] ?? "";
    }
  };

  return (
    <div className="px-4 md:px-6 py-5">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl md:text-3xl font-extrabold mb-0.5">
            MLB — Batter Projections
          </h1>
          <div className="text-sm text-gray-600">
            {loading ? "Loading…" : err ? `Error: ${err}` : `${sorted.length.toLocaleString()} rows`}
          </div>
          {updatedText && (
            <div className="text-sm text-gray-500">Updated: {updatedText}</div>
          )}
        </div>

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
                title={`Show ${SITES[k].label}`}
              >
                {k !== "both" ? (
                  <img src={SITES[k].logo} alt={SITES[k].label} className="w-4 h-4" />
                ) : null}
                <span>{SITES[k].label}</span>
              </button>
            ))}
          </div>

          {/* positions */}
          <div className="hidden md:flex items-center gap-1 ml-1">
            {posOptions.map((p) => {
              const active = posSel.includes(p);
              return (
                <button
                  key={p}
                  onClick={() =>
                    setPosSel((prev) =>
                      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                    )
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

          {/* teams */}
          <div className="ml-1">
            <TeamsDropdown allTeams={allTeams} selected={teamsSel} onChange={setTeamsSel} />
          </div>

          {/* search */}
          <input
            className="h-9 w-64 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search batter / team / opp…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          {/* palette */}
          <select
            value={palette}
            onChange={(e) => setPalette(e.target.value)}
            className="h-9 rounded-lg border px-2 text-sm"
            title="Conditional formatting"
          >
            <option value="none">Coloring: None</option>
            <option value="gyr">Coloring: Green–Yellow–Red</option>
            <option value="orangeblue">Coloring: Orange–Blue</option>
          </select>

          {/* export */}
          <button
            className="ml-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
            onClick={() => downloadCSV(sorted, columns)}
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* error banner */}
      {err && <div className="mb-2 text-red-600 font-semibold">Data load error: {err}</div>}

      {/* table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-auto">
        <table className={`w-full border-separate ${textSz}`} style={{ borderSpacing: 0 }}>
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  ref={c.sticky ? playerThRef : undefined}
                  className={`${headerCell} ${c.sticky ? "sticky left-0 z-20 bg-gray-50" : ""}`}
                  style={c.sticky ? { left: 0, minWidth: playerColWidth || 160 } : undefined}
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
                <td className={`${cellCls} text-center text-gray-500`} colSpan={columns.length}>
                  Loading…
                </td>
              </tr>
            )}

            {!loading &&
              sorted.map((r, i) => (
                <tr key={`${r.player}-${i}`} className="odd:bg-white even:bg-gray-50">
                  {columns.map((c) => {
                    const value = r[c.key];
                    const bg =
                      palette !== "none" ? colorFor(value, c.key, stats, palette) : null;

                    const stickyCls = c.sticky
                      ? `px-2 py-1 text-left sticky left-0 z-10 ${
                          i % 2 === 0 ? "bg-white" : "bg-gray-50"
                        } shadow-[inset_-6px_0_6px_-6px_rgba(0,0,0,0.15)]`
                      : cellCls;

                    return (
                      <td
                        key={c.key}
                        className={stickyCls}
                        style={bg ? { backgroundColor: bg } : undefined}
                        title={String(value ?? "")}
                      >
                        {c.key === "player" ? (
                          <div className="flex items-center gap-2">
                            <img
                              src={teamLogo(r.team)}
                              alt=""
                              className="w-4 h-4 rounded-sm object-contain"
                              onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                            />
                            <span className="whitespace-nowrap">
                              {renderCell(c.key, r)}
                            </span>
                          </div>
                        ) : (
                          renderCell(c.key, r)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

            {!loading && !sorted.length && (
              <tr>
                <td className={`${cellCls} text-center text-gray-500`} colSpan={columns.length}>
                  No data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-[12px] text-gray-500">
        <span className="mr-3">pOWN% = Projected Ownership</span>
      </div>
    </div>
  );
}
