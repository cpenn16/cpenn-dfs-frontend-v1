// src/pages/mlb/MlbStacks.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ZAxis,
  ReferenceLine,
} from "recharts";

/* ------------------------------- config ------------------------------- */
const SOURCE = "/data/mlb/latest/stacks.json";

const SITES = {
  dk: { key: "dk", label: "DK", logo: "/logos/dk.png" },
  fd: { key: "fd", label: "FD", logo: "/logos/fd.png" },
  both: { key: "both", label: "Both" },
};

/* ------------------------------ helpers ------------------------------- */
const teamLogo = (team) => `/logos/mlb/${String(team || "").toUpperCase()}.png`;

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
function getVal(row, key) {
  if (Array.isArray(key)) {
    for (const k of key) {
      const v = row?.[k];
      if (v !== undefined && v !== null && v !== "") return v;
    }
    return null;
  }
  return row?.[key];
}

/* formatting */
const fmt = {
  int(v) {
    const n = num(v);
    return n === null ? "" : Math.round(n).toLocaleString();
  },
  smart1(v) {
    const n = num(v);
    if (n === null) return "";
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  },
  num1(v) {
    const n = num(v);
    return n === null ? "" : n.toFixed(1);
  },
  pct1(v) {
    if (v === "" || v === null || v === undefined) return "";
    const raw = String(v).trim();
    if (raw.endsWith("%")) {
      const n = num(raw.slice(0, -1));
      return n === null ? "" : `${n.toFixed(1)}%`;
    }
    let n = num(raw);
    if (n === null) return "";
    if (Math.abs(n) <= 1) n *= 100; // treat 0..1 as fraction
    return `${n.toFixed(1)}%`;
  },
};

