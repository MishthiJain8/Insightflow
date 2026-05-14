"""
InsightFlow — database.py (MongoDB Version)
=========================================
MongoDB wrapper for the prediction feedback loop.
Replaces the SQLite3 implementation.
"""

import os
import json
import time
from datetime import datetime, timedelta
from pandas.tseries.offsets import BDay
from dotenv import load_dotenv
from pymongo import MongoClient, ASCENDING, DESCENDING
from bson import ObjectId
import math

load_dotenv()

# --- Initialize MongoDB ---
MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
DB_NAME = os.getenv("MONGODB_DB_NAME", "insightflow")

client = MongoClient(MONGO_URI)
db_conn = client[DB_NAME]

# Collections
members = db_conn["members"]
profiles = db_conn["profiles"]
predictions = db_conn["predictions"]
portfolio = db_conn["portfolio"]
notifications = db_conn["notifications"]
audio_analysis = db_conn["audio_analysis"]
otp_sessions = db_conn["otp_sessions"]
watchlist = db_conn["watchlist"]
portfolio_snapshots = db_conn["portfolio_snapshots"]

# ─── Helper: Format MongoDB Document ──────────────────────────────────────────
def _clean_floats(val):
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return None
    elif isinstance(val, dict):
        for k, v in list(val.items()):
            val[k] = _clean_floats(v)
    elif isinstance(val, list):
        for i in range(len(val)):
            val[i] = _clean_floats(val[i])
    return val

def _fmt(doc):
    """Map MongoDB _id to 'id' string for frontend compatibility."""
    if doc:
        if "_id" in doc:
            doc["id"] = str(doc.pop("_id"))
        # If there's an existing 'id' field (from SQLite migration), keep it as 'id'
        # but ensure it's a string if it's currently an int, to avoid confusion.
        if "id" in doc and not isinstance(doc["id"], str):
             doc["id"] = str(doc["id"])
        doc = _clean_floats(doc)
    return doc

def _uid_match(user_id):
    """Build a strict user_id match query. Handles both string ObjectId and migrated int IDs."""
    conditions = [{"user_id": user_id}]
    try:
        conditions.append({"user_id": int(user_id)})
    except (ValueError, TypeError):
        pass
    return {"$or": conditions}

# ─── Public API ───────────────────────────────────────────────────────────────

def init_db() -> None:
    """Ensure collections and indexes exist."""
    # Explicitly create collections so they appear in Compass
    existing = db_conn.list_collection_names()
    for name in ["members", "profiles", "predictions", "portfolio", "notifications", "audio_analysis", "otp_sessions", "watchlist", "portfolio_snapshots"]:
        if name not in existing:
            db_conn.create_collection(name)
            print(f"  Created collection: {name}")

    # Indexes
    members.create_index("email", unique=True)
    profiles.create_index("user_id", unique=True)
    predictions.create_index([("evaluate_after", ASCENDING), ("actual_result", ASCENDING)], name="idx_evaluate_after")
    predictions.create_index("user_id")
    predictions.create_index("ticker")
    portfolio.create_index("user_id")
    notifications.create_index("user_id")
    notifications.create_index([("timestamp", DESCENDING)])
    otp_sessions.create_index("expires_at", expireAfterSeconds=0) # TTL Index
    watchlist.create_index([("user_id", ASCENDING), ("ticker", ASCENDING)], unique=True)
    portfolio_snapshots.create_index([("user_id", ASCENDING), ("timestamp", DESCENDING)])
    print("Database indexes initialized.")

# No-op schema upgrades (MongoDB is schemaless)
def upgrade_portfolio_schema(): pass
def upgrade_predictions_schema(): pass
def upgrade_notifications_schema(): pass

# ─── Auth Helpers ──────────────────────────────────────────────────────────────

def get_user_by_email(email: str):
    user = members.find_one({"email": email})
    return _fmt(user)

def get_all_user_ids() -> list:
    # We return the 'id' (mapped from _id) or the migrated 'id'
    users = members.find({}, {"_id": 1, "id": 1})
    results = []
    for u in users:
        formatted = _fmt(u)
        results.append(formatted["id"])
    return results

