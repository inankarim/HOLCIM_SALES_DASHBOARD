"""
FastAPI microservice wrapping sales_summary_agent's merge engine.

Node/Express calls this over HTTP with the admin's two uploaded files;
this service returns the merged, related (not stacked) dataset as JSON
so Node can insert it into PostgreSQL the same way it ingests any other
dataset in the MIS dashboard.

Run locally:
    uvicorn app:app --host 0.0.0.0 --port 8000

Endpoints:
    GET  /health              -> liveness check
    POST /api/merge/full      -> {file_a, file_b} multipart -> JSON {columns, rows, row_count,
                                  xlsx_filename, xlsx_base64} — ONE merge computation, use this
                                  when you need both the DB rows AND a downloadable file (the
                                  two-file-upload flow)
    POST /api/merge           -> same inputs -> JSON {columns, rows, row_count} only
    POST /api/merge/xlsx      -> same inputs -> formatted Sales_Summary.xlsx binary only
"""

import tempfile
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from sales_summary_agent import (
    MissingColumnsError,
    assemble_output_frame,
    build_merged_dataframe,
    classify_files,
    export_workbook,
    validate_required_columns,
)

app = FastAPI(title="Sales Summary Merge Service", version="1.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


def _save_upload(upload: UploadFile, tmp_dir: Path) -> str:
    dest = tmp_dir / upload.filename
    with open(dest, "wb") as f:
        f.write(upload.file.read())
    return str(dest)


def _run_merge(path_a: str, path_b: str) -> pd.DataFrame:
    """Shared by both endpoints: runs the exact same merge engine used by
    the CLI tool (same header-detection, SAP ID + Customer Name join key,
    outer join, recomputed Achievement % fallback)."""
    file1, file2 = classify_files(path_a, path_b)
    validate_required_columns(file1, file2)
    merged = build_merged_dataframe(file1, file2)

    from sales_summary_agent import PRODUCT_GROUPS  # local import to avoid polluting module namespace

    for group_name in PRODUCT_GROUPS:
        target_key = f"{group_name}||Target"
        mtd_key = f"{group_name}||MTD Sales"
        ach_key = f"{group_name}||Achievement %"
        if target_key in merged.columns and mtd_key in merged.columns and ach_key in merged.columns:
            computed = merged[mtd_key] / merged[target_key].replace({0: pd.NA})
            merged[ach_key] = merged[ach_key].combine_first(computed)

    from sales_summary_agent import CUSTOMER_INFO_COLUMNS, PRODUCT_GROUPS, SUB_COLS  # local import

    out = assemble_output_frame(merged)
    out = out.sort_values("SAP ID", kind="stable").reset_index(drop=True)
    # attrs don't reliably survive sort_values, so recompute explicitly
    # (mirrors sales_summary_agent.run()).
    out.attrs["header_top"] = ["Customer Information"] * len(CUSTOMER_INFO_COLUMNS) + [
        g for g in PRODUCT_GROUPS for _ in SUB_COLS
    ]
    out.attrs["header_sub"] = [c for c, _ in CUSTOMER_INFO_COLUMNS] + [s for _ in PRODUCT_GROUPS for s in SUB_COLS]
    return out


@app.post("/api/merge/full")
async def merge_full(
    file_a: UploadFile = File(...),
    file_b: UploadFile = File(...),
) -> JSONResponse:
    """Computes the merge ONCE and returns both the JSON rows (for Node to
    insert into Postgres) and the formatted xlsx as base64 (for Node to pass
    through to the admin as a downloadable file) in a single response —
    avoids running the merge twice like calling /api/merge and /api/merge/xlsx
    separately would.
    """
    import base64

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        path_a = _save_upload(file_a, tmp_dir)
        path_b = _save_upload(file_b, tmp_dir)

        try:
            out = _run_merge(path_a, path_b)
        except MissingColumnsError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Could not read one of the uploaded files as an Excel workbook: {exc}",
            ) from exc

        records = out.astype(object).where(pd.notnull(out), None).to_dict(orient="records")

        output_path = tmp_dir / "Sales_Summary.xlsx"
        export_workbook(out, str(output_path))
        xlsx_base64 = base64.b64encode(output_path.read_bytes()).decode("ascii")

        return JSONResponse(
            {
                "columns": list(out.columns),
                "row_count": len(out),
                "rows": records,
                "xlsx_filename": "Sales_Summary.xlsx",
                "xlsx_base64": xlsx_base64,
            }
        )


@app.post("/api/merge")
async def merge_to_json(
    file_a: UploadFile = File(..., description="Either uploaded Excel file, in either order"),
    file_b: UploadFile = File(..., description="Either uploaded Excel file, in either order"),
) -> JSONResponse:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        path_a = _save_upload(file_a, tmp_dir)
        path_b = _save_upload(file_b, tmp_dir)

        try:
            out = _run_merge(path_a, path_b)
        except MissingColumnsError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Could not read one of the uploaded files as an Excel workbook: {exc}",
            ) from exc

        # NaN isn't valid JSON -- convert to None so json.dumps/FastAPI's
        # encoder doesn't choke or emit invalid "NaN" tokens.
        records = out.astype(object).where(pd.notnull(out), None).to_dict(orient="records")

        return JSONResponse(
            {
                "columns": list(out.columns),
                "row_count": len(out),
                "rows": records,
            }
        )


@app.post("/api/merge/xlsx")
async def merge_to_xlsx(
    file_a: UploadFile = File(...),
    file_b: UploadFile = File(...),
) -> FileResponse:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        path_a = _save_upload(file_a, tmp_dir)
        path_b = _save_upload(file_b, tmp_dir)

        try:
            out = _run_merge(path_a, path_b)
        except MissingColumnsError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Could not read one of the uploaded files as an Excel workbook: {exc}",
            ) from exc

        output_path = tmp_dir / "Sales_Summary.xlsx"
        export_workbook(out, str(output_path))

        # Copy out of the temp dir before it's cleaned up on context exit;
        # FileResponse streams lazily, so the file must still exist when
        # Starlette actually reads it after this function returns.
        persistent_path = Path(tempfile.gettempdir()) / f"Sales_Summary_{next(tempfile._get_candidate_names())}.xlsx"
        persistent_path.write_bytes(output_path.read_bytes())

        return FileResponse(
            persistent_path,
            filename="Sales_Summary.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            background=None,
        )