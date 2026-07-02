# InsightFlow Deployment

## Backend: Render

1. Create a free MongoDB Atlas cluster and copy the connection string.
2. Push this repo to GitHub.
3. In Render, create a new Blueprint from this repo. Render will read `render.yaml`.
4. Set these backend environment variables:
   - `MONGODB_URI`: MongoDB Atlas connection string
   - `MONGODB_DB_NAME`: `insightflow`
   - `JWT_SECRET`: long random secret
   - `GMAIL_USER`: optional Gmail sender address
   - `GMAIL_APP_PASSWORD`: optional Gmail app password
5. Deploy and confirm `https://YOUR-SERVICE.onrender.com/api/health` returns JSON.

## Frontend: Vercel

1. Import the same GitHub repo in Vercel.
2. Set the root directory to `frontend`.
3. Set the environment variable:
   - `VITE_API_BASE_URL`: your Render backend URL, for example `https://insightflow-api.onrender.com`
4. Build command: `npm run build`
5. Output directory: `dist`
6. Deploy.

## Notes

- The backend uses MongoDB, so local `mongodb://localhost:27017` will not work in production. Use MongoDB Atlas.
- The app can run without Gmail variables, but OTP emails only print in backend logs unless real Gmail credentials are configured.
- Render free services sleep after inactivity, so the first request after a pause can be slow.
- Ollama is local-only in this codebase. Hosted Render deployments will skip or fail any feature that strictly requires a local Ollama server unless that part is replaced with a hosted LLM provider.
