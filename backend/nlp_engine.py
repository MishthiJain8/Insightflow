"""
InsightFlow — nlp_engine.py
============================
Advanced Local NLP Intent Engine (Phase 12 → 13: Deep Semantic Upgrade).

Capabilities:
  1. Zero-shot classification        : facebook/bart-large-mnli (local, CPU)
  2. spaCy dependency tree parsing   : root verb, direct objects, nummod, pobj
  3. Dynamic time horizon extraction : re (any N days / N weeks / N months)
  4. Position exit calculator        : yfinance P&L + tiered advice
  5. Market summary fetcher          : live SPY / QQQ / DIA / BTC-USD snapshot

NO external/paid APIs (OpenAI, Gemini, etc.) — fully local.
"""

import re
import logging
import requests
import yfinance as yf

logger = logging.getLogger("nlp_engine")

# ─── Lazy-load heavy models ───────────────────────────────────────────────────
_intent_classifier = None
_nlp = None


def _get_intent_classifier():
    global _intent_classifier
    if _intent_classifier is None:
        try:
            from transformers import pipeline
            logger.info("Loading zero-shot classifier (facebook/bart-large-mnli)…")
            _intent_classifier = pipeline(
                "zero-shot-classification",
                model="facebook/bart-large-mnli",
                device=-1,   # CPU; set to 0 for GPU
            )
            logger.info("Zero-shot classifier ready.")
        except Exception as e:
            logger.error(f"Failed to load intent classifier: {e}")
            _intent_classifier = None
    return _intent_classifier


def _get_nlp():
    global _nlp
    if _nlp is None:
        try:
            import spacy
            _nlp = spacy.load("en_core_web_sm")
        except Exception as e:
            logger.warning(f"spaCy load failed: {e}")
    return _nlp


# ─── Granular Quant Intent Labels ────────────────────────────────────────────
# More granular than Phase 12 to handle conditional / future queries.
CANDIDATE_LABELS = [
    "execute buy order",
    "execute sell order",
    "future price prediction",
    "portfolio risk analysis",
    "general market news",
    "earnings call decoding",
    "company fundamentals",
    "company information",
]

# Map classifier output → internal routing token
LABEL_TO_ROUTE = {
    "execute buy order":       "ml_pipeline",
    "execute sell order":      "ml_pipeline",
    "future price prediction": "ml_pipeline",
    "portfolio risk analysis": "portfolio_exit",
    "general market news":     "market_summary",
    "earnings call decoding":  "earnings_decode",
    "company fundamentals":    "company_profile",
    "company information":     "company_profile",
}


# ─── Written-number word map ──────────────────────────────────────────────────
_WORD_NUMS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
    "fifteen": 15, "twenty": 20, "thirty": 30,
}

_NUM_PAT = r'(\d+|' + '|'.join(_WORD_NUMS.keys()) + r')'


def _parse_num(token: str) -> int | None:
    try:
        return int(token)
    except ValueError:
        return _WORD_NUMS.get(token.lower())


# ─── Dynamic Time Horizon Extraction ─────────────────────────────────────────

def extract_horizon(text: str) -> int:
    """
    Capture any integer (digit or word) tied to a time unit.
    Returns number of days (int). Default: 7.
    """
    tl = text.lower()

    if "tomorrow" in tl:
        return 1
    if re.search(r'\b1[- ]?day\b', tl):
        return 1

    # Days
    m = re.search(rf'\b{_NUM_PAT}\s*[- ]?days?\b', tl)
    if m:
        v = _parse_num(m.group(1))
        if v:
            return v

    # Weeks
    if "next week" in tl:
        return 7
    m = re.search(rf'\b{_NUM_PAT}\s*[- ]?weeks?\b', tl)
    if m:
        v = _parse_num(m.group(1))
        if v:
            return v * 7

    # Months
    if "next month" in tl:
        return 30
    m = re.search(rf'\b{_NUM_PAT}\s*[- ]?months?\b', tl)
    if m:
        v = _parse_num(m.group(1))
        if v:
            return v * 30

    return 7


