
import requests

url = "http://localhost:8000/api/portfolio/buy"
headers = {
    "Authorization": "Bearer fake_token",
    "Content-Type": "application/json",
    "Origin": "http://localhost:5173"
}
payload = {
    "ticker": "AAPL",
    "quantity": 10.0,
    "buy_price": 150.0,
    "sector": "Tech"
}

try:
    response = requests.post(url, json=payload, headers=headers)
    print(f"Status: {response.status_code}")
    print(f"Body: {response.text}")
    print(f"Headers: {response.headers}")
except Exception as e:
    print(f"Error: {e}")
