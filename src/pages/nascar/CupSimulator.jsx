import React, { useEffect, useMemo, useRef, useState } from "react";
import API_BASE from "../../utils/api";

/* =============================================================
   CUP SIMULATOR — DROP-IN FILE
   - Uses the same projections source as your optimizer
   - Adds payout preview, Monte Carlo sims, lineup & driver results
   - Lets you multi-select lineups and build a Portfolio
   - Exports CSV (plain & site IDs)
   ============================================================= */

/* ----------------------------- constants ----------------------------- */
const SOURCE = "/data/nascar/cup/latest/projections.json";
const SITE_IDS_SOURCE = "/data/nascar/cup/latest/site_ids.json";
const PAYOUTS_SOURCE = "/data/nascar/cup/latest/payouts.json"; // your percent-based master JSON

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
  },
};

/* ----------------------------- tiny utils ---------------------------- */
const clamp = (v, lo = 0, hi = 1e9) => Math.max(lo, Math.min(hi, Number(v) || 0));
const num = (v) => {
  const n = Number(String(v ?? "").toString().replace(/[, %]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const fmt0 = (n) => (Number.isFinite(n) ? n.toLocaleString() : "—");
const fmt1 = (n) => (Number.isFinite(n) ? Number(n).toFixed(1) : "—");
const fmt2 = (n) => (Number.isFinite(n) ? Number(n).toFixed(2) : "—");
const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;
const fmtROI = (v) => `${Number(v || 0) * 100 >= 0 ? "+" : ""}${Number(v || 0) * 100 .toFixed(1)}%`;

// Sticky state (localStorage)
const useStickyState = (key, init) => {
  const [v, setV] = useState(init);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setV(raw ? JSON.parse(raw) : init);
    } catch {
      setV(init);
    }
  }, [key]);
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  }, [key, v]);
  return [v, setV];
};

// Fetch JSON (no-cache)
function useJson(url) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(url, { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((j) => alive && (setData(j), setErr(null)))
      .catch((e) => alive && (setErr(e), setData(null)))
      .finally(() => alive && setLoading(false));
    return () => (alive = false);
  }, [url]);
  return { data, err, loading };
}