# ─── spaCy Dependency Tree Parser ────────────────────────────────────────────



# ─── Utility helpers ─────────────────────────────────────────────────────────

def resolve_real_ticker(company_query):
    """Use Yahoo Finance global search API to resolve a company name to its ticker.
    Falls back to the original query if no suitable symbol found.
    """
    url = f"https://query2.finance.yahoo.com/v1/finance/search?q={company_query}"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    try:
        resp = requests.get(url, headers=headers, timeout=5)
        data = resp.json()
        for quote in data.get('quotes', []):
            if quote.get('quoteType') in ['EQUITY', 'ETF', 'MUTUALFUND']:
                return quote.get('symbol')
    except Exception:
        pass
    return company_query


def get_history(ticker: str, **kwargs):
    """Fetch history and retry with resolved ticker if initial df is empty."""
    try:
        df = yf.Ticker(ticker).history(**kwargs)
    except Exception:
        df = None

    if df is None or getattr(df, "empty", True):
        resolved = resolve_real_ticker(ticker)
        if resolved != ticker:
            try:
                df = yf.Ticker(resolved).history(**kwargs)
            except Exception:
                df = None
            return df, resolved
    return df, ticker


def _dep_parse_entities(text: str, doc) -> dict:
    """
    Use spaCy's dependency tree to extract:
      - root_verb  : the main action (buy, sell, hold, …)
      - share_qty  : the nummod attached to the direct object
      - company    : the pobj attached to "of" / "in" after the dobj

    Falls back gracefully if the parse tree is shallow.
    """
    result = {"root_verb": None, "share_qty": None, "company_from_dep": None}

    if doc is None:
        return result

    # Find the sentence root (typically the main verb)
    root = None
    for token in doc:
        if token.dep_ == "ROOT":
            root = token
            break

    if root:
        result["root_verb"] = root.lemma_.lower()

        # Walk root's children to find the direct object (dobj)
        for child in root.children:
            if child.dep_ == "dobj":
                # nummod attached to the dobj → share_qty
                for sub in child.children:
                    if sub.dep_ == "nummod":
                        try:
                            val = float(sub.text.replace(",", ""))
                            if val < 1_000_000 and val == int(val):
                                result["share_qty"] = int(val)
                        except ValueError:
                            pass
                    # pobj of prep "of" or "in" → company name
                    if sub.dep_ == "prep" and sub.text.lower() in ("of", "in"):
                        for gchild in sub.children:
                            if gchild.dep_ == "pobj":
                                result["company_from_dep"] = gchild.text
                                break
                break

        # If we haven't found a company yet, look for pobj anywhere in preps
        if not result["company_from_dep"]:
            for token in doc:
                if token.dep_ == "prep" and token.text.lower() in ("of", "in"):
                    for child in token.children:
                        if child.dep_ == "pobj":
                            result["company_from_dep"] = child.text
                            break

    return result


# ─── Advanced Entity Extraction ───────────────────────────────────────────────

