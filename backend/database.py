"""
InsightFlow — database.py
==========================
SQLite3 wrapper for the prediction feedback loop (Phase 5).
No ORM — zero extra dependencies beyond the stdlib.
"""

import sqlite3
import os
from datetime import datetime, timedelta
from pandas.tseries.offsets import BDay
from contextlib import contextmanager
from dotenv import load_dotenv

load_dotenv()

# --- Initialize Supabase Service Role Client ---
supabase = None
try:
    from supabase import create_client, Client
    sb_url = os.getenv("SUPABASE_URL", "")
    sb_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    
    if not sb_url or not sb_key or sb_key.startswith("your_"):
        print(f"CRITICAL: Supabase config missing! URL: {'set' if sb_url else 'MISSING'}, Key: {'set' if sb_key else 'MISSING'}")
    else:
        print(f"Supabase client initialized: {sb_url}")
        supabase: Client = create_client(sb_url, sb_key)
except ImportError:
    print("WARNING: supabase-py not installed.")

DB_PATH = os.path.join(os.path.dirname(__file__), "predictions.db")

# ─── Schema ───────────────────────────────────────────────────────────────────
_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS predictions (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker               TEXT    NOT NULL,
    date_predicted       TEXT    NOT NULL,          -- ISO-8601 UTC datetime
    price_at_prediction  REAL,                      -- last close at predict time
    predicted_direction  TEXT    NOT NULL,          -- UP / DOWN
    predicted_prob       REAL    NOT NULL,          -- 0–100
    model_accuracy       REAL,                      -- CV accuracy at predict time
    prediction_horizon   INTEGER DEFAULT 7,         -- Horizon in days
    target_date          TEXT,                      -- ISO date to evaluate on
    status               TEXT    DEFAULT 'PENDING',  -- PENDING / COMPLETED
    evaluate_after       TEXT    NOT NULL,          -- Legacy: ISO date (date + 7 calendar days)
    actual_result        TEXT    DEFAULT NULL,      -- NULL / Correct / Incorrect
    actual_price         REAL    DEFAULT NULL,
    evaluated_at         TEXT    DEFAULT NULL,
    detailed_analysis    TEXT    DEFAULT NULL,      -- JSON snapshot of features+reasoning
    learning_notes       TEXT    DEFAULT NULL       -- AI self-modification notes
);
"""

_CREATE_PORTFOLIO_TABLE = """
CREATE TABLE IF NOT EXISTS portfolio (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker         TEXT    NOT NULL,
    quantity       REAL    NOT NULL,
    avg_buy_price  REAL    NOT NULL,
    buy_date       TEXT    NOT NULL,          -- ISO-8601 UTC datetime
    sector         TEXT    DEFAULT 'General',
    sell_price     REAL,
    sell_date      TEXT,
    status         TEXT    DEFAULT 'OPEN',
    realized_pnl   REAL
);
"""

_CREATE_NOTIFICATIONS_TABLE = """
CREATE TABLE IF NOT EXISTS notifications (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    type           TEXT    NOT NULL,
    message        TEXT    NOT NULL,
    ticker         TEXT    NOT NULL,
    timestamp      TEXT    NOT NULL,
    is_read        INTEGER DEFAULT 0
);
"""

_CREATE_OTP_TABLE = """
CREATE TABLE IF NOT EXISTS otp_sessions (
    email      TEXT PRIMARY KEY,
    otp        TEXT NOT NULL,
    expires_at REAL NOT NULL
);
"""

_CREATE_IDX = """
CREATE INDEX IF NOT EXISTS idx_evaluate_after
    ON predictions (evaluate_after, actual_result);
"""

# ─── Connection helper ────────────────────────────────────────────────────────
@contextmanager
def _conn():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


# ─── Public API ───────────────────────────────────────────────────────────────

def init_db() -> None:
    """Create DB and table if they don't exist. Safe to call multiple times."""
    with _conn() as con:
        con.execute(_CREATE_TABLE)
        con.execute(_CREATE_IDX)
        con.execute(_CREATE_PORTFOLIO_TABLE)
        con.execute(_CREATE_NOTIFICATIONS_TABLE)
        con.execute(_CREATE_OTP_TABLE)
    upgrade_portfolio_schema()
    upgrade_predictions_schema()

# ─── OTP Helpers ──────────────────────────────────────────────────────────────

