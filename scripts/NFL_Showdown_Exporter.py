# scripts/NFL_Showdown_Exporter.py
from __future__ import annotations
import json
from pathlib import Path
from typing import Any, Dict, List

# Project roots
ROOT = Path(__file__).resolve().parents[1]
SD   = ROOT / "public" / "data" / "nfl" / "showdown" / "latest"
CL   = ROOT / "public" / "data" / "nfl" / "classic"  / "latest"

# ------------------ utils ------------------
def load_json(p: Path) -> Any:
    if not p.exists():
        return []
    txt = p.read_text(encoding="utf-8-sig")
    if not txt.strip():
        return []
    j = json.loads(txt)
    return j if isinstance(j, list) else j.get("rows", j.get("data", []))

def dump_json(p: Path, rows: List[Dict[str, Any]]) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

def norm_name(s: str) -> str:
    return " ".join(str(s or "").lower()
                    .replace(".", " ").replace("’", "'")
                    .replace(",", " ").replace("-", " ")
                    .split())

def to_num(v) -> float | None:
    try:
        s = str(v).replace(",", "").replace("$", "").replace("%", "").strip()
        if s == "" or s.lower() == "nan":
            return None
        return float(s)
    except Exception:
        return None

def pct_str(v) -> str:
    """Return 'x.x%' string from value/ratio/percent-string."""
    if v is None or v == "":
        return ""
    s = str(v).strip()
    if s.endswith("%"):
        # collapse '10.4%%' -> '10.4%'
        return s.rstrip("%") + "%"
    n = to_num(s)
    if n is None:
        return ""
    if 0 <= n <= 1:
        n = n * 100.0
    return f"{n:.1f}%"

def value_points(proj, sal) -> str:
    p = to_num(proj); s = to_num(sal)
    if p is None or s is None or s == 0:
        return ""
    return f"{p / (s/1000):.1f}"

def pick(row: Dict[str, Any], keys: List[str], default="") -> Any:
    for k in keys:
        if k in row and row[k] not in ("", None):
            return row[k]
    return default

# ------------------ load inputs ------------------
# showdown
sd_proj = load_json(SD / "projections.json")
sd_qb   = load_json(SD / "qb_data.json")
sd_rb   = load_json(SD / "rb_data.json")
sd_wr   = load_json(SD / "wr_data.json")
sd_te   = load_json(SD / "te_data.json")

# classic fallbacks
cl_qb   = load_json(CL / "qb_projections.json")
cl_rb   = load_json(CL / "rb_projections.json")
cl_wr   = load_json(CL / "wr_projections.json")
cl_te   = load_json(CL / "te_projections.json")

# lookups
sd_proj_by = {norm_name(pick(r, ["player", "Player Name", "name"])): r for r in sd_proj}
cl_qb_by   = {norm_name(r.get("player")): r for r in cl_qb}
cl_rb_by   = {norm_name(r.get("player")): r for r in cl_rb}
cl_wr_by   = {norm_name(r.get("player")): r for r in cl_wr}
cl_te_by   = {norm_name(r.get("player")): r for r in cl_te}

def dk_sal(player: str) -> str:
    r = sd_proj_by.get(norm_name(player))
    return pick(r or {}, ["DK Sal","DK Flex Sal","dk_sal","dk flex sal","dk_flex_sal"], "")

def fd_sal(player: str) -> str:
    r = sd_proj_by.get(norm_name(player))
    return pick(r or {}, ["FD Sal","FD Flex Sal","fd_sal","fd flex sal","fd_flex_sal"], "")

def dk_proj(player: str) -> str:
    r = sd_proj_by.get(norm_name(player))
    return pick(r or {}, ["DK Proj","dk_proj"], "")

def fd_proj(player: str) -> str:
    r = sd_proj_by.get(norm_name(player))
    return pick(r or {}, ["FD Proj","fd_proj"], "")

def team_from_proj(player: str, fallback="") -> str:
    r = sd_proj_by.get(norm_name(player))
    return pick(r or {}, ["Team","team"], fallback)

