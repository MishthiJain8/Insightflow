import sys
import os
import logging

# Ensure parent directory is in path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ai_brain
import database as db

logger = logging.getLogger("audio_processor")

def analyze_and_save_audio(ticker: str, audio_url: str = None) -> dict:
    """
    Analyzes audio from a URL (or placeholder) and saves the results to Supabase.
    
    Args:
        ticker: The stock ticker to associate with the analysis.
        audio_url: The URL of the audio file (optional, defaults to sample_audio.wav).
        
    Returns:
        The analysis result dictionary.
    """
    logger.info(f"Starting audio intelligence scan for {ticker}...")
    
    # If no URL provided, use the local sample_audio.wav as a placeholder
    # In production, this would be fetched from an earnings call API.
    target_source = audio_url if audio_url else os.path.join(os.path.dirname(os.path.dirname(__file__)), "sample_audio.wav")
    
    try:
        # 1. Run the wav2vec2 analysis from ai_brain
        analysis = ai_brain.analyze_audio_emotion(target_source)
        
        # 2. Save to database
        if not analysis.get("error"):
            db.insert_audio_analysis(
                ticker=ticker,
                source_url=audio_url or "LOCAL_SAMPLE",
                anxiety=analysis.get("anxiety", 0.0),
                confidence=analysis.get("confidence_score", 0.0),
                hesitation=analysis.get("hesitation", 0.0),
                composite=analysis.get("score", 0.0)
            )
            logger.info(f"Audio analysis for {ticker} saved to database.")
        
        return analysis
        
    except Exception as e:
        logger.error(f"Failed to process audio for {ticker}: {e}")
        return {
            "label": "neutral",
            "confidence": 0.0,
            "score": 0.0,
            "anxiety": 0.0,
            "confidence_score": 0.0,
            "hesitation": 0.0,
            "error": str(e)
        }

if __name__ == "__main__":
    # Test run
    logging.basicConfig(level=logging.INFO)
    res = analyze_and_save_audio("TSLA")
    print(res)
