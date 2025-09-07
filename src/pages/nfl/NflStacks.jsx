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

// robust numeric parser
const asNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  let s = String(v).trim();

  // remove non-breaking/thin spaces
  s = s.replace(/\u00A0|\u2009|\u202F/g, "");

  // If it looks like a decimal comma (e.g. "1,2" or "-3,75") AND there's no dot,
  // convert comma to a decimal point.
  if (/^-?\d+,\d+$/.test(s) && !s.includes(".")) {
    s = s.replace(",", ".");
  } else {
    // Otherwise treat commas as thousands separators only (1,234 or 12,345,678)
    s = s.replace(/(\d),(?=\d{3}\b)/g, "$1");
  }

  // Strip everything except the first number (keeps leading minus and decimal point)
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};

// Detect whether a whole column looks like 0..1 fractions. If yes → scale by 100.
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

const num = (v) => {
  const n = asNum(v);
  return Number.isFinite(n) ? n : null;
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
    // If user typed "0.9" but meant % and no '%' present, we do NOT auto-scale here.
    // Raw table expects percent already; scaling is handled centrally in Insights only.
    const out = hadPercent ? n : n;
    return `${out.toFixed(1)}%`;
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

/* Presets: "Team Total" means IMPLIED total here */
const PRESETS = [
  { id: "sal_vs_total", label: "Team Sal vs Implied Total", x_dk: "dk_sal", x_fd: "fd_sal", y: "imp_tot" },
  { id: "totals", label: "Team Total vs Proj", x: "imp_tot", y_dk: "dk_total", y_fd: "fd_total" },
  { id: "proj_vs_own", label: "Team Proj vs pOWN%", x_dk: "dk_total", x_fd: "fd_total", y_dk: "dk_pct", y_fd: "fd_pct" },
  { id: "totals_own", label: "Team Total vs pOWN%", x: "imp_tot", y_dk: "dk_pct", y_fd: "fd_pct" },
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
        // scale pOWN% only if the whole column is fractional (0..1)
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
        .map((d) => ({
          x: d[xKey],
          y: d[yKey],
          team: d.team,
        }))
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
    <div className="mt-6 rounded-2xl border bg-white shadow-sm">
      <div className="p-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="font-semibold">Insights</div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="inline-flex rounded-xl bg-gray-100 p-1">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className={`px-3 py-1.5 text-sm rounded-lg ${
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
                className={`px-3 py-1.5 text-sm rounded-lg inline-flex items-center gap-2 ${
                  site === k ? "bg-white shadow font-semibold" : "text-gray-700"
                }`}
                onClick={() => {
                  // no-op here; the parent controls site and passes it down.
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

            {/* Average guide lines (blue) */}
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
export default function NflStacks() {
  const { rows, loading, err } = useJson(SOURCE);
  const [site, setSite] = useState("both");
  const [q, setQ] = useState("");

  // reset default sort when site changes (prevents weirdness when FD selected)
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

  // Percent-to-number helper for sorting
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
      let av = null, bv = null;
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

  /* styling */
  const cell = "px-2 py-1 text-center";
  const header = "px-2 py-1 font-semibold text-center";
  const textSz = "text-[12px]";

  // Keep insights DK/FD toggle in sync with the page-level toggle.
  useEffect(() => {
    const handler = (e) => setSite(e.detail);
    window.addEventListener("nfl-stacks-site-change", handler);
    return () => window.removeEventListener("nfl-stacks-site-change", handler);
  }, []);

  return (
    <div className="px-4 md:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h1 className="text-2xl md:text-3xl font-extrabold mb-0.5">NFL — Stacks</h1>

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
            placeholder="Search team / opp…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

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
                        // First column: make the TD itself sticky
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

      {/* Insights panel below the table */}
      {!loading && !err ? <StacksInsights rows={filtered} site={site} /> : null}
    </div>
  );
}
