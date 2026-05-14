"""
InsightFlow — evaluate_model.py
================================
Feedback loop evaluator for the Self-Correction Engine (Phase 5).

Run modes:
  CLI:        python evaluate_model.py
  FastAPI BG: called as BackgroundTask after every /api/predict call

What it does:
  1. Query predictions where evaluate_after <= today and actual_result IS NULL
  2. For each: fetch current price via yfinance, compare with predicted direction
  3. Update actual_result  (Correct / Incorrect) + actual_price in DB
  4. Compute rolling 20-prediction accuracy
  5. If accuracy < 55%:  escalate RF hyperparameters in model_config.json
  6. If accuracy >= 65%: de-escalate (relax params back toward defaults)
"""

import json
import logging
import os
import sys
from datetime import datetime

import yfinance as yf

# Allow running from any directory
sys.path.insert(0, os.path.dirname(__file__))
import database as db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [evaluate_model] %(levelname)s — %(message)s",
)
logger = logging.getLogger("evaluate_model")

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "model_config.json")

# ─── Hyperparameter Escalation Presets ───────────────────────────────────────
# Level 0 = default, Level 1 = moderate escalation, Level 2 = aggressive
PARAM_LEVELS = [
    {"n_estimators": 200, "max_depth": 6,  "min_samples_leaf": 4},   # level 0
    {"n_estimators": 300, "max_depth": 8,  "min_samples_leaf": 3},   # level 1
    {"n_estimators": 400, "max_depth": 10, "min_samples_leaf": 2},   # level 2
]

ACCURACY_THRESHOLD_LOW  = 0.60   # below this  → escalate (Phase 8: raised from 0.55)
ACCURACY_THRESHOLD_HIGH = 0.70   # above this  → try relaxing
MIN_EVALUATED           = 10     # don't act until at least N rows evaluated

WEIGHTS_PATH = os.path.join(os.path.dirname(__file__), "feature_weights.json")

DEFAULT_WEIGHTS = {
    "rsi14": 1.0,
    "macd": 1.0,
    "macd_signal": 1.0,
    "macd_hist": 1.0,
    "volume_z": 1.0,
    "bb_upper": 1.0,
    "bb_lower": 1.0,
    "vwap": 1.0,
    "atr14": 1.0,
    "dist_ema20": 1.0,
    "dist_ema50": 1.0
}


# ─── Config I/O ───────────────────────────────────────────────────────────────

def _load_config() -> dict:
    try:
        with open(CONFIG_PATH) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {**PARAM_LEVELS[0], "retrain_trigger_count": 0,
                "last_accuracy": None, "last_evaluated_at": None}


def _save_config(cfg: dict) -> None:
    cfg["last_evaluated_at"] = datetime.utcnow().isoformat()
    with open(CONFIG_PATH, "w") as f:
        json.dump(cfg, f, indent=4)


def _load_weights() -> dict:
    try:
        if os.path.exists(WEIGHTS_PATH):
            with open(WEIGHTS_PATH) as f:
                return json.load(f)
    except Exception:
        pass
    return DEFAULT_WEIGHTS.copy()


def _save_weights(weights: dict) -> None:
    with open(WEIGHTS_PATH, "w") as f:
        json.dump(weights, f, indent=4)


# ─── Core Evaluator ───────────────────────────────────────────────────────────

