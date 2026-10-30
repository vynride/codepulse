# CodePulse

<p align="center">
  <img src="docs/readme-banner.svg" alt="CodePulse: find the Python files most likely to break next" width="100%">
</p>

**ML-based code complexity and bug-risk analysis for Python.**

Paste or upload a Python file. CodePulse extracts 28 structural metrics plus TF-IDF vocabulary features, and
scikit-learn models predict whether the file is at **Low / Medium / High** risk of needing bug fixes. The UI shows a
0–100 risk score, per-function diagnostics against standard thresholds, the factors driving the score, and a full
benchmark of the four classic models (Logistic Regression, Random Forest, Gradient Boosting, SVM) plus a fifth,
monotonically constrained ordinal model that is used by default.

The models are trained on **4,213 real files from 14 open-source Python projects**. Each file is labelled by the
number of bug-fix commits that touched it in the two years *after* the snapshot the features were measured on.

| | |
|---|---|
| Frontend | Next.js (App Router, TypeScript, Tailwind), Monaco editor, Recharts, Lucide |
| Backend | FastAPI, Pydantic, scikit-learn, radon + `ast`, joblib, SQLite (scan history) |
| Models | Logistic Regression · Random Forest · Gradient Boosting (HistGBDT) · SVM (RBF) · Monotonic ordinal GBDT (default) |

Results, methodology and discussion: **[docs/report.md](docs/report.md)**. API contract: [docs/api.md](docs/api.md).

## Quick start

Prerequisites: Python 3.10+ (developed on 3.12) and Node 20+.

```bash
make setup     # creates backend/.venv and installs Python + npm dependencies
make dev       # API on http://localhost:8000 (docs at /docs), web app on http://localhost:3000
```

Without `make`:

```bash
cd backend && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8000          # terminal 1
cd frontend && npm install && npm run dev           # terminal 2
```

The trained models (`backend/artifacts/`) and the dataset (`backend/data/dataset.csv`) are included in the project, so the
app runs immediately without retraining.

## Reproducing the ML pipeline

```bash
make data      # blobless-clones the 14 repos into backend/data/repos and rebuilds dataset.csv (slow: network-bound)
make train     # GridSearchCV + evaluation of all 5 models (~6 min on 10 cores)
make test      # backend unit + API tests
```

`python -m ml.build_dataset --labels-only` recomputes the labels from the existing clones without re-extracting
features. `python -m ml.train --fast` uses tiny grids for a ~1-minute smoke test.

## Project layout

```
backend/
  ml/features.py        feature extraction (radon, ast, tokenizer), shared by training and inference
  ml/build_dataset.py   snapshot → features, future bug-fix commits → labels
  ml/pipeline.py        preprocessing, the 5 model specs + grids (incl. ordinal monotonic GBDT), labelling, risk score
  ml/train.py           grid search, evaluation, permutation importance, cross-repo CV, figures
  app/main.py           FastAPI routes (/analyze, /metrics, /train-baseline, /scans)
  app/service.py        model registry, inference, baseline-substitution attribution
  app/storage.py        SQLite scan history
  artifacts/            trained models, metrics.json, baseline.json
  tests/                pytest suite
frontend/               Next.js app (Analyze, Benchmarks, Methodology, History)
docs/                   report.md, api.md, figures/
```

## Headline results (held-out test set)

| Model | Accuracy | F1 (macro) | ROC-AUC | Cross-repo F1 |
|---|---|---|---|---|
| Logistic Regression | 0.673 | 0.603 | 0.822 | 0.532 |
| Random Forest | 0.722 | 0.625 | **0.836** | **0.535** |
| **Gradient Boosting** | 0.714 | **0.628** | 0.832 | 0.518 |
| SVM (RBF) | **0.725** | 0.593 | 0.822 | 0.451 |
| Monotonic GBDT *(default)* | 0.714 | 0.609 | 0.835 | 0.524 |

For comparison, a majority-class baseline gets 0.264 macro-F1. The Monotonic GBDT has the best 5-fold CV F1
(0.603) and never lets more complexity lower a file's risk, which is why it is the default. See report §3.1.
