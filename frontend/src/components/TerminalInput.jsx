import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { Terminal, ChevronRight, Loader, X, Lightbulb } from 'lucide-react'

const API_BASE = 'http://localhost:8000'

const EXAMPLE_QUERIES = [
    'I bought 10 shares of AAPL at $150. When should I sell?',
    'Should I buy TSLA now?',
    'What is the price target for RELIANCE.NS?',
    'I have 50 shares of INFY.NS at ₹1800. Hold or sell?',
    'Analyse NVDA stock for me',
    'I bought 5 BTC-USD at $40000. What is my projected profit?',
]

// ─── Colour-coded response renderer ──────────────────────────────────────────
function ResponseBlock({ entry }) {
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [showProof, setShowProof] = useState(false);

    // Upgraded recursive JSON -> JSX renderer for proof section (Syntax Highlighted HUD)
    const renderObject = (obj, level = 0) => {
        if (obj === null || obj === undefined) return <span className="text-pink-500/80 italic">null</span>;
        if (typeof obj === 'boolean') return <span className="text-purple-400">{String(obj)}</span>;
        if (typeof obj === 'number') return <span className="text-yellow-400">{obj}</span>;
        if (typeof obj === 'string') return <span className="text-green-400 wrap-break-word">"{obj}"</span>;

        if (Array.isArray(obj)) {
            if (obj.length === 0) return <span className="text-gray-500">[]</span>;
            return (
                <div className={`flex flex-col gap-1 mt-1 ${level > 0 ? 'pl-3 border-l border-gray-700/50 ml-1 hover:border-cyan-500/30 transition-colors duration-300' : ''}`}>
                    {obj.map((val, i) => (
                        <div key={i} className="flex items-start gap-2 group">
                            <span className="text-gray-600 text-[10px] mt-[2px] opacity-50 group-hover:opacity-100 transition-opacity">[{i}]</span>
                            <span>{renderObject(val, level + 1)}</span>
                        </div>
                    ))}
                </div>
            );
        }

        if (typeof obj === 'object') {
            const entries = Object.entries(obj);
            if (entries.length === 0) return <span className="text-gray-500">{"{}"}</span>;
            return (
                <div className={`flex flex-col gap-1.5 mt-1 ${level > 0 ? 'pl-3 border-l border-gray-700/50 ml-1 hover:border-cyan-500/30 transition-colors duration-300' : ''}`}>
                    {entries.map(([k, v], idx) => (
                        <div key={`${k || 'key'}-${level}-${idx}`} className="flex flex-col sm:flex-row sm:items-start sm:gap-2 leading-relaxed">
                            <span className="text-[11px] text-cyan-200/60 font-medium tracking-wide min-w-[110px] shrink-0">{k}:</span>
                            <div className="text-[11px] font-mono flex-1">
                                {renderObject(v, level + 1)}
                            </div>
                        </div>
                    ))}
                </div>
            );
        }
        return <span className="text-gray-300">{String(obj)}</span>;
    };

    // actionColors previously used for colour coding buy/hold/sel but unused now
    // const actionColors = {
    //     HOLD: 'var(--accent-amber)',
    //     BUY: 'var(--accent-emerald)',
    //     SELL: 'var(--accent-red)',
    // }

    if (!entry.response) return null
    const r = entry.response

    // conversational summary (fallback to old response text if human_summary missing)
    const humanText = r.human_summary || (r.explainable_response ? r.explainable_response.summary : r.response_text);

    return (
        <div style={{ marginTop: 8, paddingLeft: 14, borderLeft: '2px solid rgba(6,182,212,0.3)' }}>

            {/* Human-readable summary */}
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 6 }}>
                {humanText}
            </div>
            <button
                onClick={() => setShowDiagnostics(!showDiagnostics)}
                style={{
                    fontSize: '0.75rem', padding: '4px 10px', borderRadius: 6,
                    background: 'transparent', border: '1px solid var(--glass-border)',
                    color: 'var(--text-muted)', cursor: 'pointer', marginBottom: 12
                }}
            >
                Toggle AI Diagnostics ⚙️
            </button>

            {showDiagnostics && (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
                    {(() => {
                        const parsed = r.parsed || {};
                        const analysis = r.analysis || {};
                        const sentiment = r.sentiment || {};
                        const prediction = r.prediction || {};
                        const nlp = r.nlp || {};
                        return (
                            <>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Detected Intent</span>
                                    <span className="text-sm text-cyan-400 font-mono">{parsed.intent || 'N/A'}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Primary Ticker</span>
                                    <span className="text-sm text-purple-400 font-mono">{(() => {
                                        const ignore = ["I", "A", "U", "ME", "WE", "IT", "IS", "ON", "OF", "AT", "TO", "DO", "AM"];
                                        const list = parsed.tickers || (parsed.ticker ? [parsed.ticker] : []);
                                        const filtered = list.filter(t => !ignore.includes(t.toUpperCase()));
                                        return filtered.length ? filtered.join(', ') : 'N/A';
                                    })()}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Confidence</span>
                                    <span className="text-sm text-green-400 font-mono">{parsed.confidence_interval != null ? `${parsed.confidence_interval}%` : 'N/A'}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Horizon</span>
                                    <span className="text-sm text-yellow-400 font-mono">{parsed.horizon_days != null ? `${parsed.horizon_days} Days` : 'N/A'}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Sentiment</span>
                                    <span className="text-sm text-pink-400 font-mono">{sentiment.overall || 'N/A'}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Prediction Model</span>
                                    <span className="text-sm text-indigo-400 font-mono">{prediction.model || 'N/A'}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Analysis Notes</span>
                                    <span className="text-sm text-gray-200 font-mono">{analysis.summary || 'N/A'}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">NLP Tags</span>
                                    <span className="text-sm text-teal-400 font-mono">{nlp.result?.tags?.map(t => t.label).join(', ') || 'N/A'}</span>
                                </div>

                                {/* Upgraded Raw Diagnostic HUD */}
                                <div className="col-span-full mt-4 border-t border-gray-700/50 pt-3">
                                    <button
                                        onClick={() => setShowProof(p => !p)}
                                        className="flex items-center gap-2 text-xs text-gray-400 hover:text-cyan-400 transition-colors px-3 py-1.5 rounded-md bg-black/30 border border-gray-700/50 w-fit"
                                    >
                                        <Terminal size={12} />
                                        {showProof ? 'Hide Deep Diagnostics' : 'View Deep Diagnostics'}
                                    </button>

                                    {showProof && (
                                        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 max-h-[450px] overflow-y-auto pr-2">
                                            {Object.entries({ parsed, analysis, prediction, sentiment, nlp }).map(([k, v], idx) => {
                                                if (!v || Object.keys(v).length === 0) return null;
                                                return (
                                                    <div
                                                        key={`${k || 'payload'}-${idx}`}
                                                        className="relative flex flex-col p-4 bg-black/40 rounded-xl border border-gray-700/50 shadow-inner overflow-hidden"
                                                    >
                                                        {/* Glowing top border indicator */}
                                                        <div className="absolute top-0 left-0 w-full h-[2px] bg-linear-to-r from-cyan-500/40 to-transparent" />

                                                        <div className="flex items-center gap-2 mb-3">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                                            <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest">
                                                                {k} Payload
                                                            </div>
                                                        </div>

                                                        <div className="font-mono text-gray-200 overflow-x-auto">
                                                            {renderObject(v)}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </>
                        );
                    })()}
                </div>
            )}
        </div>
    );
}

function Metric({ label, value, color, weight }) {
    return (
        <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)',
            position: 'relative', overflow: 'hidden'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
                {weight != null && weight !== 1.0 && (
                    <span style={{
                        fontSize: '0.55rem', fontWeight: 800, color: weight < 1.0 ? 'var(--accent-red)' : 'var(--accent-emerald)',
                        opacity: 0.8
                    }}>
                        x{weight.toFixed(2)}
                    </span>
                )}
            </div>
            <div className="mono" style={{ fontSize: '0.88rem', fontWeight: 700, color }}>{value}</div>

            {/* Weight background bar hint */}
            {weight != null && weight !== 1.0 && (
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, height: 2,
                    width: `${Math.min(weight * 50, 100)}%`,
                    background: weight < 1.0 ? 'var(--accent-red)' : 'var(--accent-emerald)',
                    opacity: 0.3
                }} />
            )}
        </div>
    )
}

function Tag({ label, value, color }) {
    const baseColor = color || 'var(--accent-cyan)'
    return (
        <span style={{
            padding: '2px 8px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 600,
            background: `${baseColor}14`, border: `1px solid ${baseColor}35`, color: baseColor,
        }}>
            {label}: <span style={{ color: 'var(--text-primary)' }}>{String(value)}</span>
        </span>
    )
}

// ─── Main Terminal Component ──────────────────────────────────────────────────
export default function TerminalInput() {
    const { token } = useAuth()
    const [input, setInput] = useState('')
    const [history, setHistory] = useState([])     // { query, response, loading, error, id }
    const [cmdHistory, setCmdHistory] = useState([]) // past typed commands
    const [histIdx, setHistIdx] = useState(-1)
    const [loading, setLoading] = useState(false)
    const [showHints, setShowHints] = useState(false)
    const inputRef = useRef(null)
    const bottomRef = useRef(null)

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [history])

    const submit = useCallback(async (query) => {
        const text = (query || input).trim()
        if (!text) return

        const id = Date.now()
        setHistory(h => [...h, { id, query: text, response: null, loading: true, error: null }])
        setCmdHistory(h => [text, ...h.slice(0, 49)])
        setInput('')
        setHistIdx(-1)
        setLoading(true)

        try {
            const headers = { 'Content-Type': 'application/json' }
            if (token) headers.Authorization = `Bearer ${token}`
            const res = await fetch(`${API_BASE}/api/query`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ text }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
            setHistory(h => h.map(e => e.id === id ? { ...e, response: data, loading: false } : e))
        } catch (err) {
            setHistory(h => h.map(e => e.id === id ? { ...e, error: err.message, loading: false } : e))
        } finally {
            setLoading(false)
        }
    }, [input, token])

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            submit()
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            const next = Math.min(histIdx + 1, cmdHistory.length - 1)
            setHistIdx(next)
            if (cmdHistory[next]) setInput(cmdHistory[next])
        } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            const next = Math.max(histIdx - 1, -1)
            setHistIdx(next)
            setInput(next === -1 ? '' : cmdHistory[next] || '')
        } else if (e.key === 'Escape') {
            setInput('')
            setShowHints(false)
        }
    }

    return (
        <div
            className="glass fade-up"
            style={{ borderRadius: 14, overflow: 'hidden', fontFamily: 'JetBrains Mono, monospace' }}
            onClick={() => inputRef.current?.focus()}
        >
            {/* Header */}
            <div style={{
                padding: '10px 16px', borderBottom: '1px solid var(--glass-border)',
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(0,0,0,0.3)',
            }}>
                {/* Traffic-light dots */}
                {['#ff5f57', '#febc2e', '#28c840'].map(c => (
                    <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
                ))}
                <Terminal size={13} color="var(--accent-cyan)" style={{ marginLeft: 8 }} />
                <span style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)', fontWeight: 600, letterSpacing: '0.06em' }}>
                    insightflow — query terminal
                </span>
                <div style={{ flex: 1 }} />
                <button
                    onClick={e => { e.stopPropagation(); setShowHints(s => !s) }}
                    title="Show example queries"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.65rem' }}
                >
                    <Lightbulb size={12} /> Examples
                </button>
                {history.length > 0 && (
                    <button
                        onClick={e => { e.stopPropagation(); setHistory([]) }}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                    >
                        <X size={12} />
                    </button>
                )}
            </div>

            {/* Example hints */}
            {showHints && (
                <div style={{
                    padding: '10px 16px', borderBottom: '1px solid var(--glass-border)',
                    background: 'rgba(6,182,212,0.04)',
                    display: 'flex', flexWrap: 'wrap', gap: 6,
                }}>
                    {EXAMPLE_QUERIES.map(q => (
                        <button
                            key={q}
                            onClick={e => { e.stopPropagation(); setShowHints(false); submit(q) }}
                            style={{
                                padding: '4px 10px', borderRadius: 5, cursor: 'pointer', fontSize: '0.67rem',
                                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)',
                                color: 'var(--text-secondary)', textAlign: 'left', lineHeight: 1.4,
                            }}
                            className="glass-hover"
                        >
                            {q}
                        </button>
                    ))}
                </div>
            )}

            {/* History log */}
            <div style={{ maxHeight: 460, overflowY: 'auto', padding: '10px 16px' }}>
                {history.length === 0 && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: 1.7 }}>
                        <span style={{ color: 'var(--accent-emerald)' }}>Welcome to InsightFlow Terminal.</span><br />
                        Type a natural language query — e.g. <span style={{ color: 'var(--accent-cyan)' }}>I bought 10 AAPL at $150. When should I sell?</span><br />
                        Press <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, fontSize: '0.65rem' }}>↑</kbd> for command history · <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 3, fontSize: '0.65rem' }}>Lightbulb</kbd> for examples.
                    </p>
                )}

                {history.map(entry => (
                    <div key={entry.id} style={{ marginBottom: 18 }}>
                        {/* User query */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <ChevronRight size={14} color="var(--accent-emerald)" style={{ flexShrink: 0, marginTop: 2 }} />
                            <span style={{ fontSize: '0.82rem', color: 'var(--accent-emerald)', fontWeight: 600, wordBreak: 'break-word' }}>
                                {entry.query}
                            </span>
                        </div>

                        {/* Loading */}
                        {entry.loading && (
                            <div style={{ paddingLeft: 22, marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-cyan)', fontSize: '0.75rem' }}>
                                <Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} />
                                Routing to Quant Brain… (first call loads ML models ~30s)
                            </div>
                        )}

                        {/* Error */}
                        {entry.error && (
                            <div style={{ paddingLeft: 22, marginTop: 6, color: 'var(--accent-red)', fontSize: '0.75rem' }}>
                                ⚠ {entry.error}
                            </div>
                        )}

                        {/* Response */}
                        {entry.response && <ResponseBlock entry={entry} />}
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            {/* Input line */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', borderTop: '1px solid var(--glass-border)',
                background: 'rgba(0,0,0,0.2)',
            }}>
                <ChevronRight size={14} color={loading ? 'var(--accent-amber)' : 'var(--accent-cyan)'} style={{ flexShrink: 0 }} />
                <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything — e.g. I bought 10 shares of AAPL at $150. When should I sell?"
                    disabled={loading}
                    style={{
                        flex: 1, background: 'transparent', border: 'none', outline: 'none',
                        color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '0.82rem', caretColor: 'var(--accent-cyan)',
                    }}
                    autoFocus
                    id="terminal-query-input"
                />
                {loading && <Loader size={13} color="var(--accent-amber)" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />}
            </div>
        </div>
    )
}