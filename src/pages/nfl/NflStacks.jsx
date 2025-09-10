// src/pages/nfl/NflStacks.jsx
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
const SOURCE = "/data/nfl/classic/latest/stacks.json";
const SITES = {
  dk: { key: "dk", label: "DK", logo: "/logos/dk.png" },
  fd: { key: "fd", label: "FD", logo: "/logos/fd.png" },
  both: { key: "both", label: "Both" },
};

/* ------------------------------ helpers ------------------------------- */
const teamLogo = (team) => `/logos/nfl/${String(team || "").toUpperCase()}.png`;

const asNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  let s = String(v).trim();
  s = s.replace(/\u00A0|\u2009|\u202F/g, "");
  if (/^-?\d+,\d+$/.test(s) && !s.includes(".")) s = s.replace(",", ".");
  else s = s.replace(/(\d),(?=\d{3}\b)/g, "$1");
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};
const num = (v) => {
  const n = asNum(v);
  return Number.isFinite(n) ? n : null;
};

const detectPctScale = (vals) => {
  const nums = (vals || [])
    .map((v) => asNum(v))
    .filter((v) => v != null && Number.isFinite(v));
  if (!nums.length) return 1;
  return Math.max(...nums) <= 1 ? 100 : 1;
};
const clampPct = (n) => {
  if (n == null || !Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
};

const getVal = (row, key) => {
  if (Array.isArray(key)) {
    for (const k of key) {
      const v = row?.[k];
      if (v !== undefined && v !== null && v !== "") return v;
    }
    return null;
  }
  return row?.[key];
};

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
  signedSmart1(v) {
    const n = num(v);
    if (n === null) return "";
    const body = Number.isInteger(n) ? String(n) : n.toFixed(1);
    return n > 0 ? `+${body}` : body;
  },
  num1(v) {
    const n = num(v);
    return n === null ? "" : n.toFixed(1);
  },
  pct1(v) {
    if (v === "" || v === null || v === undefined) return "";
    const hadPercent = /%$/.test(String(v).trim());
    const n = asNum(hadPercent ? String(v).trim().slice(0, -1) : v);
    if (n === null) return "";
    return `${n.toFixed(1)}%`;
  },
};