def get_pending_predictions_for_audit(today_str: str) -> list:
    # Fetch where status is PENDING and target_date <= today_str
    # Need to handle user_id as string/int
    rows = predictions.find({
        "status": "PENDING",
        "target_date": {"$lte": today_str}
    })
    return [_fmt(r) for r in rows]

def update_prediction(prediction_id: str, payload: dict):
    from bson import ObjectId
    query = {}
    try:
        query["_id"] = ObjectId(prediction_id)
    except:
        # Fallback for migrated integer IDs
        try:
            query["id"] = int(prediction_id)
        except:
            query["id"] = prediction_id
    
    predictions.update_one(query, {"$set": payload})

def create_user(email: str, password_hash: str) -> str:
    res = members.insert_one({
        "email": email,
        "password_hash": password_hash,
        "created_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    })
    return str(res.inserted_id)

def update_password_by_email(email: str, password_hash: str) -> None:
    members.update_one({"email": email}, {"$set": {"password_hash": password_hash}})

def get_user_by_id(user_id: str):
    query = {}
    try:
        query["_id"] = ObjectId(user_id)
    except:
        try:
            query["id"] = int(user_id)
        except:
            query["id"] = user_id
    doc = members.find_one(query)
    return _fmt(doc)

def update_password_by_id(user_id: str, password_hash: str) -> None:
    query = {}
    try:
        query["_id"] = ObjectId(user_id)
    except:
        try:
            query["id"] = int(user_id)
        except:
            query["id"] = user_id
    members.update_one(query, {"$set": {"password_hash": password_hash}})

def get_notification_owner(notif_id: str):
    """Return the user_id of a notification, or None."""
    query = {}
    try:
        query["_id"] = ObjectId(notif_id)
    except:
        try:
            query["id"] = int(notif_id)
        except:
            query["id"] = notif_id
    doc = notifications.find_one(query, {"user_id": 1})
    return doc.get("user_id") if doc else None

def get_all_portfolio(user_id: str) -> list[dict]:
    """Get ALL portfolio items (OPEN + CLOSED) for a user."""
    query = _uid_match(user_id)
    rows = portfolio.find(query).sort("buy_date", DESCENDING)
    return [_fmt(r) for r in rows]

def get_profile(user_id: str):
    # Search for user_id as string, or as int if possible
    conditions = [{"user_id": user_id}]
    try:
        conditions.append({"user_id": int(user_id)})
    except (ValueError, TypeError):
        pass
        
    doc = profiles.find_one({"$or": conditions})
    return _fmt(doc)

def upsert_profile(payload: dict):
    # payload has user_id
    user_id = payload.get("user_id")
    query = {}
    try:
        query["user_id"] = int(user_id)
    except:
        query["user_id"] = user_id
        
    profiles.update_one(
        query,
        {"$set": payload},
        upsert=True
    )

# ─── OTP Helpers ──────────────────────────────────────────────────────────────

def otp_store(email: str, otp: str, ttl_seconds: int = 600) -> None:
    otp_sessions.update_one(
        {"email": email},
        {"$set": {
            "email": email,
            "otp": otp,
            "expires_at": datetime.utcnow() + timedelta(seconds=ttl_seconds)
        }},
        upsert=True
    )

def otp_get(email: str):
    doc = otp_sessions.find_one({"email": email})
    if not doc:
        return None
    # TTL index will handle expiration, but we can double check
    if datetime.utcnow() > doc["expires_at"]:
        otp_delete(email)
        return None
    
    # Convert datetime back to timestamp if code expects it, but let's just return dict
    doc["expires_at"] = doc["expires_at"].timestamp()
    return _fmt(doc)

def otp_delete(email: str) -> None:
    otp_sessions.delete_one({"email": email})

# ─── Prediction Record Helpers ───────────────────────────────────────────────

def log_prediction(
    user_id: str,
    ticker: str,
    price_at_prediction: float,
    predicted_direction: str,
    predicted_prob: float,
    model_accuracy: float,
    detailed_analysis: str = None,
    horizon: int = 7,
) -> str:
    now = datetime.utcnow()
    
    # Deduplication: Prevent double-saves within 60 seconds
    recent = predictions.find_one({
        "user_id": user_id,
        "ticker": ticker.upper(),
        "prediction_horizon": horizon,
        "status": "PENDING",
        "date_predicted": {"$gt": (now - timedelta(seconds=60)).isoformat()}
    })
    if recent:
        return str(recent["_id"])

    target_date = (now + BDay(horizon)).strftime("%Y-%m-%d")
    eval_after = (now + BDay(horizon)).strftime("%Y-%m-%d")
    
    doc = {
        "user_id": user_id,
        "ticker": ticker.upper(),
        "date_predicted": now.isoformat(),
        "price_at_prediction": price_at_prediction,
        "predicted_direction": predicted_direction,
        "predicted_prob": predicted_prob,
        "model_accuracy": model_accuracy,
        "prediction_horizon": horizon,
        "target_date": target_date,
        "status": "PENDING",
        "evaluate_after": eval_after,
        "detailed_analysis": detailed_analysis,
        "actual_result": None,
        "actual_price": None,
        "evaluated_at": None,
        "learning_notes": None
    }
    res = predictions.insert_one(doc)
    return str(res.inserted_id)

def get_prediction_history(ticker: str, user_id: str | None = None, n: int = 20) -> list[dict]:
    query = {"ticker": ticker.upper(), "actual_result": {"$ne": None}}
    if user_id:
        query["user_id"] = user_id
        
    rows = predictions.find(query).sort("date_predicted", DESCENDING).limit(n)
    return [_fmt(r) for r in rows]

def get_all_predictions(user_id: str, limit: int = 500) -> list[dict]:
    query = _uid_match(user_id)
    rows = predictions.find(query).sort("date_predicted", DESCENDING).limit(limit)
    return [_fmt(r) for r in rows]

def get_prediction_by_id(row_id: str) -> dict:
    query = {}
    try:
        query["_id"] = ObjectId(row_id)
    except:
        try:
            query["id"] = int(row_id)
        except:
            query["id"] = row_id
            
    doc = predictions.find_one(query)
    return _fmt(doc)

def write_learning_note(prediction_id: str, note: str) -> bool:
    try:
        query = {}
        try:
            query["_id"] = ObjectId(prediction_id)
        except:
            try:
                query["id"] = int(prediction_id)
            except:
                query["id"] = prediction_id
                
        predictions.update_one(query, {"$set": {"learning_notes": note}})
        return True
    except Exception as e:
        print(f"write_learning_note error: {e}")
        return False

def get_pending_evaluations() -> list[dict]:
    today = datetime.utcnow().strftime("%Y-%m-%d")
    rows = predictions.find({
        "evaluate_after": {"$lte": today},
        "actual_result": None
    }).sort("date_predicted", ASCENDING)
    return [_fmt(r) for r in rows]

def get_pending_evaluations_summary(user_id: str) -> dict:
    today = datetime.utcnow().strftime("%Y-%m-%d")
    rows = list(predictions.find({
        "user_id": user_id,
        "evaluate_after": {"$lte": today},
        "actual_result": None
    }, {"ticker": 1}))
    
    tickers = sorted(list(set(r["ticker"] for r in rows)))
    return {
        "pending_count": len(rows),
        "ready_tickers": tickers
    }

def update_result(row_id: str, result: str, actual_price: float) -> None:
    now = datetime.utcnow().isoformat()
    query = {}
    try:
        query["_id"] = ObjectId(row_id)
    except:
        try:
            query["id"] = int(row_id)
        except:
            query["id"] = row_id

    predictions.update_one(query, {"$set": {
        "actual_result": result,
        "actual_price": actual_price,
        "evaluated_at": now,
        "status": "COMPLETED"
    }})

def save_learning_note(row_id: str, note: str) -> None:
    query = {}
    try:
        query["_id"] = ObjectId(row_id)
    except:
        try:
            query["id"] = int(row_id)
        except:
            query["id"] = row_id
    predictions.update_one(query, {"$set": {"learning_notes": note}})

def get_recent_accuracy(n: int = 20, user_id: str = None) -> dict:
    query = {"actual_result": {"$ne": None}}
    if user_id:
        query["user_id"] = user_id
    
    rows = list(predictions.find(query).sort("evaluated_at", DESCENDING).limit(n))

    if not rows:
        return {"accuracy": None, "evaluated_count": 0, "correct": 0, "incorrect": 0}

    correct = sum(1 for r in rows if str(r["actual_result"]).upper() == "CORRECT")
    incorrect = len(rows) - correct
    return {
        "accuracy": round(correct / len(rows), 4),
        "evaluated_count": len(rows),
        "correct": correct,
        "incorrect": incorrect,
    }

def get_ticker_accuracy(ticker: str, n: int = 15, user_id: str = None) -> dict:
    query = {"ticker": ticker.upper(), "actual_result": {"$ne": None}}
    if user_id:
        query["user_id"] = user_id
        
    rows = list(predictions.find(query).sort("evaluated_at", DESCENDING).limit(n))

    if len(rows) < 3:
        return {"accuracy": None, "evaluated_count": len(rows), "correct": 0, "incorrect": 0}

    correct   = sum(1 for r in rows if str(r.get("actual_result")).upper() == "CORRECT")
    incorrect = len(rows) - correct

    return {
        "accuracy":        round(correct / len(rows), 4),
        "evaluated_count": len(rows),
        "correct":         correct,
        "incorrect":       incorrect,
    }

# ─── Portfolio Functions ──────────────────────────────────────────────────────

def get_portfolio_holdings(user_id: str) -> list[dict]:
    query = _uid_match(user_id)
    query["status"] = "OPEN"
    rows = portfolio.find(query).sort("buy_date", DESCENDING)
    return [_fmt(r) for r in rows]

def get_portfolio_item(item_id: str, user_id: str) -> dict | None:
    query = {"user_id": user_id} # Simplified, assuming new ones use string
    try:
        query_id = ObjectId(item_id)
        query["_id"] = query_id
    except:
        try:
            query["id"] = int(item_id)
        except:
            query["id"] = item_id
            
    doc = portfolio.find_one(query)
    return _fmt(doc)

def add_portfolio_holding(payload: dict) -> str:
    res = portfolio.insert_one(payload)
    return str(res.inserted_id)

def update_portfolio_holding(item_id: str, payload: dict):
    query = {}
    try:
        query["_id"] = ObjectId(item_id)
    except:
        try:
            query["id"] = int(item_id)
        except:
            query["id"] = item_id
            
    portfolio.update_one(query, {"$set": payload})

def sell_portfolio_holding(row_id: str, user_id: str, sell_price: float) -> bool:
    now = datetime.utcnow().isoformat()
    
    query = {"user_id": user_id, "status": "OPEN"}
    try:
        query["_id"] = ObjectId(row_id)
    except:
        try:
            query["id"] = int(row_id)
        except:
            query["id"] = row_id
            
    row = portfolio.find_one(query)
    if not row:
        return False
    
    qty = row.get("quantity", 0)
    entry_price = row.get("buy_price") or row.get("avg_buy_price") or 0
    realized_pnl = (sell_price - entry_price) * qty
    
    portfolio.update_one(query, {"$set": {
        "status": "CLOSED",
        "sell_price": sell_price,
        "sell_date": now,
        "realized_pnl": realized_pnl
    }})
    return True

def save_portfolio_snapshot(user_id: str, total_value: float) -> None:
    now = datetime.utcnow()
    # Check if we already have a snapshot for today to avoid flooding
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    portfolio_snapshots.update_one(
        {"user_id": user_id, "timestamp": {"$gte": today_start.isoformat()}},
        {"$set": {
            "user_id": user_id,
            "total_value": total_value,
            "timestamp": now.isoformat()
        }},
        upsert=True
    )

def get_portfolio_history(user_id: str, limit: int = 30) -> list[dict]:
    query = _uid_match(user_id)
    rows = portfolio_snapshots.find(query).sort("timestamp", ASCENDING).limit(limit)
    return [_fmt(r) for r in rows]

# ─── Notifications Functions ──────────────────────────────────────────────────

def add_notification(type: str, message: str, ticker: str, user_id: str = None) -> str:
    now = datetime.utcnow()
    yesterday_str = (now - timedelta(days=1)).isoformat()
    now_str = now.isoformat()
    
    # Check for duplicates — strict per-user
    query = {
        "type": type,
        "ticker": ticker.upper(),
        "message": message,
        "timestamp": {"$gt": yesterday_str},
        "user_id": user_id
    }
    existing = notifications.find_one(query)
    if existing:
        return str(existing["_id"])
        
    res = notifications.insert_one({
        "type": type,
        "message": message,
        "ticker": ticker.upper(),
        "timestamp": now_str,
        "is_read": 0,
        "user_id": user_id
    })
    return str(res.inserted_id)

def get_notifications(user_id: str = None) -> list[dict]:
    if not user_id:
        return []
    query = _uid_match(user_id)
    rows = notifications.find(query).sort("timestamp", DESCENDING)
    return [_fmt(r) for r in rows]

def get_unread_notification_count(user_id: str) -> int:
    query = _uid_match(user_id)
    query["is_read"] = 0
    return notifications.count_documents(query)

def mark_notifications_as_read(user_id: str) -> None:
    query = _uid_match(user_id)
    query["is_read"] = 0
    notifications.update_many(query, {"$set": {"is_read": 1}})

def delete_notification(notif_id: str) -> None:
    query = {}
    try:
        query["_id"] = ObjectId(notif_id)
    except:
        try:
            query["id"] = int(notif_id)
        except:
            query["id"] = notif_id
            
    notifications.delete_one(query)

def delete_all_notifications(user_id: str) -> None:
    """Permanently delete all notifications for a specific user."""
    query = _uid_match(user_id)
    notifications.delete_many(query)

def clear_notifications(user_id: str = None) -> None:
    query = {}
    if user_id:
        query["user_id"] = user_id
    notifications.delete_many(query)

# ─── Audio Analysis Functions ────────────────────────────────────────────────

def insert_audio_analysis(ticker: str, source_url: str, anxiety: float, confidence: float, hesitation: float, composite: float) -> str:
    res = audio_analysis.insert_one({
        "ticker": ticker.upper(),
        "source_url": source_url,
        "anxiety_score": anxiety,
        "confidence_score": confidence,
        "hesitation_score": hesitation,
        "composite_emotion_score": composite,
        "created_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    })
    return str(res.inserted_id)

def get_latest_audio_analysis(ticker: str) -> dict | None:
    doc = audio_analysis.find_one({"ticker": ticker.upper()}, sort=[("_id", DESCENDING)])
    return _fmt(doc)

def get_predictions_in_range(start_date: str, end_date: str) -> list[dict]:
    # SQLite logic used date(evaluated_at), which works with ISO strings.
    # We'll use string comparison on evaluated_at.
    query = {
        "actual_result": {"$ne": None},
        "evaluated_at": {"$gte": start_date, "$lte": end_date}
    }
    rows = predictions.find(query)
    return [_fmt(r) for r in rows]

def get_prediction(prediction_id: str) -> dict | None:
    return get_prediction_by_id(prediction_id)

# ─── Watchlist Functions ──────────────────────────────────────────────────────

def get_watchlist(user_id: str) -> list[str]:
    rows = watchlist.find({"user_id": user_id}, {"ticker": 1, "_id": 0})
    return [r["ticker"] for r in rows]

def add_to_watchlist(user_id: str, ticker: str) -> bool:
    try:
        watchlist.insert_one({"user_id": user_id, "ticker": ticker.upper()})
        return True
    except Exception:
        return False  # duplicate

def remove_from_watchlist(user_id: str, ticker: str) -> None:
    watchlist.delete_one({"user_id": user_id, "ticker": ticker.upper()})
