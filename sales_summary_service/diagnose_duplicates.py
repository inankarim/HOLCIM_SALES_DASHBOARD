#!/usr/bin/env python3
"""
diagnose_duplicates.py
=======================
For a given list of SAP IDs, shows every row that SAP ID has in each source
file (Customer Name + Territory only, to avoid dumping sensitive sales
figures) so we can see whether the duplication is a clean 1-to-1 match
(same set of Customer Names in both files -> should merge on SAP ID +
Customer Name) or something messier.

Usage:
    python3 diagnose_duplicates.py <supercrete_file.xlsx> <holcim_file.xlsx> SAP_ID [SAP_ID ...]
"""

import sys

from sales_summary_agent import classify_files, extract_customer_info


def show(loaded, sap_id: str, label: str) -> None:
    info = extract_customer_info(loaded)
    info["SAP ID"] = info["SAP ID"].astype(str).str.strip()
    rows = info[info["SAP ID"] == sap_id]
    print(f"\n  {label} — {len(rows)} row(s) for SAP ID {sap_id}:")
    for _, r in rows.iterrows():
        print(f"    Customer Name: {r['Customer Name']!r:40}  Territory: {r['Territory']!r}")


def main() -> None:
    if len(sys.argv) < 4:
        print("Usage: python3 diagnose_duplicates.py <supercrete_file.xlsx> <holcim_file.xlsx> SAP_ID [SAP_ID ...]")
        sys.exit(1)

    path_a, path_b = sys.argv[1], sys.argv[2]
    sap_ids = sys.argv[3:]

    file1, file2 = classify_files(path_a, path_b)

    for sap_id in sap_ids:
        print(f"\n{'=' * 60}\nSAP ID: {sap_id}")
        show(file1, sap_id, "File 1 (PLC/Powercrete)")
        show(file2, sap_id, "File 2 (PCC+OPC/HWP/HCG)")


if __name__ == "__main__":
    main()
