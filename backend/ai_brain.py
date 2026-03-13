"""
InsightFlow AI Brain — Phase 4
================================
Offline NLP + Audio Emotion engine (no cloud API required).

Components:
  1. FinBERT  — financial text sentiment  (ProsusAI/finbert, ~440 MB)
  2. wav2vec2 — speech emotion recognition (~1.1 GB)
  3. Signal combiner — merges text + audio into a composite score
  4. Sample WAV generator — creates a 3-second test file if absent

NOTE: Models are lazy-loaded and cached. First call downloads from HuggingFace.
"""

import os
import re
import wave
import struct
import math
import logging
import soundfile as sf
import numpy as np

logger = logging.getLogger("ai_brain")

# ─── Module-level singletons (lazy-loaded) ────────────────────────────────────
_finbert        = None
_audio_pipeline = None

# ─── Emotion → numeric score map ─────────────────────────────────────────────
EMOTION_SCORE = {
    "happy":     0.40,
    "surprised": 0.30,
    "neutral":   0.00,
    "calm":      0.10,
    "sad":      -0.30,
    "fearful":  -0.40,
    "angry":    -0.35,
    "disgust":  -0.35,
}

# ─── FinBERT ──────────────────────────────────────────────────────────────────

def get_finbert():
    """Lazy-load FinBERT pipeline (downloads ~440 MB on first call)."""
    global _finbert
    if _finbert is None:
        logger.info("Loading FinBERT model — this may take a minute on first run...")
        from transformers import pipeline
        _finbert = pipeline(
            "sentiment-analysis",
            model="ProsusAI/finbert",
            tokenizer="ProsusAI/finbert",
            max_length=512,
            truncation=True,
        )
        logger.info("FinBERT loaded.")
    return _finbert


def analyze_sentiment(headlines: list[str]) -> dict:
    """
    Score a list of news headlines with FinBERT.

    Returns:
        {
          "score":         float in [-1, 1],
          "label":         "Bullish" | "Bearish" | "Neutral",
          "per_headline":  [{"text": ..., "finbert_label": ..., "score": ...}, ...]
        }
    """
    if not headlines:
        return {"score": 0.0, "label": "Neutral", "per_headline": []}

    try:
        pipe    = get_finbert()
        results = pipe(headlines, batch_size=8)
    except Exception as e:
        logger.warning(f"FinBERT inference error: {e}")
        return {"score": 0.0, "label": "Neutral", "per_headline": [], "error": str(e)}

    per_headline = []
    scores       = []
    for text, res in zip(headlines, results):
        raw_label = res["label"].lower()
        raw_score = float(res["score"])
        # FinBERT labels: positive / negative / neutral
        if raw_label == "positive":
            numeric = raw_score
        elif raw_label == "negative":
            numeric = -raw_score
        else:
            numeric = 0.0
        scores.append(numeric)
        per_headline.append({
            "text":          text[:120],
            "finbert_label": raw_label,
            "score":         round(numeric, 4),
        })

    avg_score = round(sum(scores) / len(scores), 4) if scores else 0.0
    if avg_score > 0.10:
        label = "Bullish"
    elif avg_score < -0.10:
        label = "Bearish"
    else:
        label = "Neutral"

    return {"score": avg_score, "label": label, "per_headline": per_headline}


# ─── wav2vec2 Audio Emotion ───────────────────────────────────────────────────

def get_audio_pipeline():
    """Lazy-load wav2vec2 audio emotion pipeline (downloads ~1.1 GB on first call)."""
    global _audio_pipeline
    if _audio_pipeline is None:
        logger.info("Loading audio emotion model — this may take a few minutes on first run...")
        from transformers import pipeline
        _audio_pipeline = pipeline(
            "audio-classification",
            model="ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition",
        )
        logger.info("Audio emotion model loaded.")
    return _audio_pipeline


def ensure_sample_wav(path: str) -> None:
    """
    Generate a 3-second 16kHz mono sine-wave WAV if the file doesn't exist.
    The audio pipeline needs a valid WAV file; this serves as a neutral placeholder
    until a real earnings call audio file is provided.
    """
    if os.path.exists(path):
        return
    logger.info(f"Generating sample WAV at {path}...")
    sample_rate = 16000
    duration    = 3        # seconds
    frequency   = 440.0    # Hz  (A4 tone — neutral, clear signal for the model)
    n_samples   = sample_rate * duration

    with wave.open(path, "w") as wf:
        wf.setnchannels(1)        # mono
        wf.setsampwidth(2)        # 16-bit
        wf.setframerate(sample_rate)
        for i in range(n_samples):
            t      = i / sample_rate
            sample = int(32767 * 0.3 * math.sin(2 * math.pi * frequency * t))
            wf.writeframes(struct.pack("<h", sample))
    logger.info("Sample WAV generated.")


