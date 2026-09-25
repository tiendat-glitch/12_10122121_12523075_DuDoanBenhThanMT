"""Shared data loading and preprocessing for the CKD notebooks and service."""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

RANDOM_STATE = 42
TARGET = "classification"
POSITIVE_LABEL = "ckd"
NUMERIC_FEATURES = [
    "age", "bp", "sg", "al", "su", "bgr", "bu", "sc", "sod", "pot",
    "hemo", "pcv", "wc", "rc",
]
CATEGORICAL_FEATURES = [
    "rbc", "pc", "pcc", "ba", "htn", "dm", "cad", "appet", "pe", "ane",
]
FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES
VALID_LABELS = {"ckd", "notckd"}


def load_dataset(path: str | Path) -> pd.DataFrame:
    """Read the first CSV directly from a CSV or ZIP dataset."""
    path = Path(path)
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as archive:
            csv_names = [name for name in archive.namelist() if name.lower().endswith(".csv")]
            if not csv_names:
                raise FileNotFoundError(f"No CSV found in {path}")
            return pd.read_csv(io.BytesIO(archive.read(csv_names[0])))
    return pd.read_csv(path)


def clean_dataframe(dataframe: pd.DataFrame) -> pd.DataFrame:
    """Normalize labels/types without fitting any learned transformer."""
    dataframe = dataframe.copy()
    dataframe.columns = dataframe.columns.astype(str).str.replace("\t", "", regex=False).str.strip()
    for column in dataframe.select_dtypes(include=["object", "str", "string"]).columns:
        dataframe[column] = (
            dataframe[column].astype("string")
            .str.replace("\t", "", regex=False)
            .str.strip()
            .str.lower()
        )
    for column in NUMERIC_FEATURES:
        dataframe[column] = pd.to_numeric(dataframe[column], errors="coerce").astype("float64")
    for column in CATEGORICAL_FEATURES:
        dataframe[column] = dataframe[column].astype("object").where(dataframe[column].notna(), np.nan)
    dataframe[TARGET] = dataframe[TARGET].astype("string").str.strip().str.lower().astype("object")
    unexpected = set(dataframe[TARGET].dropna().unique()) - VALID_LABELS
    if unexpected:
        raise ValueError(f"Unexpected target labels: {unexpected}")
    if dataframe[TARGET].isna().any():
        raise ValueError("Target contains missing values")
    return dataframe.drop_duplicates().reset_index(drop=True)


def split_dataset(dataframe: pd.DataFrame):
    """Remove the identifier and create the fixed stratified split."""
    dataframe = clean_dataframe(dataframe)
    X = dataframe[FEATURES].copy()
    y = dataframe[TARGET].copy()
    return train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE, stratify=y
    )


def build_preprocessor() -> ColumnTransformer:
    """Build an unfitted transformer; callers fit it on training data only."""
    numeric_pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])
    categorical_pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("encoder", OneHotEncoder(handle_unknown="ignore")),
    ])
    return ColumnTransformer([
        ("numeric", numeric_pipeline, NUMERIC_FEATURES),
        ("categorical", categorical_pipeline, CATEGORICAL_FEATURES),
    ])


def build_pipeline(model):
    """Put preprocessing and estimator in one exportable pipeline."""
    return Pipeline([
        ("preprocessor", clone(build_preprocessor())),
        ("model", model),
    ])


def build_schema(dataframe: pd.DataFrame) -> dict:
    """Create the input contract used by the future backend/frontend."""
    dataframe = clean_dataframe(dataframe)
    return {
        "task_type": "binary_classification",
        "target": TARGET,
        "positive_label": POSITIVE_LABEL,
        "target_labels": sorted(dataframe[TARGET].unique().tolist()),
        "features": FEATURES,
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "allowed_categories": {
            column: sorted(dataframe[column].dropna().astype(str).unique().tolist())
            for column in CATEGORICAL_FEATURES
        },
        "numeric_ranges": {
            column: {"min": float(dataframe[column].min()), "max": float(dataframe[column].max())}
            for column in NUMERIC_FEATURES
        },
        "test_size": 0.2,
        "random_state": RANDOM_STATE,
    }


def save_schema(dataframe: pd.DataFrame, output_path: str | Path) -> None:
    Path(output_path).write_text(
        json.dumps(build_schema(dataframe), indent=2), encoding="utf-8"
    )
