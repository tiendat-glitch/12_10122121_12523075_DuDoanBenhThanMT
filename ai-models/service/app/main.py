from __future__ import annotations

import json
import logging
import math
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from .explanation import explain_prediction

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(message)s")
logger = logging.getLogger("ai-service")


def log_event(event: str, **fields: Any) -> None:
    logger.info(json.dumps({"timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "service": "ai-service", "event": event, **fields}))

LOCAL_MODEL_DIR = Path(__file__).resolve().parents[2] / "models"
MODEL_DIR = Path(os.getenv("MODEL_DIR", str(LOCAL_MODEL_DIR)))
MODEL_PATH = MODEL_DIR / "model.joblib"
SCHEMA_PATH = MODEL_DIR / "schema.json"
METADATA_PATH = MODEL_DIR / "metadata.json"

state: dict[str, Any] = {"model": None, "schema": None, "metadata": None, "started_at": None}


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    features: dict[str, Any] = Field(..., min_length=1)


def load_artifacts() -> None:
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(f"Missing model artifact: {MODEL_PATH}")
    state["model"] = joblib.load(MODEL_PATH)
    state["schema"] = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    state["metadata"] = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    state["started_at"] = time.time()
    if list(state["model"].feature_names_in_) != state["schema"]["features"]:
        raise ValueError("Model and schema features do not match")
    if not hasattr(state["model"], "steps"):
        raise ValueError("Artifact must contain preprocessing and model in one pipeline")
    log_event("model_loaded", model_version=state["metadata"].get("model_version"))


def validate_features(features: dict[str, Any]) -> None:
    schema = state["schema"]
    expected = set(schema["features"])
    received = set(features)
    missing = sorted(expected - received)
    unknown = sorted(received - expected)
    errors: list[str] = []
    if missing:
        errors.append(f"missing features: {', '.join(missing)}")
    if unknown:
        errors.append(f"unknown features: {', '.join(unknown)}")

    for name, limits in schema.get("numeric_ranges", {}).items():
        value = features.get(name)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            errors.append(f"{name} must be numeric")
            continue
        try:
            numeric_value = float(value)
        except (TypeError, ValueError):
            errors.append(f"{name} must be numeric")
            continue
        if not limits["min"] <= numeric_value <= limits["max"]:
            errors.append(f"{name} must be between {limits['min']} and {limits['max']}")

    for name, allowed in schema.get("allowed_categories", {}).items():
        if features.get(name) not in allowed:
            errors.append(f"{name} must be one of: {', '.join(allowed)}")

    if errors:
        raise HTTPException(status_code=400, detail={"error": "invalid_input", "messages": errors})


@asynccontextmanager
async def lifespan(_: FastAPI):
    load_artifacts()
    yield


app = FastAPI(title="CKD AI Service", version="1.0.0", lifespan=lifespan)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    incoming = request.headers.get("X-Request-ID", "")
    request_id = incoming if re.fullmatch(r"[A-Za-z0-9_-]{1,128}", incoming) else str(uuid.uuid4())
    request.state.request_id = request_id
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        response = JSONResponse(status_code=500, content={"error": "internal_error", "detail": "Prediction failed", "request_id": request_id})
    response.headers["X-Request-ID"] = request_id
    log_event("request_completed", request_id=request_id, method=request.method, path=request.url.path, status=response.status_code, duration_ms=round((time.perf_counter() - started) * 1000, 2))
    return response


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    detail = exc.detail
    return JSONResponse(status_code=exc.status_code, content={"error": detail.get("error", "request_error") if isinstance(detail, dict) else "request_error", "detail": detail.get("messages", detail) if isinstance(detail, dict) else detail, "request_id": request.state.request_id})


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # Do not echo submitted clinical data from Pydantic's error input field.
    return JSONResponse(status_code=400, content={"error": "invalid_input", "detail": "Body must contain only a non-empty features object", "request_id": request.state.request_id})


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "service": "ai-service", "port": int(os.environ["PORT"]), "model_loaded": state["model"] is not None, "uptime_seconds": round(time.time() - state["started_at"], 2)}


@app.get("/model-info")
def model_info() -> dict[str, Any]:
    return {"metadata": state["metadata"], "schema": state["schema"]}


@app.post("/predict")
def predict(payload: PredictionRequest, request: Request) -> dict[str, Any]:
    request_id = request.state.request_id
    validate_features(payload.features)
    model = state["model"]
    metadata = state["metadata"]
    frame = pd.DataFrame([payload.features], columns=state["schema"]["features"])
    started = time.perf_counter()
    prediction = model.predict(frame)[0]
    labels = list(getattr(model, "classes_", state["schema"]["target_labels"]))
    prediction = str(prediction)
    probability = None
    if hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(frame)[0]
        positive_label = metadata.get("positive_label")
        positive_index = labels.index(positive_label) if positive_label in labels else int(probabilities.argmax())
        probability = float(probabilities[positive_index])
    explanation = explain_prediction(model, frame, metadata.get("positive_label"))
    duration_ms = (time.perf_counter() - started) * 1000
    log_event("prediction_completed", request_id=request_id, model_version=metadata.get("model_version"), duration_ms=round(duration_ms, 2))
    return {"prediction": prediction, "probability": probability, "model_version": metadata.get("model_version"), "request_id": request_id, "duration_ms": round(duration_ms, 2), "explanation": explanation}
