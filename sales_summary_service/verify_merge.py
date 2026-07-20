#!/usr/bin/env python3
"""
verify_merge.py
================
Independently checks that Sales_Summary.xlsx correctly RELATES (outer-joins)
the two source files by SAP ID, rather than stacking/duplicating rows.

It reuses the exact same header-detection and SAP ID extraction logic as
sales_summary_agent.py, so it's checking the real thing, not an approximation.

Usage:
    python3 verify_merge.py <supercrete_file.xlsx> <holcim_file.xlsx> <Sales_Summary.xlsx>

What it reports:
    - Unique SAP ID count in each source file
    - How many SAP IDs overlap between the two source files
    - The expected output row count (union of both ID sets)
    - The actual output row count, and whether they match
    - Any SAP IDs present in a source file but missing from the output
    - Any duplicate SAP IDs in the output (there should be none)
"""

import sys

import pandas as pd

from sales_summary_agent import classify_files, extract_customer_info


def get_sap_id_set(loaded) -> set[str]:
    info = extract_customer_info(loaded)
    ids = info["SAP ID"].astype(str).str.strip()
    return set(ids.dropna()) - {"", "nan", "None"}


def main() -> None:
    if len(sys.argv) != 4:
        print("Usage: python3 verify_merge.py <supercrete_file.xlsx> <holcim_file.xlsx> <Sales_Summary.xlsx>")
        sys.exit(1)

    path_a, path_b, output_path = sys.argv[1], sys.argv[2], sys.argv[3]

    file1, file2 = classify_files(path_a, path_b)
    ids1 = get_sap_id_set(file1)
    ids2 = get_sap_id_set(file2)

    overlap = ids1 & ids2
    union = ids1 | ids2

    print(f"Unique SAP IDs in file1 ({file1.label}): {len(ids1)}")
    print(f"Unique SAP IDs in file2 ({file2.label}): {len(ids2)}")
    print(f"SAP IDs present in BOTH files (overlap): {len(overlap)}")
    print(f"Expected output rows (union, no duplicates): {len(union)}")
    print()

    out_df = pd.read_excel(output_path, header=[0, 1], dtype=object)
    # Flatten the two-row header: customer-info columns have their real name
    # in level 0 and NaN in level 1; product columns have the group name in
    # level 0 and the sub-column name in level 1. Prefer level 1 when it's a
    # real value, otherwise fall back to level 0.
    flat_cols = []
    for top, sub in out_df.columns:
        sub_str = str(sub)
        if sub_str.startswith("Unnamed") or sub_str.strip() == "" or sub_str.lower() == "nan":
            flat_cols.append(str(top))
        else:
            flat_cols.append(sub_str)
    out_df.columns = flat_cols
    out_ids = out_df["SAP ID"].astype(str).str.strip()
    out_ids_clean = out_ids.dropna()
    out_ids_clean = out_ids_clean[~out_ids_clean.isin(["", "nan", "None"])]

    print(f"Actual rows in {output_path}: {len(out_df)}")
    print(f"Unique SAP IDs in output: {out_ids_clean.nunique()}")

    match = len(out_df) == len(union)
    print()
    print("MATCH ✅" if match else "MISMATCH ❌", "— output row count", "equals" if match else "does NOT equal", "expected union count")

    # Duplicate check
    dup_mask = out_ids_clean.duplicated(keep=False)
    if dup_mask.any():
        dupes = sorted(set(out_ids_clean[dup_mask]))
        print(f"\n⚠️  {len(dupes)} SAP ID(s) appear MORE THAN ONCE in the output (should be 0):")
        print("  ", dupes[:20], "..." if len(dupes) > 20 else "")
    else:
        print("\nNo duplicate SAP IDs in output. ✅")

    # Missing check: any source ID absent from output?
    out_id_set = set(out_ids_clean)
    missing = union - out_id_set
    if missing:
        print(f"\n⚠️  {len(missing)} SAP ID(s) from the source files are MISSING from the output:")
        print("  ", sorted(missing)[:20], "..." if len(missing) > 20 else "")
    else:
        print("No customers lost — every source SAP ID appears in the output. ✅")


if __name__ == "__main__":
    main()
