"""
InsightFlow — query_parser.py
==============================
Natural language query parser for the /api/query endpoint (Phase 8).

Uses spaCy en_core_web_sm for NER + custom regex patterns + a Semantic Intent
Mapper that returns a Confidence Interval for each parsed query.
"""

import re
import logging

logger = logging.getLogger("query_parser")

# ─── spaCy lazy load ──────────────────────────────────────────────────────────
_nlp = None

def _get_nlp():
    global _nlp
    if _nlp is None:
        import spacy
        _nlp = spacy.load("en_core_web_sm")
    return _nlp


# ─── Known ticker patterns ────────────────────────────────────────────────────
TICKER_PATTERNS = [
    r'\b([A-Z]{1,15})(?:\.NS|\.BO|\.L|\.HK|\.T)\b',
    r'\b(BTC|ETH|BNB|SOL|ADA|XRP|DOGE|DOT)-USD\b',
    r'\b(BTC|ETH|BNB|SOL|ADA|XRP|DOGE|DOT)-INR\b',
    r'\b(AAPL|MSFT|GOOGL|GOOG|AMZN|META|TSLA|NVDA|AMD|NFLX|CRM|BABA|TSM)\b',
    r'\b([A-Z]{2,5})\b(?=\s+(?:stock|shares|equity|options))',
]

COMPANY_TICKER_MAP = {
    "APPLE": "AAPL",
    "MICROSOFT": "MSFT",
    "GOOGLE": "GOOGL",
    "ALPHABET": "GOOGL",
    "AMAZON": "AMZN",
    "TESLA": "TSLA",
    "NVIDIA": "NVDA",
    "META": "META",
    "FACEBOOK": "META",
    "NETFLIX": "NFLX",
    "RELIANCE": "RELIANCE.NS",
    "TCS": "TCS.NS",
    "INFOSYS": "INFY.NS",
    "HDFC": "HDFCBANK.NS",
    "TATA": "TATAMOTORS.NS"
}

INTENT_MAP = {
    "buy":          ["buy", "purchase", "acquire", "long", "entry", "enter", "add more", "accumulate", "good time to buy"],
    "sell":         ["sell", "exit", "when.*sell", "book.*profit", "take.*profit", "short", "dump", "offload"],
    "hold":         ["hold", "keep", "stay", "wait", "maintain"],
    "analyse":      ["analyse", "analyze", "check", "look at", "evaluate", "assess", "tell me about", "what.*think",
                     "describe", "overview", "what is", "how is", "status", "thoughts on"],
    "price_target": ["target", "hit", "reach", "price target", "go to", "how high", "upside", "potential"],
    "compare":      ["compare", "versus", "vs", "better than", "which is better", "difference between"],
    "forecast":     ["forecast", "outlook", "projection", "predict", "5.day", "week", "next month"],
    "reasoning":    ["why", "reason", "cause", "what happened", "explain", "behind", "dip", "surge", "drop", "pump"],
}

# ─── Phase 8: Semantic Boosters ────────────────────────────────────────────────
# Each entry adds weight (+points) to the existing intent score when present in text.
# This shifts the confidence interval from a binary yes/no to a graduated scale.
SEMANTIC_BOOSTERS = {
    # Contextual certainty boosters (raise confidence)
    "considering":      8,
    "given":            7,
    "based on":         9,
    "in light of":      8,
    "taking into account": 10,
    "analysis shows":   10,
    "data indicates":   10,
    "technically":      7,
    "fundamentally":    7,
    "clearly":          6,
    "strong signal":    12,
    "confirmed":        12,
    # Uncertainty reducers (lower confidence when present)
    "maybe":           -8,
    "perhaps":         -8,
    "not sure":        -15,
    "confused":        -12,
    "unsure":          -12,
    "risky":           -6,
    "volatile":        -5,
    "mixed":           -7,
    # Market context boosters
    "dip":              5,
    "pullback":         6,
    "correction":       6,
    "breakout":         8,
    "momentum":         7,
    "trend":            5,
    "support":          6,
    "resistance":       6,
    "oversold":         8,
    "overbought":       8,
}

