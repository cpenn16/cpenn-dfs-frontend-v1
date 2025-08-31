#!/usr/bin/env python3
"""
Export selected sheets from an Excel .xlsm workbook into CSV and/or JSON files.

- Robust filtering & formatting retained from your version.
- run_cheatsheets finds each cheat-sheet block by its title cell
  and exports one JSON table per yellow header block.
- run_site_ids scans the Import sheet for "FD IDs" / "DK IDs" blocks
  and writes a compact JSON mapping used by the app to format exported CSV
  driver strings as "Name (ID)" for DK/FD.
- NEW: Stages a temp copy of the workbook so Excel can stay open while reading.
- NEW: More verbose logging (paths, sheet list, each task) for easy debugging.
"""

from __future__ import annotations
import argparse
import json
from pathlib import Path
import re
import sys
import shutil
import tempfile
from typing import Iterable, List, Dict, Any, Optional, Union

import numpy as np
import pandas as pd

# --------------------- DEFAULTS ---------------------
DEFAULT_XLSM   = r"C:\Users\cpenn\Dropbox\Sports Models\2025 NASCAR\Cup Southern 500 Darlington.xlsm"
DEFAULT_PROJ   = r"C:\Users\cpenn\Downloads\cpenn-dfs_frontend-v1"
DEFAULT_CONFIG = r"C:\Users\cpenn\Downloads\cpenn-dfs_frontend-v1\scripts\configs\nascar_cup.json"
# ---------------------------------------------------


# -------------------- utilities --------------------
def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

def _stage_copy_for_read(src: Path) -> tuple[Path, Path]:
    """Copy workbook to a temp folder so we can read while Excel remains open."""
    tmpdir = Path(tempfile.mkdtemp(prefix="nascar_export_"))
    dst = tmpdir / src.name
    shutil.copy2(src, dst)
    return dst, tmpdir

def _excel_col_to_idx(label: str) -> int:
    s = re.sub(r"[^A-Za-z]", "", str(label)).upper()
    if not s:
        return 0
    n = 0
    for ch in s:
        n = n * 26 + (ord(ch) - ord("A") + 1)
    return n - 1

def _slice_by_range(df: pd.DataFrame, rng: str) -> pd.DataFrame:
    text = str(rng).replace(" ", "")
    parts = re.split(r"[-:]", text)
    if len(parts) != 2:
        raise ValueError(f"Bad keep_range '{rng}'")
    a, b = parts
    i0, i1 = _excel_col_to_idx(a), _excel_col_to_idx(b)
    if i1 < i0:
        i0, i1 = i1, i0
    return df.iloc[:, i0 : i1 + 1]

def dedup(names: Iterable) -> List[str]:
    seen: Dict[str,int] = {}
    out: List[str] = []
    for i, raw in enumerate(list(names)):
        if raw is None:
            s = ""
        else:
            try:
                s = "" if pd.isna(raw) else str(raw).strip()
            except Exception:
                s = str(raw).strip()
        try:
            f = float(s)
            if abs(f - round(f)) < 1e-9:
                s = str(int(round(f)))
        except Exception:
            pass
        sl = s.lower()
        if (s == "") or (sl == "nan") or (sl == "nat") or sl.startswith("unnamed"):
            name = f"col_{i+1}"
        else:
            name = s
        if name in seen:
            seen[name] += 1
            name = f"{name}_{seen[name]}"
        else:
            seen[name] = 0
        out.append(name)
    return out

def to_json_records(df: pd.DataFrame) -> str:
    df2 = df.astype(object).where(pd.notna(df), "")
    return df2.to_json(orient="records", force_ascii=False, indent=2)


# -------------------- reading helpers --------------------
def read_with_header_and_start(xlsm_path: Path, sheet: str,
                               header_row: Optional[int],
                               data_start_row: Optional[int]) -> pd.DataFrame:
    raw = pd.read_excel(xlsm_path, sheet_name=sheet, engine="openpyxl", header=None)
    if (header_row is not None) and (data_start_row is not None):
        hdr = max(1, header_row) - 1
        start = max(1, data_start_row) - 1
        names = dedup(raw.iloc[hdr])
        df = raw.iloc[start:].copy()
        df.columns = names
        return df
    # heuristic header guess
    scan = min(8, len(raw))
    best_row, best_nonempty = 0, -1
    for r in range(scan):
        nonempty = sum(1 for v in list(raw.iloc[r]) if pd.notna(v) and str(v).strip() != "")
        if nonempty > best_nonempty:
            best_nonempty, best_row = nonempty, r
    names = dedup(raw.iloc[best_row])
    df = raw.iloc[best_row + 1:].copy()
    df.columns = names
    return df


