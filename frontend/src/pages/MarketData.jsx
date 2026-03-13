import React, { useState, useEffect } from 'react'
import { Search, Globe2, Activity, TrendingUp, TrendingDown, Clock, Newspaper, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import UniversalSearch from '../components/UniversalSearch'

const API_BASE = 'http://localhost:8000'

function SentimentBadge({ score, label }) {
    if (!label || label === 'Neutral') {
        return <span className="text-xs px-2 py-1 rounded-md border font-medium" style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'var(--glass-border)', color: 'var(--text-muted)' }}>Neutral</span>
    }
    const isBull = label === 'Bullish'
    const color = isBull ? 'var(--accent-emerald)' : 'var(--accent-red)'
    const bg = isBull ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'
    const border = isBull ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'
    const Icon = isBull ? TrendingUp : TrendingDown
    return (
        <span className="text-[11px] px-2 py-1 rounded-md border flex items-center gap-1.5 font-bold uppercase tracking-wide" style={{ background: bg, borderColor: border, color }}>
            {label} ({score > 0 ? '+' : ''}{score.toFixed(2)})
            <Icon size={12} strokeWidth={2.5} />
        </span>
    )
}

function NewsCard({ item, index }) {
    const isBull = item.sentiment === 'Bullish'
    const isBear = item.sentiment === 'Bearish'
    const glowColor = isBull ? 'rgba(16,185,129,0.15)' : isBear ? 'rgba(239,68,68,0.15)' : 'transparent'
    const accentColor = isBull ? 'var(--accent-emerald)' : isBear ? 'var(--accent-red)' : 'var(--text-muted)'

    return (
        <motion.a
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.04 }}
            href={item.url} target="_blank" rel="noopener noreferrer"
            className="flex flex-col rounded-xl p-5 border cursor-pointer h-full transition-all duration-300 hover:scale-[1.02] group"
            style={{
                background: 'linear-gradient(to bottom right, rgba(20,20,25,0.7), rgba(10,10,15,0.9))',
                borderColor: 'var(--glass-border)',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: `0 4px 25px -10px ${glowColor}`
            }}>
            {/* Subtle glow edge based on sentiment */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: accentColor, opacity: 0.6 }} />

            <div className="flex justify-between items-start mb-3 gap-4">
                <SentimentBadge score={item.score} label={item.sentiment} />
                <span className="text-[10px] uppercase font-black tracking-widest opacity-70" style={{ color: 'var(--accent-cyan)' }}>{item.publisher}</span>
            </div>

            <h4 className="font-bold text-[15px] mb-3 group-hover:text-cyan-400 transition-colors" style={{ color: 'var(--text-primary)', lineHeight: 1.4 }}>{item.title}</h4>
            <p className="text-xs mb-5 flex-1 line-clamp-3" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{item.description}</p>

            <div className="flex justify-between items-center mt-auto pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                <span className="text-[11px] font-medium flex items-center gap-1.5 opacity-60" style={{ color: 'var(--text-muted)' }}>
                    <Clock size={12} /> {item.published_date}
                </span>
                <span className="text-[11px] font-bold flex items-center gap-1 group-hover:text-cyan-400 transition-colors" style={{ color: 'var(--text-muted)' }}>
                    Read <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                </span>
            </div>
        </motion.a>
    )
}

