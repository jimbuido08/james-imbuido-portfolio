---
title: "Bank Customer Churn Prediction (R)"
category: CLASSICAL_ML
description: "A comparative churn-prediction study in R — logistic regression, SVM, random forest, and Naive Bayes on a bank customer dataset, with the random forest deployed as a reusable scoring model."
featured: false
technologies:
  - R
  - dplyr
  - caret
  - randomForest
  - e1071
  - pROC
  - DataExplorer
  - skimr
  - ggplot2
problem: "Customer churn in the banking industry poses significant financial and reputational risk, and acquiring new customers is typically more expensive than retaining existing ones. Predicting churn accurately lets a bank address dissatisfaction early and run targeted retention strategies. This project explores whether enriching the model with demographic and geographic features improves churn prediction."
data: "The Bank Customer Churn dataset (gauravtopre/bank-customer-churn-dataset) — customer demographics, account activity, product usage, and financial behaviour. Roughly 20% of the sample had churned, so the response is imbalanced."
approach: "Exploratory analysis with DataExplorer and skimr (histograms, density plots, correlation plots, and an automated EDA report) to understand distributions and class balance. Feature engineering dropped the customer_id, one-hot encoded gender (is_female) and country (via model.matrix), and relocated the churn response. Data was split 80/20 (set.seed(123)) and four classifiers were trained on the same partition."
models: "Logistic Regression (glm, binomial), Support Vector Machine (radial kernel), Random Forest (500 trees), and Naive Bayes."
evaluation: "Each model was scored on the held-out test set with a confusion matrix and an ROC curve."
results: "The Random Forest was selected as the best model for its relatively higher accuracy. It was saved as rf_model.rds and wrapped in a predict_churn() function so new customer records can be scored directly. (The notebook records no single accuracy figure, so none is claimed here.)"
lessons: "Comparing four model families on one partition makes the accuracy/interpretability trade-off concrete. Automated EDA quickly surfaced the 20% churn imbalance and the distributions behind the features, and dummy-coding categoricals before modelling kept the pipeline simple."
kaggleUrl: "https://www.kaggle.com/code/jamesimbuido/r-bank-customer-churn-prediction"
interactive: false
---

<!-- Body intentionally unused — all content lives in frontmatter (Phase 3). -->
