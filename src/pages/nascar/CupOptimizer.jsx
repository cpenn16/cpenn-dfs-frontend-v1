// src/pages/nascar/CupOptimizer.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import API_BASE from "../../utils/api";

/* ---------------- LAST UPDATED (shared) ---------------- */
function useLastUpdated(mainUrl, metaUrl) {
  const [updatedAt, setUpdatedAt] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const h = await fetch(mainUrl, { method: "HEAD", cache: "no-store" });
        const lm = h.headers.get("last-modified");
        if (alive && lm) { setUpdatedAt(new Date(lm)); return; }
      } catch (_) {}

      try {
        const r = await fetch(mainUrl, { cache: "no-store" });
        const lm2 = r.headers.get("last-modified");
        if (alive && lm2) { setUpdatedAt(new Date(lm2)); return; }
      } catch (_) {}

      try {
        if (!metaUrl) return;
        const m = await fetch(`${metaUrl}?_=${Date.now()}`, { cache: "no-store" }).then(x => x.json());
        const iso = m?.updated_iso || m?.updated_utc || m?.updated || m?.lastUpdated || m?.timestamp;
        const ep  = m?.updated_epoch;
        const d   = iso ? new Date(iso) : (Number.isFinite(ep) ? new Date(ep * 1000) : null);
        if (alive && d && !isNaN(d)) setUpdatedAt(d);
      } catch (_) {}
    })();
    return () => { alive = false; };
  }, [mainUrl, metaUrl]);

  return updatedAt;
}
const fmtUpdated = (d) =>
  d ? d.toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

/* ----------------------------- helpers ----------------------------- */
const clamp = (v, lo = 0, hi = 1e9) => Math.max(lo, Math.min(hi, v));
const num = (v) => {
  const n = Number(String(v ?? "").toString().replace(/[, %]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const fmt0 = (n) => (Number.isFinite(n) ? n.toLocaleString() : "—");
const fmt1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : "—");

/* Rehydrate when the key changes (DK ↔ FD) */
const useStickyState = (key, init) => {
  const [v, setV] = useState(init);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setV(raw ? JSON.parse(raw) : init);
    } catch {
      setV(init);
    }
  }, [key]); // ← important
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {}
  }, [key, v]);
  return [v, setV];
};

const escapeCSV = (s) => {
  const v = String(s ?? "");
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

// Normalize driver names for matching vs site_ids
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

// Build a name → { id, nameFromSite } index from site_ids json
function buildSiteIdIndex(siteIdsList) {
  const idx = new Map();
  for (const r of siteIdsList || []) {
    const id =
      String(
        r.id ?? r.ID ?? r.playerId ?? r.player_id ?? r.fd_id ?? r.FD_ID ?? r.dk_id ?? r.DK_ID ?? ""
      ).trim();

    const nm0 = r.name ?? r.player ?? r.Player ?? r.displayName ?? r.Name;
    if (!id || !nm0) continue;

    const key = normName(nm0);
    if (!idx.has(key)) idx.set(key, { id, nameFromSite: String(nm0) });
  }
  return idx;
}

// Try to discover FanDuel slate/group prefix
function detectFdPrefix(siteIdsList) {
  const counts = new Map();
  for (const r of siteIdsList || []) {
    const px =
      r.slateId ?? r.slate_id ?? r.groupId ?? r.group_id ?? r.lid ?? r.prefix ?? r.fd_prefix ?? null;
    if (px != null && px !== "") {
      const key = String(px);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  if (counts.size === 1) return [...counts.keys()][0];
  if (counts.size > 1) return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return null;
}


/* ------------------------- sites & columns ------------------------- */
const SITES = {
  dk: {
    key: "dk",
    label: "DraftKings",
    logo: "/logos/dk.png",
    roster: 6,
    cap: 50000,
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
    roster: 5,
    cap: 50000,
    salary: "FD Sal",
    proj: "FD Proj",
    floor: "FD Floor",
    ceil: "FD Ceiling",
    pown: ["FD pOWN%", "FD pOWN"],
    opt: ["FD Opt%", "FD Opt"],
  },
};

const SOURCE = "/data/nascar/cup/latest/projections.json";
const SITE_IDS_SOURCE = "/data/nascar/cup/latest/site_ids.json";

/* ---- last-updated for optimizer page (take newest of projections/site_ids) ---- */
const projMetaUrl = SOURCE.replace(/projections\.json$/, "meta.json");
const idsMetaUrl  = SITE_IDS_SOURCE.replace(/site_ids\.json$/, "meta.json");

/* ------------------------------ data ------------------------------- */
function useJson(url) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(url, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => alive && (setData(j), setErr(null)))
      .catch((e) => alive && (setErr(e), setData(null)))
      .finally(() => alive && setLoading(false));
    return () => (alive = false);
  }, [url]);
  return { data, err, loading };
}

