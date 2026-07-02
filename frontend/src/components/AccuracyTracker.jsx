import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import {
    CheckCircle2, XCircle, Clock, RefreshCw, TrendingUp,
    TrendingDown, ChevronDown, ChevronUp, Brain, AlertTriangle, Zap, X, Activity
} from 'lucide-react'
import AuditModal from './AuditModal'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

// ─── Accuracy Bar ─────────────────────────────────────────────────────────────
function AccuracyBar({ accuracy, count, correct, incorrect }) {
    const pct = accuracy != null ? Math.round(accuracy * 100) : null
    const color = pct == null ? 'var(--text-muted)'
        : pct >= 65 ? 'var(--accent-emerald)'
            : pct >= 55 ? 'var(--accent-amber)'
                : 'var(--accent-red)'

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
            {/* Big accuracy number */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '1.6rem', fontWeight: 800, color, lineHeight: 1 }}>
                    {pct != null ? `${pct}%` : '—'}
                </span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Rolling Accuracy
                </span>
            </div>

            {/* Bar */}
            <div style={{ flex: 1 }}>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{
                        height: '100%', width: `${pct ?? 0}%`,
                        background: color,
                        borderRadius: 4, transition: 'width 0.8s ease',
                        boxShadow: `0 0 8px ${color}`,
                    }} />
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    <span>✅ {correct ?? 0} correct</span>
                    <span>❌ {incorrect ?? 0} incorrect</span>
                    <span>Sample: {count ?? 0}</span>
                    {pct != null && pct < 55 && (
                        <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>
                            ⚠️ Below threshold — auto-retraining active
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── Status Icon ─────────────────────────────────────────────────────────────
function StatusIcon({ result }) {
    const res = result?.toUpperCase()
    if (res === 'CORRECT') return <CheckCircle2 size={14} color="var(--accent-emerald)" />
    if (res === 'INCORRECT') return <XCircle size={14} color="var(--accent-red)" />
    return <Clock size={14} color="var(--text-muted)" style={{ opacity: 0.6 }} />
}



// (Inline AuditModal replaced by dedicated Phase 9 component)


// ─── Main Component ───────────────────────────────────────────────────────────
// ─── Ticker Group Row ────────────────────────────────────────────────────────
function TickerGroup({ ticker, predictions, onRowClick, defaultOpen }) {
    const [isOpen, setIsOpen] = useState(defaultOpen || false)

    const evaluated = predictions.filter(p => p.actual_result)
    const correct = evaluated.filter(p => p.actual_result?.toUpperCase() === 'CORRECT').length
    const winRate = evaluated.length > 0 ? Math.round((correct / evaluated.length) * 100) : null

    return (
        <div style={{ borderBottom: '1px solid var(--glass-border)' }}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
                    cursor: 'pointer', background: isOpen ? 'rgba(255,255,255,0.02)' : 'transparent',
                    transition: 'background 0.2s'
                }}
                className="glass-hover"
            >
                <div style={{ width: 20, display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}>
                    {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
                <span className="mono" style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', width: 80 }}>
                    {ticker}
                </span>

                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 20 }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Scans</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{predictions.length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Win Rate</span>
                        <span style={{
                            fontSize: '0.75rem', fontWeight: 800,
                            color: winRate != null ? (winRate >= 60 ? 'var(--accent-emerald)' : winRate >= 50 ? 'var(--accent-amber)' : 'var(--accent-red)') : 'var(--text-muted)'
                        }}>
                            {winRate != null ? `${winRate}%` : '—'}
                        </span>
                    </div>
                </div>

                {/* Mini chart visual or progress indicator if needed */}
                <div style={{ height: 4, width: 60, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                        height: '100%', width: `${winRate ?? 0}%`,
                        background: winRate != null ? (winRate >= 60 ? 'var(--accent-emerald)' : 'var(--accent-amber)') : 'transparent'
                    }} />
                </div>
            </div>

            {isOpen && (
                <div style={{ background: 'rgba(0,0,0,0.1)', paddingLeft: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: 'rgba(255,255,255,0.01)' }}>
                            <tr>
                                {['Predicted At', 'Horizon', 'Direction', 'Confidence', 'Target Date', 'Result', 'Entry → Actual'].map(h => (
                                    <th key={h} style={{
                                        padding: '6px 12px', textAlign: 'left', fontSize: '0.55rem',
                                        color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {predictions.map(row => (
                                <PredRow key={row.id} row={row} onClick={onRowClick} isCompact />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

// ─── Single Prediction Row (Compact variant) ────────────────────────────────
function PredRow({ row, onClick, isCompact }) {
    const isUp = row.predicted_direction === 'UP'
    const dirColor = isUp ? 'var(--accent-emerald)' : 'var(--accent-red)'
    const DirIcon = isUp ? TrendingUp : TrendingDown
    const dateStr = row.date_predicted ? new Date(row.date_predicted).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
    const evalDate = row.evaluate_after ? new Date(row.evaluate_after) : null
    const now = new Date()
    const isReady = evalDate && evalDate <= now && !row.actual_result
    const evalStr = row.evaluate_after ?? '—'
    const hasAudit = !!row.detailed_analysis

    return (
        <tr
            onClick={() => hasAudit && onClick(row)}
            style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.1s', cursor: hasAudit ? 'pointer' : 'default' }}
            className="glass-hover"
            title={hasAudit ? 'Click to view audit trail' : 'No audit data available'}
        >
            {!isCompact && (
                <td className="mono" style={{ padding: '8px 12px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {row.ticker}
                </td>
            )}
            <td style={{ padding: '8px 12px', fontSize: '0.65rem', color: 'var(--text-muted)' }}>{dateStr}</td>
            <td style={{ padding: '8px 12px', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                {row.prediction_horizon ? `${row.prediction_horizon} Days` : '—'}
            </td>
            <td style={{ padding: '8px 12px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: dirColor, fontSize: '0.7rem', fontWeight: 700 }}>
                    <DirIcon size={10} />{row.predicted_direction}
                </span>
            </td>
            <td className="mono" style={{ padding: '8px 12px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                {row.predicted_prob != null ? `${row.predicted_prob}%` : '—'}
            </td>
            <td style={{ padding: '8px 12px' }}>
                {isReady ? (
                    <span className="pulse-cyan" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: '0.55rem', fontWeight: 900, textTransform: 'uppercase',
                        color: 'var(--accent-cyan)', background: 'rgba(6,182,212,0.1)',
                        padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(6,182,212,0.2)'
                    }}>
                        <Activity size={10} /> Ready
                    </span>
                ) : evalDate && evalDate > now ? (
                    <span style={{
                        fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-muted)',
                        display: 'inline-flex', alignItems: 'center', gap: 3
                    }}>
                        <Clock size={10} /> {row.target_date || evalStr}
                    </span>
                ) : (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{row.target_date || evalStr}</span>
                )}
            </td>
            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                <StatusIcon result={row.actual_result} />
            </td>
            <td className="mono" style={{ padding: '8px 12px', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                {row.price_at_prediction != null ? row.price_at_prediction.toFixed(2) : '—'} 
                {' → '}
                {row.actual_price != null ? (
                    <span style={{ color: row.actual_result === 'CORRECT' ? 'var(--accent-emerald)' : 'var(--accent-red)' }}>
                        {row.actual_price.toFixed(2)}
                    </span>
                ) : '—'}
            </td>
        </tr>
    )
}


// ─── Main Component ───────────────────────────────────────────────────────────
export default function AccuracyTracker({ tickerFilter }) {
    const { token } = useAuth()
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [open, setOpen] = useState(true)
    const [evalLoading, setEvalLoading] = useState(false)
    const [config, setConfig] = useState(null)
    const [selectedRow, setSelectedRow] = useState(null)

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const [predsRes, evalRes] = await Promise.all([
                fetch(`${API_BASE}/api/predictions`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${API_BASE}/api/model-config`),
            ])
            if (predsRes.ok) setData(await predsRes.json())
            if (evalRes.ok) setConfig(await evalRes.json())
        } catch (_) { }
        finally { setLoading(false) }
    }, [token])

    useEffect(() => { 
        fetchData()
        const handleRefresh = () => fetchData()
        window.addEventListener('prediction_saved', handleRefresh)
        return () => window.removeEventListener('prediction_saved', handleRefresh)
    }, [fetchData])

    const triggerEvaluate = async () => {
        setEvalLoading(true)
        try {
            await fetch(`${API_BASE}/api/predictions/evaluate`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            // Refresh local data
            await fetchData()
            // Sync notification bell
            window.dispatchEvent(new CustomEvent('eval-sync'))
        } catch (_) { }
        finally { setEvalLoading(false) }
    }

    const acc = data?.accuracy ?? {}
    const rawRows = data?.predictions ?? []

    // Grouping logic: Standard JS reduce
    const grouped = rawRows.reduce((acc, row) => {
        const t = row.ticker || 'UNKNOWN'
        if (!acc[t]) acc[t] = []
        acc[t].push(row)
        return acc
    }, {})

    let tickers = Object.keys(grouped).sort()
    if (tickerFilter) {
        tickers = tickers.filter(t => t === tickerFilter)
    }

    return (
        <div id="ticker-vault-accuracy" className="glass fade-up" style={{ borderRadius: 14, overflow: 'hidden' }}>

            {/* Audit Modal */}
            {selectedRow && <AuditModal prediction={selectedRow} onClose={() => setSelectedRow(null)} />}

            {/* Header */}
            <div
                onClick={() => setOpen(o => !o)}
                style={{
                    padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10,
                    cursor: 'pointer', borderBottom: open ? '1px solid var(--glass-border)' : 'none',
                    userSelect: 'none',
                }}
                className="glass-hover"
            >
                <Brain size={14} color="var(--accent-violet)" />
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Ticker Vault Accuracy
                </span>

                {/* Summary pill */}
                {data && (
                    <div style={{ flex: 1, marginLeft: 8 }}>
                        <AccuracyBar
                            accuracy={acc.accuracy} count={acc.evaluated_count}
                            correct={acc.correct} incorrect={acc.incorrect}
                        />
                    </div>
                )}

                {/* Config badge */}
                {config && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '3px 10px', borderRadius: 5,
                        background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)',
                        fontSize: '0.65rem', color: 'var(--accent-violet)', fontWeight: 600, flexShrink: 0,
                    }}>
                        <Zap size={10} />
                        RF {config.n_estimators}T·D{config.max_depth}
                    </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button
                        onClick={e => { e.stopPropagation(); triggerEvaluate() }}
                        disabled={evalLoading}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)',
                            borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                            color: 'var(--accent-cyan)', fontSize: '0.68rem', fontWeight: 600,
                        }}
                    >
                        <RefreshCw size={11} style={{ animation: evalLoading ? 'spin 0.8s linear infinite' : 'none' }} />
                        Evaluate
                    </button>
                    {open ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
                </div>
            </div>

            {/* Ticker Groups */}
            {open && (
                <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
                    {tickers.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            No predictions logged yet.
                        </div>
                    ) : (
                        tickers.map(t => (
                            <TickerGroup
                                key={t}
                                ticker={t}
                                predictions={grouped[t]}
                                onRowClick={setSelectedRow}
                                defaultOpen={tickers.length === 1 || !!tickerFilter}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    )
}

