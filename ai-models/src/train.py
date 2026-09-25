"""Train the candidate models used in 03_train.ipynb."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import joblib
import pandas as pd
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, make_scorer, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import GridSearchCV
from sklearn.neighbors import KNeighborsClassifier
from sklearn.svm import SVC

from preprocess import POSITIVE_LABEL, RANDOM_STATE, build_pipeline, load_dataset, save_schema, split_dataset


def train_models(dataset_path: str | Path, output_dir: str | Path) -> pd.DataFrame:
    output_dir = Path(output_dir)
    candidate_dir = output_dir / "candidates"
    candidate_dir.mkdir(parents=True, exist_ok=True)
    dataframe = load_dataset(dataset_path)
    X_train, X_test, y_train, y_test = split_dataset(dataframe)
    scorer = make_scorer(f1_score, pos_label=POSITIVE_LABEL)
    models = {
        "dummy": (DummyClassifier(strategy="most_frequent", random_state=RANDOM_STATE), {}),
        "logistic_regression": (LogisticRegression(max_iter=1000, random_state=RANDOM_STATE), {
            "model__C": [0.01, 0.1, 1, 10], "model__class_weight": [None, "balanced"]}),
        "knn": (KNeighborsClassifier(), {
            "model__n_neighbors": [3, 5, 7, 9], "model__weights": ["uniform", "distance"], "model__p": [1, 2]}),
        "svc": (SVC(probability=True, random_state=RANDOM_STATE), {
            "model__C": [0.1, 1, 10], "model__kernel": ["linear", "rbf"],
            "model__gamma": ["scale", "auto"], "model__class_weight": [None, "balanced"]}),
        "random_forest": (RandomForestClassifier(random_state=RANDOM_STATE, n_jobs=-1), {
            "model__n_estimators": [100, 200], "model__max_depth": [None, 5, 10, 20],
            "model__min_samples_split": [2, 5, 10], "model__class_weight": [None, "balanced"]}),
    }
    rows = []
    for name, (estimator, grid) in models.items():
        started = time.perf_counter()
        if grid:
            search = GridSearchCV(build_pipeline(estimator), grid, scoring=scorer, cv=5, n_jobs=-1)
            search.fit(X_train, y_train)
            fitted = search.best_estimator_
            best_params = search.best_params_
            cv_f1 = float(search.best_score_)
        else:
            fitted = build_pipeline(estimator).fit(X_train, y_train)
            best_params = {}
            cv_f1 = None
        train_seconds = time.perf_counter() - started
        prediction_started = time.perf_counter()
        predictions = fitted.predict(X_test)
        predict_seconds = time.perf_counter() - prediction_started
        probabilities = fitted.predict_proba(X_test)[:, list(fitted.classes_).index(POSITIVE_LABEL)]
        model_path = candidate_dir / f"{name}.joblib"
        joblib.dump(fitted, model_path, compress=3)
        rows.append({
            "model": name, "best_params": json.dumps(best_params, sort_keys=True), "cv_f1": cv_f1,
            "train_f1": float(f1_score(y_train, fitted.predict(X_train), pos_label=POSITIVE_LABEL)),
            "test_accuracy": float(accuracy_score(y_test, predictions)),
            "test_precision": float(precision_score(y_test, predictions, pos_label=POSITIVE_LABEL, zero_division=0)),
            "test_recall": float(recall_score(y_test, predictions, pos_label=POSITIVE_LABEL, zero_division=0)),
            "test_f1": float(f1_score(y_test, predictions, pos_label=POSITIVE_LABEL, zero_division=0)),
            "test_roc_auc": float(roc_auc_score((y_test == POSITIVE_LABEL).astype(int), probabilities)),
            "train_seconds": train_seconds, "predict_seconds": predict_seconds,
            "predict_ms_per_sample": predict_seconds / len(X_test) * 1000,
            "model_size_bytes": model_path.stat().st_size,
        })
    results = pd.DataFrame(rows).sort_values("test_f1", ascending=False)
    results.to_csv(output_dir / "training_results.csv", index=False)
    results.to_json(output_dir / "training_results.json", orient="records", indent=2)
    save_schema(dataframe, output_dir / "schema.json")
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="data/dataset.zip")
    parser.add_argument("--output", default="models")
    args = parser.parse_args()
    print(train_models(args.dataset, args.output).to_string(index=False))