def run_evaluation() -> dict:
    """
    Main entry point — safe to call frequently (idempotent).
    Returns a summary dict with evaluation results.
    """
    pending = db.get_pending_evaluations()
    logger.info(f"Pending predictions to evaluate: {len(pending)}")

    evaluated = 0
    errors    = 0

    for row in pending:
        ticker = row["ticker"]
        try:
            # Fetch the latest closing price
            hist = yf.Ticker(ticker).history(period="5d", interval="1d")
            if hist.empty:
                logger.warning(f"No price data for {ticker} — likely market closed/holiday.")
                db.update_result(row["id"], "AWAITING_MARKET_OPEN", 0.0)
                continue

            actual_price     = float(hist["Close"].iloc[-1])
            entry_price      = row["price_at_prediction"]
            pred_direction   = row["predicted_direction"]

            if entry_price is None or entry_price == 0:
                logger.warning(f"Row {row['id']} has no entry price — skipping.")
                continue

            # If target_date is set, always evaluate against the exact price on that date (or next trading day)
            target_date_str = row.get("target_date")
            if target_date_str:
                try:
                    from datetime import timedelta
                    target_dt = datetime.strptime(target_date_str, "%Y-%m-%d")
                    start_str = target_dt.strftime("%Y-%m-%d")
                    # Fetch next 5 days to ensure we get the correct closing price even over weekends/holidays
                    end_str = (target_dt + timedelta(days=5)).strftime("%Y-%m-%d")
                    
                    past_hist = yf.Ticker(ticker).history(start=start_str, end=end_str, interval="1d")
                    if not past_hist.empty:
                        # Price exactly at or just after target_date
                        actual_price = float(past_hist["Close"].iloc[0])
                except Exception as e:
                    logger.warning(f"Error fetching historical target_date price for {ticker}: {e}")

            # Determine result
            if abs(actual_price - entry_price) < 0.001:
                result = "TIE"
            else:
                price_moved_up = actual_price > entry_price
                if (pred_direction == "UP" and price_moved_up) or \
                   (pred_direction == "DOWN" and not price_moved_up):
                    result = "CORRECT"
                else:
                    result = "INCORRECT"

            db.update_result(row["id"], result, actual_price)
            logger.info(
                f"[{ticker}] Pred={pred_direction} EntryPrice={entry_price:.2f} "
                f"ActualPrice={actual_price:.2f} → {result}"
            )
            
            # Phase 17: Self-Modification Logic (Feature Attribution)
            if result == "INCORRECT":
                try:
                    analysis = json.loads(row.get("detailed_analysis", "{}"))
                    weights = _load_weights()
                    
                    # 1. RSI Attribution
                    rsi = analysis.get("rsi")
                    if rsi:
                        # If RSI was high (Overbought) and we predicted UP but were wrong
                        # RSI was actually a GOOD signal (warning of exhaustion), but we overrode it.
                        if rsi > 70 and pred_direction == "UP":
                            weights["rsi14"] = round(min(weights.get("rsi14", 1.0) + 0.05, 1.5), 2)
                        # If RSI was low (Oversold) and we predicted UP but were wrong
                        # RSI gave a FALSE buy signal.
                        elif rsi < 30 and pred_direction == "UP":
                            weights["rsi14"] = round(max(weights.get("rsi14", 1.0) - 0.05, 0.5), 2)
                    
                    # 2. MACD Histogram Attribution
                    macd_hist = analysis.get("macd_hist")
                    if macd_hist is not None:
                        # If hist was negative (bearish trend) and we predicted UP but were wrong
                        # MACD was a GOOD warning.
                        if macd_hist < 0 and pred_direction == "UP":
                            weights["macd_hist"] = round(min(weights.get("macd_hist", 1.0) + 0.05, 1.5), 2)
                        elif macd_hist > 0 and pred_direction == "DOWN":
                            weights["macd_hist"] = round(min(weights.get("macd_hist", 1.0) + 0.05, 1.5), 2)
                    
                    # 3. Volume Attribution
                    vol_z = analysis.get("volume_z")
                    if vol_z and vol_z > 2.0:
                        # High volume climax that reversed?
                        weights["volume_z"] = round(max(weights.get("volume_z", 1.0) - 0.05, 0.5), 2)

                    _save_weights(weights)
                except Exception as e:
                    logger.error(f"Feature attribution error: {e}")

            evaluated += 1

        except Exception as e:
            logger.error(f"Error evaluating row {row['id']} ({ticker}): {e}")
            errors += 1

    # ── Rolling accuracy check + auto-correction ──────────────────────────────
    acc_data = db.get_recent_accuracy(n=20)
    cfg      = _load_config()

    summary = {
        "evaluated": evaluated,
        "errors":    errors,
        "pending":   len(pending),
        **acc_data,
        "action":    "none",
    }

    if acc_data["evaluated_count"] < MIN_EVALUATED:
        logger.info(f"Only {acc_data['evaluated_count']} evaluated rows — skipping hyperparameter check.")
        _save_config(cfg)
        return summary

    accuracy = acc_data["accuracy"]
    cfg["last_accuracy"] = accuracy

    # Determine current escalation level by matching params
    current_level = 0
    for lvl, params in enumerate(PARAM_LEVELS):
        if (cfg.get("n_estimators") == params["n_estimators"] and
                cfg.get("max_depth") == params["max_depth"]):
            current_level = lvl
            break

    if accuracy < ACCURACY_THRESHOLD_LOW:
        new_level = min(current_level + 1, len(PARAM_LEVELS) - 1)
        if new_level != current_level:
            cfg.update(PARAM_LEVELS[new_level])
            cfg["retrain_trigger_count"] = cfg.get("retrain_trigger_count", 0) + 1
            summary["action"] = f"escalated_to_level_{new_level}"
            logger.warning(
                f"⚠️  Accuracy {accuracy:.1%} < {ACCURACY_THRESHOLD_LOW:.0%} "
                f"→ Escalating RF to level {new_level}: {PARAM_LEVELS[new_level]}"
            )
        else:
            logger.warning(f"Already at max escalation level {current_level}. Accuracy={accuracy:.1%}")
            summary["action"] = "at_max_level"

    elif accuracy >= ACCURACY_THRESHOLD_HIGH and current_level > 0:
        new_level = current_level - 1
        cfg.update(PARAM_LEVELS[new_level])
        summary["action"] = f"relaxed_to_level_{new_level}"
        logger.info(
            f"✅  Accuracy {accuracy:.1%} >= {ACCURACY_THRESHOLD_HIGH:.0%} "
            f"→ Relaxing RF back to level {new_level}"
        )
    else:
        logger.info(f"Accuracy {accuracy:.1%} within acceptable range — no parameter change.")

    _save_config(cfg)
    return summary



