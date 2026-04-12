"""
InsightFlow — query_parser.py
==============================
Natural language query parser for the /api/query endpoint (Phase 8 → Phase 18).

Uses spaCy en_core_web_sm for NER + custom regex patterns + a Semantic Intent
Mapper that returns a Confidence Interval for each parsed query.

Phase 18: Deep NLU upgrade — fuzzy company matching, 150+ company map,
conversational intent detection, and lowercase-aware ticker extraction.
"""

import re
import logging
from difflib import SequenceMatcher

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
    # ── US Mega-Caps ──────────────────────────────────────────────────────────
    "APPLE": "AAPL",       "APLE": "AAPL",        "APPL": "AAPL",
    "MICROSOFT": "MSFT",   "MSFT": "MSFT",        "MICRO SOFT": "MSFT",
    "GOOGLE": "GOOGL",     "GOOGL": "GOOGL",      "GOOG": "GOOGL",
    "ALPHABET": "GOOGL",
    "AMAZON": "AMZN",      "AMAZN": "AMZN",       "AMZON": "AMZN",
    "TESLA": "TSLA",       "TESLE": "TSLA",       "TESLAA": "TSLA",
    "NVIDIA": "NVDA",      "NVIDEA": "NVDA",      "NVDIA": "NVDA",       "JENSEN": "NVDA",
    "META": "META",        "META PLATFORMS": "META",
    "FACEBOOK": "META",    "FB": "META",          "INSTAGRAM": "META",   "WHATSAPP": "META",
    "NETFLIX": "NFLX",     "NETFLEX": "NFLX",
    # ── US Large-Caps ────────────────────────────────────────────────────────
    "AMD": "AMD",          "ADVANCED MICRO": "AMD",
    "INTEL": "INTC",       "INTELL": "INTC",
    "SALESFORCE": "CRM",   "CRM": "CRM",
    "ORACLE": "ORCL",
    "ADOBE": "ADBE",
    "UBER": "UBER",
    "AIRBNB": "ABNB",
    "PAYPAL": "PYPL",      "PAY PAL": "PYPL",
    "SHOPIFY": "SHOP",
    "SNOWFLAKE": "SNOW",
    "PALANTIR": "PLTR",
    "COINBASE": "COIN",
    "SPOTIFY": "SPOT",
    "SNAP": "SNAP",        "SNAPCHAT": "SNAP",
    "PINTEREST": "PINS",
    "BLOCK": "SQ",         "SQUARE": "SQ",
    "ROKU": "ROKU",
    "ZOOM": "ZM",
    "DISNEY": "DIS",       "WALT DISNEY": "DIS",
    "WALMART": "WMT",
    "COSTCO": "COST",
    "NIKE": "NKE",
    "STARBUCKS": "SBUX",
    "MCDONALDS": "MCD",    "MCDONALD'S": "MCD",   "MC DONALDS": "MCD",
    "COCA COLA": "KO",     "COKE": "KO",          "COCACOLA": "KO",
    "PEPSI": "PEP",        "PEPSICO": "PEP",
    "JOHNSON": "JNJ",      "J&J": "JNJ",          "JOHNSON AND JOHNSON": "JNJ",
    "BERKSHIRE": "BRK-B",  "BUFFETT": "BRK-B",    "WARREN BUFFETT": "BRK-B",
    "JP MORGAN": "JPM",    "JPMORGAN": "JPM",     "CHASE": "JPM",
    "GOLDMAN": "GS",       "GOLDMAN SACHS": "GS",
    "VISA": "V",
    "MASTERCARD": "MA",
    "BOEING": "BA",
    "LOCKHEED": "LMT",     "LOCKHEED MARTIN": "LMT",
    "RAYTHEON": "RTX",
    "EXXON": "XOM",        "EXXON MOBIL": "XOM",
    "CHEVRON": "CVX",
    "MODERNA": "MRNA",
    "PFIZER": "PFE",
    "ALIBABA": "BABA",
    "TSMC": "TSM",         "TAIWAN SEMI": "TSM",
    "SAMSUNG": "005930.KS",
    "SONY": "SONY",
    "TOYOTA": "TM",
    "RIVIAN": "RIVN",
    "LUCID": "LCID",
    "NIO": "NIO",
    "CROWDSTRIKE": "CRWD",
    "DATADOG": "DDOG",
    "TWILIO": "TWLO",
    "CLOUDFLARE": "NET",
    "ROBINHOOD": "HOOD",
    "SOFI": "SOFI",
    "DRAFTKINGS": "DKNG",
    # ── Indian Market (NSE) ──────────────────────────────────────────────────
    "RELIANCE": "RELIANCE.NS",   "RELIANCE INDUSTRIES": "RELIANCE.NS",   "RIL": "RELIANCE.NS",
    "TCS": "TCS.NS",             "TATA CONSULTANCY": "TCS.NS",
    "INFOSYS": "INFY.NS",        "INFY": "INFY.NS",
    "HDFC": "HDFCBANK.NS",       "HDFC BANK": "HDFCBANK.NS",
    "ICICI": "ICICIBANK.NS",     "ICICI BANK": "ICICIBANK.NS",
    "TATA": "TATAMOTORS.NS",     "TATA MOTORS": "TATAMOTORS.NS",
    "TATA STEEL": "TATASTEEL.NS",
    "WIPRO": "WIPRO.NS",
    "HCL": "HCLTECH.NS",         "HCL TECH": "HCLTECH.NS",
    "BAJAJ": "BAJFINANCE.NS",    "BAJAJ FINANCE": "BAJFINANCE.NS",
    "KOTAK": "KOTAKBANK.NS",     "KOTAK BANK": "KOTAKBANK.NS",
    "SBI": "SBIN.NS",            "STATE BANK": "SBIN.NS",
    "MARUTI": "MARUTI.NS",       "MARUTI SUZUKI": "MARUTI.NS",
    "BHARTI": "BHARTIARTL.NS",   "AIRTEL": "BHARTIARTL.NS",
    "ZOMATO": "ZOMATO.NS",
    "SWIGGY": "SWIGGY.NS",
    "PAYTM": "PAYTM.NS",         "ONE97": "PAYTM.NS",
    "ADANI": "ADANIENT.NS",      "ADANI ENTERPRISES": "ADANIENT.NS",
    "ADANI GREEN": "ADANIGREEN.NS",
    "ADANI PORTS": "ADANIPORTS.NS",
    "MAHINDRA": "M&M.NS",        "M&M": "M&M.NS",
    "ITC": "ITC.NS",
    "ONGC": "ONGC.NS",
    "NTPC": "NTPC.NS",
    "POWERGRID": "POWERGRID.NS", "POWER GRID": "POWERGRID.NS",
    "SUNPHARMA": "SUNPHARMA.NS", "SUN PHARMA": "SUNPHARMA.NS",
    "TITAN": "TITAN.NS",
    "ASIAN PAINTS": "ASIANPAINT.NS",
    "ULTRATECH": "ULTRACEMCO.NS",
    "LARSEN": "LT.NS",           "L&T": "LT.NS",    "LARSEN AND TOUBRO": "LT.NS",
    "HINDALCO": "HINDALCO.NS",
    "JSWSTEEL": "JSWSTEEL.NS",   "JSW STEEL": "JSWSTEEL.NS",
    "VEDANTA": "VEDL.NS",
    # ── Crypto ───────────────────────────────────────────────────────────────
    "BITCOIN": "BTC-USD",    "BTC": "BTC-USD",
    "ETHEREUM": "ETH-USD",   "ETH": "ETH-USD",    "ETHER": "ETH-USD",
    "SOLANA": "SOL-USD",     "SOL": "SOL-USD",
    "CARDANO": "ADA-USD",    "ADA": "ADA-USD",
    "RIPPLE": "XRP-USD",     "XRP": "XRP-USD",
    "DOGECOIN": "DOGE-USD",  "DOGE": "DOGE-USD",
    "POLYGON": "MATIC-USD",  "MATIC": "MATIC-USD",
    "POLKADOT": "DOT-USD",   "DOT": "DOT-USD",
    "CHAINLINK": "LINK-USD", "LINK": "LINK-USD",
    "AVALANCHE": "AVAX-USD", "AVAX": "AVAX-USD",
    "LITECOIN": "LTC-USD",   "LTC": "LTC-USD",
    "SHIBA": "SHIB-USD",     "SHIBA INU": "SHIB-USD",
    "BINANCE COIN": "BNB-USD", "BNB": "BNB-USD",
    # ── ETFs / Indices ───────────────────────────────────────────────────────
    "S&P 500": "SPY",        "S&P": "SPY",         "SNP 500": "SPY",     "SP500": "SPY",
    "NASDAQ": "QQQ",         "NSDQ": "QQQ",
    "DOW JONES": "DIA",      "DOW": "DIA",
    "NIFTY": "^NSEI",        "NIFTY 50": "^NSEI",
    "SENSEX": "^BSESN",
    "GOLD": "GC=F",
    "SILVER": "SI=F",
    "CRUDE OIL": "CL=F",     "OIL": "CL=F",
}

