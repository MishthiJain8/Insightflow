"""
InsightFlow — AutoTrader Bot Engine
====================================
Fully autonomous paper-trading bot that uses InsightFlow's ML prediction
pipeline to discover, buy, and sell stocks with simulated capital.

Key Design:
  - Self-directed stock discovery: scans broad market, ranks by opportunity
  - Auto-starts on server boot with user-configured capital
  - Logs every action (BUY / SELL / SKIP) to MongoDB for analysis
  - Isolated from Portfolio Studio (uses its own collections)
"""

import asyncio
import time
import json
import os
from datetime import datetime, timedelta
from typing import Optional
import yfinance as yf
import numpy as np

import database as db

# ─── Constants ────────────────────────────────────────────────────────────────

DEFAULT_CAPITAL = 100_000.0
SCAN_INTERVAL_SECONDS = 600          # 10 minutes
MAX_POSITIONS = 10                   # Max concurrent open positions
MAX_POSITION_PCT = 0.10              # Max 10% of capital per trade
MIN_BUY_PROBABILITY = 62.0           # Minimum prediction confidence to buy
MIN_BUY_CONVICTION = 55.0            # Minimum conviction score
TAKE_PROFIT_PCT = 0.08               # +8% take-profit
STOP_LOSS_PCT = 0.04                 # -4% stop-loss
MAX_HOLD_DAYS = 10                   # Auto-sell after 10 trading days
MIN_SELL_PROBABILITY = 60.0          # Minimum DOWN confidence to trigger sell

# ─── Discovery Universe ──────────────────────────────────────────────────────
# Broad scan universe — the bot picks from these based on ML signals
SCAN_UNIVERSE = [
    # US Large Cap Tech
    "AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN", "TSLA", "AMD", "ORCL", "NFLX",
    "CRM", "ADBE", "INTC", "QCOM", "AVGO", "CSCO", "IBM", "PYPL", "SQ", "SHOP",
    # US Finance
    "JPM", "BAC", "WFC", "GS", "MS", "V", "MA", "AXP", "C", "BLK",
    # US Healthcare & Consumer
    "JNJ", "PFE", "UNH", "MRK", "ABBV", "LLY", "PG", "KO", "PEP", "MCD",
    # US Energy & Industrial
    "XOM", "CVX", "COP", "BA", "CAT", "GE", "HON", "UPS", "DE",
    # Indian Markets (NSE)
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
    "TATAMOTORS.NS", "SUNPHARMA.NS", "HINDUNILVR.NS", "WIPRO.NS", "BAJFINANCE.NS",
    "LT.NS", "MARUTI.NS", "BHARTIARTL.NS", "HCLTECH.NS", "KOTAKBANK.NS",
    # Crypto
    "BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD",
    # ETFs
    "SPY", "QQQ", "IWM", "DIA", "ARKK",
]


