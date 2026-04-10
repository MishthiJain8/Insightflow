# InsightFlow 🌊

**Hyper-Realistic AI Financial Intelligence & Portfolio Management**

InsightFlow is a premium, real-time financial tracking and AI-driven analysis platform. It combines deep machine learning (FinBERT) with a cinematic user interface to provide traders and investors with an "unfair advantage" in market intelligence.

---

## 🚀 Key Features

### 🧠 The Quant Brain
Driven by a custom NLP engine and FinBERT sentiment analysis, InsightFlow doesn't just track prices—it understands the *why*. It parses news, sentiment, and technical data to provide actionable Buy/Hold/Sell signals with confidence intervals.

### 🏛️ Portfolio Studio
A high-fidelity dashboard for managing your mock and active holdings.
- **Live Sync**: Real-time asset valuation and P&L tracking.
- **Sector Intelligence**: Visual distribution analysis of your market exposure.
- **AI Guardian**: Proactive alerts when market conditions shift for your specific assets.

### 📟 Terminal Interface
A JetBrains Mono-powered command terminal for natural language queries.
- Ask questions like: *"I bought 10 shares of AAPL at $150. When should I sell?"*
- View deep diagnostics and payload proofs for every AI response.

---

## 🛠️ Technology Stack

### Frontend
- **Framework**: React.js + Vite
- **Styling**: Tailwind CSS v4 (Modern Aesthetics)
- **3D/Glow**: Custom Glassmorphism UI with Motion effects
- **Visualization**: Recharts + Lucide Icons

### Backend
- **Framework**: FastAPI (High Performance)
- **AI/ML**: FinBERT (Financial Sentiment) + NLP Engine
- **Database**: SQLite (Predictions & Audit Logs)
- **Real-time**: Custom Heartbeat & Asset Intelligence layers

---

## 🛠️ Installation & Setup

### 1. Prerequisites
- Node.js (v18+)
- Python (3.9+)

### 2. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/scripts/activate  # Windows: .\venv\Scripts\activate
pip install -r requirements.txt
python main.py
uvicorn main:app --reload
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

---

## 🔐 Security & Configuration
Ensure you configure your `.env` files in both `backend/` and `frontend/` directories.
- **Backend**: API keys, database paths, and model configurations.
- **Frontend**: API base URLs and authentication settings.

---

## 📄 License
This project is licensed under the MIT License.

*Crafted for the future of quantized trading.*