def otp_store(email: str, otp: str, ttl_seconds: int = 600) -> None:
    """Insert or replace an OTP record with an expiry timestamp."""
    import time
    with _conn() as con:
        con.execute(
            "INSERT OR REPLACE INTO otp_sessions (email, otp, expires_at) VALUES (?, ?, ?)",
            (email, otp, time.time() + ttl_seconds),
        )

def otp_get(email: str):
    """Return the OTP record for an email, or None if missing/expired."""
    import time
    with _conn() as con:
        row = con.execute(
            "SELECT otp, expires_at FROM otp_sessions WHERE email = ?", (email,)
        ).fetchone()
    if not row:
        return None
    if time.time() > row["expires_at"]:
        otp_delete(email)
        return None
    return dict(row)

def otp_delete(email: str) -> None:
    """Remove the OTP record for an email."""
    with _conn() as con:
        con.execute("DELETE FROM otp_sessions WHERE email = ?", (email,))

        # Phase 14: Automated Horizon Auditor columns
        for col, col_type in [("prediction_horizon", "INTEGER DEFAULT 7"), ("target_date", "TEXT"), ("status", "TEXT DEFAULT 'PENDING'")]:
            try:
                con.execute(f"ALTER TABLE predictions ADD COLUMN {col} {col_type}")
            except sqlite3.OperationalError:
                pass


# ─── Phase 9: Learning Record Helpers ─────────────────────────────────────────

def write_learning_note(prediction_id: int, note: str) -> bool:
    """
    Persist an AI-generated learning note for a specific prediction row.
    Works on both SQLite (local) and Supabase (remote) if available.
    Returns True on success.
    """
    # Try Supabase first (remote predictions table)
    if supabase:
        try:
            supabase.table("predictions").update({"learning_notes": note}).eq("id", prediction_id).execute()
            return True
        except Exception as e:
            print(f"write_learning_note Supabase error: {e}")

    # Fallback: SQLite local
    try:
        with _conn() as con:
            con.execute(
                "UPDATE predictions SET learning_notes = ? WHERE id = ?",
                (note, prediction_id),
            )
        return True
    except Exception as e:
        print(f"write_learning_note SQLite error: {e}")
        return False


def get_prediction_history(ticker: str, user_id: str | None = None, n: int = 20) -> list[dict]:
    """
    Fetch the last N evaluated predictions for a given ticker.
    Returns list of dicts with all prediction fields including detailed_analysis and learning_notes.
    """
    # Try Supabase first
    if supabase:
        try:
            q = (
                supabase.table("predictions")
                .select("*")
                .eq("ticker", ticker.upper())
                .not_.is_("actual_result", "null")
                .order("date_predicted", desc=True)
                .limit(n)
            )
            if user_id:
                q = q.eq("user_id", user_id)
            res = q.execute()
            return res.data if res.data else []
        except Exception as e:
            print(f"get_prediction_history Supabase error: {e}")

    # Fallback: SQLite
    try:
        with _conn() as con:
            cur = con.execute(
                """
                SELECT * FROM predictions
                WHERE ticker = ? AND actual_result IS NOT NULL
                ORDER BY date_predicted DESC
                LIMIT ?
                """,
                (ticker.upper(), n),
            )
            return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        print(f"get_prediction_history SQLite error: {e}")
        return []


def upgrade_portfolio_schema() -> None:
    """Safely inject new Phase 10 columns into existing SQLite portfolio tables."""
    new_cols = [
        ("sell_price", "REAL"),
        ("sell_date", "TEXT"),
        ("status", "TEXT DEFAULT 'OPEN'"),
        ("realized_pnl", "REAL")
    ]
    with _conn() as con:
        for col_name, col_type in new_cols:
            try:
                con.execute(f"ALTER TABLE portfolio ADD COLUMN {col_name} {col_type}")
                if col_name == "status":
                    con.execute("UPDATE portfolio SET status = 'OPEN' WHERE status IS NULL")
            except sqlite3.OperationalError:
                # Column already exists
                pass

def upgrade_predictions_schema() -> None:
    """Safely inject Horizon Auditor columns into existing SQLite predictions tables."""
    new_cols = [
        ("prediction_horizon", "INTEGER DEFAULT 7"),
        ("target_date", "TEXT"),
        ("status", "TEXT DEFAULT 'PENDING'")
    ]
    with _conn() as con:
        for col_name, col_type in new_cols:
            try:
                con.execute(f"ALTER TABLE predictions ADD COLUMN {col_name} {col_type}")
                if col_name == "status":
                    con.execute("UPDATE predictions SET status = 'PENDING' WHERE status IS NULL")
            except sqlite3.OperationalError:
                # Column already exists
                pass


