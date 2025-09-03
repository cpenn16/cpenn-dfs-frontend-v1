#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
MLB_Exporter.py — FULL exporter (no trimming)

Outputs JSON files for your site under: <project>/public/data/mlb/latest/

Writes:
  - pitcher_projections.json
  - batter_projections.json
  - stacks.json
  - pitcher_data.json
  - batter_data.json
  - cheat_sheet.json
  - matchups.json

Behavior:
  • Sheet exports: read literal tables and write JSON (records).
  • Cheat Sheet: parse yellow header panels; normalize known titles.
  • Matchups: ALWAYS prefer panels from "MLB Dashboard" (fallback to same
    panel sheet used for Cheat Sheet if MLB Dashboard doesn’t exist).

Args:
  --xlsm   Full path to your MLB workbook (.xlsm)
  --out    Output directory (default: <repo>/public/data/mlb/latest)
  --config Optional JSON config to override default sheet tasks & cheat tables
           (format compatible with your nfl/mlb classic configs)

This file is self-contained and can be dropped in place of any prior
MLB_Exporter.py. It does not write CSV (JSON only) to keep output concise.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple, Union
from datetime import datetime, date, time
from decimal import Decimal

import pandas as pd
import numpy as np
from openpyxl import load_workbook
from openpyxl.worksheet.worksheet import Worksheet


# --------------------------------------------------------------------------------------
# Defaults / Paths
# --------------------------------------------------------------------------------------

THIS = Path(__file__).resolve()
ROOT = THIS.parents[1]  # repo root (expected to include /public)

DEFAULT_XLSM   = r"C:\Users\cpenn\Dropbox\Sports Models\MLB\MLB September 3rd.xlsm"
DEFAULT_CONFIG = str(ROOT / "scripts" / "configs" / "mlb_classic.json")  # optional
DEFAULT_OUT    = str(ROOT / "public" / "data" / "mlb" / "latest")

# Prefer "Cheat Sheet" for cheat panels; fallback to "MLB Dashboard"
PANEL_SHEET_CANDIDATES = ["Cheat Sheet", "MLB Dashboard"]