# -------------------- formatting helpers --------------------
def maybe_apply_column_mapping(df: pd.DataFrame, mapping: Dict[str,str] | None) -> pd.DataFrame:
    if not mapping:
        return df
    existing = {src: dst for src, dst in mapping.items() if src in df.columns}
    if existing:
        df = df.rename(columns=existing)
    return df

def reorder_columns_if_all_present(df: pd.DataFrame, order: List[str] | None) -> pd.DataFrame:
    if not order:
        return df
    if all(col in df.columns for col in order):
        return df[order]
    return df

def _collect_percent_columns(columns: List[str], cfg: Dict[str, Any]) -> List[str]:
    explicit = [str(x) for x in (cfg.get("percent_columns") or [])]
    contains = [str(x).lower() for x in (cfg.get("percent_name_contains") or [])]
    col_lowers = {c.lower(): c for c in columns}
    out: set[str] = set()
    for name in explicit:
        low = name.lower()
        if low in col_lowers:
            out.add(col_lowers[low])
    if contains:
        for c in columns:
            cl = c.lower()
            if any(sub in cl for sub in contains):
                out.add(c)
    return list(out)

def format_percents(df: pd.DataFrame, percent_cols: List[str], decimals: int, as_string: bool) -> pd.DataFrame:
    for col in percent_cols:
        if col not in df.columns:
            continue
        s = pd.to_numeric(df[col], errors="coerce")
        if s.dropna().empty:
            continue
        max_abs = float(np.nanmax(np.abs(s.values)))
        if max_abs <= 1 + 1e-12:
            s = s * 100.0
        if as_string:
            df[col] = s.map(lambda v: "" if pd.isna(v) else f"{v:.{decimals}f}%")
        else:
            df[col] = s.round(decimals)
    return df

def round_numeric(df: pd.DataFrame, decimals: int, skip_cols: set[str]) -> pd.DataFrame:
    for col in df.columns:
        if col in skip_cols:
            continue
        s = pd.to_numeric(df[col], errors="coerce")
        if s.notna().sum() == 0:
            continue
        non_na = s.dropna()
        if len(non_na) and np.all(np.isclose(non_na % 1, 0)):
            df[col] = s.round(0).astype("Int64")
        else:
            df[col] = s.round(decimals)
    return df

