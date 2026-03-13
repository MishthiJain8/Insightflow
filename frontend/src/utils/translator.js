export const simplify_finance_terms = (text) => {
    if (!text) return text;

    // A robust mapping of technical jargon to simplified analogies
    const dictionary = {
        // Technical Indicators
        "RSI-14 at \\d+ \\(Overbought\\)": "Market Overheating (Prices have risen too fast and might cool down)",
        "RSI-14 at \\d+ \\(Oversold\\)": "Market Undervalued (Prices have dropped too fast and might bounce back)",
        "MACD Bullish Crossover": "Positive Momentum Shift (Buyers are taking control)",
        "MACD Bearish Crossover": "Negative Momentum Shift (Sellers are taking control)",
        "Double Bottom": "Strong Support Level Reached (Price hit a floor twice and bounced back)",
        "Double Top": "Strong Resistance Level Reached (Price hit a ceiling twice and fell back)",
        "Head & Shoulders": "Trend Reversal Warning (A classic pattern suggesting the current trend is ending)",
        "Bull Flag": "Brief Pause Before Rising (A small dip in a strong upward trend)",
        "Bear Flag": "Brief Pause Before Falling (A small bounce in a strong downward trend)",

        // Sentiment 
        "Bullish": "Optimistic",
        "Bearish": "Pessimistic",
        "Neutral": "Steady / Undecided",

        // General terms
        "Technical Trigger": "Market Signal",
        "Acoustic Shift": "Vocal Tone Analysis",
        "False Breakout": "Fake Move (The price looked like it was breaking through, but it was a trap)",
        "False Breakdown": "Fake Drop (The price looked like it was collapsing, but it recovered quickly)"
    };

    let simplifiedText = text;

    // Apply regex-based replacements for patterns with digits
    for (const [jargon, simple] of Object.entries(dictionary)) {
        const regex = new RegExp(jargon, 'gi');
        simplifiedText = simplifiedText.replace(regex, simple);
    }

    return simplifiedText;
};
