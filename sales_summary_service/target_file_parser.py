#!/usr/bin/env python3
"""
target_file_parser.py
======================
Standalone parser for the monthly Target upload — completely independent
of sales_summary_agent.py / the two-file sales merge engine. Do not import
from or modify that module; this is a separate pipeline with its own file
shape, its own validation rules, and its own output table (sales_targets).

Input: ONE uploaded file (single monthly export), expected to contain rows
shaped like:

    Region | Area | Territory | TSM/TSE | Customer Type | Brand | Status | Value

Rules:
  - Only rows where Status == "Target" (case-insensitive) are kept.
  - customer_type must normalize to exactly 'D2R', 'Distributor', or 'B2B'.
  - brand must normalize to one of: Total, Holcim, HWP, HCG, Supercrete,
    Supercrete Plus, Powercrete.
  - D2R rows must carry brand == 'Total' (no per-product D2R target exists).
  - Distributor and B2B rows carry per-brand targets (any of the real
    brand values) — B2B is handled identically to Distributor downstream,
    it is simply a distinct customer_type in the destination table.
  - Value must be numeric. A blank/missing Value cell means "no target set
    for this brand" and is treated as 0, not an error — only genuinely
    non-numeric text (e.g. "TBD") raises.
  - Duplicate (region, area, territory, tsm_tse, customer_type, brand) rows
    within the file are summed together, not kept as separate rows, since
    the destination table's UNIQUE constraint is keyed on exactly that
    combination.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import pandas as pd

REQUIRED_ALIASES = {
    "region": ["region"],
    "area": ["area"],
    "territory": ["territory"],
    "tsm_tse": ["tsm/tse", "tsm tse"],
    "customer_type": ["customer type"],
    "brand": ["brand"],
    "status": ["status"],
    "value": ["value", "target value"],
}

VALID_CUSTOMER_TYPES = {"d2r": "D2R", "distributor": "Distributor", "b2b": "B2B"}

# customer_type values that carry per-brand targets (Holcim, HWP, HCG,
# Supercrete, Supercrete Plus, Powercrete) rather than D2R's single
# combined 'Total' number. B2B behaves like Distributor here —
# brand-level targets, no forced brand == 'Total'.
PER_BRAND_CUSTOMER_TYPES = {"Distributor", "B2B"}

VALID_BRANDS = {
    "total": "Total",
    "holcim": "Holcim",
    "hwp": "HWP",
    "hcg": "HCG",
    "supercrete": "Supercrete",
    "supercrete plus": "Supercrete Plus",
    "powercrete": "Powercrete",
}

GROUP_COLS = ["region", "area", "territory", "tsm_tse", "customer_type", "brand"]


class TargetFileError(Exception):
    """Raised with a clear, user-facing message for a bad target file."""


def _normalize_header(name: object) -> str:
    if name is None:
        return ""
    text = str(name).replace("\n", " ").replace("\r", " ")
    return re.sub(r"\s+", " ", text).strip().lower()


def _find_column(lookup: dict[str, str], aliases: list[str]) -> str | None:
    for alias in aliases:
        if alias in lookup:
            return lookup[alias]
    return None


def _load_raw(path: str) -> pd.DataFrame:
    lower = path.lower()
    if lower.endswith((".xlsx", ".xls")):
        return pd.read_excel(path, dtype=object)
    if lower.endswith(".csv"):
        return pd.read_csv(path, dtype=object)
    raise TargetFileError(f"Unsupported file type for '{path}' — use .xlsx, .xls, or .csv.")


@dataclass
class ParsedTargets:
    rows: pd.DataFrame  # region, area, territory, tsm_tse, customer_type, brand, target_value
    skipped_non_target_rows: int
    row_count: int


def parse_target_file(path: str) -> ParsedTargets:
    """Parse+validate the single uploaded target file and collapse to one
    row per (region, area, territory, tsm_tse, customer_type, brand) by
    summing target_value wherever the file has duplicates of that
    combination.
    """
    raw = _load_raw(path)

    lookup: dict[str, str] = {}
    for col in raw.columns:
        norm = _normalize_header(col)
        if norm and norm not in lookup:
            lookup[norm] = col

    missing = []
    resolved: dict[str, str] = {}
    for canonical, aliases in REQUIRED_ALIASES.items():
        col = _find_column(lookup, aliases)
        if col is None:
            missing.append(f"{canonical} (expected one of: {', '.join(aliases)})")
        else:
            resolved[canonical] = col

    if missing:
        raise TargetFileError(
            "The following required columns were not found in the target file:\n  - "
            + "\n  - ".join(missing)
        )

    df = pd.DataFrame({canonical: raw[col] for canonical, col in resolved.items()})
    df.dropna(how="all", inplace=True)

    for col in ("region", "area", "territory", "tsm_tse", "customer_type", "brand", "status"):
        df[col] = df[col].astype(str).str.strip()

    is_target_row = df["status"].str.lower() == "target"
    skipped = int((~is_target_row).sum())
    df = df[is_target_row].drop(columns=["status"]).reset_index(drop=True)

    if df.empty:
        raise TargetFileError("No rows with Status = 'Target' were found in the file.")

    ct_key = df["customer_type"].str.lower()
    bad_ct = sorted(set(df.loc[~ct_key.isin(VALID_CUSTOMER_TYPES), "customer_type"]))
    if bad_ct:
        raise TargetFileError(
            "Unrecognized Customer Type value(s) (expected 'D2R', 'Distributor', or 'B2B'): "
            + ", ".join(bad_ct)
        )
    df["customer_type"] = ct_key.map(VALID_CUSTOMER_TYPES)

    brand_key = df["brand"].str.lower()
    bad_brand = sorted(set(df.loc[~brand_key.isin(VALID_BRANDS), "brand"]))
    if bad_brand:
        raise TargetFileError(
            "Unrecognized Brand value(s) (expected one of: "
            + ", ".join(sorted(set(VALID_BRANDS.values()))) + "): "
            + ", ".join(bad_brand)
        )
    df["brand"] = brand_key.map(VALID_BRANDS)

    bad_d2r = df[(df["customer_type"] == "D2R") & (df["brand"] != "Total")]
    if not bad_d2r.empty:
        rows = bad_d2r[["territory", "brand"]].drop_duplicates().values.tolist()
        raise TargetFileError(
            "D2R rows must have Brand = 'Total'. Found otherwise for: "
            + ", ".join(f"{t} ({b})" for t, b in rows[:10])
        )

    # A blank/missing Value cell means "no target set for this brand" and
    # should collapse to 0, not be treated as an error. Only genuinely
    # non-numeric text (e.g. "TBD", a stray note) should still raise.
    raw_value = df["value"]
    cleaned = raw_value.astype(str).str.replace(",", "", regex=False).str.strip()
    is_blank = raw_value.isna() | (cleaned == "") | (cleaned.str.lower() == "nan")

    df["target_value"] = pd.to_numeric(cleaned, errors="coerce")
    df.loc[is_blank, "target_value"] = 0

    bad_values = df[df["target_value"].isna() & ~is_blank]
    if not bad_values.empty:
        rows = bad_values[["territory", "brand"]].drop_duplicates().values.tolist()
        raise TargetFileError(
            "Non-numeric Value found for: "
            + ", ".join(f"{t} ({b})" for t, b in rows[:10])
        )
    df.drop(columns=["value"], inplace=True)

    grouped = df.groupby(GROUP_COLS, as_index=False)["target_value"].sum()

    return ParsedTargets(
        rows=grouped,
        skipped_non_target_rows=skipped,
        row_count=len(grouped),
    )