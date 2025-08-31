import React, { useMemo, useState, useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LabelList,
} from "recharts";

/* -------------------- helpers -------------------- */
const num = (v) => {
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const isNumericKey = (k) => /^\d+$/.test(String(k));
const inferDriverKey = (row) =>
  Object.keys(row || {}).find((k) => /^driver\b/i.test(k)) || "Driver";

// stable color from string
const hashColor = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  // higher contrast palette-ish HSL
  return `hsl(${h % 360} 70% 45%)`;
};

// dash pattern to help differentiate similar hues
const dashFor = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  const idx = h % 4;
  return ["", "6 4", "3 4", "2 2"][idx];
};

const niceDomain = (vals, pad = 0.02) => {
  if (!vals.length) return [0, 1];
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (lo === hi) {
    lo -= 0.1;
    hi += 0.1;
  }
  const span = hi - lo;
  return [lo - span * pad, hi + span * pad];
};

/* -------------------- custom tooltip -------------------- */
function OverlayTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  // payload contains one entry per Line (each with its dataKey value)
  const rows = payload
    .map((p) => ({
      name: p.name,
      color: p.color || p.stroke,
      value: p.value,
    }))
    .filter((r) => Number.isFinite(r.value))
    .sort((a, b) => a.value - b.value); // lower = better

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.95)",
        border: "1px solid #e5e7eb",
        boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
        padding: "8px 10px",
        borderRadius: 8,
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Lap {label}</div>
      {rows.map((r) => (
        <div
          key={r.name}
          style={{ display: "flex", alignItems: "center", gap: 8, lineHeight: 1.4 }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 10,
              background: r.color,
              display: "inline-block",
            }}
          />
          <span style={{ minWidth: 130 }}>{r.name}</span>
          <span style={{ color: "#111827", fontVariantNumeric: "tabular-nums" }}>
            {r.value.toFixed(2)} s
          </span>
        </div>
      ))}
    </div>
  );
}

