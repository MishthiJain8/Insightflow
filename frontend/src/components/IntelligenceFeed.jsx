import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { motion } from 'framer-motion'
import {
    Newspaper, Mic2, TrendingUp, TrendingDown, Minus,
    ExternalLink, RefreshCw, Brain, Zap, ChevronDown, ChevronUp, Clock
} from 'lucide-react'

const API_BASE = 'http://localhost:8000'

// ─── Sentiment Chip ───────────────────────────────────────────────────────────
function SentimentChip({ label, score, size = 'sm' }) {
    const map = {
        Bullish: { color: 'var(--accent-emerald)', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)', Icon: TrendingUp },
        Bearish: { color: 'var(--accent-red)', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)', Icon: TrendingDown },
        Neutral: { color: 'var(--text-muted)', bg: 'rgba(255,255,255,0.05)', border: 'var(--glass-border)', Icon: Minus },
    }
    const { color, bg, border, Icon } = map[label] ?? map.Neutral
    const pad = size === 'lg' ? '5px 12px' : '3px 8px'
    const fSize = size === 'lg' ? '0.78rem' : '0.65rem'

    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: pad, borderRadius: 5,
            background: bg, border: `1px solid ${border}`,
            color, fontWeight: 700, fontSize: fSize, letterSpacing: '0.04em',
            flexShrink: 0,
        }}>
            <Icon size={size === 'lg' ? 13 : 10} />
            {label}
            {score != null && (
                <span style={{ opacity: 0.7, fontWeight: 500 }}>
                    {score > 0 ? ` +${score}` : ` ${score}`}
                </span>
            )}
        </span>
    )
}

