// src/pages/nfl/NFLOptimizer.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/* ----------------------------- helpers ----------------------------- */
import API_BASE from "../../utils/api";

const clamp = (v, lo = 0, hi = 1e9) => Math.max(lo, Math.min(hi, v));
const num = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/\$/g, "").replace(/[,  \s]/g, "").replace(/%/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const fmt0 = (n) => (Number.isFinite(n) ? n.toLocaleString() : "—");
const fmt1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : "—");
const escapeCSV = (s) => /[",\r\n]/.test(String(s ?? "")) ? `"${String(s ?? "").replace(/"/g, '""')}"` : String(s ?? "");

// small design tokens
const cls = {
  input:
    "h-8 px-2 text-sm rounded-md border border-gray-200 focus:ring-2 focus:ring-blue-200 focus:border-blue-400",
  btn: {
    primary: "h-8 px-4 rounded-md bg-blue-600 text-white hover:bg-blue-700",
    ghost: "h-8 px-3 rounded-md border border-gray-200 bg-white hover:bg-gray-50",
    chip: "px-3 py-1.5 text-xs font-medium rounded-full border",
    iconSm:
      "inline-flex items-center justify-center w-6 h-6 rounded-md border border-gray-200 hover:bg-gray-50",
  },
  card: "rounded-2xl border border-gray-200 bg-white shadow-sm",
  tableHead: "px-2 py-1 font-semibold text-center select-none",
  cell: "px-2 py-1 text-center",
};

const timeAgo = (iso) => {
  try {
    const d = typeof iso === "string" ? new Date(iso) : new Date(iso ?? 0);
    const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  } catch {
    return "";
  }
};

// normalizers
const normName = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/\./g, "")
    .replace(/,\s*(jr|sr)\b/g, "")
    .replace(/\b(jr|sr)\b/g, "")
    .replace(/[^a-z' -]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const normTeam = (s) => (s || "").toUpperCase().trim();
const normPos = (s) => {
  const raw = (s || "").toUpperCase().replace("/FLEX", "").trim();
  if (raw === "D" || raw === "DEF" || raw === "DEFENSE" || raw.includes("D/ST") || raw === "DST")
    return "DST";
  return raw;
};

/* ----------------------------- team meta --------------------------- */
const NFL_TEAMS = {
  ARI: { city: "Arizona", nickname: "Cardinals" },
  ATL: { city: "Atlanta", nickname: "Falcons" },
  BAL: { city: "Baltimore", nickname: "Ravens" },
  BUF: { city: "Buffalo", nickname: "Bills" },
  CAR: { city: "Carolina", nickname: "Panthers" },
  CHI: { city: "Chicago", nickname: "Bears" },
  CIN: { city: "Cincinnati", nickname: "Bengals" },
  CLE: { city: "Cleveland", nickname: "Browns" },
  DAL: { city: "Dallas", nickname: "Cowboys" },
  DEN: { city: "Denver", nickname: "Broncos" },
  DET: { city: "Detroit", nickname: "Lions" },
  GB: { city: "Green Bay", nickname: "Packers" },
  HOU: { city: "Houston", nickname: "Texans" },
  IND: { city: "Indianapolis", nickname: "Colts" },
  JAX: { city: "Jacksonville", nickname: "Jaguars" },
  KC: { city: "Kansas City", nickname: "Chiefs" },
  LAC: { city: "Los Angeles", nickname: "Chargers" },
  LAR: { city: "Los Angeles", nickname: "Rams" },
  LV: { city: "Las Vegas", nickname: "Raiders" },
  MIA: { city: "Miami", nickname: "Dolphins" },
  MIN: { city: "Minnesota", nickname: "Vikings" },
  NE: { city: "New England", nickname: "Patriots" },
  NO: { city: "New Orleans", nickname: "Saints" },
  NYG: { city: "New York", nickname: "Giants" },
  NYJ: { city: "New York", nickname: "Jets" },
  PHI: { city: "Philadelphia", nickname: "Eagles" },
  PIT: { city: "Pittsburgh", nickname: "Steelers" },
  SEA: { city: "Seattle", nickname: "Seahawks" },
  SF: { city: "San Francisco", nickname: "49ers" },
  TB: { city: "Tampa Bay", nickname: "Buccaneers" },
  TEN: { city: "Tennessee", nickname: "Titans" },
  WAS: { city: "Washington", nickname: "Commanders" },
};
function inferTeamFromNameForDST(name) {
  const nm = normName(name);
  for (const [abbr, t] of Object.entries(NFL_TEAMS)) {
    const nick = normName(t.nickname);
    const city = normName(t.city);
    const full = normName(`${t.city} ${t.nickname}`);
    if (
      nm === nick ||
      nm === city ||
      nm === full ||
      nm.includes(nick) ||
      nm.includes(city) ||
      nm.includes(full)
    ) {
      return abbr;
    }
  }
  return "";
}

/* ------------------------------ colors ----------------------------- */
const TEAM_COLORS = {
  ARI: "#97233F",
  ATL: "#A71930",
  BAL: "#241773",
  BUF: "#00338D",
  CAR: "#0085CA",
  CHI: "#0B162A",
  CIN: "#FB4F14",
  CLE: "#311D00",
  DAL: "#041E42",
  DEN: "#FB4F14",
  DET: "#0076B6",
  GB: "#203731",
  HOU: "#03202F",
  IND: "#002C5F",
  JAX: "#006778",
  KC: "#E31837",
  LAC: "#0080C6",
  LAR: "#003594",
  LV: "#000000",
  MIA: "#008E97",
  MIN: "#4F2683",
  NE: "#002244",
  NO: "#D3BC8D",
  NYG: "#0B2265",
  NYJ: "#125740",
  PHI: "#004C54",
  PIT: "#FFB612",
  SEA: "#002244",
  SF: "#AA0000",
  TB: "#D50A0A",
  TEN: "#0C2340",
  WAS: "#5A1414",
};
const hexToRGB = (hex) => {
  const h = (hex || "#888").replace("#", "");
  const v = parseInt(h, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
};
const readableText = (hex) => {
  const { r, g, b } = hexToRGB(hex);
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L < 140 ? "#FFFFFF" : "#111111";
};
const TeamPill = ({ abbr, title }) => {
  const bg = TEAM_COLORS[abbr] || "#E5E7EB";
  const fg = readableText(bg);
  return (
    <span
      className="px-2 py-0.5 rounded"
      style={{ backgroundColor: bg, color: fg }}
      title={title || abbr}
    >
      {abbr || "—"}
    </span>
  );
};

/* --------------------------- misc helpers -------------------------- */
const parseKick = (t) => {
  if (!t) return -1;
  const m = String(t).match(/(\d{1,2}):(\d{2})\s*([AP])M/i);
  if (!m) return -1;
  let hh = Number(m[1]) % 12;
  const mm = Number(m[2]) || 0;
  if (/p/i.test(m[3])) hh += 12;
  return hh * 60 + mm;
};

const useStickyState = (key, init) => {
  const [v, setV] = useState(init);
  useEffect(() => {
    try {
      setV(JSON.parse(localStorage.getItem(key)) ?? init);
    } catch {
      setV(init);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {}
  }, [key, v]);
  return [v, setV];
};

// Persist a Set in localStorage, expose Set API
function useStickySet(key, initSet = new Set()) {
  const [raw, setRaw] = useStickyState(key, Array.from(initSet));
  const valueSet = useMemo(() => new Set(raw), [raw]);
  const setValue = (next) => {
    if (typeof next === "function") {
      setRaw((prev) => {
        const prevSet = new Set(prev);
        const out = next(prevSet);
        return Array.from(out instanceof Set ? out : new Set(out || []));
      });
    } else {
      setRaw(Array.from(next instanceof Set ? next : new Set(next || [])));
    }
  };
  return [valueSet, setValue];
}

function useJson(url) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        let j;
        try {
          j = ct.includes("application/json") ? await res.json() : JSON.parse(await res.text());
        } catch (e) {
          const preview = await res.text();
          throw new Error(`Could not parse JSON. CT=${ct}. Preview: ${preview.slice(0, 200)}`);
        }
        if (alive) {
          setData(j);
          setErr(null);
        }
      } catch (e) {
        if (alive) {
          setData(null);
          setErr(e);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [url]);
  return { data, err, loading };
}

/* ----------------------------- sites ------------------------------- */
const SITES = {
  dk: {
    key: "dk",
    label: "DraftKings",
    logo: "/logos/dk.png",
    cap: 50000,
    slots: [
      { name: "QB", eligible: ["QB"] },
      { name: "RB1", eligible: ["RB"] },
      { name: "RB2", eligible: ["RB"] },
      { name: "WR1", eligible: ["WR"] },
      { name: "WR2", eligible: ["WR"] },
      { name: "WR3", eligible: ["WR"] },
      { name: "TE", eligible: ["TE"] },
      { name: "FLEX", eligible: ["RB", "WR", "TE"] },
      { name: "DST", eligible: ["DST"] },
    ],
    salary: "DK Sal",
    proj: "DK Proj",
    floor: "DK Floor",
    ceil: "DK Ceiling",
    pown: ["DK pOWN%", "DK pOWN"],
    opt: ["DK Opt%", "DK Opt"],
  },
  fd: {
    key: "fd",
    label: "FanDuel",
    logo: "/logos/fd.png",
    cap: 60000,
    slots: [
      { name: "QB", eligible: ["QB"] },
      { name: "RB1", eligible: ["RB"] },
      { name: "RB2", eligible: ["RB"] },
      { name: "WR1", eligible: ["WR"] },
      { name: "WR2", eligible: ["WR"] },
      { name: "WR3", eligible: ["WR"] },
      { name: "TE", eligible: ["TE"] },
      { name: "FLEX", eligible: ["RB", "WR", "TE"] },
      { name: "DST", eligible: ["DST"] }, // header becomes DEF for FD on export
    ],
    salary: "FD Sal",
    proj: "FD Proj",
    floor: "FD Floor",
    ceil: "FD Ceiling",
    pown: ["FD pOWN%", "FD pOWN"],
    opt: ["FD Opt%", "FD Opt"],
  },
};

const SOURCE = "/data/nfl/classic/latest/projections.json";
const SITE_IDS_SOURCE = "/data/nfl/classic/latest/site_ids.json";

/* --------------------------- server (SSE) -------------------------- */
async function solveStreamNFL(payload, onItem, onDone) {
  const res = await fetch(`${API_BASE}/solve_nfl_stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) throw new Error("Stream failed to start");

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const chunk of parts) {
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.done) onDone?.(evt);
        else onItem?.(evt);
      } catch {}
    }
  }
}

