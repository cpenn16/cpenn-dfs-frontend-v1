#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
MLB_Exporter.py  (JSON-only)
----------------------------
Exports MLB workbook tabs to JSON and parses the MLB Dashboard by yellow header panels.

Overrides:
  --xlsm   "C:\\path\\to\\MLB Slate.xlsm"
  --config "...\mlb_classic.json"
  --out    "...\public\\data\\mlb\\latest"
"""

import argparse
import json
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime, date, time
from decimal import Decimal

import pandas as pd
from openpyxl import load_workbook
from openpyxl.worksheet.worksheet import Worksheet

# ------------------------ ROOT / DEFAULT PATHS ------------------------

THIS = Path(__file__).resolve()
ROOT = THIS.parents[1]  # repo root (expected to include /public)

DEFAULT_XLSM = r"C:\Users\cpenn\Dropbox\Sports Models\MLB\MLB September 2nd.xlsm"
DEFAULT_CONFIG = str(ROOT / "scripts" / "configs" / "mlb_classic.json")
DEFAULT_OUT = str(ROOT / "public" / "data" / "mlb" / "latest")

# ------------------------ BUILT-IN CONFIG FALLBACK ------------------------

SHEETS_CONFIG: List[Dict[str, Any]] = [
    {
        "sheet": "Pitcher Projections",
        "header_row": 2,
        "data_start_row": 3,
        "usecols": "A:AZ",
        "filters": [{"column": "Player", "op": "nonempty"}],
        "keep_columns": None,
        "outfile": "pitcher_projections"
    },
    {
        "sheet": "Batter Projections",
        "header_row": 2,
        "data_start_row": 3,
        "usecols": "A:AZ",
        "filters": [{"column": "Player", "op": "nonempty"}],
        "keep_columns": None,
        "outfile": "batter_projections"
    },
    {
        "sheet": "Top Stacks",
        "header_row": 2,
        "data_start_row": 3,
        "usecols": "A:AZ",
        "filters": [{"column": "Team", "op": "nonempty"}],
        "keep_columns": None,
        "outfile": "stacks"
    },
    {
        "sheet": "Pitcher Data",
        "header_row": 2,
        "data_start_row": 3,
        "usecols": "A:AZ",
        "filters": [{"column": "Player", "op": "nonempty"}],
        "keep_columns": None,
        "outfile": "pitcher_data"
    },
    {
        "sheet": "Batters Data",
        "header_row": 2,
        "data_start_row": 3,
        "usecols": "A:AZ",
        "filters": [{"column": "Player", "op": "nonempty"}],
        "keep_columns": None,
        "outfile": "batter_data"
    },
]

DASHBOARD_SHEET_NAME = "MLB Dashboard"   # yellow panels live here

# Common Excel yellow fills used on your headers
YELLOW_FILLS = {
    "FFFFE699",
    "FFFFF2CC",
    "FFFFFF00",
}

GAME_TITLE_RE = re.compile(r"^[A-Z]{2,3}\s*@\s*[A-Z]{2,3}$")

# ------------------------ UTILITIES ------------------------

def ensure_outdir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path

def _make_unique_columns(cols):
    """Ensure DataFrame columns are unique while preserving order."""
    seen = {}
    out = []
    for c in cols:
        base = "" if c is None else str(c)
        if base not in seen:
            seen[base] = 1
            out.append(base)
        else:
            seen[base] += 1
            out.append(f"{base}__{seen[base]}")
    return out

def df_apply_filters(df: pd.DataFrame, filters: List[Dict[str, str]]) -> pd.DataFrame:
    if not filters:
        return df
    keep = df.copy()
    for f in filters:
        col = f.get("column")
        op = f.get("op", "nonempty")
        if col not in keep.columns:
            continue
        if op == "nonempty":
            keep = keep[keep[col].astype(str).str.strip().ne("").fillna(False)]
        elif op == "nonzero":
            keep = keep[pd.to_numeric(keep[col], errors="coerce").fillna(0) != 0]
    return keep

def export_df_json_only(df: pd.DataFrame, out_dir: Path, name: str) -> None:
    out_json = out_dir / f"{name}.json"
    out_json.write_text(df.to_json(orient="records", force_ascii=False), encoding="utf-8")

def read_table(xlsx_path: Path, sheet: str, header_row: int, data_start_row: int, usecols: Optional[str]) -> pd.DataFrame:
    df_raw = pd.read_excel(
        xlsx_path,
        sheet_name=sheet,
        header=None,
        engine="openpyxl",
        usecols=usecols
    )
    header_idx = header_row - 1
    data_idx = data_start_row - 1

    headers = df_raw.iloc[header_idx].tolist()
    body = df_raw.iloc[data_idx:].reset_index(drop=True)

    headers = _make_unique_columns(headers)
    body.columns = headers

    body = body.dropna(how="all")
    body = body.dropna(axis=1, how="all")
    return body

# ------------------------ PANEL PARSING (YELLOW BARS) ------------------------

def parse_yellow_panels(xlsx_path: Path, sheet_name: str, yellow_fills: Optional[set] = None) -> List[Dict[str, Any]]:
    """Find yellow header rows and return their data blocks (first row under header is table header)."""
    fills_rgb = set(v.upper() for v in (yellow_fills or YELLOW_FILLS))
    wb = load_workbook(xlsx_path, data_only=True)
    if sheet_name not in wb.sheetnames:
        return []

    ws: Worksheet = wb[sheet_name]
    max_row, max_col = ws.max_row, ws.max_column

    def cell_is_header_like(cell) -> bool:
        try:
            fill = cell.fill
            if not fill or fill.patternType is None:
                return False
            if str(fill.patternType).lower() != "solid":
                return False

            rgb = getattr(fill.fgColor, "rgb", None)
            if rgb and str(rgb).upper() in fills_rgb:
                return True

            start_rgb = getattr(fill.start_color, "rgb", None)
            if start_rgb and str(start_rgb).upper() in fills_rgb:
                return True

            if (getattr(fill.fgColor, "type", None) in ("theme", "indexed") or
                getattr(fill.start_color, "type", None) in ("theme", "indexed")):
                if (getattr(fill.fgColor, "rgb", None) not in (None, "00000000") or
                    getattr(fill.start_color, "rgb", None) not in (None, "00000000")):
                    return True

            return False
        except Exception:
            return False

    yellow_rows = []
    for r in range(1, max_row + 1):
        if any(cell_is_header_like(ws.cell(row=r, column=c)) for c in range(1, max_col + 1)):
            yellow_rows.append(r)

    if not yellow_rows:
        for r in range(1, max_row + 1):
            first_text = None
            for c in range(1, max_col + 1):
                v = ws.cell(row=r, column=c).value
                if v not in (None, ""):
                    first_text = str(v).strip()
                    break
            if first_text and GAME_TITLE_RE.match(first_text):
                yellow_rows.append(r)

    yellow_rows = sorted(set(yellow_rows))
    panels: List[Dict[str, Any]] = []

    for i, start_r in enumerate(yellow_rows):
        end_r = (yellow_rows[i + 1] - 1) if i + 1 < len(yellow_rows) else max_row

        title = None
        for c in range(1, max_col + 1):
            v = ws.cell(row=start_r, column=c).value
            if v not in (None, ""):
                title = str(v).strip()
                break

        rows = []
        r = start_r + 1
        while r <= end_r:
            vals = [ws.cell(row=r, column=c).value for c in range(1, max_col + 1)]
            if all(v in (None, "", " ") for v in vals):
                break
            rows.append(vals)
            r += 1

        if rows:
            last_nonempty = 0
            for rr in rows:
                for ci, vv in enumerate(rr, start=1):
                    if vv not in (None, "", " "):
                        last_nonempty = max(last_nonempty, ci)
            rows = [rr[:last_nonempty] for rr in rows]

        panels.append({
            "title": title or f"Panel @ row {start_r}",
            "header_row": start_r,
            "data_start_row": start_r + 1,
            "range_rows": [start_r, (r - 1) if rows else start_r],
            "rows": rows
        })

    return panels

# ------------------------ JSON-SAFE CONVERSION ------------------------

def _jsonify_value(v):
    """Make Excel/py types JSON safe with desired formats."""
    if v is None or v == "":
        return None
    if isinstance(v, pd.Timestamp):
        return v.to_pydatetime().isoformat()
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, time):
        s = v.strftime("%I:%M:%S %p")   # '07:40:00 PM'
        return s.lstrip("0")            # '7:40:00 PM'
    if isinstance(v, Decimal):
        return float(v)
    return v

def _rows_to_dicts(rows: List[List[Any]]) -> List[Dict[str, Any]]:
    """First row is headers; rest are records (JSON-safe)."""
    if not rows:
        return []
    headers = [str(h).strip() if h is not None else "" for h in rows[0]]
    headers = _make_unique_columns(headers)
    out: List[Dict[str, Any]] = []
    for r in rows[1:]:
        obj = {}
        for i, h in enumerate(headers):
            obj[h] = _jsonify_value(r[i] if i < len(r) else None)
        if any(v not in (None, "", " ") for v in obj.values()):
            out.append(obj)
    return out

# ------------------------ CHEAT SHEET BUILDER ------------------------

NORMALIZE_TITLES = {
    "PITCHER": "Pitcher",
    "C": "C",
    "1B": "1B",
    "2B": "2B",
    "3B": "3B",
    "SS": "SS",
    "OF": "OF",
    "CASH CORE": "Cash Core",
    "TOP STACKS": "Top Stacks",
}

def compose_cheat_sheet_from_panels(panels: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build cheat_sheet.json structure that mirrors your screenshot:
      sections keyed by: Pitcher, C, 1B, 2B, 3B, SS, OF (merged), Cash Core, Top Stacks
    """
    out: Dict[str, Any] = {}
    for p in panels:
        title_raw = str(p.get("title") or "").strip()
        key = NORMALIZE_TITLES.get(title_raw.upper())
        if not key:
            continue
        recs = _rows_to_dicts(p.get("rows") or [])
        if not recs:
            continue
        if key == "OF":
            out.setdefault("OF", [])
            out["OF"].extend(recs)
        else:
            out[key] = recs
    return out

