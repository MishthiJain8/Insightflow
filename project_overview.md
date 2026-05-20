# InsightFlow — Complete Project File Breakdown

InsightFlow is an **institutional-grade financial analysis platform** that runs entirely on your machine. It uses a Python FastAPI backend for AI/ML, a React (Vite) frontend for the UI, and MongoDB as the database. No cloud-paid AI APIs are needed — all AI models run locally.

---

## ─── BACKEND (`/backend`) ────────────────────────────────────────

### `main.py` — 3,237 lines — The Core Server
This is the brain of the entire application. Every HTTP API route is defined here.

**What it contains:**
| Section | What it does |
|---|---|
| **CORS Middleware** | Opens all origins so the React frontend can freely communicate with the backend. |
| **Auth System** | Custom OTP (via Gmail SMTP), JWT tokens (PyJWT), and bcrypt password hashing. Users register, log in, or reset passwords via OTP. |
| **Startup Event** | Calls `db.init_db()` and launches the background portfolio evaluator loop. |
| **Background Scheduler** | `_holdings_scheduler()` runs every 5 minutes, calling `evaluate_holdings()` for every registered user. |
| **Holdings Evaluator** | `evaluate_holdings()` fetches live price, runs a full prediction, and pushes SELL / BUY MORE alerts or CRITICAL peak alerts into the notification database. |
| **Market Summary** | `/api/market-summary` — Fetches gainers/losers and sector performance using `yfinance.download()` in bulk. |
| **Chart Data** | `/api/chart/{ticker}` — Fast OHLCV endpoint for the frontend charting library. |
| **Market Data** | `/api/market/{ticker}` — Full company info + OHLCV + fundamentals (P/E, market cap, EPS, beta, etc.). |
| **Intelligence Feed** | `/api/intelligence/{ticker}` — Pulls news from GNews, runs zero-shot transcript analysis via `nlp_engine.analyze_transcript()`, and aggregates an overall sentiment verdict. |
| **News Feed** | `/api/news/{ticker}` — Merges news from both `yfinance.Ticker.news` and GNews, deduplicates by URL, scores keyword sentiment, and returns combined results. |
| **Global Search** | `/api/search` — Proxies queries to `query2.finance.yahoo.com` to resolve ticker symbols in real time. |
| **Predict Endpoint** | `/api/predict/{ticker}` — The core ML endpoint. Builds a feature vector from 11+ technical indicators (RSI, MACD, Bollinger Bands, VWAP, ATR, EMA distances, volume z-score), trains the ensemble, fetches FinBERT sentiment, optionally calls the Ollama RAG engine, and saves the prediction to MongoDB. |
| **Query Endpoint** | `/api/query` — Routes natural language queries through the NLP engine; responses may include ML predictions, portfolio exit calculations, market summaries, or earnings decoding. |
| **Portfolio CRUD** | `/api/portfolio/buy`, `/sell`, `/summary`, `/alerts` — Manages open/closed holdings, computes real-time P&L, and generates AI alert signals. |
| **Watchlist** | `/api/watchlist` — Add/remove/list tickers per user, stored in MongoDB. |
| **Notifications** | `/api/notifications` — CRUD for user alerts; mark-as-read, delete, unread count. |
| **Model Health** | `/api/model-health` — Exposes the self-correction engine's current accuracy, escalation level, and RF hyperparameters to the frontend. |
| **Weekly Report** | `/api/weekly-report` — Triggers `weekly_reporter.generate_weekly_report()` and returns the full performance payload. |
| **Backtest** | `/api/backtest/{ticker}` — Runs a historical walk-forward simulation to estimate win rate over a past date range. |
| **Profile** | `/api/profile` — GET/POST to read and update user display name and phone. |

---

### `database.py` — 630 lines — MongoDB Data Layer
Wraps all MongoDB operations with clean helper functions. Originally SQLite-based and migrated to MongoDB, so it handles both string ObjectIds and legacy integer IDs gracefully.

**Collections managed:**
| Collection | Purpose |
|---|---|
| `members` | User accounts (email, bcrypt-hashed password) |
| `profiles` | Display name, phone number |
| `predictions` | Every ML prediction with status PENDING/COMPLETED |
| `portfolio` | Buy and sell records per user |
| `notifications` | AI alerts per user |
| `audio_analysis` | wav2vec2 emotion scores per ticker |
| `otp_sessions` | Temporary OTPs (TTL index auto-deletes after 10 min) |
| `watchlist` | Per-user tracked tickers |
| `portfolio_snapshots` | Daily portfolio value history for equity curve charting |

