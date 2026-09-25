from app.main import load_artifacts, state, validate_features


def test_model_artifacts_load_at_startup():
    load_artifacts()
    assert state["model"] is not None
    assert state["metadata"]["model_version"] == "1.0.0"
    assert len(state["schema"]["features"]) == 24


def test_schema_contains_expected_feature_count():
    import json
    from pathlib import Path

    schema = json.loads((Path(__file__).parents[2] / "models" / "schema.json").read_text(encoding="utf-8"))
    assert len(schema["features"]) == 24
    assert schema["target_labels"] == ["ckd", "notckd"]


def test_valid_features_are_accepted():
    import json
    from pathlib import Path

    schema = json.loads((Path(__file__).parents[2] / "models" / "schema.json").read_text(encoding="utf-8"))
    features = {
        name: (limits["min"] + limits["max"]) / 2
        for name, limits in schema["numeric_ranges"].items()
    }
    features.update({name: values[0] for name, values in schema["allowed_categories"].items()})
    validate_features(features)
