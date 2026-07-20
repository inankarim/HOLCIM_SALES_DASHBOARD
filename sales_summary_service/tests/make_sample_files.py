"""Generates two synthetic sample Excel files matching the described column
fingerprints, with deliberately messy headers (line breaks, extra spaces,
reordered columns, extra ignorable columns) and overlapping + non-overlapping
SAP IDs, to prove the merge/outer-join and header-normalization logic works.
"""
import numpy as np
import pandas as pd

rng = np.random.default_rng(42)

N = 250  # rows in file 1
sap_ids_1 = [f"SAP{1000 + i}" for i in range(N)]

file1 = pd.DataFrame({
    "SAP ID": sap_ids_1,
    "Customer Name": [f"Customer {i}" for i in range(N)],
    "Customer  Type": rng.choice(["Retailer", "Dealer", "B2B"], N),  # double space, deliberately messy
    "Region": rng.choice(["Dhaka", "Chattogram", "Khulna", "Rajshahi"], N),
    "Area": rng.choice(["Area-1", "Area-2", "Area-3"], N),
    "Territory": rng.choice(["T1", "T2", "T3", "T4"], N),
    "TSM/TSE": [f"TSE-{i % 15}" for i in range(N)],
    "ASM/KAM": [f"ASM-{i % 6}" for i in range(N)],
    "RSM/B2B Head": [f"RSM-{i % 3}" for i in range(N)],
    "Some Extra Ignorable Column": rng.integers(0, 100, N),
    "PLC\nTarget": rng.integers(50_000, 500_000, N),
    "PLC MTD  Sales": rng.integers(20_000, 480_000, N),
    "Yesterday PLC Sales": rng.integers(0, 20_000, N),
    "PLC Ach%": rng.uniform(0.5, 1.3, N),
    "PLC+ Target": rng.integers(50_000, 500_000, N),
    "PLC+ MTD Sales": rng.integers(20_000, 480_000, N),
    "Yesterday PLC+ Sales": rng.integers(0, 20_000, N),
    "PLC+ Ach%": rng.uniform(0.5, 1.3, N),
    "Powercrete Target": rng.integers(50_000, 500_000, N),
    "Powercrete MTD Sales": rng.integers(20_000, 480_000, N),
    "Yesterday Powercrete Sales": rng.integers(0, 20_000, N),
    "Powercrete Ach%": rng.uniform(0.5, 1.3, N),
    "Another Ignorable Column": rng.integers(0, 100, N),
})
# reorder columns randomly to prove order-independence
file1 = file1[rng.permutation(file1.columns.tolist())]

# File 2: overlaps with the first 200 SAP IDs of file 1, plus 60 new ones only
# it has (proves the outer join keeps customers that appear in only one file).
sap_ids_2 = sap_ids_1[:200] + [f"SAP{2000 + i}" for i in range(60)]
N2 = len(sap_ids_2)

file2 = pd.DataFrame({
    "New SAP ID": sap_ids_2,
    "Customer Name": [f"Customer {i}" if i < 200 else f"NewCust {i}" for i in range(N2)],
    "Customer Type": rng.choice(["Retailer", "Dealer", "B2B"], N2),
    "Region": rng.choice(["Dhaka", "Chattogram", "Khulna", "Rajshahi"], N2),
    "Area": rng.choice(["Area-1", "Area-2", "Area-3"], N2),
    "Territory": rng.choice(["T1", "T2", "T3", "T4"], N2),
    "TSM/TSE": [f"TSE-{i % 15}" for i in range(N2)],
    "ASM/KAM": [f"ASM-{i % 6}" for i in range(N2)],
    "RSM/B2B Head": [f"RSM-{i % 3}" for i in range(N2)],
    "Target (PCC + OPC)": rng.integers(50_000, 500_000, N2),
    "MTD Target": rng.integers(50_000, 500_000, N2),
    "PCC MTD Sales": rng.integers(10_000, 200_000, N2),
    "OPC MTD Sales": rng.integers(10_000, 200_000, N2),
    "MTD PCC+OPC Sales": rng.integers(30_000, 400_000, N2),
    "Yesterday PCC+OPC Sales": rng.integers(0, 20_000, N2),
    "(PCC + OPC) Ach%": rng.uniform(0.5, 1.3, N2),
    "HWP Target": rng.integers(20_000, 200_000, N2),
    "HWP MTD Sales": rng.integers(10_000, 190_000, N2),
    "Yesterday HWP Sales": rng.integers(0, 10_000, N2),
    "HWP Ach%": rng.uniform(0.5, 1.3, N2),
    "HCG Target": rng.integers(20_000, 200_000, N2),
    "HCG MTD Sales": rng.integers(10_000, 190_000, N2),
    "Yesterday HCG Sales": rng.integers(0, 10_000, N2),
    "HCG Ach%": rng.uniform(0.5, 1.3, N2),
    "Yet Another Ignorable Col": rng.integers(0, 100, N2),
})
file2 = file2[rng.permutation(file2.columns.tolist())]

file1.to_excel("/home/claude/sales_summary_agent/tests/20260715_Supercrete_Export.xlsx", index=False)
file2.to_excel("/home/claude/sales_summary_agent/tests/PCC_OPC_daily_dump_v3.xlsx", index=False)
print("Sample files written.")
