# InsightFlow 🌊

**Hyper-Realistic AI Financial Intelligence & Portfolio Management**

InsightFlow has evolved into a premium, real-time institutional-grade quantitative tracking and AI-driven analysis platform. It merges deep machine learning (XGBoost Ensembles), NLP (FinBERT + Llama3 RAG), and audio-emotion analysis (wav2vec2) with a custom glassmorphism application to provide traders and investors with an "unfair advantage" in market intelligence.

---

## 🚀 Key Features

### 🧠 The Institutional Quant Brain
InsightFlow doesn't just calculate technical indicators. It builds a robust **Voting Classifier Ensemble** (XGBoost, RandomForest, GradientBoosting) trained dynamically on historical data. To power this, it scrapes and engineers:
- **Macro Volatility**: `^VIX` indices integration.
- **Corporate Fundamentals**: Real-time `P/E Ratio` and `Debt-to-Equity`.
- **Options Flow**: Live approximation of the options chain `Put/Call Ratio`.

### 🤖 LLM RAG Conversational AI
The InsightFlow engine integrates directly with **Ollama** running locally. When you ask a question it computes all the metrics, fetches live news, and uses **Llama3** (Retrieval-Augmented Generation) to output tailored, human-readable structural reasoning behind every quantitative decision.

### 🧪 Strategy Lab Backtester
Prove your edge before risking capital. Run a hyper-fast 3-year walk-forward backtest perfectly simulating the AI's real-world behavior to map an interactive $10,000 Equity Curve, complete with Win Rates and a comparative analysis against holding the asset flat.

### 🏛️ Portfolio Studio
A high-fidelity dashboard for managing your mock and active holdings.
- **Live Sync**: Real-time asset valuation and P&L tracking.
- **AI Guardian**: Proactive alerts when market conditions shift for your specific assets.

---

## 🛠️ Technology Stack

### Frontend
- **Framework**: React.js + Vite
- **Styling**: Tailwind CSS v4 (Glassmorphism & Neon Glows)
- **Visualization**: Recharts + 3D Three.js backgrounds

### Backend
- **Framework**: FastAPI (Async Python High Performance)
- **AI/ML Layer**: XGBoost Ensemble + Scikit-Learn
- **Generative NLP**: Llama3 RAG via Ollama, FinBERT Sentiment, BART Intent
- **Audio Intelligence**: wav2vec2 Earnings Call Emotion
- **Databases**: MongoDB (Primary) + SQLite (Locally cached datasets)

---

## 🛠️ Installation & Setup

### 1. Prerequisites
- Node.js (v18+)
- Python (3.11+)
- Ollama (installed locally with `llama3` pulled)
- MongoDB Compass (running locally on port `27017`)

### 2. Backend Setup
```bash
cd backend
python -m venv venv
# Activate virtual environment
source venv/bin/scripts/activate  # macOS/Linux
.\venv\Scripts\activate           # Windows

# Install all dependencies including XGBoost
pip install -r requirements.txt

# Start Server
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
- **Backend**: MongoDB URI, JWT Secret keys, SMTP configurations.
- **Frontend**: Localhost API base URLs.

---

## 📄 License
This project is licensed under the MIT License.

*Crafted for the future of quantized trading.*
# Insightflow
# Insightflow
