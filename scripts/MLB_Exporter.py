#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
MLB_Exporter.py  (JSON-only)
----------------------------
Exports MLB workbook tabs to JSON and parses the MLB Dashboard yellow panels.

Outputs (unchanged):
  - pitcher_projections.json
  - batter_projections.json
  - stacks.json
  - pitcher_data.json
  - batter_data.json

Plus (for the Cheat Sheet UI):
  - matchups_raw.json        (debug view of all yellow panels)
  - cheat_sheet_raw.json     (same panels, cell values JSON-safe)
  - cheat_sheet.json         (sections with original header order + rows)

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
        "outfile": "pitcher_projections",
    },
    {
        "sheet": "Batter Projections",
        "header_row": 2,
        "data_start_row": 3,
        "usecols": "A:AZ",
        "filters": [{"column": "Player", "op": "nonempty"}],
        "keep_columns": None,
        "outfile": "batter_projections",
    },
    {
        "sheet": "Top Stacks",
        "header_row": 2,
        "data_start_row": 3,
        "usecols": "A:AZ",
        "filters": [{"column": "Team", "op": "nonempty"}],
        "keep_columns": None,
        "outfile": "stacks",
    },
    {
        "sheet": "Pitcher Data",
        "header_row": 2,
        "data_start_row": 3,
        "usecols": "A:AZ",
        "filters": [{"column": "Player", "op": "nonempty"}],
        "keep_columns": None,
        "outfile": "pitcher_data",
    },
    {
        "sheet": "Batters Data",
        "header_row": 2,
        "data_start_row": 3,
        "usecols": "A:AZ",
        "filters": [{"column": "Player", "op": "nonempty"}],
        "keep_columns": None,
        "outfile": "batter_data",
    },
]

DASHBOARD_SHEET_NAME = "MLB Dashboard"   # yellow panels live here

YELLOW_FILLS = {"FFFFE699", "FFFFF2CC", "FFFFFF00"}  # common Excel yellows
GAME_TITLE_RE = re.compile(r"^[A-Z]{2,3}\s*@\s*[A-Z]{2,3}$")


# ------------------------ UTILITIES ------------------------

def ensure_outdir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path

def _make_unique_columns(cols):
    """Ensure unique headers while preserving order."""
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
    df_raw = pd.read_excel(xlsx_path, sheet_name=sheet, header=None, engine="openpyxl", usecols=usecols)
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
    """Locate yellow header bars and collect each panel (title + header row + data rows)."""
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

        # panel title = first non-empty cell on the yellow row
        title = None
        for c in range(1, max_col + 1):
            v = ws.cell(row=start_r, column=c).value
            if v not in (None, ""):
                title = str(v).strip()
                break

        # header row directly beneath
        header_row_ix = start_r + 1
        headers = []
        for c in range(1, max_col + 1):
            v = ws.cell(row=header_row_ix, column=c).value
            headers.append("" if v is None else str(v).strip())
        while headers and headers[-1] == "":
            headers.pop()
        headers = _make_unique_columns(headers)

        # collect table body
        data_rows = []
        r = header_row_ix + 1
        while r <= end_r:
            vals = [ws.cell(row=r, column=c).value for c in range(1, len(headers) + 1)]
            if all(v in (None, "", " ") for v in vals):
                break
            data_rows.append(vals)
            r += 1

        panels.append({
            "title": title or f"Panel @ row {start_r}",
            "columns": headers,
            "rows": data_rows,
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

def _jsonify_rows_matrix(rows: List[List[Any]]) -> List[List[Any]]:
    return [[_jsonify_value(x) for x in r] for r in rows]


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

def compose_cheat_sheet_from_panels(cs_panels_safe: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build cheat_sheet.json with explicit sections.
    Each section preserves original header order via "columns".
    OF panels are merged into one section with same columns as the first OF.
    """
    sections: List[Dict[str, Any]] = []

    merged_of_rows: List[Dict[str, Any]] = []
    of_columns: Optional[List[str]] = None

    for p in cs_panels_safe:
        title_raw = str(p.get("title") or "").strip().upper()
        key = NORMALIZE_TITLES.get(title_raw)
        if not key:
            continue

        # p["rows"] is a matrix (already JSON-safe). First row is not headers here—headers in p["columns"].
        columns: List[str] = p.get("columns") or []
        rows_mat: List[List[Any]] = p.get("rows") or []

        # Convert to list-of-dicts with the provided columns
        dict_rows: List[Dict[str, Any]] = []
        for r in rows_mat:
            obj = {}
            for i, h in enumerate(columns):
                obj[h] = r[i] if i < len(r) else None
            # keep non-empty rows
            if any(x not in (None, "", " ") for x in obj.values()):
                dict_rows.append(obj)

        if key == "OF":
            if of_columns is None:
                of_columns = columns
            merged_of_rows.extend(dict_rows)
        else:
            sections.append({"section": key, "columns": columns, "rows": dict_rows})

    if merged_of_rows:
        sections.append({"section": "OF", "columns": of_columns or [], "rows": merged_of_rows})

    return {"sections": sections}


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

    # 1) Export the tabular sheets (JSON only)
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

    # 2) Parse yellow panels once and build cheat sheet JSONs
    try:
        panels = parse_yellow_panels(xlsx_path, dashboard_sheet_name, yellow_fills)

        # raw (not JSON-safe) – for debug
        (out_dir / "matchups_raw.json").write_text(
            json.dumps(panels, ensure_ascii=False, default=str), encoding="utf-8"
        )
        print(f"✔️  {dashboard_sheet_name} → matchups_raw.json ({len(panels)} panels)")

        # make cells JSON-safe
        cs_panels_safe = []
        for p in panels:
            q = {
                "title": p.get("title"),
                "columns": p.get("columns") or [],
                "rows": _jsonify_rows_matrix(p.get("rows") or []),
            }
            cs_panels_safe.append(q)

        (out_dir / "cheat_sheet_raw.json").write_text(
            json.dumps(cs_panels_safe, ensure_ascii=False), encoding="utf-8"
        )

        # compose final cheat sheet structure
        cheat = compose_cheat_sheet_from_panels(cs_panels_safe)
        (out_dir / "cheat_sheet.json").write_text(
            json.dumps(cheat, ensure_ascii=False), encoding="utf-8"
        )
        print(f"✔️  {dashboard_sheet_name} → cheat_sheet.json (sections={len(cheat.get('sections', []))})")

    except Exception as e:
        print(f"❌  Dashboard/cheat-sheet parse failed: {e}")
        # don’t fail the whole export; write an empty file so frontend won’t 404
        try:
            (out_dir / "cheat_sheet.json").write_text(json.dumps({"sections": []}), encoding="utf-8")
            print("⚠️  Fallback: empty cheat_sheet.json")
        except Exception:
            pass


if __name__ == "__main__":
    main()