INTENT_MAP = {
    "buy":          [
        "buy", "purchase", "acquire", "long", "entry", "enter", "add more", "accumulate",
        "good time to buy", "should i buy", "should i get", "should i invest",
        "invest in", "investing in", "pick up", "pick up some", "go long",
        "is it worth buying", "start a position", "enter a position", "open a position",
        "would you buy", "is .* a buy", "time to buy", "worth buying",
        "get into", "get some", "load up", "scoop up", "grab some",
        "put money in", "put money into", "thinking of buying", "thinking about buying",
        "want to buy", "wanna buy", "planning to buy",
    ],
    "sell":         [
        "sell", "exit", "when.*sell", "book.*profit", "take.*profit", "short", "dump", "offload",
        "cash out", "close my position", "close position", "time to exit", "time to sell",
        "let go", "get rid of", "should i sell", "is it time to sell",
        "thinking of selling", "thinking about selling", "want to sell",
        "lock in.*gains", "lock.*profit", "cut.*loss", "cut my losses",
        "stop loss", "bail out", "liquidate", "unload",
    ],
    "hold":         [
        "hold", "keep", "stay", "wait", "maintain",
        "should i hold", "keep holding", "sit tight", "ride it out",
        "stay invested", "stay in", "is it safe to hold", "worth holding",
        "continue holding", "don't sell", "keep my shares",
        "patient", "diamond hands",
    ],
    "analyse":      [
        "analyse", "analyze", "check", "look at", "evaluate", "assess",
        "tell me about", "what.*think", "describe", "overview", "what is", "how is",
        "status", "thoughts on", "opinion on", "review", "deep dive",
        "what do you think", "how does .* look", "how.*look", "how about",
        "give me.*analysis", "run.*analysis", "break.*down", "breakdown",
        "insight", "insights on", "info on", "information on",
        "details on", "what can you tell me", "what's up with", "whats up with",
        "report on", "summary of", "summarize", "quick look",
    ],
    "price_target": [
        "target", "hit", "reach", "price target", "go to", "how high", "upside", "potential",
        "where.*headed", "where is it going", "where will it go", "how far",
        "what.*target", "fair value", "intrinsic value", "valued at",
        "ceiling", "top out", "peak",
    ],
    "compare":      [
        "compare", "versus", "vs", "better than", "which is better", "difference between",
        "or", ".* vs .*", ".* versus .*", "compared to", "pick between",
        "which one", "which should i", "head to head", "matchup",
        ".* over .*", "prefer",
    ],
    "forecast":     [
        "forecast", "outlook", "projection", "predict", "5.day", "week", "next month",
        "what will happen", "what's going to happen", "whats going to happen",
        "where.*going", "future", "going up", "going down", "go up", "go down",
        "will it rise", "will it fall", "will it crash", "will it moon",
        "next week", "next month", "tomorrow", "this week",
        "short term", "long term", "medium term",
        "expected", "expectation", "prognosis",
    ],
    "reasoning":    [
        "why", "reason", "cause", "what happened", "explain", "behind", "dip", "surge",
        "drop", "pump", "rally", "crash", "tank", "moon",
        "what's going on", "whats going on", "what is happening",
        "how come", "what's driving", "whats driving", "what caused",
        "why did", "why is", "why has", "what made",
        "what's behind", "whats behind", "what's wrong with",
        "news about", "any news", "latest news", "what happened to",
        "fell", "spiked", "jumped", "plunged", "soared", "tumbled", "skyrocketed",
    ],
}

