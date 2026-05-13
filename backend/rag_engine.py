import httpx
import json
import logging

logger = logging.getLogger("rag_engine")

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
MODEL_NAME = "llama3"

async def generate_rag_explanation(ticker: str, prediction_data: dict, news_headlines: list):
    """
    Uses local Ollama (Llama 3) to generate a conversational explanation of the prediction,
    using news context and tabular data as RAG context (Non-blocking).
    """
    context = f"""
    You are an expert quantitative financial analyst AI named InsightFlow.
    You have analyzed the stock {ticker}.
    
    Data Evidence:
    - Predicted Direction: {prediction_data.get('direction', 'Unknown')}
    - AI Confidence: {prediction_data.get('probability', 0)}%
    - Historical Match Win Rate: {prediction_data.get('pattern_match', {}).get('win_rate') or 'N/A'}%
    - Matched Pattern Count: {prediction_data.get('pattern_match', {}).get('total_matches', 0)}
    - Horizon: {prediction_data.get('horizon_days', 7)} days
    - Sentiment Score: {prediction_data.get('sentiment_score', 'Neutral')}
    
    Technical Triggers:
    {chr(10).join(f"- {e.get('technical')}" for e in prediction_data.get('evidence', []) if 'technical' in e)}
    
    Recent News Highlights:
    {chr(10).join(f"- {h}" for h in news_headlines[:5])}
    
    INSTRUCTIONS:
    1. Write a professional, intellectual explanation for an institutional-grade retail investor.
    2. DO NOT HALLUCINATE. Use only the provided Data Evidence and Technical Triggers.
    3. You MUST mention the specific 'Historical Match Win Rate' and 'Matched Pattern Count' as statistical proof.
    4. Incorporate the news sentiment into your reasoning.
    5. Conclude with a definitive action: BUY, SELL, or HOLD.
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
        logger.warning(f"Ollama generation failed (is Ollama running?): {repr(e)}")
        return None