/* CSV */
const escapeCSV = (s) => {
  const v = String(s ?? "");
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
function downloadCSV(rows, cols, fname = "nfl_stacks.csv") {
  const header = cols.map((c) => c.label).join(",");
  const body = rows
    .map((r) =>
      cols
        .map((c) => {
          const raw = getVal(r, c.key);
          let val = raw;
          if (c.type === "int") val = fmt.int(raw);
          if (c.type === "smart1") val = fmt.smart1(raw);
          if (c.type === "signed-smart1") val = fmt.signedSmart1(raw);
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

/* -------------------------- columns (with fallbacks) ------------------ */
const COLS_BASE = [
  { key: "team", label: "Team", type: "text", w: "min-w-[7rem]" },
  { key: "opp", label: "Opp", type: "text" },
  { key: "field", label: "Field", type: "text" },
  { key: ["dk_sal", "dkSal", "DK Sal"], label: "DK Sal", type: "int" },
  { key: ["fd_sal", "fdSal", "FD Sal"], label: "FD Sal", type: "int" },
  { key: ["ou", "O/U", "ou_total", "over_under"], label: "O/U", type: "smart1" },
  { key: ["spread", "Spread"], label: "Spread", type: "signed-smart1" },
  { key: ["imp_tot", "impTot", "Imp. Tot", "implied_total"], label: "Imp. Tot", type: "smart1" },
];

const COLS_DK = [
  { key: ["dk_pct", "dkPct", "DK%"], label: "DK%", type: "pct1" },
  { key: ["dk_opt", "dkOpt", "DK Opt%"], label: "DK Opt%", type: "pct1" },
  { key: ["dk_rtg", "dkRtg", "DK Rtg"], label: "DK Rtg", type: "num1" },
  { key: ["dk_qb", "dkQB", "DK QB"], label: "DK QB", type: "num1" },
  { key: ["dk_rb", "dkRB", "DK RB"], label: "DK RB", type: "num1" },
  { key: ["dk_wr", "dkWR", "DK WR"], label: "DK WR", type: "num1" },
  { key: ["dk_te", "dkTE", "DK TE"], label: "DK TE", type: "num1" },
  { key: ["dk_dst", "dkDST", "DK DST"], label: "DK DST", type: "num1" },
  { key: ["dk_total", "dkTotal", "DK Total"], label: "DK Total", type: "num1" },
];

const COLS_FD = [
  { key: ["fd_pct", "fdPct", "FD%"], label: "FD%", type: "pct1" },
  { key: ["fd_opt", "fdOpt", "FD Opt%"], label: "FD Opt%", type: "pct1" },
  { key: ["fd_rtg", "fdRtg", "FD Rtg"], label: "FD Rtg", type: "num1" },
  { key: ["fd_qb", "fdQB", "FD QB"], label: "FD QB", type: "num1" },
  { key: ["fd_rb", "fdRB", "FD RB"], label: "FD RB", type: "num1" },
  { key: ["fd_wr", "fdWR", "FD WR"], label: "FD WR", type: "num1" },
  { key: ["fd_te", "fdTE", "FD TE"], label: "FD TE", type: "num1" },
  { key: ["fd_dst", "fdDST", "FD DST"], label: "FD DST", type: "num1" },
  { key: ["fd_total", "fdTotal", "FD Total"], label: "FD Total", type: "num1" },
];

/* ------------------------------ Insights ------------------------------ */
const METRICS = {
  imp_tot: { label: "Implied Team Total", key: "imp_tot" },
  dk_total: { label: "DK Total", key: "dk_total", site: "dk" },
  fd_total: { label: "FD Total", key: "fd_total", site: "fd" },
  dk_pct: { label: "DK pOWN%", key: "dk_pct", site: "dk", pct: true },
  fd_pct: { label: "FD pOWN%", key: "fd_pct", site: "fd", pct: true },
  dk_rtg: { label: "DK Rating", key: "dk_rtg", site: "dk" },
  fd_rtg: { label: "FD Rating", key: "fd_rtg", site: "fd" },
  dk_sal: { label: "DK Salary", key: "dk_sal", site: "dk" },
  fd_sal: { label: "FD Salary", key: "fd_sal", site: "fd" },
};

const PRESETS = [
  { id: "sal_vs_total", label: "Team Sal vs Implied Total", x_dk: "dk_sal", x_fd: "fd_sal", y: "imp_tot" },
  { id: "totals", label: "Team Total vs Proj", x: "imp_tot", y_dk: "dk_total", y_fd: "fd_total" },
  { id: "proj_vs_own", label: "Team Proj vs pOWN%", x_dk: "dk_total", x_fd: "fd_total", y_dk: "dk_pct", y_fd: "fd_pct" },
  { id: "totals_own", label: "Team Total vs pOWN%", x: "imp_tot", y_dk: "dk_pct", y_fd: "fd_pct" },
];

function LogoDot({ cx, cy, payload }) {
  const abv = String(payload.team || "").toUpperCase();
  const size = 24;
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

function StacksInsights({ rows, site = "both" }) {
  const [presetId, setPresetId] = useState("totals");
  const preset = PRESETS.find((p) => p.id === presetId) || PRESETS[0];

  const dkPctScale = useMemo(() => detectPctScale(rows.map((r) => r.dk_pct)), [rows]);
  const fdPctScale = useMemo(() => detectPctScale(rows.map((r) => r.fd_pct)), [rows]);

  const data = useMemo(
    () =>
      (rows || []).map((r) => ({
        team: String(r.team || "").toUpperCase(),
        opp: String(r.opp || "").toUpperCase(),
        imp_tot: asNum(r.imp_tot),
        dk_total: asNum(r.dk_total),
        fd_total: asNum(r.fd_total),
        dk_rtg: asNum(r.dk_rtg),
        fd_rtg: asNum(r.fd_rtg),
        dk_pct: clampPct(asNum(r.dk_pct) * dkPctScale),
        fd_pct: clampPct(asNum(r.fd_pct) * fdPctScale),
        dk_sal: asNum(r.dk_sal),
        fd_sal: asNum(r.fd_sal),
      })),
    [rows, dkPctScale, fdPctScale]
  );

  const series = useMemo(() => {
    const build = (sid) => {
      const xKey = preset[`x_${sid}`] || preset.x;
      const yKey = preset[`y_${sid}`] || preset.y;
      if (!xKey || !yKey) return null;
      const pts = data
        .map((d) => ({ x: d[xKey], y: d[yKey], team: d.team }))
        .filter((p) => p.x != null && p.y != null && Number.isFinite(p.x) && Number.isFinite(p.y));
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
  const xIsPct =
    !!(active && METRICS[active.xKey]?.pct) || (!!preset.x && METRICS[preset.x]?.pct);
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
    <div className="mt-4 md:mt-6 rounded-2xl border bg-white shadow-sm">
      <div className="p-3 md:p-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="font-semibold text-sm md:text-base">Insights</div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="inline-flex rounded-xl bg-gray-100 p-1">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className={`px-2.5 md:px-3 py-1.5 text-xs md:text-sm rounded-lg ${
                  presetId === p.id ? "bg-white shadow font-semibold" : "text-gray-700"
                }`}
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
                className={`px-2.5 md:px-3 py-1.5 text-xs md:text-sm rounded-lg inline-flex items-center gap-2 ${
                  site === k ? "bg-white shadow font-semibold" : "text-gray-700"
                }`}
                onClick={() => {
                  const ev = new CustomEvent("nfl-stacks-site-change", { detail: k });
                  window.dispatchEvent(ev);
                }}
              >
                {k !== "both" ? <img src={SITES[k].logo} className="w-4 h-4" alt="" /> : null}
                {k.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="h-[420px] md:h-[560px] px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 36, right: 40, bottom: 28, left: 36 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name={xLabel}
              domain={[xMin, xMax]}
              tickFormatter={(v) => (typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(1)) : v)}
              label={{ value: xLabel, position: "insideBottom", offset: -16 }}
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
                label={{ value: "AVG", position: "top", fill: "blue", offset: 8 }}
              />
            )}
            {yAvg != null && (
              <ReferenceLine
                y={yAvg}
                stroke="blue"
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
                label={{ value: "AVG", position: "right", fill: "blue", offset: 8 }}
              />
            )}

            {series.map((s) => (
              <Scatter key={s.id} name={s.label} data={s.points} shape={<LogoDot />}>
                <ZAxis type="number" dataKey="z" range={[56, 56]} />
              </Scatter>
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ======================= Heatmap: rules + palettes ======================= */

function dirForLabel(label) {
  const k = String(label).toLowerCase();
  if (
    [
      "o/u",
      "imp. tot",
      "dk%",
      "fd%",
      "dk rtg",
      "fd rtg",
      "dk qb",
      "fd qb",
      "dk rb",
      "fd rb",
      "dk wr",
      "fd wr",
      "dk te",
      "fd te",
      "dk dst",
      "fd dst",
      "dk total",
      "fd total",
      "dk opt%",
      "fd opt%",
    ].includes(k)
  )
    return "higher";
  if (["dk sal", "fd sal"].includes(k)) return "lower";
  return null;
}

function heatColor(min, max, v, dir, palette) {
  if (palette === "none") return null;
  if (v == null || min == null || max == null || min === max || !dir) return null;
  let t = (v - min) / (max - min);
  t = Math.max(0, Math.min(1, t));
  if (dir === "lower") t = 1 - t;

  if (palette === "blueorange") {
    if (t < 0.5) {
      const u = t / 0.5;
      const h = 220,
        s = 60 - u * 55,
        l = 90 + u * 7;
      return `hsl(${h}, ${s}%, ${l}%)`;
    } else {
      const u = (t - 0.5) / 0.5;
      const h = 30,
        s = 5 + u * 80,
        l = 97 - u * 7;
      return `hsl(${h}, ${s}%, ${l}%)`;
    }
  }

  if (t < 0.5) {
    const u = t / 0.5;
    const h = 0 + u * 60,
      s = 78 + u * 10,
      l = 94 - u * 2;
    return `hsl(${h}, ${s}%, ${l}%)`;
  } else {
    const u = (t - 0.5) / 0.5;
    const h = 60 + u * 60,
      s = 88 - u * 18,
      l = 92 + u * 2;
    return `hsl(${h}, ${s}%, ${l}%)`;
  }
}

/* -------------------------------- page -------------------------------- */
export default function NflStacks() {
  const { rows, loading, err } = useJson(SOURCE);

  const [site, setSite] = useState("both");
  const [q, setQ] = useState("");
  const [palette, setPalette] = useState("none"); // default to NONE
  const [view, setView] = useState("both"); // table | insights | both

  const defaultSortFor = (s) => {
    if (s === "dk") return { key: ["dk_total", "dkTotal", "DK Total"], dir: "desc" };
    if (s === "fd") return { key: ["fd_total", "fdTotal", "FD Total"], dir: "desc" };
    return { key: ["dk_total", "dkTotal", "DK Total"], dir: "desc" };
  };
  const [sort, setSort] = useState(defaultSortFor(site));
  useEffect(() => setSort(defaultSortFor(site)), [site]);

  const columns = useMemo(() => {
    if (site === "dk") return [...COLS_BASE, ...COLS_DK];
    if (site === "fd") return [...COLS_BASE, ...COLS_FD];
    return [...COLS_BASE, ...COLS_DK, ...COLS_FD];
  }, [site]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => `${r.team ?? ""} ${r.opp ?? ""}`.toLowerCase().includes(needle));
  }, [rows, q]);

  const pctToNumber = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const hadPercent = /%$/.test(String(v).trim());
    const n = asNum(hadPercent ? String(v).trim().slice(0, -1) : v);
    return n;
  };

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    const sgn = dir === "asc" ? 1 : -1;
    const col =
      columns.find((c) =>
        Array.isArray(c.key) ? c.key.join("|") === (Array.isArray(key) ? key.join("|") : String(key)) : c.key === key
      ) || columns.find((c) => true);
    const t = col?.type;

    const arr = [...filtered];
    arr.sort((a, b) => {
      const avRaw = getVal(a, key);
      const bvRaw = getVal(b, key);
      let av = null,
        bv = null;
      if (t === "pct1") {
        av = pctToNumber(avRaw);
        bv = pctToNumber(bvRaw);
      } else {
        av = asNum(avRaw);
        bv = asNum(bvRaw);
      }
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
      if (
        (Array.isArray(prev.key) && Array.isArray(nextKey) && prev.key.join("|") !== nextKey.join("|")) ||
        (!Array.isArray(prev.key) && !Array.isArray(nextKey) && prev.key !== nextKey)
      ) {
        return { key: col.key, dir: "desc" };
      }
      return { key: col.key, dir: prev.dir === "desc" ? "asc" : "desc" };
    });
  };

  const heatStats = useMemo(() => {
    const stats = {};
    if (!sorted.length) return stats;
    for (const col of columns) {
      const label = col.label;
      const dir = dirForLabel(label.toLowerCase());
      if (!dir) continue;
      let min = Infinity;
      let max = -Infinity;
      for (const r of sorted) {
        let v = getVal(r, col.key);
        if (col.type === "pct1") v = String(v ?? "").replace(/%$/, "");
        const n = num(v);
        if (n == null) continue;
        if (n < min) min = n;
        if (n > max) max = n;
      }
      if (min !== Infinity && max !== -Infinity) stats[label] = { min, max, dir };
    }
    return stats;
  }, [sorted, columns]);

  const cell = "px-2 py-1 text-center";
  const header = "px-2 py-1 font-semibold text-center";
  const textSz = "text-[11px] md:text-[12px]";

  useEffect(() => {
    const handler = (e) => setSite(e.detail);
    window.addEventListener("nfl-stacks-site-change", handler);
    return () => window.removeEventListener("nfl-stacks-site-change", handler);
  }, []);

  return (
    <div className="px-3 md:px-6 py-4 md:py-5">
      <div className="flex items-start md:items-center justify-between gap-3 mb-2 flex-col md:flex-row">
        <h1 className="text-xl md:text-3xl font-extrabold mb-1 md:mb-0">NFL — Stacks</h1>

        <div className="flex flex-wrap items-center gap-2">
          {/* site toggle */}
          <div className="inline-flex items-center gap-2 rounded-xl bg-gray-100 p-1">
            {["dk", "fd", "both"].map((k) => (
              <button
                key={k}
                onClick={() => setSite(k)}
                className={`px-2.5 md:px-3 py-1.5 rounded-lg text-xs md:text-sm inline-flex items-center gap-1 ${
                  site === k ? "bg-white shadow font-semibold" : "text-gray-700"
                }`}
              >
                {k !== "both" ? <img src={SITES[k].logo} alt={SITES[k].label} className="w-4 h-4" /> : null}
                <span>{SITES[k].label}</span>
              </button>
            ))}
          </div>

          {/* view toggle */}
          <div className="inline-flex items-center gap-2 rounded-xl bg-gray-100 p-1">
            {["table", "insights", "both"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 md:px-3 py-1.5 rounded-lg text-xs md:text-sm ${
                  view === v ? "bg-white shadow font-semibold" : "text-gray-700"
                }`}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {/* palette selector (default None) */}
          <div className="flex items-center gap-1 md:gap-2">
            <label className="text-xs text-slate-600 hidden md:block">Palette</label>
            <select
              value={palette}
              onChange={(e) => setPalette(e.target.value)}
              className="h-8 rounded-lg border px-2 text-xs"
              title="Cell coloring palette"
            >
              <option value="none">None</option>
              <option value="rdylgn">Rd–Yl–Gn</option>
              <option value="blueorange">Blue–Orange</option>
            </select>
          </div>

          <input
            className="h-8 md:h-9 w-40 md:w-64 rounded-lg border border-gray-300 px-2 md:px-3 text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search team / opp…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <button
            className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs md:text-sm hover:bg-blue-700"
            onClick={() => downloadCSV(sorted, columns)}
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      {(view === "table" || view === "both") && (
        <div className="rounded-xl border bg-white shadow-sm overflow-auto">
          <table className={`w-full border-separate ${textSz}`} style={{ borderSpacing: 0 }}>
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {columns.map((c) => (
                  <th
                    key={Array.isArray(c.key) ? c.key.join("|") : c.key}
                    className={`${header} whitespace-nowrap cursor-pointer select-none ${c.w || ""} ${
                      (Array.isArray(c.key) ? c.key[0] : c.key) === "team" ? "sticky left-0 z-20 bg-gray-50" : ""
                    }`}
                    onClick={() => onSort(c)}
                    title="Click to sort"
                  >
                    <div className="inline-flex items-center gap-1">
                      <span>{c.label}</span>
                      {Array.isArray(sort.key) ? (
                        Array.isArray(c.key) && sort.key.join("|") === c.key.join("|") ? (
                          <span className="text-gray-400">{sort.dir === "desc" ? "▼" : "▲"}</span>
                        ) : (
                          <span className="text-gray-300">▲</span>
                        )
                      ) : sort.key === c.key ? (
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
                  <tr key={`${r.team}-${r.opp}-${i}`} className="odd:bg-white even:bg-gray-50">
                    {columns.map((c) => {
                      const raw = getVal(r, c.key);

                      if ((Array.isArray(c.key) ? c.key[0] : c.key) === "team") {
                        const abv = String(r.team || "").toUpperCase();
                        return (
                          <td
                            key={Array.isArray(c.key) ? c.key.join("|") : c.key}
                            className={`px-2 py-1 text-left sticky left-0 z-10 ${
                              i % 2 === 0 ? "bg-white" : "bg-gray-50"
                            } min-w-[7rem] shadow-[inset_-6px_0_6px_-6px_rgba(0,0,0,0.15)]`}
                          >
                            <div className="flex items-center gap-2">
                              <img
                                src={teamLogo(r.team)}
                                alt=""
                                className="w-4 h-4 rounded-sm object-contain"
                                onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                              />
                              <span className="whitespace-nowrap font-medium">{abv}</span>
                            </div>
                          </td>
                        );
                      }

                      const stat = heatStats[c.label];
                      let base = raw;
                      if (c.type === "pct1") base = String(base ?? "").replace(/%$/, "");
                      const n = num(base);
                      const bg = stat ? heatColor(stat.min, stat.max, n, stat.dir, palette) : null;

                      let val = raw;
                      if (c.type === "int") val = fmt.int(raw);
                      if (c.type === "smart1") val = fmt.smart1(raw);
                      if (c.type === "signed-smart1") val = fmt.signedSmart1(raw);
                      if (c.type === "num1") val = fmt.num1(raw);
                      if (c.type === "pct1") val = fmt.pct1(raw);

                      const cls = c.type === "text" ? "px-2 py-1 text-center" : `${cell} tabular-nums`;
                      return (
                        <td
                          key={Array.isArray(c.key) ? c.key.join("|") : c.key}
                          className={`${cls} whitespace-nowrap`}
                          title={String(val ?? "")}
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
      )}

      {(view === "insights" || view === "both") && !loading && !err ? (
        <StacksInsights rows={filtered} site={site} />
      ) : null}
    </div>
  );
}
