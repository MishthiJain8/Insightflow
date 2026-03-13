import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Zap } from 'lucide-react'

// Master Global Ticker List for Autocomplete
const TICKER_LIST = [
    // US Tech
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'MSFT', name: 'Microsoft' },
    { symbol: 'NVDA', name: 'NVIDIA' },
    { symbol: 'GOOGL', name: 'Alphabet' },
    { symbol: 'AMZN', name: 'Amazon' },
    { symbol: 'META', name: 'Meta Platforms' },
    { symbol: 'TSLA', name: 'Tesla' },
    { symbol: 'NFLX', name: 'Netflix' },
    { symbol: 'PLTR', name: 'Palantir' },
    { symbol: 'AMD', name: 'AMD' },
    { symbol: 'INTC', name: 'Intel' },
    { symbol: 'SNOW', name: 'Snowflake' },
    // US Finance & Market
    { symbol: 'JPM', name: 'JPMorgan Chase' },
    { symbol: 'V', name: 'Visa' },
    { symbol: 'MA', name: 'Mastercard' },
    { symbol: 'BAC', name: 'Bank of America' },
    // Indian Market
    { symbol: 'RELIANCE.NS', name: 'Reliance Industries' },
    { symbol: 'TCS.NS', name: 'Tata Consultancy' },
    { symbol: 'HDFCBANK.NS', name: 'HDFC Bank' },
    { symbol: 'INFY.NS', name: 'Infosys' },
    { symbol: 'ICICIBANK.NS', name: 'ICICI Bank' },
    { symbol: 'SBIN.NS', name: 'State Bank of India' },
    { symbol: 'TATAMOTORS.NS', name: 'Tata Motors' },
    // Crypto
    { symbol: 'BTC-USD', name: 'Bitcoin' },
    { symbol: 'ETH-USD', name: 'Ethereum' },
    { symbol: 'SOL-USD', name: 'Solana' },
    // Indices
    { symbol: '^GSPC', name: 'S&P 500' },
    { symbol: '^IXIC', name: 'NASDAQ' },
    { symbol: '^NSEI', name: 'Nifty 50' }
]