CURRENCY_SYMBOLS = {
    "$":  "USD",
    "₹":  "INR",
    "€":  "EUR",
    "£":  "GBP",
    "¥":  "JPY",
    "Rs": "INR",
}


# ─── Phase 8: Semantic Intent Mapper ─────────────────────────────────────────

def _semantic_intent_score(text: str, base_intent: str) -> int:
    """
    Compute a confidence interval (0–100) based on:
    - Base confidence from whether a ticker was found and intent was clear (50 pts)
    - Semantic boosters/reducers derived from contextual language in the query

    Returns an integer 0–100.
    """
    text_lower = text.lower()

    # Base confidence: start at 50 (intent always inferred, ticker may or may not exist)
    confidence = 50

    # Bonus for having a primary intent match (not just default 'analyse')
    if base_intent != "analyse":
        confidence += 10

    # Apply any semantic boosters/reducers
    for phrase, weight in SEMANTIC_BOOSTERS.items():
        if phrase in text_lower:
            confidence += weight

    # Bonus points for longer, more specific queries (more context = more certainty)
    word_count = len(text.split())
    if word_count >= 10:
        confidence += 5
    if word_count >= 15:
        confidence += 5

    # Clamp to [30, 95] — we never claim absolute certainty or no confidence at all
    return max(30, min(95, confidence))


# ─── Entity extractors ────────────────────────────────────────────────────────

def _yahoo_search_symbol(query: str) -> str | None:
    """Return the first symbol from Yahoo Finance global search for the given query.
    Returns ``None`` on error or if no results.
    """
    import requests

    try:
        q = requests.utils.quote(query)
        # ask for a few results in case the top hit is not an equity
        url = f"https://query2.finance.yahoo.com/v1/finance/search?q={q}&quotesCount=5&newsCount=0"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        r = requests.get(url, headers=headers, timeout=5)
        r.raise_for_status()
        data = r.json()
        quotes = data.get("quotes", [])
        if quotes:
            return quotes[0].get("symbol")
    except Exception:
        logger.debug(f"Yahoo global search failed for '{query}'", exc_info=True)
    return None


