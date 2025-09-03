#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
MLB_Exporter.py  (JSON-only)
----------------------------
Exports MLB workbook tabs to JSON and parses the MLB Dashboard by yellow header panels.

Defaults are set near the top (ROOT/paths block) to match your NFL exporter style.
Override at runtime with:
  --xlsm   "C:\\path\\to\\MLB Slate.xlsm"
  --config "...\mlb_classic.json"
  --out    "...\public\\data\\mlb\\latest"
"""

import argparse
import json
import re
from pathlib import Path
from typing import List, Dict, Any, Optional

import pandas as pd
from openpyxl import load_workbook
from openpyxl.worksheet.worksheet import Worksheet


# ------------------------ ROOT / DEFAULT PATHS ------------------------

THIS = Path(__file__).resolve()
ROOT = THIS.parents[1]  # repo root (expected to include /public)

# Change this filename per slate (exactly like your NFL flow)
DEFAULT_XLSM = r"C:\Users\cpenn\Dropbox\Sports Models\MLB\MLB September 2nd.xlsm"
DEFAULT_PROJ = str(ROOT)
DEFAULT_CONFIG = str(ROOT / "scripts" / "configs" / "mlb_classic.json")

# Default output folder under the repo
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
        "sheet": "Top Stacks",  # "Stacks" lives here in your file
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
        "sheet": "Batters Data",  # plural in workbook
        "header_row": 2,
        "data_start_row": 3,
        "usecols": "A:AZ",
        "filters": [{"column": "Player", "op": "nonempty"}],
        "keep_columns": None,
        "outfile": "batter_data"
    },
]

DASHBOARD_SHEET_NAME = "MLB Dashboard"

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
    """
    Ensure DataFrame columns are unique while preserving order.
    'Player', 'Player' -> 'Player', 'Player__2'
    """
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

    # Make headers unique BEFORE assigning (JSON orient="records" needs unique keys)
    headers = _make_unique_columns(headers)
    body.columns = headers

    # Drop empty rows/cols
    body = body.dropna(how="all")
    body = body.dropna(axis=1, how="all")
    return body

def parse_dashboard_panels(xlsx_path: Path, sheet_name: str, yellow_fills: Optional[set] = None) -> List[Dict[str, Any]]:
    """
    Detect header rows by:
      1) Yellow-ish fills (rgb OR theme/indexed with SOLID pattern)
      2) Fallback regex like 'NYY @ BOS' when no yellow is found
    Each panel returns the *rows* under the yellow bar. The first row is assumed
    to be the table header for that panel (as in your screenshot).
    """
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

            # Direct RGB match?
            rgb = getattr(fill.fgColor, "rgb", None)
            if rgb and str(rgb).upper() in fills_rgb:
                return True

            # Some Excel themes store color under start_color
            start_rgb = getattr(fill.start_color, "rgb", None)
            if start_rgb and str(start_rgb).upper() in fills_rgb:
                return True

            # If theme/indexed with solid, treat as header-ish (heuristic)
            if (getattr(fill.fgColor, "type", None) in ("theme", "indexed") or
                getattr(fill.start_color, "type", None) in ("theme", "indexed")):
                if (getattr(fill.fgColor, "rgb", None) not in (None, "00000000") or
                    getattr(fill.start_color, "rgb", None) not in (None, "00000000")):
                    return True

            return False
        except Exception:
            return False

    # Pass 1: find yellow-ish rows
    yellow_rows = []
    for r in range(1, max_row + 1):
        if any(cell_is_header_like(ws.cell(row=r, column=c)) for c in range(1, max_col + 1)):
            yellow_rows.append(r)

    # Fallback: if none found, use regex like "AAA @ BBB" in first non-empty cell
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

        # Title = first non-empty cell on header row
        title = None
        for c in range(1, max_col + 1):
            v = ws.cell(row=start_r, column=c).value
            if v not in (None, ""):
                title = str(v).strip()
                break

        # Collect rows beneath header until fully blank line or next header block
        rows = []
        r = start_r + 1
        while r <= end_r:
            vals = [ws.cell(row=r, column=c).value for c in range(1, max_col + 1)]
            if all(v in (None, "", " ") for v in vals):
                break
            rows.append(vals)
            r += 1

        # Trim trailing empty columns
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

def load_config(path_str: Optional[str]) -> Optional[dict]:
    if not path_str:
        return None
    p = Path(path_str)
    if not p.exists():
        print(f"⚠️  Config not found: {p}")
        return None
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)


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

def _rows_to_dicts(rows: List[List[Any]]) -> List[Dict[str, Any]]:
    """First row is headers; rest are records."""
    if not rows:
        return []
    headers = [str(h).strip() if h is not None else "" for h in rows[0]]
    # ensure unique keys
    headers = _make_unique_columns(headers)
    out = []
    for r in rows[1:]:
        obj = {}
        for i, h in enumerate(headers):
            obj[h] = r[i] if i < len(r) else None
        # drop rows that are fully empty
        if any(v not in (None, "", " ") for v in obj.values()):
            out.append(obj)
    return out

def compose_cheat_sheet_from_panels(panels: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build a thin cheat_sheet.json structure that mirrors your screenshot:
    sections keyed by:
      Pitcher, C, 1B, 2B, 3B, SS, OF (merged), Cash Core, Top Stacks
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
            # Merge multiple OF blocks
            out.setdefault("OF", [])
            out["OF"].extend(recs)
        else:
            out[key] = recs

    return out


# ------------------------ MAIN ------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsm", type=str, default=DEFAULT_XLSM, help="Path to MLB .xlsx/.xlsm workbook")
    ap.add_argument("--config", type=str, default=DEFAULT_CONFIG, help="Path to mlb_classic.json")
    ap.add_argument("--out", type=str, default=DEFAULT_OUT, help="Output directory (JSON only)")
    args = ap.parse_args()

    xlsx_path = Path(args.xlsm).expanduser()
    out_dir = ensure_outdir(Path(args.out))

    cfg = load_config(args.config)

    # Effective config (JSON overrides built-ins where provided)
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

    # Export the tabular sheets (JSON only)
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

    # Parse MLB Dashboard panels → matchups_raw.json + cheat_sheet.json
    try:
        panels = parse_dashboard_panels(xlsx_path, dashboard_sheet_name, yellow_fills)
        (out_dir / "matchups_raw.json").write_text(
            json.dumps(panels, ensure_ascii=False), encoding="utf-8"
        )
        print(f"✔️  {dashboard_sheet_name} → matchups_raw.json ({len(panels)} panels)")

        cheat = compose_cheat_sheet_from_panels(panels)
        (out_dir / "cheat_sheet.json").write_text(
            json.dumps(cheat, ensure_ascii=False), encoding="utf-8"
        )
        print(f"✔️  {dashboard_sheet_name} → cheat_sheet.json (sections: {', '.join(cheat.keys())})")

    except Exception as e:
        print(f"❌  Dashboard parse failed: {e}")


if __name__ == "__main__":
    main()
