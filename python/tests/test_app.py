import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from python import app as service


ROOT = Path(__file__).resolve().parents[2]
EXAMPLE = json.loads((ROOT / "ml/artifacts/apf3/inference_example.json").read_text())
SECRET = "test-apf3-secret"


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setenv("APF3_INTERNAL_SECRET", SECRET)
    service.loaded_model.cache_clear()
    yield
    if hasattr(service.loaded_model, "cache_clear"):
        service.loaded_model.cache_clear()


def client():
    return TestClient(service.app)


def test_valid_inference():
    response = client().post("/predict", json=EXAMPLE, headers={"x-apf3-internal-secret": SECRET})
    assert response.status_code == 200
    assert response.json()["model_version"] == "apf3-models-1.1"


def test_missing_internal_authentication():
    assert client().post("/predict", json=EXAMPLE).status_code == 401


def test_invalid_input():
    invalid = {**EXAMPLE, "target_next_7d": 4}
    assert client().post("/predict", json=invalid, headers={"x-apf3-internal-secret": SECRET}).status_code == 422


def test_synthetic_provenance_is_required():
    invalid = {**EXAMPLE, "source": "REAL"}
    response = client().post("/predict", json=invalid, headers={"x-apf3-internal-secret": SECRET})
    assert response.status_code == 422
    assert "SYNTHETIC" in response.json()["detail"]


def test_incorrect_model_hash(monkeypatch):
    def broken_loader(*_args):
        raise ValueError("Model artifact hash does not match generated metadata")

    monkeypatch.setattr(service, "load_project_model", broken_loader)
    response = client().post("/predict", json=EXAMPLE, headers={"x-apf3-internal-secret": SECRET})
    assert response.status_code == 422
    assert "hash" in response.json()["detail"]


def test_python_service_failure(monkeypatch):
    monkeypatch.setattr(service, "loaded_model", lambda: (_ for _ in ()).throw(RuntimeError("boom")))
    response = client().post("/predict", json=EXAMPLE, headers={"x-apf3-internal-secret": SECRET})
    assert response.status_code == 500
    assert response.json()["detail"] == "APF3 inference failed"