**Key functions:**
- `log_prediction()` — saves a new prediction with deduplication (no double-save within 60 seconds)
- `get_pending_evaluations()` — returns predictions where `evaluate_after <= today` and not yet evaluated
- `update_result()` — marks a prediction CORRECT / INCORRECT with actual price
- `sell_portfolio_holding()` — computes `realized_pnl = (sell - buy) × qty` and marks CLOSED
- `save_portfolio_snapshot()` — upserts one snapshot per user per day (prevents flooding)
- `_clean_floats()` — recursively sanitizes NaN/Inf floats before JSON serialization (MongoDB rejects them)

---

### `ml_ensemble.py` — 84 lines — Quantitative Prediction Engine
Builds a soft-voting ensemble of three ML models. The ensemble replaces the earlier single Random Forest for higher accuracy.

**Models in the ensemble:**
| Model | Role | Weight |
|---|---|---|
| `RandomForestClassifier` | Stability baseline | 1.0 |
| `XGBClassifier` | High accuracy on tabular data | 1.5 (favoured) |
| `GradientBoostingClassifier` | Error correction | 0.5 |

- **`build_ensemble_model(rf_config)`** — constructs the `VotingClassifier` using hyperparameters read from `model_config.json`.
- **`train_and_predict(X_train, y_train, X_pred)`** — trains the ensemble and returns the probability of "UP" (0–100%).

---

### `evaluate_model.py` — 317 lines — Self-Correction Engine
The feedback loop that closes the prediction cycle and adapts the model.

