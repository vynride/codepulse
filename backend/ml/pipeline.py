"""Model definitions, preprocessing and labelling shared by training,
the live grid-search endpoint, and inference."""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.calibration import CalibratedClassifierCV
from sklearn.decomposition import TruncatedSVD
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler
from sklearn.svm import SVC

from ml.features import NUMERIC_FEATURES

CLASSES = ["low", "medium", "high"]
SEED = 42
TFIDF_MAX_FEATURES = 5000
SVD_COMPONENTS = 100

LABEL_DEFINITION = (
    "Files are labelled by the number of bug-fix commits (subject matches fix/bug/regression/crash/…) "
    "that touched them in the two years after the snapshot. Low = no bug-fix commits; "
    "Medium = 1–2 bug-fix commits; High = 3 or more."
)


def make_labels(fix_commits: pd.Series) -> np.ndarray:
    """0 = low, 1 = medium, 2 = high (see LABEL_DEFINITION)."""
    return np.select([fix_commits >= 3, fix_commits >= 1], [2, 1], default=0)


def _log1p_nonneg(x):
    return np.log1p(np.clip(x, 0, None))


def make_preprocessor() -> ColumnTransformer:
    numeric = Pipeline([
        ("log", FunctionTransformer(_log1p_nonneg, feature_names_out="one-to-one")),
        ("scale", StandardScaler()),
    ])
    text = Pipeline([
        ("tfidf", TfidfVectorizer(max_features=TFIDF_MAX_FEATURES, min_df=5, sublinear_tf=True,
                                  token_pattern=r"(?u)\b\w\w+\b")),
        ("svd", TruncatedSVD(n_components=SVD_COMPONENTS, random_state=SEED)),
        ("scale", StandardScaler()),
    ])
    return ColumnTransformer([("num", numeric, NUMERIC_FEATURES), ("txt", text, "tokens")])


# Domain prior for the monotonic model: more size / complexity / branching never
# lowers predicted risk, a higher maintainability index never raises it.
# Documentation metrics and vocabulary dimensions are left unconstrained.
_UNCONSTRAINED = {"comment_lines", "blank_lines", "comment_ratio"}
MONOTONIC_CST = [
    -1 if f == "maintainability_index" else 0 if f in _UNCONSTRAINED else 1 for f in NUMERIC_FEATURES
] + [0] * SVD_COMPONENTS


class OrdinalMonotonicGBDT(ClassifierMixin, BaseEstimator):
    """Ordinal classifier (Frank & Hall, 2001) built from two monotonically
    constrained binary gradient-boosting models: P(y > low) and P(y > medium).

    scikit-learn only supports monotonic constraints for binary targets; the
    ordinal decomposition lifts them to the three ordered risk classes.
    Expects the column order produced by `make_preprocessor()`.
    """

    def __init__(self, learning_rate: float = 0.1, max_leaf_nodes: int = 15, max_iter: int = 300):
        self.learning_rate = learning_rate
        self.max_leaf_nodes = max_leaf_nodes
        self.max_iter = max_iter

    def fit(self, X, y):
        y = np.asarray(y)
        self.classes_ = np.array([0, 1, 2])
        self.estimators_ = [
            HistGradientBoostingClassifier(
                max_iter=self.max_iter, learning_rate=self.learning_rate, max_leaf_nodes=self.max_leaf_nodes,
                monotonic_cst=MONOTONIC_CST, class_weight="balanced", random_state=SEED,
            ).fit(X, (y > k).astype(int))
            for k in (0, 1)
        ]
        return self

    def predict_proba(self, X):
        p_above_low = self.estimators_[0].predict_proba(X)[:, 1]
        p_high = np.minimum(self.estimators_[1].predict_proba(X)[:, 1], p_above_low)
        return np.column_stack([1 - p_above_low, p_above_low - p_high, p_high])

    def predict(self, X):
        return self.predict_proba(X).argmax(axis=1)


# key -> (display name, family, description, estimator, param grid)
MODEL_SPECS: dict[str, dict] = {
    "logreg": {
        "name": "Logistic Regression",
        "family": "Linear baseline",
        "description": "Multinomial logistic regression with L2 regularisation and balanced class weights. "
                       "Fast, interpretable linear baseline.",
        "estimator": lambda: LogisticRegression(max_iter=5000, class_weight="balanced"),
        "grid": {"clf__C": [0.01, 0.1, 1.0, 10.0]},
    },
    "random_forest": {
        "name": "Random Forest",
        "family": "Tree ensemble (bagged)",
        "description": "400 bootstrapped decision trees with balanced class weights; "
                       "captures non-linear interactions between metrics.",
        "estimator": lambda: RandomForestClassifier(n_estimators=400, class_weight="balanced_subsample",
                                                    n_jobs=-1, random_state=SEED),
        "grid": {"clf__max_depth": [12, None], "clf__min_samples_leaf": [1, 4]},
    },
    "gradient_boosting": {
        "name": "Gradient Boosting",
        "family": "Tree ensemble (boosted)",
        "description": "Histogram-based gradient-boosted trees (scikit-learn's LightGBM-style "
                       "HistGradientBoostingClassifier) with balanced class weights.",
        "estimator": lambda: HistGradientBoostingClassifier(max_iter=300, class_weight="balanced",
                                                            random_state=SEED),
        "grid": {"clf__learning_rate": [0.03, 0.1], "clf__max_leaf_nodes": [15, 31]},
    },
    "svm": {
        "name": "Support Vector Machine",
        "family": "Kernel method",
        "description": "SVC with an RBF kernel and Platt-scaled probabilities; "
                       "learns a non-linear decision boundary in the scaled feature space.",
        "estimator": lambda: CalibratedClassifierCV(
            SVC(kernel="rbf", class_weight="balanced", random_state=SEED), method="sigmoid", ensemble=False),
        "grid": {"clf__estimator__C": [1.0, 10.0], "clf__estimator__gamma": ["scale", 0.003]},
    },
    "monotonic_gbdt": {
        "name": "Monotonic GBDT",
        "family": "Ordinal tree ensemble (constrained)",
        "description": "Two monotonically constrained gradient-boosting models combined as an ordinal "
                       "classifier (Frank & Hall). More size or complexity can never lower the predicted risk, "
                       "so explanations stay consistent with software-engineering knowledge. Default for analysis.",
        "estimator": lambda: OrdinalMonotonicGBDT(),
        "grid": {"clf__learning_rate": [0.05, 0.1], "clf__max_leaf_nodes": [15, 31]},
    },
}

# Served by default in /analyze: chosen for domain-consistent explanations, not top F1 (see docs/report.md).
DEFAULT_MODEL = "monotonic_gbdt"


def make_pipeline(key: str) -> Pipeline:
    return Pipeline([("prep", make_preprocessor()), ("clf", MODEL_SPECS[key]["estimator"]())])


def to_frame(numeric: dict[str, float] | list[dict], tokens: str | list[str]) -> pd.DataFrame:
    """Build the model input frame (numeric feature columns + `tokens`)."""
    if isinstance(numeric, dict):
        numeric, tokens = [numeric], [tokens]
    df = pd.DataFrame(numeric, columns=NUMERIC_FEATURES)
    df["tokens"] = list(tokens)
    return df


def risk_score(proba: np.ndarray) -> np.ndarray:
    """Expected risk on a 0–100 scale: 100·(0.5·P(medium) + P(high))."""
    proba = np.atleast_2d(proba)
    return 100.0 * (0.5 * proba[:, 1] + proba[:, 2])
