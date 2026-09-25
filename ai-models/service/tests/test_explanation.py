import numpy as np
import pandas as pd
import pytest
from sklearn.dummy import DummyClassifier
from sklearn.pipeline import Pipeline
from app.explanation import explain_prediction
from app.main import load_artifacts, state


def test_explanation_matches_both_class_probabilities_for_multiple_inputs():
    load_artifacts()
    schema = state["schema"]
    rng = np.random.default_rng(42)
    rows = [{**{key: rng.uniform(value["min"], value["max"]) for key, value in schema["numeric_ranges"].items()},
             **{key: rng.choice(value) for key, value in schema["allowed_categories"].items()}} for _ in range(12)]
    model = state["model"]
    for row in rows:
        frame = pd.DataFrame([row], columns=schema["features"])
        probabilities = model.predict_proba(frame)[0]
        for index, label in enumerate(model.classes_):
            explanation = explain_prediction(model, frame, label)
            assert explanation["probability"] == pytest.approx(probabilities[index], abs=1e-12)
            assert np.isfinite(explanation["score"])


def test_unsupported_model_does_not_fabricate_explanation():
    model = Pipeline([("classifier", DummyClassifier())])
    assert explain_prediction(model, None, "ckd")["available"] is False
