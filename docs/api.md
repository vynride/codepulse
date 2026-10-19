# CodePulse API (v1)

Base URL: `http://localhost:8000/api/v1`. All bodies are JSON. CORS allows `http://localhost:3000`.

Risk levels are always the strings `"low" | "medium" | "high"`.
Model keys: `logreg`, `random_forest`, `gradient_boosting`, `svm`, `monotonic_gbdt`.

## `GET /health`
`{ "status": "ok", "models_loaded": ["logreg", ...], "best_model": "gradient_boosting", "default_model": "monotonic_gbdt" }`

`best_model` = highest held-out macro-F1. `default_model` = model used by `/analyze` when none is given.

## `POST /analyze`
Request:
```json
{ "code": "def f(x): ...", "filename": "example.py", "model": "gradient_boosting" }
```
`filename` and `model` are optional (default = `default_model`).

Response `200`:
```json
{
  "id": "a1b2c3d4",
  "created_at": "2026-10-19T12:00:00Z",
  "filename": "example.py",
  "model": { "key": "gradient_boosting", "name": "Gradient Boosting" },
  "risk_score": 63.4,
  "risk_level": "high",
  "probabilities": { "low": 0.12, "medium": 0.31, "high": 0.57 },
  "metrics": [
    { "key": "cc_max", "label": "Max cyclomatic complexity", "group": "complexity",
      "value": 14, "ideal": 10, "higher_is_better": false, "status": "warn" }
  ],
  "risk_factors": [
    { "feature": "cc_max", "label": "Max cyclomatic complexity", "value": 14,
      "impact": 8.2, "direction": "increases",
      "description": "Max cyclomatic complexity is 14 (typical: 6). Raises the risk score by 8.2 points." }
  ],
  "functions": [
    { "name": "parse", "lineno": 3, "complexity": 14, "length": 61, "nesting": 5, "params": 2,
      "flags": ["complexity", "length", "nesting"] }
  ],
  "model_votes": [
    { "key": "logreg", "name": "Logistic Regression", "risk_level": "medium", "risk_score": 48.0,
      "probabilities": { "low": 0.2, "medium": 0.5, "high": 0.3 } }
  ],
  "latency_ms": 12.3
}
```
- `risk_score` = `100 × (0.5·P(medium) + 1.0·P(high))`, range 0–100.
- `metrics[].ideal` may be `null` (no threshold); `status` is `"ok"` or `"warn"` (`"ok"` when no ideal).
- `risk_factors` is sorted by `|impact|` descending (max 8). `impact` is in risk-score points; positive = increases risk.
  The special feature `"vocabulary"` represents the TF-IDF token features as a group.
- `functions[].flags` ⊆ `["complexity", "length", "nesting", "params"]`
  (thresholds: CC > 10, length > 50 lines, nesting > 4, params > 5).

Errors:
- `400 { "detail": { "message": "No code submitted.", "line": null, "column": null } }`
- `422 { "detail": { "message": "Syntax error: invalid syntax", "line": 3, "column": 7 } }`
- `413` when code exceeds 200 000 characters.

## `GET /metrics`
```json
{
  "trained_at": "2026-10-19T12:00:00Z",
  "best_model": "gradient_boosting",
  "default_model": "monotonic_gbdt",
  "dataset": {
    "n_samples": 9000, "n_train": 7200, "n_test": 1800,
    "snapshot_date": "2024-01-01", "window_end": "2026-01-01",
    "label_definition": "…text…",
    "class_distribution": { "low": 4000, "medium": 3000, "high": 2000 },
    "repos": [ { "name": "django", "files": 900 } ]
  },
  "models": [
    {
      "key": "gradient_boosting", "name": "Gradient Boosting", "family": "Tree ensemble (boosted)",
      "description": "…",
      "accuracy": 0.71, "precision": 0.69, "recall": 0.68, "f1": 0.68, "roc_auc": 0.84,
      "cv_f1_mean": 0.67, "cv_f1_std": 0.01,
      "cross_repo_f1_mean": 0.60, "cross_repo_f1_std": 0.04,
      "latency_ms": 0.4, "train_time_s": 12.1,
      "best_params": { "clf__learning_rate": 0.1 },
      "confusion_matrix": [[1,2,3],[4,5,6],[7,8,9]],
      "per_class": { "low": { "precision": 0.8, "recall": 0.7, "f1": 0.75, "support": 800 }, "medium": {}, "high": {} },
      "roc_curves": { "low": { "fpr": [0, 0.1, 1], "tpr": [0, 0.6, 1] }, "medium": {}, "high": {} }
    }
  ],
  "feature_importance": [ { "feature": "cc_max", "label": "Max cyclomatic complexity", "importance": 0.031 } ]
}
```
`confusion_matrix[i][j]` = true class i, predicted class j, order `[low, medium, high]`.
`cross_repo_f1_*` = macro-F1 from 5-fold GroupKFold where whole repositories are held out (generalisation to unseen projects).
`feature_importance` = permutation importance (drop in macro-F1) for the default model, sorted descending.

## `POST /train-baseline`
Runs a quick live `GridSearchCV` of Logistic Regression on the cached dataset (≈5–20 s). Does not replace the served models.
Request `{}` → Response:
```json
{ "model": "logreg", "duration_s": 6.2, "best_params": { "clf__C": 1.0 }, "best_cv_f1": 0.61, "test_f1": 0.6,
  "grid": [ { "params": { "clf__C": 0.1 }, "mean_f1": 0.58, "std_f1": 0.01 } ] }
```

## `GET /scans?limit=20`
Past analyses, newest first: `[ { "id", "created_at", "filename", "risk_score", "risk_level", "model", "loc" } ]`

## `GET /scans/{id}`
The full stored `/analyze` response. `404` if unknown.