def extract_entities(text: str) -> dict:
    """
    Unified entity extraction combining:
      - spaCy NER  (MONEY → cost_basis, CARDINAL/QUANTITY → qty)
      - Dep-tree   (nummod → share_qty, pobj → company)
      - Regex      (fallbacks for qty and cost_basis)
      - Ticker     (via existing query_parser helpers)
      - Horizon    (dynamic regex)

    Returns a flat dict ready to be embedded in the API response.
    """
    from query_parser import _extract_tickers, _extract_horizon as _qp_horizon

    nlp = _get_nlp()
    doc = nlp(text) if nlp else None

    entities: dict = {
        "ticker": None,
        "qty": None,
        "cost_basis": None,
        "horizon": extract_horizon(text),
        "root_verb": None,
        "company_raw": None,
    }

    # Common English words / stop words that look like tickers — never treat as tickers
    _TICKER_BLOCKLIST = {
        "I", "A", "AN", "IT", "IN", "OR", "IF", "BY", "TO", "OF", "AT",
        "ON", "UP", "DO", "GO", "BE", "ME", "MY", "NO", "SO", "WE",
        "ALL", "AND", "ARE", "FOR", "THE", "CAN", "HAS", "DID",
        "GET", "GOT", "LET", "MAY", "OUR", "OUT", "OWN", "PUT", "SAY",
        "SEE", "SET", "TWO", "USE", "WAS", "WHO", "WILL", "WHATS", "WHAT",
        # Phase 18: Expanded blocklist
        "HOW", "NOW", "ANY", "WAY", "THINK", "ABOUT", "SHOULD",
        "WOULD", "COULD", "TELL", "GIVE", "SHOW", "HELP", "MAKE",
        "WANT", "JUST", "SOME", "BEEN", "HAVE", "FROM", "THEY",
        "THEM", "THEN", "THAN", "ALSO", "LIKE", "THIS", "THAT",
        "EACH", "MOST", "FIND", "HERE", "KNOW", "TAKE", "COME",
        "GOOD", "MUCH", "WHEN", "LOOK", "BEST", "DOES", "KEEP",
        "WITH", "INTO", "OVER", "ONLY", "VERY", "BEEN", "SAID",
        "TIME", "LONG", "SHORT", "HOLD", "EXIT", "BUY", "SELL",
        "STOCK", "STOCKS", "SHARE", "SHARES", "MARKET", "PRICE",
        "RIGHT", "GOING", "STILL", "PLEASE", "THANKS", "THANK",
        "HELLO", "HI", "HEY",
    }

    # --- Ticker ---
    fake = _FakeDoc()
    tickers, _ = _extract_tickers(text, doc or fake)
    # Drop blocklisted tokens and tokens containing dots that look like URLs
    tickers = [t for t in tickers if t not in _TICKER_BLOCKLIST and len(t) >= 2]
    if tickers:
        entities["ticker"] = tickers[0]

    # --- Dependency-tree deep parse ---
    if doc:
        dep = _dep_parse_entities(text, doc)
        entities["root_verb"] = dep["root_verb"]

        # Use dep-tree qty if found, it's more context-aware
        if dep["share_qty"] is not None:
            entities["qty"] = dep["share_qty"]

        if dep["company_from_dep"]:
            entities["company_raw"] = dep["company_from_dep"]
            # Try to resolve company name to ticker
            from query_parser import COMPANY_TICKER_MAP
            mapped = COMPANY_TICKER_MAP.get(dep["company_from_dep"].upper())
            if mapped:
                entities["ticker"] = entities["ticker"] or mapped

    # --- spaCy NER fallbacks ---
    if doc:
        for ent in doc.ents:
            if ent.label_ == "MONEY" and entities["cost_basis"] is None:
                raw = re.sub(r"[^\d.]", "", ent.text)
                try:
                    entities["cost_basis"] = float(raw)
                except ValueError:
                    pass
            if ent.label_ in ("CARDINAL", "QUANTITY") and entities["qty"] is None:
                try:
                    val = float(ent.text.replace(",", ""))
                    if val < 1_000_000 and val == int(val):
                        entities["qty"] = int(val)
                except ValueError:
                    pass

    # --- Regex fallbacks for qty ---
    if entities["qty"] is None:
        m = re.search(r"\b(\d+(?:,\d{3})*)\s*(?:shares?|units?|lots?|stocks?)", text, re.IGNORECASE)
        if not m:
            m = re.search(r"(?:bought?|buy|sell|purchased?|sold)\s+(\d+(?:,\d{3})*)", text, re.IGNORECASE)
        if m:
            try:
                entities["qty"] = int(m.group(1).replace(",", ""))
            except ValueError:
                pass

    # --- Regex fallbacks for cost_basis ---
    if entities["cost_basis"] is None:
        m = re.search(r"(?:at|@|price|cost)\s*[$₹€£]?\s*(\d+(?:\.\d+)?)", text, re.IGNORECASE)
        if not m:
            m = re.search(r"[$₹€£]\s*(\d+(?:\.\d+)?)", text)
        if m:
            try:
                entities["cost_basis"] = float(m.group(1))
            except ValueError:
                pass

    return entities