// ─── News Item ────────────────────────────────────────────────────────────────
function NewsItem({ item }) {
    const [expanded, setExpanded] = useState(false)

    return (
        <div style={{
            padding: '12px 14px',
            borderBottom: '1px solid var(--glass-border)',
            transition: 'background 0.15s',
        }}
            className="glass-hover"
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Title row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
                        <span style={{
                            fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)',
                            lineHeight: 1.4, flex: 1,
                        }}>
                            {item.title}
                        </span>
                    </div>

                    {/* Meta row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: item.description ? 6 : 0 }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                            {item.publisher}
                        </span>
                        {item.published && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                <Clock size={10} />{item.published}
                            </span>
                        )}
                    </div>

                    {/* Description toggle */}
                    {item.description && (
                        <>
                            {expanded && (
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 4, marginBottom: 6 }}>
                                    {item.description}
                                </p>
                            )}
                            <button
                                onClick={() => setExpanded(e => !e)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: 3, padding: 0 }}
                            >
                                {expanded ? <><ChevronUp size={11} />Hide</> : <><ChevronDown size={11} />Preview</>}
                            </button>
                        </>
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    {item.sentiment && <SentimentChip label={item.sentiment.label} score={item.sentiment.score} />}
                    {item.url && (
                        <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.65rem', textDecoration: 'none' }}
                        >
                            <ExternalLink size={10} /> Read
                        </a>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── Transcript Card ──────────────────────────────────────────────────────────
function TranscriptCard({ transcript }) {
    const [expanded, setExpanded] = useState(false)
    if (!transcript) return null

    return (
        <div style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Mic2 size={14} color="var(--accent-violet)" />
                    <span style={{ fontSize: '0.79rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {transcript.title}
                    </span>
                </div>
                <SentimentChip label={transcript.sentiment?.label} score={transcript.sentiment?.score} />
            </div>

            {/* Advanced Analysis Header (Phase 16) */}
            {transcript.advanced_analysis && !transcript.advanced_analysis.error && (
                <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                    {/* Verdict Box */}
                    {transcript.advanced_analysis.Verdict && (
                        <div style={{
                            flex: 1, padding: '12px', borderRadius: 8,
                            background: transcript.advanced_analysis.Verdict.value === 'BUY' ? 'rgba(16,185,129,0.08)' : transcript.advanced_analysis.Verdict.value === 'SELL' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                            border: `1px solid ${transcript.advanced_analysis.Verdict.value === 'BUY' ? 'rgba(16,185,129,0.3)' : transcript.advanced_analysis.Verdict.value === 'SELL' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Verdict</span>
                            <span style={{
                                fontSize: '1.2rem', fontWeight: 800,
                                color: transcript.advanced_analysis.Verdict.value === 'BUY' ? 'var(--accent-emerald)' : transcript.advanced_analysis.Verdict.value === 'SELL' ? 'var(--accent-red)' : 'var(--accent-amber)'
                            }}>{transcript.advanced_analysis.Verdict.value}</span>
                        </div>
                    )}

                    {/* Horizon Box */}
                    {transcript.advanced_analysis.Horizon && (
                        <div style={{
                            flex: 2, padding: '12px', borderRadius: 8,
                            background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.2)',
                            display: 'flex', flexDirection: 'column', justifyContent: 'center'
                        }}>
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Time Horizon Scope</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-violet)' }}>
                                {transcript.advanced_analysis.Horizon.value}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Dimensional Insights */}
            {transcript.advanced_analysis && !transcript.advanced_analysis.error && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {['Past Performance', 'Present Condition', 'Future Trajectory'].map(dim => {
                        const items = transcript.advanced_analysis[dim];
                        if (!items || items.length === 0) return null;

                        return (
                            <div key={dim} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderLeft: '2px solid var(--accent-cyan)', borderRadius: '0 6px 6px 0' }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: 6 }}>{dim}</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {items.map((item, idx) => (
                                        <span key={idx} style={{
                                            padding: '3px 8px', borderRadius: 4, fontSize: '0.68rem',
                                            background: item.sentiment === 'positive' ? 'rgba(16,185,129,0.1)' : item.sentiment === 'negative' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)',
                                            color: item.sentiment === 'positive' ? 'var(--accent-emerald)' : item.sentiment === 'negative' ? 'var(--accent-red)' : 'var(--text-secondary)',
                                            border: `1px solid ${item.sentiment === 'positive' ? 'rgba(16,185,129,0.2)' : item.sentiment === 'negative' ? 'rgba(239,68,68,0.2)' : 'var(--glass-border)'}`
                                        }}>
                                            {item.insight}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Old Key phrases fallback if advanced fails */}
            {(!transcript.advanced_analysis || transcript.advanced_analysis.error) && transcript.key_phrases?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', alignSelf: 'center', marginRight: 4 }}>Keywords:</span>
                    {transcript.key_phrases.map(p => (
                        <span key={p} style={{
                            padding: '2px 8px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 600,
                            background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)',
                            color: 'var(--accent-violet)', textTransform: 'capitalize',
                        }}>{p}</span>
                    ))}
                </div>
            )}

            {/* Transcript preview */}
            <div style={{
                background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '10px 12px',
                border: '1px solid rgba(255,255,255,0.06)', fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.7,
                maxHeight: expanded ? 'none' : (transcript.advanced_analysis && !transcript.advanced_analysis.error ? 60 : 120),
                overflow: 'hidden', position: 'relative',
            }}>
                {transcript.text}
                {!expanded && (
                    <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0, height: 40,
                        background: 'linear-gradient(transparent, rgba(10,22,40,0.95))',
                    }} />
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <button
                    onClick={() => setExpanded(e => !e)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-violet)', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 3, padding: 0 }}
                >
                    {expanded ? <><ChevronUp size={11} /> Collapse</> : <><ChevronDown size={11} /> Read Full Transcript</>}
                </button>
                {transcript.audio && (
                    <span style={{
                        fontSize: '0.62rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4,
                        padding: '3px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)',
                    }}>
                        <Brain size={10} />
                        {transcript.audio.note || 'Audio emotion engine analysis unavailable.'}
                    </span>
                )}
            </div>
        </div>
    )
}

// ─── Main Intelligence Feed Component ────────────────────────────────────────
export default function IntelligenceFeed({ ticker }) {
    const { token } = useAuth()
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [tab, setTab] = useState('news') // 'news' | 'transcript'

    const fetch_ = async (t) => {
        if (!t) return
        setLoading(true)
        setError(null)
        try {
            const res = await fetch(`${API_BASE}/api/intelligence/${t}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (!res.ok) throw new Error((await res.json()).detail || `HTTP ${res.status}`)
            setData(await res.json())
        } catch (e) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetch_(ticker) }, [ticker])

    // ── Loading skeleton ─────────────────────────────────────────────────────
    if (loading) {
        return (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.4 }} className="glass" style={{ borderRadius: 14, overflow: 'hidden', position: 'relative' }}>
                <div className="scanner-overlay" />
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--glass-border)', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div className="shimmer" style={{ width: 120, height: 14, borderRadius: 6 }} />
                </div>
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} style={{ padding: '12px 14px', borderBottom: '1px solid var(--glass-border)' }}>
                        <div className="shimmer" style={{ height: 13, width: '85%', marginBottom: 6, borderRadius: 5 }} />
                        <div className="shimmer" style={{ height: 11, width: '40%', borderRadius: 5 }} />
                    </div>
                ))}
            </motion.div>
        )
    }

    if (!ticker || !data) return null

    const tabs = [
        { id: 'news', label: `News (${data.news?.length ?? 0})`, Icon: Newspaper },
        { id: 'transcript', label: 'Earnings Call', Icon: Mic2 },
    ]

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', bounce: 0.4, delay: 0.15 }}
            className="glass" style={{ borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}
        >
            <div className="scanner-overlay" />
            {/* Header */}
            <div style={{
                padding: '12px 16px', borderBottom: '1px solid var(--glass-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Zap size={14} color="var(--accent-amber)" />
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Intelligence Feed
                    </span>
                    <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {data.company}
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {data.overall_sentiment && (
                        <SentimentChip label={data.overall_sentiment.label} score={data.overall_sentiment.score} size="lg" />
                    )}
                    <button
                        onClick={() => fetch_(ticker)}
                        title="Refresh"
                        style={{ background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                        className="glass-hover"
                    >
                        <RefreshCw size={12} />
                    </button>
                </div>
            </div>

            {/* Tab Bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.015)' }}>
                {tabs.map(({ id, label, Icon }) => {
                    const isActive = tab === id
                    return (
                        <button
                            key={id}
                            onClick={() => setTab(id)}
                            style={{
                                flex: 1, padding: '9px 12px', border: 'none', background: 'transparent',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                fontSize: '0.75rem', fontWeight: isActive ? 700 : 500,
                                color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)',
                                borderBottom: isActive ? '2px solid var(--accent-cyan)' : '2px solid transparent',
                                transition: 'all 0.15s',
                            }}
                        >
                            <Icon size={13} />
                            {label}
                        </button>
                    )
                })}
            </div>

            {/* Error */}
            {error && (
                <div style={{ padding: '12px 16px', color: 'var(--accent-red)', fontSize: '0.8rem' }}>
                    ⚠️ {error}
                </div>
            )}

            {/* Content */}
            <div style={{ overflowY: 'auto', maxHeight: 420 }}>
                {tab === 'news' && (
                    <>
                        {data.news?.length > 0
                            ? data.news.map((item, idx) => <NewsItem key={`${item.id || 'news'}-${idx}`} item={item} />)
                            : <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No news found for this ticker.</div>
                        }
                    </>
                )}
                {tab === 'transcript' && (
                    <TranscriptCard transcript={data.earnings_transcript} />
                )}
            </div>

            {/* Footer timestamp */}
            <div style={{
                padding: '6px 16px', borderTop: '1px solid var(--glass-border)',
                fontSize: '0.62rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5,
            }}>
                <Clock size={10} />
                Last refreshed: {data.generated_at ? new Date(data.generated_at).toLocaleTimeString() : '—'}
            </div>
        </motion.div>
    )
}
