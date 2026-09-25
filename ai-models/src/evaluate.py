"""Evaluate candidates and export the final pipeline."""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score

from preprocess import FEATURES, POSITIVE_LABEL, RANDOM_STATE, load_dataset, split_dataset


def evaluate_models(dataset_path: str | Path, model_dir: str | Path) -> pd.DataFrame:
    model_dir = Path(model_dir)
    _, X_test, _, y_test = split_dataset(load_dataset(dataset_path))
    rows = []
    matrices = {}
    for model_path in sorted((model_dir / "candidates").glob("*.joblib")):
        name = model_path.stem
        pipeline = joblib.load(model_path)
        started = time.perf_counter()
        predictions = pipeline.predict(X_test)
        predict_seconds = time.perf_counter() - started
        probabilities = pipeline.predict_proba(X_test)[:, list(pipeline.classes_).index(POSITIVE_LABEL)]
        matrix = confusion_matrix(y_test, predictions, labels=[POSITIVE_LABEL, "notckd"])
        matrices[name] = matrix
        rows.append({
            "model": name,
            "accuracy": float((predictions == y_test).mean()),
            "precision": float(precision_score(y_test, predictions, pos_label=POSITIVE_LABEL, zero_division=0)),
            "recall": float(recall_score(y_test, predictions, pos_label=POSITIVE_LABEL, zero_division=0)),
            "f1": float(f1_score(y_test, predictions, pos_label=POSITIVE_LABEL, zero_division=0)),
            "roc_auc": float(roc_auc_score((y_test == POSITIVE_LABEL).astype(int), probabilities)),
            "predict_seconds": predict_seconds,
            "predict_ms_per_sample": predict_seconds / len(X_test) * 1000,
            "model_size_bytes": model_path.stat().st_size,
        })
    results = pd.DataFrame(rows).sort_values(["f1", "recall"], ascending=False)
    training_results_path = model_dir / "training_results.csv"
    if training_results_path.exists():
        training_results = pd.read_csv(training_results_path)
        results = results.merge(
            training_results[["model", "train_f1", "cv_f1"]],
            on="model",
            how="left",
        )
    results.to_csv(model_dir / "evaluation_results.csv", index=False)
    best = results.iloc[0]
    best_path = model_dir / "candidates" / f"{best['model']}.joblib"
    final_path = model_dir / "model.joblib"
    joblib.dump(joblib.load(best_path), final_path, compress=3)
    tp, fn, fp, tn = matrices[best["model"]].ravel()
    metadata = {
        "model_name": best["model"], "model_version": "1.0.0", "task": "binary_classification",
        "target": "classification", "positive_label": POSITIVE_LABEL, "primary_metric": "f1",
        "metrics": {
            key: float(best[key])
            for key in ["accuracy", "precision", "recall", "f1", "roc_auc", "train_f1", "cv_f1"]
            if key in best and pd.notna(best[key])
        },
        "false_positives": int(fp), "false_negatives": int(fn), "trained_at": datetime.now(timezone.utc).isoformat(),
        "random_state": RANDOM_STATE,
        "features": FEATURES,
        "library_versions": {
            "pandas": pd.__version__,
            "numpy": np.__version__,
            "scikit-learn": sklearn.__version__,
        },
        "model_size_bytes": final_path.stat().st_size,
    }
    (model_dir / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="data/dataset.zip")
    parser.add_argument("--models", default="models")
    args = parser.parse_args()
    print(evaluate_models(args.dataset, args.models).to_string(index=False))