export default function UniversalSearch({ onSelect, onClear, placeholder = "Search global equities...", className = "" }) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState([])
    const [isOpen, setIsOpen] = useState(false)
    const [activeIndex, setActiveIndex] = useState(-1)
    const [loading, setLoading] = useState(false)

    const wrapperRef = useRef(null)
    const debounceTimerRef = useRef(null)

    // Handle outside click to close dropdown
    useEffect(() => {
        function handleClickOutside(e) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('touchstart', handleClickOutside)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
            document.removeEventListener('touchstart', handleClickOutside)
        }
    }, [])

    const fetchGlobalSearch = async (searchTerm) => {
        if (!searchTerm) {
            setResults([])
            setIsOpen(false)
            return
        }

        setLoading(true)
        try {
            // Adjust port if your API_BASE is different, assuming same origin or configured CORS
            const res = await fetch(`http://localhost:8000/api/search?q=${encodeURIComponent(searchTerm)}`)
            if (res.ok) {
                const data = await res.json()
                setResults(data)
                setIsOpen(data.length > 0)
                setActiveIndex(-1)
            }
        } catch (error) {
            console.error("Global search failed:", error)
        } finally {
            setLoading(false)
        }
    }

    const handleChange = (e) => {
        const val = e.target.value
        setQuery(val)

        // Debounce the actual API call (300ms)
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)

        if (!val.trim()) {
            setResults([])
            setIsOpen(false)
            return
        }

        debounceTimerRef.current = setTimeout(() => {
            fetchGlobalSearch(val.trim())
        }, 300)
    }

    const handleSearch = (e) => {
        e?.preventDefault()
        if (query.trim()) {
            setIsOpen(false)
            if (onSelect) onSelect(query.toUpperCase().trim())
        }
    }

    const clearSearch = () => {
        setQuery('')
        setResults([])
        setIsOpen(false)
        setActiveIndex(-1)
        if (onClear) onClear()
    }

    const handleKeyDown = (e) => {
        if (!isOpen || results.length === 0) {
            if (e.key === 'Enter') handleSearch(e);
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIndex(prev => (prev < results.length - 1 ? prev + 1 : prev))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIndex(prev => (prev > 0 ? prev - 1 : prev))
        } else if (e.key === 'Enter') {
            e.preventDefault()
            if (activeIndex >= 0) {
                const selected = results[activeIndex].symbol
                setQuery(selected)
                setIsOpen(false)
                if (onSelect) onSelect(selected)
            } else {
                handleSearch()
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false)
        }
    }

    const selectResult = (symbol) => {
        setQuery(symbol)
        setIsOpen(false)
        if (onSelect) onSelect(symbol)
    }

    return (
        <div ref={wrapperRef} className={`relative w-full z-150 ${className}`}>
            <form onSubmit={handleSearch} className="relative flex items-center w-full">
                <Search size={16} color="var(--accent-cyan)" className="absolute left-4" style={{ filter: 'drop-shadow(0 0 4px var(--accent-cyan))' }} />
                <input
                    type="text"
                    value={query}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => { if (results.length > 0) setIsOpen(true) }}
                    placeholder={placeholder}
                    className="w-full text-sm focus:outline-none transition-all shadow-inner glass-hover"
                    style={{
                        padding: '8px 44px 8px 42px',
                        borderRadius: 14,
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--glass-border)',
                        color: 'var(--text-primary)',
                        fontFamily: 'JetBrains Mono, monospace'
                    }}
                />

                {query && (
                    <button type="button" onClick={clearSearch} className="absolute right-3 p-1 transition-colors" style={{ color: 'var(--text-muted)' }} onMouseOver={e => e.currentTarget.style.color = 'white'} onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                        <X size={16} />
                    </button>
                )}
            </form>

            {/* Z-INDEX CRITICAL FIX: z-9999 floats absolutely over Three.JS Background and Lightweight Charts */}
            <AnimatePresence>
                {isOpen && results.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.98 }}
                        transition={{ type: 'spring', bounce: 0.4, duration: 0.4 }}
                        className="absolute top-full left-0 mt-2 z-10001 w-max min-w-[340px] shadow-[0_20px_50px_rgba(0,0,0,0.5),0_0_20px_rgba(0,242,255,0.1)] max-h-80 overflow-y-auto"
                        style={{
                            borderRadius: 16,
                            position: 'absolute',
                            background: 'rgba(8, 12, 18, 0.98)',
                            border: '1px solid rgba(0, 242, 255, 0.2)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)'
                        }}
                    >
                        {/* Little header in dropdown */}
                        <div style={{ padding: '8px 14px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent-cyan)', letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Zap size={10} /> {loading ? 'Searching Global Markets...' : 'Global Markets'}
                            </div>
                        </div>

                        {results.map((item, idx) => {
                            const isActive = idx === activeIndex
                            return (
                                <div
                                    key={item.symbol + idx}
                                    onPointerDown={(e) => {
                                        e.preventDefault()
                                        selectResult(item.symbol)
                                    }}
                                    onMouseDown={(e) => {
                                        e.preventDefault()
                                        selectResult(item.symbol)
                                    }}
                                    onTouchStart={(e) => {
                                        e.preventDefault()
                                        selectResult(item.symbol)
                                    }}
                                    onMouseEnter={() => setActiveIndex(idx)}
                                    className="px-4 py-3 cursor-pointer flex items-center transition-colors border-b last:border-0"
                                    style={{
                                        borderColor: 'rgba(255,255,255,0.05)',
                                        background: isActive ? 'rgba(0,242,255,0.12)' : 'transparent',
                                        color: isActive ? 'var(--accent-cyan)' : 'var(--text-primary)'
                                    }}
                                >
                                    <div style={{ flex: '0 0 100px' }}>
                                        <span className="font-bold font-mono tracking-wider" style={{ fontSize: '0.9rem', textShadow: isActive ? '0 0 15px rgba(0,242,255,0.6)' : 'none' }}>
                                            {item.symbol}
                                        </span>
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                        <span style={{
                                            fontSize: '0.7rem', padding: '3px 8px', borderRadius: 6,
                                            background: 'rgba(255,255,255,0.08)', color: 'white',
                                            fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)'
                                        }}>
                                            {item.exchange}
                                        </span>
                                        <span className="text-xs truncate font-medium" style={{ color: isActive ? '#fff' : 'var(--text-secondary)' }}>
                                            {item.shortname}
                                        </span>
                                    </div>
                                </div>
                            )
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
