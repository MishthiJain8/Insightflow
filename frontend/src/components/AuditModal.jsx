import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { X, Eye, TrendingUp, TrendingDown, BarChart2, Brain, BookOpen, Sparkles, CheckCircle2, XCircle, Clock, Loader } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://insightflow-api-git-main-mishthi-jains-projects.vercel.app' : 'http://localhost:8000')

// ─── Accuracy glow config ─────────────────────────────────────────────────────
function getGlowStyle(result) {
    if (result === 'Correct') return {
        boxShadow: '0 0 0 1px rgba(16,185,129,0.35), 0 0 60px rgba(16,185,129,0.2), 0 30px 60px rgba(0,0,0,0.6)',
        borderTop: '1px solid rgba(16,185,129,0.25)',
    }
    if (result === 'Incorrect') return {
        boxShadow: '0 0 0 1px rgba(239,68,68,0.35), 0 0 60px rgba(239,68,68,0.2), 0 30px 60px rgba(0,0,0,0.6)',
        borderTop: '1px solid rgba(239,68,68,0.25)',
    }
    return {
        boxShadow: '0 0 0 1px rgba(245,158,11,0.35), 0 0 40px rgba(245,158,11,0.12), 0 30px 60px rgba(0,0,0,0.6)',
        borderTop: '1px solid rgba(245,158,11,0.2)',
    }
}

function getAccuracyColor(result) {
    if (result === 'Correct') return '#34d399'
    if (result === 'Incorrect') return '#f87171'
    return '#fbbf24'
}

// ─── [What AI Saw] panel ──────────────────────────────────────────────────────
function AISawPanel({ analysis, prediction }) {
    const features = typeof analysis === 'string' ? (() => { try { return JSON.parse(analysis) } catch { return {} } })() : (analysis || {})

    const items = [
        { label: 'RSI', value: features.rsi != null ? `${Number(features.rsi).toFixed(1)}` : null, note: features.rsi < 30 ? 'Oversold' : features.rsi > 70 ? 'Overbought' : 'Neutral' },
        { label: 'MACD Signal', value: features.macd_signal_raw != null ? (features.macd_signal_raw > 0 ? '↑ Bullish' : '↓ Bearish') : (features.macd_signal != null ? (features.macd_signal > 0 ? '↑ Bullish' : '↓ Bearish') : null) },
        { label: 'Pattern', value: features.pattern_match || features.pattern || null },
        { label: 'Sentiment', value: features.sentiment_label || features.sentiment || null },
        { label: 'Volume', value: features.high_volume != null ? (features.high_volume ? 'Above avg' : 'Below avg') : null },
        { label: 'AI Prob.', value: prediction?.predicted_prob != null ? `${Number(prediction.predicted_prob).toFixed(0)}%` : null },
    ].filter(i => i.value)

    return (
        <div style={{
            flex: 1, padding: '18px', borderRadius: 14,
            background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.12)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Eye size={14} color='#06b6d4' />
                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#06b6d4', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    What AI Saw
                </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                    {(prediction?.predicted_direction === 'UP'
                        ? <TrendingUp size={18} color='#34d399' />
                        : <TrendingDown size={18} color='#f87171' />)}
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: prediction?.predicted_direction === 'UP' ? '#34d399' : '#f87171' }}>
                        {prediction?.predicted_direction || '—'} Signal
                    </span>
                </div>
                {items.length > 0 ? items.map((it, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{it.label}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{it.value}{it.note ? ` (${it.note})` : ''}</span>
                    </div>
                )) : (
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>No detailed feature snapshot available for this prediction.</p>
                )}
            </div>
        </div>
    )
}