/* ---------------------- CSV helpers (self-contained) ---------------------- */
const escapeCSV = (s) => {
  const v = String(s ?? "");
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
const normName = (s) => String(s || "")
  .toLowerCase()
  .replace(/\u2019/g, "'")
  .replace(/\./g, "")
  .replace(/,\s*(jr|sr)\b/g, "")
  .replace(/\b(jr|sr)\b/g, "")
  .replace(/[^a-z' -]/g, "")
  .replace(/\s+/g, " ")
  .trim();
function buildSiteIdIndex(siteIdsList) {
  const idx = new Map();
  for (const r of siteIdsList || []) {
    const id = String(r.id ?? r.ID ?? r.playerId ?? r.player_id ?? r.fd_id ?? r.FD_ID ?? r.dk_id ?? r.DK_ID ?? "").trim();
    const nm0 = r.name ?? r.player ?? r.Player ?? r.displayName ?? r.Name;
    if (!id || !nm0) continue;
    const key = normName(nm0);
    if (!idx.has(key)) idx.set(key, { id, nameFromSite: String(nm0) });
  }
  return idx;
}
function detectFdPrefix(siteIdsList) {
  const counts = new Map();
  for (const r of siteIdsList || []) {
    const px = r.slateId ?? r.slate_id ?? r.groupId ?? r.group_id ?? r.lid ?? r.prefix ?? r.fd_prefix ?? null;
    if (px != null && px !== "") {
      const key = String(px);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  if (counts.size === 1) return [...counts.keys()][0];
  if (counts.size > 1) return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return null;
}
function toPlainCSV(rows) {
  const header = ["#", "Salary", "Total", "Drivers"].join(",");
  const lines = rows.map((L, i) => {
    const drivers = `"${(L.drivers || []).join(" • ")}"`;
    return [i + 1, L.salary ?? "", Number.isFinite(L.total) ? Number(L.total).toFixed(1) : "", drivers].join(",");
  });
  return [header, ...lines].join("\n");
}
function downloadPlainCSV(rows, fname = "lineups.csv") {
  const csv = toPlainCSV(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = fname; a.click();
  URL.revokeObjectURL(url);
}
function downloadSiteLineupsCSV({ lineups, site, rosterSize, siteIds, fname = "lineups_site_ids.csv" }) {
  const siteKey = site === "fd" ? "fd" : "dk";
  const list = Array.isArray(siteIds?.[siteKey]) ? siteIds[siteKey] : (siteIds?.sites?.[siteKey] ?? []);
  const idIndex = buildSiteIdIndex(list);
  const fdPrefix = siteKey === "fd" ? detectFdPrefix(list) : null;
  const header = ["#", "Salary", "Total", ...Array.from({ length: rosterSize }, (_, i) => `D${i + 1}`)].join(",");
  const lines = (lineups || []).map((L, idx) => {
    const names = Array.isArray(L.drivers) ? L.drivers : [];
    const cells = names.slice(0, rosterSize).map((name) => {
      const rec = idIndex.get(normName(name));
      if (!rec) return escapeCSV(name);
      if (siteKey === "fd") {
        const outId = fdPrefix ? `${fdPrefix}-${rec.id}` : rec.id;
        const display = rec.nameFromSite || name;
        return escapeCSV(`${outId}:${display}`);
      }
      return escapeCSV(`${name} (${rec.id})`);
    });
    while (cells.length < rosterSize) cells.push("");
    return [idx + 1, L.salary ?? "", Number.isFinite(L.total) ? Number(L.total).toFixed(1) : "", ...cells].join(",");
  });
  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = fname; a.click();
  URL.revokeObjectURL(url);
}

/* --------------------------- main component --------------------------- */
export default function CupSimulator() {
  /* sources */
  const { data: rawProjections, err: projErr, loading: loadingProj } = useJson(SOURCE);
  const { data: siteIds } = useJson(SITE_IDS_SOURCE);
  const { data: payoutTemplates } = useJson(PAYOUTS_SOURCE);

  /* site + contest controls */
  const [site, setSite] = useStickyState("cupSim.site", "dk");
  const cfg = SITES[site];
  const [contestType, setContestType] = useStickyState("cupSim.type", "gpp"); // gpp|cash|satellite
  const [entries, setEntries] = useStickyState("cupSim.entries", 20000);
  const [buyIn, setBuyIn] = useStickyState("cupSim.buyIn", 10);
  const [randomness, setRandomness] = useStickyState("cupSim.rand", 12);
  const [sims, setSims] = useStickyState("cupSim.sims", 1000);

  /* payouts */
  const [payouts, setPayouts] = useState([]); // [[place, amount]] after scaling
  const [payoutPreviewErr, setPayoutPreviewErr] = useState(null);

  /* sim outputs */
  const [lineupResults, setLineupResults] = useState([]);
  const [driverResults, setDriverResults] = useState([]);
  const [activeView, setActiveView] = useStickyState("cupSim.view", "lineups");
  const [loading, setLoading] = useState(false);

  /* selection + portfolio */
  const [selected, setSelected] = useState(new Set());
  const [portfolio, setPortfolio] = useStickyState(`cupSim.${site}.portfolio`, []);
  const lastClickedRef = useRef(null);

  /* parse projections into rows (same as optimizer semantics) */
  const rows = useMemo(() => {
    if (!rawProjections) return [];
    const arr = Array.isArray(rawProjections?.rows) ? rawProjections.rows : Array.isArray(rawProjections) ? rawProjections : [];
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
      }))
      .filter((r) => r.driver && r.salary > 0);
  }, [rawProjections, site]);

  /* --------------------------- actions --------------------------- */
  async function previewPayouts() {
    try {
      setLoading(true);
      setPayoutPreviewErr(null);
      const tpl = payoutTemplates?.[site]?.[contestType];
      if (!tpl) throw new Error("Missing payout template for selection");
      const res = await fetch(`${API_BASE}/scale_payouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: tpl, entries: Number(entries)||0, buy_in: Number(buyIn)||0 })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setPayouts(j.payouts || []);
    } catch (e) {
      setPayoutPreviewErr(String(e));
      setPayouts([]);
    } finally {
      setLoading(false);
    }
  }

  async function runMonteCarlo() {
    if (!rows.length) {
      alert("No projections loaded.");
      return;
    }
    if (!payouts.length) {
      const ok = confirm("No payout preview yet. Continue with auto-scale now?");
      if (!ok) return;
      await previewPayouts();
      if (!payouts.length) return;
    }
    setLoading(true);
    setSelected(new Set());
    setLineupResults([]);
    setDriverResults([]);
    try {
      const res = await fetch(`${API_BASE}/monte_carlo_sim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          players: rows,
          entries: Number(entries)||0,
          buy_in: Number(buyIn)||0,
          payouts,
          sims: Number(sims)||1000,
          randomness: Number(randomness)||0,
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setLineupResults((j.lineups || []).sort((a,b)=> (b.avg_roi - a.avg_roi) || (b.top1_pct - a.top1_pct)) );
      setDriverResults((j.drivers || []).sort((a,b)=> (b.avg_roi - a.avg_roi) || (b.top1_pct - a.top1_pct)) );
      setActiveView("lineups");
    } catch (e) {
      alert(`Sim failed: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  /* selection logic (checkbox + shift range) */
  function toggleRow(idx, withRange=false) {
    setSelected((cur) => {
      const n = new Set(cur);
      if (withRange && lastClickedRef.current != null) {
        const a = Math.min(lastClickedRef.current, idx);
        const b = Math.max(lastClickedRef.current, idx);
        const all = lineupResults.map((_, i) => i).slice(a, b + 1);
        const add = !n.has(idx);
        for (const i of all) { add ? n.add(i) : n.delete(i); }
      } else {
        n.has(idx) ? n.delete(idx) : n.add(idx);
      }
      lastClickedRef.current = idx;
      return n;
    });
  }
  function selectAllVisible() {
    setSelected(new Set(lineupResults.map((_, i) => i)));
  }
  function clearSelection() { setSelected(new Set()); }

  /* portfolio */
  function addSelectedToPortfolio() {
    const key = (drivers) => drivers.slice().sort().join("|");
    const existing = new Set((portfolio || []).map(p => key(p.drivers)));
    const rowsSel = lineupResults.filter((_, i) => selected.has(i));
    const toAdd = rowsSel.map((r,i) => ({ id: `${Date.now()}-${i}`, drivers: r.lineup, total: r.avg_roi, source: "sim" }))
                         .filter(p => !existing.has(key(p.drivers)));
    setPortfolio([...(portfolio || []), ...toAdd]);
    clearSelection();
  }
  function removeFromPortfolio(idx) {
    setPortfolio((P) => (P || []).filter((_, i) => i !== idx));
  }
  function exportSelectedCSV() {
    const rowsSel = lineupResults.filter((_, i) => selected.has(i)).map((r) => ({ drivers: r.lineup, salary: null, total: r.avg_roi }));
    if (!rowsSel.length) return alert("No lineups selected.");
    downloadPlainCSV(rowsSel, "selected_lineups.csv");
  }
  function exportPortfolioCSV() {
    const rowsP = (portfolio || []).map((p) => ({ drivers: p.drivers, salary: p.salary ?? "", total: p.total ?? 0 }));
    if (!rowsP.length) return alert("Portfolio is empty.");
    downloadPlainCSV(rowsP, "portfolio.csv");
  }
  function exportPortfolioIDs() {
    const rowsP = (portfolio || []).map((p) => ({ drivers: p.drivers, salary: p.salary ?? "", total: p.total ?? 0 }));
    if (!rowsP.length) return alert("Portfolio is empty.");
    downloadSiteLineupsCSV({ lineups: rowsP, site, rosterSize: cfg.roster, siteIds: siteIds || {}, fname: `portfolio_${site.toUpperCase()}_ids.csv` });
  }

  /* ------------------------------- UI -------------------------------- */
  const cell = "px-2 py-1 text-center";
  const header = "px-2 py-1 font-semibold text-center";

  return (
    <div className="px-4 md:px-6 py-5">
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-2xl md:text-3xl font-extrabold">NASCAR Cup — Contest Simulator</h1>
        <img src={cfg.logo} alt="" className="w-5 h-5 opacity-70" />
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-8 gap-2 items-end mb-3">
        <div>
          <label className="block text-[11px] text-gray-600 mb-1">Site</label>
          <select className="w-full border rounded-md px-2 py-1.5 text-sm" value={site} onChange={(e) => setSite(e.target.value)}>
            <option value="dk">DraftKings</option>
            <option value="fd">FanDuel</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-gray-600 mb-1">Contest</label>
          <select className="w-full border rounded-md px-2 py-1.5 text-sm" value={contestType} onChange={(e) => setContestType(e.target.value)}>
            <option value="gpp">GPP</option>
            <option value="cash">Cash</option>
            <option value="satellite">Satellite</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-gray-600 mb-1">Entries</label>
          <input className="w-full border rounded-md px-2 py-1.5 text-sm" type="number" value={entries} onChange={(e) => setEntries(e.target.value)} />
        </div>
        <div>
          <label className="block text-[11px] text-gray-600 mb-1">Buy-in ($)</label>
          <input className="w-full border rounded-md px-2 py-1.5 text-sm" type="number" value={buyIn} onChange={(e) => setBuyIn(e.target.value)} />
        </div>
        <div>
          <label className="block text-[11px] text-gray-600 mb-1">Randomness %</label>
          <input className="w-full border rounded-md px-2 py-1.5 text-sm" type="number" value={randomness} onChange={(e) => setRandomness(e.target.value)} />
        </div>
        <div>
          <label className="block text-[11px] text-gray-600 mb-1">Simulations</label>
          <input className="w-full border rounded-md px-2 py-1.5 text-sm" type="number" value={sims} onChange={(e) => setSims(e.target.value)} />
        </div>
        <div className="md:col-span-2 flex items-end gap-2">
          <button className="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700" onClick={previewPayouts}>Preview Payouts</button>
          <button className="px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700" onClick={runMonteCarlo}>Run Monte Carlo</button>
        </div>
      </div>

      {/* Payouts preview */}
      {payouts.length > 0 && (
        <section className="rounded-lg border bg-white p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold">Payouts Preview</h2>
            <div className="text-sm text-gray-500">{contestType.toUpperCase()} • {site.toUpperCase()}</div>
          </div>
          <div className="overflow-auto max-h-[260px]">
            <table className="min-w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
              <thead className="bg-gray-50">
                <tr>
                  <th className={header}>Place</th>
                  <th className={header}>Payout</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map(([place, amount], i) => (
                  <tr key={i} className="odd:bg-white even:bg-gray-50">
                    <td className={cell}>{place}</td>
                    <td className={cell}>{typeof amount === "number" ? `$${fmt2(amount)}` : String(amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {payoutPreviewErr && <div className="mt-2 text-xs text-red-700">{String(payoutPreviewErr)}</div>}
        </section>
      )}

      {/* Results + selection toolbar */}
      {(lineupResults.length > 0 || driverResults.length > 0) && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setActiveView("lineups")} className={`px-3 py-1 rounded ${activeView === "lineups" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}>Lineup Results</button>
            <button onClick={() => setActiveView("drivers")} className={`px-3 py-1 rounded ${activeView === "drivers" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}>Driver Results</button>
            {activeView === "lineups" && selected.size > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm text-gray-600">Selected: {selected.size}</span>
                <button className="px-2 py-1 text-sm border rounded" onClick={selectAllVisible}>Select all</button>
                <button className="px-2 py-1 text-sm border rounded" onClick={addSelectedToPortfolio}>Add to Portfolio</button>
                <button className="px-2 py-1 text-sm border rounded" onClick={exportSelectedCSV}>Export Selected (CSV)</button>
                <button className="px-2 py-1 text-sm border rounded" onClick={clearSelection}>Clear</button>
              </div>
            )}
          </div>

          {/* Main results grid: lineups table + portfolio card */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Lineups Table */}
            <section className="lg:col-span-8 rounded-lg border bg-white p-3">
              {activeView === "lineups" ? (
                <div className="overflow-auto max-h-[520px]">
                  <table className="min-w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
                    <thead className="bg-gray-50">
                      <tr>
                        <th className={header}>Sel</th>
                        <th className={header}>Lineup</th>
                        <th className={header}>Avg ROI</th>
                        <th className={header}>Cash %</th>
                        <th className={header}>Top 1%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineupResults.map((r, i) => (
                        <tr key={i} className="odd:bg-white even:bg-gray-50 hover:bg-blue-50/60">
                          <td className={cell}>
                            <input type="checkbox" checked={selected.has(i)} onChange={(e) => toggleRow(i, e.shiftKey)} />
                          </td>
                          <td className={`${cell} text-left`}>{(r.lineup || []).join(" • ")}</td>
                          <td className={cell}>{fmtROI(r.avg_roi)}</td>
                          <td className={cell}>{fmtPct(r.cash_pct)}</td>
                          <td className={cell}>{fmtPct(r.top1_pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-auto max-h-[520px]">
                  <table className="min-w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
                    <thead className="bg-gray-50">
                      <tr>
                        <th className={header}>Driver</th>
                        <th className={header}>Avg ROI</th>
                        <th className={header}>Cash %</th>
                        <th className={header}>Top 1%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {driverResults.map((r, i) => (
                        <tr key={i} className="odd:bg-white even:bg-gray-50">
                          <td className={cell}>{r.driver}</td>
                          <td className={cell}>{fmtROI(r.avg_roi)}</td>
                          <td className={cell}>{fmtPct(r.cash_pct)}</td>
                          <td className={cell}>{fmtPct(r.top1_pct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Portfolio */}
            <section className="lg:col-span-4 rounded-lg border bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-semibold">Portfolio ({portfolio?.length || 0})</h3>
                <div className="flex items-center gap-2">
                  <button className="px-2 py-1 text-sm border rounded" onClick={exportPortfolioCSV}>Export CSV</button>
                  <button className="px-2 py-1 text-sm border rounded" onClick={exportPortfolioIDs}>Export CSV (IDs)</button>
                </div>
              </div>
              {(portfolio || []).length === 0 ? (
                <div className="text-sm text-gray-500">No lineups saved yet. Select some results and click “Add to Portfolio”.</div>
              ) : (
                <div className="overflow-auto max-h-[520px]">
                  <table className="min-w-full text-[12px] border-separate" style={{ borderSpacing: 0 }}>
                    <thead className="bg-gray-50">
                      <tr>
                        <th className={header}>#</th>
                        <th className={header}>Lineup</th>
                        <th className={header}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(portfolio || []).map((p, i) => (
                        <tr key={p.id || i} className="odd:bg-white even:bg-gray-50">
                          <td className={cell}>{i + 1}</td>
                          <td className={`${cell} text-left`}>{(p.drivers || []).join(" • ")}</td>
                          <td className={cell}>
                            <button className="px-2 py-0.5 text-xs border rounded" onClick={() => removeFromPortfolio(i)}>✕ Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {loading && <div className="mt-2 text-gray-500">Working…</div>}
      {projErr && <div className="mt-2 text-red-700 text-sm">Failed to load projections: {String(projErr)}</div>}
    </div>
  );
}