# ------------------ builders ------------------
def build_qb() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for r in sd_qb:
        player = pick(r, ["player","Player","name"])
        if not player:
            continue

        # show team (from pos row or fallback to projections)
        team = pick(r, ["team","Team"], team_from_proj(player))

        # Salaries/Projections from showdown master
        dks = dk_sal(player); fds = fd_sal(player)
        dkp = dk_proj(player); fdp = fd_proj(player)

        # QB passing (prefer showdown pos data, else classic fallback)
        pa_yards = pick(r, ["pa_yards","Pa Yards","pass yards"])
        pa_att   = pick(r, ["pa_att","Pa Att","pass attempts","Pa Attempts"])
        pa_comp  = pick(r, ["pa_comp","Pa Comp"])
        pa_pct   = pick(r, ["pa_comp_pct","Comp%","completion%"])
        pa_td    = pick(r, ["pa_td","Pa TD"])
        q_int    = pick(r, ["int","INT"])

        if not any([pa_yards, pa_att, pa_comp, pa_pct, pa_td]):
            c = cl_qb_by.get(norm_name(player), {})
            if c:
                pa_yards = pa_yards or c.get("pa_yards","")
                pa_att   = pa_att   or c.get("pa_att","")
                pa_comp  = pa_comp  or c.get("pa_comp","")
                pa_pct   = pa_pct   or c.get("pa_comp_pct","")
                pa_td    = pa_td    or c.get("pa_td","")
                q_int    = q_int    or c.get("int","")

        # Rushing
        ru_att   = pick(r, ["ru_att","Ru Att","rush attempts","carries"])
        ypc      = pick(r, ["ypc","YPC"])
        ru_yds   = pick(r, ["ru_yards","Ru Yards","rush yards"])
        ru_td    = pick(r, ["ru_td","Ru TD","rush td"])

        # Format percents if needed
        pa_pct = pct_str(pa_pct)

        out.append({
            "player": player,
            "team": team or "",
            "dk_sal": dks, "fd_sal": fds,

            "pa_yards": pa_yards, "pa_att": pa_att, "pa_comp": pa_comp,
            "pa_comp_pct": pa_pct, "pa_td": pa_td, "int": q_int,

            "ru_att": ru_att, "ypc": ypc, "ru_yards": ru_yds, "ru_td": ru_td,

            "dk_proj": dkp, "dk_val": value_points(dkp, dks),
            "fd_proj": fdp, "fd_val": value_points(fdp, fds),
        })
    return out

def build_skill(pos: str, sd_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    cl_by = cl_rb_by if pos == "RB" else (cl_wr_by if pos == "WR" else cl_te_by)

    for r in sd_rows:
        player = pick(r, ["player","Player","name"])
        if not player:
            continue

        team = pick(r, ["team","Team"], team_from_proj(player))

        # Rushing (RB/WR)
        ru_att   = pick(r, ["ru_att","Ru Attempts","ru attempts","rush attempts","carries"])
        ypc      = pick(r, ["ypc","YPC"])
        ru_yds   = pick(r, ["ru_yards","Ru Yards","rush yards"])
        ru_td    = pick(r, ["ru_td","Ru TD"])

        # Receiving (RB/WR/TE)
        targets  = pick(r, ["targets","Targets"])
        tgt_share= pick(r, ["tgt_share","Tgt Share","target share"])
        rec      = pick(r, ["rec","Rec"])
        rec_yds  = pick(r, ["rec_yards","Rec Yards","receiving yards"])
        rec_td   = pick(r, ["rec_td","Rec TD"])

        # If showdown row is sparse, patch from classic
        if pos in ("RB","WR","TE") and not any([targets, rec, rec_yds, rec_td]):
            c = cl_by.get(norm_name(player), {})
            if c:
                targets   = targets   or c.get("targets","")
                tgt_share = tgt_share or c.get("tgt_share","")
                rec       = rec       or c.get("rec","")
                rec_yds   = rec_yds   or c.get("rec_yards","")
                rec_td    = rec_td    or c.get("rec_td","")
        if pos in ("RB","WR") and not any([ru_att, ypc, ru_yds, ru_td]):
            c = cl_by.get(norm_name(player), {})
            if c:
                ru_att = ru_att or c.get("ru_att","")
                ypc    = ypc    or c.get("ypc","")
                ru_yds = ru_yds or c.get("ru_yards","")
                ru_td  = ru_td  or c.get("ru_td","")

        # format %
        tgt_share = pct_str(tgt_share)

        dks = dk_sal(player); fds = fd_sal(player)
        dkp = dk_proj(player); fdp = fd_proj(player)

        base = {
            "player": player,
            "team": team or "",
            "dk_sal": dks, "fd_sal": fds,
            "dk_proj": dkp, "dk_val": value_points(dkp, dks),
            "fd_proj": fdp, "fd_val": value_points(fdp, fds),
        }

        if pos in ("RB","WR"):
            base.update({
                "ru_att": ru_att, "ypc": ypc, "ru_yards": ru_yds, "ru_td": ru_td,
                "targets": targets, "tgt_share": tgt_share, "rec": rec,
                "rec_yards": rec_yds, "rec_td": rec_td,
            })
        else:  # TE
            base.update({
                "targets": targets, "tgt_share": tgt_share, "rec": rec,
                "rec_yards": rec_yds, "rec_td": rec_td,
            })
        out.append(base)
    return out

# ------------------ run ------------------
def main():
    qb_out = build_qb()
    rb_out = build_skill("RB", sd_rb)
    wr_out = build_skill("WR", sd_wr)
    te_out = build_skill("TE", sd_te)

    dump_json(SD / "qb_projections.json", qb_out)
    dump_json(SD / "rb_projections.json", rb_out)
    dump_json(SD / "wr_projections.json", wr_out)
    dump_json(SD / "te_projections.json", te_out)

    print(f"OK: wrote {len(qb_out)} QB, {len(rb_out)} RB, {len(wr_out)} WR, {len(te_out)} TE rows")

if __name__ == "__main__":
    main()