/* ---------------------- ordering helpers --------------------------- */
function orderPlayersForSite(names, rowsMap) {
  const pool = names.map((n) => rowsMap.get(n)).filter(Boolean);
  const take = (wanted) => {
    if (wanted.join("") === "RBWRTE") {
      let bestIdx = -1,
        bestTime = -1;
      for (let i = 0; i < pool.length; i++) {
        const r = pool[i];
        if (!wanted.includes(r.pos)) continue;
        const t = parseKick(r.time);
        if (t > bestTime) {
          bestTime = t;
          bestIdx = i;
        }
      }
      if (bestIdx !== -1) return pool.splice(bestIdx, 1)[0];
    }
    const i = pool.findIndex((r) => wanted.includes(r.pos));
    if (i === -1) return null;
    return pool.splice(i, 1)[0];
  };
  const out = [];
  out.push(take(["QB"]));
  out.push(take(["RB"]));
  out.push(take(["RB"]));
  out.push(take(["WR"]));
  out.push(take(["WR"]));
  out.push(take(["WR"]));
  out.push(take(["TE"]));
  out.push(take(["RB", "WR", "TE"])); // FLEX
  out.push(take(["DST"]));
  return out.filter(Boolean);
}

/* ---------------------------- CSV export --------------------------- */
function toPlainCSV(lineups, rows, site) {
  const rowsByName = new Map(rows.map((r) => [r.name, r]));
  const header = ["#", "Salary", "Time", "Total", "Players"].join(",");
  const lines = lineups.map((L, i) => {
    const ordered = orderPlayersForSite(L.players, rowsByName);
    const qb = ordered.find((r) => r.pos === "QB");
    const time = qb?.time || "";
    const players = `"${ordered.map((r) => r.name).join(" • ")}"`;
    return [i + 1, L.salary, time, L.total.toFixed(1), players].join(",");
  });
  return [header, ...lines].join("\n");
}
function downloadPlainCSV(lineups, rows, site, fname = "nfl_lineups.csv") {
  const blob = new Blob([toPlainCSV(lineups, rows, site)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fname;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export CSV with site IDs — positions-only header (FD uses DEF). */
function downloadSiteLineupsCSV({
  lineups,
  site,
  slots,
  siteIds,
  rows,
  fname = "nfl_lineups_site_ids.csv",
}) {
  const siteKey = site === "fd" ? "fd" : "dk";
  const slotList = Array.isArray(slots) ? slots : SITES[site]?.slots || [];

  const slotHeaders = slotList.map((s) => {
    const base = String(s.name).replace(/\d+$/, "");
    return siteKey === "fd" && base === "DST" ? "DEF" : base;
  });
  const header = slotHeaders.join(",");

  const list = Array.isArray(siteIds?.[siteKey]) ? siteIds[siteKey] : siteIds?.sites?.[siteKey] ?? [];

  let fdPrefix = null;
  if (siteKey === "fd") {
    const prefCounts = new Map();
    for (const r of list) {
      const px = r.slateId ?? r.slate_id ?? r.groupId ?? r.group_id ?? r.lid ?? r.prefix;
      if (px != null && px !== "") {
        const key = String(px);
        prefCounts.set(key, (prefCounts.get(key) || 0) + 1);
      }
    }
    if (prefCounts.size === 1) fdPrefix = [...prefCounts.keys()][0];
    else if (prefCounts.size > 1) fdPrefix = [...prefCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  const keyStrict = (n, t, p) => `${normName(n)}|${normTeam(t)}|${normPos(p)}`;
  const keyLoose = (n, p) => `${normName(n)}|${normPos(p)}`;
  const keyTeam = (t, p) => `${normTeam(t)}|${normPos(p)}`;

  const idIndex = new Map();
  const put = (k, rec) => {
    if (k && !idIndex.has(k)) idIndex.set(k, rec);
  };

  for (const r of list) {
    const id = String(r.id);
    const nm0 = r.name ?? r.player ?? r.Player;
    let pos0 = r.pos ?? r.Pos ?? r.POS ?? r.Position ?? r.position;
    let tm0 = r.team ?? r.Team ?? r.TEAM ?? r.team_abbr ?? r.TeamAbbrev;
    const nm = nm0 ? String(nm0) : "";
    const pos = normPos(pos0);
    let tm = normTeam(tm0);
    if (pos === "DST" && !tm) tm = inferTeamFromNameForDST(nm) || "";

    const rec = { id, nameFromSite: nm, team: tm, pos };

    if (nm) {
      put(keyStrict(nm, tm, pos), rec);
      put(keyLoose(nm, pos), rec);
    }
    if (pos === "DST" && tm) {
      put(keyTeam(tm, "DST"), rec);
      const meta = NFL_TEAMS[tm];
      if (meta) {
        put(keyStrict(meta.nickname, tm, "DST"), rec);
        put(keyLoose(meta.nickname, "DST"), rec);
        put(keyStrict(`${meta.city} ${meta.nickname}`, tm, "DST"), rec);
        put(keyLoose(`${meta.city} ${meta.nickname}`, "DST"), rec);
        put(keyStrict(meta.city, tm, "DST"), rec);
        put(keyLoose(meta.city, "DST"), rec);
      }
    }
  }

  const rowsByName = new Map(rows.map((r) => [r.name, r]));

  const lines = lineups.map((L) => {
    const ordered = orderPlayersForSite(L.players, rowsByName);
    const cells = ordered.slice(0, slotList.length).map((meta) => {
      const name = meta.name;
      const pos = normPos(meta.pos);
      const tm = normTeam(meta.team);

      const ks = keyStrict(name, tm, pos);
      const kl = keyLoose(name, pos);
      let rec = idIndex.get(ks) || idIndex.get(kl);

      if (!rec && pos === "DST") {
        rec = idIndex.get(keyTeam(tm, "DST")) || rec;
        const metaTeam = NFL_TEAMS[tm];
        if (!rec && metaTeam) {
          const tryKeys = [
            keyStrict(metaTeam.nickname, tm, "DST"),
            keyLoose(metaTeam.nickname, "DST"),
            keyStrict(`${metaTeam.city} ${metaTeam.nickname}`, tm, "DST"),
            keyLoose(`${metaTeam.city} ${metaTeam.nickname}`, "DST"),
            keyStrict(metaTeam.city, tm, "DST"),
            keyLoose(metaTeam.city, "DST"),
          ];
          for (const k of tryKeys) {
            rec = rec || idIndex.get(k);
            if (rec) break;
          }
        }
        if (!rec) {
          const inferred = inferTeamFromNameForDST(name);
          if (inferred) {
            rec =
              idIndex.get(keyTeam(inferred, "DST")) ||
              idIndex.get(keyStrict(name, inferred, "DST")) ||
              idIndex.get(keyLoose(name, "DST"));
          }
        }
      }

      if (!rec) return escapeCSV(name); // still export name

      if (siteKey === "fd") {
        const outId = fdPrefix ? `${fdPrefix}-${rec.id}` : rec.id;
        const displayName = rec.nameFromSite || name;
        return escapeCSV(`${outId}:${displayName}`);
      }
      // DK
      return escapeCSV(`${name} (${rec.id})`);
    });

    while (cells.length < slotList.length) cells.push("");
    return cells.join(",");
  });

  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fname;
  a.click();
  URL.revokeObjectURL(url);
}

/* ============================== page =============================== */
export default function NFLOptimizer() {
  const { data, err, loading } = useJson(SOURCE);
  const { data: siteIds } = useJson(SITE_IDS_SOURCE);

  const [site, setSite] = useStickyState("nflOpt.site", "dk");
  const cfg = SITES[site];

  const [optBy, setOptBy] = useStickyState("nflOpt.optBy", "proj");
  const [numLineups, setNumLineups] = useStickyState("nflOpt.N", 20);

  const [maxSalary, setMaxSalary] = useStickyState(`nflOpt.${site}.cap`, cfg.cap);
  useEffect(() => {
    setMaxSalary(SITES[site].cap);
  }, [site]);

  const [globalMax, setGlobalMax] = useStickyState("nflOpt.gmax", 100);
  const [randomness, setRandomness] = useStickyState("nflOpt.rand", 0);

  // per-player auto-exclude cap
  const [maxPownCap, setMaxPownCap] = useStickyState("nflOpt.maxPownCap", "");

  // lineup-level pOWN% cap (sum)
  const [maxLineupPown, setMaxLineupPown] = useStickyState("nflOpt.maxLineupPown", "");

  // constraints
  const [qbStackMin, setQbStackMin] = useStickyState("nflOpt.qbStackMin", 2);
  const [bringbackMin, setBringbackMin] = useStickyState("nflOpt.bringbackMin", 1);
  const [allowTeInFlex, setAllowTeInFlex] = useStickyState("nflOpt.allowTeInFlex", true);
  const [stackAllowRB, setStackAllowRB] = useStickyState("nflOpt.stackAllowRB", false);
  const [avoidRbVsOppDst, setAvoidRbVsOppDst] = useStickyState("nflOpt.avoidRbVsOppDst", true);
  const [avoidOffenseVsOppDst, setAvoidOffenseVsOppDst] = useStickyState(
    "nflOpt.avoidOffVsOppDst",
    false
  );
  const [maxFromTeam, setMaxFromTeam] = useStickyState("nflOpt.maxFromTeam", "");

  // Only allow stacks to originate from selected teams
  const [restrictStacksToTeams, setRestrictStacksToTeams] = useStickyState(
    "nflOpt.restrictStacksToTeams",
    false
  );

  // team exposure caps per site
  const [teamMaxPct, setTeamMaxPct] = useStickyState(`nflOpt.${site}.teamMaxPct`, {});

  const [posFilter, setPosFilter] = useState("ALL");
  const [selectedGames, setSelectedGames] = useState(() => new Set());
  const [selectedTeams, setSelectedTeams] = useState(() => new Set());
  const [q, setQ] = useState("");

  // Persist per-site so refresh doesn't clear them
  const buildsKey = (k) => `nflOpt.${site}.${k}`;
  const [locks, setLocks] = useStickySet(buildsKey("locks"), new Set());
  const [excls, setExcls] = useStickySet(buildsKey("excls"), new Set());
  const [minPct, setMinPct] = useStickyState(buildsKey("minPct"), {});
  const [maxPct, setMaxPct] = useStickyState(buildsKey("maxPct"), {});
  const [boost, setBoost] = useStickyState(buildsKey("boost"), {});

  // groups / team rules
  const [groups, setGroups] = useStickyState(`nflOpt.${site}.groups`, []);
  const [teamStacks, setTeamStacks] = useStickyState(`nflOpt.${site}.teamStacks`, []);

  // builds per site
  const [builds, setBuilds] = useStickyState(buildsKey("builds"), []);
  const [activeBuildId, setActiveBuildId] = useStickyState(buildsKey("active"), null);

  const [lineups, setLineups] = useState([]);
  const [stopInfo, setStopInfo] = useState(null);

  const [progressActual, setProgressActual] = useState(0);
  const [progressUI, setProgressUI] = useState(0);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const tickRef = useRef(null);

  // live clock for build chips "time ago"
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isOptimizing) return;
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setProgressUI((p) => {
        const N = Math.max(1, Number(numLineups) || 1);
        const target = Math.max(progressActual, 1);
        const ceiling = Math.max(0, N - 1);
        return Math.min(Math.max(p + 1, target), ceiling);
      });
    }, 250);
    return () => clearInterval(tickRef.current);
  }, [isOptimizing, progressActual, numLineups]);

  // On site switch, clear live results but keep sticky constraints
  useEffect(() => {
    setLineups([]);
    setStopInfo(null);
    setProgressActual(0);
    setProgressUI(0);
    setIsOptimizing(false);
  }, [site]);

  // If there is an active build (persisted), auto-load its lineups
  useEffect(() => {
    if (!isOptimizing && activeBuildId != null) {
      const b = builds.find((x) => x.id === activeBuildId);
      if (b) {
        const N = (b.lineups || []).length;
        setLineups(b.lineups || []);
        setProgressActual(N);
        setProgressUI(N);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBuildId, builds, isOptimizing]);

  /* ------------------------------ rows ------------------------------ */
  const rows = useMemo(() => {
    if (!data) return [];

    const arr = Array.isArray(data?.rows)
      ? data.rows
      : Array.isArray(data?.players)
      ? data.players
      : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data)
      ? data
      : [];

    const pct = (v) => {
      if (v == null) return 0;
      const s = String(v).replace(/[%\s]/g, "");
      const n = Number(s);
      return Number.isFinite(n) ? n / 100 : 0;
    };

    const siteKey = cfg.key; // dk or fd
    const projKeyLC = `${siteKey}_proj`;
    const salKeyLC = `${siteKey}_sal`;
    const pownKeyLC = `${siteKey}_pown`;
    const optKeyLC = `${siteKey}_opt`;

    const mapped = arr.map((r) => {
      const name = r.player ?? r.Player ?? r.Name ?? r.playerName ?? r.name ?? "";
      const pos = String(r.pos ?? r.Pos ?? r.POS ?? r.Position ?? r.position ?? "").toUpperCase();
      const team = r.team ?? r.Team ?? r.Tm ?? r.TEAM ?? r.TEAM_ABBR ?? r.team_abbr ?? "";
      const opp = r.opp ?? r.Opp ?? r.OPP ?? r.Opponent ?? r.opponent ?? "";

      const salary = num(r[salKeyLC] ?? r[`${cfg.label} Sal`] ?? r.Salary ?? r.salary);
      const proj = num(r[projKeyLC] ?? r[`${cfg.label} Proj`] ?? r.Projection ?? r.Points);
      const val = Number.isFinite(proj) && salary > 0 ? (proj / salary) * 1000 : 0;
      const floor = num(r[`${cfg.key}_floor`] ?? r[`${cfg.label} Floor`] ?? r.Floor,);
      const ceil = num(r[`${cfg.key}_ceil`] ?? r[`${cfg.label} Ceiling`] ?? r.Ceiling,);
      const pown = pct(
        r[pownKeyLC] ?? r["DK pOWN%"] ?? r["FD pOWN%"] ?? r["DK pOWN"] ?? r["FD pOWN"]
      );
      const opt = pct(r[optKeyLC] ?? r["DK Opt%"] ?? r["FD Opt%"] ?? r["DK Opt"] ?? r["FD Opt"]);

      return {
        name,
        pos,
        team,
        opp,
        salary,
        proj,
        val,
        floor,
        ceil,
        pown,
        opt,
        time: r.Time ?? r["Time ET"] ?? r.Start ?? r.time ?? "",
        gameKey: team && opp ? `${team}@${opp}` : "",
        pairKey: team && opp ? [team, opp].sort().join("@") : "",
        __raw: r,
      };
    });

    // optional implied map (for game chips labels)
    const teamImplied = new Map();
    for (const r of mapped) {
      if (!r.team) continue;
      const prev = teamImplied.get(r.team) ?? -Infinity;
      const v = num(r.__raw?.implied ?? r.__raw?.Implied ?? r.__raw?.["Team Total"]);
      if (Number.isFinite(v)) teamImplied.set(r.team, Math.max(prev, v));
    }
    mapped.__teamImplied = teamImplied;

    return mapped.filter((r) => r.name && r.pos);
  }, [data, site, cfg]);

  const teamImpliedMap = useMemo(
    () => (rows && rows.__teamImplied) ? rows.__teamImplied : new Map(),
    [rows]
  );

  const allTeams = useMemo(() => {
    const s = new Set();
    for (const r of rows) {
      if (r.team) s.add(r.team);
      if (r.opp) s.add(r.opp);
    }
    return [...s].sort();
  }, [rows]);

  const uniqueGames = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      if (!r.pairKey) continue;
      if (!m.has(r.pairKey)) {
        const t1Imp = teamImpliedMap.get(r.team);
        const t2Imp = teamImpliedMap.get(r.opp);
        const label =
          (Number.isFinite(t1Imp) ? `${r.team} (${t1Imp.toFixed(1)})` : r.team) +
          " @ " +
          (Number.isFinite(t2Imp) ? `${r.opp} (${t2Imp.toFixed(1)})` : r.opp) +
          (r.time ? ` · ${r.time}` : "");
        m.set(r.pairKey, { gameKey: r.pairKey, label });
      }
    }
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, teamImpliedMap]);

  /* ----------------------- order / filter / sort -------------------- */
  const [order, setOrder] = useState([]);
  const sortRef = useRef({ col: "proj", dir: "desc" });

  useEffect(() => {
    const initial = [...rows].sort((a, b) => b.proj - a.proj || a.name.localeCompare(b.name));
    setOrder(initial.map((r) => r.name));
  }, [site, rows.length]); // eslint-disable-line

  const usagePct = useMemo(() => {
    if (!lineups.length) return {};
    const m = new Map();
    for (const L of lineups) for (const p of L.players) m.set(p, (m.get(p) || 0) + 1);
    const total = Math.max(1, lineups.length);
    const out = {};
    for (const [name, cnt] of m.entries()) out[name] = (cnt / total) * 100;
    return out;
  }, [lineups]);

  const displayRows = useMemo(() => {
    const posOK = (pos) =>
      posFilter === "ALL" ? true : posFilter === "FLEX" ? ["RB", "WR", "TE"].includes(pos) : pos === posFilter;
    const needle = q.trim().toLowerCase();
    const textOK = (r) =>
      !needle ||
      r.name.toLowerCase().includes(needle) ||
      r.team.toLowerCase().includes(needle) ||
      r.opp.toLowerCase().includes(needle) ||
      r.pos.toLowerCase().includes(needle) ||
      String(r.salary).includes(needle);
    const gameOK = (r) => selectedGames.size === 0 || selectedGames.has(r.pairKey);
    const teamOK = (r) => selectedTeams.size === 0 || selectedTeams.has(r.team);

    const byName = new Map(rows.map((r) => [r.name, r]));
    const ordered = order.map((n) => byName.get(n)).filter(Boolean);
    const others = rows.filter((r) => !order.includes(r.name));
    const base = [...ordered, ...others];

    return base.filter((r) => posOK(r.pos) && textOK(r) && gameOK(r) && teamOK(r));
  }, [rows, order, q, posFilter, selectedGames, selectedTeams]);

  const sortable = new Set([
    "pos",
    "team",
    "opp",
    "salary",
    "time",
    "proj",
    "val",
    "floor",
    "ceil",
    "pown",
    "opt",
    "usage",
  ]);
  const setSort = (col) => {
    if (!sortable.has(col)) return;
    const dir =
      sortRef.current.col === col ? (sortRef.current.dir === "asc" ? "desc" : "asc") : "desc";
    sortRef.current = { col, dir };
    const mult = dir === "asc" ? 1 : -1;
    const sorted = [...displayRows].sort((a, b) => {
      if (["pos", "team", "opp", "time"].includes(col)) {
        const va = (a[col] || "").toString();
        const vb = (b[col] || "").toString();
        if (va < vb) return -1 * mult;
        if (va > vb) return 1 * mult;
        return a.name.localeCompare(b.name) * mult;
      }
      const va =
        col === "pown" || col === "opt" || col === "usage"
          ? ((col === "usage" ? usagePct[a.name] : a[col]) || 0) * 100
          : a[col] ?? 0;
      const vb =
        col === "pown" || col === "opt" || col === "usage"
          ? ((col === "usage" ? usagePct[b.name] : b[col]) || 0) * 100
          : b[col] ?? 0;
      if (va < vb) return -1 * mult;
      if (va > vb) return 1 * mult;
      return a.name.localeCompare(b.name) * mult;
    });
    setOrder(sorted.map((r) => r.name));
  };
  const sortArrow = (key) =>
    sortRef.current.col === key ? (sortRef.current.dir === "asc" ? " ▲" : " ▼") : "";

  /* ----------------------------- actions ---------------------------- */
  const bumpBoost = (name, step) =>
    setBoost((m) => ({ ...m, [name]: clamp((m[name] || 0) + step, -6, 6) }));
  const toggleLock = (name) =>
    setLocks((s) => {
      const n = new Set(s);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  const toggleExcl = (name) =>
    setExcls((s) => {
      const n = new Set(s);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });

  const resetConstraints = () => {
    setLocks(new Set());
    setExcls(new Set());
    setMinPct({});
    setMaxPct({});
    setBoost({});
    setGroups([]);
    setTeamStacks([]);
    setTeamMaxPct({});
  };

/* --------------------------- optimize (SSE) ------------------------ */
async function optimize() {
  if (!rows.length) return;

  // reset UI state
  setLineups([]);
  setStopInfo(null);
  setProgressActual(0);
  setProgressUI(0);
  setIsOptimizing(true);

  // Respect TE-in-FLEX toggle
  const slotsForSolve = cfg.slots.map((s) =>
    s.name === "FLEX" ? { ...s, eligible: allowTeInFlex ? ["RB", "WR", "TE"] : ["RB", "WR"] } : s
  );

  const N = Math.max(1, Number(numLineups) || 1);
  const capVal = Math.min(cfg.cap, Number(maxSalary) || cfg.cap);

  // per-player auto-exclude by pOWN%
  const cap = clamp(Number(maxPownCap), 0, 100);
  const autoExcludesByPown =
    String(maxPownCap).trim() === ""
      ? []
      : rows.filter((r) => ((r.pown || 0) * 100) > cap).map((r) => r.name);

  // If the toggle is ON and you have selected teams, exclude QBs from all other teams.
  const qbExclByTeam =
    restrictStacksToTeams && selectedTeams && selectedTeams.size > 0
      ? rows.filter((r) => r.pos === "QB" && !selectedTeams.has(r.team)).map((r) => r.name)
      : [];

  // merge with existing excludes; keep unique
  const mergedExcludes = Array.from(new Set([
    ...Array.from(excls),
    ...autoExcludesByPown,
    ...qbExclByTeam,
  ]));

  // lineup-level pOWN% handling
  const rowsByName = new Map(rows.map((r) => [r.name, r]));
  const lineupPownPct = (names) =>
    names.reduce((s, n) => s + (((rowsByName.get(n)?.pown) || 0) * 100), 0);
  const lineupCap = String(maxLineupPown).trim() === ""
    ? null
    : clamp(Number(maxLineupPown) || 0, 0, 1000);

  // Base payload used for all passes
  const basePayload = {
    site,
    slots: slotsForSolve,
    players: rows.map((r) => ({
      name: r.name, pos: r.pos, team: r.team, opp: r.opp,
      salary: Math.round(r.salary || 0),
      proj: r.proj || 0, floor: r.floor || 0, ceil: r.ceil || 0,
      pown: r.pown || 0, opt: r.opt || 0,
    })),
    cap: capVal,
    objective: optBy,
    locks: Array.from(locks),
    excludes: mergedExcludes,
    boosts: boost,
    randomness: clamp(Number(randomness) || 0, 0, 100),
    global_max_pct: clamp(Number(globalMax) || 100, 0, 100),
    min_pct: Object.fromEntries(Object.entries(minPct).map(([k, v]) => [k, clamp(Number(v) || 0, 0, 100)])),
    max_pct: Object.fromEntries(Object.entries(maxPct).map(([k, v]) => [k, clamp(Number(v) || 100, 0, 100)])),
    min_diff: 1,
    time_limit_ms: 1500, // fast first pass
    qb_stack_min: Math.max(0, Number(qbStackMin) || 0),
    stack_allow_rb: !!stackAllowRB,
    bringback_min: Math.max(0, Number(bringbackMin) || 0),
    max_from_team: String(maxFromTeam).trim() === "" ? null : Math.max(1, Number(maxFromTeam) || 1),
    avoid_rb_vs_opp_dst: !!avoidRbVsOppDst,
    avoid_offense_vs_opp_dst: !!avoidOffenseVsOppDst,
    groups: (groups || []).map((g) => ({
      mode: g.mode || "at_most",
      count: Math.max(0, Number(g.count) || 0),
      players: Array.isArray(g.players) ? g.players : [],
    })),
    team_stack_rules: (teamStacks || []).map((t) => ({
      team: t.team,
      qb_stack_min: String(t.qb_stack_min).trim() === "" ? undefined : Math.max(0, Number(t.qb_stack_min) || 0),
      bringback_min: String(t.bringback_min).trim() === "" ? undefined : Math.max(0, Number(t.bringback_min) || 0),
      allow_rb_in_stack: !!t.allow_rb_in_stack,
      bringback_teams: Array.isArray(t.bringback_teams) ? t.bringback_teams : undefined,
      max_from_team: String(t.max_from_team).trim() === "" ? undefined : Math.max(1, Number(t.max_from_team) || 1),
    })),
    team_max_pct: teamMaxPct,
    max_lineup_pown_pct: lineupCap == null ? null : lineupCap,
  };

  const out = [];

  // helper: one streaming run
  const runOnce = async (pl) => {
    await solveStreamNFL(
      pl,
      (evt) => {
        if (lineupCap != null && lineupPownPct(evt.drivers) > lineupCap) return; // filter
        const L = { players: evt.drivers, salary: evt.salary, total: evt.total };
        out.push(L);
        setLineups((prev) => [...prev, L]);
        setProgressActual(out.length);
      },
      (done) => {
        if (done?.reason) setStopInfo(done);
      }
    );
  };

  try {
    // ---------- PASS 1: quick ----------
    await runOnce({ ...basePayload, n: N });

    // ---------- PASS 2 (adaptive): only if needed ----------
    if (out.length < N) {
      const need = N - out.length;
      const SECOND_PASS_TIME_MS = Math.max(5000, basePayload.time_limit_ms || 0);
      const SECOND_PASS_RANDOMNESS = Math.max(15, basePayload.randomness || 0);

      await runOnce({
        ...basePayload,
        n: need,
        time_limit_ms: SECOND_PASS_TIME_MS,
        randomness: SECOND_PASS_RANDOMNESS,
      });
    }

    // Finalize UI
    if (out.length < N && lineupCap != null) {
      setStopInfo({
        produced: out.length,
        requested: N,
        reason: "lineup_pown_cap",
        detail: `Some lineups exceeded max lineup pOWN% (${lineupCap}%) and were filtered out.`,
      });
    }
    setProgressActual(out.length || N);
    setProgressUI(out.length || N);
    setIsOptimizing(false);
    clearInterval(tickRef.current);

    saveBuild(nextBuildNameForSite(site), out);
  } catch (e) {
    // Fallback non-streaming endpoint
    const res = await fetch(`${API_BASE}/solve_nfl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...basePayload, n: N }),
    });
    if (!res.ok) {
      alert(`Solve failed: ${await res.text()}`);
      setIsOptimizing(false);
      clearInterval(tickRef.current);
      return;
    }
    const j = await res.json();
    const raw = (j.lineups || []).map((L) => ({ players: L.drivers, salary: L.salary, total: L.total })) || [];
    const out2 = lineupCap == null ? raw : raw.filter((L) => lineupPownPct(L.players) <= lineupCap);

    setLineups(out2);
    setProgressActual(out2.length);
    setProgressUI(out2.length);
    setIsOptimizing(false);
    clearInterval(tickRef.current);
    if (out2.length < N) {
      setStopInfo({ produced: out2.length, requested: N, reason: "lineup_pown_cap" });
    }
    saveBuild(nextBuildNameForSite(site), out2);
  }
}


  /* -------------------------- builds (per site) ---------------------- */
  function nextBuildNameForSite(site) {
    try {
      const raw = localStorage.getItem(`nflOpt.${site}.builds`);
      const arr = raw ? JSON.parse(raw) : [];
      const nums = arr
        .map((b) => (b?.name ? String(b.name).match(/^Build\s+(\d+)$/i) : null))
        .filter(Boolean)
        .map((m) => Number(m[1]))
        .filter((n) => Number.isFinite(n));
      const next = nums.length ? Math.max(...nums) + 1 : 1;
      return `Build ${next}`;
    } catch {
      return "Build 1";
    }
  }
  function saveBuild(name, data) {
    const id = Date.now();
    const rec = {
      id,
      name,
      site,
      ts: new Date().toISOString(),
      settings: {
        site,
        optBy,
        numLineups: Math.max(1, Number(numLineups) || 1),
        cap: Math.min(cfg.cap, Number(maxSalary) || cfg.cap),
        globalMax,
        randomness,
        qbStackMin,
        bringbackMin,
        stackAllowRB,
        avoidRbVsOppDst,
        avoidOffenseVsOppDst,
        maxFromTeam,
        locks: [...locks],
        excls: [...excls],
        minPct,
        maxPct,
        boost,
        groups,
        teamStacks,
        teamMaxPct,
      },
      lineups: data,
    };
    const next = [...builds, rec];
    setBuilds(next);
    setActiveBuildId(id);
  }
  function loadBuild(id) {
    const b = builds.find((x) => x.id === id);
    if (!b) return;
    setActiveBuildId(id);
    setLineups(b.lineups || []);
    setProgressActual((b.lineups || []).length);
    setProgressUI((b.lineups || []).length);
  }
  function renameBuild(id, newName) {
    setBuilds((B) => B.map((b) => (b.id === id ? { ...b, name: newName || b.name } : b)));
  }
  function deleteBuild(id) {
    setBuilds((B) => B.filter((b) => b.id !== id));
    if (activeBuildId === id) {
      setActiveBuildId(null);
      setLineups([]);
      setProgressActual(0);
      setProgressUI(0);
    }
  }
  const clearBuilds = () => {
    setBuilds([]);
    setActiveBuildId(null);
    setLineups([]);
    setProgressActual(0);
    setProgressUI(0);
  };

  /* ------------------------------- UI -------------------------------- */
  const metricLabel =
    optBy === "proj"
      ? "Proj"
      : optBy === "floor"
      ? "Floor"
      : optBy === "ceil"
      ? "Ceiling"
      : optBy === "pown"
      ? "pOWN%"
      : "Opt%";

  const cell = cls.cell;
  const header = cls.tableHead + " text-xs";
  const textSz = "text-[12px]";

  const TABLE_COLS = [
    { key: "lock", label: "Lock" },
    { key: "excl", label: "Excl" },
    { key: "pos", label: "Pos", sortable: true },
    { key: "boosts", label: "Boosts" },
    { key: "name", label: "Player" },
    { key: "team", label: "Tm", sortable: true },
    { key: "opp", label: "Opp", sortable: true },
    { key: "salary", label: "Salary", sortable: true },
    { key: "time", label: "Time", sortable: true },
    { key: "proj", label: "Proj", sortable: true },
    { key: "val", label: "Val", sortable: true },
    { key: "floor", label: "Floor", sortable: true },
    { key: "ceil", label: "Ceiling", sortable: true },
    { key: "pown", label: "pOWN%", sortable: true },
    { key: "opt", label: "Opt%", sortable: true },
    { key: "min", label: "Min%" },
    { key: "max", label: "Max%" },
    { key: "usage", label: "Usage%", sortable: true },
  ];

  const allPlayerNames = useMemo(() => rows.map((r) => r.name), [rows]);

  return (
    <div className="px-4 md:px-6 py-5">
      <h1 className="text-2xl md:text-3xl font-extrabold mb-1">NFL — Optimizer</h1>

      {/* site toggle & reset */}
      <div className="mb-3 flex gap-2 items-center">
        {["dk", "fd"].map((s) => (
          <button
            key={s}
            onClick={() => setSite(s)}
            className={`px-3 py-1.5 rounded-full border text-sm inline-flex items-center gap-2 ${
              site === s
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <img src={SITES[s].logo} alt="" className="w-4 h-4" />
            <span>{SITES[s].label}</span>
          </button>
        ))}
        <button className={`ml-auto ${cls.btn.ghost}`} onClick={resetConstraints}>
          Reset constraints
        </button>
      </div>

      {/* controls */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end mb-2">
        <div className="md:col-span-2">
          <label className="block text-[11px] text-gray-600 mb-1">Optimize by</label>
          <select className={cls.input + " w-full"} value={optBy} onChange={(e) => setOptBy(e.target.value)}>
            <option value="proj">Projection</option>
            <option value="floor">Floor</option>
            <option value="ceil">Ceiling</option>
            <option value="pown">pOWN%</option>
            <option value="opt">Opt%</option>
          </select>
        </div>
        <div className="md:col-span-1">
          <label className="block text-[11px] text-gray-600 mb-1">Lineups</label>
          <input className={cls.input + " w-full"} value={numLineups} onChange={(e) => setNumLineups(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[11px] text-gray-600 mb-1">Max salary</label>
          <input className={cls.input + " w-full"} value={maxSalary} onChange={(e) => setMaxSalary(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[11px] text-gray-600 mb-1">Global Max %</label>
          <input className={cls.input + " w-full"} value={globalMax} onChange={(e) => setGlobalMax(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[11px] text-gray-600 mb-1">Randomness %</label>
          <input className={cls.input + " w-full"} value={randomness} onChange={(e) => setRandomness(e.target.value)} />
        </div>

        {/* per-player auto-exclude */}
        <div className="md:col-span-2">
          <label className="block text-[11px] text-gray-600 mb-1">Max player pOWN% (auto-exclude &gt;)</label>
          <input
            className={cls.input + " w-full"}
            placeholder="—"
            value={maxPownCap}
            onChange={(e) => setMaxPownCap(e.target.value)}
          />
        </div>

        {/* lineup-level cap */}
        <div className="md:col-span-2">
          <label className="block text-[11px] text-gray-600 mb-1">Max lineup pOWN% (sum)</label>
          <input
            className={cls.input + " w-full"}
            placeholder="—"
            value={maxLineupPown}
            onChange={(e) => setMaxLineupPown(e.target.value)}
          />
        </div>

        {/* Stacks / Bring-back */}
        <div className={`md:col-span-12 ${cls.card} p-2`}>
          <div className="text-[11px] text-gray-600 mb-1">Stacks / Bring-back</div>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <label className="text-sm">QB Stack Min</label>
            <input
              type="number"
              className={cls.input + " w-16"}
              value={qbStackMin}
              onChange={(e) => setQbStackMin(e.target.value)}
            />

            <label className="text-sm ml-2">Bring-back Min</label>
            <input
              type="number"
              className={cls.input + " w-16"}
              value={bringbackMin}
              onChange={(e) => setBringbackMin(e.target.value)}
            />

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowTeInFlex}
                onChange={(e) => setAllowTeInFlex(e.target.checked)}
              />
              Allow TE in FLEX
            </label>

            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={stackAllowRB} onChange={(e) => setStackAllowRB(e.target.checked)} />
              Allow RB in stacks
            </label>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={avoidRbVsOppDst}
                onChange={(e) => setAvoidRbVsOppDst(e.target.checked)}
              />
              Avoid RB vs opp DST
            </label>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={avoidOffenseVsOppDst}
                onChange={(e) => setAvoidOffenseVsOppDst(e.target.checked)}
              />
              Don’t allow offense vs opp DST
            </label>

            <label className="inline-flex items-center gap-2 text-sm">
              Max from team
              <input
                className={cls.input + " w-16"}
                placeholder="—"
                value={maxFromTeam}
                onChange={(e) => setMaxFromTeam(e.target.value)}
              />
            </label>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={restrictStacksToTeams}
                onChange={(e) => setRestrictStacksToTeams(e.target.checked)}
              />
              Only stack from selected teams
            </label>
          </div>

          {/* Team chips + selected summary with caps */}
          <div className="flex flex-col lg:flex-row gap-3">
            {/* Chips */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <button
                  className={cls.btn.ghost}
                  onClick={() => setSelectedTeams(new Set(allTeams))}
                >
                  Select all
                </button>
                <button
                  className={cls.btn.ghost}
                  onClick={() => setSelectedTeams(new Set())}
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {allTeams.map((t) => {
                  const active = selectedTeams.has(t);
                  const bg = TEAM_COLORS[t] || "#E5E7EB";
                  const fg = readableText(bg);
                  return (
                    <button
                      key={t}
                      onClick={() =>
                        setSelectedTeams((S) => {
                          const n = new Set(S);
                          active ? n.delete(t) : n.add(t);
                          return n;
                        })
                      }
                      className="px-2 py-1 rounded-md border text-sm"
                      style={{
                        backgroundColor: bg,
                        color: fg,
                        borderColor: active ? "#111" : "rgba(0,0,0,0.15)",
                        boxShadow: active ? "inset 0 0 0 1px #111" : "none",
                      }}
                      title={t}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected list + per-team cap editor */}
            <TeamCapEditor selectedTeams={selectedTeams} teamMaxPct={teamMaxPct} setTeamMaxPct={setTeamMaxPct} />
          </div>

          {/* Team-specific rules */}
          <div className="border-t pt-2 mt-2">
            <div className="flex justify-between items-center mb-2">
              <div className="text-[11px] text-gray-600">
                Team-specific stack rules (override globals)
              </div>
              <button
                className={cls.btn.ghost}
                onClick={() => setTeamStacks((T) => [...T, { team: "" }])}
              >
                + Add team rule
              </button>
            </div>

            {teamStacks.length === 0 ? (
              <div className="text-xs text-gray-500">
                No team rules yet. Add one to override globals for a specific team.
              </div>
            ) : (
              <div className="space-y-2">
                {teamStacks.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 border rounded-md p-2">
                    <TeamSelect
                      teams={allTeams}
                      value={r.team || ""}
                      onChange={(v) => setTeamStacks((T) => T.map((x, j) => (i === j ? { ...x, team: v } : x)))}
                    />

                    <label className="text-sm">QB stack</label>
                    <input
                      className={cls.input + " w-14"}
                      placeholder="—"
                      value={r.qb_stack_min ?? ""}
                      onChange={(e) =>
                        setTeamStacks((T) =>
                          T.map((x, j) => (i === j ? { ...x, qb_stack_min: e.target.value } : x))
                        )
                      }
                    />

                    <label className="text-sm">Bring-back</label>
                    <input
                      className={cls.input + " w-14"}
                      placeholder="—"
                      value={r.bringback_min ?? ""}
                      onChange={(e) =>
                        setTeamStacks((T) =>
                          T.map((x, j) => (i === j ? { ...x, bringback_min: e.target.value } : x))
                        )
                      }
                    />

                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!r.allow_rb_in_stack}
                        onChange={(e) =>
                          setTeamStacks((T) =>
                            T.map((x, j) =>
                              i === j ? { ...x, allow_rb_in_stack: e.target.checked } : x
                            )
                          )
                        }
                      />
                      Allow RB
                    </label>

                    <label className="text-sm">Max from team</label>
                    <input
                      className={cls.input + " w-16"}
                      placeholder="—"
                      value={r.max_from_team ?? ""}
                      onChange={(e) =>
                        setTeamStacks((T) =>
                          T.map((x, j) => (i === j ? { ...x, max_from_team: e.target.value } : x))
                        )
                      }
                    />

                    <div className="ml-auto" />
                    <button
                      className={cls.btn.ghost}
                      onClick={() => setTeamStacks((T) => T.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* progress + button */}
        <div className="md:col-span-12 flex items-end gap-3">
          <button className={cls.btn.primary} onClick={optimize}>
            {`Optimize ${numLineups}`}
          </button>
          <div className="flex-1 max-w-xs h-2 bg-gray-200 rounded overflow-hidden">
            <div
              className="h-2 bg-blue-500 rounded transition-all duration-300"
              style={{
                width: `${
                  (Math.min(progressUI, Math.max(1, Number(numLineups) || 1)) /
                    Math.max(1, Number(numLineups) || 1)) *
                  100
                }%`,
              }}
            />
          </div>
          <div className="text-sm text-gray-600 min-w-[60px] text-right">
            {progressUI}/{numLineups}
          </div>
        </div>
      </div>

      {/* Position tabs */}
      <div className="mb-2 flex gap-3 text-sky-600 font-semibold text-sm">
        {["ALL", "QB", "RB", "WR", "TE", "FLEX", "DST"].map((p) => (
          <button
            key={p}
            onClick={() => setPosFilter(p)}
            className={posFilter === p ? "underline" : "opacity-80 hover:opacity-100"}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="mb-2">
        <input
          className={cls.input + " w-80"}
          placeholder="Search player / team / pos…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* Game chips */}
      {uniqueGames.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            className={`px-2 py-1 rounded-md border text-sm ${
              selectedGames.size === 0
                ? "bg-blue-50 border-blue-300 text-blue-800"
                : "bg-white border-gray-300"
            }`}
            onClick={() => setSelectedGames(new Set())}
          >
            All games
          </button>
          <button
            className={cls.btn.ghost + " text-sm"}
            onClick={() => setSelectedGames(new Set(uniqueGames.map((g) => g.gameKey)))}
          >
            Select all
          </button>
          <button className={cls.btn.ghost + " text-sm"} onClick={() => setSelectedGames(new Set())}>
            Clear all
          </button>
          {uniqueGames.map((g) => {
            const active = selectedGames.has(g.gameKey);
            return (
              <button
                key={g.gameKey}
                onClick={() =>
                  setSelectedGames((S) => {
                    const n = new Set(S);
                    active ? n.delete(g.gameKey) : n.add(g.gameKey);
                    return n;
                  })
                }
                className={`px-2 py-1 rounded-md border text-sm ${
                  active ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-white border-gray-300"
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Player table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-auto mb-6 max-h-[700px]">
        <table className={`w-full border-separate ${textSz}`} style={{ borderSpacing: 0 }}>
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {TABLE_COLS.map(({ key, label, sortable }) => (
                <th
                  key={key}
                  className={`${header} whitespace-nowrap cursor-${
                    sortable ? "pointer" : "default"
                  } select-none`}
                  onClick={() => sortable && setSort(key)}
                >
                  {label}
                  {sortable ? <span className="opacity-60">{sortArrow(key)}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className={`${cell} text-gray-500`} colSpan={TABLE_COLS.length}>
                  Loading…
                </td>
              </tr>
            )}
            {err && (
              <tr>
                <td className={`${cell} text-red-600`} colSpan={TABLE_COLS.length}>
                  Failed to load: {String(err)}
                </td>
              </tr>
            )}
            {!loading &&
              !err &&
              displayRows.map((r) => (
                <tr
                  key={r.name}
                  className="odd:bg-white even:bg-gray-50 hover:bg-blue-50/60 transition-colors"
                >
                  <td className={cell}>
                    <input
                      type="checkbox"
                      checked={locks.has(r.name)}
                      onChange={() => toggleLock(r.name)}
                    />
                  </td>
                  <td className={cell}>
                    <input
                      type="checkbox"
                      checked={excls.has(r.name)}
                      onChange={() => toggleExcl(r.name)}
                    />
                  </td>
                  <td className={cell}>{r.pos}</td>
                  <td className={cell}>
                    <div className="inline-flex items-center gap-1">
                      <button
                        className={cls.btn.iconSm}
                        title="+3%"
                        onClick={() => setBoost((m) => ({ ...m, [r.name]: clamp((m[r.name] || 0) + 1, -6, 6) }))}
                      >
                        ▲
                      </button>
                      <span className="w-5 text-center">{boost[r.name] || 0}</span>
                      <button
                        className={cls.btn.iconSm}
                        title="-3%"
                        onClick={() => setBoost((m) => ({ ...m, [r.name]: clamp((m[r.name] || 0) - 1, -6, 6) }))}
                      >
                        ▼
                      </button>
                    </div>
                  </td>
                  <td className={`${cell} whitespace-nowrap`}>{r.name}</td>
                  <td className={cell}>
                    <TeamPill abbr={r.team} />
                  </td>
                  <td className={cell}>
                    <TeamPill abbr={r.opp} />
                  </td>
                  <td className={`${cell} tabular-nums`}>{fmt0(r.salary)}</td>
                  <td className={cell}>{r.time || "—"}</td>
                  <td className={`${cell} tabular-nums`}>
                    {fmt1(r.proj * (1 + 0.03 * (boost[r.name] || 0)))}
                  </td>
                  <td className={`${cell} tabular-nums`}>{fmt1(r.val)}</td>
                  <td className={`${cell} tabular-nums`}>{fmt1(r.floor)}</td>
                  <td className={`${cell} tabular-nums`}>{fmt1(r.ceil)}</td>
                  <td className={`${cell} tabular-nums`}>{fmt1(r.pown * 100)}</td>
                  <td className={`${cell} tabular-nums`}>{fmt1(r.opt * 100)}</td>
                  <td className={cell}>
                    <div className="inline-flex items-center gap-1">
                      <button
                        className={cls.btn.iconSm}
                        onClick={() =>
                          setMinPct((m) => ({
                            ...m,
                            [r.name]: clamp((num(m[r.name]) || 0) - 5, 0, 100),
                          }))
                        }
                        title="-5%"
                      >
                        –
                      </button>
                      <input
                        className="w-12 border rounded px-1.5 py-0.5 text-center text-sm"
                        value={String(minPct[r.name] ?? "")}
                        onChange={(e) =>
                          setMinPct((m) => ({
                            ...m,
                            [r.name]: e.target.value,
                          }))
                        }
                        placeholder="—"
                      />
                      <button
                        className={cls.btn.iconSm}
                        onClick={() =>
                          setMinPct((m) => ({
                            ...m,
                            [r.name]: clamp((num(m[r.name]) || 0) + 5, 0, 100),
                          }))
                        }
                        title="+5%"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className={cell}>
                    <div className="inline-flex items-center gap-1">
                      <button
                        className={cls.btn.iconSm}
                        onClick={() =>
                          setMaxPct((m) => ({
                            ...m,
                            [r.name]: clamp((num(m[r.name]) || 100) - 5, 0, 100),
                          }))
                        }
                        title="-5%"
                      >
                        –
                      </button>
                      <input
                        className="w-12 border rounded px-1.5 py-0.5 text-center text-sm"
                        value={String(maxPct[r.name] ?? "")}
                        onChange={(e) =>
                          setMaxPct((m) => ({
                            ...m,
                            [r.name]: e.target.value,
                          }))
                        }
                        placeholder="—"
                      />
                      <button
                        className={cls.btn.iconSm}
                        onClick={() =>
                          setMaxPct((m) => ({
                            ...m,
                            [r.name]: clamp((num(m[r.name]) || 100) + 5, 0, 100),
                          }))
                        }
                        title="+5%"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className={`${cell} tabular-nums`}>
                    {usagePct[r.name] != null ? fmt1(usagePct[r.name]) : "—"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Build manager (chips + actions) */}
      {builds.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600">Builds:</span>
          <div className="flex flex-wrap gap-2">
            {builds
              .slice()
              .sort((a, b) => b.id - a.id)
              .map((b) => (
                <button
                  key={b.id}
                  onClick={() => loadBuild(b.id)}
                  className={`${cls.btn.chip} ${
                    activeBuildId === b.id
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-gray-300 bg-white hover:bg-gray-50"
                  }`}
                  title={new Date(b.ts).toLocaleString()}
                >
                  {b.name}
                  <span className="ml-2 opacity-80">
                    {b.lineups?.length ?? 0} • {timeAgo(b.ts)}
                  </span>
                </button>
              ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {activeBuildId && (
              <>
                <button
                  className={cls.btn.ghost}
                  onClick={() => {
                    const newName =
                      prompt(
                        "Rename build",
                        builds.find((x) => x.id === activeBuildId)?.name || ""
                      ) || "";
                    if (newName.trim()) renameBuild(activeBuildId, newName.trim());
                  }}
                >
                  Rename
                </button>
                <button className={cls.btn.ghost} onClick={() => deleteBuild(activeBuildId)}>
                  Delete
                </button>
              </>
            )}
            <button className={cls.btn.ghost} onClick={clearBuilds}>
              Clear All Builds
            </button>
          </div>
        </div>
      )}

      {/* results & exposures */}
      {!!lineups.length && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Lineups table */}
          <section className="lg:col-span-8 rounded-lg border bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold">Lineups ({lineups.length})</h2>
              <div className="flex items-center gap-2">
                <button
                  className={cls.btn.ghost}
                  onClick={() => downloadPlainCSV(lineups, rows, site)}
                >
                  Export CSV
                </button>
                <button
                  className={cls.btn.ghost}
                  onClick={() =>
                    downloadSiteLineupsCSV({
                      lineups,
                      site,
                      slots: SITES[site].slots,
                      siteIds: siteIds || {},
                      rows,
                      fname: `NFL_lineups_${site.toUpperCase()}_ids.csv`,
                    })
                  }
                >
                  Export CSV (IDs)
                </button>
              </div>
            </div>
            <div className="overflow-auto max-h-[440px]">
              <table className="min-w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
                <thead className="bg-gray-50">
                  <tr>
                    <th className={header}>#</th>
                    <th className={header}>Salary</th>
                    <th className={header}>Total pOWN%</th>
                    <th className={header}>
                      Total {optBy === "pown" || optBy === "opt" ? "Projection" : metricLabel}
                    </th>
                    <th className={header}>Players</th>
                  </tr>
                </thead>
                <tbody>
                  {lineups.map((L, i) => {
                    const rowsByName = new Map(rows.map((r) => [r.name, r]));
                    const ordered = orderPlayersForSite(L.players, rowsByName);
                    const totalPown = ordered.reduce(
                      (s, r) => s + ((r.pown || 0) * 100),
                      0
                    );
                    return (
                      <tr key={i} className="odd:bg-white even:bg-gray-50">
                        <td className={cell}>{i + 1}</td>
                        <td className={`${cell} tabular-nums`}>{fmt0(L.salary)}</td>
                        <td className={`${cell} tabular-nums`}>{fmt1(totalPown)}</td>
                        <td className={`${cell} tabular-nums`}>{fmt1(L.total)}</td>
                        <td className={`${cell} leading-snug`}>
                          <span className="break-words">
                            {ordered.map((r) => r.name).join(" • ")}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {stopInfo && (
              <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                {stopInfo.detail ||
                  `Stopped early (${stopInfo.produced}/${stopInfo.requested}) due to ${stopInfo.reason}.`}
              </div>
            )}
          </section>

          {/* Player Exposure */}
          <section className="lg:col-span-4 rounded-lg border bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold">Exposure</h3>
              <button
                className={cls.btn.ghost}
                onClick={() => downloadExposuresCSV(lineups)}
              >
                Export Exposures
              </button>
            </div>
            <ExposureTable lineups={lineups} rows={rows} maxHeightClass="max-h-[440px]" />
          </section>

          {/* Team Exposure */}
          <section className="lg:col-span-4 rounded-lg border bg-white p-3">
            <h3 className="text-base font-semibold mb-2">Team Exposure</h3>
            <TeamExposureTable lineups={lineups} rows={rows} />
          </section>

          {/* Stack Shapes */}
          <section className="lg:col-span-4 rounded-lg border bg-white p-3">
            <h3 className="text-base font-semibold mb-2">Stack Shapes</h3>
            <StackShapesTable lineups={lineups} rows={rows} allowRB={stackAllowRB} />
          </section>

          {/* Cards */}
          <section className="lg:col-span-12 rounded-lg border bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold">Cards</h3>
              <div className="text-xs text-gray-500">
                Grid auto-fits (≈4 per row on wide screens)
              </div>
            </div>
            <LineupCards lineups={lineups} rows={rows} />
          </section>
        </div>
      )}
    </div>
  );
}

/* ---------------------- CSV exposures helper ---------------------- */
function downloadExposuresCSV(lineups, fname = "nfl_exposures.csv") {
  const m = new Map();
  for (const L of lineups) for (const p of L.players) m.set(p, (m.get(p) || 0) + 1);
  const total = Math.max(1, lineups.length);
  const rows = [...m.entries()]
    .map(([name, cnt]) => [name, cnt, (cnt / total) * 100])
    .sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0]));
  const header = "Player,Count,Exposure %";
  const body = rows.map((r) => `${escapeCSV(r[0])},${r[1]},${r[2].toFixed(1)}`).join("\n");
  const blob = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fname;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------------------- small UI components ------------------------ */
function PlayerMultiPicker({ allPlayers, value, onChange, placeholder = "Add players…" }) {
  const [q, setQ] = React.useState("");
  const selected = React.useMemo(() => new Set(value), [value]);
  const suggestions = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return allPlayers
      .filter((n) => !selected.has(n) && n.toLowerCase().includes(needle))
      .slice(0, 12);
  }, [q, allPlayers, selected]);
  const add = (name) => {
    if (!selected.has(name)) onChange([...value, name]);
    setQ("");
  };
  const remove = (name) => onChange(value.filter((v) => v !== name));
  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2 border rounded-md px-2 py-1.5">
        {value.map((name) => (
          <span
            key={name}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 text-[12px]"
          >
            {name}
            <button
              onClick={() => remove(name)}
              className="leading-none text-blue-600 hover:text-blue-900"
              title="Remove"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && suggestions.length) {
              e.preventDefault();
              add(suggestions[0]);
            }
          }}
          className="flex-1 min-w-[160px] outline-none text-sm py-1"
          placeholder={placeholder}
        />
      </div>
      {!!q && suggestions.length > 0 && (
        <div className="mt-1 max-h-48 overflow-auto bg-white border rounded-md shadow-sm">
          {suggestions.map((n) => (
            <button
              key={n}
              className="block w-full text-left px-3 py-1.5 hover:bg-blue-50 text-sm"
              onClick={() => add(n)}
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamSelect({ teams, value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border rounded-md px-2 py-1 text-sm"
    >
      <option value="">— pick team —</option>
      {teams.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

/** Side panel that lists selected teams and lets you set per-team max % */
function TeamCapEditor({ selectedTeams, teamMaxPct, setTeamMaxPct }) {
  const sel = useMemo(() => [...selectedTeams].sort(), [selectedTeams]);
  return (
    <div className="min-w-[240px] max-w-[300px] shrink-0 border rounded-md p-2">
      <div className="text-[11px] text-gray-600 mb-1">Selected teams ({sel.length})</div>
      {sel.length === 0 ? (
        <div className="text-xs text-gray-500">None selected</div>
      ) : (
        <div className="space-y-1 max-h-48 overflow-auto">
          {sel.map((t) => (
            <div key={t} className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1">
                <TeamPill abbr={t} />
              </span>
              <input
                className="w-20 border rounded px-1.5 py-0.5 text-right text-sm"
                placeholder="—"
                value={String(teamMaxPct?.[t] ?? "")}
                onChange={(e) => setTeamMaxPct((M) => ({ ...M, [t]: e.target.value }))}
                title="Max exposure % across builds"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------- Exposure tables --------------------------- */
function ExposureTable({ lineups, rows, maxHeightClass = "" }) {
  const [tab, setTab] = React.useState("ALL");
  const meta = useMemo(() => new Map(rows.map((r) => [r.name, r])), [rows]);

  const allRows = useMemo(() => {
    const m = new Map();
    for (const L of lineups) for (const p of L.players) m.set(p, (m.get(p) || 0) + 1);
    const total = Math.max(1, lineups.length);
    return [...m.entries()]
      .map(([name, cnt]) => {
        const r = meta.get(name);
        return { name, count: cnt, pct: (cnt / total) * 100, pos: r?.pos || "?" };
      })
      .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name));
  }, [lineups, meta]);

  const filtered = tab === "ALL" ? allRows : allRows.filter((r) => r.pos === tab);
  if (!allRows.length) return null;

  const cell = "px-2 py-1 text-center";
  const header = "px-2 py-1 font-semibold text-center";

  return (
    <div>
      <div className="mb-2 flex gap-2 text-sm">
        {["ALL", "QB", "RB", "WR", "TE", "DST"].map((t) => (
          <button
            key={t}
            className={`px-2 py-1 rounded border ${
              tab === t ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-white border-gray-300"
            }`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className={`overflow-auto ${maxHeightClass}`}>
        <table className="min-w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
          <thead className="bg-gray-50">
            <tr>
              <th className={header}>Player</th>
              <th className={header}>Pos</th>
              <th className={header}>Count</th>
              <th className={header}>Exposure %</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.name} className="odd:bg-white even:bg-gray-50">
                <td className={cell}>{r.name}</td>
                <td className={cell}>{r.pos}</td>
                <td className={`${cell} tabular-nums`}>{fmt0(r.count)}</td>
                <td className={`${cell} tabular-nums`}>{fmt1(r.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamExposureTable({ lineups, rows }) {
  const rowsByName = useMemo(() => new Map(rows.map((r) => [r.name, r])), [rows]);
  const data = useMemo(() => {
    const counts = new Map(); // team -> lineups containing team
    for (const L of lineups) {
      const chosenTeams = new Set(
        L.players
          .map((n) => rowsByName.get(n))
          .filter(Boolean)
          .map((r) => r.team)
          .filter(Boolean)
      );
      for (const t of chosenTeams) counts.set(t, (counts.get(t) || 0) + 1);
    }
    const total = Math.max(1, lineups.length);
    return [...counts.entries()]
      .map(([team, cnt]) => ({ team, count: cnt, pct: (cnt / total) * 100 }))
      .sort((a, b) => b.pct - a.pct || a.team.localeCompare(b.team));
  }, [lineups, rowsByName]);

  if (!data.length) return null;

  const cell = "px-2 py-1 text-center";
  const header = "px-2 py-1 font-semibold text-center";

  return (
    <table className="min-w-full text-[12px]">
      <thead>
        <tr>
          <th className={header}>Team</th>
          <th className={header}>Count</th>
          <th className={header}>Exposure %</th>
        </tr>
      </thead>
      <tbody>
        {data.map((r) => (
          <tr key={r.team}>
            <td className={cell}>{r.team}</td>
            <td className={`${cell} tabular-nums`}>{fmt0(r.count)}</td>
            <td className={`${cell} tabular-nums`}>{fmt1(r.pct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StackShapesTable({ lineups, rows, allowRB }) {
  const rowsByName = useMemo(() => new Map(rows.map((r) => [r.name, r])), [rows]);
  const data = useMemo(() => {
    const counts = { "QB+1": 0, "QB+2": 0, "QB+3": 0, Other: 0 };
    for (const L of lineups) {
      const chosen = L.players.map((n) => rowsByName.get(n)).filter(Boolean);
      const qb = chosen.find((r) => r.pos === "QB");
      if (!qb) {
        counts.Other++;
        continue;
      }
      const passPos = new Set(["WR", "TE"]);
      if (allowRB) passPos.add("RB");
      const helpers = chosen.filter((r) => r.team === qb.team && passPos.has(r.pos));
      const k = helpers.length;
      if (k >= 3) counts["QB+3"]++;
      else if (k === 2) counts["QB+2"]++;
      else if (k === 1) counts["QB+1"]++;
      else counts.Other++;
    }
    const total = Math.max(1, lineups.length);
    return Object.entries(counts).map(([shape, cnt]) => ({
      shape,
      count: cnt,
      pct: (cnt / total) * 100,
    }));
  }, [lineups, rowsByName, allowRB]);

  if (!data.length) return null;

  const cell = "px-2 py-1 text-center";
  const header = "px-2 py-1 font-semibold text-center";

  return (
    <table className="min-w-full text-[12px]">
      <thead>
        <tr>
          <th className={header}>Shape</th>
          <th className={header}>Count</th>
          <th className={header}>%</th>
        </tr>
      </thead>
      <tbody>
        {data.map((r) => (
          <tr key={r.shape}>
            <td className={cell}>{r.shape}</td>
            <td className={`${cell} tabular-nums`}>{fmt0(r.count)}</td>
            <td className={`${cell} tabular-nums`}>{fmt1(r.pct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ----------------------------- Lineup Cards ----------------------------- */
function LineupCards({ lineups, rows }) {
  const rowsByName = useMemo(() => new Map(rows.map((r) => [r.name, r])), [rows]);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
      {lineups.map((L, idx) => {
        const ordered = orderPlayersForSite(L.players, rowsByName);
        const totals = ordered.reduce(
          (a, r) => {
            a.proj += r.proj || 0;
            a.salary += r.salary || 0;
            a.pown += (r.pown || 0) * 100;
            return a;
          },
          { proj: 0, salary: 0, pown: 0 }
        );
        return (
          <div key={idx} className="rounded-lg border bg-white p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="font-semibold">Lineup #{idx + 1}</div>
              <div className="text-xs text-gray-600">pOWN {fmt1(totals.pown)}%</div>
            </div>
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-1 text-left">Slot</th>
                  <th className="px-2 py-1 text-left">Player</th>
                  <th className="px-2 py-1 text-right">Proj</th>
                  <th className="px-2 py-1 text-right">pOWN%</th>
                  <th className="px-2 py-1 text-right">Sal</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((r, i) => (
                  <tr key={i} className={i % 2 ? "bg-gray-50" : ""}>
                    <td className="px-2 py-1">{r.pos}</td>
                    <td className="px-2 py-1">
                      {r.name} <span className="text-xs text-gray-500">({r.team})</span>
                    </td>
                    <td className="px-2 py-1 text-right">{fmt1(r.proj)}</td>
                    <td className="px-2 py-1 text-right">{fmt1((r.pown || 0) * 100)}</td>
                    <td className="px-2 py-1 text-right">{fmt0(r.salary)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="px-2 py-1" colSpan={2}>
                    Totals
                  </td>
                  <td className="px-2 py-1 text-right">{fmt1(totals.proj)}</td>
                  <td className="px-2 py-1 text-right">{fmt1(totals.pown)}</td>
                  <td className="px-2 py-1 text-right">{fmt0(totals.salary)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })}
    </div>
  );
}