// ─── [What Actually Happened] panel ──────────────────────────────────────────
function WhatHappenedPanel({ prediction }) {
    const entry = prediction?.price_at_prediction
    const actual = prediction?.actual_price
    const horizon = prediction?.prediction_horizon || 7
    const result = prediction?.actual_result
    const color = getAccuracyColor(result)

    const targetDate = prediction?.target_date ? new Date(prediction.target_date) : null
    const now = new Date()
    let countdownText = null
    if (!result && targetDate && targetDate > now) {
        const diffMs = targetDate - now
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
        countdownText = `${days} days, ${hours} hours`
    }

    return (
        <div style={{
            flex: 1, padding: '18px', borderRadius: 14,
            background: result === 'Correct' ? 'rgba(16,185,129,0.05)' : result === 'Incorrect' ? 'rgba(239,68,68,0.05)' : 'rgba(245,158,11,0.05)',
            border: `1px solid ${result === 'Correct' ? 'rgba(16,185,129,0.12)' : result === 'Incorrect' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)'}`,
            display: 'flex', flexDirection: 'column', gap: 14,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {result === 'Correct' ? <CheckCircle2 size={14} color='#34d399' /> : result === 'Incorrect' ? <XCircle size={14} color='#f87171' /> : <Clock size={14} color='#fbbf24' />}
                <span style={{ fontSize: '0.65rem', fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    What Actually Happened
                </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Horizon Badge */}
                <div style={{ alignSelf: 'flex-start', padding: '4px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Forecast Duration: {horizon} Days
                </div>

                {!result || result === 'AWAITING_MARKET_OPEN' ? (
                    <div style={{ marginTop: 10, padding: 16, background: 'rgba(245,158,11,0.05)', border: '1px dashed rgba(245,158,11,0.3)', borderRadius: 10 }}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 10px 0', fontWeight: 600, lineHeight: 1.5 }}>
                            {result === 'AWAITING_MARKET_OPEN'
                                ? "Status: Market Closed/Holiday. Awaiting next trading session to fetch actual closing price."
                                : `Status: PENDING. Comparison will be available on ${targetDate ? targetDate.toLocaleDateString() : 'Target Date'}.`
                            }
                        </p>
                        {countdownText && (
                            <div style={{ display: 'inline-block', padding: '4px 8px', background: 'rgba(245,158,11,0.1)', borderRadius: 6 }}>
                                <span style={{ fontSize: '0.65rem', color: '#fbbf24', fontWeight: 700, fontFamily: 'monospace' }}>
                                    Remaining time for final audit: {countdownText}
                                </span>
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Success Timeline Visual */}
                        <div style={{ margin: '10px 0', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                <span>Entry Day</span>
                                <span>Target Date (Day {horizon})</span>
                            </div>
                            <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, position: 'relative', margin: '4px 0' }}>
                                <div style={{ position: 'absolute', left: 0, top: -4, width: 12, height: 12, borderRadius: '50%', background: 'var(--text-muted)', border: '2px solid rgba(0,0,0,0.5)' }} title="Entry" />
                                <div style={{ position: 'absolute', right: 0, top: -4, width: 12, height: 12, borderRadius: '50%', background: color, border: '2px solid rgba(0,0,0,0.5)', boxShadow: `0 0 10px ${color}80` }} title="Target" />
                                {/* Connecting Line (Glow) */}
                                <div style={{ height: '100%', width: '100%', background: `linear-gradient(90deg, var(--text-muted) 0%, ${color} 100%)`, opacity: 0.4 }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>${entry?.toFixed(2) || '—'}</span>
                                <span style={{ color }}>${actual?.toFixed(2) || '—'}</span>
                            </div>
                        </div>

                        {/* Detailed metrics */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {[
                                { label: 'Price on Entry Day', value: entry != null ? `$${entry.toFixed(2)}` : '—', color: 'var(--text-secondary)' },
                                { label: `Actual Price on Target Date (Day ${horizon})`, value: actual != null ? `$${actual.toFixed(2)}` : '—', color },
                                { label: 'Accuracy', value: prediction?.model_accuracy != null ? `${(prediction.model_accuracy < 2 ? prediction.model_accuracy * 100 : prediction.model_accuracy).toFixed(1)}%` : '—', color: 'var(--text-secondary)' },
                                { label: 'Verdict', value: result, color },
                            ].map((it, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{it.label}</span>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: it.color || 'var(--text-secondary)', fontFamily: 'monospace' }}>{it.value}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

// ─── Explainable Gap Narrative ────────────────────────────────────────────────
function buildGapNarrative(prediction) {
    const result = prediction?.actual_result
    const horizon = prediction?.prediction_horizon || 7
    const dir = prediction?.predicted_direction
    const da = typeof prediction?.detailed_analysis === 'string'
        ? (() => { try { return JSON.parse(prediction.detailed_analysis) } catch { return {} } })()
        : (prediction?.detailed_analysis || {})

    const sent = da.sentiment_label || da.sentiment || ''
    const pattern = da.pattern_match || da.pattern || ''

    if (!result || result === 'Pending') return `You asked the AI to look ${horizon} days into the future. This forecast is still in progress — check back on the target date.`

    let base = `You asked the AI to look ${horizon} days into the future. Here is how it performed. `

    if (result === 'Correct') {
        if (pattern) return base + `The AI's detection of a ${pattern} was validated by real price action. Technical pattern analysis carried the prediction correctly over this horizon.`
        if (sent?.toLowerCase().includes('bull')) return base + "Bullish news sentiment and technical signals aligned perfectly, leading to a correct upward call."
        if (sent?.toLowerCase().includes('bear')) return base + "The confluence of bearish FinBERT signals and technical indicators drove an accurate downward prediction."
        return base + "Technical momentum signals were the dominant factor and proved reliable for this prediction cycle."
    }

    if (result === 'Incorrect') {
        if (sent?.toLowerCase().includes('bear') && dir === 'UP') return base + "A sudden news event carrying negative sentiment outweighed the bullish technical patterns the AI detected over this period."
        if (sent?.toLowerCase().includes('bull') && dir === 'DOWN') return base + "Unexpected positive catalysts (institutional buying or news) reversed the downtrend the AI predicted over this window."
        if (pattern) return base + `The ${pattern} technical pattern produced a false signal in this market regime — increased volatility may have invalidated the pattern before the ${horizon}-day target.`
        return base + "An external market event (macro data, earnings surprise, or sector rotation) overrode the technical and sentiment signals the AI used for this prediction."
    }
    return "Analysis not available."
}

// ─── Main AuditModal Component ────────────────────────────────────────────────
export default function AuditModal({ prediction, onClose }) {
    const { token } = useAuth()
    const [learningNote, setLearningNote] = useState(prediction?.learning_notes || null)
    const [generating, setGenerating] = useState(false)

    if (!prediction) return null

    const result = prediction?.actual_result
    const glowStyle = getGlowStyle(result)
    const accentColor = getAccuracyColor(result)
    const gapNarrative = buildGapNarrative(prediction)

    const handleGenerateLearningNote = async () => {
        setGenerating(true)
        try {
            const res = await fetch(`${API_BASE}/api/predict/generate-note`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ prediction_id: prediction.id })
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json()
            setLearningNote(data.learning_note)
        } catch (e) {
            console.error('Audit error:', e)
        } finally {
            setGenerating(false)
        }
    }

    const [audioData, setAudioData] = useState(null)
    const [audioLoading, setAudioLoading] = useState(false)

    useEffect(() => {
        if (!prediction?.ticker) return
        const fetchAudio = async () => {
            setAudioLoading(true)
            try {
                const res = await fetch(`${API_BASE}/api/audio/latest/${prediction.ticker}`)
                if (res.ok) {
                    const data = await res.json()
                    setAudioData(data)
                }
            } catch (e) {
                console.error("Audio fetch error:", e)
            } finally {
                setAudioLoading(false)
            }
        }
        fetchAudio()
    }, [prediction?.ticker])

    return ReactDOM.createPortal(
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(30px)',
                padding: 16,
            }}
            onClick={onClose}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: '100%', maxWidth: 720, borderRadius: 24,
                    background: 'rgba(5,7,10,0.85)',
                    backdropFilter: 'blur(20px)',
                    ...glowStyle,
                    padding: '32px',
                    display: 'flex', flexDirection: 'column', gap: 24,
                    position: 'relative',
                    overflowY: 'auto', maxHeight: '85vh',
                    border: '1px solid rgba(255,255,255,0.08)',
                }}
            >
                {/* Close */}
                <button onClick={onClose} style={{
                    position: 'absolute', top: 20, right: 20, background: 'none', border: 'none',
                    cursor: 'pointer', color: 'var(--text-muted)', padding: 6,
                }} onMouseOver={e => e.currentTarget.style.color = 'white'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                    <X size={20} />
                </button>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingRight: 40 }}>
                    <div style={{
                        width: 52, height: 52, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `${accentColor}18`, border: `1px solid ${accentColor}30`, fontSize: '1.5rem',
                    }}>
                        {result === 'Correct' ? '✅' : result === 'Incorrect' ? '❌' : '⏳'}
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', fontFamily: 'monospace', letterSpacing: '-0.02em' }}>
                                ${prediction.ticker}
                            </span>
                            <span style={{
                                padding: '4px 12px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 800,
                                background: `${accentColor}18`, border: `1px solid ${accentColor}35`, color: accentColor,
                                textTransform: 'uppercase', letterSpacing: '0.1em',
                            }}>{result || 'Pending'}</span>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0', fontWeight: 500 }}>
                            Model Accuracy Audit — {prediction.date_predicted ? new Date(prediction.date_predicted).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </p>
                    </div>
                </div>

                {/* Side-by-side comparison */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <AISawPanel analysis={prediction.detailed_analysis} prediction={prediction} />
                    <WhatHappenedPanel prediction={prediction} />
                </div>

                {/* Acoustic Intelligence Sync */}
                <div style={{ padding: '16px 20px', borderRadius: 16, background: 'rgba(16,185,129,0.03)', border: '1px solid rgba(16,185,129,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <Brain size={14} color='#34d399' />
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            Acoustic Intelligence Audit
                        </span>
                    </div>
                    {audioLoading ? (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Fetching audio analysis...</p>
                    ) : audioData ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'flex', gap: 12 }}>
                                {[
                                    { label: 'Anxiety', value: (audioData.anxiety_score * 100).toFixed(0) + '%', color: audioData.anxiety_score > 0.4 ? '#f87171' : 'var(--text-muted)' },
                                    { label: 'Confidence', value: (audioData.confidence_score * 100).toFixed(0) + '%', color: audioData.confidence_score > 0.6 ? '#34d399' : 'var(--text-muted)' },
                                    { label: 'Hesitation', value: (audioData.hesitation_score * 100).toFixed(0) + '%', color: audioData.hesitation_score > 0.3 ? '#fbbf24' : 'var(--text-muted)' },
                                ].map((it, i) => (
                                    <div key={i} style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{it.label}</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: it.color, fontFamily: 'monospace' }}>{it.value}</div>
                                    </div>
                                ))}
                            </div>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                                <Sparkles size={12} color="#34d399" style={{ display: 'inline', marginRight: 6 }} />
                                {audioData.confidence_score > 0.6
                                    ? `The CEO's voice shows high confidence (${(audioData.confidence_score * 100).toFixed(0)}%), which confirms the positive sentiment detected in news feeds.`
                                    : `Tactical scan suggests neutral emotional baseline (${(audioData.confidence_score*100).toFixed(0)}%) — price action is primarily technical.`}
                            </p>
                        </div>
                    ) : (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No recent acoustic intelligence data found for this ticker.</p>
                    )}
                </div>

                {/* Explainable Gap */}
                <div style={{ padding: '16px 20px', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <BarChart2 size={14} color='var(--accent-violet)' />
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent-violet)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            Explainable Gap
                        </span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.75, margin: 0, fontWeight: 500 }}>
                        {gapNarrative}
                    </p>
                </div>

                {/* Learning Note section */}
                <div
                    className={learningNote ? "fade-in" : ""}
                    style={{ padding: '16px 20px', borderRadius: 16, background: learningNote ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.02)', border: learningNote ? '1px solid rgba(139,92,246,0.25)' : '1px solid rgba(255,255,255,0.05)', animation: learningNote ? 'fadeIn 0.5s ease-out' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: learningNote ? 12 : 0 }}>
                        <Brain size={14} color='var(--accent-violet)' />
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--accent-violet)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            AI Learning Note
                        </span>
                    </div>

                    {learningNote ? (
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            <Sparkles size={14} color='#a78bfa' style={{ marginTop: 3, flexShrink: 0 }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {learningNote.split('\n\n').map((para, i) => (
                                    <p key={i} style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.7, margin: 0, fontWeight: 500 }}>
                                        {para.startsWith('###') ? <strong style={{ color: 'var(--accent-violet)' }}>{para.replace('###', '')}</strong> : para}
                                    </p>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6, flex: 1 }}>
                                No learning note recorded yet. Generate one to help the AI improve on this trade.
                            </p>
                            <button
                                onClick={handleGenerateLearningNote}
                                disabled={generating}
                                style={{
                                    flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 8,
                                    padding: '8px 20px', borderRadius: 12, cursor: generating ? 'wait' : 'pointer',
                                    background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.4)',
                                    color: '#a78bfa', fontSize: '0.75rem', fontWeight: 700,
                                    transition: 'all 0.2s', opacity: generating ? 0.6 : 1,
                                }}
                                onMouseOver={e => { if (!generating) e.currentTarget.style.background = 'rgba(139,92,246,0.28)' }}
                                onMouseOut={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.18)' }}
                            >
                                {generating ? <Loader size={14} className="animate-spin" /> : <BookOpen size={14} />}
                                {generating ? 'Generating…' : 'Generate Note'}
                            </button>
                        </div>
                    )}
                </div>

                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: 0, textAlign: 'center', opacity: 0.6, lineHeight: 1.6 }}>
                    Prediction audit data is for model improvement only — not investment advice.
                </p>
            </div>
        </div>,
        document.body
    )
}