# ─── Phase 8: Model Health API ───────────────────────────────────────────────

def get_model_health() -> dict:
    """
    Return the current state of the self-correction engine.
    Used by GET /api/model-health for the frontend AccuracyTracker.
    """
    cfg      = _load_config()
    acc_data = db.get_recent_accuracy(n=20)

    # Determine escalation level
    current_level = 0
    for lvl, params in enumerate(PARAM_LEVELS):
        if (cfg.get("n_estimators") == params["n_estimators"] and
                cfg.get("max_depth") == params["max_depth"]):
            current_level = lvl
            break

    level_labels = ["Standard", "Moderate Escalation", "Aggressive Escalation"]

    return {
        "accuracy":             acc_data.get("accuracy"),
        "evaluated_count":      acc_data.get("evaluated_count", 0),
        "correct":              acc_data.get("correct", 0),
        "incorrect":            acc_data.get("incorrect", 0),
        "escalation_level":     current_level,
        "escalation_label":     level_labels[current_level],
        "retrain_trigger_count": cfg.get("retrain_trigger_count", 0),
        "last_evaluated_at":    cfg.get("last_evaluated_at"),
        "last_accuracy":        cfg.get("last_accuracy"),
        "threshold_low":        ACCURACY_THRESHOLD_LOW,
        "threshold_high":       ACCURACY_THRESHOLD_HIGH,
        "rf_params": {
            "n_estimators":    cfg.get("n_estimators"),
            "max_depth":       cfg.get("max_depth"),
            "min_samples_leaf": cfg.get("min_samples_leaf"),
        },
        "status": (
            "critical" if (acc_data.get("accuracy") or 1.0) < ACCURACY_THRESHOLD_LOW
            else "good" if (acc_data.get("accuracy") or 0.0) >= ACCURACY_THRESHOLD_HIGH
            else "monitoring"
        )
    }


# ─── CLI entrypoint ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    db.init_db()
    result = run_evaluation()
    print(json.dumps(result, indent=2))
