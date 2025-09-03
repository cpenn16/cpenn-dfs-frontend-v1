#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MLB_Exporter.py — Full exporter to match NFL_Exporter structure (no _raw files)

Exports:
- Generic "tasks" (sheet → out_rel) using literal Excel display values
- Cheat Sheet (table extraction by title cells, column-scoped so side-by-side tables don’t merge)
- MLB Matchups "gameboard" from the MLB Dashboard (panel windows like NFL)

Usage:
  python scripts/MLB_Exporter.py --xlsm "C:\\path\\to\\MLB.xlsm" ^
                                 --project "." ^
                                 --config "scripts\\configs\\mlb_classic.json"
"""

from __future__ import annotations

import argparse, json, re, sys, shutil, tempfile, datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Union

import pandas as pd
import numpy as np
from openpyxl import load_workbook
from openpyxl.worksheet.worksheet import Worksheet


# ------------------------- ROOT / DEFAULT PATHS -------------------------

THIS = Path(__file__).resolve()
ROOT = THIS.parents[1]  # repo root (expected to include /public)

DEFAULT_XLSM   = r"C:\Users\cpenn\Dropbox\Sports Models\MLB\MLB September 3rd.xlsm"
DEFAULT_PROJ   = str(ROOT)
DEFAULT_CONFIG = str(ROOT / "scripts" / "configs" / "mlb_classic.json")


# ------------------------------ utilities ------------------------------

def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)

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

def to_json_records(df: pd.DataFrame) -> str:
    df2 = df.astype(object).where(pd.notna(df), "")
    return df2.to_json(orient="records", force_ascii=False, indent=2)

def _stage_copy_for_read(src: Path) -> tuple[Path, Path]:
    """Copy workbook to temp so Excel can stay open while we read."""
    tmpdir = Path(tempfile.mkdtemp(prefix="mlb_export_"))
    dst = tmpdir / src.name
    shutil.copy2(src, dst)
    return dst, tmpdir


# --------------------- openpyxl “display text” formatting --------------------

_PERCENT_RE = re.compile(r"%")

def _decimals_from_format(fmt: str) -> int:
    if not isinstance(fmt, str):
        return 0
    m = re.search(r"0\.([0]+)", fmt)
    return len(m.group(1)) if m else 0

def _format_cell(cell) -> str:
    v = cell.value
    if v is None:
        return ""
    fmt = cell.number_format or ""

    # Dates/times
    if isinstance(v, (datetime.date, datetime.datetime, datetime.time)):
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


# ------------------------------ header normalization --------------------

_HEADER_ALIASES = {
    "dk sal": "DK Sal",
    "fd sal": "FD Sal",
    "teamabbrev": "Team",
    "opp": "Matchup",
}

def _norm_header_label(s: str) -> str:
    t = (s or "").replace("\u00A0", " ").replace("\u202F", " ").strip()
    key = re.sub(r"\s+", " ", t).lower()
    return _HEADER_ALIASES.get(key, t)


# ------------------------------ filters engine --------------------------

def _resolve_col(df: pd.DataFrame, name: str) -> Optional[str]:
    if name in df.columns:
        return name
    low_map = {c.lower(): c for c in df.columns}
    return low_map.get((name or "").lower())

def _apply_leaf_filter(df: pd.DataFrame, f: Dict[str, Any]) -> pd.Series:
    col_name = _resolve_col(df, f.get("column", ""))
    if not col_name:
        return pd.Series([True] * len(df), index=df.index)

    op = (f.get("op") or "contains").lower()
    cs = bool(f.get("case_sensitive", False))
    s = df[col_name].astype(str)
    if not cs:
        s = s.str.lower()

    if op == "nonempty":       return s.str.strip().ne("")
    val = str(f.get("value", "")).strip()
    if not cs:                 val = val.lower()

    if   op == "equals":       res = s.eq(val)
    elif op == "not_equals":   res = s.ne(val)
    elif op == "contains":     res = s.str.contains(val, na=False)
    elif op == "not_contains": res = ~s.str.contains(val, na=False)
    elif op == "startswith":   res = s.str.startswith(val, na=False)
    elif op == "endswith":     res = s.str.endswith(val, na=False)
    elif op == "regex":
        try:
            pat = re.compile(val, 0 if cs else re.IGNORECASE)
            res = s.str.match(pat).fillna(False)
        except Exception:
            res = pd.Series([True] * len(df), index=df.index)
    else:
        res = pd.Series([True] * len(df), index=df.index)

    return res.fillna(False)

def _apply_filters(df: pd.DataFrame, filters: Union[List, Dict, None]) -> pd.DataFrame:
    def eval_filter(f) -> pd.Series:
        if isinstance(f, dict) and ("any_of" in f or "all_of" in f):
            if "any_of" in f:
                parts = [eval_filter(x) for x in (f.get("any_of") or [])]
                return pd.concat(parts, axis=1).any(axis=1) if parts else pd.Series([True]*len(df), index=df.index)
            if "all_of" in f:
                parts = [eval_filter(x) for x in (f.get("all_of") or [])]
                return pd.concat(parts, axis=1).all(axis=1) if parts else pd.Series([True]*len(df), index=df.index)
        return _apply_leaf_filter(df, f)

    if not filters: return df
    if isinstance(filters, dict) and ("any_of" in filters or "all_of" in filters):
        return df[eval_filter(filters)]
    if isinstance(filters, list):
        masks = [eval_filter(f) for f in filters]
        return df[pd.concat(masks, axis=1).all(axis=1)] if masks else df
    return df


# ------------------------------ task runner -----------------------------

def maybe_apply_column_mapping(df: pd.DataFrame, mapping: Dict[str, str] | None) -> pd.DataFrame:
    if not mapping: return df
    existing = {src: dst for src, dst in mapping.items() if src in df.columns}
    return df.rename(columns=existing) if existing else df

def reorder_columns_if_all_present(df: pd.DataFrame, order: List[str] | None) -> pd.DataFrame:
    if not order: return df
    return df[order] if all(c in df.columns for c in order) else df

def export_one(df: pd.DataFrame, out_csv: Optional[Path], out_json: Optional[Path]) -> None:
    if out_csv:
        ensure_parent(out_csv)
        df.astype(object).where(pd.notna(df), "").to_csv(out_csv, index=False, encoding="utf-8-sig")
        print(f"✔️  CSV  → {out_csv}")
    if out_json:
        ensure_parent(out_json)
        out_json.write_text(to_json_records(df), encoding="utf-8")
        print(f"✔️  JSON → {out_json}")

def run_task(xlsm_path: Path, project_root: Path, task: Dict[str, Any]) -> None:
    sheet = task.get("sheet")
    if not sheet:
        print("⚠️  SKIP: task missing 'sheet'"); return

    df = read_literal_table(
        xlsm_path=xlsm_path,
        sheet=sheet,
        header_row=task.get("header_row"),
        data_start_row=task.get("data_start_row"),
        limit_to_col=task.get("limit_to_col"),
    )

    keep_cols_src: List[str] = task.get("keep_columns_sheet_order", [])
    if keep_cols_src:
        df = df[[c for c in df.columns if c in keep_cols_src]]

    df = maybe_apply_column_mapping(df, task.get("column_mapping"))
    df = reorder_columns_if_all_present(df, task.get("column_order"))
    df = _apply_filters(df, task.get("filters"))

    out_rel = (task.get("out_rel") or "").lstrip(r"\/")
    if not out_rel:
        print(f"⚠️  SKIP: task for '{sheet}' missing 'out_rel'"); return

    base = project_root / "public" / Path(out_rel)
    fmt = str(task.get("format", "json")).lower()
    csv_path  = base.with_suffix(".csv")  if fmt in ("csv", "both")  else None
    json_path = base.with_suffix(".json") if fmt in ("json", "both") else None
    export_one(df, csv_path, json_path)


# ------------------------------- literal read ---------------------------

def _excel_col_to_idx(label: str) -> int:
    s = re.sub(r"[^A-Za-z]", "", str(label)).upper()
    if not s: return 0
    n = 0
    for ch in s:
        n = n * 26 + (ord(ch) - ord("A") + 1)
    return n - 1

def read_literal_table(xlsm_path: Path, sheet: str,
                       header_row: Optional[int],
                       data_start_row: Optional[int],
                       limit_to_col: Optional[str] = None) -> pd.DataFrame:
    """
    Read a sheet using openpyxl and return a DataFrame of *strings* matching Excel display.
    `limit_to_col` (e.g., "AE") caps the rightmost column read.
    """
    wb = load_workbook(xlsm_path, data_only=True, read_only=True, keep_links=False)
    try:
        if sheet not in wb.sheetnames:
            raise ValueError(f"Sheet not found: {sheet}")
        ws = wb[sheet]

        max_c = ws.max_column
        if limit_to_col:
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
        raw_headers = [_norm_header_label(h) for h in raw_headers]
        headers = dedup(raw_headers)

        out_rows: List[List[str]] = []
        blanks_in_a_row = 0
        for r in range(int(data_start_row), ws.max_row + 1):
            cells = ws[r][0:max_c]
            row = [_format_cell(c) for c in cells]
            if all(v == "" for v in row):
                blanks_in_a_row += 1
                if blanks_in_a_row >= 2: break
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


# -------------------------- cheatsheets (by title) ----------------------

def run_cheatsheets(xlsm_path: Path, project_root: Path, cfg: Dict[str, Any]) -> None:
    """
    Title-based extraction, column-scoped. Extras:
      - If 'Player' is blank (common with HYPERLINK formulas), read the formula
        text from a non-data_only workbook and extract the display value.
      - Normalize 'Time' to 'H:MM AM/PM'.
    """
    cs = cfg.get("cheatsheets")
    if not cs: 
        return
    sheet      = cs.get("sheet") or "Cheat Sheet"
    out_rel    = (cs.get("out_rel") or "").lstrip(r"\/")
    title_ci   = bool(cs.get("title_match_ci", True))
    default_limit = int(cs.get("limit_rows", 200))
    if not out_rel:
        print("⚠️  SKIP cheatsheets: missing out_rel"); 
        return

    # Helper: 24h → 12h
    _TIME12_RE = re.compile(r"^\s*(\d{1,2})\s*:\s*(\d{2})(?::\d{2})?\s*(AM|PM)?\s*$", re.I)
    def _to_12h(s: Any) -> str:
        if s is None: 
            return ""
        t = str(s).strip()
        if not t: 
            return ""
        m = _TIME12_RE.match(t)
        if not m:
            return t  # leave as-is
        hh = int(m.group(1))
        mm = m.group(2)
        ampm = m.group(3)
        if ampm:  # already AM/PM
            up = ampm.upper()
            return f"{hh}:{mm} {up}"
        # 24h to 12h
        if hh == 0:
            return f"12:{mm} AM"
        if 1 <= hh <= 11:
            return f"{hh}:{mm} AM"
        if hh == 12:
            return f"12:{mm} PM"
        return f"{hh-12}:{mm} PM"

    # Helper: extract display from =HYPERLINK(..., "Display")
    _HL_RE = re.compile(r"^=\s*HYPERLINK\s*\(\s*(?:\"[^\"]*\"|[^,]+)\s*,\s*\"([^\"]+)\"\s*\)\s*$", re.I)
    def _hyperlink_display(val: Any) -> Optional[str]:
        s = "" if val is None else str(val)
        m = _HL_RE.match(s)
        return m.group(1).strip() if m else None

    wb_data = load_workbook(xlsm_path, data_only=True,  read_only=True, keep_links=False)
    wb_form = load_workbook(xlsm_path, data_only=False, read_only=True, keep_links=False)
    try:
        if sheet not in wb_data.sheetnames:
            print(f"⚠️  SKIP cheatsheets: sheet '{sheet}' not found"); 
            return
        ws  = wb_data[sheet]
        wsf = wb_form[sheet]
        n_rows, n_cols = ws.max_row, ws.max_column

        def norm(s: Any) -> str:
            txt = "" if s is None else str(s).strip()
            return txt.lower() if title_ci else txt

        titles_cfg = cs.get("tables") or []
        all_titles_norm = {norm(t.get("title")) for t in titles_cfg if t.get("title")}

        # index of text → [(r,c)]
        index: Dict[str, List[tuple]] = {}
        for r in range(1, n_rows + 1):
            for c in range(1, n_cols + 1):
                s = norm(ws.cell(r, c).value)
                if s:
                    index.setdefault(s, []).append((r, c))

        out_obj: Dict[str, Any] = {}
        for i, t in enumerate(titles_cfg):
            title = str(t.get("title") or f"Table {i+1}").strip()
            width = max(1, int(t.get("width", 8)))
            limit_rows = int(t.get("limit_rows", default_limit))
            locs = index.get(norm(title), [])
            if not locs:
                print(f"⚠️  cheatsheets: title not found: '{title}'")
                continue

            start_r, start_c = min(locs, key=lambda rc: (rc[0], rc[1]))
            header_r = start_r + 1          # header is the row *after* the yellow title
            data_r0  = header_r + 1

            # headers within span
            hdr = [ws.cell(header_r, c) for c in range(start_c, min(start_c + width, n_cols + 1))]
            headers = dedup([_norm_header_label(_format_cell(c)) for c in hdr])

            # quick lookup for special columns
            try:
                idx_player = next(i for i,h in enumerate(headers) if h.lower()=="player")
            except StopIteration:
                idx_player = None
            try:
                idx_time = next(i for i,h in enumerate(headers) if h.lower()=="time")
            except StopIteration:
                idx_time = None

            rows = []
            r = data_r0
            blank_seq = 0
            while r <= n_rows and len(rows) < limit_rows:
                # stop when we hit another known title in the first col of this panel
                first_cell = norm(ws.cell(r, start_c).value)
                if first_cell in all_titles_norm and first_cell != "":
                    break

                row_cells = [ws.cell(r, c) for c in range(start_c, start_c + len(headers))]
                display = [_format_cell(c) for c in row_cells]

                # Fill missing Player from formula if needed
                if idx_player is not None and (display[idx_player] == "" or display[idx_player] is None):
                    raw = wsf.cell(r, start_c + idx_player).value  # read formula text
                    disp = _hyperlink_display(raw)
                    if disp:
                        display[idx_player] = disp

                # convert time
                if idx_time is not None and display[idx_time]:
                    display[idx_time] = _to_12h(display[idx_time])

                if all(x == "" for x in display):
                    blank_seq += 1
                    if blank_seq >= 2:
                        break
                    r += 1
                    continue

                blank_seq = 0
                rows.append(display)
                r += 1

            sub = pd.DataFrame(rows, columns=headers)
            out_obj[title] = sub.astype(object).where(pd.notna(sub), "").to_dict(orient="records")

        out_path = (project_root / "public" / Path(out_rel)).with_suffix(".json")
        ensure_parent(out_path)
        out_path.write_text(json.dumps(out_obj, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"✔️  JSON → {out_path}  (sections: {', '.join(out_obj.keys()) or 'none'})")
    finally:
        wb_data.close()
        wb_form.close()



# ---------------------- MLB GAMEBOARD (Dashboard) -----------------------

_TITLE_RE = re.compile(r"^\s*([A-Z]{2,3})\s*@\s*([A-Z]{2,3})\s*$")

def _cell(ws: Worksheet, r: int, c: int) -> str:
    v = ws.cell(r, c).value
    return "" if v is None else str(v).strip()

def _row_text_range(ws: Worksheet, r: int, c0: int, c1: int) -> str:
    parts = [_cell(ws, r, c) for c in range(max(1, c0), max(1, c1) + 1)]
    parts = [p for p in parts if p]
    return " | ".join(parts)

def _find_header_cols_in_row(ws: Worksheet, r: int, max_col: int,
                             yellow_rgbs: set, title_re: re.Pattern) -> list[int]:
    cols = []
    for c in range(1, max_col + 1):
        txt = ws.cell(r, c).value
        if txt is None or str(txt).strip() == "":
            continue
        is_header = False
        try:
            fill = ws.cell(r, c).fill
            if fill and fill.patternType == "solid":
                rgb = (fill.fgColor.rgb or "").upper()
                if rgb in yellow_rgbs:
                    is_header = True
        except Exception:
            pass
        if isinstance(txt, str) and title_re.match(txt.strip()):
            is_header = True
        if is_header:
            cols.append(c)
    return cols

def run_matchups(xlsm_path: Path, project_root: Path, cfg: Dict[str, Any]) -> None:
    gb = cfg.get("gameboard")
    if not gb: return

    out_rel = (gb.get("out_rel") or "").lstrip(r"\\/") or "data/mlb/latest/matchups"
    yellow_rgbs = {str(x).upper() for x in gb.get("header_yellow_rgb", ["FFFFE699","FFFFF2CC","FFFFFF00"])}
    title_re = re.compile(gb.get("title_regex", r"^[A-Z]{2,3}\s*@\s*[A-Z]{2,3}$"))

    # pick dashboard sheet (case-insensitive, partial ok)
    wb = load_workbook(xlsm_path, data_only=True, read_only=True, keep_links=False)
    try:
        want = gb.get("sheet") or ["MLB Dashboard", "Game Dashboard", "Dashboard"]
        want_list = [want] if isinstance(want, str) else list(want)

        def pick_sheet(want_list: List[str]) -> Optional[str]:
            if not want_list: return None
            lowmap = {s.lower(): s for s in wb.sheetnames}
            for w in want_list:
                if w in wb.sheetnames: return w
                if w.lower() in lowmap: return lowmap[w.lower()]
            for w in want_list:
                wl = w.lower()
                for actual in wb.sheetnames:
                    if wl in actual.lower():
                        return actual
            return None

        sheet_name = pick_sheet(want_list) or wb.sheetnames[0]
        print(f"• MLB Matchups: using sheet '{sheet_name}'")
        ws = wb[sheet_name]
        max_row, max_col = ws.max_row, ws.max_column

        games: List[Dict[str, Any]] = []
        r = 1
        while r <= max_row:
            header_cols = _find_header_cols_in_row(ws, r, max_col, yellow_rgbs, title_re)
            if not header_cols:
                r += 1
                continue

            header_cols_sorted = sorted(header_cols)
            for idx, c_start in enumerate(header_cols_sorted):
                c_end = (header_cols_sorted[idx + 1] - 1) if idx + 1 < len(header_cols_sorted) else max_col

                # header/title for this window
                title_line = _row_text_range(ws, r, c_start, c_end)
                title = (title_line.split("|", 1)[0] or "").strip()
                m = title_re.match(title)
                if not m:
                    continue
                away, home = m.group(1), m.group(2)

                g: Dict[str, Any] = {
                    "away": away,
                    "home": home,
                    "ou": None,
                    "spread_home": None,
                    "ml_home": None,
                    "ml_away": None,
                    "imp_home": None,
                    "imp_away": None,
                    "weather": {"temp_f": None, "wind_mph": None, "desc": None, "is_dome": None},
                    "team_blocks": {
                        "away": {"header": away, "lines": []},
                        "home": {"header": home, "lines": []},
                    },
                }

                # Walk down inside the window until we hit the team-bar row like "SEA (4.2) | TB (3.9)"
                k = r + 1
                team_bar_row = None
                while k <= max_row:
                    vals = [_cell(ws, k, c) for c in range(c_start, c_end + 1)]
                    left  = next((x for x in vals if x), "")
                    right = next((x for x in reversed(vals) if x), "")
                    if not (left or right):
                        k += 1
                        continue

                    # Team bar heuristic: looks like "AAA (x.x)" on each side
                    mL = re.match(r"^\s*([A-Z]{2,3})\s*\(([0-9.]+)\)", left or "")
                    mR = re.match(r"^\s*([A-Z]{2,3})\s*\(([0-9.]+)\)", right or "")
                    if mL and mR:
                        g["team_blocks"]["away"]["header"] = f"{mL.group(1)} ({mL.group(2)})"
                        g["team_blocks"]["home"]["header"] = f"{mR.group(1)} ({mR.group(2)})"
                        try:
                            g["imp_away"] = float(mL.group(2))
                            g["imp_home"] = float(mR.group(2))
                        except Exception:
                            pass
                        team_bar_row = k
                        break

                    # Parse meta rows (O/U, ML, Spread, Totals, Weather) if you include them
                    whole = " | ".join([x for x in vals if x])
                    U = whole.upper()
                    if "O/U" in U:
                        m_ou = re.search(r"O/?U:\s*([0-9.]+)", whole, flags=re.I)
                        if m_ou: g["ou"] = float(m_ou.group(1))
                        for tm, ml in re.findall(r"\b([A-Z]{2,3})\s*ML:\s*([+-]?\d+)", whole, flags=re.I):
                            if tm.upper() == away: g["ml_away"] = int(ml)
                            if tm.upper() == home: g["ml_home"]  = int(ml)
                    elif "SPREAD" in U:
                        mH = re.search(r"SPREAD:\s*([+-]?[0-9.]+)", whole, flags=re.I)
                        if mH: g["spread_home"] = float(mH.group(1))
                    elif "TOTAL" in U:
                        mA = re.search(rf"{away}\s*([0-9.]+)", whole, flags=re.I)
                        mH = re.search(rf"{home}\s*([0-9.]+)", whole, flags=re.I)
                        if mA: g["imp_away"] = float(mA.group(1))
                        if mH: g["imp_home"]  = float(mH.group(1))
                    elif "WEATHER" in U:
                        is_dome = "dome" in U
                        g["weather"]["is_dome"] = is_dome
                        g["weather"]["desc"] = None if is_dome else whole.replace("|"," ").strip()

                    k += 1

                if not team_bar_row:
                    continue

                # Collect left/right lines until a new header in this window or double-blank
                k = team_bar_row + 1
                blanks = 0
                while k <= max_row:
                    row_hdr_cols = _find_header_cols_in_row(ws, k, c_end, yellow_rgbs, title_re)
                    row_hdr_cols = [c for c in row_hdr_cols if c_start <= c <= c_end]
                    if row_hdr_cols:
                        break

                    vals = [_cell(ws, k, c) for c in range(c_start, c_end + 1)]
                    left  = next((x for x in vals if x), "")
                    right = next((x for x in reversed(vals) if x), "")

                    # bail if we see another team-bar row
                    if re.match(r"^\s*[A-Z]{2,3}\s*\([0-9.]+\)", left or "") and re.match(r"^\s*[A-Z]{2,3}\s*\([0-9.]+\)", right or ""):
                        break

                    if not left and not right:
                        blanks += 1
                        if blanks >= 2:
                            break
                        k += 1
                        continue

                    blanks = 0
                    if left:  g["team_blocks"]["away"]["lines"].append(left)
                    if right: g["team_blocks"]["home"]["lines"].append(right)
                    k += 1

                # Backfill OU if implieds are present
                if g.get("ou") is None and all(isinstance(g.get(k2), (int, float)) for k2 in ("imp_home","imp_away")):
                    g["ou"] = float(g["imp_home"]) + float(g["imp_away"])

                games.append(g)

            r += 1

        out_path = (project_root / "public" / Path(out_rel)).with_suffix(".json")
        ensure_parent(out_path)
        out_path.write_text(json.dumps(games, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"✔️  JSON → {out_path}  (games: {len(games)})")
    finally:
        wb.close()


# --------------------------------- config --------------------------------

def _choose_project_root(arg_proj: Optional[str]) -> Path:
    if arg_proj:
        p = Path(arg_proj).resolve()
        if (p / "public").exists():
            return p
        print(f"⚠️  --project '{p}' has no /public. Falling back to script root.", file=sys.stderr)
    if (ROOT / "public").exists():
        return ROOT
    print("ERROR: could not find a project root with /public.", file=sys.stderr)
    sys.exit(1)


# --------------------------------- main ---------------------------------

def main() -> None:
    print(">>> MLB Exporter (tasks + cheatsheets + matchups)")
    ap = argparse.ArgumentParser(description="Export MLB Excel workbook to site data files (CSV/JSON).")
    ap.add_argument("--xlsm",    default=DEFAULT_XLSM,   help="Path to the source workbook (.xls/.xlsx/.xlsm)")
    ap.add_argument("--project", default=DEFAULT_PROJ,   help="Path to project root (contains /public)")
    ap.add_argument("--config",  default=DEFAULT_CONFIG, help="Path to exporter config JSON")
    args = ap.parse_args()

    xlsm_path     = Path(args.xlsm).resolve()
    project_root  = _choose_project_root(args.project)
    config_path   = Path(args.config).resolve()

    if not xlsm_path.exists():
        print(f"ERROR: workbook not found: {xlsm_path}", file=sys.stderr); sys.exit(1)
    if not config_path.exists():
        print(f"ERROR: config not found: {config_path}", file=sys.stderr); sys.exit(1)

    staged_xlsm, temp_dir = _stage_copy_for_read(xlsm_path)

    try:
        cfg = json.loads(config_path.read_text(encoding="utf-8-sig"))

        tasks = cfg.get("tasks", [])
        if not isinstance(tasks, list):
            print("ERROR: config 'tasks' must be an array.", file=sys.stderr); sys.exit(1)

        for t in tasks:
            sheet = t.get("sheet")
            print(f"\n=== TASK: sheet='{sheet}' | out='{t.get('out_rel','?')}' ===")
            try:
                run_task(staged_xlsm, project_root, t)
            except Exception as e:
                print(f"⚠️  SKIP: task failed: {e}")

        print("\n=== CHEAT SHEET ===")
        try: run_cheatsheets(staged_xlsm, project_root, cfg)
        except Exception as e: print(f"⚠️  SKIP cheatsheets: {e}")

        print("\n=== MATCHUPS (MLB Dashboard) ===")
        try: run_matchups(staged_xlsm, project_root, cfg)
        except Exception as e: print(f"⚠️  SKIP matchups: {e}")

        print("\nDone.")
    finally:
        try: shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception: pass


if __name__ == "__main__":
    main()