# ─── Phase 8/18: Semantic Boosters ────────────────────────────────────────────
# Each entry adds weight (+points) to the existing intent score when present in text.
# This shifts the confidence interval from a binary yes/no to a graduated scale.
SEMANTIC_BOOSTERS = {
    # Contextual certainty boosters (raise confidence)
    "considering":         8,
    "given":               7,
    "based on":            9,
    "in light of":         8,
    "taking into account": 10,
    "analysis shows":      10,
    "data indicates":      10,
    "technically":         7,
    "fundamentally":       7,
    "clearly":             6,
    "strong signal":       12,
    "confirmed":           12,
    # Conversational confidence boosters (Phase 18)
    "i think":             5,
    "i believe":           6,
    "i'm confident":       8,
    "feeling bullish":     10,
    "feeling bearish":     10,
    "looks promising":     7,
    "looks good":          6,
    "looks bad":           6,
    "looks like":          4,
    "seems like":          4,
    "in my opinion":       5,
    "heard that":          3,
    "read that":           4,
    "saw that":            3,
    "everyone is saying":  3,
    "experts say":         7,
    "analyst":             6,
    "analysts":            6,
    "according to":        7,
    "reportedly":          5,
    # Uncertainty reducers (lower confidence when present)
    "maybe":              -8,
    "perhaps":            -8,
    "not sure":           -15,
    "confused":           -12,
    "unsure":             -12,
    "risky":              -6,
    "volatile":           -5,
    "mixed":              -7,
    "i don't know":       -10,
    "no idea":            -12,
    "hard to say":        -8,
    "who knows":          -10,
    "unpredictable":      -7,
    "uncertain":          -8,
    # Market context boosters
    "dip":                5,
    "pullback":           6,
    "correction":         6,
    "breakout":           8,
    "momentum":           7,
    "trend":              5,
    "support":            6,
    "resistance":         6,
    "oversold":           8,
    "overbought":         8,
    "all time high":      7,
    "ath":                7,
    "52 week high":       6,
    "52 week low":        6,
    "bull run":           8,
    "bear market":        8,
    "rally":              6,
    "crash":              8,
    "moon":               5,
    "bottom":             6,
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


# ─── Phase 18: Fuzzy company name matching ────────────────────────────────────

def _fuzzy_match_company(word: str, threshold: float = 0.80) -> str | None:
    """Try to match a word/phrase to a known company name using SequenceMatcher.
    Returns the mapped ticker symbol if similarity >= threshold, else None.
    Only checks against COMPANY_TICKER_MAP keys.
    """
    word_upper = word.upper().strip()
    if len(word_upper) < 3:
        return None

    best_match = None
    best_score = 0.0

    for company in COMPANY_TICKER_MAP:
        score = SequenceMatcher(None, word_upper, company).ratio()
        if score > best_score and score >= threshold:
            best_score = score
            best_match = company

    if best_match:
        return COMPANY_TICKER_MAP[best_match]
    return None


def _extract_tickers(text: str, doc) -> tuple[list[str], bool]:
    r"""Return list of tickers found in *text* and a flag if a fallback search was used.

    Phase 18 upgraded extraction pipeline:

    0. **Company name scan (case-insensitive)** — scan every word/phrase
       in the text against COMPANY_TICKER_MAP. This lets natural language
       like "what about apple" or "should I invest in nvidia" work.
    1. Look for **explicit uppercase tickers** using the regex
       ``\b[A-Z]{1,5}(?:\.[A-Z]{2,4})?\b``.
    2. Otherwise run the previous heuristics (pattern list, spaCy entities,
       company map, etc.) to see if we can still guess a ticker.
    3. **Fuzzy matching** — if no match yet, try fuzzy matching each word
       against the company map to catch misspellings.
    4. If after all of that we still have *no* ticker, attempt to pull the
       primary noun phrase from the text, call the Yahoo Finance global search
       API with that phrase and, if the service responds, treat the returned
       ``symbol`` as the extracted ticker.
    """
    found: list[str] = []
    fallback_used = False

    # Expanded stop/noise words — never treat as tickers
    ignore_list = {
        "I", "A", "U", "ME", "WE", "IT", "IS", "ON", "OF", "AT", "TO", "DO", "AM",
        "THE", "AN", "AND", "FOR", "ARE", "YOU", "HOW", "WHY", "WHAT", "BUY", "SELL",
        "MY", "IN", "OR", "IF", "SO", "NO", "UP", "GO", "BE", "BY", "HE", "SHE",
        "HIS", "HER", "HAS", "HAD", "DID", "CAN", "MAY", "NOW", "ANY", "WAY",
        "ALL", "OUR", "OUT", "OWN", "PUT", "SAY", "SEE", "SET", "TWO", "USE",
        "WAS", "WHO", "WILL", "WHEN", "THAT", "THIS", "THEM", "THEN", "THAN",
        "ALSO", "JUST", "LIKE", "SOME", "TIME", "VERY", "BEEN", "HAVE", "FROM",
        "THEY", "BEEN", "SAID", "EACH", "MAKE", "WANT", "GIVE", "MOST", "FIND",
        "HERE", "KNOW", "TAKE", "COME", "COULD", "GOOD", "MUCH", "SHOULD",
        "ABOUT", "THINK", "STILL", "GOING", "LOOKING", "RIGHT",
        "HOLD", "KEEP", "EXIT", "LONG", "SHORT", "STOCK", "STOCKS", "SHARE",
        "SHARES", "MARKET", "PRICE", "TARGET", "WHEN", "WOULD", "WHAT",
        "TELL", "GIVE", "SHOW", "HELP", "PLEASE", "THANKS",
    }

    # ── step 0 – case-insensitive company name scan (Phase 18) ──────────────
    # This is the key improvement: scan for company names in natural text
    # like "should I invest in apple" or "what about nvidia stock"
    text_upper = text.upper()
    # Sort by key length descending so multi-word names match first
    for company in sorted(COMPANY_TICKER_MAP.keys(), key=len, reverse=True):
        pattern = rf'\b{re.escape(company)}\b'
        if re.search(pattern, text_upper) and COMPANY_TICKER_MAP[company] not in found:
            found.append(COMPANY_TICKER_MAP[company])
    if found:
        return found, False

    # ── step 1 – explicit uppercase tickers ─────────────────────────────────
    for m in re.finditer(r"\b[A-Z]{2,5}(?:\.[A-Z]{2,4})?\b", text):
        candidate = m.group(0).upper()
        if candidate not in found and candidate not in ignore_list:
            found.append(candidate)
    if found:
        return found, False

    # ── step 2 – original heuristic logic ───────────────────────────────────
    for pattern in TICKER_PATTERNS:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for m in matches:
            candidate = m.group(0).upper()
            if candidate not in found and candidate not in ignore_list:
                found.append(candidate)

    if hasattr(doc, 'ents'):
        for ent in doc.ents:
            if ent.label_ in ("ORG", "PRODUCT", "PERSON", "GPE"):
                candidate = ent.text.upper().strip()
                mapped = COMPANY_TICKER_MAP.get(candidate)
                if mapped and mapped not in found:
                    found.append(mapped)
                elif re.match(r'^[A-Z]{2,10}$', candidate) and candidate not in found and candidate not in ignore_list:
                    found.append(candidate)

    matches = re.finditer(r'\b([A-Z]{2,6})\b', text)
    for m in matches:
        candidate = m.group(1)
        if candidate not in found and candidate not in ignore_list:
            found.append(candidate)

    # final cleanup
    found = [t for t in found if t.upper() not in ignore_list]

    if found:
        return found, False

    # ── step 3 – fuzzy matching against known companies (Phase 18) ──────────
    # Extract meaningful words (3+ chars, not stopwords) and try fuzzy match
    words = re.findall(r'\b[a-zA-Z]{3,}\b', text)
    for word in words:
        if word.upper() in ignore_list:
            continue
        ticker = _fuzzy_match_company(word)
        if ticker and ticker not in found:
            found.append(ticker)
            break  # take first fuzzy match

    if found:
        return found, False

    # ── step 4 – fallback via Yahoo if still empty ──────────────────────────
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
            m = re.search(r"\b(?:about|on|for|in|into)\s+(.+)", text, re.IGNORECASE)
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
    """Phase 18: Score-based intent detection instead of first-match.
    Each matching keyword adds a point. The intent with the most matches wins.
    This prevents short generic matches from overshadowing more specific ones.
    """
    text_lower = text.lower()
    scores: dict[str, int] = {}

    for intent, keywords in INTENT_MAP.items():
        score = 0
        for kw in keywords:
            try:
                if re.search(rf'\b{kw}\b' if not any(c in kw for c in '.*+[]()') else kw, text_lower):
                    # Longer keywords are more specific → worth more
                    score += max(1, len(kw.split()))
            except re.error:
                if kw in text_lower:
                    score += 1
        if score > 0:
            scores[intent] = score

    if not scores:
        return "analyse"

    # Return the highest-scoring intent
    return max(scores, key=scores.get)


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
    # 2. Clean against pronouns and common stopwords (already done inside _extract_tickers Phase 18)
    valid_tickers = raw_tickers
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