class _FakeDoc:
    ents = []
    noun_chunks = []
    def __iter__(self): return iter([])


# ─── Position Exit Calculator ─────────────────────────────────────────────────

def calculate_position_exit(ticker: str, qty: int, cost: float) -> dict:
    """Fetch current price and calculate P&L + tiered exit advice."""
    try:
        data, ticker = get_history(ticker, period="5d", interval="1d")
        if data.empty:
            return {"error": f"Could not fetch price for {ticker}."}
        current_price = float(data["Close"].iloc[-1])
    except Exception as e:
        return {"error": str(e)}

    unrealized_pnl = (current_price - cost) * qty
    pnl_pct = (current_price - cost) / cost * 100

    if pnl_pct >= 15:
        advice = f"Strong profit ({pnl_pct:+.1f}%). Consider booking partial profits and trailing your stop-loss."
    elif pnl_pct >= 5:
        advice = f"Healthy gain of {pnl_pct:+.1f}%. Hold with a stop-loss below your entry."
    elif pnl_pct >= 0:
        advice = f"Small gain ({pnl_pct:+.1f}%). Hold unless momentum weakens."
    elif pnl_pct >= -10:
        advice = f"Drawdown of {pnl_pct:+.1f}%. Review your thesis; consider a stop-loss."
    else:
        advice = f"Significant loss ({pnl_pct:+.1f}%). Reassess — cut or average down only with conviction."

    return {
        "ticker": ticker, "qty": qty, "cost_basis": cost,
        "current_price": round(current_price, 2),
        "unrealized_pnl": round(unrealized_pnl, 2),
        "pnl_pct": round(pnl_pct, 2),
        "advice": advice,
    }


# ─── Market Summary Fetcher ───────────────────────────────────────────────────

def fetch_market_summary(ticker: str = None) -> dict:
    """Live market snapshot for key indices or a specific ticker."""
    symbols = [ticker] if ticker else ["SPY", "QQQ", "DIA", "BTC-USD"]
    summary = {}
    for sym in symbols:
        try:
            hist, sym = get_history(sym, period="5d", interval="1d")
            if hist.empty:
                continue
            latest = float(hist["Close"].iloc[-1])
            prev   = float(hist["Close"].iloc[-2]) if len(hist) > 1 else latest
            chg    = (latest - prev) / prev * 100
            summary[sym] = {
                "price": round(latest, 2),
                "change_pct": round(chg, 2),
                "trend": "UP" if chg >= 0 else "DOWN",
            }
        except Exception:
            pass
    return summary


# ─── Earnings Call Decoder (Phase 15) ─────────────────────────────────────────

