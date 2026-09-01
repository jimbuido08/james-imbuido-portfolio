---
title: "Smartphone Addiction Baseline (Playground S6E8)"
category: ML
description: "A Kaggle Playground S6E8 baseline — a scikit-learn HistGradientBoosting pipeline with constraint-aware features, tuned with Optuna, reaching 0.959 CV ROC-AUC on the 691k-row smartphone-addiction dataset."
featured: false
technologies:
  - Python
  - NumPy
  - pandas
  - SciPy
  - scikit-learn
  - Optuna
  - seaborn
  - matplotlib
problem: "Playground Series S6E8: binary-predict smartphone addiction from daily screen-time and usage features, scored by ROC AUC. The synthetic dataset is large (691,369 train / 296,302 test rows) and the target is imbalanced (~70.9% positive)."
data: "The competition's synthetic train/test CSVs — 13 feature columns covering daily screen time, social/gaming/work usage budgets, and hour-of-day metrics. EDA found missingness is MCAR and uninformative, and the all-base-rate submission scores AUC 0.5."
approach: "EDA first (KS two-sample tests, distribution plots), then feature engineering encoding the generating constraint that social + gaming + work usage cannot exceed daily screen time. One sklearn Pipeline owns all preprocessing so it runs identically inside every fold. StratifiedKFold(5) baseline CV, then Optuna TPE search (120 trials, median-pruned, on a 250k-row subsample), and an honest re-score of the winner with full 5-fold CV on all rows."
models: "scikit-learn HistGradientBoostingClassifier — native missing-value handling means no imputation and no one-hot encoding."
evaluation: "CV ROC-AUC via cross_val_score; permutation importance and a calibration curve on an 80/20 holdout."
results: "Baseline CV ROC-AUC 0.95546 ± 0.00059; tuned CV ROC-AUC 0.95872 ± 0.00086 (best search AUC 0.96156 over 120 trials); holdout AUC 0.95814. The tuned model fits all 691k rows and writes the submission CSV."
lessons: "Tuning on a subsample then re-scoring the winner with full-fold CV keeps the search cheap without inflating the estimate. The tuned model moved the metric only +0.003 — a baseline GBM on synthetic playground data is already near the ceiling, and ROC AUC needs no resampling even at 71% positive."
kaggleUrl: "https://www.kaggle.com/code/jamesimbuido/s6e8-baseline"
interactive: false
---

<!-- Body intentionally unused — all content lives in frontmatter (Phase 3). -->