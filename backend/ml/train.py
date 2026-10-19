"""Offline training + benchmarking of the four CodePulse models.

Outputs (in artifacts/):
  models/<key>.joblib   fitted pipelines (refit on the full training split)
  metrics.json          everything served by GET /api/v1/metrics
  baseline.json         training medians used for risk-factor attribution
and report figures in docs/figures/.

Usage:  python -m ml.train [--fast]
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.inspection import permutation_importance
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
    roc_auc_score,
    roc_curve,
)
from sklearn.base import clone
from sklearn.model_selection import GridSearchCV, GroupKFold, StratifiedKFold, cross_val_score, train_test_split

from ml.build_dataset import SNAPSHOT_DATE, WINDOW_END
from ml.features import FEATURE_INFO, NUMERIC_FEATURES
from ml.pipeline import CLASSES, DEFAULT_MODEL, LABEL_DEFINITION, MODEL_SPECS, SEED, make_labels, make_pipeline

ROOT = Path(__file__).resolve().parent.parent
DATA_CSV = ROOT / "data" / "dataset.csv"
ARTIFACTS = ROOT / "artifacts"
FIGURES = ROOT.parent / "docs" / "figures"


def load_dataset() -> tuple[pd.DataFrame, np.ndarray]:
    df = pd.read_csv(DATA_CSV, keep_default_na=False)
    df["tokens"] = df["tokens"].astype(str)
    return df, make_labels(df["fix_commits"])


def split(df: pd.DataFrame, y: np.ndarray):
    return train_test_split(df, y, test_size=0.2, stratify=y, random_state=SEED)


def _downsample_curve(fpr: np.ndarray, tpr: np.ndarray, n: int = 60) -> dict:
    idx = np.unique(np.linspace(0, len(fpr) - 1, min(n, len(fpr))).round().astype(int))
    return {"fpr": [round(float(v), 4) for v in fpr[idx]], "tpr": [round(float(v), 4) for v in tpr[idx]]}


def single_row_latency_ms(model, X: pd.DataFrame, n: int = 50) -> float:
    rows = [X.iloc[[i]] for i in range(min(n, len(X)))]
    model.predict_proba(rows[0])  # warm-up
    start = time.perf_counter()
    for r in rows:
        model.predict_proba(r)
    return (time.perf_counter() - start) * 1000 / len(rows)


def evaluate(key: str, search: GridSearchCV, X_test, y_test, train_time: float) -> dict:
    model = search.best_estimator_
    proba = model.predict_proba(X_test)
    pred = proba.argmax(axis=1)
    p, r, f, s = precision_recall_fscore_support(y_test, pred, labels=[0, 1, 2], zero_division=0)
    best = search.best_index_
    cv = search.cv_results_
    roc = {}
    for i, c in enumerate(CLASSES):
        fpr, tpr, _ = roc_curve(y_test == i, proba[:, i])
        roc[c] = _downsample_curve(fpr, tpr)
    spec = MODEL_SPECS[key]
    return {
        "key": key,
        "name": spec["name"],
        "family": spec["family"],
        "description": spec["description"],
        "accuracy": accuracy_score(y_test, pred),
        "precision": float(np.mean(p)),
        "recall": float(np.mean(r)),
        "f1": f1_score(y_test, pred, average="macro"),
        "roc_auc": roc_auc_score(y_test, proba, multi_class="ovr", average="macro"),
        "cv_f1_mean": float(cv["mean_test_score"][best]),
        "cv_f1_std": float(cv["std_test_score"][best]),
        "latency_ms": single_row_latency_ms(model, X_test),
        "train_time_s": train_time,
        "best_params": {k: v for k, v in search.best_params_.items()},
        "confusion_matrix": confusion_matrix(y_test, pred, labels=[0, 1, 2]).tolist(),
        "per_class": {
            c: {"precision": float(p[i]), "recall": float(r[i]), "f1": float(f[i]), "support": int(s[i])}
            for i, c in enumerate(CLASSES)
        },
        "roc_curves": roc,
    }


def save_figures(results: list[dict], importance: list[dict], explained: str) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    FIGURES.mkdir(parents=True, exist_ok=True)
    colors = ["#010120", "#fc4c02", "#ef2cc1", "#7c79e8", "#1aa6b0"]

    # Metric comparison
    metrics = ["accuracy", "precision", "recall", "f1", "roc_auc"]
    fig, ax = plt.subplots(figsize=(9, 4.5))
    width = 0.8 / len(results)
    for i, res in enumerate(results):
        ax.bar(np.arange(len(metrics)) + i * width, [res[m] for m in metrics], width, label=res["name"], color=colors[i])
    ax.set_xticks(np.arange(len(metrics)) + (len(results) - 1) / 2 * width, ["Accuracy", "Precision", "Recall", "F1 (macro)", "ROC-AUC"])
    ax.set_ylim(0, 1)
    ax.set_title("Held-out test performance")
    ax.legend(frameon=False, fontsize=8)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(FIGURES / "model_comparison.png", dpi=160)
    plt.close(fig)

    # Confusion matrices
    fig, axes = plt.subplots(1, len(results), figsize=(4 * len(results), 3.8))
    for ax, res in zip(axes, results):
        cm = np.array(res["confusion_matrix"])
        norm = cm / cm.sum(axis=1, keepdims=True)
        ax.imshow(norm, cmap="Purples", vmin=0, vmax=1)
        for (i, j), v in np.ndenumerate(cm):
            ax.text(j, i, f"{v}\n{norm[i, j]:.0%}", ha="center", va="center", fontsize=8,
                    color="white" if norm[i, j] > 0.5 else "black")
        ax.set_xticks(range(3), CLASSES)
        ax.set_yticks(range(3), CLASSES)
        ax.set_xlabel("Predicted")
        ax.set_ylabel("True")
        ax.set_title(res["name"], fontsize=10)
    fig.tight_layout()
    fig.savefig(FIGURES / "confusion_matrices.png", dpi=160)
    plt.close(fig)

    # ROC curves (high-risk class)
    fig, ax = plt.subplots(figsize=(5, 5))
    for i, res in enumerate(results):
        c = res["roc_curves"]["high"]
        ax.plot(c["fpr"], c["tpr"], color=colors[i], label=res["name"])
    ax.plot([0, 1], [0, 1], "--", color="#999999", linewidth=1)
    ax.set_xlabel("False positive rate")
    ax.set_ylabel("True positive rate")
    ax.set_title("ROC — high-risk class (one-vs-rest)")
    ax.legend(frameon=False, fontsize=8)
    fig.tight_layout()
    fig.savefig(FIGURES / "roc_high_risk.png", dpi=160)
    plt.close(fig)

    # Feature importance
    top = importance[:15][::-1]
    fig, ax = plt.subplots(figsize=(7, 5))
    ax.barh([t["label"] for t in top], [t["importance"] for t in top], color="#010120")
    ax.set_xlabel("Drop in macro-F1 when permuted")
    ax.set_title(f"Permutation feature importance ({MODEL_SPECS[explained]['name']})")
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(FIGURES / "feature_importance.png", dpi=160)
    plt.close(fig)


def main(fast: bool = False) -> None:
    df, y = load_dataset()
    X = df[[*NUMERIC_FEATURES, "tokens"]]
    X_train, X_test, y_train, y_test = split(X, y)
    print(f"Dataset: {len(df)} files | train {len(X_train)} | test {len(X_test)} | "
          f"classes {dict(zip(CLASSES, np.bincount(y)))}")

    (ARTIFACTS / "models").mkdir(parents=True, exist_ok=True)
    cv = StratifiedKFold(n_splits=3 if fast else 5, shuffle=True, random_state=SEED)
    results, fitted = [], {}
    for key, spec in MODEL_SPECS.items():
        grid = {k: v[:1] for k, v in spec["grid"].items()} if fast else spec["grid"]
        search = GridSearchCV(make_pipeline(key), grid, scoring="f1_macro", cv=cv, n_jobs=-1, refit=True)
        start = time.perf_counter()
        search.fit(X_train, y_train)
        train_time = time.perf_counter() - start
        res = evaluate(key, search, X_test, y_test, train_time)
        # Cross-project generalisation: whole repositories held out per fold.
        xr = cross_val_score(clone(search.best_estimator_), X, y, groups=df["repo"], scoring="f1_macro",
                             cv=GroupKFold(n_splits=5), n_jobs=-1)
        res["cross_repo_f1_mean"], res["cross_repo_f1_std"] = float(xr.mean()), float(xr.std())
        results.append(res)
        fitted[key] = search.best_estimator_
        joblib.dump(search.best_estimator_, ARTIFACTS / "models" / f"{key}.joblib", compress=3)
        print(f"  {spec['name']:<24} F1 {res['f1']:.3f}  AUC {res['roc_auc']:.3f}  "
              f"acc {res['accuracy']:.3f}  xrepo {res['cross_repo_f1_mean']:.3f}  ({train_time:.0f}s) {search.best_params_}")

    best = max(results, key=lambda r: r["f1"])
    print(f"Best model: {best['name']}")

    explained = DEFAULT_MODEL if DEFAULT_MODEL in fitted else best["key"]
    pi = permutation_importance(fitted[explained], X_test, y_test, scoring="f1_macro",
                                n_repeats=3 if fast else 8, random_state=SEED, n_jobs=-1)
    importance = sorted(
        (
            {"feature": col,
             "label": FEATURE_INFO[col]["label"] if col in FEATURE_INFO else "Vocabulary (TF-IDF tokens)",
             "importance": float(pi.importances_mean[i])}
            for i, col in enumerate(X_test.columns)
        ),
        key=lambda d: d["importance"],
        reverse=True,
    )

    counts = np.bincount(y, minlength=3)
    metrics = {
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "best_model": best["key"],
        "default_model": explained,
        "dataset": {
            "n_samples": int(len(df)),
            "n_train": int(len(X_train)),
            "n_test": int(len(X_test)),
            "snapshot_date": SNAPSHOT_DATE,
            "window_end": WINDOW_END,
            "label_definition": LABEL_DEFINITION,
            "class_distribution": {c: int(counts[i]) for i, c in enumerate(CLASSES)},
            "repos": [{"name": n, "files": int(c)} for n, c in df["repo"].value_counts().items()],
        },
        "models": results,
        "feature_importance": importance,
    }
    (ARTIFACTS / "metrics.json").write_text(json.dumps(metrics, indent=2, default=float))

    baseline = {
        "medians": {c: float(X_train[c].median()) for c in NUMERIC_FEATURES},
        "class_medians": {
            c: {f: float(X_train[y_train == i][f].median()) for f in NUMERIC_FEATURES}
            for i, c in enumerate(CLASSES)
        },
    }
    (ARTIFACTS / "baseline.json").write_text(json.dumps(baseline, indent=2))
    save_figures(results, importance, explained)
    print(f"Artifacts written to {ARTIFACTS}, figures to {FIGURES}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--fast", action="store_true", help="tiny grids / 3-fold CV for smoke testing")
    main(parser.parse_args().fast)
