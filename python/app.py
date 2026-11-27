"""Private FastAPI adapter for the APF3 inference contract."""

import hmac
import os
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ml.infer_apf3 import load_project_model, predict  # noqa: E402

MODEL_PATH = PROJECT_ROOT / "ml/artifacts/apf3/model.joblib"
METADATA_PATH = PROJECT_ROOT / "ml/artifacts/apf3/model_metadata.json"
MODEL_VERSION = "apf3-models-1.1"

app = FastAPI(title="Bodega Gladys APF3 Inference", version=MODEL_VERSION)


@lru_cache(maxsize=1)
def loaded_model():
    """Cache the verified model for the lifetime of a warm function instance."""
    return load_project_model(MODEL_PATH, METADATA_PATH)


def _authorized(secret: str | None) -> bool:
    expected = os.environ.get("APF3_INTERNAL_SECRET")
    if not expected or not secret:
        return False
    return hmac.compare_digest(secret, expected)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model_version": MODEL_VERSION}


@app.post("/predict")
def infer(record: dict[str, Any], x_apf3_internal_secret: str | None = Header(default=None)) -> dict[str, Any]:
    if not os.environ.get("APF3_INTERNAL_SECRET"):
        raise HTTPException(status_code=503, detail="APF3_INTERNAL_SECRET is not configured")
    if not _authorized(x_apf3_internal_secret):
        raise HTTPException(status_code=401, detail="Invalid internal authentication")

    try:
        model, metadata = loaded_model()
        result = predict(record, MODEL_PATH, METADATA_PATH, loaded=(model, metadata))
    except (ValueError, TypeError, KeyError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail="APF3 inference failed") from error

    if result["model_version"] != MODEL_VERSION:
        raise HTTPException(status_code=500, detail="Unexpected APF3 model version")
    return result