def analyze_audio_emotion(audio_path_or_url: str) -> dict:
    """
    Run wav2vec2 emotion recognition on a WAV file or YouTube URL.
    Downloads YT URLs temporarily via yt-dlp.

    Returns:
        {
          "label":      str   (e.g. "neutral", "happy", "fearful"),
          "confidence": float,
          "score":      float in [-1, 1],
          "anxiety":    float,
          "confidence_score": float,
          "hesitation": float
        }
    """
    import tempfile
    import uuid
    import yt_dlp
    
    temp_wav = None
    is_url = audio_path_or_url.startswith("http://") or audio_path_or_url.startswith("https://")
    
    if is_url:
        try:
            temp_wav = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4().hex}.wav")
            ydl_opts = {
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'wav',
                    'preferredquality': '192',
                }],
                'outtmpl': temp_wav.replace('.wav', '') + '.%(ext)s',
                'quiet': True,
                'no_warnings': True
            }
            logger.info(f"Downloading audio from {audio_path_or_url}...")
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([audio_path_or_url])
            target_path = temp_wav
        except Exception as e:
            logger.warning(f"Audio download failed: {e}")
            target_path = os.path.join(os.path.dirname(__file__), "sample_audio.wav")
            ensure_sample_wav(target_path)
    else:
        target_path = audio_path_or_url
        ensure_sample_wav(target_path)

    try:
        pipe = get_audio_pipeline()
        audio_array, sampling_rate = sf.read(target_path)
        if len(audio_array.shape) > 1:
            audio_array = audio_array.mean(axis=1)
        results = pipe({"raw": audio_array, "sampling_rate": sampling_rate}, top_k=8)
    except Exception as e:
        logger.warning(f"Audio emotion error: {e}")
        if is_url and temp_wav and os.path.exists(temp_wav):
            try: os.remove(temp_wav)
            except: pass
        return {
            "label": "neutral", "confidence": 0.0, "score": 0.0,
            "anxiety": 0.0, "confidence_score": 0.0, "hesitation": 0.0,
            "error": str(e),
            "note":  "Audio model unavailable — defaulting to Neutral.",
        }

    # Clean up temp file
    if is_url and temp_wav and os.path.exists(temp_wav):
        try: os.remove(temp_wav)
        except: pass

    # Top result
    top     = results[0]
    label   = top["label"].lower().replace("_", " ").strip()
    conf    = round(float(top["score"]), 4)
    numeric = EMOTION_SCORE.get(label, 0.0) * conf

    # Phase 1 Multimodal Intelligence: Explicit Emotion Traits
    anxiety    = sum(r["score"] for r in results if r["label"].lower() in ["fearful", "sad", "disgust", "angry"])
    confidence = sum(r["score"] for r in results if r["label"].lower() in ["happy", "calm", "surprised"])
    hesitation = sum(r["score"] for r in results if r["label"].lower() in ["neutral", "fearful"])

    return {
        "label":      label,
        "confidence": conf,
        "score":      round(numeric, 4),
        "anxiety":    round(float(anxiety), 4),
        "confidence_score": round(float(confidence), 4),
        "hesitation": round(float(hesitation), 4),
        "all":        [{"label": r["label"], "confidence": round(float(r["score"]), 4)} for r in results],
    }


# ─── Signal Combiner ──────────────────────────────────────────────────────────

def combine_signals(text_score: float, audio_score: float) -> dict:
    """
    Blend FinBERT text sentiment with audio emotion into a composite score.

    Logic:
      - If text is Bullish but audio is Fearful/Bearish → penalise by 50%
        (CEO words say "growth" but voice conveys fear → caution)
      - If both agree direction → amplify by 20%
      - Otherwise → weighted average (text 70%, audio 30%)

    Returns:
        {
          "composite":  float in [-1, 1],
          "label":      "Bullish" | "Bearish" | "Neutral",
          "adjustment": str   (explanation of the blend logic applied)
        }
    """
    text_dir  = 1 if text_score > 0.05 else (-1 if text_score < -0.05 else 0)
    audio_dir = 1 if audio_score > 0.05 else (-1 if audio_score < -0.05 else 0)

    if text_dir > 0 and audio_dir < 0:
        # Conflict: text bullish, audio fearful → penalise
        composite   = text_score * 0.50
        adjustment  = "⚠️ Text bullish but audio fearful — composite penalised 50%"
    elif text_dir < 0 and audio_dir > 0:
        # Conflict: text bearish, audio positive → soften
        composite   = text_score * 0.70
        adjustment  = "Text bearish but audio positive — composite softened"
    elif text_dir == audio_dir and text_dir != 0:
        # Agreement → amplify
        composite   = min(1.0, max(-1.0, (text_score * 0.70 + audio_score * 0.30) * 1.20))
        adjustment  = "✅ Text and audio agree — composite amplified 20%"
    else:
        # One neutral / mixed
        composite   = text_score * 0.70 + audio_score * 0.30
        adjustment  = "Weighted blend (text 70%, audio 30%)"

    composite = round(composite, 4)
    if composite > 0.10:
        label = "Bullish"
    elif composite < -0.10:
        label = "Bearish"
    else:
        label = "Neutral"

    return {"composite": composite, "label": label, "adjustment": adjustment}

