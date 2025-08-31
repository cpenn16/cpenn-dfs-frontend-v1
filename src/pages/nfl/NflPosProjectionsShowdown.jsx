import React, { useEffect, useMemo, useState } from "react";

/* ---------------- data sources ---------------- */
const POS_TO_SRC = {
  QB: "/data/nfl/showdown/latest/qb_projections.json",
  RB: "/data/nfl/showdown/latest/rb_projections.json",
  WR: "/data/nfl/showdown/latest/wr_projections.json",
  TE: "/data/nfl/showdown/latest/te_projections.json",
};
const NAME_XWALK_URL  = "/data/nfl/showdown/latest/name_xwalk.json";
const PROJECTIONS_URL = "/data/nfl/showdown/latest/projections.json";
const teamLogo = (abbr) => (abbr ? `/logos/nfl/${abbr}.png` : "");

/* ---------------- helpers ---------------- */
const num = (v) => { const n = Number(String(v ?? "").replace(/[,%\s]/g, "")); return Number.isFinite(n) ? n : null; };
const pct = (v) => {
  if (v == null || v === "") return "";
  const s = String(v).trim();
  if (s.endsWith("%")) return s;
  const n = num(s);
  return n == null ? "" : (Math.abs(n) <= 1 ? (n*100).toFixed(1) : n.toFixed(1)) + "%";
};
const smart1 = (v) => { const n = num(v); return n == null ? "" : (Number.isInteger(n) ? String(n) : n.toFixed(1)); };
const int0 = (v) => { const n = num(v); return n == null ? "" : Math.round(n).toLocaleString(); };

