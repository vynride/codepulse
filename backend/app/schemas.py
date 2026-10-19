from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

RiskLevel = Literal["low", "medium", "high"]
ModelKey = Literal["logreg", "random_forest", "gradient_boosting", "svm", "monotonic_gbdt"]

MAX_CODE_CHARS = 200_000


class AnalyzeRequest(BaseModel):
    code: str = Field(..., description="Python source code to analyse")
    filename: Optional[str] = Field(None, max_length=255)
    model: Optional[ModelKey] = None


class Probabilities(BaseModel):
    low: float
    medium: float
    high: float


class ModelRef(BaseModel):
    key: ModelKey
    name: str


class MetricOut(BaseModel):
    key: str
    label: str
    group: str
    value: float
    ideal: Optional[float]
    higher_is_better: bool
    status: Literal["ok", "warn"]


class RiskFactor(BaseModel):
    feature: str
    label: str
    value: Optional[float]
    impact: float
    direction: Literal["increases", "decreases"]
    description: str


class FunctionOut(BaseModel):
    name: str
    lineno: int
    complexity: int
    length: int
    nesting: int
    params: int
    flags: list[str]


class ModelVote(BaseModel):
    key: ModelKey
    name: str
    risk_level: RiskLevel
    risk_score: float
    probabilities: Probabilities


class AnalyzeResponse(BaseModel):
    id: str
    created_at: str
    filename: Optional[str]
    model: ModelRef
    risk_score: float
    risk_level: RiskLevel
    probabilities: Probabilities
    metrics: list[MetricOut]
    risk_factors: list[RiskFactor]
    functions: list[FunctionOut]
    model_votes: list[ModelVote]
    latency_ms: float


class ScanSummary(BaseModel):
    id: str
    created_at: str
    filename: Optional[str]
    risk_score: float
    risk_level: RiskLevel
    model: str
    loc: int


class TrainBaselineResponse(BaseModel):
    model: str
    duration_s: float
    best_params: dict
    best_cv_f1: float
    test_f1: float
    grid: list[dict]