# Default sheet tasks (overridable via --config)
DEFAULT_SHEETS_CONFIG: List[Dict[str, Any]] = [
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

# Common Excel yellow fills used on your headers
YELLOW_FILLS = {
    "FFFFE699",
    "FFFFF2CC",
    "FFFFFF00",
}

GAME_TITLE_RE = re.compile(r"^\s*([A-Z]{2,3})\s*@\s*([A-Z]{2,3})\s*$")


# --------------------------------------------------------------------------------------
# Utilities (I/O, DataFrame helpers)
# --------------------------------------------------------------------------------------

def ensure_outdir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path

def _make_unique_columns(cols: Iterable[Any]) -> List[str]:
    seen: Dict[str, int] = {}
    out: List[str] = []
    for c in cols:
        base = "" if c is None else str(c)
        if base not in seen:
            seen[base] = 1
            out.append(base)
        else:
            seen[base] += 1
            out.append(f"{base}__{seen[base]}")
    return out

def df_apply_filters(df: pd.DataFrame, filters: List[Dict[str, str]] | None) -> pd.DataFrame:
    if not filters: return df
    keep = df.copy()
    for f in filters:
        col = f.get("column")
        op  = (f.get("op") or "nonempty").lower()
        if not col or col not in keep.columns:
            continue
        if op == "nonempty":
            keep = keep[keep[col].astype(str).str.strip().ne("").fillna(False)]
        elif op == "nonzero":
            keep = keep[pd.to_numeric(keep[col], errors="coerce").fillna(0) != 0]
        # additional ops can be added here
    return keep

def export_df_json_only(df: pd.DataFrame, out_dir: Path, name: str) -> None:
    out_json = out_dir / f"{name}.json"
    out_json.write_text(df.to_json(orient="records", force_ascii=False), encoding="utf-8")
    print(f"✔️  JSON → {out_json}  ({len(df):,} rows)")

def read_table(
    xlsx_path: Path,
    sheet: str,
    header_row: int,
    data_start_row: int,
    usecols: Optional[str],
) -> pd.DataFrame:
    df_raw = pd.read_excel(
        xlsx_path,
        sheet_name=sheet,
        header=None,
        engine="openpyxl",
        usecols=usecols,
    )
    header_idx = header_row - 1
    data_idx   = data_start_row - 1

    headers = df_raw.iloc[header_idx].tolist()
    body    = df_raw.iloc[data_idx:].reset_index(drop=True)

    headers = _make_unique_columns(headers)
    body.columns = headers

    # Drop fully empty rows/cols
    body = body.dropna(how="all").dropna(axis=1, how="all")

    return body


# --------------------------------------------------------------------------------------
# Yellow Panels Parser (Cheat Sheet + Matchups)
# --------------------------------------------------------------------------------------

def parse_yellow_panels(
    xlsx_path: Path,
    sheet_name: str,
    yellow_fills: Optional[set] = None
) -> List[Dict[str, Any]]:
    """
    Find yellow title rows and return *scoped* data blocks.
    Critically, we detect the column span of each panel so side-by-side panels
    (e.g., Pitcher on the left, OF on the right) don’t get merged.
    """
    fills_rgb = set(v.upper() for v in (yellow_fills or YELLOW_FILLS))
    wb = load_workbook(xlsx_path, data_only=True)
    try:
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

                # Themed/indexed yellows often won’t carry explicit rgb; treat any
                # non-transparent theme/index color as header-like.
                if (getattr(fill.fgColor, "type", None) in ("theme", "indexed") or
                    getattr(fill.start_color, "type", None) in ("theme", "indexed")):
                    if (getattr(fill.fgColor, "rgb", None) not in (None, "00000000") or
                        getattr(fill.start_color, "rgb", None) not in (None, "00000000")):
                        return True

                return False
            except Exception:
                return False

        # 1) collect all yellow header rows (by row index)
        yellow_rows = []
        for r in range(1, max_row + 1):
            if any(cell_is_header_like(ws.cell(row=r, column=c)) for c in range(1, max_col + 1)):
                yellow_rows.append(r)

        # Fallback if styles are stripped: accept titles like "SEA @ TB"
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
            # Determine the overall bottom boundary (until the next yellow header row)
            overall_end_r = (yellow_rows[i + 1] - 1) if i + 1 < len(yellow_rows) else max_row

            # 2) find the *column block* for THIS panel
            #    - start_c: first non-empty cell in the header row
            #    - end_c: extend right while the header row has content, but STOP if:
            #        a) we encounter another yellow header-like cell in the same row
            #        b) we hit a gap of >= 2 consecutive empty header cells
            start_c = None
            for c in range(1, max_col + 1):
                if (ws.cell(row=start_r, column=c).value not in (None, "")):
                    start_c = c
                    break
            if start_c is None:
                # No text on this header row; skip
                continue

            end_c = start_c
            empty_run = 0
            for c in range(start_c + 1, max_col + 1):
                cell = ws.cell(row=start_r, column=c)
                # another yellow header in the same row → next panel begins here
                if cell_is_header_like(cell) and cell.value not in (None, "") and c > start_c:
                    break
                if cell.value in (None, ""):
                    empty_run += 1
                    if empty_run >= 2:
                        break
                else:
                    empty_run = 0
                    end_c = c

            # 3) extract the title from this header block
            title = None
            for c in range(start_c, end_c + 1):
                v = ws.cell(row=start_r, column=c).value
                if v not in (None, ""):
                    title = str(v).strip()
                    break

            # 4) collect rows under this header, bounded by (overall_end_r, start_c..end_c)
            rows = []
            r = start_r + 1
            blank_streak = 0
            while r <= overall_end_r:
                vals = [ws.cell(row=r, column=c).value for c in range(start_c, end_c + 1)]
                if all(v in (None, "", " ") for v in vals):
                    blank_streak += 1
                    # stop a panel after 2 consecutive blank rows
                    if blank_streak >= 2:
                        break
                else:
                    blank_streak = 0
                    rows.append(vals)
                r += 1

            # trim trailing fully-empty columns from the captured block
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
                "start_col": start_c,
                "end_col": end_c,
                "rows": rows,
            })

        return panels
    finally:
        wb.close()


