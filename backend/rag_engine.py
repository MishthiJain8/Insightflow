import httpx
import json
import logging

logger = logging.getLogger("rag_engine")

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "llama3"

async def generate_rag_explanation(ticker: str, prediction_data: dict, news_headlines: list):
    """
    Uses local Ollama (Llama 3) to generate a conversational explanation of the prediction,
    using news context and tabular data as RAG context (Non-blocking).
    """
    context = f"""
    You are an expert quantitative financial analyst AI named InsightFlow.
    You have analyzed the stock {ticker}.
    
    Data:
    - Predicted Direction: {prediction_data.get('direction', 'Unknown')}
    - AI Confidence: {prediction_data.get('probability', 0)}%
    - Horizon: {prediction_data.get('horizon_days', 7)} days
    - Sentiment: {prediction_data.get('sentiment_label', 'Neutral')}
    
    Recent News Headlines:
    {chr(10).join(f"- {h}" for h in news_headlines[:5])}
    
    Write a 2-3 paragraph professional, intellectual explanation for a retail investor 
    on why the AI made this prediction. Be concise, do not hallucinate numbers, 
    and incorporate the news sentiment into your reasoning. 
    Make sure to give a clear definitive action (BUY, SELL, or HOLD) at the end.
    """
    
    payload = {
        "model": MODEL_NAME,
        "prompt": context,
        "stream": False,
        "options": {
            "temperature": 0.3,
            "num_predict": 250
        }
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(OLLAMA_URL, json=payload, timeout=120)
            response.raise_for_status()
            result = response.json()
            return result.get("response", "Could not generate response from AI.")
    except Exception as e:
        logger.warning(f"Ollama generation failed (is Ollama running?): {e}")
        return None