def combine_conviction_score(technical_signal: float, text_sentiment_score: float, audio_emotion_score: float) -> float:
    """
    Phase 1: Multimodal Data Fusion.
    Produce a 0-100 Composite Conviction Score.
    Weights:
      Technicals: 40% (scale 0-100 logic handled by Quant engine probability)
      Text Sentiment: 30% (scale -1 to +1 mapped to 0-100)
      Audio Emotion: 30% (scale -1 to +1 mapped to 0-100)
    """
    text_norm = (text_sentiment_score + 1) * 50   # maps [-1, 1] -> [0, 100]
    audio_norm = (audio_emotion_score + 1) * 50   # maps [-1, 1] -> [0, 100]
    
    score = (technical_signal * 0.40) + (text_norm * 0.30) + (audio_norm * 0.30)
    return round(score, 2)


# ─── Phase 9: AI Learning Note Generator ─────────────────────────────────────

def generate_learning_note(
    ticker: str,
    predicted_direction: str,
    actual_result: str,
    features: dict | None = None,
) -> str:
    """
    Generate a brief, specific, first-person AI learning sentence based on
    the prediction context and outcome. Uses template branching for precision.

    Args:
        ticker:              e.g. "NVDA"
        predicted_direction: "UP" or "DOWN"
        actual_result:       "Correct" or "Incorrect"
        features:            dict from detailed_analysis JSON (optional, adds specificity)

    Returns:
        A single-sentence learning note string.
    """
    t = f"${ticker.upper()}"
    features = features or {}

    rsi     = features.get("rsi")
    pattern = features.get("pattern_match") or features.get("pattern")
    sent    = features.get("sentiment_label") or features.get("sentiment")
    vol_ok  = features.get("high_volume")

    if actual_result == "Correct" and predicted_direction == "UP":
        if rsi and float(rsi) < 35:
            return f"Confirmed: oversold RSI ({rsi:.0f}) for {t} was a reliable accumulation signal — model correctly identified the bounce."
        if pattern:
            return f"Pattern recognition for {t} was accurate — {pattern} preceded the expected upward move as predicted."
        if sent and "bull" in str(sent).lower():
            return f"FinBERT bullish sentiment for {t} aligned with a real upward price move — continue weighting news signals for this ticker."
        return f"Confirmed upward prediction for {t} — technical momentum signals remain reliable for this asset."

    elif actual_result == "Correct" and predicted_direction == "DOWN":
        if pattern:
            return f"Bearish breakdown pattern ({pattern}) for {t} played out correctly — model showed strong pattern recognition under these conditions."
        if sent and "bear" in str(sent).lower():
            return f"Negative sentiment detection for {t} proved reliable — FinBERT bearish classification accurately preceded the price decline."
        return f"Confirmed downward prediction for {t} — risk-off signals were correctly weighted by the model this cycle."

    elif actual_result == "Incorrect" and predicted_direction == "UP":
        if vol_ok is False:
            return f"Missed call on {t}: predicted upside but volume confirmation was absent — increase volume filter threshold for low-liquidity signals."
        if sent and "bear" in str(sent).lower():
            return f"Lesson for {t}: FinBERT detected bearish news but technical model overrode it — increase sentiment weight when news sentiment contradicts technicals."
        if pattern:
            return f"False breakout on {t}: {pattern} signalled an upward move that reversed — flag this pattern as unreliable in high-volatility regimes for this ticker."
        return f"Missed upward call on {t}: a sudden news event or macro shift outweighed the technical patterns — increase news sensitivity for this sector."

    else:  # Incorrect + DOWN prediction
        if sent and "bull" in str(sent).lower():
            return f"Lesson for {t}: predicted decline but {sent} sentiment reversed the momentum — sentiment should carry higher confidence weight for this ticker."
        if vol_ok:
            return f"Surprise recovery for {t}: high institutional volume absorbed the selling pressure predicted — add volume spike detection as a reversal guard."
        return f"Missed downward call on {t}: unexpected positive catalyst (earnings/news) outweighed the bearish technical setup — improve catalyst screen for this stock."