class AutoTraderBot:
    """
    Autonomous paper-trading bot that uses InsightFlow's ML pipeline
    to discover and trade stocks for maximum profit.
    """

    def __init__(self):
        self.is_running = False
        self._task: Optional[asyncio.Task] = None
        self._predict_fn = None   # Set during startup (avoids circular import)
        self._bg_tasks_cls = None

        # Load persisted state from DB, or use defaults
        config = db.get_autotrader_config()
        self.capital = config.get("capital", DEFAULT_CAPITAL)
        self.starting_capital = config.get("starting_capital", self.capital)
        self.positions: dict = config.get("positions", {})  # ticker -> position dict
        self.scan_interval = config.get("scan_interval", SCAN_INTERVAL_SECONDS)
        self.total_trades = config.get("total_trades", 0)
        self.winning_trades = config.get("winning_trades", 0)
        self.total_realized_pnl = config.get("total_realized_pnl", 0.0)
        self.scan_universe = config.get("scan_universe", SCAN_UNIVERSE.copy())
        self.cycle_count = 0
        self.last_scan_time = None
        self.last_scan_results = []
        self._started_at = None

    def set_predict_fn(self, fn, bg_cls):
        """Inject the predict function to avoid circular imports."""
        self._predict_fn = fn
        self._bg_tasks_cls = bg_cls

    # ─── Core Loop ────────────────────────────────────────────────────────────

    async def start(self, capital: float = None):
        """Start the autonomous trading loop."""
        if self.is_running:
            return {"status": "already_running"}

        if capital is not None:
            self.capital = capital
            self.starting_capital = capital

        self.is_running = True
        self._started_at = datetime.utcnow()
        self._task = asyncio.create_task(self._run_loop())
        self._persist_config()

        db.log_autotrader_trade({
            "action": "BOT_STARTED",
            "ticker": "—",
            "details": f"Bot started with ${self.capital:,.2f} capital",
            "capital_after": self.capital,
            "timestamp": datetime.utcnow().isoformat(),
        })

        print(f"🤖 AutoTrader Bot STARTED with ${self.capital:,.2f}")
        return {"status": "started", "capital": self.capital}

    async def stop(self):
        """Stop the trading loop gracefully."""
        if not self.is_running:
            return {"status": "already_stopped"}

        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._persist_config()

        db.log_autotrader_trade({
            "action": "BOT_STOPPED",
            "ticker": "—",
            "details": "Bot stopped by user or system",
            "capital_after": self.capital,
            "timestamp": datetime.utcnow().isoformat(),
        })

        print("🤖 AutoTrader Bot STOPPED")
        return {"status": "stopped"}

    async def _run_loop(self):
        """Main trading loop — runs until stopped."""
        # Initial delay to let the server fully start
        await asyncio.sleep(15)
        print("🤖 AutoTrader: First scan starting...")

        while self.is_running:
            try:
                await self._scan_and_trade()
                self.cycle_count += 1
                self._persist_config()

                # Take a snapshot every cycle for equity curve
                total_value = self._calculate_portfolio_value()
                db.save_autotrader_snapshot({
                    "timestamp": datetime.utcnow().isoformat(),
                    "capital": self.capital,
                    "positions_value": total_value - self.capital,
                    "total_value": total_value,
                    "num_positions": len(self.positions),
                    "total_trades": self.total_trades,
                    "winning_trades": self.winning_trades,
                    "total_realized_pnl": self.total_realized_pnl,
                })

            except Exception as e:
                print(f"🤖 AutoTrader scan error: {e}")
                import traceback
                traceback.print_exc()

            # Wait for next scan
            await asyncio.sleep(self.scan_interval)

    # ─── Scan & Trade Logic ───────────────────────────────────────────────────

    async def _scan_and_trade(self):
        """
        One complete scan cycle:
        1. Check existing positions for sell signals
        2. Discover new opportunities from the universe
        3. Rank by predicted upside and buy the best
        """
        self.last_scan_time = datetime.utcnow().isoformat()
        scan_results = []

        # ── Phase 1: Check existing positions for exits ──────────────────────
        tickers_to_sell = []
        for ticker, pos in list(self.positions.items()):
            try:
                live_price = await self._get_live_price(ticker)
                if live_price is None:
                    continue

                sell_reason = await self._should_sell(pos, live_price)
                if sell_reason:
                    tickers_to_sell.append((ticker, live_price, sell_reason))
            except Exception as e:
                print(f"🤖 Error checking {ticker}: {e}")

        # Execute sells
        for ticker, price, reason in tickers_to_sell:
            await self._execute_sell(ticker, price, reason)

        # ── Phase 2: Discover and rank new opportunities ─────────────────────
        if len(self.positions) >= MAX_POSITIONS:
            print(f"🤖 Max positions ({MAX_POSITIONS}) reached. Skipping buy scan.")
            self.last_scan_results = scan_results
            return

        available_capital = self.capital
        max_per_position = self.capital * MAX_POSITION_PCT  # Use total capital for sizing

        # Shuffle to avoid always scanning in the same order
        import random
        universe = self.scan_universe.copy()
        random.shuffle(universe)

        # Don't rescan tickers we already hold
        universe = [t for t in universe if t not in self.positions]

        # Scan in batches to avoid overloading
        batch_size = 8
        opportunities = []

        for i in range(0, min(len(universe), 30), batch_size):  # Max 30 per cycle
            batch = universe[i:i + batch_size]
            tasks = [self._evaluate_ticker(t) for t in batch]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for ticker, result in zip(batch, results):
                if isinstance(result, Exception):
                    continue
                if result and result.get("should_buy"):
                    opportunities.append(result)

            # Small delay between batches to be kind to APIs
            await asyncio.sleep(2)

        # ── Phase 3: Rank by expected profit and execute best buys ────────────
        # Sort by composite score (higher = better opportunity)
        opportunities.sort(key=lambda x: x.get("score", 0), reverse=True)

        buys_this_cycle = 0
        for opp in opportunities:
            if len(self.positions) >= MAX_POSITIONS:
                break
            if available_capital < 500:  # Minimum trade size
                break

            ticker = opp["ticker"]
            price = opp["live_price"]
            position_size = min(max_per_position, available_capital * 0.5)  # Use at most 50% of remaining
            quantity = int(position_size / price)
            if quantity < 1:
                continue

            cost = quantity * price
            if cost > available_capital:
                continue

            await self._execute_buy(ticker, price, quantity, opp)
            available_capital -= cost
            buys_this_cycle += 1

            scan_results.append({
                "ticker": ticker,
                "action": "BUY",
                "price": price,
                "score": opp.get("score", 0),
            })

        self.last_scan_results = scan_results
        print(f"🤖 Scan #{self.cycle_count + 1} complete: {buys_this_cycle} buys, "
              f"{len(tickers_to_sell)} sells, {len(self.positions)} open positions, "
              f"Capital: ${self.capital:,.2f}")

    async def _evaluate_ticker(self, ticker: str) -> dict:
        """
        Run the full ML pipeline on a ticker and determine if it's a buy.
        Returns a dict with should_buy, score, and prediction details.
        """
        try:
            live_price = await self._get_live_price(ticker)
            if live_price is None or live_price <= 0:
                return {"should_buy": False, "ticker": ticker}

            # Run InsightFlow's prediction engine (without saving to Strategy Lab DB)
            from fastapi import BackgroundTasks
            prediction = await self._predict_fn(
                ticker, BackgroundTasks(),
                request=None, horizon=5,
                user_id="autotrader_bot",
                save_to_db=False, skip_rag=True
            )

            if not prediction or prediction.get("status") == "cancelled":
                return {"should_buy": False, "ticker": ticker}

            direction = prediction.get("direction", "DOWN")
            probability = prediction.get("probability", 0)
            conviction = prediction.get("conviction_score", 0)
            sentiment = prediction.get("sentiment", {})
            sent_label = sentiment.get("label", "Neutral")
            sent_score = sentiment.get("score", 0)
            pattern_match = prediction.get("pattern_match", {})
            win_rate = pattern_match.get("win_rate") if pattern_match else None
            features = prediction.get("features", {})
            rsi = features.get("rsi14", 50)

            # ── Buy Decision Logic ───────────────────────────────────────────
            should_buy = (
                direction == "UP"
                and probability >= MIN_BUY_PROBABILITY
                and conviction >= MIN_BUY_CONVICTION
                and sent_label in ("Bullish", "Very Bullish")
                and rsi < 72  # Not already overbought
                and not prediction.get("false_breakout_risk", False)
            )

            # Composite opportunity score (higher = more attractive)
            score = 0
            if direction == "UP":
                score += probability * 0.4                         # 40% weight on confidence
                score += (conviction / 100) * 30                   # 30% weight on conviction
                score += max(0, sent_score * 20)                   # 20% weight on sentiment
                if win_rate and win_rate > 55:
                    score += (win_rate - 50) * 0.2                 # Bonus for historical pattern
                if rsi < 40:
                    score += 5                                     # Oversold bonus

            return {
                "should_buy": should_buy,
                "ticker": ticker,
                "live_price": live_price,
                "direction": direction,
                "probability": probability,
                "conviction": conviction,
                "sentiment_label": sent_label,
                "sentiment_score": sent_score,
                "rsi": rsi,
                "win_rate": win_rate,
                "score": round(score, 2),
                "features": features,
                "pattern_match": pattern_match,
                "false_breakout": prediction.get("false_breakout_risk", False),
            }

        except Exception as e:
            # Silently skip problematic tickers
            return {"should_buy": False, "ticker": ticker, "error": str(e)}

    async def _should_sell(self, position: dict, live_price: float) -> Optional[str]:
        """
        Determine if an existing position should be sold.
        Returns a reason string if sell, None if hold.
        """
        entry_price = position["entry_price"]
        entry_date = datetime.fromisoformat(position["entry_date"])
        days_held = (datetime.utcnow() - entry_date).days
        pnl_pct = (live_price - entry_price) / entry_price

        # Take-profit
        if pnl_pct >= TAKE_PROFIT_PCT:
            return f"TAKE_PROFIT: +{pnl_pct*100:.1f}% gain (target: +{TAKE_PROFIT_PCT*100}%)"

        # Stop-loss
        if pnl_pct <= -STOP_LOSS_PCT:
            return f"STOP_LOSS: {pnl_pct*100:.1f}% loss (limit: -{STOP_LOSS_PCT*100}%)"

        # Max hold duration
        if days_held >= MAX_HOLD_DAYS:
            return f"MAX_HOLD: Held for {days_held} days (limit: {MAX_HOLD_DAYS})"

        # Run fresh prediction to check if signal has flipped
        try:
            from fastapi import BackgroundTasks
            prediction = await self._predict_fn(
                position["ticker"], BackgroundTasks(),
                request=None, horizon=5,
                user_id="autotrader_bot",
                save_to_db=False, skip_rag=True
            )
            if prediction:
                direction = prediction.get("direction", "UP")
                probability = prediction.get("probability", 50)
                if direction == "DOWN" and probability >= MIN_SELL_PROBABILITY:
                    return f"SIGNAL_FLIP: Model now predicts DOWN with {probability}% confidence"
        except Exception:
            pass

        return None

    # ─── Trade Execution ──────────────────────────────────────────────────────

    async def _execute_buy(self, ticker: str, price: float, quantity: int, opportunity: dict):
        """Execute a simulated buy and record everything."""
        cost = price * quantity
        self.capital -= cost

        position = {
            "ticker": ticker,
            "entry_price": price,
            "quantity": quantity,
            "cost": cost,
            "entry_date": datetime.utcnow().isoformat(),
            "entry_reason": f"UP {opportunity.get('probability', 0):.0f}% | "
                           f"{opportunity.get('sentiment_label', 'Neutral')} | "
                           f"Score: {opportunity.get('score', 0):.1f}",
            "entry_rsi": opportunity.get("rsi", 0),
            "entry_conviction": opportunity.get("conviction", 0),
        }
        self.positions[ticker] = position

        trade_log = {
            "action": "BUY",
            "ticker": ticker,
            "price": price,
            "quantity": quantity,
            "cost": cost,
            "capital_after": self.capital,
            "timestamp": datetime.utcnow().isoformat(),
            "reason": position["entry_reason"],
            "probability": opportunity.get("probability", 0),
            "sentiment": opportunity.get("sentiment_label", "Neutral"),
            "conviction": opportunity.get("conviction", 0),
            "rsi": opportunity.get("rsi", 0),
            "score": opportunity.get("score", 0),
        }
        db.log_autotrader_trade(trade_log)
        print(f"🤖 BUY  {quantity}x {ticker} @ ${price:.2f} = ${cost:.2f} | {position['entry_reason']}")

    async def _execute_sell(self, ticker: str, price: float, reason: str):
        """Execute a simulated sell and record everything."""
        if ticker not in self.positions:
            return

        pos = self.positions[ticker]
        quantity = pos["quantity"]
        revenue = price * quantity
        cost = pos["cost"]
        pnl = revenue - cost
        pnl_pct = (pnl / cost) * 100
        days_held = (datetime.utcnow() - datetime.fromisoformat(pos["entry_date"])).days

        self.capital += revenue
        self.total_trades += 1
        self.total_realized_pnl += pnl
        if pnl > 0:
            self.winning_trades += 1

        trade_log = {
            "action": "SELL",
            "ticker": ticker,
            "price": price,
            "quantity": quantity,
            "revenue": revenue,
            "entry_price": pos["entry_price"],
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 2),
            "days_held": days_held,
            "capital_after": self.capital,
            "timestamp": datetime.utcnow().isoformat(),
            "reason": reason,
            "entry_reason": pos.get("entry_reason", ""),
            "entry_date": pos["entry_date"],
        }
        db.log_autotrader_trade(trade_log)

        icon = "✅" if pnl > 0 else "❌"
        print(f"🤖 SELL {icon} {quantity}x {ticker} @ ${price:.2f} | "
              f"P&L: ${pnl:+,.2f} ({pnl_pct:+.1f}%) | Reason: {reason}")

        del self.positions[ticker]

    # ─── Helpers ──────────────────────────────────────────────────────────────

    async def _get_live_price(self, ticker: str) -> Optional[float]:
        """Fetch the latest price for a ticker."""
        try:
            from nlp_engine import get_history
            hist, _ = await asyncio.to_thread(get_history, ticker, period="5d")
            if hist is not None and not hist.empty:
                return float(hist["Close"].iloc[-1])
        except Exception:
            pass
        return None

    def _calculate_portfolio_value(self) -> float:
        """Calculate total portfolio value (cash + positions at last known price)."""
        total = self.capital
        for ticker, pos in self.positions.items():
            # Use entry price as fallback (live prices fetched during scan)
            total += pos.get("cost", 0)
        return total

    def _persist_config(self):
        """Save current bot state to MongoDB."""
        config = {
            "capital": self.capital,
            "starting_capital": self.starting_capital,
            "positions": self.positions,
            "scan_interval": self.scan_interval,
            "total_trades": self.total_trades,
            "winning_trades": self.winning_trades,
            "total_realized_pnl": self.total_realized_pnl,
            "scan_universe": self.scan_universe,
            "is_running": self.is_running,
            "last_updated": datetime.utcnow().isoformat(),
        }
        db.save_autotrader_config(config)

    # ─── Public Status API ────────────────────────────────────────────────────

    def get_status(self) -> dict:
        """Return current bot status for the API."""
        total_value = self.capital
        positions_list = []
        for ticker, pos in self.positions.items():
            unrealized = 0  # Will be enriched by the API endpoint with live prices
            positions_list.append({
                "ticker": ticker,
                "quantity": pos["quantity"],
                "entry_price": pos["entry_price"],
                "cost": pos["cost"],
                "entry_date": pos["entry_date"],
                "entry_reason": pos.get("entry_reason", ""),
            })
            total_value += pos["cost"]

        win_rate = (self.winning_trades / self.total_trades * 100) if self.total_trades > 0 else 0
        total_pnl = total_value - self.starting_capital + self.total_realized_pnl
        total_pnl_pct = (total_pnl / self.starting_capital * 100) if self.starting_capital > 0 else 0

        return {
            "is_running": self.is_running,
            "started_at": self._started_at.isoformat() if self._started_at else None,
            "starting_capital": self.starting_capital,
            "current_capital": round(self.capital, 2),
            "total_value": round(total_value, 2),
            "total_pnl": round(total_pnl, 2),
            "total_pnl_pct": round(total_pnl_pct, 2),
            "total_realized_pnl": round(self.total_realized_pnl, 2),
            "total_trades": self.total_trades,
            "winning_trades": self.winning_trades,
            "losing_trades": self.total_trades - self.winning_trades,
            "win_rate": round(win_rate, 1),
            "num_positions": len(self.positions),
            "max_positions": MAX_POSITIONS,
            "positions": positions_list,
            "cycle_count": self.cycle_count,
            "last_scan_time": self.last_scan_time,
            "scan_interval_seconds": self.scan_interval,
            "scan_universe_size": len(self.scan_universe),
        }

    def get_stats(self) -> dict:
        """Compute detailed performance statistics."""
        trades = db.get_autotrader_trades(limit=10000)
        sell_trades = [t for t in trades if t.get("action") == "SELL"]

        if not sell_trades:
            return {
                "total_trades": 0,
                "win_rate": 0,
                "avg_profit": 0,
                "avg_loss": 0,
                "profit_factor": 0,
                "best_trade": None,
                "worst_trade": None,
                "avg_hold_days": 0,
                "total_realized_pnl": 0,
                "largest_win": 0,
                "largest_loss": 0,
            }

        wins = [t for t in sell_trades if t.get("pnl", 0) > 0]
        losses = [t for t in sell_trades if t.get("pnl", 0) <= 0]

        avg_profit = np.mean([t["pnl"] for t in wins]) if wins else 0
        avg_loss = np.mean([t["pnl"] for t in losses]) if losses else 0
        total_profit = sum(t["pnl"] for t in wins)
        total_loss = abs(sum(t["pnl"] for t in losses)) if losses else 0
        profit_factor = (total_profit / total_loss) if total_loss > 0 else float("inf")

        best = max(sell_trades, key=lambda t: t.get("pnl", 0))
        worst = min(sell_trades, key=lambda t: t.get("pnl", 0))
        avg_hold = np.mean([t.get("days_held", 0) for t in sell_trades])

        return {
            "total_trades": len(sell_trades),
            "winning_trades": len(wins),
            "losing_trades": len(losses),
            "win_rate": round(len(wins) / len(sell_trades) * 100, 1) if sell_trades else 0,
            "avg_profit": round(float(avg_profit), 2),
            "avg_loss": round(float(avg_loss), 2),
            "profit_factor": round(float(profit_factor), 2),
            "best_trade": {
                "ticker": best.get("ticker"),
                "pnl": best.get("pnl"),
                "pnl_pct": best.get("pnl_pct"),
            },
            "worst_trade": {
                "ticker": worst.get("ticker"),
                "pnl": worst.get("pnl"),
                "pnl_pct": worst.get("pnl_pct"),
            },
            "avg_hold_days": round(float(avg_hold), 1),
            "total_realized_pnl": round(self.total_realized_pnl, 2),
            "largest_win": round(max(t.get("pnl", 0) for t in sell_trades), 2),
            "largest_loss": round(min(t.get("pnl", 0) for t in sell_trades), 2),
        }


# ─── Global Singleton ────────────────────────────────────────────────────────
bot = AutoTraderBot()