# ------------------------ MAIN ------------------------

def load_config(path_str: Optional[str]) -> Optional[dict]:
    if not path_str:
        return None
    p = Path(path_str)
    if not p.exists():
        print(f"⚠️  Config not found: {p}")
        return None
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsm", type=str, default=DEFAULT_XLSM, help="Path to MLB .xlsx/.xlsm workbook")
    ap.add_argument("--config", type=str, default=DEFAULT_CONFIG, help="Path to mlb_classic.json")
    ap.add_argument("--out", type=str, default=DEFAULT_OUT, help="Output directory (JSON only)")
    args = ap.parse_args()

    xlsx_path = Path(args.xlsm).expanduser()
    out_dir = ensure_outdir(Path(args.out))

    cfg = load_config(args.config)

    sheets_config = SHEETS_CONFIG
    dashboard_sheet_name = DASHBOARD_SHEET_NAME
    yellow_fills = set(YELLOW_FILLS)

    if cfg:
        if isinstance(cfg.get("tasks"), list):
            sheets_config = cfg["tasks"]
        if isinstance(cfg.get("matchups"), dict):
            m = cfg["matchups"]
            sheet_field = m.get("sheet", dashboard_sheet_name)
            if isinstance(sheet_field, list) and sheet_field:
                dashboard_sheet_name = sheet_field[0]
            elif isinstance(sheet_field, str):
                dashboard_sheet_name = sheet_field
            ylist = m.get("header_yellow_rgb")
            if isinstance(ylist, list) and ylist:
                yellow_fills = set(str(x).upper() for x in ylist)

    print("---- MLB Exporter (JSON-only) ----")
    print(f"Workbook: {xlsx_path}")
    print(f"Config:   {args.config if args.config else '(built-in)'}")
    print(f"Output:   {out_dir}")
    print("----------------------------------")

    # Export projections/data tabs (JSON only)
    for task in sheets_config:
        sheet = task["sheet"]
        header_row = task.get("header_row", 2)
        data_start_row = task.get("data_start_row", 3)
        usecols = task.get("usecols")
        filters = task.get("filters") or []
        keep_cols = task.get("keep_columns")
        outfile = task.get("outfile", sheet.lower().replace(" ", "_"))

        try:
            df = read_table(xlsx_path, sheet, header_row, data_start_row, usecols)
            df = df_apply_filters(df, filters)
            if keep_cols:
                present = [c for c in keep_cols if c in df.columns]
                if present:
                    df = df[present]
            export_df_json_only(df, out_dir, outfile)
            print(f"✔️  {sheet} → {outfile}.json")
        except Exception as e:
            print(f"❌  {sheet}: {e}")

    # Parse yellow panels once and create cheat_sheet.json
    try:
        panels = parse_yellow_panels(xlsx_path, dashboard_sheet_name, yellow_fills)

        # For debugging
        (out_dir / "matchups_raw.json").write_text(
            json.dumps(panels, ensure_ascii=False),
            encoding="utf-8"
        )
        print(f"✔️  {dashboard_sheet_name} → matchups_raw.json ({len(panels)} panels)")

        # Compose cheat sheet sections
        cheat = compose_cheat_sheet_from_panels(panels)

        # (Optional) write raw but JSON-safe version too
        cs_panels_safe = []
        for p in panels:
            q = dict(p)
            q["rows"] = [[_jsonify_value(x) for x in r] for r in p.get("rows") or []]
            cs_panels_safe.append(q)
        (out_dir / "cheat_sheet_raw.json").write_text(
            json.dumps(cs_panels_safe, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

        # ✅ Write final cheat sheet EXACTLY as object (no {"sections": []})
        (out_dir / "cheat_sheet.json").write_text(
            json.dumps(cheat, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        print(f"✔️  {dashboard_sheet_name} → cheat_sheet.json (sections: {', '.join(cheat.keys())})")

    except Exception as e:
        print(f"❌  Dashboard/cheat-sheet parse failed: {e}")

if __name__ == "__main__":
    main()