def _extract_tickers(text: str, doc) -> tuple[list[str], bool]:
    r"""Return list of tickers found in *text* and a flag if a fallback search was used.

    The extraction now follows these steps:

    1. Look for **explicit uppercase tickers** using the regex
       ``\b[A-Z]{1,5}(?:\.[A-Z]{2,4})?\b``.  If any are found we return them
       immediately (no fallback).
    2. Otherwise run the previous heuristics (pattern list, spaCy entities,
       company map, etc.) to see if we can still guess a ticker.
    3. If after all of that we still have *no* ticker, attempt to pull the
       primary noun phrase from the text, call the Yahoo Finance global search
       API with that phrase and, if the service responds, treat the returned
       ``symbol`` as the extracted ticker.  ``fallback`` is set to True in that
       case so the caller can attribute the result in the terminal output.
    """
    found: list[str] = []
    fallback_used = False

    # step 1 – explicit uppercase tickers (require at least 2 letters to avoid pronouns)
    for m in re.finditer(r"\b[A-Z]{2,5}(?:\.[A-Z]{2,4})?\b", text):
        candidate = m.group(0).upper()
        if candidate not in found:
            found.append(candidate)
    if found:
        return found, False

    # step 2 – original heuristic logic
    for pattern in TICKER_PATTERNS:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for m in matches:
            candidate = m.group(0).upper()
            if candidate not in found:
                found.append(candidate)

    for ent in doc.ents:
        if ent.label_ in ("ORG", "PRODUCT", "PERSON", "GPE"):
            candidate = ent.text.upper().strip()
            mapped = COMPANY_TICKER_MAP.get(candidate)
            if mapped and mapped not in found:
                found.append(mapped)
            elif re.match(r'^[A-Z]{2,10}$', candidate) and candidate not in found:
                found.append(candidate)

    text_upper = text.upper()
    for company, ticker in COMPANY_TICKER_MAP.items():
        if re.search(rf'\b{company}\b', text_upper) and ticker not in found:
            found.append(ticker)

    matches = re.finditer(r'\b([A-Z]{2,6})\b', text)
    for m in matches:
        candidate = m.group(1)
        if candidate not in found and candidate not in ("THE", "AND", "FOR", "ARE", "YOU", "HOW", "WHY", "WHAT", "BUY", "SELL"):
            found.append(candidate)

    # final cleanup: drop pronoun-like tokens which sometimes sneak in as tickers
    ignore_list = {"I", "A", "U", "ME", "WE", "IT", "IS", "ON", "OF", "AT", "TO", "DO", "AM"}
    found = [t for t in found if t.upper() not in ignore_list]

    # step 3 – fallback via Yahoo if still empty
    if not found:
        # extract primary noun phrase
        phrase = None
        chunks = getattr(doc, 'noun_chunks', None)
        if chunks:
            for chunk in chunks:
                phrase = chunk.text
                break
        if not phrase:
            # simple heuristic when spaCy is unavailable: pull the portion
            # after common prepositions like "about", "on", "for".
            m = re.search(r"\b(?:about|on|for)\s+(.+)", text, re.IGNORECASE)
            if m:
                phrase = m.group(1)
            else:
                phrase = text
        phrase = phrase.strip(" ?.!\"'")
        symbol = _yahoo_search_symbol(phrase)
        if symbol:
            found.append(symbol)
            fallback_used = True

    return found, fallback_used


def _extract_quantity(text: str, doc) -> float | None:
    m = re.search(r'(\d+(?:\.\d+)?)\s*(?:shares?|units?|lots?|contracts?)', text, re.IGNORECASE)
    if m:
        return float(m.group(1))

    m = re.search(r'(?:bought|buy|sell|purchase|acquire)\s+(\d+(?:\.\d+)?)', text, re.IGNORECASE)
    if m:
        return float(m.group(1))

    for token in doc:
        if token.like_num and token.head.lemma_ in ("buy", "sell", "purchase", "hold"):
            try:
                return float(token.text.replace(",", ""))
            except ValueError:
                pass

    return None


def _extract_price(text: str) -> tuple[float | None, str]:
    for symbol, code in CURRENCY_SYMBOLS.items():
        esc = re.escape(symbol)
        m = re.search(rf'{esc}\s*(\d+(?:,\d{{3}})*(?:\.\d+)?)', text)
        if m:
            price_str = m.group(1).replace(",", "")
            return float(price_str), code

    m = re.search(r'(?:at|around|price\s+of|@)\s+(\d+(?:,\d{3})*(?:\.\d+)?)', text, re.IGNORECASE)
    if m:
        return float(m.group(1).replace(",", "")), "USD"

    return None, "USD"


