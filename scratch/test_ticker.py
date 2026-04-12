import yfinance as yf
ticker = "TATAMOTORS.NS"
try:
    stock = yf.Ticker(ticker)
    hist = stock.history(period="5d")
    print(f"History for {ticker}:")
    print(hist)
    if hist.empty:
        print("History is empty.")
    info = stock.info
    print(f"Short name: {info.get('shortName')}")
except Exception as e:
    print(f"Error: {e}")
