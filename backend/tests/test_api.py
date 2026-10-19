from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ARTIFACTS = Path(__file__).resolve().parent.parent / "artifacts"
pytestmark = pytest.mark.skipif(not (ARTIFACTS / "metrics.json").exists(), reason="models not trained yet")

SIMPLE = "def add(a, b):\n    return a + b\n"
COMPLEX = """
def handle(req, db, cache, log, cfg, retries):
    for i in range(retries):
        try:
            if req.method == "GET":
                for k in req.args:
                    if k in cache:
                        while cache[k]:
                            if cfg.strict and not db.ok:
                                log.warn(k)
                                if i > 2:
                                    raise RuntimeError(k)
            elif req.method == "POST":
                if db.write(req.body) and cfg.audit or log.enabled:
                    return 201
            else:
                return 405
        except (IOError, ValueError) as e:
            log.error(e)
            if i == retries - 1:
                raise
    return 500
"""


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    import app.main as main
    from app.storage import ScanStore

    with TestClient(main.app) as c:
        main.state["store"] = ScanStore(tmp_path_factory.mktemp("db") / "scans.db")
        yield c


def test_health(client):
    body = client.get("/api/v1/health").json()
    assert body["status"] == "ok"
    assert len(body["models_loaded"]) == 5
    assert body["default_model"] == "monotonic_gbdt"


def test_analyze_contract(client):
    r = client.post("/api/v1/analyze", json={"code": COMPLEX, "filename": "handler.py"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert 0 <= body["risk_score"] <= 100
    assert body["risk_level"] in ("low", "medium", "high")
    assert abs(sum(body["probabilities"].values()) - 1) < 1e-6
    assert len(body["model_votes"]) == 5
    assert body["functions"][0]["name"] == "handle"
    assert "complexity" in body["functions"][0]["flags"]
    assert len(body["risk_factors"]) <= 8
    impacts = [abs(f["impact"]) for f in body["risk_factors"]]
    assert impacts == sorted(impacts, reverse=True)


def test_complex_code_scores_higher_than_simple(client):
    simple = client.post("/api/v1/analyze", json={"code": SIMPLE}).json()["risk_score"]
    complex_ = client.post("/api/v1/analyze", json={"code": COMPLEX * 6}).json()["risk_score"]
    assert complex_ > simple


@pytest.mark.parametrize("model", ["logreg", "random_forest", "gradient_boosting", "svm", "monotonic_gbdt"])
def test_each_model_selectable(client, model):
    body = client.post("/api/v1/analyze", json={"code": SIMPLE, "model": model}).json()
    assert body["model"]["key"] == model


def test_default_model_is_monotonic_in_complexity(client):
    """Raising complexity metrics must never lower the default model's risk score."""
    import app.main as main
    from ml.features import extract_features
    from ml.pipeline import risk_score, to_frame

    reg = main.state["registry"]
    model = reg.models[reg.default_model]
    f = extract_features(COMPLEX)
    base = float(risk_score(model.predict_proba(to_frame(f.numeric, f.tokens)))[0])
    for key in ("cc_max", "cc_total", "max_nesting", "sloc", "halstead_effort"):
        bumped = dict(f.numeric, **{key: f.numeric[key] * 3 + 10})
        assert float(risk_score(model.predict_proba(to_frame(bumped, f.tokens)))[0]) >= base - 1e-9, key


def test_syntax_error_422(client):
    r = client.post("/api/v1/analyze", json={"code": "def f(:\n  pass"})
    assert r.status_code == 422
    assert r.json()["detail"]["line"] == 1


def test_empty_code_400(client):
    r = client.post("/api/v1/analyze", json={"code": "  "})
    assert r.status_code == 400


def test_too_large_413(client):
    r = client.post("/api/v1/analyze", json={"code": "x = 1\n" * 40_000})
    assert r.status_code == 413


def test_unknown_model_rejected(client):
    assert client.post("/api/v1/analyze", json={"code": SIMPLE, "model": "nope"}).status_code == 422


def test_metrics(client):
    body = client.get("/api/v1/metrics").json()
    assert {m["key"] for m in body["models"]} == {"logreg", "random_forest", "gradient_boosting", "svm", "monotonic_gbdt"}
    for m in body["models"]:
        assert len(m["confusion_matrix"]) == 3


def test_scan_history(client):
    created = client.post("/api/v1/analyze", json={"code": SIMPLE, "filename": "h.py"}).json()
    listed = client.get("/api/v1/scans").json()
    assert listed[0]["id"] == created["id"]
    assert client.get(f"/api/v1/scans/{created['id']}").json()["risk_score"] == created["risk_score"]
    assert client.get("/api/v1/scans/doesnotexist").status_code == 404
