// src/pages/nascar/XfOptimizer.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

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
    .replace(/\u2019/g, "'")      // smart apostrophe → '
    .replace(/\./g, "")           // remove dots
    .replace(/,\s*(jr|sr)\b/g, "")// remove ", Jr"/", Sr"
    .replace(/\b(jr|sr)\b/g, "")  // remove trailing Jr/Sr
    .replace(/[^a-z' -]/g, "")    // letters/'/-/space only
    .replace(/\s+/g, " ")         // squeeze spaces
    .trim();

// Build a name→record index from site_ids
function buildSiteIdIndex(siteIdsList) {
  const idx = new Map();
  for (const r of siteIdsList || []) {
    const id  = String(r.id ?? r.ID ?? r.playerId ?? "").trim();
    const nm0 = r.name ?? r.player ?? r.Player ?? r.displayName ?? r.Name;
    if (!id || !nm0) continue;
    const key = normName(nm0);
    if (!idx.has(key)) {
      idx.set(key, { id, nameFromSite: String(nm0) });
    }
  }
  return idx;
}

// Discover FanDuel "prefix" (slate/group id) if present
function detectFdPrefix(siteIdsList) {
  const counts = new Map();
  for (const r of siteIdsList || []) {
    const px =
      r.slateId ?? r.slate_id ??
      r.groupId ?? r.group_id ??
      r.lid ?? r.prefix ?? null;
    if (px != null && px !== "") {
      const key = String(px);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  if (counts.size === 1) return [...counts.keys()][0];
  if (counts.size > 1) return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0][0];
  return null; // no prefix found (ok)
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

const SOURCE = "/data/nascar/xfinity/latest/projections.json";
const SITE_IDS_SOURCE = "/data/nascar/xfinity/latest/site_ids.json";

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

/** Export (DK: "Name (id)"; FD: "prefix-id:Display Name") using site_ids.json */
function downloadSiteLineupsCSV({
  lineups,
  site,
  rosterSize,
  siteIds,
  fname = "lineups_site_ids.csv",
}) {
  const siteKey = site === "fd" ? "fd" : "dk";
  const list =
    Array.isArray(siteIds?.[siteKey])
      ? siteIds[siteKey]
      : (siteIds?.sites?.[siteKey] ?? []); // support { sites: { dk:[], fd:[] } } too

  // Build index + detect FD prefix
  const idIndex = buildSiteIdIndex(list);
  const fdPrefix = siteKey === "fd" ? detectFdPrefix(list) : null;

  const header = [
    "#",
    "Salary",
    "Total",
    ...Array.from({ length: rosterSize }, (_, i) => `D${i + 1}`),
  ].join(",");

  const lines = (lineups || []).map((L, idx) => {
    const names = Array.isArray(L.drivers) ? L.drivers : [];
    const cells = names.slice(0, rosterSize).map((name) => {
      const rec = idIndex.get(normName(name));
      if (!rec) {
        // not found -> export raw name so DK templates still accept it
        return escapeCSV(name);
      }
      if (siteKey === "fd") {
        // FD wants prefix-id:DisplayName
        const outId = fdPrefix ? `${fdPrefix}-${rec.id}` : rec.id;
        const display = rec.nameFromSite || name;
        return escapeCSV(`${outId}:${display}`);
      }
      // DK format
      return escapeCSV(`${name} (${rec.id})`);
    });

    while (cells.length < rosterSize) cells.push("");

    return [
      idx + 1,
      L.salary ?? "",
      Number.isFinite(L.total) ? L.total.toFixed(1) : "",
      ...cells,
    ].join(",");
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

import API_BASE from "../../utils/api";


/* ----------------------------- server calls ----------------------------- */
async function solveStream(payload, onItem, onDone) {
  const res = await fetch(`${API_BASE}/xfinity/solve_stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok || !res.body) throw new Error("Stream failed to start");

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop();
    for (const part of parts) {
      if (!part.trim()) continue;
      try {
        const msg = JSON.parse(part);
        if (msg.done) {
          if (onDone) onDone(msg);
        } else if (onItem) {
          onItem(msg);
        }
      } catch (err) {
        console.error("Stream parse error", err, part);
      }
    }
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
      {/* chips + input */}
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

      {/* suggestion popover */}
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

  const [site, setSite] = useStickyState("cupOpt.site", "dk");
  const cfg = SITES[site];

  const [optBy, setOptBy] = useStickyState("cupOpt.optBy", "proj");
  const [numLineups, setNumLineups] = useStickyState("cupOpt.N", 20);
  const [maxSalary, setMaxSalary] = useStickyState("cupOpt.cap", 50000);
  const [globalMax, setGlobalMax] = useStickyState("cupOpt.gmax", 100);
  const [randomness, setRandomness] = useStickyState("cupOpt.rand", 0);

  const [q, setQ] = useState("");

  const [locks, setLocks] = useState(() => new Set());
  const [excls, setExcls] = useState(() => new Set());
  const [minPct, setMinPct] = useState(() => ({}));
  const [maxPct, setMaxPct] = useState(() => ({}));
  const [boost, setBoost] = useState(() => ({}));

  // NEW: player groups (persisted per site)
  const [groups, setGroups] = useStickyState(`cupOpt.${site}.groups`, []);

  // Per-site builds (so DK builds don't appear on FD)
  const buildsKey = (k) => `cupOpt.${site}.${k}`;
  const [builds, setBuilds] = useStickyState(buildsKey("builds"), []);
  const [activeBuildId, setActiveBuildId] = useStickyState(buildsKey("active"), null);

  const [lineups, setLineups] = useState([]);
  const [stopInfo, setStopInfo] = useState(null);

  // compute actual exposure from the latest generated lineups
  const usagePct = useMemo(() => {
    if (!lineups.length) return {};
    const m = new Map();
    for (const L of lineups) for (const d of L.drivers) m.set(d, (m.get(d) || 0) + 1);
    const total = Math.max(1, lineups.length); // ← the "1" goes here
    const out = {};
    for (const [driver, cnt] of m.entries()) out[driver] = (cnt / total) * 100;
    return out;
  }, [lineups]);

  /* Live-progress display (UI ticks even if stream flushes late) */
  const [progressActual, setProgressActual] = useState(0); // truth from SSE
  const [progressUI, setProgressUI] = useState(0); // what we show
  const [isOptimizing, setIsOptimizing] = useState(false);
  const tickRef = useRef(null);

  useEffect(() => {
    // smooth UI ticks while optimizing
    if (!isOptimizing) return;
    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setProgressUI((p) => {
        const N = Math.max(1, Number(numLineups) || 1);
        const target = Math.max(progressActual, 1); // never look stuck at 0
        const ceiling = N;
        const next = Math.min(Math.max(p + 1, target), ceiling);
        return next;
      });
    }, 250);
    return () => clearInterval(tickRef.current);
  }, [isOptimizing, progressActual, numLineups]);

  // reset visuals on site change
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
        // val is computed dynamically using boosted proj; placeholder here is optional
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

  // boosted projection for display/sorting (respects +/-3% Boosts)
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

  // Make columns sortable (now includes Usage% and Val)
  const sortable = new Set(["qual", "salary", "proj", "val", "floor", "ceil", "pown", "opt", "usage"]);

  const setSort = (col) => {
    if (!sortable.has(col)) return;

    const dir =
      sortRef.current.col === col ? (sortRef.current.dir === "asc" ? "desc" : "asc") : "desc";
    sortRef.current = { col, dir };
    const mult = dir === "asc" ? 1 : -1;

    const sorted = [...displayRows].sort((a, b) => {
      const getVal = (r) => {
        if (col === "usage") return usagePct[r.driver] ?? -Infinity; // computed Usage%
        if (col === "pown" || col === "opt") return ((r[col] || 0) * 100); // convert 0..1 → %
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
  const bumpBoost = (d, step) => setBoost((m) => ({ ...m, [d]: clamp((m[d] || 0) + step, -6, 6) }));
  const toggleLock = (d) =>
    setLocks((s) => {
      const n = new Set(s);
      n.has(d) ? n.delete(d) : n.add(d);
      return n;
    });
  const toggleExcl = (d) =>
    setExcls((s) => {
      const n = new Set(s);
      n.has(d) ? n.delete(d) : n.add(d);
      return n;
    });

  const resetConstraints = () => {
    setLocks(new Set());
    setExcls(new Set());
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
      locks: Array.from(locks),
      excludes: Array.from(excls),
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

      // NEW: player groups (backend you added will honor them)
      groups: groups.map((g) => ({
        mode: g.mode || "at_most", // at_most | at_least | exactly
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
          const L = {
            drivers: evt.drivers,
            salary: evt.salary,
            total: evt.total,
            chosen,
          };
          out.push(L);
          setLineups((prev) => [...prev, L]);
          setProgressActual(out.length);
        },
        (done) => {
          if (done?.reason) setStopInfo(done);
          setProgressActual(out.length || payload.n);
          setProgressUI(out.length || payload.n); // snap full
          setIsOptimizing(false);
          clearInterval(tickRef.current);
          saveBuild(nextBuildNameForSite(site), out);
        }
      );
    } catch (e) {
      const res = await fetch(`${API_BASE}/xfinity/solve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        alert(`Solve failed: ${await res.text()}`);
        setIsOptimizing(false);
        clearInterval(tickRef.current);
        return;
      }
      const j = await res.json();
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
      if ((j.produced || 0) < payload.n) {
        setStopInfo({ produced: j.produced || 0, requested: payload.n, reason: "stopped_early" });
      }
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
        locks: [...locks],
        excls: [...excls],
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
    optBy === "proj"
      ? "Proj"
      : optBy === "floor"
      ? "Floor"
      : optBy === "ceil"
      ? "Ceiling"
      : optBy === "pown"
      ? "pOWN%"
      : "Opt%";

  // compact, center-aligned look
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
    { key: "val",  label: "Val",  sortable: true },       // NEW
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
      <h1 className="text-2xl md:text-3xl font-extrabold mb-1">NASCAR Xfinity — Optimizer</h1>

      {/* site toggle & reset */}
      <div className="mb-3 flex gap-2 items-center">
        {["dk", "fd"].map((s) => (
          <button
            key={s}
            onClick={() => {
              setSite(s);
              setLocks(new Set());
              setExcls(new Set());
            }}
            className={`px-3 py-1.5 rounded-full border text-sm inline-flex items-center gap-2 ${
              site === s ? "bg-blue-50 border-blue-300 text-blue-800" : "bg-white border-gray-300 text-gray-700"
            }`}
          >
            <img src={SITES[s].logo} alt="" className="w-4 h-4" />
            <span>{SITES[s].label}</span>
          </button>
        ))}
        <button className="ml-auto px-2.5 py-1.5 text-sm rounded-lg bg-white border hover:bg-gray-50" onClick={resetConstraints}>
          Reset constraints
        </button>
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
          <input
            className="w-full border rounded-md px-2 py-1.5 text-sm"
            value={randomness}
            onChange={(e) => setRandomness(e.target.value)}
          />
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
                width: `${(Math.min(progressUI, Math.max(1, Number(numLineups) || 1)) / Math.max(
                  1,
                  Number(numLineups) || 1
                )) * 100}%`,
              }}
            />
          </div>
          <div className="text-sm text-gray-600 min-w-[60px] text-right">
            {progressUI}/{numLineups}
          </div>
        </div>
      </div>

      {/* builds */}
      {builds.length > 0 && (
        <div className="mb-2">
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

      {/* Player Groups (new searchable picker) */}
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
                    onChange={(e) =>
                      setGroups((Gs) =>
                        Gs.map((gg, i) => (i === idx ? { ...gg, mode: e.target.value } : gg))
                      )
                    }
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
                    onChange={(e) =>
                      setGroups((Gs) =>
                        Gs.map((gg, i) =>
                          i === idx ? { ...gg, count: Math.max(0, Number(e.target.value) || 0) } : gg
                        )
                      )
                    }
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
                  onChange={(players) =>
                    setGroups((Gs) => Gs.map((gg, i) => (i === idx ? { ...gg, players } : gg)))
                  }
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

      {/* compact, center-aligned player table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-auto mb-6">
        <table className={`w-full border-separate ${textSz}`} style={{ borderSpacing: 0 }}>
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {TABLE_COLS.map(({ key, label, sortable }) => (
                <th
                  key={key}
                  className={`${header} whitespace-nowrap cursor-${sortable ? "pointer" : "default"} select-none`}
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
              displayRows.map((r) => {
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
                        <button className="px-1.5 py-0.5 border rounded" title="+3%" onClick={() => bumpBoost(r.driver, +1)}>
                          ▲
                        </button>
                        <span className="w-5 text-center">{boost[r.driver] || 0}</span>
                        <button className="px-1.5 py-0.5 border rounded" title="-3%" onClick={() => bumpBoost(r.driver, -1)}>
                          ▼
                        </button>
                      </div>
                    </td>
                    <td className={`${cell} whitespace-nowrap`}>{r.driver}</td>
                    <td className={`${cell} tabular-nums`}>{fmt0(r.salary)}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1(projBoosted)}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1(val)}</td> {/* NEW Val */}
                    <td className={`${cell} tabular-nums`}>{fmt1(r.floor)}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1(r.ceil)}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1(r.pown * 100)}</td>
                    <td className={`${cell} tabular-nums`}>{fmt1(r.opt * 100)}</td>

                    {/* Min% */}
                    <td className={cell}>
                      <div className="inline-flex items-center gap-1">
                        <button
                          className="px-1.5 py-0.5 border rounded"
                          onClick={() => setMinPct((m) => ({ ...m, [r.driver]: clamp((num(m[r.driver]) || 0) - 5, 0, 100) }))}
                          title="-5%"
                        >
                          –
                        </button>
                        <input
                          className="w-12 border rounded px-1.5 py-0.5 text-center"
                          value={String(minPct[r.driver] ?? "")}
                          onChange={(e) => setMinPct((m) => ({ ...m, [r.driver]: e.target.value }))}
                          placeholder="—"
                        />
                        <button
                          className="px-1.5 py-0.5 border rounded"
                          onClick={() => setMinPct((m) => ({ ...m, [r.driver]: clamp((num(m[r.driver]) || 0) + 5, 0, 100) }))}
                          title="+5%"
                        >
                          +
                        </button>
                      </div>
                    </td>

                    {/* Max% */}
                    <td className={cell}>
                      <div className="inline-flex items-center gap-1">
                        <button
                          className="px-1.5 py-0.5 border rounded"
                          onClick={() => setMaxPct((m) => ({ ...m, [r.driver]: clamp((num(m[r.driver]) || 100) - 5, 0, 100) }))}
                          title="-5%"
                        >
                          –
                        </button>
                        <input
                          className="w-12 border rounded px-1.5 py-0.5 text-center"
                          value={String(maxPct[r.driver] ?? "")}
                          onChange={(e) => setMaxPct((m) => ({ ...m, [r.driver]: e.target.value }))}
                          placeholder="—"
                        />
                        <button
                          className="px-1.5 py-0.5 border rounded"
                          onClick={() => setMaxPct((m) => ({ ...m, [r.driver]: clamp((num(m[r.driver]) || 100) + 5, 0, 100) }))}
                          title="+5%"
                        >
                          +
                        </button>
                      </div>
                    </td>

                    {/* Usage% (new column) */}
                    <td className={cell}>
                      {usagePct[r.driver] != null ? fmt1(usagePct[r.driver]) : "—"}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* stop-info */}
      {stopInfo && (
        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          Stopped early at {stopInfo.produced}/{numLineups}
          {stopInfo.reason ? ` — ${stopInfo.reason}` : ""}
        </div>
      )}

      {/* results */}
      {!!lineups.length && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Lineups */}
          <section className="lg:col-span-8 rounded-lg border bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold">Lineups ({lineups.length})</h2>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 border rounded text-sm" onClick={() => downloadPlainCSV(lineups)}>
                  Export CSV
                </button>
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
            <div className="overflow-auto max-h-[440px]">
              <table className="min-w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
                <thead className="bg-gray-50">
                  <tr>
                    <th className={header}>#</th>
                    <th className={header}>Salary</th>
                    <th className={header}>Total {optBy === "pown" || optBy === "opt" ? "Projection" : metricLabel}</th>
                    <th className={header}>Drivers</th>
                  </tr>
                </thead>
                <tbody>
                  {lineups.map((L, i) => (
                    <tr key={i} className="odd:bg-white even:bg-gray-50">
                      <td className={cell}>{i + 1}</td>
                      <td className={`${cell} tabular-nums`}>{fmt0(L.salary)}</td>
                      <td className={`${cell} tabular-nums`}>{fmt1(L.total)}</td>
                      <td className={`${cell} leading-snug`}>
                        <span className="break-words">{L.drivers.join(" • ")}</span>
                      </td>
                    </tr>
                  ))}
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

          {/* Cards */}
          <section className="lg:col-span-12">
            <h3 className="text-base font-semibold mb-2">Cards</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {lineups.map((L, idx) => {
                const chosenSorted = [...L.chosen].sort((a, b) => b.salary - a.salary);
                const totalPownPct = chosenSorted.reduce((acc, r) => acc + (r.pown || 0) * 100, 0); // NEW total pOWN%

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
                          <td className={`${cell} tabular-nums font-semibold`}>{fmt1(totalPownPct)}</td> {/* NEW total pOWN% */}
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
        <thead className="bg-gray-50">
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