def log_prediction(
    user_id: str,
    ticker: str,
    price_at_prediction: float,
    predicted_direction: str,
    predicted_prob: float,
    model_accuracy: float,
    detailed_analysis: str = None,
    horizon: int = 7,  # Default to 7 days
) -> int:
    """Insert a new prediction row into Supabase. Returns the new row id."""
    now = datetime.utcnow()
    target_date = (now + BDay(horizon)).strftime("%Y-%m-%d")
    eval_after = (now + BDay(horizon)).strftime("%Y-%m-%d")
    
    if not supabase:
        raise Exception("Supabase not configured")

    payload = {
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
    }
    
    res = supabase.table("predictions").insert(payload).execute()
    return res.data[0]["id"] if res.data else None


def get_pending_evaluations() -> list[dict]:
    """Return predictions where evaluate_after <= today and actual_result is still NULL from Supabase."""
    if not supabase: return []
    today = datetime.utcnow().strftime("%Y-%m-%d")
    res = supabase.table("predictions").select("*").lte("evaluate_after", today).is_("actual_result", "null").order("date_predicted").execute()
    return res.data if res.data else []


def get_pending_evaluations_summary(user_id: str) -> dict:
    """Return a summary of pending evaluations for a specific user."""
    if not supabase: return {"pending_count": 0, "ready_tickers": []}
    today = datetime.utcnow().strftime("%Y-%m-%d")
    res = (
        supabase.table("predictions")
        .select("ticker")
        .eq("user_id", user_id)
        .lte("evaluate_after", today)
        .is_("actual_result", "null")
        .execute()
    )
    rows = res.data if res.data else []
    tickers = sorted(list(set(r["ticker"] for r in rows)))
    return {
        "pending_count": len(rows),
        "ready_tickers": tickers
    }


def update_result(row_id: int, result: str, actual_price: float) -> None:
    """Set actual_result and actual_price for a completed prediction in Supabase."""
    if not supabase: return
    payload = {
        "actual_result": result,
        "actual_price": actual_price,
        "evaluated_at": datetime.utcnow().isoformat()
    }
    supabase.table("predictions").update(payload).eq("id", row_id).execute()


def save_learning_note(row_id: int, note: str) -> None:
    """Update the learning_notes column for a prediction in Supabase."""
    if not supabase: return
    supabase.table("predictions").update({"learning_notes": note}).eq("id", row_id).execute()


def get_prediction_by_id(row_id: int) -> dict:
    """Fetch a single prediction row from Supabase."""
    if not supabase: return None
    res = supabase.table("predictions").select("*").eq("id", row_id).execute()
    return res.data[0] if res.data else None


def get_recent_accuracy(n: int = 20, user_id: str = None) -> dict:
    """Rolling accuracy of the last N evaluated predictions. If user_id is provided, limit to that user."""
    if not supabase:
        return {"accuracy": None, "evaluated_count": 0, "correct": 0, "incorrect": 0}

    query = supabase.table("predictions").select("actual_result").not_.is_("actual_result", "null")
    if user_id:
        query = query.eq("user_id", user_id)
        
    res = query.order("evaluated_at", desc=True).limit(n).execute()
    rows = res.data if res.data else []

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


def get_all_predictions(user_id: str, limit: int = 500) -> list[dict]:
    """Return recent predictions scoped to the specific user, newest first."""
    if not supabase: return []
    res = supabase.table("predictions").select("*").eq("user_id", user_id).order("date_predicted", desc=True).limit(limit).execute()
    return res.data if res.data else []


# ─── Portfolio Functions ──────────────────────────────────────────────────────

def add_portfolio_holding(ticker: str, quantity: float, avg_buy_price: float, sector: str = "General") -> int:
    """Insert a new mock holding into the portfolio."""
    now = datetime.utcnow().isoformat()
    with _conn() as con:
        cur = con.execute(
            """
            INSERT INTO portfolio
                (ticker, quantity, avg_buy_price, buy_date, sector, status)
            VALUES (?, ?, ?, ?, ?, 'OPEN')
            """,
            (ticker.upper(), quantity, avg_buy_price, now, sector)
        )
        return cur.lastrowid