def _extract_horizon(text: str) -> int:
    """
    Detect evaluation timeframes using dynamic regex.
    Supports any numeric multiplier and unit (days, weeks, months).
    Returns number of days (int). Default is 7.
    """
    text_lower = text.lower()

    # Written-number word map for common values
    WORD_NUMS = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
        "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
        "fifteen": 15, "twenty": 20, "thirty": 30,
    }

    def _num(token: str) -> int | None:
        """Parse both digit strings and word numbers."""
        try:
            return int(token)
        except ValueError:
            return WORD_NUMS.get(token.lower())

    # Build combined number pattern: digits or any word-number
    num_pat = r'(\d+|' + '|'.join(WORD_NUMS.keys()) + r')'

    # 1. Tomorrow / 1-day
    if "tomorrow" in text_lower:
        return 1
    m = re.search(r'\b1[- ]?day\b', text_lower)
    if m:
        return 1

    # 2. X days  (e.g., "4 days", "four days", "4-day", "next 3 days")
    m = re.search(rf'\b{num_pat}\s*[- ]?days?\b', text_lower)
    if m:
        val = _num(m.group(1))
        if val:
            return val

    # 3. X weeks  (e.g., "2 weeks", "two weeks", "next week")
    if "next week" in text_lower:
        return 7
    m = re.search(rf'\b{num_pat}\s*[- ]?weeks?\b', text_lower)
    if m:
        val = _num(m.group(1))
        if val:
            return val * 7

    # 4. X months  (e.g., "3 months", "one month", "next month")
    if "next month" in text_lower:
        return 30
    m = re.search(rf'\b{num_pat}\s*[- ]?months?\b', text_lower)
    if m:
        val = _num(m.group(1))
        if val:
            return val * 30

    return 7


def _extract_intent(text: str) -> str:
    text_lower = text.lower()
    for intent, keywords in INTENT_MAP.items():
        for kw in keywords:
            if re.search(kw, text_lower):
                return intent
    return "analyse"


def _infer_currency(ticker: str) -> str:
    if ticker.endswith((".NS", ".BO")):
        return "INR"
    if ticker.endswith(("-USD", "-USDT")):
        return "USD"
    if ticker.endswith((".L",)):
        return "GBP"
    return "USD"


# ─── Main parser ──────────────────────────────────────────────────────────────

def parse_query(text: str) -> dict:
    """
    Parse a natural language query and return a structured entity dict.
    Phase 8: Includes `confidence_interval` (0–100) computed by the Semantic Intent Mapper.

    Returns:
        {
          "raw":                 str,
          "ticker":              str | None,
          "tickers":             list[str],
          "quantity":            float | None,
          "price":               float | None,
          "currency":            str,
          "intent":              str,
          "confident":           bool,
          "confidence_interval": int,     ← NEW Phase 8
          "ticker_from_search":  bool,    # true when resolved via Yahoo global search fallback
        }
    """
    try:
        nlp = _get_nlp()
        doc = nlp(text)
    except Exception as e:
        logger.warning(f"spaCy load failed: {e} — using regex only")
        doc = None

    class _FakeDoc:
        ents  = []
        def __iter__(self): return iter([])

    if doc is None:
        doc = _FakeDoc()

    # 1. Gather raw ticker candidates from regex/ner
    raw_tickers, ticker_from_search = _extract_tickers(text, doc)
    # 2. Clean against pronouns and common stopwords
    ignore_words = {"I", "A", "U", "ME", "WE", "IT", "IS", "ON", "OF", "AT", "TO", "DO", "AM", "THE", "AN"}
    valid_tickers = [t for t in raw_tickers if t.upper() not in ignore_words]
    # 3. Select primary and use for output
    primary_ticker = valid_tickers[0] if valid_tickers else None
    ticker   = primary_ticker
    tickers  = valid_tickers
    quantity = _extract_quantity(text, doc)
    price, currency = _extract_price(text)

    if ticker and currency == "USD":
        currency = _infer_currency(ticker)

    intent = _extract_intent(text)
    horizon_days = _extract_horizon(text)

    confident = len(tickers) > 0

    # Phase 8: Compute confidence interval via Semantic Intent Mapper
    confidence_interval = _semantic_intent_score(text, intent)
    # If no ticker found at all, reduce confidence significantly
    if not confident:
        confidence_interval = max(30, confidence_interval - 20)

    return {
        "raw":                 text,
        "ticker":              ticker,
        "tickers":             tickers,
        "quantity":            quantity,
        "price":               price,
        "currency":            currency,
        "intent":              intent,
        "horizon_days":        horizon_days,
        "confident":           confident,
        "confidence_interval": confidence_interval,
        "ticker_from_search":  ticker_from_search,
    }
