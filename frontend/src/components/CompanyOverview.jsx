import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
    Building2, TrendingUp, DollarSign, BarChart3,
    Globe, Layers, ChevronDown, ChevronUp, Percent
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtCurrency(value, currency = 'USD') {
    if (value == null) return '—'
    return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency,
        notation: 'compact', maximumFractionDigits: 2,
    }).format(value)
}

function fmtNumber(value, decimals = 2) {
    if (value == null) return '—'
    return new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value)
}

function fmtLarge(n) {
    if (n == null) return '—'
    if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
    if (n >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`
    if (n >= 1e5) return `${(n / 1e5).toFixed(1)}L`
    return n.toLocaleString('en-IN')
}

// ─── Single Metric Row ────────────────────────────────────────────────────────
function Metric({ icon: Icon, label, value, color, accent }) {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            padding: '10px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--glass-border)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Icon size={11} color="var(--text-muted)" />
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 600 }}>
                    {label}
                </span>
            </div>
            <div className="mono" style={{ fontSize: '0.88rem', fontWeight: 700, color: color ?? 'var(--text-primary)', lineHeight: 1.2 }}>
                {value}
            </div>
        </div>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CompanyOverview({ data, loading }) {
    const [expanded, setExpanded] = useState(false)

    // Loading skeleton
    if (loading) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.4, delay: 0.1 }}
                className="glass" style={{ borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
            >
                <div className="shimmer" style={{ height: 16, width: '60%' }} />
                <div className="shimmer" style={{ height: 12, width: '40%' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="shimmer" style={{ height: 52, borderRadius: 8 }} />
                    ))}
                </div>
                <div className="shimmer" style={{ height: 80, borderRadius: 8 }} />
            </motion.div>
        )
    }

    if (!data) return null

    const metrics = [
        { icon: DollarSign, label: 'Market Cap', value: fmtLarge(data.market_cap) },
        { icon: TrendingUp, label: 'P / E Ratio', value: data.pe_ratio ? fmtNumber(data.pe_ratio) : '—' },
        { icon: BarChart3, label: 'EPS (TTM)', value: data.eps ? fmtNumber(data.eps, 4) : '—' },
        { icon: Percent, label: 'Div Yield', value: data.dividend_yield ? `${(data.dividend_yield * 100).toFixed(2)}%` : '—' },
        { icon: TrendingUp, label: '52W High', value: fmtNumber(data.week_52_high, 2), color: 'var(--accent-emerald)' },
        { icon: TrendingUp, label: '52W Low', value: fmtNumber(data.week_52_low, 2), color: 'var(--accent-red)' },
        { icon: BarChart3, label: 'Avg Volume', value: fmtLarge(data.avg_volume) },
        { icon: TrendingUp, label: 'Beta', value: data.beta ? fmtNumber(data.beta, 2) : '—' },
    ]

    const summary = data.business_summary || ''
    const previewLen = 240
    const showToggle = summary.length > previewLen
    const displayedSummary = expanded || !showToggle ? summary : summary.slice(0, previewLen) + '…'

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.4, delay: 0.1 }}
            className="glass" style={{ borderRadius: 14, overflow: 'hidden' }}
        >
            {/* Header */}
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Building2 size={14} color="var(--accent-violet)" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Company Overview
                    </span>
                </div>

                {/* Tags row */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {data.sector && (
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 8px', borderRadius: 5,
                            background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)',
                            fontSize: '0.68rem', color: 'var(--accent-violet)', fontWeight: 600,
                        }}>
                            <Layers size={10} /> {data.sector}
                        </span>
                    )}
                    {data.industry && (
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 8px', borderRadius: 5,
                            background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.18)',
                            fontSize: '0.68rem', color: 'var(--accent-cyan)', fontWeight: 500,
                        }}>
                            {data.industry}
                        </span>
                    )}
                    {data.country && (
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 8px', borderRadius: 5,
                            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)',
                            fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 500,
                        }}>
                            <Globe size={10} /> {data.country}
                        </span>
                    )}
                </div>
            </div>

            {/* Metrics grid */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {metrics.map((m, idx) => <Metric key={`${m.label || 'met'}-${idx}`} {...m} />)}
                </div>
            </div>

            {/* Business summary */}
            {summary && (
                <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 600, marginBottom: 8 }}>
                        About
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
                        {displayedSummary}
                    </p>
                    {showToggle && (
                        <button
                            onClick={() => setExpanded(e => !e)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4, marginTop: 8,
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                color: 'var(--accent-cyan)', fontSize: '0.72rem', fontWeight: 600, padding: 0,
                            }}
                        >
                            {expanded ? <><ChevronUp size={13} /> Show less</> : <><ChevronDown size={13} /> Show more</>}
                        </button>
                    )}
                </div>
            )}
        </motion.div>
    )
}
