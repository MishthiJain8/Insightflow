import React from 'react'
import { motion } from 'framer-motion'
import { X, TrendingUp, TrendingDown, Minus, Target, AlertTriangle, CheckCircle2, Activity } from 'lucide-react'

// Color maps
const STATUS_COLORS = {
    SELL: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.4)', text: '#f87171', glow: 'rgba(239,68,68,0.3)' },
    'BUY MORE': { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.4)', text: '#34d399', glow: 'rgba(16,185,129,0.3)' },
    HOLD: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)', text: '#fbbf24', glow: 'rgba(245,158,11,0.3)' },
    MONITOR: { bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.4)', text: '#94a3b8', glow: 'rgba(100,116,139,0.3)' },
}

function PrecisionArc({ pct }) {
    // SVG arc showing precision score (like a speedometer)
    if (pct == null) return (
        <div style={{ width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.4 }}>Insufficient<br />Data</span>
        </div>
    )
    const r = 32, cx = 40, cy = 40
    const circ = 2 * Math.PI * r
    const filled = (pct / 100) * circ
    const color = pct >= 70 ? '#06b6d4' : pct >= 50 ? '#f59e0b' : '#ef4444'
    return (
        <div style={{ position: 'relative', width: 80, height: 80 }}>
            <svg width="80" height="80" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8} />
                <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={8}
                    strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 0.8s ease', filter: `drop-shadow(0 0 6px ${color})` }} />
            </svg>
            <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexDirection: 'column', gap: 0,
            }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color, lineHeight: 1 }}>{pct}%</span>
                <span style={{ fontSize: '0.5rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Precision</span>
            </div>
        </div>
    )
}

const SIGNAL_ICONS = {
    UP: <TrendingUp size={14} color="#34d399" />,
    DOWN: <TrendingDown size={14} color="#f87171" />,
}