# --------------------------------------------------------------------------------------
# JSON-safe conversion & Cheat Sheet composer
# --------------------------------------------------------------------------------------

def _jsonify_value(v):
    """Make Excel/py types JSON safe with desired formats."""
    if v in (None, ""): return None
    if isinstance(v, pd.Timestamp):          return v.to_pydatetime().isoformat()
    if isinstance(v, (datetime, date)):      return v.isoformat()
    if isinstance(v, time):                  return v.strftime("%I:%M:%S %p").lstrip("0")
    if isinstance(v, Decimal):               return float(v)
    return v

def _rows_to_dicts(rows: List[List[Any]]) -> List[Dict[str, Any]]:
    """First row is headers; rest are records (JSON-safe)."""
    if not rows: return []
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
    Build cheat_sheet.json structure that mirrors your sheet:
      Pitcher, C, 1B, 2B, 3B, SS, OF (merged from multiple blocks), Cash Core, Top Stacks
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


# --------------------------------------------------------------------------------------
# MATCHUPS composer (robust for dashboard layouts)
# --------------------------------------------------------------------------------------

_NUM_RE = re.compile(r"[-+]?\d+(?:\.\d+)?")

def _to_float(s):
    if s is None: return None
    if isinstance(s, (int, float)): return float(s)
    m = _NUM_RE.search(str(s))
    return float(m.group()) if m else None

def _row_text(row: List[Any]) -> str:
    parts = [str(x).strip() for x in (row or []) if x not in (None, "", " ")]
    return " | ".join(parts).strip()

def _split_lr(row: List[Any]) -> Tuple[str, str]:
    vals = [str(x).strip() for x in (row or []) if x not in (None, "", " ")]
    if not vals:
        return "", ""
    if len(vals) == 1:
        return vals[0], ""
    return vals[0], vals[-1]