def round_integer_columns(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    if not cols:
        return df
    for col in cols:
        if col in df.columns:
            s = pd.to_numeric(df[col], errors="coerce")
            if s.notna().any():
                df[col] = s.round(0).astype("Int64")
    return df


# -------------------- filtering --------------------
def _resolve_col(df: pd.DataFrame, name: str) -> Optional[str]:
    if name in df.columns:
        return name
    low_map = {c.lower(): c for c in df.columns}
    return low_map.get(name.lower())

def _coerce_num(series: pd.Series) -> pd.Series:
    if series.dtype == object:
        series = series.astype(str).str.strip().replace({"": np.nan})
    return pd.to_numeric(series, errors="coerce")

def _coerce_str(series: pd.Series, case_sensitive: bool) -> pd.Series:
    s = series.astype(str).str.strip()
    if not case_sensitive:
        s = s.str.lower()
    return s

def _apply_leaf_filter(df: pd.DataFrame, f: Dict[str, Any]) -> pd.Series:
    col_name = _resolve_col(df, f.get("column", ""))
    if not col_name:
        return pd.Series([True]*len(df), index=df.index)

    op = (f.get("op") or "contains").lower()
    cs = bool(f.get("case_sensitive", False))
    series = df[col_name]

    if op == "nonempty":
        if series.dtype == object:
            return series.astype(str).str.strip().ne("").fillna(False)
        return series.notna()

    if op in {"equals", "not_equals", "contains", "not_contains", "startswith", "endswith", "regex"}:
        sval = f.get("value", "")
        s = _coerce_str(series, cs)
        val = str(sval).strip()
        if not cs:
            val = val.lower()
        if op == "equals":        res = s.eq(val)
        elif op == "not_equals":  res = s.ne(val)
        elif op == "contains":    res = s.str.contains(val, na=False)
        elif op == "not_contains":res = ~s.str.contains(val, na=False)
        elif op == "startswith":  res = s.str.startswith(val, na=False)
        elif op == "endswith":    res = s.str.endswith(val, na=False)
        elif op == "regex":
            flags = 0 if cs else re.IGNORECASE
            try:
                pat = re.compile(val, flags)
            except Exception:
                return pd.Series([True]*len(df), index=df.index)
            res = s.str.match(pat).fillna(False)
        else:
            res = pd.Series([True]*len(df), index=df.index)
        return res.fillna(False)

    s = _coerce_num(series)
    if op in {"gt","gte","lt","lte"}:
        v = pd.to_numeric(pd.Series([f.get("value")]), errors="coerce").iloc[0]
        if pd.isna(v):
            return pd.Series([True]*len(df), index=df.index)
        if op == "gt":  res = s >  v
        if op == "gte": res = s >= v
        if op == "lt":  res = s <  v
        if op == "lte": res = s <= v
        return res.fillna(False)

    if op in {"in","not_in"}:
        vals = f.get("values", [])
        num_vals = pd.to_numeric(pd.Series(vals), errors="coerce")
        if num_vals.notna().all():
            set_vals = set(num_vals.tolist())
            res = s.isin(set_vals)
        else:
            ss = _coerce_str(series, cs)
            set_vals = {(str(x).strip() if cs else str(x).strip().lower()) for x in vals}
            res = ss.isin(set_vals)
        if op == "not_in":
            res = ~res
        return res.fillna(False)

    return pd.Series([True]*len(df), index=df.index)

def _apply_filters(df: pd.DataFrame, filters: Union[List, Dict]) -> pd.DataFrame:
    def eval_filter(f) -> pd.Series:
        if isinstance(f, dict) and ("any_of" in f or "all_of" in f):
            if "any_of" in f:
                parts = [eval_filter(x) for x in (f.get("any_of") or [])]
                return pd.concat(parts, axis=1).any(axis=1) if parts else pd.Series([True]*len(df), index=df.index)
            if "all_of" in f:
                parts = [eval_filter(x) for x in (f.get("all_of") or [])]
                return pd.concat(parts, axis=1).all(axis=1) if parts else pd.Series([True]*len(df), index=df.index)
        return _apply_leaf_filter(df, f)

    if not filters:
        return df
    if isinstance(filters, dict) and ("any_of" in filters or "all_of" in filters):
        mask = eval_filter(filters)
        return df[mask]
    if isinstance(filters, list):
        masks = [eval_filter(f) for f in filters]
        mask = pd.concat(masks, axis=1).all(axis=1) if masks else pd.Series([True]*len(df), index=df.index)
        return df[mask]
    return df


# -------------------- export core --------------------
def export_one(df: pd.DataFrame, out_csv: Optional[Path], out_json: Optional[Path]) -> None:
    if out_csv:
        ensure_parent(out_csv)
        df_csv = df.astype(object).where(pd.notna(df), "")
        df_csv.to_csv(out_csv, index=False, encoding="utf-8-sig")
        print(f"✔️  CSV  → {out_csv}")
    if out_json:
        ensure_parent(out_json)
        out_json.write_text(to_json_records(df), encoding="utf-8")
        print(f"✔️  JSON → {out_json}")

def run_task(xlsm_path: Path, project_root: Path, task: Dict[str, Any]) -> None:
    sheet = task.get("sheet")
    if not sheet:
        print("  ⚠ SKIP: task missing 'sheet'.")
        return

    df = read_with_header_and_start(
        xlsm_path=xlsm_path,
        sheet=sheet,
        header_row=task.get("header_row"),
        data_start_row=task.get("data_start_row"),
    )

    df = df.dropna(axis=1, how="all").dropna(axis=0, how="all")

    keep_ranges_spec = task.get("keep_ranges") or task.get("keep_range")
    if keep_ranges_spec:
        rng_list = [keep_ranges_spec] if isinstance(keep_ranges_spec, str) else list(keep_ranges_spec)
        col_order: List[str] = []
        for rng in rng_list:
            sub = _slice_by_range(df, rng)
            for c in list(sub.columns):
                if c not in col_order:
                    col_order.append(c)
        df = df[col_order]

    keep_cols_src: List[str] = task.get("keep_columns_sheet_order", [])
    if keep_cols_src:
        df = df[[c for c in df.columns if c in keep_cols_src]]

    df = maybe_apply_column_mapping(df, task.get("column_mapping"))
    df = reorder_columns_if_all_present(df, task.get("column_order"))

    df = _apply_filters(df, task.get("filters"))

    pct_cols       = _collect_percent_columns(list(df.columns), task)
    decimals       = int(task.get("round_decimals", 1))
    pct_as_string  = bool(task.get("percent_as_string", True))
    df = format_percents(df, pct_cols, decimals, as_string=pct_as_string)

    df = round_numeric(df, decimals, skip_cols=set(pct_cols))

    # Optional: per-column integer rounding (e.g., Fair Odds columns)
    df = round_integer_columns(df, [str(x) for x in (task.get("integer_columns") or [])])

    out_rel = (task.get("out_rel", "") or "").lstrip(r"\/")
    if not out_rel:
        print(f"  ⚠ SKIP: task for sheet '{sheet}' missing 'out_rel'.")
        return

    base = project_root / "public" / Path(out_rel)
    fmt  = str(task.get("format", "json")).lower()
    csv_path  = base.with_suffix(".csv")  if fmt in ("csv", "both")  else None
    json_path = base.with_suffix(".json") if fmt in ("json", "both") else None

    export_one(df, csv_path, json_path)


# -------------------- cheatsheets exporter --------------------
def run_cheatsheets(xlsm_path: Path, project_root: Path, cfg: Dict[str, Any]) -> None:
    """
    Export cheatsheets.json from a sheet of yellow-header blocks.

    Config:
      "cheatsheets": {
        "sheet": "Cheat Sheet",
        "out_rel": "data/nascar/cup/latest/cheatsheets",
        "tables": [{ "title": "...", "width": 4 }, ...],
        "title_match_ci": true,
        "limit_rows": 10
      }
    """
    cs = cfg.get("cheatsheets")
    if not cs:
        return

    sheet      = cs.get("sheet") or "Cheat Sheet"
    out_rel    = (cs.get("out_rel") or "").lstrip(r"\/")
    title_ci   = bool(cs.get("title_match_ci", True))
    limit_rows = int(cs.get("limit_rows", 10))

    if not out_rel:
        print("⚠️  SKIP cheatsheets: missing out_rel")
        return

    raw = pd.read_excel(xlsm_path, sheet_name=sheet, engine="openpyxl", header=None, dtype=object)
    if raw is None or raw.empty:
        print("⚠️  SKIP cheatsheets: empty sheet"); return
    n_rows, n_cols = raw.shape

    def norm(v: Any) -> str:
        s = "" if v is None or (isinstance(v, float) and pd.isna(v)) else str(v)
        s = s.strip()
        return s.lower() if title_ci else s

    tables_cfg = cs.get("tables") or []
    all_titles_norm = {norm(str(t.get("title") or "")) for t in tables_cfg if t.get("title")}

    # index every cell by content
    index: Dict[str, List[tuple]] = {}
    for r in range(n_rows):
        for c, v in enumerate(raw.iloc[r].tolist()):
            s = norm(v)
            if s:
                index.setdefault(s, []).append((r, c))

    tables_out: List[Dict[str, Any]] = []

    for i, t in enumerate(tables_cfg):
        title = str(t.get("title") or f"Table {i+1}").strip()
        width = max(1, int(t.get("width", 3)))

        locs = index.get(norm(title), [])
        if not locs:
            print(f"⚠️  cheatsheets: title not found: '{title}'")
            continue

        # The yellow row *with the title text* IS the header row
        start_r, start_c = min(locs, key=lambda rc: (rc[0], rc[1]))
        c0, c1 = start_c, min(start_c + width, n_cols)

        header_r = start_r              # <- header is the same row as the title
        data_r0  = header_r + 1         # data starts immediately below

        if header_r >= n_rows or data_r0 >= n_rows:
            print(f"⚠️  cheatsheets: '{title}' missing header/data rows")
            continue

        # find end: stop at blank row, next title, or after limit_rows
        r = data_r0
        taken = 0
        while r < n_rows and taken < limit_rows:
            row_slice = raw.iloc[r, c0:c1]
            is_blank = all((str(x).strip() == "" or pd.isna(x)) for x in row_slice.tolist())
            if is_blank:
                break
            first_cell = norm(raw.iloc[r, c0])
            if first_cell in all_titles_norm:
                break
            r += 1
            taken += 1
        data_r1 = r

        # headers from the yellow row
        header_vals = [str(x).strip() for x in raw.iloc[header_r, c0:c1].tolist()]
        cols = dedup([hv if hv != "" else f"col_{j+1}" for j, hv in enumerate(header_vals)])

        # normalize column names
        if cols:
            if cols[0] == "" or cols[0].lower().startswith("top 10"):
                cols[0] = "Driver"
        if cols and (cols[-1] == "" or re.fullmatch(r"[\d\.\%kK,]+", cols[-1])):
            cols[-1] = "Value"

        sub = raw.iloc[data_r0:data_r1, c0:c1].copy()
        if sub.empty:
            print(f"⚠️  cheatsheets: '{title}' slice is empty")
            continue

        sub.columns = cols
        sub = sub.dropna(axis=0, how="all")
        sub = sub.astype(object).where(pd.notna(sub), "")

        # Percent blocks: Win% / T3% / T5% / T10% => format 'Value' (or last col) as X.Y%
        title_l = title.lower()
        if any(k in title_l for k in ["win%", "t3%", "t5%", "t10%"]) and sub.shape[1] >= 2:
            value_col = None
            for c in sub.columns[::-1]:
                if c.strip().lower() == "value":
                    value_col = c
                    break
            if value_col is None:
                value_col = sub.columns[-1]
            s = pd.to_numeric(sub[value_col], errors="coerce")
            if s.notna().any():
                if float(np.nanmax(np.abs(s.values))) <= 1.5:
                    s = s * 100.0
                sub[value_col] = s.map(lambda v: "" if pd.isna(v) else f"{v:.1f}%")

        tables_out.append({
            "id":      f"t{i+1}",
            "label":   title,
            "columns": list(sub.columns),
            "rows":    sub.to_dict(orient="records"),
        })

    out_path = (project_root / "public" / Path(out_rel)).with_suffix(".json")
    ensure_parent(out_path)
    out_path.write_text(json.dumps({"tables": tables_out}, ensure_ascii=False, indent=2),
                        encoding="utf-8")
    print(f"✔️  JSON → {out_path}  (tables written: {len(tables_out)} of {len(tables_cfg)})")


# -------------------- site id exporter --------------------
def _norm_str(v: Any) -> str:
    s = "" if v is None or (isinstance(v, float) and pd.isna(v)) else str(v)
    return s.strip()

def _keyify(v: Any) -> str:
    # normalize for fuzzy-ish matches across naming variants
    return re.sub(r"[^a-z0-9]+", " ", _norm_str(v).lower()).strip()

def _scan_title_block(raw: pd.DataFrame, title: str, width: int = 3) -> Optional[pd.DataFrame]:
    """
    Find a horizontal block by a title cell (e.g. 'FD IDs') where the *next row*
    is the header (Driver | ID | Driver (ID)), and rows below are data until
    a blank row is reached. Returns a DataFrame with real columns.
    """
    n_rows, n_cols = raw.shape
    tnorm = _keyify(title)
    for r in range(n_rows):
        for c in range(n_cols - (width - 1)):
            if _keyify(raw.iat[r, c]) == tnorm:
                header_r, c0, c1 = r + 1, c, c + width
                if header_r >= n_rows:
                    continue
                cols = [_norm_str(x) or f"col_{i+1}" for i, x in enumerate(raw.iloc[header_r, c0:c1])]
                data_r0 = header_r + 1
                r2 = data_r0
                while r2 < n_rows:
                    row = raw.iloc[r2, c0:c1].tolist()
                    if all((_norm_str(x) == "" for x in row)):
                        break
                    r2 += 1
                sub = raw.iloc[data_r0:r2, c0:c1].copy()
                if sub.empty:
                    return None
                sub.columns = cols
                sub = sub.dropna(axis=0, how="all")
                sub = sub.astype(object).where(pd.notna(sub), "")
                return sub
    return None

def _parse_site_id(val: Any) -> str:
    """
    Accept plain IDs or text like 'Joey Logano (39722112)' → '39722112'
    and '119626-82889' → keep as-is.
    """
    s = _norm_str(val)
    if not s:
        return ""
    m = re.search(r"\(([\d-]+)\)\s*$", s)
    if m:
        return m.group(1)
    m2 = re.fullmatch(r"[\d-]+", s)
    return m2.group(0) if m2 else s

def run_site_ids(xlsm_path: Path, project_root: Path, cfg: Dict[str, Any]) -> None:
    """
    Reads the 'Import' sheet (or a sheet you specify) and produces:
      public/<out_rel>.json  => {"dk":[{"name","id"}...], "fd":[...]}

    It expects two blocks:
      - 'FD IDs' with columns: Driver | ID | Driver (ID)
      - 'DK IDs' with columns: Driver | ID | Driver (ID)

    The function searches the whole sheet for those titles and
    stops each block at the first blank row.
    """
    scfg = cfg.get("site_ids")
    if not scfg:
        return

    sheet   = scfg.get("sheet") or "Imports"
    out_rel = (scfg.get("out_rel") or "").lstrip(r"\\/")

    if not out_rel:
        print("⚠️  SKIP site_ids: missing out_rel")
        return

    raw = pd.read_excel(xlsm_path, sheet_name=sheet, engine="openpyxl", header=None, dtype=object)
    if raw is None or raw.empty:
        print("⚠️  SKIP site_ids: empty sheet")
        return

    fd_block = _scan_title_block(raw, "FD IDs", width=3)
    dk_block = _scan_title_block(raw, "DK IDs", width=3)

    if fd_block is None and dk_block is None:
        print("⚠️  SKIP site_ids: couldn't find 'FD IDs' or 'DK IDs' blocks")
        return

    out = {"fd": [], "dk": []}

    if fd_block is not None:
        for _, row in fd_block.iterrows():
            name = _norm_str(row.get("Driver") or "")
            site_id = _parse_site_id(row.get("ID") or row.get("Driver (ID)") or "")
            if name and site_id:
                out["fd"].append({"name": name, "id": site_id})

    if dk_block is not None:
        for _, row in dk_block.iterrows():
            name = _norm_str(row.get("Driver") or "")
            site_id = _parse_site_id(row.get("ID") or row.get("Driver (ID)") or "")
            if name and site_id:
                out["dk"].append({"name": name, "id": site_id})

    # de-dupe by normalized key, keep first occurrence
    def dedupe(items: list[dict[str, str]]) -> list[dict[str, str]]:
        seen = set()
        keep = []
        for r in items:
            k = _keyify(r["name"])
            if k in seen:
                continue
            seen.add(k)
            keep.append(r)
        return keep

    out["fd"] = dedupe(out["fd"])
    out["dk"] = dedupe(out["dk"])

    out_path = (project_root / "public" / Path(out_rel)).with_suffix(".json")
    ensure_parent(out_path)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✔️  JSON → {out_path}  (dk={len(out['dk'])}, fd={len(out['fd'])})")

    # -------------------- H2H matrix exporter --------------------
def _clean_h2h_number(x: Any) -> Optional[float]:
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return None
    s = str(x).strip()
    if not s:
        return None
    s = s.replace(",", "").replace("%", "").strip()
    try:
        v = float(s)
        # heuristic: if value <= 1.5, assume it was a fraction → convert to %
        if v <= 1.5:
            return v * 100.0
        return v
    except Exception:
        return None


def run_h2h_matrix(xlsm_path: Path, project_root: Path, cfg: Dict[str, Any]) -> None:
    """
    Reads a 'Driver vs Driver' matrix and writes a JSON array of records:
      [{ "Driver": "A", "B": 51.2, "C": 48.8, ... }, ...]

    Config (optional; has safe defaults):
      "h2h_matrix": {
        "sheet": "H2H Matrix",
        "out_rel": "data/nascar/cup/latest/h2h_matrix",
        "header_row": 1,         # optional, 1-based
        "data_start_row": 2      # optional, 1-based
      }
    """
    hcfg = cfg.get("h2h_matrix", {}) or {}
    sheet   = hcfg.get("sheet") or "H2H Matrix"
    out_rel = (hcfg.get("out_rel") or "data/nascar/cup/latest/h2h_matrix").lstrip(r"\/")

    # read sheet (honor optional header/data rows; otherwise use heuristic)
    df = read_with_header_and_start(
        xlsm_path=xlsm_path,
        sheet=sheet,
        header_row=hcfg.get("header_row"),
        data_start_row=hcfg.get("data_start_row"),
    )
    if df is None or df.empty:
        print(f"⚠️  SKIP h2h_matrix: empty sheet '{sheet}'")
        return

    # make sure first column is named 'Driver'
    if df.columns.size == 0:
        print(f"⚠️  SKIP h2h_matrix: no columns detected on '{sheet}'")
        return
    if df.columns[0] != "Driver":
        df = df.rename(columns={df.columns[0]: "Driver"})

    # drop blank rows/cols and ensure driver names are strings
    df = df.dropna(axis=1, how="all").dropna(axis=0, how="all").copy()
    if "Driver" not in df.columns:
        print(f"⚠️  SKIP h2h_matrix: first column not detected as 'Driver'")
        return
    df["Driver"] = df["Driver"].astype(object).where(pd.notna(df["Driver"]), "").map(lambda s: str(s).strip())
    df = df[df["Driver"] != ""]

    # clean numeric cells; leave diagonal empty
    cols = list(df.columns)
    opp_cols = [c for c in cols if c != "Driver"]
    for c in opp_cols:
        df[c] = df[c].map(_clean_h2h_number)

    # optional: clear diagonal (Driver vs same Driver) if your sheet includes it
    diag = set(df["Driver"])
    for c in opp_cols:
        # if the column name matches a driver name, blank those cells
        if c in diag:
            mask = df["Driver"] == c
            df.loc[mask, c] = None

    # write JSON
    out_path = (project_root / "public" / Path(out_rel)).with_suffix(".json")
    ensure_parent(out_path)
    out_path.write_text(to_json_records(df), encoding="utf-8")
    print(f"✔️  JSON → {out_path}  (H2H rows: {len(df)})")

# -------------------- Finish distribution exporter (robust) --------------------
def _clean_percent_cell(x: Any) -> Optional[float]:
    """
    Accepts:
      0.143   -> 0.143  (Excel % stored as fraction)
      "14.3%" -> 14.3
      "14.3"  -> 14.3
    We'll post-scale later if we detect rows summing to ~1.
    """
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return None
    s = str(x).strip()
    if not s:
        return None
    s = s.replace(",", "").replace("%", "").strip()
    try:
        v = float(s)
        return v
    except Exception:
        return None

def run_finish_distribution(xlsm_path: Path, project_root: Path, cfg: Dict[str, Any]) -> None:
    """
    Reads a sheet like:
      Driver | 1 | 2 | 3 | ... (cells are probs either as fractions or percents)
    Writes JSON records with percentage units (0–100) and headers 'P1','P2',...
    """
    fcfg = cfg.get("finish_distribution", {}) or {}
    sheet   = fcfg.get("sheet") or "Finish Distributions"
    out_rel = (fcfg.get("out_rel") or "data/nascar/cup/latest/finish_dist").lstrip(r"\/")

    df = read_with_header_and_start(
        xlsm_path=xlsm_path,
        sheet=sheet,
        header_row=fcfg.get("header_row"),
        data_start_row=fcfg.get("data_start_row"),
    )
    if df is None or df.empty:
        print(f"⚠️  SKIP finish_distribution: empty sheet '{sheet}'")
        return

    # Ensure first column is 'Driver'
    if df.columns.size == 0:
        print(f"⚠️  SKIP finish_distribution: no columns on '{sheet}'"); return
    if df.columns[0] != "Driver":
        df = df.rename(columns={df.columns[0]: "Driver"})

    # Trim blanks
    df = df.dropna(axis=1, how="all").dropna(axis=0, how="all").copy()
    if "Driver" not in df.columns:
        print("⚠️  SKIP finish_distribution: first column is not 'Driver'"); return
    df["Driver"] = df["Driver"].astype(object).where(pd.notna(df["Driver"]), "").map(lambda s: str(s).strip())
    df = df[df["Driver"] != ""]

    # Identify position columns (e.g., "1","2",... or already "P1","P2",...)
    pos_cols_raw = [c for c in df.columns if c != "Driver"]
    # Build mapping to P{n}; keep numeric order
    pos_map = {}
    for c in pos_cols_raw:
        m = re.fullmatch(r"P?(\d+)", str(c).strip(), flags=re.IGNORECASE)
        if m:
            n = int(m.group(1))
            pos_map[c] = f"P{n}"
        else:
            # non-numeric column — keep as-is but not in the ordered list
            pass

    # Reorder columns numerically where possible
    ordered = sorted([(int(re.fullmatch(r"P?(\d+)", str(c).strip(), flags=re.IGNORECASE).group(1)), c)
                      for c in pos_cols_raw
                      if re.fullmatch(r"P?(\d+)", str(c).strip(), flags=re.IGNORECASE)],
                     key=lambda t: t[0])
    ordered_src = [c for _, c in ordered]

    # Clean numeric values
    for c in pos_cols_raw:
        df[c] = df[c].map(_clean_percent_cell)

    # Auto-detect scale: if a typical row sums to ~1, scale everything by 100
    if ordered_src:
        row_sums = df[ordered_src].sum(axis=1, skipna=True)
        med_sum = float(np.nanmedian(row_sums.values)) if len(row_sums) else np.nan
        if med_sum and med_sum <= 2.0:
            df[ordered_src] = df[ordered_src] * 100.0

    # Optional tidy rounding (1 decimal like 14.3)
    for c in ordered_src:
        df[c] = pd.to_numeric(df[c], errors="coerce").round(1)

    # Rename to P1,P2,... for clean API
    if pos_map:
        df = df.rename(columns=pos_map)

    # Keep only Driver + ordered P* columns (drop weird extras)
    keep_cols = ["Driver"] + [pos_map.get(c, c) for c in ordered_src]
    df = df[[c for c in keep_cols if c in df.columns]]

    out_path = (project_root / "public" / Path(out_rel)).with_suffix(".json")
    ensure_parent(out_path)
    out_path.write_text(to_json_records(df), encoding="utf-8")
    print(f"✔️  JSON → {out_path}  (Finish Dist rows: {len(df)}, positions: {len(keep_cols)-1})")


# -------------------- main --------------------
def main() -> None:
    ap = argparse.ArgumentParser(description="Export .xlsm sheets to site data files (CSV/JSON).")
    ap.add_argument("--xlsm",    default=DEFAULT_XLSM,   help="Path to the source .xlsm workbook")
    ap.add_argument("--project", default=DEFAULT_PROJ,   help="Path to project root (contains /public)")
    ap.add_argument("--config",  default=DEFAULT_CONFIG, help="Path to tasks config JSON")
    args = ap.parse_args()

    xlsm_path     = Path(args.xlsm).resolve()
    project_root  = Path(args.project).resolve()
    config_path   = Path(args.config).resolve()

    print(">>> NASCAR Exporter")
    print(f"  xlsm   : {xlsm_path}")
    print(f"  project: {project_root}")
    print(f"  config : {config_path}")

    if not xlsm_path.exists():
        print(f"ERROR: .xlsm not found: {xlsm_path}", file=sys.stderr); sys.exit(1)
    if not project_root.exists() or not (project_root / "public").exists():
        print(f"ERROR: project root invalid (no /public): {project_root}", file=sys.stderr); sys.exit(1)

    try:
        cfg = json.loads(config_path.read_text(encoding="utf-8-sig"))
    except Exception as e:
        print(f"ERROR: failed to parse config JSON: {e}", file=sys.stderr); sys.exit(1)

    # Stage a temp copy so Excel can remain open
    staged_xlsm, temp_dir = _stage_copy_for_read(xlsm_path)
    print(f"  staged : {staged_xlsm}")

    try:
        # validate sheets on the staged copy
        try:
            xl = pd.ExcelFile(staged_xlsm, engine="openpyxl")
            sheet_names = set(xl.sheet_names)
            print("  sheets :", ", ".join(sorted(sheet_names)))
        except Exception as e:
            print(f"ERROR: unable to open workbook: {e}", file=sys.stderr); sys.exit(1)

        tasks = cfg.get("tasks", [])
        if not tasks:
            print("ERROR: config has no 'tasks' array.", file=sys.stderr); sys.exit(1)

        print("\n=== TASKS ===")
        for t in tasks:
            sheet = t.get("sheet")
            out_rel = t.get("out_rel", "?")
            print(f"• Task sheet='{sheet}' → out='{out_rel}'")
            if not sheet:
                print("  ⚠ SKIP: task without sheet name."); continue
            if sheet not in sheet_names:
                print(f"  ⚠ SKIP: sheet '{sheet}' not found in workbook."); continue
            try:
                run_task(staged_xlsm, project_root, t)
            except Exception as e:
                print(f"  ⚠ task failed: {e}")

        print("\n=== CHEAT SHEETS ===")
        try:
            run_cheatsheets(staged_xlsm, project_root, cfg)
        except Exception as e:
            print(f"⚠️  SKIP cheatsheets: {e}")

        print("\n=== SITE IDS ===")
        try:
            run_site_ids(staged_xlsm, project_root, cfg)
        except Exception as e:
            print(f"⚠️  SKIP site_ids: {e}")

        print("\n=== H2H MATRIX ===")
        try:
            run_h2h_matrix(staged_xlsm, project_root, cfg)
        except Exception as e:
            print(f"⚠️  SKIP h2h_matrix: {e}")

        print("\nDone.")

        print("\n=== FINISH DISTRIBUTION ===")
        try:
            run_finish_distribution(staged_xlsm, project_root, cfg)
        except Exception as e:
            print(f"⚠️  SKIP finish_distribution: {e}")
    finally:
        try: shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception: pass


if __name__ == "__main__":
    main()
