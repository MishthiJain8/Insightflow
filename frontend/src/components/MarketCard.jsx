import React from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Globe, Star } from 'lucide-react'

export default function MarketCard({ data, loading, isWatched, onToggleWatch }) {
    if (loading) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.4 }}
                className="glass" style={{
                    borderRadius: 14, padding: 24,
                    minHeight: 180, display: 'flex', flexDirection: 'column', gap: 14
                }}
            >
                <div className="shimmer" style={{ height: 18, width: '40%' }} />
                <div className="shimmer" style={{ height: 40, width: '60%' }} />
                <div className="shimmer" style={{ height: 14, width: '30%' }} />
                <div style={{ display: 'flex', gap: 12, marginTop: 'auto' }}>
                    <div className="shimmer" style={{ height: 14, flex: 1 }} />
                    <div className="shimmer" style={{ height: 14, flex: 1 }} />
                    <div className="shimmer" style={{ height: 14, flex: 1 }} />
                </div>
            </motion.div>
        )
    }

    if (!data) return null

    const isPositive = data.change_pct >= 0
    const TrendIcon = isPositive ? TrendingUp : TrendingDown
    const trendColor = isPositive ? 'var(--accent-emerald)' : 'var(--accent-red)'

    const formatPrice = (price, currency) => {
        if (price == null) return '—'
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: currency || 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(price)
    }

    const formatLarge = (n) => {
        if (!n) return '—'
        if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`
        if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
        if (n >= 1e7) return `${(n / 1e7).toFixed(2)}Cr`
        if (n >= 1e5) return `${(n / 1e5).toFixed(2)}L`
        return n.toLocaleString()
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.4 }}
            className="glass"
            style={{
                borderRadius: 14, padding: 24,
                borderColor: isPositive ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                boxShadow: isPositive
                    ? '0 0 30px rgba(16,185,129,0.08)'
                    : '0 0 30px rgba(239,68,68,0.08)',
                transition: 'all 0.3s ease',
            }}
        >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Globe size={14} color="var(--text-muted)" />
                        <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                            {data.exchange || 'GLOBAL'}
                        </span>
                    </div>
                    <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                        {data.symbol}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {data.name}
                    </div>
                </div>

                {/* Actions & badge */}
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
                    <button
                        onClick={() => onToggleWatch?.()}
                        title={isWatched ? "Remove from Watchlist" : "Add to Watchlist"}
                        style={{
                            background: isWatched ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                            border: isWatched ? '1px solid rgba(245,158,11,0.3)' : '1px solid var(--glass-border)',
                            borderRadius: '50%', padding: 8, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s'
                        }}
                        className="glass-hover"
                    >
                        <Star size={16}
                            color={isWatched ? "var(--accent-amber)" : "var(--text-muted)"}
                            fill={isWatched ? "var(--accent-amber)" : "transparent"}
                        />
                    </button>

                    <div className={isPositive ? 'badge-positive' : 'badge-negative'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <TrendIcon size={12} />
                        {isPositive ? '+' : ''}{data.change_pct?.toFixed(2)}%
                    </div>
                </div>
            </div>

            {/* Price */}
            <div style={{ marginBottom: 20 }}>
                <div style={{
                    fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.03em',
                    color: trendColor,
                    fontFamily: "'JetBrains Mono', monospace",
                    lineHeight: 1,
                }}>
                    {formatPrice(data.current_price, data.currency)}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6 }}>
                    Prev close: <span style={{ color: 'var(--text-secondary)' }}>{formatPrice(data.previous_close, data.currency)}</span>
                    &nbsp;&nbsp;Δ&nbsp;
                    <span style={{ color: trendColor, fontFamily: 'JetBrains Mono, monospace' }}>
                        {isPositive ? '+' : ''}{data.change?.toFixed(4)}
                    </span>
                </div>
            </div>

            {/* Stats row */}
            <div className="glow-line-cyan" style={{ marginBottom: 16, opacity: 0.4 }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {[
                    { icon: DollarSign, label: 'Currency', value: data.currency || '—' },
                    { icon: BarChart3, label: 'Volume', value: formatLarge(data.volume) },
                    { icon: Globe, label: 'Market Cap', value: formatLarge(data.market_cap) },
                ].map(({ icon: Icon, label, value }) => (
                    <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Icon size={11} color="var(--text-muted)" />
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</span>
                        </div>
                        <div className="mono" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
                    </div>
                ))}
            </div>
        </motion.div>
    )
}
