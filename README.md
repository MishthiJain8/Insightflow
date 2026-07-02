# InsightFlow

AI-powered financial intelligence for market research, portfolio tracking, and explainable trading signals.

**Live demo:** [https://insightflow-tau.vercel.app](https://insightflow-tau.vercel.app)

InsightFlow is a full-stack financial analytics app built with a React/Vite frontend and a FastAPI backend. It combines market data, technical indicators, portfolio tools, AI-assisted summaries, and a clean dashboard experience for investors who want faster research workflows.

> Current hosted version is a public demo. Some heavyweight AI/ML features are intentionally simplified on the free deployment so the app stays fast and available.

## Features

- **Market intelligence dashboard** with asset lookup, charts, and signal summaries.
- **AI-style prediction workflow** using technical indicators and backend analysis.
- **Portfolio studio** for tracking holdings, valuations, and market movement.
- **Strategy/backtesting tools** for exploring trading ideas before risking capital.
- **Authentication flow** with demo OTP support for the public hosted version.
- **FastAPI backend** designed to support real database, email, and ML upgrades.
- **Modern React frontend** with responsive UI, financial dashboards, and visualizations.

## Tech Stack

**Frontend**

- React
- Vite
- Tailwind CSS
- Recharts
- Three.js

**Backend**

- FastAPI
- Python
- MongoDB-compatible storage
- yfinance / market-data integrations
- Optional ML modules for local or upgraded backend deployments

## Live Deployment

- Frontend: [https://insightflow-tau.vercel.app](https://insightflow-tau.vercel.app)
- Backend health check: [https://insightflow-api-git-main-mishthi-jains-projects.vercel.app/api/health](https://insightflow-api-git-main-mishthi-jains-projects.vercel.app/api/health)

The demo backend is deployed in a lightweight mode. For production, connect a persistent MongoDB database, configure a real email provider, and run the heavier ML stack on a paid CPU backend.

## Local Setup

### Prerequisites

- Node.js 18+
- Python 3.11+
- MongoDB, or a MongoDB Atlas connection string

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Create `.env` files from the included examples and set the API URL, database URI, JWT secret, and email credentials as needed.

## Production Roadmap

- Add MongoDB Atlas for persistent user data.
- Configure real email delivery with Resend, Brevo, SendGrid, or Gmail app password.
- Move the backend to a paid CPU host when traffic grows.
- Restore heavier ML dependencies for advanced prediction and backtesting.
- Add subscription billing with Stripe or Razorpay.
- Add rate limits, monitoring, and clearer investment-risk disclaimers.

## Disclaimer

InsightFlow is for educational and research purposes only. It is not financial advice, investment advice, or a guarantee of market performance.

## License

MIT