/* CSV */
const escapeCSV = (s) => {
  const v = String(s ?? "");
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
function downloadCSV(rows, cols, fname = "mlb_stacks.csv") {
  const header = cols.map((c) => c.label).join(",");
  const body = rows
    .map((r) =>
      cols
        .map((c) => {
          const raw = getVal(r, c.key);
          let val = raw;
          if (c.type === "int") val = fmt.int(raw);
          if (c.type === "smart1") val = fmt.smart1(raw);
          if (c.type === "num1") val = fmt.num1(raw);
          if (c.type === "pct1") val = fmt.pct1(raw);
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

/* fetch */
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

/* ---------------------- last-updated via meta.json -------------------- */
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
  const metaUrl = useMemo(() => toMetaUrl(sourceUrl), [sourceUrl]);
  const [text, setText] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${metaUrl}?_=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const meta = await r.json();
        const d = parseMetaToDate(meta);
        if (!d) return;
        const t = d.toLocaleString(undefined, {
          month: "numeric",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        if (alive) setText(t);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [metaUrl]);
  return text;
}

/* -------------------------- columns (with fallbacks) ------------------ */
const COLS_BASE = [
  { id: "team", key: ["team", "Team"], label: "Team", type: "text", w: "min-w-[6.5rem]" },
  { id: "dk_sal", key: ["dk_sal", "DK Sal", "dkSal"], label: "DK Sal", type: "int" },
  { id: "fd_sal", key: ["fd_sal", "FD Sal", "fdSal"], label: "FD Sal", type: "int" },
  { id: "total", key: ["total", "Total", "imp_tot", "Implied Total"], label: "Total", type: "smart1" },
  { id: "park", key: ["park", "Park"], label: "Park", type: "text" },
  { id: "opp", key: ["opp", "Opp"], label: "Opp", type: "text" },
  {
    id: "opp_pitcher",
    key: ["opp_pitcher", "Opp Pitcher", "oppPitcher"],
    label: "Opp Pitcher",
    type: "text",
    w: "min-w-[9rem]",
  },
  { id: "h", key: ["h", "H", "hand"], label: "H", type: "text" },
];

const COLS_DK = [
  { id: "dk_proj", key: ["dk_proj", "DK Proj", "dkProj"], label: "DK Proj", type: "num1" },
  { id: "dk_val", key: ["dk_val", "DK Val", "dkVal"], label: "DK Val", type: "num1" },
  { id: "dk_pown", key: ["dk_pown", "DK pOWN%", "dk_pown%", "dkPOWN"], label: "DK pOWN%", type: "pct1" },
  { id: "dk_tstack", key: ["dk_tstack", "DK Tstack%", "tstack_dk"], label: "DK Tstack%", type: "pct1" },
  { id: "dk_vstack", key: ["dk_vstack", "DK vStack%", "vstack_dk"], label: "DK vStack%", type: "pct1" },
  { id: "dk_lev", key: ["dk_lev", "DK Lev%", "dkLev"], label: "DK Lev%", type: "pct1" },
];

const COLS_FD = [
  { id: "fd_proj", key: ["fd_proj", "FD Proj", "fdProj"], label: "FD Proj", type: "num1" },
  { id: "fd_val", key: ["fd_val", "FD Val", "fdVal"], label: "FD Val", type: "num1" },
  { id: "fd_pown", key: ["fd_pown", "FD pOWN%", "fd_pown%", "fdPOWN"], label: "FD pOWN%", type: "pct1" },
  { id: "fd_tstack", key: ["fd_tstack", "FD Tstack%", "tstack_fd"], label: "FD Tstack%", type: "pct1" },
  { id: "fd_vstack", key: ["fd_vstack", "FD vStack%", "vstack_fd"], label: "FD vStack%", type: "pct1" },
  { id: "fd_lev", key: ["fd_lev", "FD Lev%", "fdLev"], label: "FD Lev%", type: "pct1" },
];

/* ------------------------ conditional formatting ---------------------- */
// higher is better
const HIGHER_IS_BETTER = new Set([
  "total",
  "dk_proj",
  "dk_val",
  "dk_tstack",
  "dk_vstack",
  "dk_lev",
  "fd_proj",
  "fd_val",
  "fd_tstack",
  "fd_vstack",
  "fd_lev",
]);
// lower is better (ownership)
const LOWER_IS_BETTER = new Set(["dk_pown", "fd_pown"]);

function computeStats(rows, columns) {
  const stats = {};
  const scoredIds = new Set([...HIGHER_IS_BETTER, ...LOWER_IS_BETTER]);
  for (const c of columns) {
    if (!scoredIds.has(c.id)) continue;
    let min = Infinity,
      max = -Infinity,
      any = false;
    for (const r of rows) {
      const raw = getVal(r, c.key);
      if (raw === null || raw === undefined || raw === "") continue;
      let v = num(String(raw).endsWith("%") ? String(raw).slice(0, -1) : raw);
      if (v === null) continue;
      if (c.type === "pct1" && Math.abs(v) <= 1) v *= 100;
      any = true;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (any && min !== max) stats[c.id] = { min, max };
  }
  return stats;
}

function colorFor(value, col, stats, palette) {
  const scored = HIGHER_IS_BETTER.has(col.id) || LOWER_IS_BETTER.has(col.id);
  if (palette === "none" || !scored) return null;
  if (value == null || value === "") return null;
  const st = stats[col.id];
  if (!st) return null;

  let v = num(String(value).endsWith("%") ? String(value).slice(0, -1) : value);
  if (v == null) return null;
  if (col.type === "pct1" && Math.abs(v) <= 1) v *= 100;

  let t = (v - st.min) / (st.max - st.min);
  t = Math.max(0, Math.min(1, t));
  if (LOWER_IS_BETTER.has(col.id)) t = 1 - t; // invert

  if (palette === "gyr") {
    // real Red (bad) -> Yellow (mid) -> Green (good)
    const hue = 0 + 120 * t; // 0=red, 120=green
    const sat = 85;
    const light = 96 - 14 * t;
    return `hsl(${hue} ${sat}% ${light}%)`;
  }
  if (palette === "orangeblue") {
    // blue (bad) -> white (mid) -> orange (good)
    // t is already inverted for LOWER_IS_BETTER above
    if (t < 0.5) {
      // lower -> bluer (bad)
      const u = t / 0.5;
      const hue = 220;                // blue
      const sat = 30 + 40 * u;
      const light = 94 - 8 * u;
      return `hsl(${hue} ${sat}% ${light}%)`;
    } else {
      // higher -> more orange (good)
      const u = (t - 0.5) / 0.5;
      const hue = 30;                 // orange
      const sat = 70 - 40 * (1 - u);  // grow saturation a bit as it gets better
      const light = 92 - 6 * u;
      return `hsl(${hue} ${sat}% ${light}%)`;
    }
  }
  return null;
}

/* ------------------------------ Insights ------------------------------ */
const asNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  let s = String(v).trim();
  s = s.replace(/\u00A0|\u2009|\u202F/g, "");
  if (/^-?\d+,\d+$/.test(s) && !s.includes(".")) {
    s = s.replace(",", ".");
  } else {
    s = s.replace(/(\d),(?=\d{3}\b)/g, "$1");
  }
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};
const asPct = (v) => {
  if (v === null || v === undefined || v === "") return null;
  let s = String(v).trim();
  const hadPercent = /%$/.test(s);
  if (hadPercent) s = s.slice(0, -1);
  const n = asNum(s);
  if (n === null) return null;
  return hadPercent ? n : Math.abs(n) > 0 && Math.abs(n) < 1 ? n * 100 : n;
};

const METRICS = {
  total: { label: "Implied Total", key: "total" },
  dk_proj: { label: "DK Proj", key: "dk_proj", site: "dk" },
  fd_proj: { label: "FD Proj", key: "fd_proj", site: "fd" },
  dk_pown: { label: "DK pOWN%", key: "dk_pown", site: "dk", pct: true },
  fd_pown: { label: "FD pOWN%", key: "fd_pown", site: "fd", pct: true },
  dk_sal: { label: "DK Sal", key: "dk_sal", site: "dk" },
  fd_sal: { label: "FD Sal", key: "fd_sal", site: "fd" },
};
const PRESETS = [
  { id: "sal_vs_total", label: "Team Sal vs Total", x_dk: "dk_sal", x_fd: "fd_sal", y: "total" },
  { id: "proj_vs_own", label: "Team Proj vs pOWN%", x_dk: "dk_proj", x_fd: "fd_proj", y_dk: "dk_pown", y_fd: "fd_pown" },
  { id: "total_vs_own", label: "Total vs pOWN%", x: "total", y_dk: "dk_pown", y_fd: "fd_pown" },
];

function LogoDot({ cx, cy, payload }) {
  const abv = String(payload.team || "").toUpperCase();
  const size = 26;
  if (cx == null || cy == null) return null;
  return (
    <image
      href={teamLogo(abv)}
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      style={{ pointerEvents: "none" }}
      onError={(e) => (e.currentTarget.style.display = "none")}
    />
  );
}
function domainFor(points, axis = "x", isPct = false) {
  if (!points.length) return [0, 1];
  const vals = points.map((p) => (axis === "x" ? p.x : p.y)).filter((v) => v != null && Number.isFinite(v));
  if (!vals.length) return [0, 1];
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (min === max) {
    const d = min === 0 ? 1 : Math.abs(min) * 0.05;
    min -= d;
    max += d;
  }
  const span = max - min;
  min -= span * 0.06;
  max += span * 0.06;
  if (isPct) {
    min = Math.max(0, min);
    max = Math.min(100, max < 5 ? 5 : max);
  }
  return [Math.floor(min), Math.ceil(max)];
}
function StacksInsights({ rows }) {
  const [presetId, setPresetId] = useState("proj_vs_own");
  const [site, setSite] = useState("both");
  const preset = PRESETS.find((p) => p.id === presetId) || PRESETS[0];

  const data = useMemo(
    () =>
      (rows || []).map((r) => ({
        team: String(getVal(r, ["team", "Team"]) || "").toUpperCase(),
        total: asNum(getVal(r, ["total", "Total", "imp_tot", "Implied Total"])),
        dk_proj: asNum(getVal(r, ["dk_proj", "DK Proj"])),
        fd_proj: asNum(getVal(r, ["fd_proj", "FD Proj"])),
        dk_pown: asPct(getVal(r, ["dk_pown", "DK pOWN%", "dk_pown%"])),
        fd_pown: asPct(getVal(r, ["fd_pown", "FD pOWN%", "fd_pown%"])),
        dk_sal: asNum(getVal(r, ["dk_sal", "DK Sal"])),
        fd_sal: asNum(getVal(r, ["fd_sal", "FD Sal"])),
      })),
    [rows]
  );

  const series = useMemo(() => {
    const build = (sid) => {
      const xKey = preset[`x_${sid}`] || preset.x;
      const yKey = preset[`y_${sid}`] || preset.y;
      if (!xKey || !yKey) return null;
      const pts = data
        .map((d) => ({
          x: METRICS[xKey]?.pct ? asPct(d[xKey]) : asNum(d[xKey]),
          y: METRICS[yKey]?.pct ? asPct(d[yKey]) : asNum(d[yKey]),
          team: d.team,
        }))
        .filter((p) => p.x != null && p.y != null);
      return { id: sid, label: sid.toUpperCase(), points: pts, xKey, yKey };
    };
    const out = [];
    if (site === "dk" || site === "both") {
      const s = build("dk");
      if (s) out.push(s);
    }
    if (site === "fd" || site === "both") {
      const s = build("fd");
      if (s) out.push(s);
    }
    return out;
  }, [data, site, preset]);

  const active = series[0] || null;
  const xLabel =
    (preset.x_dk && site === "dk" && METRICS[preset.x_dk]?.label) ||
    (preset.x_fd && site === "fd" && METRICS[preset.x_fd]?.label) ||
    METRICS[preset.x]?.label ||
    "";
  const yLabel =
    (preset.y_dk && site === "dk" && METRICS[preset.y_dk]?.label) ||
    (preset.y_fd && site === "fd" && METRICS[preset.y_fd]?.label) ||
    (preset.y && METRICS[preset.y]?.label) ||
    "";

  const ptsForDomain = site === "both" ? series.flatMap((s) => s.points) : active?.points || [];
  const xIsPct = !!(active && METRICS[active.xKey]?.pct) || (!!preset.x && METRICS[preset.x]?.pct);
  const yIsPct =
    !!(active && METRICS[active.yKey]?.pct) ||
    (!!preset.y && METRICS[preset.y]?.pct) ||
    (!!preset.y_dk && METRICS[preset.y_dk]?.pct) ||
    (!!preset.y_fd && METRICS[preset.y_fd]?.pct);

  const [xMin, xMax] = domainFor(ptsForDomain, "x", xIsPct);
  const [yMin, yMax] = domainFor(ptsForDomain, "y", yIsPct);

  const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
  const xAvg = avg(ptsForDomain.map((p) => p.x));
  const yAvg = avg(ptsForDomain.map((p) => p.y));

  return (
    <div className="mt-6 rounded-2xl border bg-white shadow-sm">
      <div className="p-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="font-semibold">Insights</div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="inline-flex rounded-xl bg-gray-100 p-1">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className={`px-3 py-1.5 text-sm rounded-lg ${presetId === p.id ? "bg-white shadow font-semibold" : "text-gray-700"}`}
                onClick={() => setPresetId(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-xl bg-gray-100 p-1">
            {["dk", "fd", "both"].map((k) => (
              <button
                key={k}
                className={`px-3 py-1.5 text-sm rounded-lg inline-flex items-center gap-2 ${site === k ? "bg-white shadow font-semibold" : "text-gray-700"}`}
                onClick={() => setSite(k)}
              >
                {k !== "both" ? <img src={SITES[k].logo} className="w-4 h-4" alt="" /> : null}
                {k.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="h-[560px] px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 48, right: 56, bottom: 36, left: 44 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name={xLabel}
              domain={[xMin, xMax]}
              tickFormatter={(v) => (typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(1)) : v)}
              label={{ value: xLabel, position: "insideBottom", offset: -20 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yLabel}
              domain={[yMin, yMax]}
              tickFormatter={(v) => (typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(1)) : v)}
              label={{ value: yLabel, angle: -90, position: "insideLeft" }}
            />
            <Tooltip
              formatter={(val) => (typeof val === "number" ? (Number.isInteger(val) ? val : val.toFixed(1)) : val)}
              labelFormatter={() => ""}
              contentStyle={{ fontSize: 12 }}
              cursor={{ strokeDasharray: "3 3" }}
            />
            {xAvg != null && (
              <ReferenceLine
                x={xAvg}
                stroke="blue"
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
                label={{ value: "AVG", position: "top", fill: "blue", offset: 10 }}
              />
            )}
            {yAvg != null && (
              <ReferenceLine
                y={yAvg}
                stroke="blue"
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
                label={{ value: "AVG", position: "right", fill: "blue", offset: 10 }}
              />
            )}
            {series.map((s) => (
              <Scatter key={s.id} name={s.label} data={s.points} shape={<LogoDot />}>
                <ZAxis type="number" dataKey="z" range={[60, 60]} />
              </Scatter>
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* -------------------------------- page -------------------------------- */
export default function MlbStacks() {
  const { rows, loading, err } = useJson(SOURCE);
  const [site, setSite] = useState("both");
  const [q, setQ] = useState("");
  const [palette, setPalette] = useState("none"); // default to visible coloring
  const updatedText = useLastUpdatedFromSource(SOURCE);

  const columns = useMemo(() => {
    const base = [...COLS_BASE];
    if (site === "dk") return [...base, ...COLS_DK];
    if (site === "fd") return [...base, ...COLS_FD];
    return [...base, ...COLS_DK, ...COLS_FD];
  }, [site]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      `${getVal(r, ["team", "Team"]) ?? ""} ${getVal(r, ["opp", "Opp"]) ?? ""} ${
        getVal(r, ["opp_pitcher", "Opp Pitcher", "oppPitcher"]) ?? ""
      }`
        .toLowerCase()
        .includes(needle)
    );
  }, [rows, q]);

  // default sort DK Proj desc
  const [sort, setSort] = useState({ key: ["dk_proj", "DK Proj"], dir: "desc" });

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    const sgn = dir === "asc" ? 1 : -1;
    const col =
      columns.find((c) =>
        Array.isArray(c.key)
          ? Array.isArray(key) && c.key.join("|") === key.join("|")
          : c.key === key
      ) || columns[0];

    const t = col?.type;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const avRaw = getVal(a, key);
      const bvRaw = getVal(b, key);
      const toPct = (v) => {
        if (v === null || v === undefined || v === "") return null;
        const raw = String(v).trim();
        if (raw.endsWith("%")) return num(raw.slice(0, -1));
        let n = num(raw);
        if (n === null) return null;
        if (Math.abs(n) <= 1) n *= 100;
        return n;
      };
      const av = t === "pct1" ? toPct(avRaw) : num(avRaw);
      const bv = t === "pct1" ? toPct(bvRaw) : num(bvRaw);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * sgn;
    });
    return arr;
  }, [filtered, sort, columns]);

  const onSort = (col) => {
    setSort((prev) => {
      const nextKey = col.key;
      const changed =
        (Array.isArray(prev.key) && Array.isArray(nextKey) && prev.key.join("|") !== nextKey.join("|")) ||
        (!Array.isArray(prev.key) && !Array.isArray(nextKey) && prev.key !== nextKey);
      if (changed) return { key: nextKey, dir: "desc" };
      return { key: nextKey, dir: prev.dir === "desc" ? "asc" : "desc" };
    });
  };

  const stats = useMemo(() => computeStats(sorted, columns), [sorted, columns]);

  const cell = "px-2 py-1 text-center";
  const header = "px-2 py-1 font-semibold text-center";
  const textSz = "text-[12px]";

  return (
    <div className="px-4 md:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl md:text-3xl font-extrabold mb-0.5">MLB — Stacks</h1>
          <div className="text-sm text-gray-600">
            {loading ? "Loading…" : err ? `Error: ${err}` : `${sorted.length.toLocaleString()} rows`}
          </div>
          {updatedText && <div className="text-sm text-gray-500">Updated: {updatedText}</div>}
        </div>

        <div className="flex items-center gap-2">
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

          <input
            className="h-9 w-64 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search team / opp / pitcher…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <select
            value={palette}
            onChange={(e) => setPalette(e.target.value)}
            className="h-9 rounded-lg border px-2 text-sm"
            title="Cell coloring"
          >
            <option value="none">Coloring: None</option>
            <option value="gyr">Coloring: Green–Yellow–Red</option>
            <option value="orangeblue">Coloring: Orange–Blue</option>
          </select>

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
                  key={Array.isArray(c.key) ? c.key.join("|") : c.key}
                  className={`${header} whitespace-nowrap cursor-pointer select-none ${c.w || ""} ${
                    c.id === "team" ? "sticky left-0 z-20 bg-gray-50" : ""
                  }`}
                  onClick={() => onSort(c)}
                  title="Click to sort"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>{c.label}</span>
                    <span className="text-gray-400">
                      {Array.isArray(sort.key)
                        ? Array.isArray(c.key) && sort.key.join("|") === c.key.join("|")
                          ? sort.dir === "desc"
                            ? "▼"
                            : "▲"
                          : "▲"
                        : sort.key === c.key
                        ? sort.dir === "desc"
                          ? "▼"
                          : "▲"
                        : "▲"}
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
              sorted.map((r, i) => {
                const teamAbv = String(getVal(r, ["team", "Team"]) || "").toUpperCase();
                return (
                  <tr key={`${teamAbv}-${getVal(r, ["opp", "Opp"]) || ""}-${i}`} className="odd:bg-white even:bg-gray-50">
                    {columns.map((c) => {
                      const raw = getVal(r, c.key);

                      if (c.id === "team") {
                        return (
                          <td
                            key={Array.isArray(c.key) ? c.key.join("|") : c.key}
                            className={`px-2 py-1 text-left sticky left-0 z-10 ${
                              i % 2 === 0 ? "bg-white" : "bg-gray-50"
                            } min-w-[6.5rem] shadow-[inset_-6px_0_6px_-6px_rgba(0,0,0,0.15)]`}
                          >
                            <div className="flex items-center gap-2">
                              <img
                                src={teamLogo(teamAbv)}
                                alt=""
                                className="w-4 h-4 rounded-sm object-contain"
                                onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                              />
                              <span className="whitespace-nowrap font-medium">{teamAbv}</span>
                            </div>
                          </td>
                        );
                      }

                      let val = raw;
                      if (c.type === "int") val = fmt.int(raw);
                      if (c.type === "smart1") val = fmt.smart1(raw);
                      if (c.type === "num1") val = fmt.num1(raw);
                      if (c.type === "pct1") val = fmt.pct1(raw);

                      const bg = colorFor(raw, c, stats, palette);
                      const cls = c.type === "text" ? "px-2 py-1 text-center" : `${cell} tabular-nums`;
                      return (
                        <td
                          key={Array.isArray(c.key) ? c.key.join("|") : c.key}
                          className={`${cls} whitespace-nowrap`}
                          style={bg ? { backgroundColor: bg } : undefined}
                          title={String(val ?? "")}
                        >
                          {val ?? ""}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Insights */}
      {!loading && !err ? <StacksInsights rows={filtered} /> : null}
    </div>
  );
}