def compose_matchups_from_dashboard(panels: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Produce an array of games for the React MLB Matchups page.

    We recognize game panels by titles like "SEA @ TB".
    Within each panel, we split each data row into (left, right) strings to simulate
    team_blocks.away.lines and team_blocks.home.lines. If your lineup rows already
    start with "1 - ..." those will show in the UI; otherwise they'll just be plain lines.
    We lightly probe for O/U and implied totals in top rows; OK if None.
    """
    games: List[Dict[str, Any]] = []

    for p in panels:
        title = str(p.get("title") or "").strip()
        m = GAME_TITLE_RE.match(title)
        if not m:
            # Not a game panel; skip
            continue

        away = m.group(1).upper()
        home = m.group(2).upper()

        rows: List[List[Any]] = p.get("rows") or []
        left_lines: List[str] = []
        right_lines: List[str] = []

        for r in rows:
            l, rtxt = _split_lr(r)
            if l:    left_lines.append(l)
            if rtxt: right_lines.append(rtxt)

        imp_away = None
        imp_home = None
        ou = None

        # Try to detect OU and (X.X) implied references from top few rows
        for r in rows[:4]:
            s = _row_text(r)
            if "O/U" in s.upper() or "OU" in s.upper():
                nums = [float(x) for x in _NUM_RE.findall(s)]
                if nums:
                    ou = nums[0]
            for tok in re.findall(r"\(([0-9]+(?:\.[0-9]+)?)\)", s):
                val = float(tok)
                if imp_away is None:
                    imp_away = val
                elif imp_home is None:
                    imp_home = val

        games.append({
            "away": away,
            "home": home,
            "ou": ou,
            "imp_away": imp_away,
            "imp_home": imp_home,
            "team_blocks": {
                "away": {"header": f"{away}" + (f" ({imp_away})" if imp_away is not None else ""), "lines": left_lines},
                "home": {"header": f"{home}" + (f" ({imp_home})" if imp_home is not None else ""), "lines": right_lines},
            },
            # Optional extras the UI tolerates as None
            "spread_home": None,
            "ml_home": None,
            "ml_away": None,
            "weather": {"temp_f": None, "wind_mph": None, "desc": None, "is_dome": None},
        })

    return games


# --------------------------------------------------------------------------------------
# Read literal table (stringified like Excel display)
# --------------------------------------------------------------------------------------

def _decimals_from_format(fmt: str) -> int:
    if not isinstance(fmt, str): return 0
    m = re.search(r"0\.([0]+)", fmt)
    return len(m.group(1)) if m else 0

_PERCENT_RE = re.compile(r"%")

def _format_cell(cell) -> str:
    v = cell.value
    if v is None: return ""
    fmt = cell.number_format or ""

    # Dates/times
    if isinstance(v, (datetime, date, time)):
        return str(v)

    # Numbers
    if isinstance(v, (int, float, np.floating)):
        x = float(v)
        if _PERCENT_RE.search(fmt):
            dec = _decimals_from_format(fmt)
            n = x * 100.0 if abs(x) <= 1.01 else x
            if float(n).is_integer():
                return f"{int(round(n))}%"
            return f"{n:.{dec}f}%"
        if float(x).is_integer():
            return str(int(round(x)))
        dec = _decimals_from_format(fmt) or 1
        return f"{x:.{dec}f}"

    return str(v).strip()

def dedup(names: Iterable) -> List[str]:
    seen: Dict[str, int] = {}
    out: List[str] = []
    for i, raw in enumerate(list(names)):
        s = "" if raw is None else str(raw).strip()
        if s == "" or s.lower() in {"nan", "nat"} or s.lower().startswith("unnamed"):
            s = f"col_{i+1}"
        key = s
        if key in seen:
            seen[key] += 1
            key = f"{key}_{seen[key]}"
        else:
            seen[key] = 0
        out.append(key)
    return out

def read_literal_table(
    xlsm_path: Path,
    sheet: str,
    header_row: Optional[int],
    data_start_row: Optional[int],
    limit_to_col: Optional[str] = None,
) -> pd.DataFrame:
    """
    Read a sheet using openpyxl and return a DataFrame of *strings* matching Excel display.
    `limit_to_col` (e.g., "AZ") caps the rightmost column read.
    """
    wb = load_workbook(xlsm_path, data_only=True, read_only=True, keep_links=False)
    try:
        if sheet not in wb.sheetnames:
            raise ValueError(f"Sheet not found: {sheet}")
        ws = wb[sheet]

        max_c = ws.max_column
        if limit_to_col:
            def _excel_col_to_idx(label: str) -> int:
                s = re.sub(r"[^A-Za-z]", "", str(label)).upper()
                if not s: return 0
                n = 0
                for ch in s:
                    n = n * 26 + (ord(ch) - ord("A") + 1)
                return n - 1
            try:
                max_c = min(max_c, _excel_col_to_idx(limit_to_col) + 1)
            except Exception:
                pass

        if header_row is None or data_start_row is None:
            scan = min(8, ws.max_row)
            best_r, best_nonempty = 1, -1
            for r in range(1, scan + 1):
                vals = [c.value for c in ws[r][0:max_c]]
                nonempty = sum(1 for x in vals if x not in (None, ""))
                if nonempty > best_nonempty:
                    best_nonempty = nonempty
                    best_r = r
            header_row = best_r
            data_start_row = best_r + 1

        raw_headers = [_format_cell(c) for c in ws[header_row][0:max_c]]
        raw_headers = [re.sub(r"\s+", " ", h).strip() for h in raw_headers]
        headers = dedup(raw_headers)

        out_rows: List[List[str]] = []
        blanks_in_a_row = 0
        for r in range(int(data_start_row), ws.max_row + 1):
            cells = ws[r][0:max_c]
            row = [_format_cell(c) for c in cells]
            if all(v == "" for v in row):
                blanks_in_a_row += 1
                if blanks_in_a_row >= 3: break
                continue
            blanks_in_a_row = 0
            out_rows.append(row)

        df = pd.DataFrame(out_rows, columns=headers)
        df = df.dropna(axis=0, how="all")
        df = df.replace("", np.nan).dropna(axis=0, how="all").fillna("")
        df = df.loc[:, ~(df.astype(str).eq("").all())]
        return df
    finally:
        wb.close()


# --------------------------------------------------------------------------------------
# Config loader
# --------------------------------------------------------------------------------------

def load_config(path: Optional[str]) -> Dict[str, Any]:
    if not path:
        return {}
    p = Path(path)
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


# --------------------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Export MLB workbook to site JSON (full exporter)")
    ap.add_argument("--xlsm",   type=str, default=DEFAULT_XLSM,   help="Full path to MLB .xlsm")
    ap.add_argument("--out",    type=str, default=DEFAULT_OUT,    help="Output folder (public/data/mlb/latest)")
    ap.add_argument("--config", type=str, default="",             help="Optional config JSON to override defaults")
    args = ap.parse_args()

    xlsx_path = Path(args.xlsm).resolve()
    out_dir   = ensure_outdir(Path(args.out).resolve())

    if not xlsx_path.exists():
        raise FileNotFoundError(f"Workbook not found: {xlsx_path}")

    cfg = load_config(args.config)

    # -------------- Sheet Exports (tables) --------------
    sheets_cfg = cfg.get("sheets") or DEFAULT_SHEETS_CONFIG
    for t in sheets_cfg:
        sheet = t.get("sheet")
        if not sheet:
            print("⚠️  SKIP: task missing 'sheet'"); continue
        try:
            df = read_table(
                xlsx_path=xlsx_path,
                sheet=sheet,
                header_row=int(t.get("header_row", 2)),
                data_start_row=int(t.get("data_start_row", 3)),
                usecols=t.get("usecols"),
            )
        except Exception as e:
            print(f"❌  {sheet}: {e}")
            continue

        if t.get("filters"):
            df = df_apply_filters(df, t.get("filters"))

        keep_cols = t.get("keep_columns")
        if keep_cols and isinstance(keep_cols, list):
            df = df[[c for c in df.columns if c in keep_cols]]

        outfile = (t.get("outfile") or sheet.lower().replace(" ", "_")).strip()
        export_df_json_only(df, out_dir, outfile)

    # -------------- CHEAT SHEET (yellow panels) --------------
    # Choose which sheet to parse panels from for the cheat_sheet
    wb = load_workbook(xlsx_path, data_only=True)
    try:
        names = wb.sheetnames
    finally:
        wb.close()

    panel_sheet = None
    for cand in PANEL_SHEET_CANDIDATES:
        if cand in names:
            panel_sheet = cand
            break
    if not panel_sheet:
        panel_sheet = names[0]

    cs_panels = parse_yellow_panels(xlsx_path, panel_sheet, YELLOW_FILLS)
    cheat_sheet = compose_cheat_sheet_from_panels(cs_panels)

    (out_dir / "cheat_sheet.json").write_text(
        json.dumps(cheat_sheet, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print(f"✔️  {panel_sheet} → cheat_sheet.json "
          f"(sections: {', '.join(sorted(cheat_sheet.keys())) or 'none'})")

    # -------------- MATCHUPS (always prefer MLB Dashboard) --------------
    matchups_sheet = "MLB Dashboard" if "MLB Dashboard" in names else panel_sheet

    if matchups_sheet != panel_sheet:
        match_panels = parse_yellow_panels(xlsx_path, matchups_sheet, YELLOW_FILLS)
    else:
        match_panels = cs_panels  # reuse

    games = compose_matchups_from_dashboard(match_panels)
    (out_dir / "matchups.json").write_text(
        json.dumps(games, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print(f"✔️  {matchups_sheet} → matchups.json ({len(games)} games)")

if __name__ == "__main__":
    main()