def decode_earnings_call(ticker: str) -> dict:
    """
    Fetch recent news from yfinance, filter for earnings/guidance keywords,
    and use the local zero-shot classifier to extract forward guidance tags.
    """
    if not ticker:
        return {"error": "Ticker required for earnings call decoding."}
        
    try:
        stock = yf.Ticker(ticker)
        # yf.Ticker().news returns a list of dicts: [{'title': ..., 'publisher': ..., 'link': ...}, ...]
        news_items = stock.news
        if not news_items:
            return {"error": f"No recent news found for {ticker}."}
    except Exception as e:
        logger.error(f"Failed to fetch news for {ticker}: {e}")
        return {"error": f"Failed to fetch news data for {ticker}."}

    # Filter for earnings-related headlines
    earnings_keywords = {"earnings", "guidance", "q1", "q2", "q3", "q4", "revenue", "profit", "margins", "eps"}
    relevant_news = []
    
    for item in news_items:
        title = item.get("title", "")
        # Very simple keyword match
        if any(kw in title.lower() for kw in earnings_keywords):
            relevant_news.append(title)
            
    if not relevant_news:
        # Fallback to general news if no explicit earnings keywords found
        relevant_news = [item.get("title", "") for item in news_items[:5]]

    # Run Zero-Shot Classifier to gauge sentiment and guidance
    guidance_labels = [
        "revenue beat", 
        "revenue miss", 
        "strong forward guidance", 
        "weak forward guidance", 
        "margin expansion", 
        "margin contraction"
    ]
    
    classifier = _get_intent_classifier()
    detected_tags = []
    
    if classifier:
        try:
            # Combine top 3 relevant headlines for context
            context_text = " ".join(relevant_news[:3])
            result = classifier(context_text, guidance_labels, multi_label=True)
            # Extract tags with > 0.40 confidence
            for label, score in zip(result["labels"], result["scores"]):
                if score > 0.40:
                    detected_tags.append({"label": label, "confidence": round(score, 2)})
        except Exception as e:
            logger.error(f"Earnings zero-shot error: {e}")

    # Determine overall sentiment based on tags
    bull_tags = {"revenue beat", "strong forward guidance", "margin expansion"}
    bear_tags = {"revenue miss", "weak forward guidance", "margin contraction"}
    
    bull_score = sum(t["confidence"] for t in detected_tags if t["label"] in bull_tags)
    bear_score = sum(t["confidence"] for t in detected_tags if t["label"] in bear_tags)
    
    if bull_score > bear_score + 0.3:
        sentiment = "Bullish"
    elif bear_score > bull_score + 0.3:
        sentiment = "Bearish"
    else:
        sentiment = "Mixed / Neutral"

    return {
        "ticker": ticker,
        "sentiment": sentiment,
        "tags": detected_tags,
        "headlines": relevant_news[:3],
    }

def analyze_transcript(text: str) -> dict:
    """
    Phase 16: Advanced Mock Transcript Analyzer.
    Uses zero-shot classification to deeply analyze earnings call transcripts
    and extract actionable insights across 5 dimensions:
    Past, Present, Future, Verdict, and Horizon.
    """
    if not text or len(text) < 50:
        return {"error": "Transcript too short for analysis."}
        
    classifier = _get_intent_classifier()
    if not classifier:
        return {"error": "Local NLP classifier unavailable."}

    # Define dimensions for the AI to extract
    dimensions = {
        "Past Performance": [
            "Strong past growth", "Exceeded previous guidance", "Revenue acceleration",
            "Previous quarter miss", "Margin contraction historically", "Weak historical sales"
        ],
        "Present Condition": [
            "Healthy balance sheet", "Strong current demand", "Robust cash flow",
            "Macro headwinds", "Supply chain constraints", "Elevated interest rates impacting sales"
        ],
        "Future Trajectory": [
            "Strong forward guidance", "New product pipeline", "Market expansion planned",
            "Revenue deceleration expected", "Lowering future guidance", "Cautious outlook"
        ],
        "Verdict": [
            "Buy signal", "Sell signal", "Hold position"
        ],
        "Horizon": [
            "Short Term Catalyst (1-3 months)",
            "Medium Term holding (3-6 months)", 
            "Long Term accumulation (1+ years)"
        ]
    }
    
    # We will score chunks if the text is very long, but for the mock transcript
    # we can evaluate the text as a whole (BART handles up to ~1024 tokens)
    analysis_input = text[:3000] # Safe crop for BART
    
    result_dict = {}
    
    for dimension, labels in dimensions.items():
        try:
            res = classifier(analysis_input, labels, multi_label=True)
            
            # For Verdict and Horizon, we want the single best match
            if dimension in ["Verdict", "Horizon"]:
                best_label = res["labels"][0]
                best_score = res["scores"][0]
                
                # Further refine the "Buy/Sell/Hold" text
                if dimension == "Verdict":
                    if "Buy signal" in best_label: best_label = "BUY"
                    elif "Sell signal" in best_label: best_label = "SELL"
                    else: best_label = "HOLD"
                    
                result_dict[dimension] = {
                    "value": best_label,
                    "confidence": round(best_score, 2)
                }
            
            # For Past/Present/Future, return the top 2 highest scoring insights above a threshold
            else:
                top_insights = []
                for label, score in zip(res["labels"], res["scores"]):
                    if score > 0.35: # Threshold for inclusion
                        top_insights.append({
                            "insight": label,
                            "confidence": round(score, 2),
                            # Simple heuristic for positive/negative styling in UI
                            "sentiment": "positive" if any(good in label.lower() for good in ["strong", "exceeded", "growth", "healthy", "robust", "expansion"]) else ("negative" if any(bad in label.lower() for bad in ["miss", "contraction", "weak", "headwinds", "constraints", "deceleration", "lowering", "cautious"]) else "neutral")
                        })
                
                # Keep top 2
                result_dict[dimension] = top_insights[:2]
                
        except Exception as e:
            logger.error(f"Transcript zero-shot error on {dimension}: {e}")
            result_dict[dimension] = [] if dimension not in ["Verdict", "Horizon"] else {"value": "Unknown", "confidence": 0.0}

    return result_dict