**How it works:**
1. Queries MongoDB for all `PENDING` predictions where `evaluate_after <= today`.
2. For each one, fetches the actual close price from YFinance **on the exact target date** (not today's price).
3. Determines `CORRECT`, `INCORRECT`, or `TIE` by comparing direction of price movement vs. predicted direction.
4. Saves the result back to MongoDB.
5. **Feature Attribution (Phase 17):** If `INCORRECT`, adjusts `feature_weights.json`:
   - RSI >70 + predicted UP → increase RSI weight (it was warning us)
   - Negative MACD hist + predicted UP → increase MACD weight
   - High volume z-score climax → decrease volume weight
6. **Hyperparameter Escalation:** Checks rolling 20-prediction accuracy:
   - Below 60% → escalates RF to the next preset level in `model_config.json`
   - Above 70% → relaxes parameters back

**Preset levels in `PARAM_LEVELS`:**
| Level | n_estimators | max_depth | min_samples_leaf |
|---|---|---|---|
| 0 (default) | 200 | 6 | 4 |
| 1 (moderate) | 300 | 8 | 3 |
| 2 (aggressive) | 400 | 10 | 2 |

---

### `ai_brain.py` — 371 lines — Multimodal AI Engine
Handles all local AI inference for sentiment and emotion.

**Component 1 — FinBERT (Text Sentiment):**
- Model: `ProsusAI/finbert` (~440 MB, Hugging Face)
- Input: List of news headlines
- Output: Per-headline sentiment (positive/negative/neutral) + aggregate score in [-1, 1] + Bullish/Bearish/Neutral label

**Component 2 — wav2vec2 (Audio Emotion):**
- Model: `ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition` (~1.1 GB, Hugging Face)
- Input: WAV file path or YouTube URL (downloaded via `yt-dlp`)
- Output: Dominant emotion label + anxiety / confidence / hesitation scores

**Component 3 — Signal Combiner:**
- `combine_signals(text_score, audio_score)` — Blends text and audio using weighted logic:
  - Text Bullish + Audio Fearful → penalize 50% (CEO words contradict voice)
  - Both agree → amplify 20%
  - Otherwise → weighted average (70% text, 30% audio)

**Component 4 — Conviction Score:**
- `combine_conviction_score(technical, text, audio)` — Produces a 0–100 composite:
  - Technicals: 40%, Text: 30%, Audio: 30%

**Component 5 — Learning Note Generator:**
- `generate_learning_note(ticker, direction, result, features)` — Produces a specific, first-person AI lesson sentence based on whether the prediction was correct/incorrect and which features were active (RSI, pattern, sentiment, volume).

---

### `nlp_engine.py` — 748 lines — Semantic Intent Router
Routes natural-language user queries to the right backend function.

**NLP Models used:**
- `facebook/bart-large-mnli` (zero-shot classifier, local CPU) — determines user intent
- `spaCy en_core_web_sm` — dependency tree parsing for entity extraction

**Intent Labels:**
`execute buy order` | `execute sell order` | `future price prediction` | `portfolio risk analysis` | `general market news` | `earnings call decoding` | `company fundamentals` | `company information`

**Pipeline:**
1. Detect greetings/casual phrases early and return a friendly response.
2. Run entity extraction (ticker, quantity, cost basis, horizon).
3. Run zero-shot classification to detect intent with confidence scores.
4. Route to one of: `ml_pipeline`, `portfolio_exit`, `market_summary`, `earnings_decode`, `company_profile`, or `chat`.

**Sub-features:**
- `extract_horizon(text)` — Parses "tomorrow", "3 days", "two weeks", "next month" into an integer day count.
- `calculate_position_exit(ticker, qty, cost)` — Computes unrealized P&L with tiered advice (Hold / Cut Loss / Book Profits).
- `fetch_market_summary()` — Live snapshot of SPY, QQQ, DIA, BTC-USD.
- `decode_earnings_call(ticker)` — Fetches recent news, filters for earnings keywords, runs zero-shot guidance classification.
- `analyze_transcript(text)` — Deep 5-dimension analysis (Past / Present / Future / Verdict / Horizon) using zero-shot classification.

---

### `query_parser.py` — 741 lines — Entity Extraction Engine
Extracts structured data from free-form text queries.

**Features:**
- **`COMPANY_TICKER_MAP`** — 150+ company name → ticker mappings (US, Indian, crypto, ETFs, indices).
- **`_extract_tickers()`** — 4-step extraction pipeline:
  1. Case-insensitive company name scan (e.g., "apple" → AAPL)
  2. Uppercase ticker regex (e.g., `NVDA`, `RELIANCE.NS`)
  3. spaCy NER for ORG/PRODUCT entities
  4. Fuzzy matching via `SequenceMatcher` (e.g., "nvida" → NVDA)
  5. Yahoo Finance global search API fallback
- **`_extract_intent()`** — Score-based intent detection from `INTENT_MAP` (buy, sell, hold, analyse, forecast, compare, reasoning, price_target). Longer keywords score higher.
- **`_semantic_intent_score()`** — Computes a 0–100 confidence interval using `SEMANTIC_BOOSTERS` (e.g., "based on" +9, "not sure" -15, "breakout" +8).
- **`parse_query()`** — Returns unified dict: ticker, tickers list, quantity, price, currency, intent, horizon_days, confidence_interval.

---

### `rag_engine.py` — 60 lines — Local RAG Interface
Connects to a locally running Ollama LLM server.

- **Model:** `llama3` (via Ollama at `http://127.0.0.1:11434`)
- **Function:** `generate_rag_explanation(ticker, prediction_data, news_headlines)` — constructs a structured prompt with hard data (win rate, matched patterns, sentiment, technical triggers) and instructs the model to produce a professional explanation. Temperature is set to 0.3 to reduce hallucination.
- Returns `None` silently if Ollama is not running (graceful degradation).

---

### `auditor.py` — 121 lines — Automated Prediction Auditor
A standalone script (can also be run via CLI: `python auditor.py`) that:
1. Fetches all `PENDING` predictions where `target_date <= today`.
2. Pulls actual historical close price from YFinance.
3. Marks each prediction `Correct` or `Incorrect`.
4. If `INCORRECT` and model accuracy was below 70%, writes a sector-specific learning note (e.g., "Overestimated bullish news sentiment in the Tech sector").

---

### `weekly_reporter.py` — 242 lines — Weekly Performance Emailer
Generates and emails a plain-English weekly performance summary.

**Pipeline:**
1. Query MongoDB for all evaluated predictions in the last 7 days.
2. Compute **Weekly Alpha Score** = (correct / total) × 100.
3. Compare to the previous week's score (delta).
4. Rank top-3 tickers by precision and identify the worst-performing ticker.
5. Build a narrative with metaphors (e.g., "like a seasoned doctor" for >75% accuracy).
6. Send via SMTP (Gmail, TLS, port 587).

---

### `utils/cache_manager.py` — 31 lines — In-Memory TTL Cache
Defines `InsightCache` — a simple dictionary-based TTL cache. Four global singleton instances are used:
| Instance | Default TTL | Caches |
|---|---|---|
| `market_cache` | 5 min | YFinance price data |
| `sentiment_cache` | 1 hour | News sentiment results |
| `prediction_cache` | 10 min | ML prediction results |
| `rag_cache` | 2 hours | Ollama RAG explanations |

---

### `utils/translator.py` — 48 lines — Plain-English Finance Translator
`simplify_finance(text)` — Converts technical jargon in AI-generated messages into beginner-friendly analogies using regex replacement, for example:
- "RSI Overbought" → "The stock is 'overheated.' Like a runner who sprinted too fast..."
- "Bullish MACD Crossover" → "Positive Momentum Shift (Buyers are taking control)"

---

### `utils/audio_processor.py` — 65 lines — Audio Pipeline Orchestrator
`analyze_and_save_audio(ticker, audio_url)` — Calls `ai_brain.analyze_audio_emotion()` and saves the result (anxiety, confidence, hesitation, composite score) to the MongoDB `audio_analysis` collection.

---

### Config & Data Files
| File | Purpose |
|---|---|
| `model_config.json` | Current active RF hyperparameters (n_estimators, max_depth, min_samples_leaf) + last accuracy + retrain count. Auto-updated by `evaluate_model.py`. |
| `feature_weights.json` | Per-feature scaling weights (rsi14, macd, volume_z, etc.) updated after each INCORRECT prediction by the attribution engine. |
| `.env` | Secrets: `MONGODB_URI`, `MONGODB_DB_NAME`, `JWT_SECRET`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `SMTP_USER`, `SMTP_PASSWORD`. |
| `sample_audio.wav` | A generated 3-second 440Hz sine-wave WAV used as a neutral placeholder when no real earnings call audio is provided. |
| `requirements.txt` | Full pip dependency list with pinned versions. |

---

## ─── FRONTEND (`/frontend/src`) ───────────────────────────────────

The React frontend is a Single Page Application built with **Vite + TailwindCSS v4 + Framer Motion**.

### Core Files

**`main.jsx`** — Mounts `<App />` inside `<AuthProvider>` (global auth context).

**`App.jsx`** — Master layout. Manages the active page state (dashboard / market / strategy / portfolio / ai / edit-profile). Contains:
- `TopBar` — search bar + notification bell + user avatar
- `StatsBar` — 4 stat pills (80+ markets, 5m→1mo intervals, RSI/SMA, <2s engine)
- `ChartView` — two-column layout (BloombergChart + CompanyOverview) shown when a ticker is selected
- `WelcomePanel` — shown on first load before any ticker is searched
- Watchlist state managed here; synced to backend on every toggle

---

### Pages (`/src/pages/`)

**`Dashboard.jsx`** — Overview page showing:
- Market gainers/losers heat maps (calls `/api/market-summary`)
- Sector performance panel
- Top news stories
- Quick stats on the user's portfolio

**`Portfolio.jsx` (72KB)** — The most complex page. Contains:
- Holdings table with live P&L for each position (buy price vs. live price)
- Add/sell holding forms (POST to `/api/portfolio/buy` and `/api/portfolio/sell`)
- Equity curve chart (reconstructed from `portfolio_snapshots` collection)
- `TickerModal` — drills down into a single holding with live chart + AI signals
- AI alert panel — BUY MORE / SELL / HOLD signals per holding
- Closed trades history table with realized P&L

**`StrategyLab.jsx`** — Sandboxed prediction workspace:
- Ticker input → runs `/api/predict/{ticker}` on demand
- Displays `PredictionCard` (direction, probability, features breakdown)
- Shows `AccuracyTracker` panel (model health, escalation level, rolling accuracy)
- Calls `/api/evaluate` in the background to refresh prediction statuses
- `AuditModal` for reviewing past predictions with full evidence breakdowns

**`MarketData.jsx`** — The News & Analysis page:
- `IntelligenceFeed` component consuming `/api/intelligence/{ticker}`
- `TerminalInput` for natural language queries
- Earnings transcript deep analysis (Past / Present / Future / Verdict / Horizon)
- Audio emotion analysis panel

**`EditProfile.jsx`** — Update display name and phone number. OTP-gated password change.

**`SetupProfile.jsx`** — First-time profile setup after registration.

**`Auth/`** — Login, Register, ForgotPassword, ResetPassword flows.

---

### Components (`/src/components/`)

| Component | What it does |
|---|---|
| **`BloombergChart.jsx`** | Professional candlestick/line chart using `lightweight-charts`. Supports 9 time ranges (5m → MAX). Plots portfolio entry markers on the chart. |
| **`PredictionCard.jsx`** | Renders the ML prediction: direction arrow, probability gauge, sentiment bar, feature chips (RSI, MACD, BB, volume), evidence list, RAG explanation text. |
| **`AccuracyTracker.jsx`** | Displays the self-correction engine's state: rolling accuracy %, correct/incorrect counts, escalation level badge, feature weights table. |
| **`AuditModal.jsx`** | Full-screen modal showing a prediction's history — what the AI saw vs. what actually happened. Has a "Generate Learning Note" button. |
| **`TerminalInput.jsx`** | Natural language chat input that hits `/api/query`. Renders route-aware responses: ML prediction cards, P&L exit summaries, market snapshots, or earnings breakdowns. |
| **`IntelligenceFeed.jsx`** | Renders the news feed, earnings transcript analysis, audio emotion results, and overall sentiment for a ticker. |
| **`Sidebar.jsx`** | Main navigation. Also houses the AI Guardian Terminal (live SELL/BUY MORE alerts) and Watchlist modal. Polls backend every 2 minutes for fresh alerts. |
| **`NotificationBell.jsx`** | Bell icon with unread badge. Dropdown shows all notifications with read/delete controls. |
| **`MarketCard.jsx`** | Price quote strip — shows current price, % change, day high/low, volume, and a watchlist star toggle. |
| **`CompanyOverview.jsx`** | Fundamental panel: market cap, P/E ratio, EPS, dividend yield, beta, 52-week range, sector, country, and business summary. |
| **`UniversalSearch.jsx`** | Autocomplete search bar that queries `/api/search` for global ticker resolution. |
| **`ThreeBackground.jsx`** | Animated Three.js particle field background using `@react-three/fiber` and `@react-three/drei`. |
| **`BacktestCard.jsx`** | Renders backtest results (win rate, total trades, drawdown) from `/api/backtest/{ticker}`. |
| **`ExplainModal.jsx`** | Modal for showing the Ollama RAG explanation in formatted markdown. |
| **`PrecisionModal.jsx`** | Shows ticker-specific accuracy stats from `db.get_ticker_accuracy()`. |
| **`StockChart.jsx`** | Alternative simpler chart component using `recharts`. |
| **`PortfolioHistoryChart.jsx`** | Small sparkline of portfolio value over time using `recharts`. |
| **`TickerModal.jsx`** | Drill-down modal for a portfolio holding (live chart + fundamentals). |
| **`AuthRouter.jsx`** | Guards routes — shows auth pages if not logged in. |
| **`ProfileGuard.jsx`** | Redirects to profile setup if the user hasn't set a display name yet. |

---

### Context & Utils

**`context/AuthContext.jsx`** — React Context that:
- Persists JWT + user data in `localStorage`
- Exposes `login()`, `signOut()`, `refreshProfile()` to all components
- Auto-fetches profile from `/api/profile` on mount using stored JWT
- Signs out automatically on 401 responses

**`utils/translator.js`** — Frontend mirror of the backend translator (jargon → plain English) for rendering simplified notification messages.

---

## ─── EXTERNAL APIs & SERVICES ───────────────────────────────────

| Service | How it's used |
|---|---|
| **Yahoo Finance (`yfinance`)** | Historical OHLCV, live prices, company fundamentals (P/E, EPS, market cap, beta), news articles. Used in almost every backend endpoint. |
| **Yahoo Finance Search API** (`query2.finance.yahoo.com`) | Resolves company names or partial tickers to exact symbols. Used in `query_parser.py`, `nlp_engine.py`, and the `/api/search` endpoint. |
| **GNews (`gnews` Python package)** | Fetches recent news headlines by topic or ticker name. Used in `/api/intelligence/` and `/api/news/`. |
| **Hugging Face Hub (local)** | Three models are auto-downloaded on first use and run entirely locally via `transformers`: `ProsusAI/finbert` (text sentiment), `facebook/bart-large-mnli` (zero-shot intent/classification), `ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition` (audio emotion). |
| **Ollama (local LLM)** | `llama3` running at `localhost:11434`. Used by `rag_engine.py` to generate conversational investment explanations. Gracefully skipped if not running. |
| **spaCy (`en_core_web_sm`)** | Local NLP for dependency-tree entity parsing (root verb, direct objects, quantity modifiers). |
| **Gmail SMTP** (`smtp.gmail.com:465` for OTP, `:587` for weekly report) | Sends 6-digit OTPs for registration / password reset, and weekly Alpha Report emails. Credentials stored in `.env`. |
| **MongoDB Atlas / Local** | Primary database. URI from `MONGODB_URI` env var (defaults to localhost). |
| **YouTube (`yt-dlp`)** | Downloads audio from YouTube URLs to run wav2vec2 emotion analysis on earnings call recordings. |
