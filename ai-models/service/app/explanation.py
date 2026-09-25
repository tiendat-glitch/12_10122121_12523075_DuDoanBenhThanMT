"""Exact additive log-odds explanation of a binary logistic pipeline."""
import math
import numpy as np
from sklearn.linear_model import LogisticRegression


def explain_prediction(pipeline, frame, target_label):
    estimator = pipeline.steps[-1][1]
    if not isinstance(estimator, LogisticRegression) or len(estimator.classes_) != 2:
        return {"available": False, "reason": "Cách tính chi tiết hiện hỗ trợ Logistic Regression nhị phân."}
    labels = list(estimator.classes_)
    if target_label not in labels:
        return {"available": False, "reason": "Không xác định được lớp cần giải thích."}
    preprocessing = pipeline[:-1]
    transformed = preprocessing.transform(frame)
    values = np.asarray(transformed.toarray() if hasattr(transformed, "toarray") else transformed)[0]
    # sklearn's binary coefficients describe classes_[1]. Orient all terms
    # toward the displayed probability (ckd is classes_[0] in our artifact).
    sign = 1.0 if labels.index(target_label) == 1 else -1.0
    coefficients = sign * estimator.coef_[0]
    intercept = float(sign * estimator.intercept_[0])
    terms = [
        {"feature": str(name), "transformed_value": float(value),
         "coefficient": float(coefficient), "contribution": float(value * coefficient)}
        for name, value, coefficient in zip(preprocessing.get_feature_names_out(), values, coefficients)
    ]
    total = math.fsum(term["contribution"] for term in terms)
    score = intercept + total
    probability = 1 / (1 + math.exp(-score)) if score >= 0 else math.exp(score) / (1 + math.exp(score))
    return {"available": True, "method": "logistic_regression", "target_label": str(target_label),
            "intercept": intercept, "contribution_sum": total, "score": score,
            "probability": probability, "terms": terms}
