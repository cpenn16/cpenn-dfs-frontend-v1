import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ZAxis,
} from "recharts";

/* expects /logos/nfl/XXX.png  (same as your table) */
const teamLogo = (team) => `/logos/nfl/${String(team || "").toUpperCase()}.png`;

/* parsing helpers */
const asNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const m = String(v).replace(/[, ]/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};
const asPct = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  if (s.endsWith("%")) return asNum(s.slice(0, -1));
  const n = asNum(s);
  if (n === null) return null;
  return Math.abs(n) <= 1.5 ? n * 100 : n; // 0..1 => fraction
};

/* metric definitions for x/y pickers */
const METRICS = {
  imp_tot: { label: "Implied Team Total", key: "imp_tot", fmt: (v) => (v == null ? "" : v.toFixed?.(1) ?? v) },
  dk_total: { label: "DK Total", key: "dk_total", site: "dk" },
  fd_total: { label: "FD Total", key: "fd_total", site: "fd" },
  dk_pct: { label: "DK pOWN%", key: "dk_pct", site: "dk", pct: true },
  fd_pct: { label: "FD pOWN%", key: "fd_pct", site: "fd", pct: true },
  dk_rtg: { label: "DK Rating", key: "dk_rtg", site: "dk" },
  fd_rtg: { label: "FD Rating", key: "fd_rtg", site: "fd" },
};

/* presets */
const PRESETS = [
  {
    id: "totals",
    label: "Team Total vs Site Total",
    x: "imp_tot",
    y_dk: "dk_total",
    y_fd: "fd_total",
  },
  {
    id: "totals_own",
    label: "Team Total vs pOWN%",
    x: "imp_tot",
    y_dk: "dk_pct",
    y_fd: "fd_pct",
  },
  {
    id: "rtg_own",
    label: "Rating vs pOWN%",
    x_dk: "dk_rtg",
    x_fd: "fd_rtg",
    y_dk: "dk_pct",
    y_fd: "fd_pct",
  },
];

/* custom dot: team logo */
function LogoDot({ cx, cy, payload }) {
  const abv = String(payload.team || "").toUpperCase();
  const size = 22;
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

export default function StacksInsights({ rows }) {
  const [presetId, setPresetId] = useState("totals");
  const [site, setSite] = useState("both"); // 'dk' | 'fd' | 'both'

  const preset = PRESETS.find((p) => p.id === presetId) || PRESETS[0];

  /* normalize rows → numeric fields + keep team/opp */
  const data = useMemo(() => {
    return (rows || []).map((r) => ({
      team: String(r.team || "").toUpperCase(),
      opp: String(r.opp || "").toUpperCase(),
      imp_tot: asNum(r.imp_tot),
      dk_total: asNum(r.dk_total),
      fd_total: asNum(r.fd_total),
      dk_rtg: asNum(r.dk_rtg),
      fd_rtg: asNum(r.fd_rtg),
      dk_pct: asPct(r.dk_pct),
      fd_pct: asPct(r.fd_pct),
    }));
  }, [rows]);

  /* resolve series for chosen preset */
  const series = useMemo(() => {
    const out = [];
    // DK
    if (site === "dk" || site === "both") {
      const xKey = preset.x_dk || preset.x || null;
      const yKey = preset.y_dk || null;
      if (xKey && yKey) {
        out.push({
          id: "dk",
          label: "DK",
          color: "#2b6cb0",
          points: data
            .map((d) => ({
              x: METRICS[xKey]?.pct ? asPct(d[xKey]) : asNum(d[xKey]),
              y: METRICS[yKey]?.pct ? asPct(d[yKey]) : asNum(d[yKey]),
              team: d.team,
            }))
            .filter((p) => p.x != null && p.y != null),
          xKey,
          yKey,
        });
      }
    }
    // FD
    if (site === "fd" || site === "both") {
      const xKey = preset.x_fd || preset.x || null;
      const yKey = preset.y_fd || null;
      if (xKey && yKey) {
        out.push({
          id: "fd",
          label: "FD",
          color: "#2563eb",
          points: data
            .map((d) => ({
              x: METRICS[xKey]?.pct ? asPct(d[xKey]) : asNum(d[xKey]),
              y: METRICS[yKey]?.pct ? asPct(d[yKey]) : asNum(d[yKey]),
              team: d.team,
            }))
            .filter((p) => p.x != null && p.y != null),
          xKey,
          yKey,
        });
      }
    }
    return out;
  }, [data, site, preset]);

  const xLabel =
    (preset.x_dk && site === "dk" && METRICS[preset.x_dk]?.label) ||
    (preset.x_fd && site === "fd" && METRICS[preset.x_fd]?.label) ||
    METRICS[preset.x]?.label ||
    "";
  const yLabel = site === "fd" ? METRICS[preset.y_fd]?.label : METRICS[preset.y_dk]?.label;

  return (
    <div className="mt-6 rounded-2xl border bg-white shadow-sm">
      <div className="p-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="font-semibold">Insights</div>

        <div className="flex flex-wrap gap-2 items-center">
          {/* preset switch */}
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
          {/* site switch */}
          <div className="inline-flex rounded-xl bg-gray-100 p-1">
            {["dk", "fd", "both"].map((k) => (
              <button
                key={k}
                className={`px-3 py-1.5 text-sm rounded-lg ${site === k ? "bg-white shadow font-semibold" : "text-gray-700"}`}
                onClick={() => setSite(k)}
              >
                {k.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="h-[420px] px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 30 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name={xLabel}
              tickFormatter={(v) => (typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(1)) : v)}
              label={{ value: xLabel, position: "insideBottom", offset: -20 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yLabel}
              tickFormatter={(v) => (typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(1)) : v)}
              label={{ value: yLabel, angle: -90, position: "insideLeft" }}
            />
            <Tooltip
              formatter={(val, _name, ctx) => {
                const s = ctx?.payload?.payload;
                const isPct = /%/.test(yLabel) || /%/.test(xLabel);
                const out = typeof val === "number" ? (Number.isInteger(val) ? val : val.toFixed(1)) : val;
                return out + (isPct ? "" : "");
              }}
              labelFormatter={() => ""}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend />
            {series.map((s) => (
              <Scatter
                key={s.id}
                name={s.label}
                data={s.points}
                shape={<LogoDot />}
              >
                {/* optional ZAxis for jitter/size later */}
                <ZAxis type="number" dataKey="z" range={[60, 60]} />
              </Scatter>
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
