import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Activity, BarChart2, RefreshCw, Globe } from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://insightflow-api-git-main-mishthi-jains-projects.vercel.app' : 'http://localhost:8000')

const SECTORS = ['All', 'IT / Tech', 'Banking', 'Auto', 'FMCG', 'Pharma', 'Energy', 'US Tech', 'Crypto']

export default function Dashboard({ onSelectTicker }) {
    const [summary, setSummary] = useState(null)
    const [loading, setLoading] = useState(true)
    const [selectedSector, setSelectedSector] = useState('All')
    const [visibleGainers, setVisibleGainers] = useState(5)
    const [visibleLosers, setVisibleLosers] = useState(5)
    const [simpleMode, setSimpleMode] = useState(window.simpleMode || false)

    useEffect(() => {
        const handleToggle = () => setSimpleMode(window.simpleMode)
        window.addEventListener('toggle_simple_mode', handleToggle)
        return () => window.removeEventListener('toggle_simple_mode', handleToggle)
    }, [])

    const fetchSummary = useCallback(async (sector) => {
        setLoading(true)
        try {
            const url = sector === 'All'
                ? `${API_BASE}/api/market-summary`
                : `${API_BASE}/api/market-summary?sector=${encodeURIComponent(sector)}`
            const res = await fetch(url)
            const data = await res.json()
            setSummary(data)
        } catch (err) {
            console.error('Failed to fetch market summary', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        setVisibleGainers(5)
        setVisibleLosers(5)
        fetchSummary(selectedSector)
    }, [selectedSector, fetchSummary])

    const gainers = summary?.gainers ?? []
    const losers = summary?.losers ?? []
    const sectorPerf = summary?.sector_performance ?? []

    // ── Helpers ────────────────────────────────────────────────────────────────
    const SkeletonRow = () => (
        <div className="animate-pulse h-10 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }} />
    )

    const StockRow = ({ item, colorVar }) => (
        <div
            onClick={() => onSelectTicker(item.symbol)}
            className="glass-hover flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors"
            style={{ background: 'rgba(255,255,255,0.03)' }}
        >
            <div>
                <div className="mono text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{item.symbol}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.name}</div>
            </div>
            <div className="text-right">
                <div className="mono text-sm font-bold" style={{ color: colorVar }}>
                    {item.change_pct >= 0 ? '+' : ''}{item.change_pct.toFixed(2)}%
                </div>
                <div className="mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {item.price.toFixed(2)}
                </div>
            </div>
        </div>
    )

    const ShowMore = ({ visible, total, onMore }) => {
        if (total <= visible) return null
        return (
            <button
                onClick={onMore}
                className="w-full text-center text-xs font-semibold mt-2 py-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--accent-violet)', background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.15)' }}
            >
                Show More ↓ ({total - visible} remaining)
            </button>
        )
    }

    return (
        <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto fade-up hex-grid" style={{ padding: '10px 20px', paddingBottom: '10vh', minHeight: '100vh', borderRadius: 16 }}>

            {/* Header */}
            <div className="flex items-center justify-between" style={{ marginLeft: 4 }}>
                <div className="flex items-center gap-3">
                    <Activity color="var(--accent-cyan)" size={24} style={{ filter: 'drop-shadow(0 0 6px var(--accent-cyan))' }} />
                    <h2 className="text-xl font-bold" style={{
                        backgroundImage: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-violet))',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        filter: 'drop-shadow(0 0 8px rgba(0, 242, 255, 0.3))'
                    }}>
                        Market Dashboard
                    </h2>
                </div>

                <div className="flex items-center gap-4">
                    {/* Beginner Mode Toggle */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <div style={{
                            width: 36, height: 20, borderRadius: 10, background: simpleMode ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.1)',
                            position: 'relative', transition: 'background 0.3s'
                        }}
                            onClick={() => {
                                window.simpleMode = !window.simpleMode;
                                window.dispatchEvent(new Event('toggle_simple_mode'));
                            }}>
                            <div style={{
                                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                                position: 'absolute', top: 2, left: simpleMode ? 18 : 2, transition: 'left 0.3s'
                            }} />
                        </div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: simpleMode ? 'var(--accent-cyan)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Enable Simple Mode 💡
                        </span>
                    </label>

                    <button
                        onClick={() => fetchSummary(selectedSector)}
                        className="flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg transition-all"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'var(--text-muted)' }}
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Sector Filter Pills */}
            <div className="flex flex-wrap gap-2">
                {SECTORS.map(s => {
                    const active = selectedSector === s
                    return (
                        <button
                            key={s}
                            onClick={() => setSelectedSector(s)}
                            className="text-xs font-bold px-3 py-1.5 rounded-full transition-all"
                            style={{
                                background: active ? 'linear-gradient(135deg, var(--accent-cyan), var(--accent-violet))' : 'rgba(255,255,255,0.05)',
                                color: active ? '#fff' : 'var(--text-secondary)',
                                border: active ? '1px solid transparent' : '1px solid var(--glass-border)',
                                boxShadow: active ? '0 0 14px rgba(6,182,212,0.35)' : 'none',
                            }}
                        >
                            {s}
                        </button>
                    )
                })}
            </div>

            {/* Active sector label */}
            {selectedSector !== 'All' && (
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <Globe size={12} />
                    Showing tickers from <span style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>{selectedSector}</span> sector · up to 20 per list
                </div>
            )}

            {/* Three-panel layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                {/* ── Top Gainers ──────────────────────────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', bounce: 0.4, delay: 0.1 }}
                    className="glass rounded-xl p-5 border flex flex-col" style={{ borderColor: 'var(--glass-border)' }}
                >
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp size={18} color="var(--accent-emerald)" />
                        <h3 className="font-semibold text-sm tracking-wider uppercase" style={{ color: 'var(--text-primary)' }}>
                            Top Gainers
                        </h3>
                        {!loading && (
                            <span className="ml-auto text-xs mono" style={{ color: 'var(--text-muted)' }}>
                                {gainers.length} stocks
                            </span>
                        )}
                    </div>
                    <div className="flex flex-col gap-2 flex-1">
                        {loading
                            ? [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
                            : gainers.length
                                ? gainers.slice(0, visibleGainers).map((g, i) => <StockRow key={i} item={g} colorVar="var(--accent-emerald)" />)
                                : <div className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>No data available</div>
                        }
                    </div>
                    <ShowMore visible={visibleGainers} total={gainers.length} onMore={() => setVisibleGainers(v => v + 10)} />
                </motion.div>

                {/* ── Top Losers ───────────────────────────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', bounce: 0.4, delay: 0.2 }}
                    className="glass rounded-xl p-5 border flex flex-col" style={{ borderColor: 'var(--glass-border)' }}
                >
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingDown size={18} color="var(--accent-red)" />
                        <h3 className="font-semibold text-sm tracking-wider uppercase" style={{ color: 'var(--text-primary)' }}>
                            Top Losers
                        </h3>
                        {!loading && (
                            <span className="ml-auto text-xs mono" style={{ color: 'var(--text-muted)' }}>
                                {losers.length} stocks
                            </span>
                        )}
                    </div>
                    <div className="flex flex-col gap-2 flex-1">
                        {loading
                            ? [1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)
                            : losers.length
                                ? losers.slice(0, visibleLosers).map((l, i) => <StockRow key={i} item={l} colorVar="var(--accent-red)" />)
                                : <div className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>No data available</div>
                        }
                    </div>
                    <ShowMore visible={visibleLosers} total={losers.length} onMore={() => setVisibleLosers(v => v + 10)} />
                </motion.div>

                {/* ── Sector Performance ───────────────────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', bounce: 0.4, delay: 0.3 }}
                    className="glass rounded-xl p-5 border flex flex-col" style={{ borderColor: 'var(--glass-border)' }}
                >
                    <div className="flex items-center gap-2 mb-5">
                        <BarChart2 size={18} color="var(--accent-amber)" />
                        <h3 className="font-semibold text-sm tracking-wider uppercase" style={{ color: 'var(--text-primary)' }}>
                            Sector Performance
                        </h3>
                    </div>

                    {loading ? (
                        <div className="flex flex-col gap-4">
                            {[1, 2, 3, 4, 5, 6].map(i => <SkeletonRow key={i} />)}
                        </div>
                    ) : sectorPerf.length > 0 ? (
                        <div className="flex flex-col gap-4">
                            {sectorPerf.map((sec, i) => {
                                const isPos = sec.change >= 0
                                const colorVar = isPos ? 'var(--accent-emerald)' : 'var(--accent-red)'
                                const widthPct = Math.min(Math.abs(sec.change) / 3 * 100, 100)
                                const isActive = selectedSector === sec.name

                                return (
                                    <div
                                        key={i}
                                        className="flex flex-col gap-2 p-2 rounded-lg cursor-pointer transition-all"
                                        style={{
                                            background: isActive ? 'rgba(6,182,212,0.08)' : 'transparent',
                                            border: isActive ? '1px solid rgba(6,182,212,0.25)' : '1px solid transparent',
                                        }}
                                        onClick={() => setSelectedSector(sec.name)}
                                        title={`Click to filter by ${sec.name}`}
                                    >
                                        <div className="flex justify-between items-center text-xs font-semibold">
                                            <span style={{ color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)' }}>{sec.name}</span>
                                            <span className="mono" style={{ color: colorVar }}>
                                                {isPos ? '+' : ''}{sec.change.toFixed(2)}%
                                            </span>
                                        </div>
                                        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                            <div
                                                className="h-full rounded-full transition-all duration-1000"
                                                style={{ width: `${widthPct}%`, background: colorVar, boxShadow: `0 0 6px ${colorVar}` }}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        /* Static fallback with sectors that are clickable */
                        <div className="flex flex-col gap-3">
                            {SECTORS.filter(s => s !== 'All').map((secName, i) => {
                                const isActive = selectedSector === secName
                                return (
                                    <div
                                        key={i}
                                        className="flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all text-xs font-semibold"
                                        style={{
                                            background: isActive ? 'rgba(6,182,212,0.08)' : 'rgba(255,255,255,0.03)',
                                            border: isActive ? '1px solid rgba(6,182,212,0.25)' : '1px solid transparent',
                                            color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                                        }}
                                        onClick={() => setSelectedSector(secName)}
                                    >
                                        <span>{secName}</span>
                                        <span style={{ color: 'var(--text-muted)' }}>Click to filter →</span>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* Reset button when a sector is selected */}
                    {selectedSector !== 'All' && (
                        <button
                            onClick={() => setSelectedSector('All')}
                            className="mt-4 text-xs font-bold py-1.5 rounded-lg transition-all"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'var(--text-muted)' }}
                        >
                            ← Show All Sectors
                        </button>
                    )}
                </motion.div>
            </div>
        </div>
    )
}