const normalizeName = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’,-]/g, " ")
    .replace(/\s+(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

/* canonicalize header keys */
const canonKey = (s="") =>
  String(s)
    .replace(/\u00A0|\u202F/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[%]/g, "")
    .replace(/_/g, " ")
    .replace(/[.]/g, "")
    .replace(/\s+/g, "");

const buildKeyMap = (row) => { const m = {}; for (const [k,v] of Object.entries(row)) m[canonKey(k)] = v; return m; };
const getVal = (kmap, ...cands) => { for (const c of cands) { const v = kmap[canonKey(c)]; if (v !== undefined) return v; } return ""; };

async function fetchJson(url){
  const r = await fetch(`${url}?_=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : j?.rows ?? [];
}
function useJson(url){
  const [rows,setRows]=useState([]); const [loading,setLoading]=useState(true); const [err,setErr]=useState("");
  useEffect(()=>{ let ok=true; (async()=>{ setLoading(true); setErr(""); try{ const data=await fetchJson(url); if(ok) setRows(data);} catch(e){ if(ok) setErr(String(e)); } finally{ if(ok) setLoading(false);} })(); return ()=>{ok=false}; },[url]);
  return { rows,loading,err };
}

/* ---------------- column sets (match your sheet labels) ---------------- */
const COLS_COMMON = [
  { id:"player", label:"Player", type:"text",  w:"min-w-[12rem] text-left" },
  { id:"team",   label:"Team",   type:"team",  w:"min-w-[4.5rem]" },
  { id:"dk_sal", label:"DK Sal", type:"money", w:"min-w-[4.25rem]" },
  { id:"fd_sal", label:"FD Sal", type:"money", w:"min-w-[4.25rem]" },
];

const COLS_QB = [
  ...COLS_COMMON,
  { id:"pa_yards", label:"Pa Yards", type:"num1" },
  { id:"pa_att",   label:"Pa Att",   type:"num1" },
  { id:"pa_comp",  label:"Pa Comp",  type:"num1" },
  { id:"pa_pct",   label:"Comp%",    type:"pct"  },
  { id:"pa_td",    label:"Pa TD",    type:"num1" },
  { id:"int",      label:"INT",      type:"num1" },
  { id:"ru_att",   label:"Ru Att",   type:"num1" },
  { id:"ypc",      label:"YPC",      type:"num1" },
  { id:"ru_yds",   label:"Ru Yds",   type:"num1" },
  { id:"ru_td",    label:"Ru TD",    type:"num1" },
  { id:"dk_proj",  label:"DK Proj",  type:"num1" },
  { id:"dk_val",   label:"DK Val",   type:"num1" },
  { id:"dk_pown",  label:"DK pOWN%", type:"pct"  },
  { id:"fd_proj",  label:"FD Proj",  type:"num1" },
  { id:"fd_val",   label:"FD Val",   type:"num1" },
  { id:"fd_pown",  label:"FD pOWN%", type:"pct"  },
];

const COLS_RB = [
  ...COLS_COMMON,
  { id:"ru_att",   label:"Ru Attempts", type:"num1" },
  { id:"ypc",      label:"YPC",         type:"num1" },
  { id:"ru_yds",   label:"Ru Yards",    type:"num1" },
  { id:"ru_td",    label:"Ru TD",       type:"num1" },
  { id:"targets",  label:"Targets",     type:"num1" },
  { id:"tgt_share",label:"Tgt Share",   type:"pct"  },
  { id:"rec",      label:"Rec",         type:"num1" },
  { id:"rec_yds",  label:"Rec Yards",   type:"num1" },
  { id:"rec_td",   label:"Rec TD",      type:"num1" },
  { id:"dk_proj",  label:"DK Proj",     type:"num1" },
  { id:"dk_val",   label:"DK Val",      type:"num1" },
  { id:"dk_pown",  label:"DK pOWN%",    type:"pct"  },
  { id:"fd_proj",  label:"FD Proj",     type:"num1" },
  { id:"fd_val",   label:"FD Val",      type:"num1" },
  { id:"fd_pown",  label:"FD pOWN%",    type:"pct"  },
];

const COLS_TE = [
  ...COLS_COMMON,
  { id:"targets",  label:"Targets",   type:"num1" },
  { id:"tgt_share",label:"Tgt Share", type:"pct"  },
  { id:"rec",      label:"Rec",       type:"num1" },
  { id:"rec_yds",  label:"Rec Yards", type:"num1" },
  { id:"rec_td",   label:"Rec TD",    type:"num1" },
  { id:"dk_proj",  label:"DK Proj",   type:"num1" },
  { id:"dk_val",   label:"DK Val",    type:"num1" },
  { id:"dk_pown",  label:"DK pOWN%",  type:"pct"  },
  { id:"fd_proj",  label:"FD Proj",   type:"num1" },
  { id:"fd_val",   label:"FD Val",    type:"num1" },
  { id:"fd_pown",  label:"FD pOWN%",  type:"pct"  },
];

const COLS_WR = COLS_RB;
const POS_TO_COLS = { QB: COLS_QB, RB: COLS_RB, WR: COLS_WR, TE: COLS_TE };

/* ---------------- CSV ---------------- */
const escapeCSV = (s) => /[",\r\n]/.test(String(s ?? "")) ? `"${String(s ?? "").replace(/"/g,'""')}"` : String(s ?? "");
const formatVal = (type, raw) => (type==="money" ? int0(raw) : type==="pct" ? pct(raw) : type==="num1" ? smart1(raw) : (raw ?? ""));
function downloadCSV(rows, cols, fname){
  const header = cols.map(c=>c.label).join(",");
  const body = rows.map(r => cols.map(c => escapeCSV(formatVal(c.type, r[c.id]))).join(",")).join("\n");
  const blob = new Blob([header + "\n" + body], { type:"text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=fname; a.click(); URL.revokeObjectURL(url);
}

/* ---------------- component ---------------- */
export default function NflPosProjections({ pos="QB" }){
  const src = POS_TO_SRC[pos] || POS_TO_SRC.QB;

  const { rows: rawRows, loading, err } = useJson(src);

  // name→team backfill (xwalk + all-projections)
  const [nameToTeam, setNameToTeam] = useState({});
  useEffect(()=>{ (async()=>{
    try{
      const [xw, all] = await Promise.all([
        fetchJson(NAME_XWALK_URL).catch(()=>[]),
        fetchJson(PROJECTIONS_URL).catch(()=>[]),
      ]);
      const m = {};
      for(const r of xw){
        const n = r.player ?? r["Player Name"];
        const t = r.team ?? r["Team"];
        if(n && t) m[normalizeName(n)] = String(t).toUpperCase();
      }
      for(const r of all){
        const n = r.player ?? r["Player Name"];
        const t = r.team ?? r["Team"];
        if(n && t && !m[normalizeName(n)]) m[normalizeName(n)] = String(t).toUpperCase();
      }
      setNameToTeam(m);
    }catch{ setNameToTeam({}); }
  })(); },[]);

  // normalize each row to a stable shape
  const cols = POS_TO_COLS[pos] || POS_TO_COLS.QB;

  const rows = useMemo(()=>rawRows.map((row)=>{
    const k = buildKeyMap(row);

    // Player
    const player = (getVal(k,
      "player","player name","name",
      "qb","rb","rb1","wr","wr1","te","te1"
    ) || "").toString().trim();

    // Team (backfill from xwalk if missing)
    let team  = (getVal(k, "team","teamabbrev") || "").toString().trim().toUpperCase();
    if(!team && player){
      const t = nameToTeam[normalizeName(player)];
      if(t) team = t;
    }

    // salaries
    const dk_sal = getVal(k, "dk sal","dk_sal","dk\u00a0sal");
    const fd_sal = getVal(k, "fd sal","fd_sal","fd\u00a0sal");

    // passing
    const pa_yards = getVal(k, "pa yards","pass yards","pa_yards");
    const pa_att   = getVal(k, "pa att","pass attempts","pa attempts","pa_att");
    const pa_comp  = getVal(k, "pa comp","pass comp","pa_comp");
    // Comp%: prefer the explicit percentage field
    const pa_pct   = getVal(k, "pa_comp_pct","comp%","completion%","pass comp%","pa comp%");
    const pa_td    = getVal(k, "pa td","pa_td");
    const int      = getVal(k, "int");

    // rushing / receiving
    const ru_att   = getVal(k,
      "ru_att","ru attempts","ru\u00A0attempts","ru att","rush attempts","rush att","rushing attempts"
    );
    const ypc      = getVal(k, "ypc");
    const ru_yds   = getVal(k, "ru yards","ru_yards","ru_yds","rush yards");
    const ru_td    = getVal(k, "ru td","ru_td","rush td");

    const targets  = getVal(k, "targets");
    const tgt_share= getVal(k, "tgt share","target share","tgt_share");
    const rec      = getVal(k, "rec");
    const rec_yds  = getVal(k, "rec yards","rec\u00A0yards","rec_yards","rec_yds","receiving yards","rec yds");
    const rec_td   = getVal(k, "rec td","rec_td");

    // DFS site stats
    const dk_proj  = getVal(k, "dk proj","dk_proj","dk\u00a0proj");
    const dk_val   = getVal(k, "dk val","dk_val","dk\u00a0val");
    const dk_pown  = getVal(k, "dk pown%","dk pown","dk_pown","dk pown %","dk_pown_pct","dk own%","dk\u00a0own%");
    const fd_proj  = getVal(k, "fd proj","fd_proj","fd\u00a0proj");
    const fd_val   = getVal(k, "fd val","fd_val","fd\u00a0val");
    const fd_pown  = getVal(k, "fd pown%","fd pown","fd_pown","fd pown %","fd_pown_pct","fd own%","fd\u00a0own%");

    return {
      player, team, dk_sal, fd_sal,
      pa_yards, pa_att, pa_comp, pa_pct, pa_td, int,
      ru_att, ypc, ru_yds, ru_td,
      targets, tgt_share, rec, rec_yds, rec_td,
      dk_proj, dk_val, dk_pown, fd_proj, fd_val, fd_pown
    };
  }),[rawRows, nameToTeam, pos]);

  // search/sort
  const [q,setQ]=useState("");
  const filtered = useMemo(()=>{
    const n=q.trim().toLowerCase(); if(!n) return rows;
    return rows.filter(r=>`${r.player} ${r.team}`.toLowerCase().includes(n));
  },[rows,q]);

  const [sort,setSort]=useState({ key:"dk_proj", dir:"desc" });
  const sorted = useMemo(()=>{
    const {key,dir}=sort, sgn=dir==="asc"?1:-1; const out=[...filtered];
    out.sort((a,b)=>{
      const isPct = key.endsWith("pown") || key==="pa_pct" || key==="tgt_share";
      const av = isPct ? num(String(a[key]).replace("%","")) : num(a[key]);
      const bv = isPct ? num(String(b[key]).replace("%","")) : num(b[key]);
      const aa = av==null ? -Infinity : av; const bb = bv==null ? -Infinity : bv;
      return (aa-bb)*sgn;
    });
    return out;
  },[filtered,sort]);
  const onSort = (col) => setSort(prev => prev.key===col.id ? { key:col.id, dir: prev.dir==="desc"?"asc":"desc"} : { key:col.id, dir:"desc" });

  // COMPACT STYLE
  const cell="px-3 py-1 text-center";
  const header="px-3 py-1 font-semibold text-center";
  const small="text-[12px] md:text-[13px]";

  return (
    <div className="px-4 md:px-6 py-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h1 className="text-xl md:text-2xl font-extrabold mb-0.5">NFL — {pos} Projections</h1>
        <div className="flex items-center gap-2">
          <input className="h-9 w-64 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                 placeholder="Search player / team…" value={q} onChange={(e)=>setQ(e.target.value)} />
          <button className="ml-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
                  onClick={()=>downloadCSV(sorted, cols, `nfl_${pos.toLowerCase()}_projections.csv`)}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-auto">
        <table className={`w-full border-separate ${small}`} style={{ borderSpacing:0 }}>
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              {cols.map(c=>(
                <th key={c.id} className={`${header} whitespace-nowrap cursor-pointer select-none ${c.w||""}`}
                    title="Click to sort" onClick={()=>onSort(c)}>
                  <div className="inline-flex items-center gap-1">
                    <span>{c.label}</span>
                    <span className="text-gray-400">{sort.key===c.id ? (sort.dir==="desc"?"▼":"▲") : "▲"}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className={`${cell} text-gray-500`} colSpan={cols.length}>Loading…</td></tr>}
            {err && <tr><td className={`${cell} text-red-600`} colSpan={cols.length}>Failed to load: {err}</td></tr>}
            {!loading && !err && sorted.map((r,i)=>(
              <tr key={`${r.player||i}-${i}`} className="odd:bg-white even:bg-gray-50">
                {cols.map(c=>{
                  if(c.type==="team"){
                    const abbr=String(r.team||"").toUpperCase();
                    return (
                      <td key={c.id} className={`${cell} whitespace-nowrap`}>
                        <div className="inline-flex items-center gap-2 justify-center">
                          {abbr && <img src={teamLogo(abbr)} alt={abbr} className="h-4 w-4 object-contain" />}
                          <span>{abbr}</span>
                        </div>
                      </td>
                    );
                  }
                  let val=r[c.id] ?? "";
                  if(c.type==="money") val=int0(val);
                  else if(c.type==="pct") val=pct(val);
                  else if(c.type==="num1") val=smart1(val);
                  const left = c.id==="player";
                  return <td key={c.id} className={`${cell} ${left?"text-left":"text-center"} tabular-nums whitespace-nowrap`} title={String(val)}>{val}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
