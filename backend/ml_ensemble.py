import numpy as np
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, VotingClassifier
from sklearn.model_selection import cross_val_score
import xgboost as xgb
import logging

logger = logging.getLogger("ml_ensemble")

def build_ensemble_model(rf_config: dict = None):
    """
    Builds a Voting Classifier comprising RandomForest, XGBoost, and GradientBoosting.
    This replaces the single RandomForest model with an institutional-grade ensemble.
    """
    n_est = rf_config.get("n_estimators", 200) if rf_config else 200
    max_d = rf_config.get("max_depth", 6) if rf_config else 6
    min_leaf = rf_config.get("min_samples_leaf", 4) if rf_config else 4
    
    # 1. Random Forest (Stability & Baseline)
    rf = RandomForestClassifier(
        n_estimators=n_est,
        max_depth=max_d,
        min_samples_leaf=min_leaf,
        random_state=42,
        n_jobs=-1
    )
    
    # 2. XGBoost (High Accuracy on Tabular Data)
    xgb_model = xgb.XGBClassifier(
        n_estimators=max(50, int(n_est * 0.8)),
        max_depth=min(max_d + 1, 10),
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        eval_metric='logloss',
        n_jobs=-1
    )
    
    # 3. Gradient Boosting (Error Correction)
    gbc = GradientBoostingClassifier(
        n_estimators=max(50, int(n_est * 0.5)),
        max_depth=min(max_d, 5),
        learning_rate=0.1,
        random_state=42
    )
    
    # Soft voting ensemble (averages predicted probabilities)
    # Weights slightly favor XGBoost
    ensemble = VotingClassifier(
        estimators=[
            ('rf', rf),
            ('xgb', xgb_model),
            ('gbc', gbc)
        ],
        voting='soft',
        weights=[1.0, 1.5, 0.5]
    )
    
    return ensemble

def train_and_predict(X_train: np.ndarray, y_train: np.ndarray, X_pred: np.ndarray, rf_config: dict = None):
    """
    Trains the ensemble and returns predictions + cross-validation accuracy.
    """
    try:
        ensemble = build_ensemble_model(rf_config)
        ensemble.fit(X_train, y_train)
        
        # Calculate CV Accuracy (using Stratified K-Fold implicitly)
        cv = min(5, len(X_train) // 10)
        if cv >= 2:
            cv_scores = cross_val_score(ensemble, X_train, y_train, cv=cv, scoring="accuracy", n_jobs=-1)
            cv_acc = round(float(cv_scores.mean()), 4)
        else:
            cv_acc = 0.5 # Default if impossible to CV
            
        proba = ensemble.predict_proba(X_pred)[0]
        
        try:
            idx_up = list(ensemble.classes_).index(1)
        except ValueError:
            idx_up = 1 if len(ensemble.classes_) > 1 else 0
            
        p_up = round(float(proba[idx_up]) * 100, 1)
        return p_up, cv_acc
    except Exception as e:
        logger.error(f"Ensemble training failed: {e}")
        return 50.0, 0.5