/* ---------------------------- CSV export --------------------------- */
function toPlainCSV(rows) {
  const header = ["#", "Salary", "Total", "Drivers"].join(",");
  const lines = rows.map((L, i) => {
    const drivers = `"${L.drivers.join(" • ")}"`;
    return [i + 1, L.salary, L.total.toFixed(1), drivers].join(",");
  });
  return [header, ...lines].join("\n");
}
function downloadPlainCSV(rows, fname = "lineups.csv") {
  const blob = new Blob([toPlainCSV(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fname;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export (IDs) with headers D (DK) or Driver (FD) — DK: "Name (id)"; FD: "prefix-id:Display Name" */
function downloadSiteLineupsCSV({
  lineups,
  site,
  rosterSize,
  siteIds,
  fname = "lineups_site_ids.csv",
}) {
  const siteKey = site === "fd" ? "fd" : "dk";

  // list is site_ids.json[dk|fd] or site_ids.json.sites[dk|fd]
  const list = Array.isArray(siteIds?.[siteKey])
    ? siteIds[siteKey]
    : (siteIds?.sites?.[siteKey] ?? []);

  const idIndex = buildSiteIdIndex(list);
  const fdPrefix = siteKey === "fd" ? detectFdPrefix(list) : null;

  const header = Array.from({ length: rosterSize }, () => (siteKey === "fd" ? "Driver" : "D")).join(",");

  const lines = (lineups || []).map((L) => {
    const names = Array.isArray(L.drivers) ? L.drivers : [];
    const cells = names.slice(0, rosterSize).map((name) => {
      const rec = idIndex.get(normName(name));
      if (!rec) {
        // fallback so the row isn't broken if a match wasn't found
        return escapeCSV(name);
      }

      if (siteKey === "fd") {
        const outId = fdPrefix ? `${fdPrefix}-${rec.id}` : rec.id;
        return escapeCSV(outId); // <-- ID only for FanDuel
      }

      return escapeCSV(rec.id);   // <-- ID only for DraftKings
    });

    while (cells.length < rosterSize) cells.push("");
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

function downloadExposuresCSV(lineups, fname = "exposures.csv") {
  const m = new Map();
  for (const L of lineups) for (const d of L.drivers) m.set(d, (m.get(d) || 0) + 1);
  const total = Math.max(1, lineups.length);
  const rows = [...m.entries()]
    .map(([driver, cnt]) => [driver, cnt, (cnt / total) * 100])
    .sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0]));
  const header = "Driver,Count,Exposure %";
  const body = rows.map((r) => `${escapeCSV(r[0])},${r[1]},${r[2].toFixed(1)}`).join("\n");
  const blob = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fname;
  a.click();
  URL.revokeObjectURL(url);
}

/* -------------------- CUP endpoints: auto-resolver ------------------ */
const CUP_SSE_PATHS = [
  "nascar/cup/solve_stream",
  "cup/solve_stream",
];

const CUP_POST_PATHS = [
  "nascar/cup/solve",
  "cup/solve",
];

async function fetchFirstOk(paths, init) {
  for (const p of paths) {
    try {
      const base = API_BASE.replace(/\/$/, "");
      const res = await fetch(`${base}/${p}`, init);
      if (res.ok) return { res, path: p };
    } catch (_) {}
  }
  return null;
}

/* ----------------------------- server calls ----------------------------- */
async function solveStream(payload, onItem, onDone) {
  let res;
  try {
    res = await fetch(`${API_BASE}/cup/solve_stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, series: "cup" }),
    });
  } catch (_) {
    res = null;
  }

  if (!res || !res.ok || !res.body) {
    const attempt = await fetchFirstOk([...CUP_POST_PATHS, "solve"], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, series: "cup" }),
    });
    if (!attempt) throw new Error("Solve failed: No working Cup endpoint found.");

    const j = await attempt.res.json();
    (j.lineups || []).forEach((L) => onItem && onItem(L));
    onDone && onDone({ produced: (j.lineups || []).length, reason: "fallback-complete" });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  let sawAny = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop();

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      try {
        const msg = JSON.parse(trimmed);
        sawAny = true;

        if (msg.done) {
          onDone && onDone(msg);
          return;
        } else {
          onItem && onItem(msg);
        }
      } catch {}
    }
  }

  if (!sawAny) {
    const attempt = await fetchFirstOk([...CUP_POST_PATHS, "solve"], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, series: "cup" }),
    });
    if (!attempt) throw new Error("Solve failed: No working Cup endpoint found.");

    const j = await attempt.res.json();
    (j.lineups || []).forEach((L) => onItem && onItem(L));
    onDone && onDone({ produced: (j.lineups || []).length, reason: "fallback-complete" });
  } else {
    onDone && onDone({ produced: undefined, reason: "stream-ended-no-done" });
  }
}

/* --------- robust per-site build naming to avoid stale length ------- */
function nextBuildNameForSite(site) {
  try {
    const raw = localStorage.getItem(`cupOpt.${site}.builds`);
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

/* ---------------------- UI: Driver multi-picker --------------------- */
function DriverMultiPicker({ allDrivers, value, onChange, placeholder = "Add drivers…" }) {
  const [q, setQ] = React.useState("");
  const selected = React.useMemo(() => new Set(value), [value]);

  const suggestions = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return allDrivers
      .filter((n) => !selected.has(n) && n.toLowerCase().includes(needle))
      .slice(0, 12);
  }, [q, allDrivers, selected]);

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

/* ============================== page =============================== */
export default function CupOptimizer() {
  const { data, err, loading } = useJson(SOURCE);
  const { data: siteIds } = useJson(SITE_IDS_SOURCE);

  const projUpdated = useLastUpdated(SOURCE, projMetaUrl);
  const idsUpdated  = useLastUpdated(SITE_IDS_SOURCE, idsMetaUrl);
  const updatedAt = useMemo(() => {
    if (projUpdated && idsUpdated) return new Date(Math.max(+projUpdated, +idsUpdated));
    return projUpdated || idsUpdated || null;
  }, [projUpdated, idsUpdated]);

  const [site, setSite] = useStickyState("cupOpt.site", "dk");
  const cfg = SITES[site];

  const [optBy, setOptBy] = useStickyState("cupOpt.optBy", "proj");
  const [numLineups, setNumLineups] = useStickyState("cupOpt.N", 20);
  const [maxSalary, setMaxSalary] = useStickyState("cupOpt.cap", 50000);
  const [globalMax, setGlobalMax] = useStickyState("cupOpt.gmax", 100);
  const [randomness, setRandomness] = useStickyState("cupOpt.rand", 0);

  const [q, setQ] = useState("");

  /* ---- PERSISTED constraints (per-site) ---- */
  const buildsKey = (k) => `cupOpt.${site}.${k}`;

  // Locks/Excludes in localStorage; wrap as Sets for UI
  const [locksArr, setLocksArr] = useStickyState(buildsKey("locks"), []);
  const [exclsArr, setExclsArr] = useStickyState(buildsKey("excls"), []);
  const locks = useMemo(() => new Set(Array.isArray(locksArr) ? locksArr : []), [locksArr]);
  const excls = useMemo(() => new Set(Array.isArray(exclsArr) ? exclsArr : []), [exclsArr]);

  const [minPct, setMinPct] = useStickyState(buildsKey("minPct"), {});
  const [maxPct, setMaxPct] = useStickyState(buildsKey("maxPct"), {});
  const [boost, setBoost]   = useStickyState(buildsKey("boost"), {});
  const [groups, setGroups] = useStickyState(buildsKey("groups"), []);

  // Per-site builds (chips restored)
  const [builds, setBuilds] = useStickyState(buildsKey("builds"), []);
  const [activeBuildId, setActiveBuildId] = useStickyState(buildsKey("active"), null);

  const [lineups, setLineups] = useState([]);
  const [stopInfo, setStopInfo] = useState(null);

  const usagePct = useMemo(() => {
    if (!lineups.length) return {};
    const m = new Map();
    for (const L of lineups) for (const d of L.drivers) m.set(d, (m.get(d) || 0) + 1);
    const total = Math.max(1, lineups.length);
    const out = {};
    for (const [driver, cnt] of m.entries()) out[driver] = (cnt / total) * 100;
    return out;
  }, [lineups]);

  const [progressActual, setProgressActual] = useState(0);
  const [progressUI, setProgressUI] = useState(0);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const tickRef = useRef(null);

  useEffect(() => {
    if (!isOptimizing) return;
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setProgressUI((p) => {
        const N = Math.max(1, Number(numLineups) || 1);
        const target = progressActual;
        const ceiling = N;
        const next = Math.min(Math.max(p + 1, target), ceiling);
        return next;
      });
    }, 250);
    return () => clearInterval(tickRef.current);
  }, [isOptimizing, progressActual, numLineups]);

  // reset visuals on site change (keep constraints persisted)
  useEffect(() => {
    setLineups([]);
    setStopInfo(null);
    setProgressActual(0);
    setProgressUI(0);
    setIsOptimizing(false);
  }, [site]);

  /* ------------------------------ rows ------------------------------ */
  const rows = useMemo(() => {
    if (!data) return [];
    const arr = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : [];
    const getPct = (obj, list) => {
      const k = Array.isArray(list) ? list.find((x) => x in obj) : list;
      return num(obj?.[k]) / 100;
    };
    return arr
      .map((r) => ({
        driver: r.Driver ?? r["Driver_1"] ?? r["DRIVER"] ?? "",
        qual: num(r.Qual ?? r["Qual"] ?? r["QUAL"]),
        salary: num(r[cfg.salary]),
        proj: num(r[cfg.proj]),
        floor: num(r[cfg.floor]),
        ceil: num(r[cfg.ceil]),
        pown: getPct(r, cfg.pown),
        opt: getPct(r, cfg.opt),
        val: 0,
      }))
      .filter((r) => r.driver && r.salary > 0);
  }, [data, site]);

  /* ----------------------- filter + stable order --------------------- */
  const [order, setOrder] = useState([]);
  const sortRef = useRef({ col: "proj", dir: "desc" });

  useEffect(() => {
    const initial = [...rows].sort((a, b) => b.proj - a.proj || a.driver.localeCompare(b.driver));
    setOrder(initial.map((r) => r.driver));
  }, [site, rows.length]); // eslint-disable-line

  const boostedProj = (r) => r.proj * (1 + 0.03 * (boost[r.driver] || 0));

  const displayRows = useMemo(() => {
    const byName = new Map(rows.map((r) => [r.driver, r]));
    const ordered = order.map((n) => byName.get(n)).filter(Boolean);
    const others = rows.filter((r) => !order.includes(r.driver));
    const base = [...ordered, ...others];

    const needle = q.trim().toLowerCase();
    if (!needle) return base;

    return base.filter((r) =>
      r.driver.toLowerCase().includes(needle) ||
      String(r.qual).includes(needle) ||
      String(r.salary).includes(needle) ||
      `${usagePct[r.driver] ?? ""}`.includes(needle)
    );
  }, [rows, order, q, usagePct, boost]);

  const sortable = new Set(["qual", "salary", "proj", "val", "floor", "ceil", "pown", "opt", "usage"]);

  const setSort = (col) => {
    if (!sortable.has(col)) return;

    const dir =
      sortRef.current.col === col ? (sortRef.current.dir === "asc" ? "desc" : "asc") : "desc";
    sortRef.current = { col, dir };
    const mult = dir === "asc" ? 1 : -1;

    const sorted = [...displayRows].sort((a, b) => {
      const getVal = (r) => {
        if (col === "usage") return usagePct[r.driver] ?? -Infinity;
        if (col === "pown" || col === "opt") return ((r[col] || 0) * 100);
        if (col === "proj") return boostedProj(r);
        if (col === "val") {
          const salK = (r.salary || 0) / 1000;
          return salK > 0 ? boostedProj(r) / salK : -Infinity;
        }
        return r[col] ?? 0;
      };
      const va = getVal(a);
      const vb = getVal(b);

      if (va < vb) return -1 * mult;
      if (va > vb) return 1 * mult;
      return a.driver.localeCompare(b.driver) * mult;
    });

    setOrder(sorted.map((r) => r.driver));
  };

  const sortArrow = (key) =>
    sortRef.current.col === key ? (sortRef.current.dir === "asc" ? " ▲" : " ▼") : "";

  /* ----------------------------- actions ---------------------------- */
  const bumpBoost = (d, step) =>
    setBoost((m) => ({ ...m, [d]: clamp((m[d] || 0) + step, -6, 6) }));

  const toggleLock = (d) =>
    setLocksArr((arr) => {
      const has = (arr || []).includes(d);
      return has ? (arr || []).filter((x) => x !== d) : [...(arr || []), d];
    });

  const toggleExcl = (d) =>
    setExclsArr((arr) => {
      const has = (arr || []).includes(d);
      return has ? (arr || []).filter((x) => x !== d) : [...(arr || []), d];
    });

  const resetExposuresOnly = () => {
    setMinPct({});
    setMaxPct({});
  };

  const resetConstraints = () => {
    setLocksArr([]);
    setExclsArr([]);
    setMinPct({});
    setMaxPct({});
    setBoost({});
    setGroups([]);
  };

  /* --------------------------- optimize (SSE) ------------------------ */
  async function optimize() {
    if (!rows.length) return;

    setLineups([]);
    setStopInfo(null);
    setProgressActual(0);
    setProgressUI(0);
    setIsOptimizing(true);

    const N = Math.max(1, Number(numLineups) || 1);
    const payload = {
      players: rows.map((r) => ({
        driver: r.driver,
        salary: Math.round(r.salary || 0),
        proj: r.proj || 0,
        floor: r.floor || 0,
        ceil: r.ceil || 0,
        pown: r.pown || 0,
        opt: r.opt || 0,
      })),
      roster: cfg.roster,
      cap: Math.min(cfg.cap, Number(maxSalary) || cfg.cap),
      n: N,
      objective: optBy,
      locks: Array.isArray(locksArr) ? locksArr : [],
      excludes: Array.isArray(exclsArr) ? exclsArr : [],
      boosts: boost,
      randomness: clamp(Number(randomness) || 0, 0, 100),
      global_max_pct: clamp(Number(globalMax) || 100, 0, 100),
      min_pct: Object.fromEntries(
        Object.entries(minPct).map(([k, v]) => [k, clamp(Number(v) || 0, 0, 100)])
      ),
      max_pct: Object.fromEntries(
        Object.entries(maxPct).map(([k, v]) => [k, clamp(Number(v) || 100, 0, 100)])
      ),
      min_diff: 1,
      time_limit_ms: 1500,
      groups: (groups || []).map((g) => ({
        mode: g.mode || "at_most",
        count: Math.max(0, Number(g.count) || 0),
        players: Array.isArray(g.players) ? g.players : [],
      })),
    };

    const out = [];
    try {
      await solveStream(
        payload,
        (evt) => {
          const chosen = evt.drivers
            .map((name) => rows.find((r) => r.driver === name))
            .filter(Boolean);
          const L = { drivers: evt.drivers, salary: evt.salary, total: evt.total, chosen };
          out.push(L);
          setLineups((prev) => [...prev, L]);
          setProgressActual(out.length);
        },
        (done) => {
          if (done?.reason) setStopInfo(done);
          setProgressActual(out.length || payload.n);
          setProgressUI(out.length || payload.n);
          setIsOptimizing(false);
          clearInterval(tickRef.current);
          saveBuild(nextBuildNameForSite(site), out);
        }
      );
    } catch (e) {
      const attempt = await fetchFirstOk([...CUP_POST_PATHS, "solve"], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, series: "cup" }),
      });

      if (!attempt) {
        alert("Solve failed: No working Cup endpoint found.");
        setIsOptimizing(false);
        clearInterval(tickRef.current);
        return;
      }

      const j = await attempt.res.json();
      const out2 =
        (j.lineups || []).map((L) => ({
          drivers: L.drivers,
          salary: L.salary,
          total: L.total,
          chosen: L.drivers.map((n) => rows.find((r) => r.driver === n)).filter(Boolean),
        })) || [];

      setLineups(out2);
      setProgressActual(out2.length);
      setProgressUI(out2.length);
      setIsOptimizing(false);
      clearInterval(tickRef.current);

      if ((j.produced || 0) < payload.n) setStopInfo({ produced: j.produced || 0, requested: payload.n, reason: "stopped_early" });
      saveBuild(nextBuildNameForSite(site), out2);
    }
  }

  /* -------------------------- builds (per site) ---------------------- */
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
        locks: Array.isArray(locksArr) ? locksArr : [],
        excls: Array.isArray(exclsArr) ? exclsArr : [],
        minPct,
        maxPct,
        boost,
        groups,
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

  /* ------------------------------- UI -------------------------------- */
  const metricLabel =
    optBy === "proj" ? "Proj" :
    optBy === "floor" ? "Floor" :
    optBy === "ceil" ? "Ceiling" :
    optBy === "pown" ? "pOWN%" : "Opt%";

  const cell = "px-2 py-1 text-center";
  const header = "px-2 py-1 font-semibold text-center";
  const textSz = "text-[12px]";

  const TABLE_COLS = [
    { key: "lock", label: "Lock" },
    { key: "excl", label: "Excl" },
    { key: "qual", label: "Qual", sortable: true },
    { key: "boosts", label: "Boosts" },
    { key: "driver", label: "Driver", sortable: false },
    { key: "salary", label: "Salary", sortable: true },
    { key: "proj", label: "Proj", sortable: true },
    { key: "val",  label: "Val",  sortable: true },
    { key: "floor", label: "Floor", sortable: true },
    { key: "ceil", label: "Ceiling", sortable: true },
    { key: "pown", label: "pOWN%", sortable: true },
    { key: "opt", label: "Opt%", sortable: true },
    { key: "min", label: "Min%" },
    { key: "max", label: "Max%" },
    { key: "usage", label: "Usage%", sortable: true },
  ];

  const allDriverNames = useMemo(() => rows.map((r) => r.driver), [rows]);

  return (
    <div className="px-4 md:px-6 py-5">
      <div className="mb-1 flex items-end gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-extrabold">NASCAR Cup — Optimizer</h1>
        {updatedAt && <div className="text-sm text-gray-500">Updated: {fmtUpdated(updatedAt)}</div>}
      </div>

      {/* site toggle & reset */}
      <div className="mb-3 flex gap-2 items-center">
        {["dk", "fd"].map((s) => (
          <button
            key={s}
            onClick={() => setSite(s)}
            className={`px-3 py-1.5 rounded-full border text-sm inline-flex items-center gap-2 ${
              site === s ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-white border-gray-300 text-gray-700"
            }`}
          >
            <img src={SITES[s].logo} alt="" className="w-4 h-4" />
            <span>{SITES[s].label}</span>
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button className="px-2.5 py-1.5 text-sm rounded-lg bg-white border hover:bg-gray-50" onClick={resetExposuresOnly}>
            Reset exposures
          </button>
          <button className="px-2.5 py-1.5 text-sm rounded-lg bg-white border hover:bg-gray-50" onClick={resetConstraints}>
            Reset constraints
          </button>
        </div>
      </div>

      {/* controls bar */}
      <div className="grid grid-cols-1 md:grid-cols-8 gap-2 items-end mb-2">
        <div className="md:col-span-2">
          <label className="block text-[11px] text-gray-600 mb-1">Optimize by</label>
          <select className="w-full border rounded-md px-2 py-1.5 text-sm" value={optBy} onChange={(e) => setOptBy(e.target.value)}>
            <option value="proj">Projection</option>
            <option value="floor">Floor</option>
            <option value="ceil">Ceiling</option>
            <option value="pown">pOWN%</option>
            <option value="opt">Opt%</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-gray-600 mb-1">Lineups</label>
          <input className="w-full border rounded-md px-2 py-1.5 text-sm" value={numLineups} onChange={(e) => setNumLineups(e.target.value)} />
        </div>
        <div>
          <label className="block text-[11px] text-gray-600 mb-1">Max salary</label>
          <input className="w-full border rounded-md px-2 py-1.5 text-sm" value={maxSalary} onChange={(e) => setMaxSalary(e.target.value)} />
        </div>
        <div>
          <label className="block text-[11px] text-gray-600 mb-1">Global Max %</label>
          <input className="w-full border rounded-md px-2 py-1.5 text-sm" value={globalMax} onChange={(e) => setGlobalMax(e.target.value)} />
        </div>
        <div>
          <label className="block text-[11px] text-gray-600 mb-1">Randomness %</label>
          <input className="w-full border rounded-md px-2 py-1.5 text-sm" value={randomness} onChange={(e) => setRandomness(e.target.value)} />
        </div>

        {/* progress + button */}
        <div className="md:col-span-2 flex items-end gap-3">
          <button className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700" onClick={optimize}>
            {`Optimize ${numLineups}`}
          </button>
          <div className="flex-1 max-w-xs h-2 bg-gray-200 rounded overflow-hidden">
            <div
              className="h-2 bg-blue-500 rounded transition-all duration-300"
              style={{
                width: `${(Math.min(progressUI, Math.max(1, Number(numLineups) || 1)) / Math.max(1, Number(numLineups) || 1)) * 100}%`,
              }}
            />
          </div>
          <div className="text-sm text-gray-600 min-w-[60px] text-right">{progressUI}/{numLineups}</div>
        </div>
      </div>

      {/* Builds (chips restored) */}
      {builds.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-xs text-gray-600">Builds</div>
          <div className="flex flex-wrap gap-2 items-center">
            {builds.map((b) => (
              <div
                key={b.id}
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border text-sm ${
                  activeBuildId === b.id ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-white border-gray-300"
                }`}
              >
                <button
                  onClick={() => loadBuild(b.id)}
                  onDoubleClick={() => {
                    const nm = prompt("Rename build:", b.name);
                    if (nm && nm.trim()) renameBuild(b.id, nm.trim());
                  }}
                  title={new Date(b.ts).toLocaleString()}
                >
                  {b.name}
                </button>
                <button className="ml-1 text-gray-400 hover:text-red-600" title="Delete build" onClick={() => deleteBuild(b.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Player Groups */}
      <section className="rounded-lg border bg-white p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold">Player Groups</h3>
          <button
            className="px-3 py-1.5 rounded-md border text-sm hover:bg-gray-50"
            onClick={() => setGroups((G) => [...G, { mode: "at_most", count: 1, players: [] }])}
          >
            + Add group
          </button>
        </div>

        {groups.length === 0 ? (
          <div className="text-sm text-gray-500">No groups yet. Click “Add group”.</div>
        ) : (
          <div className="space-y-3">
            {groups.map((g, idx) => (
              <div key={idx} className="rounded-md border px-3 py-2">
                <div className="flex items-center gap-2 mb-2">
                  <select
                    value={g.mode || "at_most"}
                    onChange={(e) => setGroups((Gs) => Gs.map((gg, i) => (i === idx ? { ...gg, mode: e.target.value } : gg)))}
                    className="border rounded-md px-2 py-1 text-sm"
                    title="Group rule"
                  >
                    <option value="at_most">At Most</option>
                    <option value="at_least">At Least</option>
                    <option value="exactly">Exactly</option>
                  </select>

                  <input
                    type="number"
                    min={0}
                    className="w-16 border rounded-md px-2 py-1 text-sm"
                    value={g.count ?? 1}
                    onChange={(e) => setGroups((Gs) => Gs.map((gg, i) => (i === idx ? { ...gg, count: Math.max(0, Number(e.target.value) || 0) } : gg)))}
                    title="Number of players from the group"
                  />

                  <button
                    className="ml-auto px-2.5 py-1 rounded-md border text-sm hover:bg-gray-50"
                    onClick={() => setGroups((Gs) => Gs.filter((_, i) => i !== idx))}
                  >
                    Remove
                  </button>
                </div>

                <DriverMultiPicker
                  allDrivers={allDriverNames}
                  value={Array.isArray(g.players) ? g.players : []}
                  onChange={(players) => setGroups((Gs) => Gs.map((gg, i) => (i === idx ? { ...gg, players } : gg)))}
                  placeholder="Type to search drivers and click to add…"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mb-2">
        <input
          className="border rounded-md px-3 py-1.5 w-80 text-sm"
          placeholder="Search driver…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* Player pool (scrollable, sticky header) */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden mb-6">
        <div className="max-h-[520px] overflow-auto">
          <table className={`w-full border-separate ${textSz}`} style={{ borderSpacing: 0 }}>
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {TABLE_COLS.map(({ key, label, sortable }) => (
                  <th
                    key={key}
                    className={`${header} whitespace-nowrap ${sortable ? "cursor-pointer" : "cursor-default"} select-none`}
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
                  <td className={`${cell} text-gray-500`} colSpan={TABLE_COLS.length}>Loading…</td>
                </tr>
              )}
              {err && (
                <tr>
                  <td className={`${cell} text-red-600`} colSpan={TABLE_COLS.length}>Failed to load: {String(err)}</td>
                </tr>
              )}
              {!loading && !err && displayRows.map((r) => {
                const projBoosted = boostedProj(r);
                const val = (r.salary > 0) ? projBoosted / (r.salary / 1000) : NaN;

                return (
                  <tr key={r.driver} className="odd:bg-white even:bg-gray-50 hover:bg-blue-50/60 transition-colors">
                    <td className={cell}>
                      <input type="checkbox" checked={locks.has(r.driver)} onChange={() => toggleLock(r.driver)} />
                    </td>
                    <td className={cell}>
                      <input type="checkbox" checked={excls.has(r.driver)} onChange={() => toggleExcl(r.driver)} />
                    </td>
                    <td className={`${cell} tabular-nums`}>{r.qual || "—"}</td>
                    <td className={cell}>
                      <div className="inline-flex items-center gap-1">
                        <button className="px-1.5 py-0.5 border rounded" title="+3%" onClick={() => bumpBoost(r.driver, +1)}>▲</button>
                        <span className="w-5 text-center">{boost[r.driver] || 0}</span>
                        <button className="px-1.5 py-0.5 border rounded" title="-3%" onClick={() => bumpBoost(r.driver, -1)}>▼</button>
                      </div>
                    </td>
                    <td className={`${cell} whitespace-nowrap`}>{r.driver}</td>
                    <td className={`${cell} tabular-nums`}>{fmt0(r.salary)}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1(projBoosted)}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1(val)}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1(r.floor)}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1(r.ceil)}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1(r.pown * 100)}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1(r.opt * 100)}</td>
                    <td className={cell}>
                      <div className="inline-flex items-center gap-1">
                        <button className="px-1.5 py-0.5 border rounded" onClick={() => setMinPct((m) => ({ ...m, [r.driver]: clamp((num(m[r.driver]) || 0) - 5, 0, 100) }))} title="-5%">–</button>
                        <input className="w-12 border rounded px-1.5 py-0.5 text-center" value={String(minPct[r.driver] ?? "")} onChange={(e) => setMinPct((m) => ({ ...m, [r.driver]: e.target.value }))} placeholder="—" />
                        <button className="px-1.5 py-0.5 border rounded" onClick={() => setMinPct((m) => ({ ...m, [r.driver]: clamp((num(m[r.driver]) || 0) + 5, 0, 100) }))} title="+5%">+</button>
                      </div>
                    </td>
                    <td className={cell}>
                      <div className="inline-flex items-center gap-1">
                        <button className="px-1.5 py-0.5 border rounded" onClick={() => setMaxPct((m) => ({ ...m, [r.driver]: clamp((num(m[r.driver]) || 100) - 5, 0, 100) }))} title="-5%">–</button>
                        <input className="w-12 border rounded px-1.5 py-0.5 text-center" value={String(maxPct[r.driver] ?? "")} onChange={(e) => setMaxPct((m) => ({ ...m, [r.driver]: e.target.value }))} placeholder="—" />
                        <button className="px-1.5 py-0.5 border rounded" onClick={() => setMaxPct((m) => ({ ...m, [r.driver]: clamp((num(m[r.driver]) || 100) + 5, 0, 100) }))} title="+5%">+</button>
                      </div>
                    </td>
                    <td className={cell}>{usagePct[r.driver] != null ? fmt1(usagePct[r.driver]) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* stop-info */}
      {stopInfo && (
        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          Stopped early at {stopInfo.produced}/{numLineups}{stopInfo.reason ? ` — ${stopInfo.reason}` : ""}
        </div>
      )}

      {/* results */}
      {!!lineups.length && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Lineups (full-width inside section) */}
          <section className="lg:col-span-8 rounded-lg border bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold">Lineups ({lineups.length})</h2>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1.5 border rounded text-sm"
                  onClick={() =>
                    downloadSiteLineupsCSV({
                      lineups,
                      site,
                      rosterSize: cfg.roster,
                      siteIds: siteIds || {},
                      fname: `lineups_${site.toUpperCase()}_ids.csv`,
                    })
                  }
                >
                  Export CSV (IDs)
                </button>
              </div>
            </div>

            {/* Full width, sticky header, internal scroll */}
            <div className="overflow-auto max-h-[360px]">
              <table className="w-full text-[13px] border-separate" style={{ borderSpacing: 0 }}>
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className={header}>#</th>
                    <th className={header}>Salary</th>
                    <th className={header}>Total {optBy === "pown" || optBy === "opt" ? "Projection" : metricLabel}</th>
                    <th className={header}>Total pOWN%</th>
                    <th className={header}>Drivers (sorted by salary)</th>
                  </tr>
                </thead>
                <tbody>
                  {lineups.map((L, i) => {
                    const chosenSorted = Array.isArray(L.chosen)
                      ? [...L.chosen].sort((a, b) => (b?.salary || 0) - (a?.salary || 0))
                      : [];
                    const driversSorted = chosenSorted.length
                      ? chosenSorted.map((r) => r.driver)
                      : (Array.isArray(L.drivers) ? [...L.drivers] : []);
                    const totalPownPct = chosenSorted.length
                      ? chosenSorted.reduce((acc, r) => acc + (r.pown || 0) * 100, 0)
                      : 0;

                    return (
                      <tr key={i} className="odd:bg-white even:bg-gray-50">
                        <td className="px-2 py-1 text-center">{i + 1}</td>
                        <td className="px-2 py-1 text-center tabular-nums">{fmt0(L.salary)}</td>
                        <td className="px-2 py-1 text-center tabular-nums">{fmt1(L.total)}</td>
                        <td className="px-2 py-1 text-center tabular-nums">{fmt1(totalPownPct)}</td>
                        <td className="px-2 py-1 leading-snug">
                          <span className="break-words">{driversSorted.join(" • ")}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Exposure */}
          <section className="lg:col-span-4 rounded-lg border bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold">Exposure</h3>
              <button className="px-3 py-1.5 border rounded text-sm" onClick={() => downloadExposuresCSV(lineups)}>
                Export Exposures
              </button>
            </div>
            <ExposureTable lineups={lineups} maxHeightClass="max-h-[440px]" />
          </section>

          {/* Cards — 5 per row on xl */}
          <section className="lg:col-span-12">
            <h3 className="text-base font-semibold mb-2">Cards</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {lineups.map((L, idx) => {
                const chosenSorted = [...(L.chosen || [])].sort((a, b) => b.salary - a.salary);
                const totalPownPct = chosenSorted.reduce((acc, r) => acc + (r.pown || 0) * 100, 0);

                return (
                  <div key={idx} className="rounded-lg border p-3 bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">Lineup #{idx + 1}</div>
                      <img src={cfg.logo} alt="" className="w-4 h-4 opacity-70" title={cfg.label} />
                    </div>
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="text-gray-600">
                          <th className={header}>Driver</th>
                          <th className={header}>Qual</th>
                          <th className={header}>pOWN%</th>
                          <th className={header}>Proj</th>
                          <th className={header}>Salary</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chosenSorted.map((r) => (
                          <tr key={r.driver}>
                            <td className={cell}>{r.driver}</td>
                            <td className={`${cell} tabular-nums`}>{r.qual || "—"}</td>
                            <td className={`${cell} tabular-nums`}>{fmt1((r.pown || 0) * 100)}</td>
                            <td className={`${cell} tabular-nums`}>
                              {fmt1(r.proj * (1 + 0.03 * (boost[r.driver] || 0)))}
                            </td>
                            <td className={`${cell} tabular-nums`}>{fmt0(r.salary)}</td>
                          </tr>
                        ))}
                        <tr className="border-t">
                          <td className={`${cell} font-semibold`}>Totals</td>
                          <td className={cell} />
                          <td className={`${cell} tabular-nums font-semibold`}>{fmt1(totalPownPct)}</td>
                          <td className={`${cell} tabular-nums font-semibold`}>{fmt1(L.total)}</td>
                          <td className={`${cell} tabular-nums font-semibold`}>{fmt0(L.salary)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/* --------------------------- Exposure table --------------------------- */
function ExposureTable({ lineups, maxHeightClass = "" }) {
  const rows = useMemo(() => {
    const m = new Map();
    for (const L of lineups) for (const d of L.drivers) m.set(d, (m.get(d) || 0) + 1);
    const total = Math.max(1, lineups.length);
    return [...m.entries()]
      .map(([driver, cnt]) => ({ driver, count: cnt, pct: (cnt / total) * 100 }))
      .sort((a, b) => b.pct - a.pct || a.driver.localeCompare(b.driver));
  }, [lineups]);

  if (!rows.length) return null;

  const cell = "px-2 py-1 text-center";
  const header = "px-2 py-1 font-semibold text-center";

  return (
    <div className={`overflow-auto ${maxHeightClass}`}>
      <table className="min-w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th className={header}>Driver</th>
            <th className={header}>Count</th>
            <th className={header}>Exposure %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.driver} className="odd:bg-white even:bg-gray-50">
              <td className={cell}>{r.driver}</td>
              <td className={`${cell} tabular-nums`}>{fmt0(r.count)}</td>
              <td className={`${cell} tabular-nums`}>{fmt1(r.pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
