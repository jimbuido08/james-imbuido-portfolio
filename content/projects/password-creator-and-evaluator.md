---
title: "Password Creator & Evaluator (Python)"
category: NLP
description: "A menu-driven password strength classifier built on character-level TF-IDF plus engineered features, comparing tuned logistic regression, Naive Bayes, and SVM — with a companion password creator."
featured: false
technologies:
  - Python
  - scikit-learn
  - pandas
  - numpy
  - seaborn
  - matplotlib
  - SQLite
  - joblib
problem: "Weak passwords remain a common security risk, and users rarely get useful feedback on how strong a password actually is. This project builds a single tool that both creates passwords and evaluates their strength, so a user can check a candidate password before relying on it."
data: "The Kaggle Password Data dataset (password_data.sqlite) — a large set of passwords each labelled with a strength class (0, 1, or 2). The redundant 'index' column was dropped and no missing values were found."
approach: "Semantic analysis first categorised passwords by composition (numeric-only, uppercase-only, alphanumeric, alphabet-only, title-case, special-character). Engineered features captured length and the relative frequency of lowercase, uppercase, digit, and special characters. EDA with boxplots, violin plots, distribution plots, and a correlation heatmap identified 'length' and 'lower_freq' as the significant features. Passwords were then vectorised with character-level TF-IDF, the significant features were appended, and the data was split 80/20."
models: "Logistic Regression (multinomial), Multinomial Naive Bayes, and Support Vector Machine — each tuned with GridSearchCV."
evaluation: "Each model was scored with accuracy, a confusion matrix, and a classification report, before and after hyperparameter tuning."
results: "Logistic Regression was selected as the best model. It was wrapped in a predict(password) function and exported with joblib (exported_model.pkl). The notebook also implements a menu-driven CLI — a password creator and a password evaluator — so the model is usable end-to-end. (The notebook records no single accuracy figure, so none is claimed here.)"
lessons: "Character-level TF-IDF captures password structure that engineered features alone miss, and the frequency features 'length' and 'lower_freq' carried most of the signal. Tuning three model families with GridSearchCV made the final choice evidence-based, and packaging the model into a CLI turned a classifier into a usable tool."
kaggleUrl: "https://www.kaggle.com/code/jamesimbuido/python-password-creator-and-evaluator"
interactive: false
---

<!-- Body intentionally unused — all content lives in frontmatter (Phase 3). -->
