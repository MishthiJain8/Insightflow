import React, { useState, useEffect, useMemo, useRef } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Briefcase, TrendingUp, TrendingDown, DollarSign, Plus, RefreshCw, BarChart2, Hash, Activity, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import UniversalSearch from '../components/UniversalSearch'
import PrecisionModal from '../components/PrecisionModal'
import PortfolioHistoryChart from '../components/PortfolioHistoryChart'
import TickerModal from '../components/TickerModal'
import { useAuth } from '../context/AuthContext'

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://insightflow-api-git-main-mishthi-jains-projects.vercel.app' : 'http://localhost:8000')

const CHART_COLORS = ['#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#14b8a6']

export default function Portfolio() {
    const { user, token } = useAuth()
    const [holdings, setHoldings] = useState([])
    const [history, setHistory] = useState([])
    const [portfolioHistory, setPortfolioHistory] = useState([])
    const [activeTab, setActiveTab] = useState('active')
    const [syncStatus, setSyncStatus] = useState({ active: false, message: '', total: 0, current: 0 })

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [refreshing, setRefreshing] = useState(false)
    const [alerts, setAlerts] = useState([])
    const [loadingAlerts, setLoadingAlerts] = useState(false)

    const [sellModal, setSellModal] = useState({ open: false, item: null })
    const [sellPrice, setSellPrice] = useState('')
    const [sellQty, setSellQty] = useState('')
    const [sellSubmitting, setSellSubmitting] = useState(false)

    const [precisionModal, setPrecisionModal] = useState(null) // holds the full alert object
    const [selectedTicker, setSelectedTicker] = useState(null) // holds ticker name for TickerModal

    const [formTicker, setFormTicker] = useState('')
    const [formQty, setFormQty] = useState('')
    const [formPrice, setFormPrice] = useState('')
    const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0])
    const [formSector, setFormSector] = useState('')
    const tickerInfoTimer = useRef(null)
    const [formSubmitting, setFormSubmitting] = useState(false)

    // when a ticker is chosen, auto-fetch live price but allow user override
    useEffect(() => {
        if (!formTicker) return
        // fetch lightweight market data
        fetch(`${API_BASE}/api/market/${formTicker}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => {
                if (!res.ok) throw new Error('quote fetch failed')
                return res.json()
            })
            .then(data => {
                if (data.current_price != null) {
                    setFormPrice(data.current_price)
                }
                if (data.sector) {
                    setFormSector(data.sector)
                }
            })
            .catch(e => {
                console.warn('Live price lookup failed', e)
            })
    }, [formTicker, token])

    // ── Fetch portfolio from backend, then enrich with live prices ────────────
    const fetchPortfolio = async (isRefetch = false) => {
        if (!user || !token) return
        if (isRefetch) setRefreshing(true)
        else setLoading(true)
        setError(null)

        try {
            const res = await fetch(`${API_BASE}/api/portfolio/summary`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (!res.ok) throw new Error('Failed to fetch portfolio')
            const { active_holdings, trade_history } = await res.json()

            // Enrich open holdings with live prices from backend
            let enriched = active_holdings
            if (active_holdings.length > 0) {
                const res = await fetch(`${API_BASE}/api/portfolio/prices`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ holdings: active_holdings }),
                })
                if (res.ok) enriched = await res.json()
            }

            setHoldings(enriched)
            setHistory(trade_history.map(h => ({
                ...h,
                avg_buy_price: h.buy_price,
                realized_pnl: h.realized_pnl ?? 0,
            })))

            // Note: window.dispatchEvent is handled in a separate useEffect below
        } catch (e) {
            setError(e.message)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    const fetchPortfolioHistory = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/portfolio/history`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) setPortfolioHistory(await res.json())
        } catch (e) {
            console.error('Failed to fetch portfolio history', e)
        }
    }

    const fetchAlerts = async () => {
        setLoadingAlerts(true)
        try {
            const res = await fetch(`${API_BASE}/api/portfolio/alerts`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) setAlerts(await res.json())
        } catch (e) {
            console.error('Failed to fetch alerts', e)
        } finally {
            setLoadingAlerts(false)
        }
    }

    const handleFullRefresh = async () => {
        setSyncStatus({ active: true, message: 'Initiating deep portfolio sync...', total: holdings.length, current: 0 })
        try {
            // Trigger background deep sync
            const res = await fetch(`${API_BASE}/api/portfolio/sync`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            setSyncStatus(prev => ({ ...prev, message: data.message }))
            
            // Poll for completion or just refresh periodically
            setTimeout(() => {
                fetchPortfolio(true)
                fetchAlerts()
                fetchPortfolioHistory()
            }, 3000) // First re-fetch soon after start

            // Keep status for 10s to show user it started
            setTimeout(() => setSyncStatus(prev => ({ ...prev, active: false })), 10000)
        } catch (e) {
            console.error('Sync failed', e)
            setSyncStatus({ active: false, message: '', total: 0, current: 0 })
        }
    }

    useEffect(() => {
        if (user) {
            fetchPortfolio()
            fetchAlerts()
            fetchPortfolioHistory()

            // Phase 9: Live Heartbeat (60 seconds)
            const interval = setInterval(() => {
                fetchPortfolio(true)
                fetchAlerts()
                fetchPortfolioHistory()
            }, 60000)
            return () => clearInterval(interval)
        }
    }, [user, token])

    // ── Sell: update via backend ─────────────────────────────────────
    const handleSell = async (e) => {
        e.preventDefault()
        if (!sellPrice || !sellQty || !sellModal.item || !user || !token) return
        setSellSubmitting(true)
        try {
            const item = sellModal.item
            const sp = parseFloat(sellPrice)
            const sq = parseFloat(sellQty)

            const res = await fetch(`${API_BASE}/api/portfolio/sell/${item.id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    sell_price: sp,
                    quantity: sq
                })
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.detail || 'Failed to sell holding')
            }
            setSellModal({ open: false, item: null })
            setSellPrice('')
            setSellQty('')
            await fetchPortfolio(true)
        } catch (e) {
            alert(e.message)
        } finally {
            setSellSubmitting(false)
        }
    }

    // ── Buy: insert via backend ──────────────────────────────────────
    const handleLiveBuy = async (e) => {
        e.preventDefault()
        if (!formTicker || !formQty || !formPrice || !user || !token) return
        setFormSubmitting(true)
        try {
            const res = await fetch(`${API_BASE}/api/portfolio/buy`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    ticker: formTicker.toUpperCase().trim(),
                    quantity: parseFloat(formQty),
                    buy_price: parseFloat(formPrice),
                    purchase_date: purchaseDate,
                    sector: formSector.trim() || 'General'
                })
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.detail || 'Failed to add holding')
            }
            alert(`Execution complete. ${formQty} shares of ${formTicker.toUpperCase()} have been securely added to your live portfolio.`)
            setFormTicker('')
            setFormQty('')
            setFormPrice('')
            setPurchaseDate(new Date().toISOString().split('T')[0])
            setFormSector('')
            await fetchPortfolio(true)
            fetchAlerts()
        } catch (e) {
            alert(e.message)
        } finally {
            setFormSubmitting(false)
        }
    }

    // ─── Calculations ──────────────────────────────────────────────────────────
    const metrics = useMemo(() => {
        let invested = 0
        let current = 0
        holdings.forEach(h => {
            invested += (h.buy_price || h.avg_buy_price || 0) * h.quantity
            current += h.current_value || 0
        })
        const unrealizedPnl = current - invested
        const unrealizedPct = invested > 0 ? (unrealizedPnl / invested) * 100 : 0

        let realizedPnl = 0
        history.forEach(h => { realizedPnl += (h.realized_pnl || 0) })

        const sectors = {}
        holdings.forEach(h => {
            const sec = h.sector || 'General'
            const val = h.current_value || (h.quantity * (h.live_price || h.buy_price || 0))
            sectors[sec] = (sectors[sec] || 0) + val
        })
        const chartData = Object.entries(sectors)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)

        return { invested, current: current || invested, unrealizedPnl, unrealizedPct, realizedPnl, chartData }
    }, [holdings, history])

    // push portfolio numbers to three.js whenever it changes
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('portfolio_update', { detail: { profit: metrics.unrealizedPnl } }))
    }, [metrics.unrealizedPnl])


    return (
        <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto fade-up" style={{ padding: '0 0', paddingBottom: '10vh' }}>

            {/* Modals */}
            {selectedTicker && (
                <TickerModal 
                    ticker={selectedTicker} 
                    onClose={() => setSelectedTicker(null)} 
                />
            )}

            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-2">
                <div>
                    <div className="flex items-center gap-4 mb-3">
                        <div className="p-3 rounded-2xl bg-linear-to-br from-[#8b5cf6]/20 to-[#06b6d4]/20 border border-white/10 shadow-lg">
                            <Briefcase className="text-[#06b6d4]" size={32} style={{ filter: 'drop-shadow(0 0 8px rgba(6,182,212,0.4))' }} />
                        </div>
                        <div>
                            <h2 className="text-4xl font-black tracking-tight text-white mb-1">
                                Portfolio <span className="text-[#06b6d4]">Studio</span>
                            </h2>
                            <div className="flex items-center gap-3">
                                <p className="text-sm text-gray-400 font-medium tracking-wide">Live Intelligence Portfolio</p>
                                <div className="h-1 w-1 rounded-full bg-gray-600" />
                                <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${syncStatus.active ? 'text-cyan-400' : 'text-gray-500'}`}>
                                    <Activity size={10} className={syncStatus.active ? 'animate-pulse' : ''} />
                                    {syncStatus.active ? 'Deep Analysis Active' : 'Real-time Tracking'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleFullRefresh}
                        disabled={syncStatus.active}
                        className="group relative flex items-center gap-2 px-6 py-3 rounded-2xl bg-linear-to-br from-[#8b5cf6] to-[#06b6d4] text-white text-sm font-bold shadow-[0_0_30px_rgba(139,92,246,0.2)] hover:shadow-[0_0_40px_rgba(139,92,246,0.4)] transition-all overflow-hidden border border-white/10"
                    >
                        <RefreshCw size={16} className={`${syncStatus.active ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                        {syncStatus.active ? 'Syncing Insights...' : 'Deep Analytics Sync'}
                    </button>

                    <button
                        className="p-3 rounded-2xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all font-bold group"
                        title="Add New Asset"
                    >
                        <Plus size={24} className="group-hover:rotate-90 transition-transform duration-300" />
                    </button>
                </div>
            </div>

            {/* Sync Progress Bar (Condition: syncStatus.active) */}
            <AnimatePresence>
                {syncStatus.active && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-2"
                    >
                        <div className="glass rounded-3xl p-5 border border-cyan-500/20 bg-cyan-500/5 relative overflow-hidden">
                        <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400 flex items-center gap-2">
                                    <Activity size={12} className="animate-pulse" /> {syncStatus.message}
                                </span>
                                <span className="text-[10px] font-mono text-fuchsia-400 opacity-50">Pulse Synchronizing...</span>
                            </div>
                            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                                <motion.div 
                                    className="h-full bg-linear-to-r from-cyan-500 via-fuchsia-500 to-cyan-500 bg-size-[200%_100%] shadow-[0_0_20px_rgba(139,92,246,0.5)]"
                                    initial={{ width: '0%', backgroundPosition: '0% 0%' }}
                                    animate={{ width: '100%', backgroundPosition: '200% 0%' }}
                                    transition={{ 
                                        width: { duration: 10, ease: "linear" },
                                        backgroundPosition: { duration: 3, repeat: Infinity, ease: "linear" }
                                    }}
                                />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Quick Action: Add Mock Holding */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-4xl p-8 border shadow-2xl relative overflow-visible z-200 isolate"
                style={{ background: 'rgba(10, 15, 25, 0.4)', borderColor: 'rgba(255,255,255,0.08)' }}
            >
                {/* Background Glow */}
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none" />

                <div className="flex flex-col lg:flex-row items-center gap-8 relative z-10">
                    <div className="lg:w-1/4">
                        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                            Execute <span className="text-[#06b6d4]">Live Order</span>
                        </h3>
                        <p className="text-xs text-gray-400 leading-relaxed font-medium">
                            Execute live asset acquisition to test AI strategies and track potential performance.
                        </p>
                    </div>

                    <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <div className="flex flex-col gap-2 relative">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-gray-500 ml-1">Asset Search</label>
                            <div className="relative border border-white/5 rounded-xl overflow-visible bg-black/20 focus-within:border-[#06b6d4]/40 transition-colors">
                                <UniversalSearch
                                    placeholder="Ticker (e.g. AAPL)"
                                    onSelect={(t) => setFormTicker(t)}
                                    className="bg-transparent!"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-gray-500 ml-1">Quantity</label>
                            <input
                                type="number"
                                step="0.01"
                                value={formQty}
                                onChange={e => setFormQty(e.target.value)}
                                className="w-full bg-black/20 border border-white/5 rounded-xl text-sm px-4 py-3 text-white focus:outline-none focus:border-[#06b6d4]/40 focus:bg-black/40 transition-all font-mono"
                                placeholder="0.00"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-gray-500 ml-1">Entry Price</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.01"
                                    value={formPrice}
                                    onChange={e => setFormPrice(e.target.value)}
                                    className="w-full bg-black/20 border border-white/5 rounded-xl text-sm px-4 py-3 text-white focus:outline-none focus:border-[#06b6d4]/40 focus:bg-black/40 transition-all font-mono"
                                    placeholder="Auto-calculating..."
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-40">
                                    <DollarSign size={12} className="text-[#06b6d4]" />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-gray-500 ml-1">Purchase Date</label>
                            <input
                                type="date"
                                value={purchaseDate}
                                onChange={e => setPurchaseDate(e.target.value)}
                                className="w-full bg-black/20 border border-white/5 rounded-xl text-sm px-4 py-3 text-cyan-400 focus:outline-none focus:border-[#06b6d4]/40 focus:bg-black/40 transition-all font-mono"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-gray-500 ml-1">Sector</label>
                            <input
                                type="text"
                                value={formSector}
                                onChange={e => setFormSector(e.target.value)}
                                className="w-full bg-black/20 border border-white/5 rounded-xl text-sm px-4 py-3 text-white focus:outline-none focus:border-[#06b6d4]/40 focus:bg-black/40 transition-all font-sans"
                                placeholder="e.g. Technology"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-gray-500 ml-1">Commit Order</label>
                            <button
                                disabled={formSubmitting || !formTicker}
                                onClick={handleLiveBuy}
                                className="group w-full h-[46px] bg-linear-to-r from-[#06b6d4] to-[#0891b2] text-white font-black text-xs rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.2)] hover:shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                {formSubmitting ? (
                                    <RefreshCw size={16} className="animate-spin" />
                                ) : (
                                    <>BUY ASSET <Plus size={16} className="group-hover:rotate-90 transition-transform duration-300" /></>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

            </motion.div>

            {(loading || syncStatus.active) ? (
                <div className="flex flex-col gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => <div key={i} className="animate-pulse h-32 rounded-2xl bg-white/5 border border-white/10" />)}
                    </div>
                    <div className="animate-pulse h-64 rounded-xl border bg-white/5 border-white/10" />
                </div>
            ) : (
                <>
                    {error && (
                        <div className="glass p-12 rounded-4xl border border-red-500/20 text-center flex flex-col items-center gap-6 my-20">
                            <div className="p-4 rounded-full bg-red-500/10 border border-red-500/20 text-red-500">
                                <AlertTriangle size={32} />
                            </div>
                            <div className="max-w-md">
                                <h2 className="text-xl font-black text-white mb-2 uppercase tracking-widest">Secure Ledger Error</h2>
                                <p className="text-sm text-gray-400 font-medium leading-relaxed">{error}</p>
                            </div>
                            <button onClick={() => fetchPortfolio(true)} className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-white transition-all">
                                Retry Handshake
                            </button>
                        </div>
                    )}
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-0">
                        {/* Active Capital */}
                        <motion.div
                            whileHover={{ y: -5, scale: 1.02 }}
                            className="glass p-10 rounded-4xl border relative overflow-hidden shadow-2xl group"
                            style={{ background: 'rgba(10, 15, 25, 0.4)', borderColor: 'rgba(139, 92, 246, 0.2)' }}
                        >
                            <div className="absolute top-0 right-0 w-48 h-48 bg-violet-600/10 rounded-full blur-[100px] -mr-20 -mt-20 group-hover:bg-violet-600/20 transition-all duration-700" />
                            <div className="flex items-center gap-4 mb-4 text-gray-500 relative z-10 font-black uppercase tracking-[0.2em] text-[10px]">
                                <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400">
                                    <Hash size={18} />
                                </div>
                                <span>Deployed Capital</span>
                            </div>
                            <div className="text-5xl font-black text-white tracking-tighter relative z-10 tabular-nums">
                                ${metrics.invested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className="mt-4 flex items-center gap-2 relative z-10">
                                <span className="h-1.5 w-1.5 rounded-full bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,1)]" />
                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Asset Basis Value</span>
                            </div>
                        </motion.div>

                        {/* Unrealized P&L */}
                        <motion.div
                            whileHover={{ y: -5, scale: 1.02 }}
                            className={`glass p-10 rounded-4xl border relative overflow-hidden shadow-2xl group`}
                            style={{
                                background: 'rgba(10, 15, 25, 0.4)',
                                borderColor: metrics.unrealizedPnl >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'
                            }}
                        >
                            <div className={`absolute -top-20 -right-20 w-64 h-64 rounded-full blur-[100px] opacity-20 ${metrics.unrealizedPnl >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            <div className={`flex items-center gap-4 mb-4 relative z-10 font-black uppercase tracking-[0.2em] text-[10px] ${metrics.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                <div className={`p-2 rounded-lg border ${metrics.unrealizedPnl >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                    {metrics.unrealizedPnl >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                                </div>
                                <span>Yield Performance</span>
                            </div>
                            <div className="flex items-center gap-4 relative z-10 tabular-nums">
                                <div className="text-5xl font-black text-white tracking-tighter">
                                    {metrics.unrealizedPnl >= 0 ? '+' : '-'}${Math.abs(metrics.unrealizedPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className={`text-xl font-black px-3 py-1 rounded-xl glass-strong border ${metrics.unrealizedPnl >= 0 ? 'text-emerald-400 border-emerald-500/20' : 'text-red-400 border-red-500/20'}`}>
                                    {metrics.unrealizedPnl >= 0 ? '+' : '-'}{metrics.unrealizedPct.toFixed(2)}%
                                </div>
                            </div>
                            <div className="mt-4 flex items-center gap-2 relative z-10">
                                <span className={`h-1.5 w-1.5 rounded-full ${metrics.unrealizedPnl >= 0 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]'}`} />
                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Unrealized Market Shift</span>
                            </div>
                        </motion.div>

                        {/* Realized P&L */}
                        <motion.div
                            whileHover={{ y: -5, scale: 1.02 }}
                            className="glass p-10 rounded-4xl border relative overflow-hidden shadow-2xl group"
                            style={{ background: 'rgba(10, 15, 25, 0.4)', borderColor: metrics.realizedPnl >= 0 ? 'rgba(6, 182, 212, 0.2)' : 'rgba(239, 68, 68, 0.2)' }}
                        >
                            <div className={`absolute -bottom-20 -left-20 w-64 h-64 rounded-full blur-[100px] opacity-20 ${metrics.realizedPnl >= 0 ? 'bg-cyan-500' : 'bg-red-500'}`} />
                            <div className={`flex items-center gap-4 mb-4 relative z-10 font-black uppercase tracking-[0.2em] text-[10px] ${metrics.realizedPnl >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                                <div className={`p-2 rounded-lg border ${metrics.realizedPnl >= 0 ? 'bg-cyan-500/10 border-cyan-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                    <DollarSign size={18} />
                                </div>
                                <span>Exit P&L Summary</span>
                            </div>
                            <div className="text-5xl font-black text-white tracking-tighter relative z-10 tabular-nums">
                                {metrics.realizedPnl >= 0 ? '+' : '-'}${Math.abs(metrics.realizedPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className="mt-4 flex items-center gap-2 relative z-10">
                                <span className={`h-1.5 w-1.5 rounded-full ${metrics.realizedPnl >= 0 ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,1)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]'}`} />
                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Realized Liquidation Value</span>
                            </div>
                        </motion.div>
                    </div>

                    {/* AI Guardian Alerts Panel */}
                    {(alerts.length > 0 || loadingAlerts) && (
                        <div className="flex flex-col gap-6 fade-up bg-black/20 border border-white/5 p-8 rounded-[2.5rem] shadow-inner">
                            <div className="flex items-center justify-between px-2">
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <Activity size={20} className="text-fuchsia-500" />
                                        <div className="absolute inset-x-0 -bottom-1 h-0.5 bg-fuchsia-500 shadow-[0_0_10px_rgba(217,70,239,1)] scale-x-110" />
                                    </div>
                                    <h3 className="text-sm font-black uppercase tracking-[0.3em] text-white">Live AI Agent <span className="text-fuchsia-400">Intelligence</span></h3>
                                </div>
                                {loadingAlerts && <RefreshCw size={14} className="animate-spin text-fuchsia-400" />}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-h-[380px] overflow-y-auto">
                                {alerts.map((a, i) => {
                                    const action = a.action || 'MONITOR'
                                    const isRed = action.includes('SELL')
                                    const s = a.ai_status || action
                                    const colors = {
                                        SELL: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', text: '#ef4444', icon: <TrendingDown size={14} /> },
                                        'BUY MORE': { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)', text: '#10b981', icon: <TrendingUp size={14} /> },
                                        HOLD: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', text: '#f59e0b', icon: <Activity size={14} /> },
                                        MONITOR: { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', text: '#94a3b8', icon: <Hash size={14} /> },
                                    }
                                    const c = colors[s] || colors.MONITOR
                                    return (
                                        <motion.div
                                            key={i}
                                            whileHover={{ scale: 1.03 }}
                                            onClick={() => setPrecisionModal(a)}
                                            className="group glass p-6 rounded-3xl border relative overflow-hidden flex flex-col justify-between shadow-xl transition-all cursor-pointer"
                                            style={{ background: 'rgba(20, 20, 30, 0.4)', borderColor: c.border }}
                                        >
                                            <div className={`absolute -right-8 -top-8 w-32 h-32 rounded-full blur-[60px] opacity-30 ${isRed ? 'bg-red-500' : 'bg-emerald-500'}`} />

                                            <div className="flex justify-between items-center mb-4 relative z-10">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-black font-mono text-white tracking-widest text-lg px-3 py-1 bg-white/5 rounded-xl border border-white/10 group-hover:border-cyan-500/30 transition-colors">
                                                        {a.ticker || '???'}
                                                    </span>
                                                    <div className="h-1 w-1 rounded-full bg-gray-700" />
                                                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">Asset Alert</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border shadow-lg" style={{ background: c.bg, borderColor: c.border, color: c.text }}>
                                                    {c.icon}
                                                    {s}
                                                </div>
                                            </div>

                                            <div className="bg-black/20 p-4 rounded-2xl border border-white/5 relative z-10">
                                                <p className="text-xs text-gray-300 leading-relaxed font-medium line-clamp-3">{a.reason || 'No analysis available.'}</p>
                                            </div>

                                            <div className="mt-4 flex items-center justify-between relative z-10">
                                                <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Confidence Interval: {a.confidence || 0}%</span>
                                                <div className="h-0.5 w-12 bg-white/5 rounded-full overflow-hidden">
                                                    <div className="h-full bg-fuchsia-500" style={{ width: `${a.confidence || 0}%` }} />
                                                </div>
                                            </div>
                                        </motion.div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Historical Performance Chart */}
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="glass p-8 rounded-4xl border lg:col-span-2 flex flex-col min-h-[450px]"
                            style={{ background: 'rgba(10, 15, 25, 0.4)', borderColor: 'rgba(255,255,255,0.08)' }}
                        >
                            <div className="w-full flex items-center justify-between mb-8">
                                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-gray-400 flex items-center gap-3">
                                    <Activity size={16} className="text-[#8b5cf6]" /> High-Res <span className="text-white">Equity Performance</span>
                                </h3>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-[#8b5cf6] bg-[#8b5cf6]/10 px-2.5 py-1 rounded-lg border border-[#8b5cf6]/20 uppercase tracking-widest">
                                        {portfolioHistory.length > 90 ? 'All-Time Multi-Phase' : 'Recent Performance'}
                                    </span>
                                    <div className="h-1.5 w-1.5 rounded-full bg-[#8b5cf6] animate-pulse" />
                                </div>
                            </div>
                            <div className="flex-1">
                                <PortfolioHistoryChart data={portfolioHistory} />
                            </div>
                        </motion.div>

                        {/* Sector Donut Chart */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="glass p-8 rounded-4xl border col-span-1 flex flex-col items-center min-h-[450px]"
                            style={{ background: 'rgba(10, 15, 25, 0.4)', borderColor: 'rgba(255,255,255,0.08)' }}
                        >
                            <div className="w-full flex items-center justify-between mb-8">
                                <h3 className="text-xs font-black uppercase tracking-[0.3em] text-gray-400 flex items-center gap-3">
                                    <BarChart2 size={16} className="text-cyan-400" /> Sector <span className="text-white">Distribution</span>
                                </h3>
                                <div className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_8px_rgba(6,182,212,1)]" />
                            </div>

                            {metrics.chartData.length > 0 ? (
                                <div className="w-full h-full flex flex-col">
                                    <div className="flex-1 w-full relative min-h-[300px]">
                                        <ResponsiveContainer width="99%" height={300}>
                                            <PieChart>
                                                <Pie
                                                    data={metrics.chartData}
                                                    innerRadius={80}
                                                    outerRadius={110}
                                                    paddingAngle={5}
                                                    dataKey="value"
                                                    stroke="none"
                                                >
                                                    {metrics.chartData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} className="focus:outline-none" />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    formatter={(value) => `$${(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                                    contentStyle={{
                                                        background: 'rgba(5, 10, 15, 0.95)',
                                                        border: '1px solid rgba(255,255,255,0.1)',
                                                        borderRadius: '16px',
                                                        backdropFilter: 'blur(10px)',
                                                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                                                    }}
                                                    itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        {/* Center Label */}
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Total Valuation</span>
                                            <span className="text-xl font-black text-white">${(metrics.current || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                        </div>
                                    </div>
                                    <div className="mt-6 grid grid-cols-2 gap-3">
                                        {metrics.chartData.slice(0, 4).map((entry, index) => (
                                            <div key={index} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/5">
                                                <div className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
                                                <span className="text-[10px] font-bold text-gray-400 truncate w-full">{entry.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
                                    <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-dashed border-white/10">
                                        <BarChart2 size={32} className="text-gray-700" />
                                    </div>
                                    <p className="text-xs text-gray-500 font-medium">No exposure data available yet.</p>
                                </div>
                            )}
                        </motion.div>

                        {/* Ledger Table */}
                        <div className="glass p-0 rounded-4xl border col-span-1 lg:col-span-2 overflow-hidden flex flex-col shadow-2xl" style={{ background: 'rgba(10, 15, 25, 0.4)', borderColor: 'rgba(255,255,255,0.08)' }}>
                            <div className="px-8 pt-8 pb-4 flex justify-between items-center bg-transparent">
                                <div className="flex p-1 bg-black/40 rounded-2xl border border-white/5">
                                    <button
                                        onClick={() => setActiveTab('active')}
                                        className={`px-8 py-3 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all ${activeTab === 'active' ? 'bg-[#06b6d4] text-white shadow-[0_0_20px_rgba(6,182,212,0.3)]' : 'text-gray-500 hover:text-white'}`}
                                    >
                                        Active Holdings ({holdings.length})
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('history')}
                                        className={`px-8 py-3 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all ${activeTab === 'history' ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                                    >
                                        Trade History ({history.length})
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="h-1 w-12 bg-white/5 rounded-full" />
                                    <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Secure Ledger</span>
                                </div>
                            </div>

                            <div className="overflow-x-auto overflow-y-auto max-h-[400px] px-4 pb-4">
                                <table className="w-full text-left border-separate border-spacing-y-3">
                                    <thead>
                                        {activeTab === 'active' ? (
                                            <tr className="text-[9px] uppercase font-black tracking-[0.3em] text-gray-600 px-4">
                                                <th className="px-6 py-4">Asset Identification</th>
                                                <th className="px-4 py-4">Market Sector</th>
                                                <th className="px-4 py-4 text-right">Position Units</th>
                                                <th className="px-4 py-4 text-right">Acquisition</th>
                                                <th className="px-4 py-4 text-right">Current Index</th>
                                                <th className="px-4 py-4 text-right">Net Valuation</th>
                                                <th className="px-4 py-4 text-right">Analysis Meta</th>
                                                <th className="px-6 py-4 text-right">Management</th>
                                            </tr>
                                        ) : (
                                            <tr className="text-[9px] uppercase font-black tracking-[0.3em] text-gray-600 px-4">
                                                <th className="px-6 py-4">Asset Record</th>
                                                <th className="px-4 py-4">Sector</th>
                                                <th className="px-4 py-4 text-right">Quantity</th>
                                                <th className="px-4 py-4 text-right">Entry Value</th>
                                                <th className="px-4 py-4 text-right">Exit Value</th>
                                                <th className="px-4 py-4 text-right">Yield %</th>
                                                <th className="px-6 py-4 text-right">Net Result</th>
                                            </tr>
                                        )}
                                    </thead>
                                    <tbody className="before:block before:h-2">
                                        {activeTab === 'active' ? (
                                            holdings.length > 0 ? holdings.map((h, i) => {
                                                const isUp = h.total_profit >= 0
                                                const alertForTicker = alerts.find(a => a.ticker === h.ticker)
                                                return (
                                                    <motion.tr
                                                        key={i}
                                                        initial={{ opacity: 0, x: 20 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: i * 0.05 }}
                                                        className="group relative transition-all bg-white/5 hover:bg-white/10 rounded-2xl"
                                                    >
                                                        <td className="px-6 py-5 rounded-l-2xl border-l border-t border-b border-white/5">
                                                            <div className="flex items-center gap-4">
                                                                <div 
                                                                    onClick={() => setSelectedTicker(h.ticker)}
                                                                    className="w-10 h-10 rounded-xl bg-black/40 border border-white/5 flex items-center justify-center font-black text-xs text-white group-hover:border-cyan-500/30 transition-colors cursor-pointer"
                                                                    title="View Detailed Chart & Analytics"
                                                                >
                                                                    {(h.ticker || '?')[0]}
                                                                </div>
                                                                <div>
                                                                    <div 
                                                                        onClick={() => setSelectedTicker(h.ticker)}
                                                                        className="font-black text-sm text-white tracking-wider tabular-nums cursor-pointer hover:text-cyan-400 transition-colors"
                                                                    >
                                                                        {h.ticker || 'N/A'}
                                                                    </div>
                                                                    <div className="text-[10px] text-gray-600 font-bold uppercase mt-0.5">{h.buy_date ? new Date(h.buy_date).toLocaleDateString() : '—'}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-5 border-t border-b border-white/5">
                                                            <span className="text-[10px] font-black uppercase text-gray-500 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">{h.sector}</span>
                                                        </td>
                                                        <td className="px-4 py-5 text-sm text-right font-mono font-bold text-gray-300 border-t border-b border-white/5">{h.quantity}</td>
                                                        <td className="px-4 py-5 text-sm text-right font-mono text-gray-400 border-t border-b border-white/5">${(h.buy_price ?? h.avg_buy_price ?? 0).toFixed(2)}</td>
                                                        <td className="px-4 py-5 text-sm text-right font-mono text-white border-t border-b border-white/5">
                                                            <div className="flex flex-col items-end">
                                                                <span className="font-bold">${(h.live_price ?? 0).toFixed(2)}</span>
                                                                <span className={`text-[9px] font-black rounded-full px-2 py-0.5 mt-1 border tabular-nums ${(h.day_change ?? 0) >= 0 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'text-red-400 bg-red-500/10 border-red-500/20'}`}>
                                                                    {(h.day_change ?? 0) >= 0 ? '▲' : '▼'} {Math.abs(h.day_change ?? 0).toFixed(2)}%
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-5 border-t border-b border-white/5">
                                                            <div className="flex flex-col items-end gap-1 px-4 py-2 bg-black/40 rounded-xl border border-white/5">
                                                                <span className="text-xs font-black text-[#06b6d4] tabular-nums">${(h.current_value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                                <div className={`text-[9px] font-black tabular-nums ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                    {isUp ? '+' : ''}{(((h.total_profit || 0) / (((h.buy_price || h.avg_buy_price || 1) * (h.quantity || 1)) || 1)) * 100).toFixed(2)}%
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-5 border-t border-b border-white/5">
                                                            <div className="flex flex-col items-end gap-2">
                                                                {alertForTicker ? (
                                                                    <button
                                                                        onClick={() => setPrecisionModal(alertForTicker)}
                                                                        className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all hover:scale-105 active:scale-95`}
                                                                        style={{
                                                                            background: 'rgba(167, 139, 250, 0.1)',
                                                                            borderColor: 'rgba(167, 139, 250, 0.3)',
                                                                            color: '#c084fc'
                                                                        }}
                                                                    >
                                                                        {alertForTicker.ai_status || alertForTicker.action || 'MONITORING'}
                                                                    </button>
                                                                ) : (
                                                                    <span className="text-[10px] text-gray-700 font-black uppercase tracking-widest">Passive Mode</span>
                                                                )}
                                                                {alertForTicker?.precision_pct != null && (
                                                                    <div className="flex items-center gap-1.5">
                                                                        <div className="w-12 h-1 bg-white/5 rounded-full overflow-hidden">
                                                                            <div className="h-full bg-cyan-500" style={{ width: `${alertForTicker.precision_pct}%` }} />
                                                                        </div>
                                                                        <span className="text-[8px] font-black text-gray-600">{alertForTicker.precision_pct}% ACC</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-5 rounded-r-2xl border-r border-t border-b border-white/5 text-right">
                                                            <button
                                                                onClick={() => {
                                                                    setSellModal({ open: true, item: h })
                                                                    setSellPrice(h.live_price?.toString() || '')
                                                                    setSellQty(h.quantity?.toString() || '')
                                                                }}
                                                                className={`group/btn relative px-6 py-2 bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/40 text-gray-400 hover:text-red-400 text-[10px] font-black rounded-xl transition-all uppercase tracking-widest overflow-hidden`}
                                                            >
                                                                <div className="absolute inset-0 bg-red-500/0 group-hover/btn:bg-red-500/5 transition-colors" />
                                                                Liquidate
                                                            </button>
                                                        </td>
                                                    </motion.tr>
                                                )
                                            }) : (
                                                <tr>
                                                    <td colSpan="8" className="px-10 py-20 text-center">
                                                        <div className="max-w-xs mx-auto flex flex-col items-center gap-4">
                                                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-dashed border-white/10">
                                                                <Hash size={24} className="text-gray-700" />
                                                            </div>
                                                            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest leading-relaxed">System Ready: No active assets identified in the secure ledger.</p>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        ) : (
                                            history.length > 0 ? history.map((h, i) => {
                                                const isUp = (h.realized_pnl || 0) >= 0
                                                const buyVal = (h.buy_price ?? h.avg_buy_price ?? 0)
                                                const sellVal = (h.sell_price ?? 0)
                                                const returnPct = buyVal > 0 ? ((sellVal - buyVal) / buyVal) * 100 : 0
                                                return (
                                                    <motion.tr
                                                        key={i}
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        transition={{ delay: i * 0.05 }}
                                                        className="bg-black/20 hover:bg-black/40 transition-all rounded-2xl"
                                                    >
                                                        <td className="px-6 py-5 rounded-l-2xl border-l border-t border-b border-white/5">
                                                            <div 
                                                                onClick={() => setSelectedTicker(h.ticker)}
                                                                className="font-black text-sm text-gray-400 tracking-wider tabular-nums cursor-pointer hover:text-cyan-400 transition-colors"
                                                            >
                                                                {h.ticker || 'N/A'}
                                                            </div>
                                                            <div className="text-[10px] text-gray-600 font-bold uppercase mt-1">Exited {h.sell_date ? new Date(h.sell_date).toLocaleDateString() : '—'}</div>
                                                        </td>
                                                        <td className="px-4 py-5 border-t border-b border-white/5">
                                                            <span className="text-[10px] font-black uppercase text-gray-700 bg-white/5 px-2.5 py-1 rounded-lg">{h.sector || 'General'}</span>
                                                        </td>
                                                        <td className="px-4 py-5 text-sm text-right font-mono font-bold text-gray-500 border-t border-b border-white/5">{h.quantity || 0}</td>
                                                        <td className="px-4 py-5 text-sm text-right font-mono text-gray-600 border-t border-b border-white/5">${buyVal.toFixed(2)}</td>
                                                        <td className="px-4 py-5 text-sm text-right font-mono text-gray-400 border-t border-b border-white/5 font-bold">${sellVal.toFixed(2)}</td>
                                                        <td className="px-4 py-5 text-right border-t border-b border-white/5">
                                                            <span className={`text-[10px] font-black px-3 py-1 rounded-full border tabular-nums ${isUp ? 'text-emerald-500/60 border-emerald-500/10 bg-emerald-500/5' : 'text-red-500/60 border-red-500/10 bg-red-500/5'}`}>
                                                                {isUp ? '+' : ''}{returnPct.toFixed(2)}%
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-5 rounded-r-2xl border-r border-t border-b border-white/5 text-right">
                                                            <div className={`text-sm font-black font-mono tabular-nums ${isUp ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
                                                                {isUp ? '+' : '-'}${Math.abs(h.realized_pnl || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </div>
                                                        </td>
                                                    </motion.tr>
                                                )
                                            })
                                                : (
                                                    <tr>
                                                        <td colSpan="7" className="px-10 py-20 text-center">
                                                            <p className="text-xs text-gray-600 font-black uppercase tracking-[0.3em]">Historical Archive Empty</p>
                                                        </td>
                                                    </tr>
                                                )
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Phase 8 & 15: Modals Layer - Absolute Root */}
            <AnimatePresence>
                {sellModal.open && (
                    <div className="fixed inset-0 z-10000 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="glass p-8 rounded-[2.5rem] border w-full max-w-md flex flex-col gap-6 shadow-[0_0_100px_rgba(239,68,68,0.1)] relative"
                            style={{ borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(15, 10, 10, 0.9)' }}
                        >
                            <button onClick={() => setSellModal({ open: false, item: null })} className="absolute top-6 right-6 text-gray-500 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-full">
                                <X size={24} />
                            </button>

                            <div className="text-center">
                                <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                                    <TrendingDown size={32} className="text-red-500" />
                                </div>
                                <h3 className="text-2xl font-black text-white uppercase tracking-tight">Liquidate Asset</h3>
                                <p className="text-sm text-gray-400 mt-2 font-medium">
                                    Position: <span className="text-red-400 font-mono font-bold tracking-wider">{sellModal.item?.quantity} {sellModal.item?.ticker}</span>
                                </p>
                            </div>

                            <form onSubmit={handleSell} className="flex flex-col gap-5">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] uppercase font-black tracking-[0.2em] text-gray-600 block px-1">Units to Sell</label>
                                        <input
                                            required
                                            type="number"
                                            step="0.01"
                                            max={sellModal.item?.quantity}
                                            value={sellQty}
                                            onChange={e => setSellQty(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-red-500/50 transition-all font-mono text-xl"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] uppercase font-black tracking-[0.2em] text-gray-600 block px-1">Exit Price</label>
                                        <input
                                            required
                                            type="number"
                                            step="0.01"
                                            value={sellPrice}
                                            onChange={e => setSellPrice(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-red-500/50 transition-all font-mono text-xl"
                                        />
                                    </div>
                                </div>

                                <div className="bg-red-500/5 border border-red-500/10 p-4 rounded-2xl text-center">
                                    <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">
                                        Market Valuation: ${(parseFloat(sellQty || 0) * (sellModal.item?.live_price || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                </div>

                                <button
                                    disabled={sellSubmitting}
                                    type="submit"
                                    className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-5 rounded-2xl transition-all shadow-[0_10px_30px_rgba(220,38,38,0.3)] hover:shadow-[0_15px_40px_rgba(220,38,38,0.5)] active:scale-[0.98] uppercase tracking-widest text-xs"
                                >
                                    {sellSubmitting ? 'EXECUTING ORDER...' : 'EXECUTE LIQUIDATION'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}

                {precisionModal && (
                    <PrecisionModal alert={precisionModal} onClose={() => setPrecisionModal(null)} />
                )}
            </AnimatePresence>
        </div>
    )
}
