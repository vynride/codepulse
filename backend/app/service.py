"""Model loading, inference and risk-factor attribution."""

from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ml.features import FEATURE_INFO, NUMERIC_FEATURES, extract_features
from ml.pipeline import CLASSES, MODEL_SPECS, risk_score, to_frame

ARTIFACTS = Path(__file__).resolve().parent.parent / "artifacts"
MAX_FACTORS = 8
VOCAB = "vocabulary"


class ModelRegistry:
    def __init__(self, artifacts: Path = ARTIFACTS):
        self.models = {}
        for key in MODEL_SPECS:
            path = artifacts / "models" / f"{key}.joblib"
            if path.exists():
                self.models[key] = joblib.load(path)
        if not self.models:
            raise RuntimeError(f"No trained models in {artifacts / 'models'}. Run `python -m ml.train` first.")
        self.metrics = json.loads((artifacts / "metrics.json").read_text())
        self.medians: dict[str, float] = json.loads((artifacts / "baseline.json").read_text())["medians"]
        self.best_model = self.metrics.get("best_model")
        default = self.metrics.get("default_model", self.best_model)
        self.default_model = default if default in self.models else next(iter(self.models))
        self._warm_up()

    def _warm_up(self) -> None:
        """Single-row requests: thread-pool start-up costs more than it saves, and
        the first predict call of each model pays one-off initialisation."""
        for m in self.models.values():
            clf = m.named_steps["clf"]
            if hasattr(clf, "n_jobs"):
                clf.n_jobs = 1
            if hasattr(clf, "estimator") and hasattr(clf.estimator, "n_jobs"):
                clf.estimator.n_jobs = 1
        sample = extract_features("def warm_up(x):\n    return x\n")
        X = to_frame(sample.numeric, sample.tokens)
        for m in self.models.values():
            m.predict_proba(pd.concat([X] * 4, ignore_index=True))

    def analyze(self, code: str, filename: str | None, model_key: str | None) -> dict:
        start = time.perf_counter()
        feats = extract_features(code)
        key = model_key or self.default_model
        X = to_frame(feats.numeric, feats.tokens)

        votes = []
        for k, m in self.models.items():
            p = m.predict_proba(X)[0]
            votes.append({
                "key": k,
                "name": MODEL_SPECS[k]["name"],
                "risk_level": CLASSES[int(p.argmax())],
                "risk_score": round(float(risk_score(p)[0]), 1),
                "probabilities": dict(zip(CLASSES, map(float, p))),
            })
        proba = next(v for v in votes if v["key"] == key)["probabilities"]
        p_vec = np.array([proba[c] for c in CLASSES])

        return {
            "id": uuid.uuid4().hex[:12],
            "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "filename": filename,
            "model": {"key": key, "name": MODEL_SPECS[key]["name"]},
            "risk_score": round(float(risk_score(p_vec)[0]), 1),
            "risk_level": CLASSES[int(p_vec.argmax())],
            "probabilities": proba,
            "metrics": self._metrics(feats.numeric),
            "risk_factors": self._attribute(self.models[key], X, feats.numeric),
            "functions": [f.__dict__ for f in feats.functions],
            "model_votes": votes,
            "latency_ms": round((time.perf_counter() - start) * 1000, 1),
        }

    @staticmethod
    def _metrics(numeric: dict[str, float]) -> list[dict]:
        out = []
        for k in NUMERIC_FEATURES:
            info = FEATURE_INFO[k]
            ideal = info.get("ideal")
            hib = bool(info.get("higher_is_better", False))
            v = numeric[k]
            warn = ideal is not None and (v < ideal if hib else v > ideal)
            out.append({"key": k, "label": info["label"], "group": info["group"], "value": round(v, 3),
                        "ideal": ideal, "higher_is_better": hib, "status": "warn" if warn else "ok"})
        return out

    def _attribute(self, model, X: pd.DataFrame, numeric: dict[str, float]) -> list[dict]:
        """Baseline-substitution attribution: replace one feature at a time with its
        training median (vocabulary: with an empty document) and measure the change
        in risk score. All perturbations are scored in a single batch."""
        perturbed = pd.concat([X] * (len(NUMERIC_FEATURES) + 1), ignore_index=True)
        for i, f in enumerate(NUMERIC_FEATURES):
            perturbed.at[i, f] = self.medians[f]
        perturbed.at[len(NUMERIC_FEATURES), "tokens"] = ""
        base = float(risk_score(model.predict_proba(X))[0])
        scores = risk_score(model.predict_proba(perturbed))

        factors = []
        for i, f in enumerate([*NUMERIC_FEATURES, VOCAB]):
            impact = base - float(scores[i])
            if abs(impact) < 0.05:
                continue
            direction = "increases" if impact > 0 else "decreases"
            if f == VOCAB:
                label, value = "Vocabulary (identifiers, keywords, docstrings)", None
                desc = (f"The words used in this file resemble {'riskier' if impact > 0 else 'safer'} files "
                        f"in the training set. {'Raises' if impact > 0 else 'Lowers'} the risk score by "
                        f"{abs(impact):.1f} points.")
            else:
                label, value = FEATURE_INFO[f]["label"], numeric[f]
                desc = (f"{label} is {_fmt(value)} (typical: {_fmt(self.medians[f])}). "
                        f"{'Raises' if impact > 0 else 'Lowers'} the risk score by {abs(impact):.1f} points.")
            factors.append({"feature": f, "label": label, "value": value, "impact": round(impact, 2),
                            "direction": direction, "description": desc})
        factors.sort(key=lambda d: abs(d["impact"]), reverse=True)
        return factors[:MAX_FACTORS]


def _fmt(v: float) -> str:
    return f"{v:.0f}" if abs(v - round(v)) < 1e-9 or abs(v) >= 100 else f"{v:.2f}"