def sell_portfolio_holding(row_id: int, sell_price: float) -> bool:
    """Close an open holding, record sell price/date, and calculate realized P&L."""
    now = datetime.utcnow().isoformat()
    with _conn() as con:
        row = con.execute("SELECT quantity, avg_buy_price FROM portfolio WHERE id = ? AND status = 'OPEN'", (row_id,)).fetchone()
        if not row:
            return False
            
        qty = row["quantity"]
        buy_price = row["avg_buy_price"]
        realized_pnl = (sell_price - buy_price) * qty
        
        con.execute(
            """
            UPDATE portfolio
            SET status = 'CLOSED', sell_price = ?, sell_date = ?, realized_pnl = ?
            WHERE id = ? AND status = 'OPEN'
            """,
            (sell_price, now, realized_pnl, row_id)
        )
        return True

def get_portfolio_holdings() -> list[dict]:
    """Return all holdings in the portfolio."""
    with _conn() as con:
        rows = con.execute(
            """
            SELECT * FROM portfolio
            ORDER BY buy_date DESC
            """
        ).fetchall()
    return [dict(r) for r in rows]

# ─── Notifications Functions ──────────────────────────────────────────────────

def add_notification(type: str, message: str, ticker: str) -> int:
    """Insert a new notification. Avoids exact duplicates from the last 24h."""
    now = datetime.utcnow()
    yesterday_str = (now - timedelta(days=1)).isoformat()
    now_str = now.isoformat()
    
    with _conn() as con:
        # Prevent rapid duplicate spam
        existing = con.execute(
            "SELECT id FROM notifications WHERE type = ? AND ticker = ? AND message = ? AND timestamp > ?",
            (type, ticker, message, yesterday_str)
        ).fetchone()
        
        if existing:
            return existing["id"]
            
        cur = con.execute(
            """
            INSERT INTO notifications (type, message, ticker, timestamp, is_read)
            VALUES (?, ?, ?, ?, 0)
            """,
            (type, message, ticker.upper(), now_str)
        )
        return cur.lastrowid

def get_notifications() -> list[dict]:
    """Fetch all notifications, newest first."""
    with _conn() as con:
        rows = con.execute("SELECT * FROM notifications ORDER BY timestamp DESC").fetchall()
    return [dict(r) for r in rows]

def delete_notification(notif_id: int) -> None:
    """Delete a specific notification by ID."""
    with _conn() as con:
        con.execute("DELETE FROM notifications WHERE id = ?", (notif_id,))

def clear_notifications() -> None:
    """Delete all notifications."""
    with _conn() as con:
        con.execute("DELETE FROM notifications")


# ─── Phase 8: Per-Ticker Accuracy ────────────────────────────────────────────

def get_ticker_accuracy(ticker: str, n: int = 15) -> dict:
    """
    Return accuracy stats scoped to a specific ticker.
    Used by Portfolio Alerts to generate per-stock Precision Badges.
    Returns a dict with accuracy (0.0–1.0), sample count, correct, incorrect.
    If fewer than 3 evaluated rows exist, returns None for accuracy (insufficient data).
    """
    if not supabase:
        return {"accuracy": None, "evaluated_count": 0, "correct": 0, "incorrect": 0}

    try:
        res = (
            supabase.table("predictions")
            .select("actual_result")
            .eq("ticker", ticker.upper())
            .not_.is_("actual_result", "null")
            .order("evaluated_at", desc=True)
            .limit(n)
            .execute()
        )
        rows = res.data if res.data else []
    except Exception as e:
        print(f"get_ticker_accuracy error for {ticker}: {e}")
        return {"accuracy": None, "evaluated_count": 0, "correct": 0, "incorrect": 0}

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

# ─── Audio Analysis Functions (Phase 13) ──────────────────────────────────────

def insert_audio_analysis(ticker: str, source_url: str, anxiety: float, confidence: float, hesitation: float, composite: float) -> str:
    """Insert wav2vec2 audio metrics into the audio_analysis table."""
    if not supabase: return None
    payload = {
        "ticker": ticker.upper(),
        "source_url": source_url,
        "anxiety_score": anxiety,
        "confidence_score": confidence,
        "hesitation_score": hesitation,
        "composite_emotion_score": composite,
    }
    try:
        res = supabase.table("audio_analysis").insert(payload).execute()
        return res.data[0]["id"] if res.data else None
    except Exception as e:
        print(f"Audio analysis DB error: {e}")
        return None

def get_latest_audio_analysis(ticker: str) -> dict | None:
    """Fetch the most recent audio analysis for a ticker from Supabase."""
    if not supabase: return None
    try:
        res = (
            supabase.table("audio_analysis")
            .select("*")
            .eq("ticker", ticker.upper())
            .order("id", desc=True)
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None
    except Exception as e:
        print(f"get_latest_audio_analysis error: {e}")
        return None
