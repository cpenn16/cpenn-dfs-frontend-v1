import React, { useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";

/** Tiny helpers */
const num = (v) => {
  if (v === null || v === undefined) return NaN;
  const n = Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const numericColName = (c) => /^\d+$/.test(String(c));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** Moving average (window must be odd: 3,5,7…) */
function smooth(arr, key, win = 3) {
  if (!Array.isArray(arr) || win <= 1) return arr;
  const half = Math.floor(win / 2);
  const out = arr.map((p, i) => {
    let sum = 0, cnt = 0;
    for (let k = i - half; k <= i + half; k++) {
      if (k >= 0 && k < arr.length) {
        const v = num(arr[k][key]);
        if (Number.isFinite(v)) { sum += v; cnt++; }
      }
    }
    return { ...p, [key]: cnt ? sum / cnt : p[key] };
  });
  return out;
}

/** Basic distinct palette that stays readable on white */
const PALETTE = [
  "#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c", "#0891b2",
  "#7c3aed", "#059669", "#e11d48", "#3b82f6", "#0ea5e9", "#f59e0b",
  "#10b981", "#ef4444", "#8b5cf6",
];

/**
 * PracticeOverlayChart
 * Props:
 *  - rows: array of selected driver rows (each row has lap columns "1","2",…)
 *  - driverKey: column name for driver (e.g., "Driver_1")
 *  - maxLap: default X max (e.g., 100)
 *  - maxLapTime: default Y max cap (e.g., 40)
 */
export default function PracticeOverlayChart({
  rows = [],
  driverKey = "Driver_1",
  maxLap = 100,
  maxLapTime = 40,
}) {
  /** ---------- Controls (zoom / focus) ---------- */
  const [height, setHeight] = useState(360);               // px
  const [xMax, setXMax] = useState(maxLap || 100);         // laps
  const [yMax, setYMax] = useState(maxLapTime || 40);      // sec cap
  const [maWin, setMaWin] = useState(1);                   // 1 = off, 3,5 on
  const [normalize, setNormalize] = useState(false);

  const reset = () => {
    setHeight(360);
    setXMax(maxLap || 100);
    setYMax(maxLapTime || 40);
    setMaWin(1);
    setNormalize(false);
  };

  /** ---------- Transform input rows → series ---------- */
  const series = useMemo(() => {
    return rows.map((r, idx) => {
      const name = r?.[driverKey] ?? `Driver ${idx + 1}`;
      // Collect (lap, time) pairs from numeric lap columns
      const laps = Object.entries(r || {})
        .filter(([k, v]) => numericColName(k) && Number(k) >= 1)
        .map(([k, v]) => ({ lap: Number(k), t: num(v) }))
        .filter((p) => Number.isFinite(p.t))
        .sort((a, b) => a.lap - b.lap);

      // Optional normalize by driver's best time (delta vs min)
      let adj = laps;
      if (normalize && laps.length) {
        const best = Math.min(...laps.map((p) => p.t));
        adj = laps.map((p) => ({ ...p, t: p.t - best }));
      }

      // Optional smoothing
      const smoothed = maWin > 1 ? smooth(adj, "t", maWin) : adj;

      // Trim by xMax
      const trimmed = smoothed.filter((p) => p.lap <= xMax);

      return {
        name,
        color: PALETTE[idx % PALETTE.length],
        data: trimmed,
      };
    });
  }, [rows, driverKey, xMax, maWin, normalize]);

  /** Build a unified dataset so each X tick has values per series */
  const chartData = useMemo(() => {
    const maxLapSeen = Math.max(
      xMax,
      ...series.map((s) => (s.data.length ? s.data[s.data.length - 1].lap : 0))
    );
    const map = new Map(); // lap -> object
    for (let L = 1; L <= maxLapSeen; L++) map.set(L, { lap: L });

    series.forEach((s, idx) => {
      s.data.forEach(({ lap, t }) => {
        const row = map.get(lap);
        row[`y${idx}`] = t;
      });
    });

    return [...map.values()].filter((row) => row.lap <= xMax);
  }, [series, xMax]);

  /** Determine y-domain with cap */
  const yDomain = useMemo(() => {
    // When normalized, show a tight domain that still respects cap
    if (normalize) {
      let maxVal = 0;
      series.forEach((s, idx) => {
        s.data.forEach(({ t }) => { if (Number.isFinite(t)) maxVal = Math.max(maxVal, t); });
      });
      return [0, clamp(Math.ceil(maxVal * 10) / 10, 2, yMax)];
    }
    // Non-normalized: start a bit under min (or 0 if that makes more sense)
    let minV = Infinity, maxV = -Infinity;
    series.forEach((s) => {
      s.data.forEach(({ t }) => {
        if (Number.isFinite(t)) {
          minV = Math.min(minV, t);
          maxV = Math.max(maxV, t);
        }
      });
    });
    if (!(minV < Infinity)) return [0, yMax];
    const lo = Math.max(0, Math.floor((minV - 0.3) * 10) / 10);
    const hi = Math.min(yMax, Math.ceil((maxV + 0.2) * 10) / 10);
    return [lo, hi];
  }, [series, yMax, normalize]);

  /** ---------- Export PNG (serialize the SVG) ---------- */
  const svgRef = useRef(null);
  const downloadPNG = () => {
    // Recharts renders a single <svg> inside the container
    const svg = svgRef.current?.querySelector("svg");
    if (!svg) return;

    const s = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([s], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const r = svg.getBoundingClientRect();
      canvas.width = Math.max(800, Math.floor(r.width));
      canvas.height = Math.max(300, Math.floor(r.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      canvas.toBlob((png) => {
        if (!png) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(png);
        a.download = "practice_overlay.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
    };
    img.src = url;
  };

  return (
    <section className="rounded-xl border bg-white shadow-sm p-3">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center mb-3">
        <div className="text-sm font-semibold">Overlay Controls</div>

        <label className="flex items-center gap-2 text-xs">
          Height
          <input
            type="range" min="200" max="520" step="10"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
          />
          <span className="tabular-nums w-10 text-right">{height}px</span>
        </label>

        <label className="flex items-center gap-2 text-xs">
          X max lap
          <input
            type="range" min="10" max="200" step="1"
            value={xMax}
            onChange={(e) => setXMax(Number(e.target.value))}
          />
          <span className="tabular-nums w-8 text-right">{xMax}</span>
        </label>

        <label className="flex items-center gap-2 text-xs">
          Y cap (s)
          <input
            type="range" min="20" max="60" step="0.5"
            value={yMax}
            onChange={(e) => setYMax(Number(e.target.value))}
          />
          <span className="tabular-nums w-10 text-right">{yMax.toFixed(1)}</span>
        </label>

        <label className="flex items-center gap-2 text-xs">
          Smooth
          <select
            className="border rounded px-2 py-1 text-xs"
            value={maWin}
            onChange={(e) => setMaWin(Number(e.target.value))}
          >
            <option value={1}>Off</option>
            <option value={3}>MA(3)</option>
            <option value={5}>MA(5)</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} />
          Normalize (Δ vs best)
        </label>

        <button
          onClick={reset}
          className="ml-auto px-3 py-1.5 text-xs rounded-md border bg-white hover:bg-gray-50"
        >
          Reset
        </button>
        <button
          onClick={downloadPNG}
          className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          Export PNG
        </button>
      </div>

      {/* Legend */}
      {!!rows.length && (
        <div className="flex flex-wrap gap-3 mb-2">
          {rows.map((r, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
              />
              <span className="text-gray-800">{r?.[driverKey] ?? `Driver ${idx + 1}`}</span>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <div ref={svgRef} style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 16, bottom: 10, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="lap"
              allowDecimals={false}
              type="number"
              domain={[1, xMax]}
              tickCount={Math.min(10, xMax)}
              label={{ value: "Lap", position: "insideBottom", offset: -6 }}
            />
            <YAxis
              type="number"
              domain={yDomain}
              tickCount={8}
              label={{
                value: normalize ? "Δ Time vs Best (s)" : "Lap Time (s)",
                angle: -90,
                position: "insideLeft",
                offset: 10,
              }}
            />
            <Tooltip
              formatter={(v) => (Number.isFinite(v) ? Number(v).toFixed(3) + " s" : "")}
              labelFormatter={(l) => `Lap ${l}`}
            />
            {!normalize && (
              <ReferenceLine y={yMax} stroke="#ef4444" strokeDasharray="4 4" label={{ value: `Cap ${yMax.toFixed(1)}s`, fill: "#ef4444", fontSize: 11 }} />
            )}

            {series.map((s, idx) => (
              <Line
                key={s.name}
                type={maWin > 1 ? "monotone" : "linear"}
                dataKey={`y${idx}`}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {!rows.length && (
        <div className="text-xs text-gray-500 mt-2">
          Select drivers in the table to plot them here.
        </div>
      )}
    </section>
  );
}
