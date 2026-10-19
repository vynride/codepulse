"""CodePulse FastAPI application.

Run:  uvicorn app.main:app --reload --port 8000   (from backend/)
"""

from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool

from app.schemas import (
    MAX_CODE_CHARS,
    AnalyzeRequest,
    AnalyzeResponse,
    ScanSummary,
    TrainBaselineResponse,
)
from app.service import ModelRegistry
from app.storage import ScanStore
from ml.features import CodeParseError

state: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    state["registry"] = ModelRegistry()
    state["store"] = ScanStore()
    yield
    state.clear()


app = FastAPI(
    title="CodePulse API",
    version="1.0.0",
    description="Code complexity & defect-risk analysis for Python files using classic ML models.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CODEPULSE_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

API = "/api/v1"


def _error(status: int, message: str, line: int | None = None, column: int | None = None) -> HTTPException:
    return HTTPException(status, detail={"message": message, "line": line, "column": column})


@app.get(f"{API}/health")
def health():
    reg: ModelRegistry = state["registry"]
    return {"status": "ok", "models_loaded": list(reg.models), "best_model": reg.best_model,
            "default_model": reg.default_model}


@app.post(f"{API}/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    if len(req.code) > MAX_CODE_CHARS:
        raise _error(413, f"Code is too large (max {MAX_CODE_CHARS:,} characters).")
    if not req.code.strip():
        raise _error(400, "No code submitted.")
    reg: ModelRegistry = state["registry"]
    if req.model and req.model not in reg.models:
        raise _error(400, f"Model '{req.model}' is not available.")
    try:
        result = reg.analyze(req.code, req.filename, req.model)
    except CodeParseError as exc:
        raise _error(422, str(exc), exc.line, exc.column)
    except RecursionError:
        raise _error(422, "Code is too deeply nested to analyse.")
    state["store"].save(result)
    return result


@app.get(f"{API}/metrics")
def metrics():
    return state["registry"].metrics


@app.post(f"{API}/train-baseline", response_model=TrainBaselineResponse)
async def train_baseline():
    return await run_in_threadpool(_quick_grid_search)


def _quick_grid_search() -> dict:
    from sklearn.metrics import f1_score
    from sklearn.model_selection import GridSearchCV, StratifiedKFold

    from ml.features import NUMERIC_FEATURES
    from ml.pipeline import SEED, make_pipeline
    from ml.train import load_dataset, split

    start = time.perf_counter()
    try:
        df, y = load_dataset()
    except FileNotFoundError:
        raise _error(503, "Training dataset not found. Run `python -m ml.build_dataset` first.")
    X_train, X_test, y_train, y_test = split(df[[*NUMERIC_FEATURES, "tokens"]], y)
    grid = {"clf__C": [0.01, 0.1, 1.0, 10.0]}
    search = GridSearchCV(make_pipeline("logreg"), grid, scoring="f1_macro",
                          cv=StratifiedKFold(3, shuffle=True, random_state=SEED), n_jobs=-1)
    search.fit(X_train, y_train)
    cv = search.cv_results_
    return {
        "model": "logreg",
        "duration_s": round(time.perf_counter() - start, 2),
        "best_params": search.best_params_,
        "best_cv_f1": float(search.best_score_),
        "test_f1": float(f1_score(y_test, search.predict(X_test), average="macro")),
        "grid": [{"params": p, "mean_f1": float(m), "std_f1": float(s)}
                 for p, m, s in zip(cv["params"], cv["mean_test_score"], cv["std_test_score"])],
    }


@app.get(f"{API}/scans", response_model=list[ScanSummary])
def list_scans(limit: int = Query(20, ge=1, le=200)):
    return state["store"].list(limit)


@app.get(f"{API}/scans/{{scan_id}}", response_model=AnalyzeResponse)
def get_scan(scan_id: str):
    scan = state["store"].get(scan_id)
    if scan is None:
        raise _error(404, "Scan not found.")
    return scan
