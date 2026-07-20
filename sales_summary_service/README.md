# Sales Summary Agent

Merges two daily Excel exports — the Supercrete (PLC / PLC+ / Powercrete)
distribution file and the PCC+OPC / HWP / HCG distribution file — into one
consolidated, formatted `Sales_Summary.xlsx`, matched on **SAP ID**.

## Install

```bash
pip install -r requirements.txt
```

## Run

```bash
python sales_summary_agent.py file1.xlsx file2.xlsx -o Sales_Summary.xlsx
```

You can pass the two files in **either order** — the agent inspects each
file's column headers (not its filename or position) to work out which one
is which.

## How it works

| Step | Function | What it does |
|---|---|---|
| 1 | `load_excel` | Reads each file's first sheet with pandas. |
| 2 | `build_normalized_lookup` / `normalize_header` | Strips/collapses whitespace and line breaks, lowercases, so `"PLC\nTarget"`, `"PLC  Target"`, and `"plc target"` all match the same alias. |
| 3 | `classify_files` | Scores each file's normalized headers against two fingerprint sets (PLC/Powercrete vs. PCC+OPC/HWP/HCG) and assigns file roles accordingly. |
| 4 | `validate_required_columns` | Confirms SAP ID / Customer Name exist somewhere; raises `MissingColumnsError` listing exactly what's missing if not. |
| 5 | `extract_customer_info` / `extract_product_data` | Pulls only the needed columns per file, coercing numerics safely (handles commas, blanks, stray text). |
| 6 | `build_merged_dataframe` | Renames `New SAP ID` → `SAP ID`, outer-joins on SAP ID (no customer lost), coalesces duplicated customer-info fields. |
| 7 | `assemble_output_frame` | Lays out the final column order: Customer Information, then PCC+OPC, HWP, HCG, PLC, PLC+, Powercrete — each with Target / MTD Sales / Yesterday Sales / Achievement %. |
| 8 | `export_workbook` | Writes a formatted workbook: two-row grouped headers, frozen header rows + customer-info columns, borders, zebra striping, number/percent formats, and green/yellow/red conditional formatting on every Achievement % column. |

Achievement % is recomputed as `MTD Sales / Target` whenever the source
Ach% cell is blank but both inputs exist, so the figure stays trustworthy
even on incomplete exports.

Everything is vectorized pandas — no per-row Python loops — so it stays
fast at 100k+ rows.

## If a required column is missing

The agent doesn't fail silently or crash with a stack trace. It raises:

```
ERROR: The following required columns were not found in either uploaded file:
  - SAP ID (expected one of: sap id, new sap id)
```

## Extending it

All the mapping logic lives in two places near the top of
`sales_summary_agent.py`:

- `CUSTOMER_INFO_COLUMNS` — the customer/rep columns and their known aliases.
- `PRODUCT_GROUPS` — each product's four sub-columns and their known aliases.

To add a new product or a new header variant your export starts using,
add an alias to the relevant list — no other code changes needed.

## Testing it yourself

`tests/make_sample_files.py` generates two synthetic input files with
deliberately messy headers (line breaks, double spaces, shuffled column
order, extra ignorable columns) and partially-overlapping SAP IDs, so you
can confirm the merge/outer-join/normalization logic before pointing it at
real exports:

```bash
python tests/make_sample_files.py
python sales_summary_agent.py tests/PCC_OPC_daily_dump_v3.xlsx tests/20260715_Supercrete_Export.xlsx -o tests/Sales_Summary.xlsx
```