# ─── Master Router ────────────────────────────────────────────────────────────


def process_advanced_query(user_text: str) -> dict:
    """
    Master NLP pipeline:
      1. Deep entity extraction (dep-tree + NER + regex)
      2. Zero-shot intent classification (facebook/bart-large-mnli)
      3. Multi-intent compositing for conditional queries
      4. Route to appropriate sub-function
      5. Return unified JSON with full entity + intent breakdown
    """
    # very quick casual queries (the notorious "U bug").
    # if the input is just a word or two with no digits and we didn't
    # actually extract a ticker, treat it as a chat request instead of
    # trying to run the ML pipeline.
    stripped = user_text.strip()

    # Phase 18: Detect greetings, gratitude, and casual questions early
    _GREETING_PATTERNS = [
        r'^\s*(hi|hello|hey|howdy|yo|sup|greetings|good\s*(morning|afternoon|evening))\s*[!.?]*\s*$',
        r'^\s*(thanks|thank\s*you|thx|ty|cheers|appreciate)\s*[!.?]*\s*$',
        r'^\s*what\s*(can|do)\s*you\s*do\s*[?.!]*\s*$',
        r'^\s*who\s*are\s*you\s*[?.!]*\s*$',
        r'^\s*help\s*[!.?]*\s*$',
    ]
    for pattern in _GREETING_PATTERNS:
        if re.search(pattern, stripped, re.IGNORECASE):
            # Determine response based on the type of greeting
            lower_stripped = stripped.lower().strip('!?.\' ')
            if any(g in lower_stripped for g in ['thank', 'thx', 'ty', 'cheers', 'appreciate']):
                human_msg = (
                    "You're welcome! Let me know if you need anything else. "
                    "I can analyze stocks, check your portfolio, or forecast market movements."
                )
            elif any(g in lower_stripped for g in ['who are you', 'what can you', 'what do you', 'help']):
                human_msg = (
                    "I'm InsightFlow's AI assistant. I can help you with:\n"
                    "• Stock analysis (e.g., 'How does Apple look?')\n"
                    "• Buy/sell advice (e.g., 'Should I invest in Tesla?')\n"
                    "• Price forecasts (e.g., 'Where is Nvidia going next week?')\n"
                    "• Portfolio review (e.g., 'I have 50 shares of INFY at ₹1800')\n"
                    "• Market overview (e.g., 'How's the market doing?')\n"
                    "• Company comparisons (e.g., 'Compare Apple and Microsoft')\n\n"
                    "Just type naturally — I understand plain English!"
                )
            else:
                human_msg = (
                    "Hey there! 👋 I'm your financial AI assistant. "
                    "Ask me anything about stocks, crypto, or your portfolio. "
                    "For example: 'Should I invest in Apple?' or 'What's happening with Tesla?'"
                )
            return {
                "detected_intent": "chat",
                "composite_intents": ["chat"],
                "intent_scores": {},
                "entities": {},
                "route": "chat",
                "result": {},
                "human_summary": human_msg,
            }

    if len(stripped.split()) <= 2 and not re.search(r"\d", stripped):
        ents = extract_entities(user_text)
        if not ents.get("ticker"):
            return {
                "detected_intent": "chat",
                "composite_intents": ["chat"],
                "intent_scores": {},
                "entities": {},
                "route": "chat",
                "result": {},
                "human_summary": (
                    "I'm a financial AI. I can help you analyze stocks, review your portfolio,"
                    " or check market trends. What ticker would you like to look at?"
                ),
            }

    # — Step 1: entity extraction —
    entities = extract_entities(user_text)

    # — Step 2: intent classification —
    detected_intent = "future price prediction"  # safe default
    all_intents: dict = {}
    composite_intents: list = []

    classifier = _get_intent_classifier()
    if classifier:
        try:
            result = classifier(user_text, CANDIDATE_LABELS, multi_label=True)
            all_intents = dict(zip(result["labels"], [round(s, 4) for s in result["scores"]]))
            # Rank by score
            ranked = sorted(all_intents.items(), key=lambda x: x[1], reverse=True)
            detected_intent = ranked[0][0]
            # Composite: include all labels scoring above threshold (0.35)
            composite_intents = [lbl for lbl, sc in ranked if sc >= 0.35]
            logger.info(f"Intent: '{detected_intent}' | Composite: {composite_intents}")
        except Exception as e:
            logger.error(f"Intent classification error: {e}")

    # — Step 3: determine route —
    # If multiple intents fire (e.g., buy + future prediction), prefer "buy+predict"
    has_buy  = any(l.startswith("execute buy")  for l in composite_intents)
    has_sell = any(l.startswith("execute sell") for l in composite_intents)
    has_pred = "future price prediction" in composite_intents
    has_port = "portfolio risk analysis" in composite_intents
    has_news = "general market news"     in composite_intents
    has_earn = "earnings call decoding"  in composite_intents
    # fundamentals / company info labels
    has_fund = any(l.startswith("company") for l in composite_intents)

    if has_earn and entities.get("ticker"):
        route = "earnings_decode"
    elif has_port and entities.get("qty") and entities.get("cost_basis") and entities.get("ticker"):
        route = "portfolio_exit"
    # buy/sell/prediction questions should always run through the ML pipeline,
    # even if the classifier also triggered company-related labels.
    elif (has_buy or has_sell or has_pred) and entities.get("ticker"):
        route = "ml_pipeline"
    elif has_fund and entities.get("ticker"):
        route = "company_profile"
    elif has_news and not has_buy and not has_sell and not has_pred and not has_earn:
        route = "market_summary"
    else:
        route = "ml_pipeline"

    # — Step 4: compute result for non-ML routes —
    routed_result: dict = {}
    if route == "portfolio_exit":
        ticker   = entities["ticker"]
        qty      = entities["qty"]
        cost     = entities["cost_basis"]
        routed_result = calculate_position_exit(ticker, qty, cost)
    elif route == "market_summary":
        routed_result = fetch_market_summary(entities.get("ticker"))
    elif route == "earnings_decode":
        routed_result = decode_earnings_call(entities["ticker"])


    # — Step 5: unified output —
    # The master router itself doesn't know about finances, so it
    # doesn't craft a human_summary except in the chat case above.  The
    # caller (handle_query) will add more context-specific prose based on
    # the numerical results, but we include whatever was generated here
    # for the casual/chat filter.
    resp = {
        "detected_intent":   detected_intent,
        "composite_intents": composite_intents,
        "intent_scores":     all_intents,
        "entities":          entities,
        "route":             route,
        "result":            routed_result,
        # Flat summary map for UI display
        "ui_summary": {
            "Ticker":     entities.get("ticker"),
            "Qty":        entities.get("qty"),
            "Cost_Basis": entities.get("cost_basis"),
            "Horizon_Days": entities.get("horizon"),
            "Root_Verb":  entities.get("root_verb"),
            "AI_Intent":  detected_intent,
            "Route":      route,
        },
    }
    # if the early chat filter kicked in above, leave its human_summary
    if "human_summary" in locals() and resp["route"] == "chat":
        resp["human_summary"] = (
            "I'm a financial AI. I can help you analyze stocks, review your portfolio,"
            " or check market trends. What ticker would you like to look at?"
        )
    return resp