export default function MarketData() {
    const [query, setQuery] = useState('')
    const [activeSearch, setActiveSearch] = useState('')
    const [data, setData] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [visibleCount, setVisibleCount] = useState(12)

    // Initial load: Fetch global news
    useEffect(() => {
        fetchNews()
    }, [])

    const fetchNews = async (searchTarget = '') => {
        setLoading(true)
        setError(null)
        setData([])
        setVisibleCount(12)
        try {
            let endpoint;
            if (searchTarget) {
                const isTicker = /^[A-Z0-9.^=-]+$/.test(searchTarget.toUpperCase());
                endpoint = isTicker
                    ? `${API_BASE}/api/news/${encodeURIComponent(searchTarget.trim())}`
                    : `${API_BASE}/api/news?q=${encodeURIComponent(searchTarget.trim())}`;
            } else {
                endpoint = `${API_BASE}/api/news`;
            }

            const res = await fetch(endpoint)
            if (!res.ok) throw new Error(`HTTP Error ${res.status}`)
            const json = await res.json()
            setData(json)
            setActiveSearch(searchTarget)
        } catch (e) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    const handleLoadMore = () => {
        setVisibleCount(prev => prev + 12)
    }

    const isGlobal = !activeSearch

    return (
        <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto fade-up" style={{ padding: '10px 0', paddingBottom: '10vh', minHeight: '90vh' }}>

            {/* Header / Search Bar */}
            <div className="rounded-2xl p-8 border flex flex-col md:flex-row items-center gap-8 shadow-2xl overflow-visible" style={{ background: 'rgba(15, 20, 30, 0.4)', backdropFilter: 'blur(25px)', borderColor: 'rgba(255,255,255,0.08)', position: 'relative', zIndex: 100 }}>
                <div className="flex-1 text-center md:text-left">
                    <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                        <Newspaper color="var(--accent-fuchsia)" size={28} />
                        <h2 className="text-3xl font-black bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg, var(--accent-fuchsia), var(--accent-cyan))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.02em' }}>
                            InsightFlow News
                        </h2>
                    </div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Real-time NLP sentiment analysis across global financial markets.</p>
                </div>

                <div className="w-full md:w-[450px]">
                    <UniversalSearch
                        placeholder="Search stock, company, or sector news..."
                        onSelect={(t) => {
                            setQuery(t)
                            fetchNews(t)
                        }}
                        onClear={() => {
                            setQuery('')
                            fetchNews('')
                        }}
                    />
                </div>
            </div>

            {/* Content Area */}
            <motion.div
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 mt-4 mb-2 px-2"
            >
                {isGlobal ? <Globe2 color="var(--text-muted)" size={20} /> : <Activity color="var(--accent-cyan)" size={20} />}
                <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {isGlobal ? "Global Market Intelligence" : `Analysis Results: ${activeSearch.toUpperCase()}`}
                </h3>
                {!loading && data.length > 0 && (
                    <span className="text-xs font-mono px-2 py-1 rounded-md bg-white/5 border border-white/10 text-gray-400 ml-3">
                        {data.length} Articles Scanned
                    </span>
                )}
            </motion.div>

            <AnimatePresence mode="wait">
                {loading ? (
                    <motion.div
                        key="loading"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.02 }}
                        className="flex flex-col items-center justify-center py-40 gap-8 w-full"
                    >
                        <div className="relative">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                className="w-24 h-24 rounded-full border-t-2 border-b-2 border-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.3)]"
                            />
                            <Newspaper className="absolute inset-0 m-auto text-cyan-400" size={32} />
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-black bg-clip-text text-transparent bg-linear-to-r from-cyan-400 to-fuchsia-400 animate-pulse tracking-tight">
                                {activeSearch ? `Scanning Global Headlines for ${activeSearch.toUpperCase()}...` : "Aggregating Global Market Intelligence..."}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-3 font-mono uppercase tracking-[0.2em] opacity-80">Synchronizing Live NLP Sentiment Engine</p>
                        </div>
                    </motion.div>
                ) : error ? (
                    <motion.div
                        key="error"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-10 rounded-2xl border text-center shadow-2xl"
                        style={{ borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)', backdropFilter: 'blur(10px)' }}
                    >
                        <p className="text-lg font-bold mb-2" style={{ color: 'var(--accent-red)' }}>Analysis Interrupted</p>
                        <p className="text-sm opacity-70" style={{ color: 'var(--text-primary)' }}>{error}</p>
                    </motion.div>
                ) : data && data.length > 0 ? (
                    <motion.div
                        key="content"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="w-full"
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {data.slice(0, visibleCount).map((item, idx) => (
                                <NewsCard key={`${item.url}-${idx}`} item={item} index={idx % 12} />
                            ))}
                        </div>

                        {data.length > visibleCount && (
                            <div className="flex justify-center mt-16 mb-20">
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={handleLoadMore}
                                    className="px-12 py-5 rounded-2xl font-black text-xs tracking-[0.2em] uppercase transition-all border group relative overflow-hidden"
                                    style={{
                                        background: 'rgba(15, 23, 42, 0.6)',
                                        borderColor: 'rgba(255,255,255,0.1)',
                                        color: 'var(--text-primary)',
                                        backdropFilter: 'blur(15px)'
                                    }}
                                >
                                    <span className="flex items-center gap-4 relative z-10">
                                        Explore Deeper Insights
                                        <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform text-cyan-400" />
                                    </span>
                                    <div className="absolute inset-0 bg-linear-to-r from-cyan-500/20 via-fuchsia-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                </motion.button>
                            </div>
                        )}
                    </motion.div>
                ) : (
                    <motion.div
                        key="empty"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-40 rounded-2xl border border-dashed w-full"
                        style={{ background: 'rgba(0,0,0,0.3)', borderColor: 'rgba(255,255,255,0.1)' }}
                    >
                        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-6">
                            <Newspaper size={32} color="var(--text-muted)" className="opacity-40" />
                        </div>
                        <p className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>No Matching Headlines</p>
                        <p className="text-sm opacity-50" style={{ color: 'var(--text-muted)' }}>We couldn't find recent relevant news for "{activeSearch}".</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
