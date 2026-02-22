import asyncio
import os
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, TypeVar, Sequence
T = TypeVar("T")
from uuid import uuid4

import pandas as pd
import requests
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv


# Fix 5: clean up completed/failed workflows older than 30 min every 5 min
async def _cleanup_old_workflows() -> None:
    while True:
        await asyncio.sleep(300)
        cutoff = datetime.now(timezone.utc).timestamp() - 1800
        async with WORKFLOW_STORE_LOCK:
            to_remove = [
                wid for wid, st in WORKFLOWS.items()
                if st.status in {"completed", "failed"}
                and st.finished_at is not None
                and datetime.fromisoformat(st.finished_at).timestamp() < cutoff
            ]
            for wid in to_remove:
                del WORKFLOWS[wid]


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(_cleanup_old_workflows())
    yield
    task.cancel()


app = FastAPI(title="Sixtyfour Workflow Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

load_dotenv()

ENRICH_LEAD_ASYNC_URL = "https://api.sixtyfour.ai/enrich-lead-async"
JOB_STATUS_URL_TEMPLATE = "https://api.sixtyfour.ai/job-status/{task_id}"
FIND_EMAIL_URL = "https://api.sixtyfour.ai/find-email"
_BACKEND_DIR = Path(__file__).parent
UPLOAD_DIR = _BACKEND_DIR / "uploads"
DEFAULT_ENRICH_STRUCT= {
    "name": "The individual's full name",
    "email": "The individual's email address",
    "phone": "The individual's phone number",
    "company": "The company the individual is associated with",
    "title": "The individual's job title",
    "linkedin": "LinkedIn URL for the person",
    "website": "Company website URL",
    "location": "The individual's location",
}
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class Block(BaseModel):
    type: Literal["read_csv", "filter", "enrich_lead", "find_email", "save_csv", "compute_column"]
    params: dict[str, Any] = Field(default_factory=dict)


class WorkflowRunRequest(BaseModel):
    blocks: list[Block]
    max_concurrency: int = Field(default=10, ge=1, le=100)
    submission_batch_size: int = Field(default=25, ge=1, le=500)
    poll_batch_size: int = Field(default=50, ge=1, le=500)
    poll_interval_seconds: float = Field(default=0.25, ge=0.05, le=5.0)
    max_poll_seconds: float = Field(default=300.0, ge=1.0, le=3600.0)
    max_retries: int = Field(default=1, ge=0, le=1)
    backoff_base_seconds: float = Field(default=0.2, ge=0.01, le=5.0)
    request_timeout_seconds: float = Field(default=20.0, ge=1.0, le=120.0)


class WorkflowRunResponse(BaseModel):
    workflow_id: str
    status: str


class WorkflowStatusResponse(BaseModel):
    workflow_id: str
    status: str
    current_block: str | None
    progress_percentage: float
    rows_processed: int
    total_rows: int
    error_message: str | None
    output_path: str | None
    started_at: str
    finished_at: str | None


@dataclass
class WorkflowState:
    workflow_id: str
    status: str = "pending"
    current_block: str | None = None
    progress_percentage: float = 0.0
    rows_processed: int = 0
    total_rows: int = 0
    error_message: str | None = None
    output_path: str | None = None
    dataframe: pd.DataFrame | None = None
    started_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    finished_at: str | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


WORKFLOWS: dict[str, WorkflowState] = {}
WORKFLOW_STORE_LOCK = asyncio.Lock()


def _now_iso() -> str: 
    return datetime.now(timezone.utc).isoformat()


def _chunks(items: Sequence[T], size: int) -> list[list[T]]:
    return [list(items[i : i + size]) for i in range(0, len(items), size)]


def _validate_filter_params(params: dict[str, Any], df: pd.DataFrame) -> None:
    column = params.get("column")
    operator = params.get("operator")
    if not column or not operator:
        raise ValueError("Filter requires params: column, operator")
    if column not in df.columns:
        raise ValueError(f"Filter column '{column}' not found in dataframe")
    if operator not in {"equals", "contains", "gt", "lt"}:
        raise ValueError("Filter operator must be one of: equals, contains, gt, lt")


def _sixtyfour_headers() -> dict[str, str]:
    api_key = os.getenv("SIXTYFOUR_API_KEY")
    if not api_key:
        raise RuntimeError("SIXTYFOUR_API_KEY is missing. Add it to environment or .env.")
    return {
        "x-api-key": api_key,
        "Content-Type": "application/json",
    }


def _extract_task_id(payload: dict[str, Any]) -> str | None:
    task_id = payload.get("task_id")
    if task_id:
        return str(task_id)
    return None


def _extract_status(payload: dict[str, Any]) -> str:
    status = payload.get("status")
    return str(status).lower() if status is not None else ""


def _clean_value(value: Any) -> Any | None:
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return value


def _row_to_lead_dict(row_data: dict[str, Any]) -> dict[str, Any]:
    lead: dict[str, Any] = {}
    allowed = {"name", "company", "title", "phone", "linkedin", "location", "email", "website"}
    for key in allowed:
        value = _clean_value(row_data.get(key))
        if value is not None:
            lead[key] = value

    first_name = _clean_value(row_data.get("first_name"))
    last_name = _clean_value(row_data.get("last_name"))
    if "name" not in lead and first_name and last_name:
        lead["name"] = f"{first_name} {last_name}"

    return lead


def _build_enrich_payload(row_data: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
    lead_info = _row_to_lead_dict(row_data)
    if not lead_info:
        lead_info = {
            str(k): v for k, v in row_data.items() if _clean_value(v) is not None
        }

    struct = params.get("struct") or DEFAULT_ENRICH_STRUCT
    if not isinstance(struct, dict) or not struct:
        raise ValueError("enrich_lead params.struct must be a non-empty object")

    payload: dict[str, Any] = {
        "lead_info": lead_info,
        "struct": struct,
    }
    research_plan = params.get("research_plan")
    if isinstance(research_plan, str) and research_plan.strip():
        payload["research_plan"] = research_plan.strip()
    return payload


def _extract_enrich_fields(status_payload: dict[str, Any]) -> dict[str, Any]:
    result = status_payload.get("result", {})
    if not isinstance(result, dict):
        return {}

    merged: dict[str, Any] = {}
    structured_data = result.get("structured_data")
    if isinstance(structured_data, dict):
        merged.update(structured_data)

    if "confidence_score" in result:
        merged["enrich_confidence_score"] = result.get("confidence_score")
    return merged


def _build_find_email_payload(
    row_data: dict[str, Any], params: dict[str, Any]
) -> dict[str, Any]:
    lead = _row_to_lead_dict(row_data)
    # Never pass the existing email — the API returns it unchanged if present,
    # which prevents it from actually searching for an email address.
    if not lead:
        raise ValueError("find_email requires at least one lead field in dataframe row")

    payload: dict[str, Any] = {"lead": lead}
    mode = params.get("mode")
    if isinstance(mode, str) and mode.upper() in {"PROFESSIONAL", "PERSONAL"}:
        payload["mode"] = mode.upper()
    return payload


def _first_email_value(raw: Any) -> str | None:
    if not isinstance(raw, list) or not raw:
        return None
    item = raw[0]
    if isinstance(item, list) and item:
        return str(item[0])
    if isinstance(item, str):
        return item
    return None


async def _with_retry(
    action_name: str,
    fn,
    *,
    retries: int,
    base_delay: float,
) -> Any:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            return await fn()
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt == retries:
                break
            await asyncio.sleep(base_delay * (2**attempt))
    print(last_error)
    raise RuntimeError(f"{action_name} failed after {retries + 1} attempts: {last_error}")


async def _http_post_json(
    url: str, payload: dict[str, Any], timeout_seconds: float
) -> dict[str, Any]:
    headers = _sixtyfour_headers()

    def _post() -> dict[str, Any]:
        response = requests.post(url, json=payload, headers=headers, timeout=timeout_seconds)
        response.raise_for_status()
        return response.json()

    return await asyncio.to_thread(_post)


async def _http_get_json(url: str, timeout_seconds: float) -> dict[str, Any]:
    headers = _sixtyfour_headers()

    def _get() -> dict[str, Any]:
        response = requests.get(url, headers=headers, timeout=timeout_seconds)
        response.raise_for_status()
        return response.json()

    return await asyncio.to_thread(_get)


async def _submit_enrich_job(payload: dict[str, Any], timeout_seconds: float) -> str:
    response = await _http_post_json(ENRICH_LEAD_ASYNC_URL, payload, timeout_seconds)
    task_id = _extract_task_id(response)
    if not task_id:
        raise RuntimeError(f"enrich-lead-async missing task_id in response: {response}")
    return task_id


async def _poll_job_status(task_id: str, timeout_seconds: float) -> dict[str, Any]:
    url = JOB_STATUS_URL_TEMPLATE.format(task_id=task_id)
    return await _http_get_json(url, timeout_seconds)


async def _run_enrich_lead_block(
    state: WorkflowState,
    block: Block,
    request: WorkflowRunRequest,
) -> None:
    if state.dataframe is None:
        raise ValueError("Dataframe is empty")

    df = state.dataframe
    row_indices = df.index.tolist()
    if not row_indices:
        state.total_rows = 0
        state.rows_processed = 0
        state.progress_percentage = 100.0
        return

    state.total_rows = len(row_indices)
    state.rows_processed = 0

    failure_states = {"failed", "error", "cancelled", "canceled"}
    success_states = {"completed", "success", "succeeded", "done", "finished"}
    semaphore = asyncio.Semaphore(request.max_concurrency)

    # ── Phase 1: Submit all rows in parallel (bounded by semaphore) ──────
    async def _submit_row(row_index: int) -> tuple[int, str]:
        async with semaphore:
            row_data = {str(k): v for k, v in df.loc[row_index].to_dict().items()}
            row_payload = _build_enrich_payload(row_data, block.params)

            async def _once() -> str:
                return await _submit_enrich_job(row_payload, request.request_timeout_seconds)

            task_id = await _with_retry(
                "submit_enrich_job",
                _once,
                retries=request.max_retries,
                base_delay=request.backoff_base_seconds,
            )
            return row_index, task_id

    submit_tasks = [asyncio.create_task(_submit_row(i)) for i in row_indices]
    pending: dict[str, int] = {}  # task_id → row_index
    for fut in asyncio.as_completed(submit_tasks):
        row_index, task_id = await fut
        pending[task_id] = row_index

    # ── Phase 2: Poll all pending jobs until complete or timeout ─────────
    async def _poll_one(tid: str) -> tuple[str, dict[str, Any]]:
        async with semaphore:
            result = await _with_retry(
                "poll_job_status",
                lambda: _poll_job_status(tid, request.request_timeout_seconds),
                retries=request.max_retries,
                base_delay=request.backoff_base_seconds,
            )
            return tid, result

    deadline = asyncio.get_running_loop().time() + request.max_poll_seconds
    while pending and asyncio.get_running_loop().time() < deadline:
        await asyncio.sleep(request.poll_interval_seconds)

        poll_results = await asyncio.gather(
            *[_poll_one(tid) for tid in list(pending)],
            return_exceptions=True,
        )
        for res in poll_results:
            if isinstance(res, BaseException):
                continue
            task_id, status_payload = res
            status = _extract_status(status_payload)
            if status in success_states:
                row_index = pending.pop(task_id)
                for key, value in _extract_enrich_fields(status_payload).items():
                    df.at[row_index, key] = value
                state.rows_processed += 1
                state.progress_percentage = round(
                    (state.rows_processed / max(state.total_rows, 1)) * 100, 2
                )
            elif status in failure_states:
                pending.pop(task_id)
                state.rows_processed += 1
                state.progress_percentage = round(
                    (state.rows_processed / max(state.total_rows, 1)) * 100, 2
                )

    # Any rows still pending have timed out — mark as done
    state.rows_processed = state.total_rows
    state.progress_percentage = 100.0


async def _run_find_email_block(
    state: WorkflowState,
    block: Block,
    request: WorkflowRunRequest,
) -> None:
    if state.dataframe is None:
        raise ValueError("Dataframe is empty")

    df = state.dataframe
    row_indices = df.index.tolist()
    semaphore = asyncio.Semaphore(request.max_concurrency)
    state.total_rows = len(row_indices)
    state.rows_processed = 0

    async def _find_email_for_row(row_index: int) -> tuple[int, dict[str, Any]]:
        async with semaphore:
            row_data = {str(k): v for k, v in df.loc[row_index].to_dict().items()}
            payload = _build_find_email_payload(row_data, block.params)

            async def _call_once() -> dict[str, Any]:
                return await _http_post_json(
                    FIND_EMAIL_URL, payload, request.request_timeout_seconds
                )

            result = await _with_retry(
                "find_email",
                _call_once,
                retries=request.max_retries,
                base_delay=request.backoff_base_seconds,
            )
            parsed: dict[str, Any] = {}
            email = _first_email_value(result.get("email"))
            personal_email = _first_email_value(result.get("personal_email"))
            if email is not None:
                parsed["email"] = email
            if personal_email is not None:
                parsed["personal_email"] = personal_email
            return row_index, parsed

    tasks = [asyncio.create_task(_find_email_for_row(i)) for i in row_indices]
    processed = 0
    for completed_task in asyncio.as_completed(tasks):
        row_index, result = await completed_task
        for key, value in result.items():
            df.at[row_index, key] = value
        processed += 1
        state.rows_processed = processed
        state.progress_percentage = round((processed / max(state.total_rows, 1)) * 100, 2)


def _resolve_path(path: str) -> Path:
    """Resolve a path relative to the backend directory when it is not absolute."""
    p = Path(path)
    if p.is_absolute():
        return p
    return (_BACKEND_DIR / p).resolve()


async def _run_fast_block(state: WorkflowState, block: Block) -> None:
    params = block.params
    if block.type == "read_csv":
        path = params.get("path")
        if not path:
            raise ValueError("read_csv requires params.path")
        df = pd.read_csv(_resolve_path(str(path)))
        if df.empty:
            raise ValueError(f"CSV at '{path}' is empty — no rows found.")
        if len(df.columns) == 0:
            raise ValueError(f"CSV at '{path}' has no columns.")
        state.dataframe = df
        state.total_rows = len(df)
        state.rows_processed = state.total_rows
        state.progress_percentage = 100.0
        return

    if state.dataframe is None:
        raise ValueError("Dataframe is empty. Run read_csv first.")

    if block.type == "filter":
        _validate_filter_params(params, state.dataframe)
        column = params["column"]
        operator = params["operator"]
        value = params.get("value")

        if operator == "equals":
            # Coerce "True"/"False" strings so boolean columns (from compute_column) filter correctly
            coerced = value
            if isinstance(value, str) and value.lower() in {"true", "false"}:
                coerced = value.lower() == "true"
            mask = state.dataframe[column] == coerced
        elif operator == "contains":
            mask = state.dataframe[column].astype(str).str.contains(str(value), na=False)
        elif operator == "gt":
            if value is None:
                raise ValueError("filter operator 'gt' requires params.value")
            try:
                num = float(value)
            except (TypeError, ValueError):
                raise ValueError("filter operator 'gt' value must be numeric")
            mask = pd.to_numeric(state.dataframe[column], errors="coerce") > num
        else:  # operator == "lt"
            if value is None:
                raise ValueError("filter operator 'lt' requires params.value")
            try:
                num = float(value)
            except (TypeError, ValueError):
                raise ValueError("filter operator 'lt' value must be numeric")
            mask = pd.to_numeric(state.dataframe[column], errors="coerce") < num

        state.dataframe = state.dataframe[mask].copy()
        state.total_rows = len(state.dataframe) if state.dataframe is not None else 0
        state.rows_processed = state.total_rows
        state.progress_percentage = 100.0
        return

    if block.type == "save_csv":
        output_path = params.get("path")
        if not output_path:
            raise ValueError("save_csv requires params.path")
        output = _resolve_path(str(output_path))
        output.parent.mkdir(parents=True, exist_ok=True)
        state.dataframe.to_csv(output, index=False)
        state.output_path = str(output)
        state.total_rows = len(state.dataframe) if state.dataframe is not None else 0
        state.rows_processed = state.total_rows
        state.progress_percentage = 100.0
        return

    if block.type == "compute_column":
        target_col = params.get("column")
        source_col = params.get("source_column")
        operator   = params.get("operator", "contains")
        value      = params.get("value", "")

        if not target_col:
            raise ValueError("compute_column requires params.column (name of the new column)")
        if not source_col:
            raise ValueError("compute_column requires params.source_column")
        if source_col not in state.dataframe.columns:
            raise ValueError(
                f"compute_column: source_column '{source_col}' not found. "
                f"Available: {list(state.dataframe.columns)}"
            )

        df = state.dataframe
        if operator == "equals":
            df[target_col] = df[source_col] == value
        elif operator == "not_equals":
            df[target_col] = df[source_col] != value
        elif operator == "contains":
            df[target_col] = df[source_col].astype(str).str.contains(str(value), na=False)
        elif operator == "not_contains":
            df[target_col] = ~df[source_col].astype(str).str.contains(str(value), na=False)
        elif operator == "gt":
            try:
                num = float(value)
            except (TypeError, ValueError):
                raise ValueError(
                    f"compute_column operator 'gt' requires a numeric value, got: {value!r}"
                )
            df[target_col] = pd.to_numeric(df[source_col], errors="coerce") > num
        elif operator == "lt":
            try:
                num = float(value)
            except (TypeError, ValueError):
                raise ValueError(
                    f"compute_column operator 'lt' requires a numeric value, got: {value!r}"
                )
            df[target_col] = pd.to_numeric(df[source_col], errors="coerce") < num
        elif operator == "not_null":
            df[target_col] = df[source_col].notna() & (df[source_col].astype(str).str.strip() != "")
        elif operator == "is_null":
            df[target_col] = df[source_col].isna() | (df[source_col].astype(str).str.strip() == "")
        else:
            raise ValueError(f"compute_column: unsupported operator '{operator}'")

        state.total_rows = len(df)
        state.rows_processed = len(df)
        state.progress_percentage = 100.0
        return

    raise ValueError(f"Unsupported fast block: {block.type}")


async def _run_slow_block(
    state: WorkflowState,
    block: Block,
    request: WorkflowRunRequest,
) -> None:
    if block.type == "enrich_lead":
        await _run_enrich_lead_block(state, block, request)
        return
    if block.type == "find_email":
        await _run_find_email_block(state, block, request)
        return
    raise ValueError(f"Unsupported slow block: {block.type}")


async def _execute_workflow(workflow_id: str, request: WorkflowRunRequest) -> None:
    state = WORKFLOWS[workflow_id]
    try:
        async with state.lock:
            state.status = "running"

        for idx, block in enumerate(request.blocks, start=1):
            async with state.lock:
                state.current_block = block.type
                state.progress_percentage = 0.0
                state.rows_processed = 0
                state.total_rows = len(state.dataframe) if state.dataframe is not None else 0

            if block.type in {"read_csv", "filter", "save_csv", "compute_column"}:
                await _run_fast_block(state, block)
            else:
                await _run_slow_block(state, block, request)

            async with state.lock:
                if idx == len(request.blocks):
                    state.progress_percentage = 100.0

        async with state.lock:
            state.status = "completed"
            state.finished_at = _now_iso()

    except Exception as exc:  # noqa: BLE001
        async with state.lock:
            state.status = "failed"
            state.error_message = str(exc)
            state.finished_at = _now_iso()


@app.post("/workflows/run", response_model=WorkflowRunResponse)
async def run_workflow(request: WorkflowRunRequest) -> WorkflowRunResponse:
    if not request.blocks:
        raise HTTPException(status_code=400, detail="At least one block is required.")
    if request.blocks[0].type != "read_csv":
        raise HTTPException(status_code=400, detail="First block must be read_csv.")

    workflow_id = str(uuid4())
    state = WorkflowState(workflow_id=workflow_id)

    async with WORKFLOW_STORE_LOCK:
        WORKFLOWS[workflow_id] = state

    asyncio.create_task(_execute_workflow(workflow_id, request))
    return WorkflowRunResponse(workflow_id=workflow_id, status="pending")


@app.get("/workflows/{workflow_id}/status", response_model=WorkflowStatusResponse)
async def get_workflow_status(workflow_id: str) -> WorkflowStatusResponse:
    state = WORKFLOWS.get(workflow_id)
    if not state:
        raise HTTPException(status_code=404, detail="Workflow not found")

    async with state.lock:
        return WorkflowStatusResponse(
            workflow_id=state.workflow_id,
            status=state.status,
            current_block=state.current_block,
            progress_percentage=state.progress_percentage,
            rows_processed=state.rows_processed,
            total_rows=state.total_rows,
            error_message=state.error_message,
            output_path=state.output_path,
            started_at=state.started_at,
            finished_at=state.finished_at,
        )


@app.get("/workflows/{workflow_id}/preview")
async def get_workflow_preview(workflow_id: str, limit: int = 10) -> dict[str, Any]:
    state = WORKFLOWS.get(workflow_id)
    if not state:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if state.dataframe is None:
        return {"rows": [], "columns": []}

    clipped = max(1, min(limit, 100))
    return {
        "columns": state.dataframe.columns.tolist(),
        "rows": state.dataframe.head(clipped).to_dict(orient="records"),
    }


@app.get("/workflows/{workflow_id}/download")
async def download_workflow_output(workflow_id: str) -> FileResponse:
    state = WORKFLOWS.get(workflow_id)
    if not state:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if not state.output_path:
        raise HTTPException(status_code=400, detail="No output file available yet.")
    output = Path(state.output_path)
    if not output.exists():
        raise HTTPException(status_code=404, detail="Output file not found on disk.")
    return FileResponse(
        path=str(output),
        media_type="text/csv",
        filename=output.name,
        headers={"Content-Disposition": f'attachment; filename="{output.name}"'},
    )


@app.get("/files/download")
async def download_file_by_path(path: str) -> FileResponse:
    """Serve a file from the backend directory by relative or absolute path."""
    resolved = _resolve_path(path)
    backend_dir = _BACKEND_DIR.resolve()
    # Safety: only allow files that live inside the backend directory tree
    try:
        resolved.relative_to(backend_dir)
    except ValueError:
        raise HTTPException(status_code=403, detail="Access to that path is not permitted.")
    if not resolved.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    return FileResponse(
        path=str(resolved),
        media_type="text/csv",
        filename=resolved.name,
        headers={"Content-Disposition": f'attachment; filename="{resolved.name}"'},
    )


@app.post("/files/upload")
async def upload_csv(file: UploadFile = File(...)) -> dict[str, str]:
    filename = file.filename or f"upload-{uuid4()}.csv"
    safe_name = f"{uuid4()}-{Path(filename).name}"
    output_path = UPLOAD_DIR / safe_name
    content = await file.read()
    output_path.write_bytes(content)
    return {"filename": filename, "path": str(output_path)}
