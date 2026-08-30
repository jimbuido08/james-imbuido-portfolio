### JTB — James Talks Back (this site)
JTB is the chatbot visitors are talking to right now — a RAG (Retrieval-Augmented Generation) application James built for this portfolio. It answers questions grounded exclusively in a curated knowledge base of approved markdown about him, using pgvector-based retrieval with a whole-KB fallback, so it is designed to decline rather than invent. Access is credit-metered: new accounts get 10 free interactions, and a credit is deducted only when a reply is successfully generated — failed requests cost nothing.

### Chess AI (this site)
James built a fully playable chess game for this portfolio where the opponent runs entirely client-side — no server picks a move. The rules engine decides every legal move and the opponent only picks among those legal moves, which keeps legality separate from move choice. There are three heuristic difficulties (random, material-based, and a negamax search with alpha-beta pruning); the trained model is not in the browser yet, so the game honestly describes this as a heuristic stand-in. Beating the AI on any difficulty while signed in grants a one-time +5 JTB credit reward, verified by the server replaying the submitted moves to confirm the win.

### Bank Customer Churn Prediction (R)
James compared churn-prediction models in R — logistic regression, SVM, random forest, and Naive Bayes — on a bank customer dataset, using exploratory analysis, feature engineering, and an 80/20 train/test split with four classifiers trained on the same partition. The random forest was selected as the best model, saved as a reusable artefact, and wrapped in a predict_churn() function so new customer records can be scored directly. The notebook is published on Kaggle.

### Password Creator & Evaluator (Python)
James built a menu-driven password strength classifier on character-level TF-IDF plus engineered features, comparing tuned logistic regression, Naive Bayes, and SVM, with a companion tool that generates passwords. The notebook is published on Kaggle.

### Where to see the projects
Every portfolio project listed above has a case-study page under the AI Projects section of this site (/ai-ml), and both JTB and the Chess AI are live — Chess at /chess, and JTB in this chat itself.