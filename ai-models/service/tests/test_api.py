import pytest
from fastapi.testclient import TestClient
from app.main import app, state


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("PORT", "8001")
    with TestClient(app) as client:
        yield client


def sample():
    schema = state["schema"]
    values = {name: (r["min"] + r["max"]) / 2 for name, r in schema["numeric_ranges"].items()}
    values.update({name: choices[0] for name, choices in schema["allowed_categories"].items()})
    return values


def test_predict_real_pipeline_and_request_id(client):
    original_model = state["model"]
    for headers in [{}, {"X-Request-ID": "demo-trace-001"}]:
        response = client.post("/predict", json={"features": sample()}, headers=headers)
        assert response.status_code == 200
        body = response.json()
        assert body["prediction"] in state["schema"]["target_labels"]
        assert 0 <= body["probability"] <= 1
        explanation = body["explanation"]
        assert explanation["available"]
        assert explanation["target_label"] == "ckd"
        assert explanation["probability"] == pytest.approx(body["probability"], abs=1e-12)
        assert explanation["score"] == pytest.approx(explanation["intercept"] + sum(term["contribution"] for term in explanation["terms"]))
        for term in explanation["terms"]:
            assert term["contribution"] == pytest.approx(term["transformed_value"] * term["coefficient"])
        assert body["request_id"] == response.headers["X-Request-ID"]
        if headers:
            assert body["request_id"] == headers["X-Request-ID"]
        assert state["model"] is original_model
    health = client.get("/health").json()
    assert health["port"] == 8001 and health["model_loaded"]
    assert client.get("/model-info").json()["metadata"]["metrics"] == state["metadata"]["metrics"]


@pytest.mark.parametrize("change", [{"age": True}, {"age": "48"}, {"age": None}, {"age": 999}, {"dm": "bad"}, {"extra": 1}])
def test_invalid_features(client, change):
    response = client.post("/predict", json={"features": {**sample(), **change}})
    assert response.status_code == 400
    assert response.json()["error"] == "invalid_input"
    assert response.json()["request_id"] == response.headers["X-Request-ID"]


@pytest.mark.parametrize("body", [{}, {"features": {}}, {"features": []}, {"features": {"age": 48}}])
def test_missing_or_invalid_body(client, body):
    assert client.post("/predict", json=body).status_code == 400


def test_malformed_json_and_internal_errors_have_trace_id(client, monkeypatch):
    assert client.post("/predict", content="{", headers={"Content-Type": "application/json"}).status_code == 400
    def fail(*args):
        raise RuntimeError("sensitive input")
    monkeypatch.setattr(state["model"], "predict", fail)
    response = client.post("/predict", json={"features": sample()})
    assert response.status_code == 500
    assert "sensitive" not in response.text
    assert response.json()["request_id"] == response.headers["X-Request-ID"]
