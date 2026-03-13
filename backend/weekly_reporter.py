"""
InsightFlow — weekly_reporter.py
==================================
Phase 9: Weekly Performance Report Generator.

Runs automatically every Monday at 08:00 via APScheduler (started in main.py).
Can also be triggered manually via GET /api/weekly-report.

Pipeline:
  1. Query SQLite for predictions evaluated in the last 7 days
  2. Compute Weekly Alpha Score  (correct / total × 100)
  3. Compare vs prior week's Alpha Score  (delta)
  4. Identify top 3 best-performing tickers + worst ticker
  5. Generate a Simple Mode narrative email (no financial jargon)
  6. Send via SMTP helper
"""

import os
import json
import logging
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

import database as db

logger = logging.getLogger("weekly_reporter")

# ─── SMTP Config (mirrors main.py) ───────────────────────────────────────────
SMTP_HOST     = "smtp.gmail.com"
SMTP_PORT     = 587
SMTP_USER     = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")


# ─── Score Computation ────────────────────────────────────────────────────────

def _compute_alpha_score(rows: list[dict]) -> dict:
    """
    Calculate accuracy stats from a list of prediction rows.
    Returns dict: { score, correct, incorrect, total, ticker_breakdown }
    """
    if not rows:
        return {"score": 0.0, "correct": 0, "incorrect": 0, "total": 0, "ticker_breakdown": {}}

    correct   = sum(1 for r in rows if r["actual_result"] == "Correct")
    incorrect = sum(1 for r in rows if r["actual_result"] == "Incorrect")
    total     = correct + incorrect

    # Per-ticker accuracy
    ticker_stats: dict[str, dict] = {}
    for r in rows:
        t = r["ticker"]
        if t not in ticker_stats:
            ticker_stats[t] = {"correct": 0, "incorrect": 0}
        if r["actual_result"] == "Correct":
            ticker_stats[t]["correct"] += 1
        else:
            ticker_stats[t]["incorrect"] += 1

    ticker_breakdown = {
        t: {
            "correct":  v["correct"],
            "total":    v["correct"] + v["incorrect"],
            "pct":      round(v["correct"] / (v["correct"] + v["incorrect"]) * 100, 1)
        }
        for t, v in ticker_stats.items() if (v["correct"] + v["incorrect"]) > 0
    }

    return {
        "score":            round(correct / total * 100, 1) if total > 0 else 0.0,
        "correct":          correct,
        "incorrect":        incorrect,
        "total":            total,
        "ticker_breakdown": ticker_breakdown,
    }


def _get_rows_in_range(days_ago_start: int, days_ago_end: int = 0) -> list[dict]:
    """Query SQLite for evaluated predictions within a date window."""
    import sqlite3
    from contextlib import contextmanager

    db_path = db.DB_PATH

    start_dt = (datetime.now(timezone.utc) - timedelta(days=days_ago_start)).date().isoformat()
    end_dt   = (datetime.now(timezone.utc) - timedelta(days=days_ago_end)).date().isoformat()

    try:
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.execute(
                """
                SELECT ticker, actual_result, actual_price, price_at_prediction,
                       predicted_direction, predicted_prob, evaluated_at, detailed_analysis, learning_notes
                FROM predictions
                WHERE actual_result IS NOT NULL
                  AND date(evaluated_at) BETWEEN ? AND ?
                """,
                (start_dt, end_dt),
            )
            return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        logger.error(f"_get_rows_in_range error: {e}")
        return []


# ─── Simple Mode Narrative Builder ────────────────────────────────────────────

