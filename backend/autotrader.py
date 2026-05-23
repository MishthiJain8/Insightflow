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
import csv
import time
import json
import os
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Optional
import yfinance as yf
import numpy as np

try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None

import database as db

# ─── Constants ────────────────────────────────────────────────────────────────

DEFAULT_CAPITAL = 100_000.0
SCAN_INTERVAL_SECONDS = 30           # 30 seconds scan interval for instant action
MAX_POSITIONS = 30                   # Max concurrent open positions (High frequency)
MAX_POSITION_PCT = 0.05              # Max 5% of capital per trade
MIN_BUY_PROBABILITY = 62.0           # Minimum prediction confidence to buy
MIN_BUY_CONVICTION = 55.0            # Minimum conviction score
TAKE_PROFIT_PCT = 0.015              # +1.5% take-profit for quick scalp
STOP_LOSS_PCT = 0.005                # -0.5% tight stop-loss
MAX_HOLD_MINUTES = 30                # Auto-sell after 30 minutes if target not hit
MIN_SELL_PROBABILITY = 60.0          # Minimum DOWN confidence to trigger sell

# ─── Discovery Universe ──────────────────────────────────────────────────────
# Dynamic scan universe — by default the bot loads a broad market symbol list
# from NASDAQ/NASDAQ-listed sources and falls back to a curated set if the
# download is unavailable.
FALLBACK_SCAN_UNIVERSE = [
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

SYMBOL_SOURCE_URLS = [
    "https://ftp.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt",
    "https://ftp.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt",
]

_loaded_scan_universe = None


def _download_symbol_file(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def _parse_symbol_file(content: str, symbol_field: str) -> list[str]:
    symbols = []
    lines = [line for line in content.splitlines() if line.strip()]
    reader = csv.DictReader(lines, delimiter="|")
    for row in reader:
        symbol = row.get(symbol_field, "").strip()
        if not symbol or symbol.lower().startswith("file creation") or symbol.lower() == symbol_field.lower():
            continue
        symbols.append(symbol)
    return symbols


def _load_scan_universe_from_sources() -> list[str]:
    symbols = []
    for url in SYMBOL_SOURCE_URLS:
        try:
            content = _download_symbol_file(url)
            if "nasdaqlisted" in url:
                parsed = _parse_symbol_file(content, "Symbol")
            else:
                parsed = _parse_symbol_file(content, "ACT Symbol")
            symbols.extend(parsed)
        except Exception:
            continue
    return list(dict.fromkeys(symbols))


def _load_scan_universe() -> list[str]:
    global _loaded_scan_universe
    if _loaded_scan_universe is not None:
        return _loaded_scan_universe.copy()

    symbols = []
    try:
        symbols = _load_scan_universe_from_sources()
    except Exception:
        pass

    # Always include the fallback universe to ensure we have Crypto and Global markets
    fallback = FALLBACK_SCAN_UNIVERSE.copy()
    symbols.extend(fallback)
    symbols = list(dict.fromkeys(symbols)) # deduplicate

    _loaded_scan_universe = symbols
    return symbols.copy()

def get_ticker_market(ticker: str) -> str:
    ticker = ticker.upper()
    if ticker.endswith("-USD"):
        return "Crypto"
    elif ticker.endswith(".NS") or ticker.endswith(".BO"):
        return "India"
    elif ticker.endswith(".L"):
        return "UK"
    elif ticker.endswith(".PA") or ticker.endswith(".DE") or ticker.endswith(".MI"):
        return "Europe"
    elif ticker.endswith(".T"):
        return "Japan"
    elif ticker.endswith(".HK"):
        return "Hong Kong"
    elif ticker.endswith(".AX"):
        return "Australia"
    elif ticker.endswith(".TO"):
        return "Canada"
    else:
        return "US"

def is_market_open(market: str) -> bool:
    if market == "Crypto":
        return True
        
    now_utc = datetime.now(timezone.utc)
    if now_utc.weekday() >= 5: # Saturday=5, Sunday=6
        return False
        
    if not ZoneInfo:
        return True # Fallback if zoneinfo is not available
        
    try:
        if market == "US":
            tz = ZoneInfo("America/New_York")
            now_local = now_utc.astimezone(tz)
            t = now_local.hour * 60 + now_local.minute
            return (9 * 60 + 30) <= t <= (16 * 60) # 9:30 AM to 4:00 PM
        elif market == "India":
            tz = ZoneInfo("Asia/Kolkata")
            now_local = now_utc.astimezone(tz)
            t = now_local.hour * 60 + now_local.minute
            return (9 * 60 + 15) <= t <= (15 * 60 + 30) # 9:15 AM to 3:30 PM
        elif market == "UK":
            tz = ZoneInfo("Europe/London")
            now_local = now_utc.astimezone(tz)
            t = now_local.hour * 60 + now_local.minute
            return (8 * 60) <= t <= (16 * 60 + 30) # 8:00 AM to 4:30 PM
        elif market == "Europe":
            tz = ZoneInfo("Europe/Paris")
            now_local = now_utc.astimezone(tz)
            t = now_local.hour * 60 + now_local.minute
            return (9 * 60) <= t <= (17 * 60 + 30) # 9:00 AM to 5:30 PM
        elif market == "Japan":
            tz = ZoneInfo("Asia/Tokyo")
            now_local = now_utc.astimezone(tz)
            t = now_local.hour * 60 + now_local.minute
            return (9 * 60) <= t <= (15 * 60) # 9:00 AM to 3:00 PM
        elif market == "Hong Kong":
            tz = ZoneInfo("Asia/Hong_Kong")
            now_local = now_utc.astimezone(tz)
            t = now_local.hour * 60 + now_local.minute
            return (9 * 60 + 30) <= t <= (16 * 60) # 9:30 AM to 4:00 PM
        elif market == "Australia":
            tz = ZoneInfo("Australia/Sydney")
            now_local = now_utc.astimezone(tz)
            t = now_local.hour * 60 + now_local.minute
            return (10 * 60) <= t <= (16 * 60) # 10:00 AM to 4:00 PM
        elif market == "Canada":
            tz = ZoneInfo("America/Toronto")
            now_local = now_utc.astimezone(tz)
            t = now_local.hour * 60 + now_local.minute
            return (9 * 60 + 30) <= t <= (16 * 60) # 9:30 AM to 4:00 PM
    except Exception:
        return True # Default to open if calculation fails
        
    return True

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
        self.scan_universe = config.get("scan_universe")
        if not self.scan_universe:
            self.scan_universe = _load_scan_universe()
        self.target_zone = config.get("target_zone", "All Active")
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

        # Don't rescan tickers we already hold, and filter by live markets
        active_universe = []
        for t in universe:
            if t in self.positions:
                continue
            market = get_ticker_market(t)
            # Filter by explicit target zone
            if self.target_zone != "All Active" and market != self.target_zone:
                continue
            # Filter by market active status
            if not is_market_open(market):
                continue
            active_universe.append(t)

        universe = active_universe

        # Scan in larger batches to speed up discovery
        batch_size = 20
        opportunities = []

        for i in range(0, min(len(universe), 100), batch_size):  # Max 100 per cycle
            batch = universe[i:i + batch_size]
            tasks = [self._evaluate_ticker(t) for t in batch]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for ticker, result in zip(batch, results):
                if isinstance(result, Exception):
                    continue
                if result and result.get("should_buy"):
                    opportunities.append(result)

            # Minimal delay between batches for fast execution
            await asyncio.sleep(0.5)

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
                request=None, horizon=1,  # Short horizon for intraday momentum
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
        minutes_held = (datetime.utcnow() - entry_date).total_seconds() / 60.0
        pnl_pct = (live_price - entry_price) / entry_price

        # Take-profit
        if pnl_pct >= TAKE_PROFIT_PCT:
            return f"TAKE_PROFIT: +{pnl_pct*100:.2f}% gain (target: +{TAKE_PROFIT_PCT*100}%)"

        # Stop-loss
        if pnl_pct <= -STOP_LOSS_PCT:
            return f"STOP_LOSS: {pnl_pct*100:.2f}% loss (limit: -{STOP_LOSS_PCT*100}%)"

        # Max hold duration
        if minutes_held >= MAX_HOLD_MINUTES:
            return f"MAX_HOLD: Held for {int(minutes_held)} mins (limit: {MAX_HOLD_MINUTES})"

        # Run fresh prediction to check if signal has flipped
        try:
            from fastapi import BackgroundTasks
            prediction = await self._predict_fn(
                position["ticker"], BackgroundTasks(),
                request=None, horizon=1,
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
        minutes_held = (datetime.utcnow() - datetime.fromisoformat(pos["entry_date"])).total_seconds() / 60.0

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
            "minutes_held": round(minutes_held, 2),
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
            "target_zone": self.target_zone,
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
            "target_zone": self.target_zone,
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
                "avg_hold_mins": 0,
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
        avg_hold = np.mean([t.get("minutes_held", t.get("days_held", 0) * 1440) for t in sell_trades])

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
            "avg_hold_mins": round(float(avg_hold), 1),
            "total_realized_pnl": round(self.total_realized_pnl, 2),
            "largest_win": round(max(t.get("pnl", 0) for t in sell_trades), 2),
            "largest_loss": round(min(t.get("pnl", 0) for t in sell_trades), 2),
        }


# ─── Global Singleton ────────────────────────────────────────────────────────
bot = AutoTraderBot()
