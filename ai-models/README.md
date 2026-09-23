# CKD training workspace

This directory is the only place where models are trained. The FastAPI application only loads exported artifacts.

## Dataset contract

Provide a CSV file and identify its binary target column and the exact value representing CKD. No dataset is bundled and no results are fabricated. Feature names and types are inferred from the training split; review them before deployment.

```bash
pip install -r requirements.txt
python -m src.train --dataset data/ckd.csv --target classification --positive-label ckd \
  --export-backend ../App/backend/app/models/artifacts
```

The command cleans common missing markers, performs one stratified split before fitting preprocessing, runs five real configurations for each required algorithm, and writes:

- `checkpoints/<model>/v1..v5/model.joblib`
- `checkpoints/<model>/v1..v5/metadata.json`
- `exported/<model>/<selected-version>/...`
- `exported/model-comparison.csv`

Selection is lexicographic by recall, F1, then ROC-AUC because false negatives are especially costly in CKD screening. This is an academic prediction system, not medical advice or a diagnostic device.

Open `notebooks/CKD_training.ipynb` in Colab for the required EDA tables and visualizations. Set the dataset path, target, and positive label in the configuration cell before running all cells.
