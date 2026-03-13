import re

def simplify_finance(technical_text: str) -> str:
    """
    Translates complex financial and technical jargon into simple, relatable analogies
    for Beginner Mode.
    """
    if not technical_text:
        return technical_text

    # Dictionary-based mapping of technical jargon to simplified analogies
    dictionary = {
        # Core requested analogies
        r"RSI.*Overbought": "The stock is 'overheated.' Like a runner who sprinted too fast, it needs to slow down or stop soon.",
        r"RSI.*Oversold": "The stock is 'exhausted.' Like a runner who has caught their breath, it might be ready to sprint again.",
        r"Bearish MACD Crossover": "The stock's 'downward momentum' is winning. Imagine a car losing speed and starting to roll backward down a hill.",
        r"Bullish MACD Crossover": "The stock's 'upward momentum' is winning. Imagine a car accelerating smoothly up a hill.",
        r"High Volatility": "The stock is on a 'rollercoaster.' Expect big, fast ups and downs that might be scary for new investors.",
        r"Low P/E Ratio": "The stock is 'on sale.' You are paying less for every dollar the company actually makes.",
        r"MACD Bullish Crossover": "Positive Momentum Shift (Buyers are taking control)",
        r"MACD Bearish Crossover": "Negative Momentum Shift (Sellers are taking control)",
        
        # Technical Patterns
        r"Double Bottom": "Strong Support Level Reached (Price hit a floor twice and bounced back)",
        r"Double Top": "Strong Resistance Level Reached (Price hit a ceiling twice and fell back)",
        r"Head & Shoulders": "Trend Reversal Warning (A classic pattern suggesting the current trend is ending)",
        r"Bull Flag": "Brief Pause Before Rising (A small dip in a strong upward trend)",
        r"Bear Flag": "Brief Pause Before Falling (A small bounce in a strong downward trend)",
        r"False Breakout": "Fake Move (The price looked like it was breaking through, but it was a trap)",
        r"False Breakdown": "Fake Drop (The price looked like it was collapsing, but it recovered quickly)",
        
        # Sentiment & Meta formatting
        r"Bullish": "Optimistic",
        r"Bearish": "Pessimistic",
        r"Neutral": "Steady / Undecided",
        r"Technical Trigger": "Market Signal",
        r"Acoustic Shift": "Vocal Tone Analysis",
    }

    simplified_text = technical_text

    # Apply regex-based replacements
    for jargon, simple in dictionary.items():
        # Case insensitive replacement
        simplified_text = re.sub(jargon, simple, simplified_text, flags=re.IGNORECASE)

    return simplified_text