/* -------------------- custom legend -------------------- */
function LegendList({ payload = [], onHover, onLeave, onToggle, pinned }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 14,
        paddingTop: 6,
      }}
    >
      {payload.map((p) => {
        const name = p.value;
        const color = p.color || p.payload?.stroke || "#555";
        const isPinned = pinned === name;
        return (
          <button
            key={name}
            onMouseEnter={() => onHover(name)}
            onMouseLeave={() => onLeave()}
            onClick={() => onToggle(name)}
            title={isPinned ? "Click to unpin" : "Click to pin highlight"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              border: `1px solid ${isPinned ? color : "#e5e7eb"}`,
              background: isPinned ? "rgba(0,0,0,0.02)" : "white",
              padding: "6px 8px",
              borderRadius: 999,
              cursor: "pointer",
              fontSize: 12,
              lineHeight: 1,
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 12,
                background: color,
                display: "inline-block",
              }}
            />
            <span>{name}</span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------- chart -------------------- */
export default function PracticeOverlayChart({ rows, driverKey: dk }) {
  const driverKey = dk || (rows?.length ? inferDriverKey(rows[0]) : "Driver");

  // Controls for excluding junk laps and overly long runs
  const [maxTime, setMaxTime] = useState(30); // seconds
  const [maxLap, setMaxLap] = useState(80); // lap number

  // highlight control
  const [hovered, setHovered] = useState(null);
  const [pinned, setPinned] = useState(null);
  const highlight = pinned || hovered || null;

  const togglePin = useCallback(
    (name) => setPinned((p) => (p === name ? null : name)),
    []
  );

  const series = useMemo(() => {
    const out = [];
    for (const r of rows || []) {
      const name = r?.[driverKey];
      if (!name) continue;

      const pts = Object.entries(r)
        .filter(([k]) => isNumericKey(k))
        .map(([k, v]) => ({ lap: Number(k), time: num(v) }))
        .filter((p) => Number.isFinite(p.time) && p.time > 0)
        .filter((p) => (!maxLap || p.lap <= maxLap) && (!maxTime || p.time <= maxTime))
        .sort((a, b) => a.lap - b.lap);

      if (pts.length >= 2)
        out.push({
          name,
          color: hashColor(name),
          dash: dashFor(name),
          data: pts,
          last: pts[pts.length - 1],
        });
    }
    return out;
  }, [rows, driverKey, maxLap, maxTime]);

  const times = useMemo(
    () => series.flatMap((s) => s.data.map((p) => p.time)),
    [series]
  );
  const yDomain = niceDomain(times);

  return (
    <div className="rounded-xl shadow bg-white p-4">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="text-sm font-semibold">
          Practice Lap Times — Overlay ({series.length} driver{series.length === 1 ? "" : "s"})
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-sm text-gray-700" htmlFor="maxLapTime">Max lap time (s):</label>
          <input id="maxLapTime"
            type="number"
            step="0.1"
            min="0"
            value={maxTime}
            onChange={(e) => setMaxTime(Number(e.target.value))}
            className="border rounded-md px-2 py-1 w-24"
          />
          <label className="text-sm text-gray-700 ml-3" htmlFor="maxLapNumber">Max lap #:</label>
          <input id="maxLapNumber"
            type="number"
            min="1"
            value={maxLap}
            onChange={(e) => setMaxLap(Number(e.target.value))}
            className="border rounded-md px-2 py-1 w-24"
          />
        </div>
      </div>

      {series.length === 0 ? (
        <div className="text-sm text-gray-600">Select drivers in the table above to plot.</div>
      ) : (
        <>
          <div style={{ width: "100%", height: 520 }}>
            <ResponsiveContainer>
              <LineChart margin={{ top: 10, right: 28, bottom: 30, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="lap"
                  allowDecimals={false}
                  domain={[0, maxLap || "dataMax"]}
                  label={{ value: "Lap Number", position: "insideBottom", offset: -5 }}
                />
                <YAxis
                  type="number"
                  dataKey="time"
                  domain={yDomain}
                  label={{ value: "Lap Time (s)", angle: -90, position: "insideLeft" }}
                />
                <Tooltip content={<OverlayTooltip />} />
                <Legend
                  verticalAlign="bottom"
                  align="center"
                  content={(props) => (
                    <LegendList
                      {...props}
                      onHover={setHovered}
                      onLeave={() => setHovered(null)}
                      onToggle={togglePin}
                      pinned={pinned}
                    />
                  )}
                />

                {series.map((s) => {
                  const faded = highlight && highlight !== s.name;
                  const strokeOpacity = faded ? 0.25 : 1;
                  const width = faded ? 2 : 3; // bolder when highlighted
                  return (
                    <Line
                      key={s.name}
                      data={s.data}
                      dataKey="time"
                      name={s.name}
                      stroke={s.color}
                      strokeOpacity={strokeOpacity}
                      strokeWidth={width}
                      strokeDasharray={s.dash}
                      dot={false}
                      isAnimationActive={false}
                      // allow hover highlight via line hover, too
                      onMouseEnter={() => setHovered(s.name)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      {/* label at the last point showing driver name */}
                      <LabelList
                        dataKey="time"
                        position="right"
                        content={({ x, y, value }) => {
                          // only place label on last point (save extra work)
                          const isLast = value === s.last.time;
                          if (!isLast || x == null || y == null) return null;
                          return (
                            <g>
                              {/* white halo for readability */}
                              <rect
                                x={x + 6}
                                y={y - 9}
                                rx={4}
                                ry={4}
                                width={Math.max(40, s.name.length * 6.5)}
                                height={18}
                                fill="rgba(255,255,255,0.9)"
                                stroke="rgba(0,0,0,0.06)"
                              />
                              <text
                                x={x + 10}
                                y={y + 4}
                                fontSize={12}
                                fill={s.color}
                                style={{ pointerEvents: "none", fontWeight: 600 }}
                              >
                                {s.name}
                              </text>
                            </g>
                          );
                        }}
                      />
                    </Line>
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Legend already rendered above via custom content */}
        </>
      )}
    </div>
  );
}