export default function PrecisionModal({ alert, onClose }) {
    if (!alert) return null

    const status = alert.ai_status || 'MONITOR'
    const cols = STATUS_COLORS[status] || STATUS_COLORS.MONITOR
    const ticker = alert.ticker
    const pnlPct = alert.unrealized_pnl_pct ?? null
    const pnlColor = pnlPct != null ? (pnlPct >= 0 ? '#34d399' : '#f87171') : 'var(--text-muted)'

    const precisionContext = () => {
        if (alert.precision_pct == null || alert.precision_samples < 3) {
            return `No prior predictions on record yet for ${ticker}. The AI is building accuracy data as you use the terminal.`
        }
        const direction = alert.direction === 'UP' ? 'rose' : 'fell'
        return `Based on ${alert.precision_samples} past predictions for ${ticker}, the AI was correct ${alert.precision_pct}% of the time. The last time this ${status === 'SELL' ? 'bearish' : status === 'BUY MORE' ? 'bullish' : 'mixed'} pattern occurred, ${ticker} ${direction} within 7 days.`
    }

    return (
        <div className="fixed inset-0 z-10000 flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={onClose}>
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                onClick={e => e.stopPropagation()}
                className="glass w-full max-w-xl rounded-4xl border p-10 flex flex-col gap-8 relative overflow-hidden shadow-2xl"
                style={{
                    background: 'rgba(10, 15, 25, 0.95)',
                    borderColor: cols.border,
                    boxShadow: `0 0 80px ${cols.glow}, 0 40px 100px rgba(0,0,0,0.6)`
                }}
            >
                {/* Background Decoration */}
                <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full blur-[120px] opacity-20" style={{ background: cols.text }} />

                {/* Close */}
                <button onClick={onClose} className="absolute top-8 right-8 text-gray-500 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-full z-20">
                    <X size={24} />
                </button>

                {/* Header Information */}
                <div className="flex items-start gap-6 relative z-10">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-inner border" style={{ background: cols.bg, borderColor: cols.border }}>
                        {status === 'SELL' ? '📉' : status === 'BUY MORE' ? '📈' : status === 'HOLD' ? '⚖️' : '👁️'}
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                            <h2 className="text-3xl font-black text-white tracking-widest font-mono uppercase italic">{ticker}</h2>
                            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-lg" style={{ background: cols.bg, borderColor: cols.border, color: cols.text }}>
                                {status} Signal
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Activity size={14} className="text-gray-500" />
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest letter-spacing-1">Deep Intelligence Context</p>
                        </div>
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                    <div className="p-6 rounded-3xl bg-white/5 border border-white/5 flex flex-col justify-center">
                        <span className="text-[10px] uppercase font-black tracking-widest text-gray-500 mb-2">Unrealized Performance</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-black tabular-nums tracking-tighter" style={{ color: pnlColor }}>
                                {pnlPct != null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%` : '—'}
                            </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-gray-500">
                            <span>In: ${alert.cost_basis?.toFixed(2) ?? '—'}</span>
                            <span className="text-gray-700">→</span>
                            <span className="text-white font-bold">${alert.live_price?.toFixed(2) ?? '—'}</span>
                        </div>
                    </div>

                    <div className="p-6 rounded-3xl bg-white/5 border border-white/5 flex items-center justify-center">
                        <PrecisionArc pct={alert.precision_pct} />
                    </div>
                </div>

                {/* AI Model Indicators */}
                <div className="grid grid-cols-3 gap-4 relative z-10">
                    <div className="p-4 rounded-2xl bg-black/40 border border-white/5 flex flex-col gap-1">
                        <span className="text-[9px] uppercase font-bold text-gray-600 tracking-widest">Sentiment</span>
                        <span className="text-xs font-black uppercase tracking-wider" style={{ color: alert.sentiment?.toLowerCase().includes('bear') ? '#f87171' : alert.sentiment?.toLowerCase().includes('bull') ? '#34d399' : '#94a3b8' }}>
                            {alert.sentiment ?? 'NEUTRAL'}
                        </span>
                    </div>
                    <div className="p-4 rounded-2xl bg-black/40 border border-white/5 flex flex-col gap-1">
                        <span className="text-[9px] uppercase font-bold text-gray-600 tracking-widest">Direction</span>
                        <div className="flex items-center gap-1.5">
                            {SIGNAL_ICONS[alert.direction]}
                            <span className="text-xs font-black uppercase tracking-wider text-white">{alert.direction ?? 'STABLE'}</span>
                        </div>
                    </div>
                    <div className="p-4 rounded-2xl bg-black/40 border border-white/5 flex flex-col gap-1">
                        <span className="text-[9px] uppercase font-bold text-gray-600 tracking-widest">Confidence</span>
                        <span className="text-xs font-black text-cyan-400 tabular-nums">{alert.confidence?.toFixed(0)}%</span>
                    </div>
                </div>

                {/* Reasoning Block */}
                <div className="relative z-10 p-6 rounded-3xl border shadow-inner overflow-hidden" style={{ background: `${cols.bg}`, borderColor: cols.border }}>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-lg bg-white/10 text-white">
                            <Target size={18} />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: cols.text }}>AI Analytical Reasoning</span>
                    </div>
                    <p className="text-sm font-medium leading-relaxed text-gray-200">
                        {alert.reason}
                    </p>
                </div>

                {/* Historical Narrative */}
                <div className="p-5 rounded-3xl bg-white/5 border border-white/5 relative z-10">
                    <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 size={14} className="text-violet-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-violet-400/80">Historical Engine Context</span>
                    </div>
                    <p className="text-xs leading-relaxed text-gray-400 font-medium italic">
                        "{precisionContext()}"
                    </p>
                </div>

                {/* Footer disclaimer */}
                <div className="flex items-center justify-center gap-2 relative z-10 pt-4 border-t border-white/5">
                    <AlertTriangle size={12} className="text-gray-600" />
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">
                        High Frequency Alpha Analysis — Non-Financial Advice
                    </p>
                </div>
            </motion.div>
        </div>
    )
}
