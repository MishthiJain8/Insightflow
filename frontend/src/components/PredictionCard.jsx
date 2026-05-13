import React, { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { TrendingUp, TrendingDown, Minus, Loader, AlertTriangle, Mic2, Newspaper, HelpCircle, Brain, BarChart2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import ExplainModal from './ExplainModal'
import { simplify_finance_terms } from '../utils/translator'

const API_BASE = 'http://localhost:8000'

// ─── SVG Probability Gauge ────────────────────────────────────────────────────
function ProbabilityGauge({ probability, direction }) {
    const pct = Math.max(0, Math.min(100, probability ?? 50))
    const isUp = direction === 'UP'
    const color = isUp ? 'var(--accent-emerald)' : 'var(--accent-red)'
    const track = 'rgba(255,255,255,0.06)'

    // SVG arc parameters
    const R = 52
    const cx = 70
    const cy = 70
    const startA = -220   // degrees, bottom-left
    const sweepD = 260    // total sweep in degrees
    const angle = startA + (pct / 100) * sweepD

    function polarToXY(angleDeg, r) {
        const rad = (angleDeg * Math.PI) / 180
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
    }

    function describeArc(start, end, r) {
        const s = polarToXY(start, r)
        const e = polarToXY(end, r)
        const big = end - start > 180 ? 1 : 0
        return `M ${s.x} ${s.y} A ${r} ${r} 0 ${big} 1 ${e.x} ${e.y}`
    }

    return (
        <div style={{ position: 'relative', width: 140, height: 120, flexShrink: 0 }}>
            <svg width="140" height="120" viewBox="0 0 140 120">
                {/* Track */}
                <path d={describeArc(startA, startA + sweepD, R)} fill="none" stroke={track} strokeWidth="8" strokeLinecap="round" />
                {/* Fill */}
                {pct > 0 && (
                    <path d={describeArc(startA, angle, R)} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
                        style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
                )}
                {/* Needle dot */}
                {(() => {
                    const tip = polarToXY(angle, R)
                    return <circle cx={tip.x} cy={tip.y} r="5" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
                })()}
            </svg>
            {/* Centre text */}
            <div style={{
                position: 'absolute', top: 44, left: 0, right: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '1.6rem', fontWeight: 800, color, lineHeight: 1 }}>
                    {pct}%
                </span>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {isUp ? 'Bullish' : 'Bearish'}
                </span>
            </div>
        </div>
    )
}

// ─── Feature Row ──────────────────────────────────────────────────────────────
function FeatureRow({ label, value, score, icon: Icon, color }) {
    const barColor = score > 0 ? 'var(--accent-emerald)' : score < 0 ? 'var(--accent-red)' : 'var(--text-muted)'
    const barWidth = Math.abs((score ?? 0) * 100)

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <Icon size={13} color={color ?? 'var(--text-muted)'} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', width: 120, flexShrink: 0 }}>{label}</span>
            <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, barWidth)}%`, background: barColor, borderRadius: 2, transition: 'width 0.6s ease' }} />
            </div>
            <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-primary)', fontWeight: 600, minWidth: 60, textAlign: 'right' }}>
                {value}
            </span>
        </div>
    )
}

// ─── Direction Badge ──────────────────────────────────────────────────────────
function DirectionBadge({ direction, horizon }) {
    const isUp = direction === 'UP'
    const color = isUp ? 'var(--accent-emerald)' : 'var(--accent-red)'
    const Icon = isUp ? TrendingUp : TrendingDown
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            padding: '10px 18px', borderRadius: 10,
            background: isUp ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${isUp ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
        }}>
            <Icon size={22} color={color} />
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {direction} in {horizon}D
            </span>
        </div>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PredictionCard({ ticker, horizon = 5 }) {
    const { token } = useAuth()
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [stage, setStage] = useState('')

    const [beginnerMode, setBeginnerMode] = useState(window.simpleMode || false)
    const [isModalOpen, setIsModalOpen] = useState(false)

    useEffect(() => {
        const handleToggle = () => setBeginnerMode(window.simpleMode)
        window.addEventListener('toggle_simple_mode', handleToggle)
        return () => window.removeEventListener('toggle_simple_mode', handleToggle)
    }, [])

    useEffect(() => {
        if (!ticker) return
        let cancelled = false

        const run = async () => {
            setLoading(true)
            setError(null)
            setData(null)

            // Cycling status messages during long load
            const stages = [
                'Loading FinBERT model…',
                'Fetching max history for pattern scan…',
                'Computing MACD & RSI…',
                'Running FinBERT sentiment…',
                'Scanning historical analogs…',
                'Training RandomForest…',
                'Generating prediction…',
            ]
            let si = 0
            const interval = setInterval(() => {
                if (!cancelled) { setStage(stages[si % stages.length]); si++ }
            }, 4000)

            try {
                const res = await fetch(`${API_BASE}/api/predict/${ticker}?horizon=${horizon}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`)
                const result = await res.json()
                if (!cancelled) {
                    setData(result)
                    window.dispatchEvent(new CustomEvent('update_conviction', {
                        detail: { score: result.combined_signal?.composite ?? 50 }
                    }))
                }
            } catch (e) {
                if (!cancelled) setError(e.message)
            } finally {
                clearInterval(interval)
                if (!cancelled) { setLoading(false); setStage('') }
            }
        }

        run()
        return () => { cancelled = true }
    }, [ticker, horizon])

    // ── Loading ────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="glass fade-up" style={{ borderRadius: 14, padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 36, height: 36, border: '2px solid var(--glass-border)', borderTop: '2px solid var(--accent-violet)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
                        Quant Brain Processing…
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--accent-violet)' }}>{stage || 'Initialising…'}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        First run downloads FinBERT + wav2vec2 (~1.5 GB). Subsequent calls are fast.
                    </div>
                </div>
            </div>
        )
    }

    if (!ticker || !data) return null

    const fmt2 = (n) => n != null ? Number(n).toFixed(2) : '—'
    const fmtS = (n) => n != null ? (n > 0 ? `+${Number(n).toFixed(3)}` : Number(n).toFixed(3)) : '—'

    const features = data.features ?? {}
    const sent = data.sentiment ?? {}
    const audio = data.audio_emotion ?? {}
    const combo = data.combined_signal ?? {}

    const featureRows = [
        { label: 'RSI-14', value: fmt2(features.rsi14), score: features.rsi14 != null ? (features.rsi14 - 50) / 50 : 0, icon: TrendingUp, color: 'var(--accent-cyan)' },
        { label: 'MACD', value: fmtS(features.macd), score: features.macd ?? 0, icon: TrendingUp, color: 'var(--accent-violet)' },
        { label: 'MACD Signal', value: fmtS(features.macd_signal), score: features.macd_signal ?? 0, icon: Minus, color: 'var(--text-muted)' },
        { label: 'FinBERT Sent.', value: fmtS(sent.score), score: sent.score ?? 0, icon: Newspaper, color: 'var(--accent-amber)' },
        { label: 'Audio Emotion', value: audio.label ?? '—', score: audio.score ?? 0, icon: Mic2, color: 'var(--accent-emerald)' },
        { label: 'Composite Score', value: fmtS(combo.composite), score: combo.composite ?? 0, icon: Brain, color: 'var(--accent-violet)' },
    ]

    return (
        <div className="glass fade-up" style={{ borderRadius: 14, overflow: 'hidden', position: 'relative' }}>
            {/* Header */}
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Brain size={15} color="var(--accent-violet)" />
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>Quant Brain Prediction</span>

                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center justify-center transition-all hover:scale-110"
                    style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--accent-violet)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', marginLeft: 4 }}
                    title="Why?"
                >
                    <HelpCircle size={13} />
                </button>

                <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: 8 }}>{data.symbol} · {horizon}-Day Horizon</span>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
                    {/* Global Simple Mode Toggle removes the need for local toggle here */}

                    {data.model_accuracy != null && (
                        <span style={{
                            fontSize: '0.65rem', fontWeight: 600,
                            color: 'var(--accent-emerald)', background: 'rgba(16,185,129,0.1)',
                            border: '1px solid rgba(16,185,129,0.2)', padding: '2px 8px', borderRadius: 4,
                        }}>
                            {beginnerMode ? 'AI Confidence:' : 'Model CV Acc:'} {(data.model_accuracy * 100).toFixed(1)}%
                        </span>
                    )}
                </div>
            </div>

            {/* Body */}
            <div style={{ display: 'flex', gap: 0 }}>
                {/* Left: Gauge + direction */}
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
                    padding: '20px 24px', borderRight: '1px solid var(--glass-border)', flexShrink: 0, minWidth: 190,
                }}>
                    <ProbabilityGauge probability={data.probability} direction={data.direction} />
                    <DirectionBadge direction={data.direction} horizon={horizon} />
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                        {data.n_training_samples} training samples<br />
                        RF: {data.n_estimators ?? 200} trees
                    </div>
                </div>

                {/* Right: Feature breakdown */}
                <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10 }}>
                        {beginnerMode ? 'AI Summary' : 'Signal Breakdown'}
                    </div>

                    <div style={{ position: 'relative', flex: 1 }}>
                        <AnimatePresence mode="wait">
                            {beginnerMode ? (
                                <motion.div
                                    key="simple"
                                    initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', height: '100%' }}
                                >
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                                        The AI believes the price will go <strong style={{ color: data.direction === 'UP' ? 'var(--accent-emerald)' : 'var(--accent-red)' }}>{data.direction}</strong> in the next {horizon} days.
                                        This is supported by {!sent.score || sent.score === 0 ? 'a neutral' : sent.score > 0 ? 'an optimistic' : 'a pessimistic'} market attitude and current momentum.
                                    </p>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="tech"
                                    initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}
                                >
                                    {featureRows.map((row, idx) => <FeatureRow key={`${row.label || 'feat'}-${idx}`} {...row} />)}

                                    {/* Audio adjustment note */}
                                    {combo.adjustment && (
                                        <div style={{
                                            marginTop: 12, padding: '8px 12px', borderRadius: 8,
                                            background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
                                            fontSize: '0.68rem', color: 'var(--accent-violet)', lineHeight: 1.5,
                                        }}>
                                            {combo.adjustment}
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Footer buttons removed to favor info-bubble */}
                </div>
            </div>

            {/* Historical Pattern Match Panel */}
            {data.pattern_match && (() => {
                const pm = data.pattern_match
                const isPositive = pm.avg_return >= 0
                const winRateColor = pm.win_rate >= 60 ? 'var(--accent-emerald)' : pm.win_rate >= 40 ? 'var(--accent-amber)' : 'var(--accent-red)'
                return (
                    <div style={{
                        borderTop: '1px solid var(--glass-border)',
                        padding: '14px 20px',
                        background: 'rgba(6,182,212,0.03)',
                    }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent-cyan)', marginBottom: 8 }}>
                            {beginnerMode ? 'Historical Context' : '🔍 Historical Cross-Check — No Hallucination Pattern Scan'}
                        </div>

                        <AnimatePresence mode="wait">
                            {beginnerMode ? (
                                <motion.p
                                    key="simple-hist"
                                    initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}
                                    style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}
                                >
                                    We looked at past data. Similar historical situations resulted in a higher price <strong style={{ color: winRateColor }}>{pm.win_rate}% of the time</strong>.
                                </motion.p>
                            ) : (
                                <motion.div
                                    key="tech-hist"
                                    initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.2 }}
                                >
                                    <p style={{ fontSize: '0.77rem', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 10 }}>
                                        We scanned <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{pm.total_history_days.toLocaleString()} days</span> of historical data.
                                        {' '}The {beginnerMode ? 'setup' : 'Institutional Matcher'} identified {' '}
                                        <span style={{ color: 'var(--accent-violet)', fontWeight: 700 }}>{pm.total_matches} exact matches</span> where {' '}
                                        <span style={{ color: 'var(--accent-cyan)' }}>{pm.matched_indicators?.join(', ')}</span> aligned.
                                        {' '}In these cases, the stock went <span style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>UP {pm.win_rate}%</span> of the time,
                                        {' '}with an average return of{' '}
                                        <span style={{ color: isPositive ? 'var(--accent-emerald)' : 'var(--accent-red)', fontWeight: 700, fontFamily: 'monospace' }}>
                                            {isPositive ? '+' : ''}{pm.avg_return}%
                                        </span>.
                                    </p>
                                    <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                                        {[
                                            { label: 'Calculated WR', value: `${pm.win_rate}%`, color: winRateColor },
                                            { label: 'Avg Return', value: `${isPositive ? '+' : ''}${pm.avg_return}%`, color: isPositive ? 'var(--accent-emerald)' : 'var(--accent-red)' },
                                            { label: 'Analog Matches', value: pm.total_matches, color: 'var(--accent-violet)' },
                                            { label: 'Proof Chain', value: '4 Indicators', color: 'var(--accent-cyan)' },
                                        ].map(({ label, value, color }) => (
                                            <div key={label} style={{
                                                flex: 1, padding: '8px 10px', borderRadius: 8, textAlign: 'center',
                                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                                            }}>
                                                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
                                                <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1rem', color }}>{value}</div>
                                            </div>
                                        ))}
                                    </div>
                                    {pm.accuracy_audit && (
                                        <div style={{ fontSize: '0.6rem', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: 4, opacity: 0.8 }}>
                                            <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor' }} />
                                            Mathematically Verified: {pm.accuracy_audit}
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )
            })()}

            <ExplainModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                data={data}
                beginnerMode={beginnerMode}
            />
        </div>
    )
}
