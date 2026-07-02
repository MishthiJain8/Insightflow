import React, { useState, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Search, FlaskConical, BarChart2, Zap } from 'lucide-react'
import BloombergChart from '../components/BloombergChart'
import TerminalInput from '../components/TerminalInput'
import AccuracyTracker from '../components/AccuracyTracker'
import PredictionCard from '../components/PredictionCard'
import IntelligenceFeed from '../components/IntelligenceFeed'
import UniversalSearch from '../components/UniversalSearch'
import BacktestCard from '../components/BacktestCard'

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://insightflow-api-git-main-mishthi-jains-projects.vercel.app' : 'http://localhost:8000')

export default function StrategyLab() {
    const [query, setQuery] = useState('')

    const [activeTicker, setActiveTicker] = useState(null)
    const [marketData, setMarketData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [activePeriod, setActivePeriod] = useState('1y')
    const [startAnalysis, setStartAnalysis] = useState(false)
    const [horizonDays, setHorizonDays] = useState(5)
    const [refreshKey, setRefreshKey] = useState(0)
    const [simpleMode, setSimpleMode] = useState(window.simpleMode || false)

    React.useEffect(() => {
        const handleToggle = () => setSimpleMode(window.simpleMode)
        window.addEventListener('toggle_simple_mode', handleToggle)
        return () => window.removeEventListener('toggle_simple_mode', handleToggle)
    }, [])

    const fetchMarket = useCallback(async (ticker, period = activePeriod) => {
        if (!ticker) return
        setLoading(true)
        setError(null)
        setActiveTicker(ticker)
        try {
            const res = await fetch(`${API_BASE}/api/market/${ticker}?period=${period}`)
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.detail || `HTTP ${res.status}`)
            }
            const data = await res.json()
            setMarketData(data)
        } catch (e) {
            setError(e.message)
            setMarketData(null)
        } finally {
            setLoading(false)
        }
    }, [activePeriod])

    const handleSearch = (e) => {
        e.preventDefault()
        if (query.trim()) {
            const ticker = query.trim().toUpperCase()
            setActivePeriod('1y')
            fetchMarket(ticker, '1y')
            setStartAnalysis(false)  // Reset — user must click Run Analysis again
        }
    }

    const handlePeriodChange = useCallback((period) => {
        setActivePeriod(period)
        if (activeTicker) fetchMarket(activeTicker, period)
    }, [activeTicker, fetchMarket])

    return (
        <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto fade-up" style={{ padding: '10px 0', paddingBottom: '30vh' }}>
            {/* Header Area */}
            <div className="flex items-center justify-between mb-2" style={{ marginLeft: 4 }}>
                <div className="flex items-center gap-3">
                    <FlaskConical color="var(--accent-fuchsia)" size={24} />
                    <h2 className="text-xl font-bold bg-clip-text text-transparent bg-linear-to-r from-fuchsia-400 to-violet-400" style={{ backgroundImage: 'linear-gradient(135deg, var(--accent-fuchsia), var(--accent-violet))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Strategy Lab
                    </h2>
                </div>

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
            </div>

            {/* Top Section: Search Bar */}
            <div className="glass rounded-xl p-6 border flex flex-col md:flex-row items-center gap-6" style={{ borderColor: 'var(--glass-border)', position: 'relative', zIndex: 50 }}>
                <div className="flex-1">
                    <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Simulation Environment</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Load an asset to analyse strategy backtests and run quantitative scenarios.</p>
                </div>

                <div className="w-full md:w-96">
                    <UniversalSearch
                        placeholder="Search ticker (e.g. NVDA, RELIANCE.NS)"
                        onSelect={(t) => {
                            setQuery(t)
                            setActivePeriod('1y')
                            fetchMarket(t, '1y')
                            setStartAnalysis(false)  // New ticker → require re-click
                        }}
                    />
                </div>

                {/* ⚡ Analysis Horizon + Manual Trigger */}
                {activeTicker && (
                    <div className="flex items-center gap-3 shrink-0">
                        {/* Horizon Input */}
                        <div className="flex flex-col gap-1">
                            <label style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                                Horizon (Days)
                            </label>
                            <input
                                type="number"
                                min={1}
                                max={90}
                                value={horizonDays}
                                onChange={e => setHorizonDays(Math.min(90, Math.max(1, parseInt(e.target.value) || 5)))}
                                disabled={startAnalysis}
                                className="font-mono font-bold text-center rounded-lg"
                                style={{
                                    width: 72, padding: '8px 6px', fontSize: '1rem',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(139,92,246,0.3)',
                                    color: 'var(--accent-violet)',
                                    outline: 'none',
                                }}
                            />
                        </div>
                        {/* Run Button */}
                        <button
                            onClick={() => {
                                setStartAnalysis(true)
                                setRefreshKey(pk => pk + 1)
                            }}
                            className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                            style={{
                                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                color: '#fff',
                                border: '1px solid rgba(139,92,246,0.4)',
                                boxShadow: '0 0 20px rgba(139,92,246,0.4)',
                                marginTop: 14,
                            }}
                        >
                            <Zap size={16} fill="currentColor" />
                            {startAnalysis ? 'Re-Run Analysis' : '⚡ Run Quant Analysis'}
                        </button>
                    </div>
                )}
            </div>

            {/* Error Banner */}
            {error && (
                <div className="p-3 rounded border text-sm" style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: 'var(--accent-red)' }}>
                    Failed to load asset: {error}
                </div>
            )}

            {/* Middle Section: Stock Chart */}
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', bounce: 0.4, duration: 0.8 }}
                className="h-[500px] w-full rounded-xl relative shadow-lg glass hex-grid"
            >
                {activeTicker ? (
                    <BloombergChart ticker={activeTicker} />
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                        <BarChart2 size={32} color="var(--text-muted)" />
                        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Enter a ticker above to load the chart</span>
                    </div>
                )}
            </motion.div>

            {/* Middle Section 2: AI Analysis Section */}
            {startAnalysis && activeTicker && (
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', bounce: 0.4, delay: 0.1, duration: 0.8 }}
                    className="mt-4 flex flex-col gap-6"
                >
                    <PredictionCard ticker={activeTicker} horizon={horizonDays} key={`pred-${refreshKey}`} />
                    <BacktestCard ticker={activeTicker} refreshKey={refreshKey} />
                    <IntelligenceFeed ticker={activeTicker} key={`feed-${refreshKey}`} />
                </motion.div>
            )}

            {/* Middle Section 3: Terminal */}
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', bounce: 0.4, delay: 0.2, duration: 0.8 }}
                className="mt-4"
            >
                <TerminalInput />
            </motion.div>

            {/* Bottom-most Section: Accuracy Tracker */}
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', bounce: 0.4, delay: 0.3, duration: 0.8 }}
                className="mt-4"
            >
                <AccuracyTracker />
            </motion.div>
        </div>
    )
}
