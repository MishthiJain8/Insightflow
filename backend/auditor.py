"""
InsightFlow — auditor.py
==========================
Automated auditor for stock predictions. 
Evaluates 'PENDING' predictions when their 'target_date' is reached.
Calculates accuracy, updates status to 'COMPLETED', and adds learning notes if needed.
"""

import sys
import os
import sqlite3
import json
from datetime import datetime
import yfinance as yf
from nlp_engine import resolve_real_ticker

# Add parent directory to path to import database
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import database

def run_auditor():
    """
    Finds all PENDING predictions where target_date <= today.
    Fetches actual price from Yahoo Finance and updates results.
    """
    print(f"[{datetime.now().isoformat()}] Starting Automated Auditor...")
    
    # 1. Fetch pending predictions from Supabase
    if not database.supabase:
        print("ERROR: Supabase not configured. Skipping auditor run.")
        return

    today = datetime.now().strftime("%Y-%m-%d")
    try:
        res = (
            database.supabase.table("predictions")
            .select("*")
            .eq("status", "PENDING")
            .lte("target_date", today)
            .execute()
        )
        pending = res.data if res.data else []
    except Exception as e:
        print(f"Error fetching pending predictions: {e}")
        return

    if not pending:
        print("No pending predictions due for audit today.")
        return

    print(f"Found {len(pending)} predictions to audit.")

    for row in pending:
        ticker = row["ticker"]
        target_date = row["target_date"]
        prediction_id = row["id"]
        predicted_dir = row["predicted_direction"]
        price_at_predict = row["price_at_prediction"]

        print(f"Auditing {ticker} (Target: {target_date})...")

        try:
            # 2. Fetch actual price from YFinance
            # Use a slightly wider window to ensure we get the date's close
            start_date = target_date
            # Add one day to end_date because yfinance end is exclusive
            from datetime import timedelta
            end_date = (datetime.strptime(target_date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
            
            stock = yf.Ticker(ticker)
            hist = stock.history(start=start_date, end=end_date)
            if hist.empty:
                # try resolving suffix and retry
                resolved = resolve_real_ticker(ticker)
                if resolved and resolved != ticker:
                    ticker = resolved
                    stock = yf.Ticker(ticker)
                    hist = stock.history(start=start_date, end=end_date)
            
            if hist.empty:
                print(f"  Warning: No price data found for {ticker} on {target_date}. Skipping.")
                continue
            
            actual_price = float(hist['Close'].iloc[-1])
            print(f"  Price at predict: {price_at_predict:.2f}, Actual price: {actual_price:.2f}")

            # 3. Calculate Result
            actual_dir = "UP" if actual_price > price_at_predict else "DOWN"
            is_correct = (actual_dir == predicted_dir)
            result_str = "Correct" if is_correct else "Incorrect"
            
            # 4. Self-Modification Logic (Learning Notes)
            # Requirement: If WRONG (accuracy < 70%), add specific learning note.
            learning_note = None
            if not is_correct:
                model_acc = row.get("model_accuracy") or 0
                if model_acc < 70:
                    try:
                        analysis = json.loads(row.get("detailed_analysis") or "{}")
                        sentiment = (analysis.get("sentiment_label") or analysis.get("sentiment") or "neutral").lower()
                        # Detect sector from analysis or ticker
                        sector = analysis.get("sector", "Tech") # Default to Tech per example if not found
                        
                        if "bull" in sentiment and predicted_dir == "UP":
                            learning_note = f"Overestimated bullish news sentiment in the {sector} sector; reducing FinBERT weight for next time."
                        elif "bear" in sentiment and predicted_dir == "DOWN":
                            learning_note = f"Underestimated market resilience against bearish sentiment in {sector}; adjusting sentiment lag."
                        else:
                            learning_note = f"Technical pattern invalidated by volatility in {sector} sector; increasing regime-detection filters."
                    except:
                        learning_note = "Overestimated bullish news sentiment; reducing FinBERT weight for next time."

            # 5. Update Record
            payload = {
                "actual_result": result_str,
                "actual_price": actual_price,
                "evaluated_at": datetime.utcnow().isoformat(),
                "status": "COMPLETED",
            }
            if learning_note:
                payload["learning_notes"] = learning_note

            database.supabase.table("predictions").update(payload).eq("id", prediction_id).execute()
            print(f"  Result: {result_str}. Updated.")

        except Exception as e:
            print(f"  Error auditing {ticker}: {e}")

    print("Auditor run complete.")

if __name__ == "__main__":
    run_auditor()