def _build_narrative(this_week: dict, prev_week: dict, top3: list, worst: str | None) -> str:
    """
    Build a jargon-free, conversational email body using Simple Mode language.
    """
    score     = this_week["score"]
    prev_scr  = prev_week["score"]
    correct   = this_week["correct"]
    total     = this_week["total"]
    delta     = round(score - prev_scr, 1)
    delta_str = f"+{delta}%" if delta >= 0 else f"{delta}%"

    # Metaphor tier
    if score >= 75:
        metaphor = "like a seasoned doctor who diagnoses correctly most of the time — precise and dependable."
    elif score >= 60:
        metaphor = "like a weather forecaster who got the storm almost right — mostly on track, with some surprises."
    elif score >= 45:
        metaphor = "like a navigator using stars and a compass — directionally sound, but occasionally off by degrees."
    else:
        metaphor = "like a student still learning the subject — more practice is needed and the AI is actively self-correcting."

    top3_str = ""
    if top3:
        top3_lines = [f"  • {t['ticker']}: {t['pct']}% precision ({t['correct']}/{t['total']} calls)" for t in top3]
        top3_str = "\n".join(top3_lines)

    worst_str = f"  • {worst}" if worst else "  • None — all tickers performed above average this week! 🎉"

    report_date = datetime.now(timezone.utc).strftime("%B %d, %Y")

    if score >= 60:
        ai_status_line = "✅ The AI is performing above target. The self-correction engine is at Standard escalation."
    else:
        ai_status_line = "⚠️  The AI dropped below 60% this week. The self-correction engine has escalated the model to learn from recent misses."

    return f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📊 InsightFlow Weekly Alpha Report
  Week ending {report_date}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Hi there,

Here's how your AI performed this week — explained in plain English.

━━━ WEEKLY ALPHA SCORE ━━━━━━━━━━━━━━━━━━

Your AI made {total} predictions this week.
It was correct {correct} times — {metaphor}

  Weekly Alpha Score:  {score}%
  vs. Last Week:       {delta_str}

━━━ STAR PERFORMERS ━━━━━━━━━━━━━━━━━━━━━

Your AI's top 3 most accurate calls this week:
{top3_str if top3_str else "  • No ticker had enough predictions this week."}

━━━ NEEDS ATTENTION ━━━━━━━━━━━━━━━━━━━━━

The ticker with the most missed predictions:
{worst_str}

━━━ WHAT THIS MEANS ━━━━━━━━━━━━━━━━━━━━━

{ai_status_line}

━━━ HOW TO TAKE ACTION ━━━━━━━━━━━━━━━━━━

• Visit Strategy Lab → click any prediction row to open the Audit Modal
• See [What AI Saw] vs [What Actually Happened] for each call
• Click "Generate Learning Note" to record the AI's lesson for that trade

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  This report is generated automatically by InsightFlow.
  Not financial advice — algorithmic analysis only.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""


# ─── Email Sender ─────────────────────────────────────────────────────────────

def _send_email(to_email: str, subject: str, body: str) -> bool:
    """Send a plain-text email via SMTP. Returns True on success."""
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning("SMTP credentials not configured — skipping weekly email send.")
        return False
    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"]    = SMTP_USER
        msg["To"]      = to_email
        msg.set_content(body)

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)

        logger.info(f"Weekly report sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send weekly report: {e}")
        return False


# ─── Main Entry Point ─────────────────────────────────────────────────────────

def generate_weekly_report(to_email: str | None = None) -> dict:
    """
    Generate and optionally email the Weekly Alpha Report.
    Returns the full report payload dict (also used by the API endpoint).

    Args:
        to_email: recipient address. If None, uses SMTP_USER (sender) as recipient.
    """
    recipient = to_email or SMTP_USER

    this_week_rows = _get_rows_in_range(days_ago_start=7)
    prev_week_rows = _get_rows_in_range(days_ago_start=14, days_ago_end=7)

    this_week = _compute_alpha_score(this_week_rows)
    prev_week = _compute_alpha_score(prev_week_rows)

    # Top 3 performing tickers (sorted by accuracy %)
    breakdown = this_week.get("ticker_breakdown", {})
    sorted_tickers = sorted(breakdown.items(), key=lambda x: x[1]["pct"], reverse=True)
    top3 = [{"ticker": t, **v} for t, v in sorted_tickers[:3]]
    worst = sorted_tickers[-1][0] if sorted_tickers else None

    narrative = _build_narrative(this_week, prev_week, top3, worst)

    subject = f"📊 Your Weekly AI Alpha Report — {this_week['score']}% Accuracy"
    email_sent = _send_email(recipient, subject, narrative) if recipient else False

    logger.info(f"Weekly report generated: Score={this_week['score']}%, Sent={email_sent}")

    return {
        "report_date":   datetime.now(timezone.utc).isoformat(),
        "this_week":     this_week,
        "prev_week":     prev_week,
        "delta":         round(this_week["score"] - prev_week["score"], 1),
        "top3_tickers":  top3,
        "worst_ticker":  worst,
        "email_sent":    email_sent,
        "recipient":     recipient,
        "narrative":     narrative.strip(),
    }
