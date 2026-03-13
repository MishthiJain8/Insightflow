import React, { useState, useEffect, useCallback, useRef } from 'react'
import ThreeBackground from './components/ThreeBackground'
import Sidebar from './components/Sidebar'
import MarketCard from './components/MarketCard'
import BloombergChart from './components/BloombergChart'
import CompanyOverview from './components/CompanyOverview'
import Dashboard from './pages/Dashboard'
import MarketData from './pages/MarketData'
import StrategyLab from './pages/StrategyLab'
import Portfolio from './pages/Portfolio'
import EditProfile from './pages/EditProfile'
import UniversalSearch from './components/UniversalSearch'
import NotificationBell from './components/NotificationBell'
import { useAuth } from './context/AuthContext'
import { Search, RefreshCw, Activity, Globe2, Cpu, BarChart2, LogOut } from 'lucide-react'

const API_BASE = 'http://localhost:8000'

// suppress repetitive React warnings about blank keys (third‑party data)
// these occur during heartbeat refreshes and are non‑fatal but noisy.
if (typeof console !== 'undefined') {
    const origConsoleError = console.error.bind(console);
    console.error = (...args) => {
        if (typeof args[0] === 'string' && args[0].includes('Encountered two children with the same key') && args[0].includes('``')) {
            return;
        }
        origConsoleError(...args);
    };
}

// portfolio holdings cache used by chart markers

// ─── Ticker Suggestions Data ─────────────────────────────────────────────────
const TICKER_LIST = [
  // US Large Cap
  { symbol: 'AAPL', name: 'Apple Inc.', market: 'NASDAQ' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', market: 'NASDAQ' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', market: 'NASDAQ' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', market: 'NASDAQ' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', market: 'NASDAQ' },
  { symbol: 'META', name: 'Meta Platforms Inc.', market: 'NASDAQ' },
  { symbol: 'TSLA', name: 'Tesla Inc.', market: 'NASDAQ' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', market: 'NYSE' },
  { symbol: 'V', name: 'Visa Inc.', market: 'NYSE' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', market: 'NYSE' },
  { symbol: 'WMT', name: 'Walmart Inc.', market: 'NYSE' },
  { symbol: 'BAC', name: 'Bank of America', market: 'NYSE' },
  { symbol: 'XOM', name: 'Exxon Mobil', market: 'NYSE' },
  { symbol: 'MA', name: 'Mastercard Inc.', market: 'NYSE' },
  { symbol: 'AMD', name: 'Advanced Micro Devices', market: 'NASDAQ' },
  // India NSE
  { symbol: 'RELIANCE.NS', name: 'Reliance Industries', market: 'NSE' },
  { symbol: 'TCS.NS', name: 'Tata Consultancy Services', market: 'NSE' },
  { symbol: 'HDFCBANK.NS', name: 'HDFC Bank', market: 'NSE' },
  { symbol: 'INFY.NS', name: 'Infosys Limited', market: 'NSE' },
  { symbol: 'ICICIBANK.NS', name: 'ICICI Bank', market: 'NSE' },
  { symbol: 'HINDUNILVR.NS', name: 'Hindustan Unilever', market: 'NSE' },
  { symbol: 'KOTAKBANK.NS', name: 'Kotak Mahindra Bank', market: 'NSE' },
  { symbol: 'LT.NS', name: 'Larsen & Toubro', market: 'NSE' },
  { symbol: 'BAJFINANCE.NS', name: 'Bajaj Finance', market: 'NSE' },
  { symbol: 'WIPRO.NS', name: 'Wipro Limited', market: 'NSE' },
  { symbol: 'ADANIENT.NS', name: 'Adani Enterprises', market: 'NSE' },
  { symbol: 'TATAMOTORS.NS', name: 'Tata Motors', market: 'NSE' },
  { symbol: 'SUNPHARMA.NS', name: 'Sun Pharmaceutical', market: 'NSE' },
  { symbol: 'SBIN.NS', name: 'State Bank of India', market: 'NSE' },
  { symbol: 'BHARTIARTL.NS', name: 'Bharti Airtel', market: 'NSE' },
  // India BSE
  { symbol: 'RELIANCE.BO', name: 'Reliance Industries', market: 'BSE' },
  { symbol: 'INFY.BO', name: 'Infosys Limited', market: 'BSE' },
  { symbol: 'TCS.BO', name: 'TCS', market: 'BSE' },
  // Indices
  { symbol: '^NSEI', name: 'Nifty 50', market: 'INDEX' },
  { symbol: '^BSESN', name: 'BSE Sensex', market: 'INDEX' },
  { symbol: '^GSPC', name: 'S&P 500', market: 'INDEX' },
  { symbol: '^DJI', name: 'Dow Jones Industrial', market: 'INDEX' },
  { symbol: '^IXIC', name: 'NASDAQ Composite', market: 'INDEX' },
  { symbol: '^NSEBANK', name: 'Nifty Bank', market: 'INDEX' },
  { symbol: '^VIX', name: 'CBOE Volatility Index', market: 'INDEX' },
  // Crypto
  { symbol: 'BTC-USD', name: 'Bitcoin', market: 'CRYPTO' },
  { symbol: 'ETH-USD', name: 'Ethereum', market: 'CRYPTO' },
  { symbol: 'SOL-USD', name: 'Solana', market: 'CRYPTO' },
  { symbol: 'BNB-USD', name: 'Binance Coin', market: 'CRYPTO' },
  { symbol: 'XRP-USD', name: 'Ripple', market: 'CRYPTO' },
  { symbol: 'DOGE-USD', name: 'Dogecoin', market: 'CRYPTO' },
  { symbol: 'ADA-USD', name: 'Cardano', market: 'CRYPTO' },
  // Forex
  { symbol: 'USDINR=X', name: 'USD / Indian Rupee', market: 'FOREX' },
  { symbol: 'EURUSD=X', name: 'EUR / US Dollar', market: 'FOREX' },
  { symbol: 'GBPUSD=X', name: 'GBP / US Dollar', market: 'FOREX' },
  { symbol: 'USDJPY=X', name: 'USD / Japanese Yen', market: 'FOREX' },
]

const MARKET_COLORS = {
  NASDAQ: '#06b6d4', NYSE: '#8b5cf6', NSE: '#10b981',
  BSE: '#f59e0b', INDEX: '#64748b', CRYPTO: '#f97316', FOREX: '#ec4899',
}

// ─── Top Bar ──────────────────────────────────────────────────────────────────
function TopBar({ onSearch }) {
  const { user, profile, signOut } = useAuth()
  const initials = (profile?.full_name || user?.email || '?')[0].toUpperCase()

  return (
    <div className="glass" style={{ borderRadius: 12, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, overflow: 'visible', position: 'relative', zIndex: 9999 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: '0 0 auto' }}>
        <Activity size={15} color="var(--accent-cyan)" />
        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>InsightFlow Terminal</span>
      </div>
      <div style={{ width: 1, height: 22, background: 'var(--glass-border)' }} />
      <div style={{ display: 'flex', gap: 8, flex: 1, justifyItems: 'start', maxWidth: 500, zIndex: 9999 }}>
        <UniversalSearch onSelect={onSearch} placeholder="Search ticker, e.g. RELIANCE.NS, BTC-USD, AAPL…" />
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
        <NotificationBell />
        <div style={{ width: 1, height: 16, background: 'var(--glass-border)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Cpu size={12} color="var(--text-muted)" />
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Local Engine</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Globe2 size={12} color="var(--accent-emerald)" />
          <span style={{ fontSize: '0.7rem', color: 'var(--accent-emerald)' }}>Live Data</span>
        </div>

        {/* User Avatar - Consolidated Primary Anchor */}
        {user && (
          <>
            <div style={{ width: 1, height: 16, background: 'var(--glass-border)' }} />
            <div
              title={user.email}
              style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-violet))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', fontWeight: 800, color: '#fff', flexShrink: 0, cursor: 'default',
                boxShadow: '0 0 12px rgba(6,182,212,0.2)', border: '1px solid rgba(255,255,255,0.1)'
              }}
            >
              {initials}
            </div>
          </>
        )}
      </div>
    </div>
  )
}


// ─── Stats Bar ────────────────────────────────────────────────────────────────
function StatsBar() {
  const stats = [
    { label: 'Markets', value: '80+', color: 'var(--accent-cyan)' },
    { label: 'Intervals', value: '5m→1mo', color: 'var(--accent-violet)' },
    { label: 'Indicators', value: 'SMA·RSI', color: 'var(--accent-emerald)' },
    { label: 'Engine', value: '< 2s', color: 'var(--accent-amber)' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, flexShrink: 0 }}>
      {stats.map(({ label, value, color }) => (
        <div key={label} className="glass" style={{ borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: '1rem', fontWeight: 800, color, fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Welcome Panel ────────────────────────────────────────────────────────────
function WelcomePanel() {
  const tickers = ['AAPL', 'RELIANCE.NS', 'TCS.NS', 'BTC-USD', '^NSEI', 'MSFT', 'ETH-USD', '^GSPC', 'USDINR=X', 'HDFCBANK.NS']
  return (
    <div className="glass fade-up" style={{ borderRadius: 14, padding: '36px 28px', textAlign: 'center', flex: 1 }}>
      <div style={{
        width: 52, height: 52, borderRadius: 12, margin: '0 auto 16px',
        background: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(139,92,246,0.15))',
        border: '1px solid rgba(6,182,212,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <BarChart2 size={24} color="var(--accent-cyan)" />
      </div>
      <h3 className="gradient-text" style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>Global Markets at Your Fingertips</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: 360, margin: '0 auto 20px', lineHeight: 1.65 }}>
        Search any equity, index, crypto, or forex above to load live charts and company fundamentals.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center' }}>
        {tickers.map(t => (
          <span key={t} className="mono" style={{
            padding: '4px 11px', background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)', borderRadius: 6,
            fontSize: '0.73rem', color: 'var(--text-secondary)',
          }}>{t}</span>
        ))}
      </div>
    </div>
  )
}

// ─── Error Banner ─────────────────────────────────────────────────────────────
function ErrorBanner({ message }) {
  return (
    <div className="glass fade-up" style={{
      borderRadius: 10, padding: '11px 16px',
      border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.07)',
      color: 'var(--accent-red)', fontSize: '0.83rem',
    }}>⚠️ {message}</div>
  )
}

// ─── Chart View (two-column) ──────────────────────────────────────────────────
function ChartView({ data, loading, activeRange, onRangeChange, onRefresh, isWatched, onToggleWatch, activeHoldings }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
      {/* Quote header + refresh */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {data ? `${data.symbol} — ${data.name} ` : 'Market Quote'}
        </span>
        <button
          id="refresh-btn"
          onClick={onRefresh}
          disabled={loading}
          style={{
            background: 'transparent', border: '1px solid var(--glass-border)',
            borderRadius: 6, padding: '4px 10px', color: 'var(--text-secondary)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            fontSize: '0.73rem', transition: 'all 0.2s',
          }}
          className="glass-hover"
        >
          <RefreshCw size={11} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* MarketCard quote strip */}
      <MarketCard
        data={data}
        loading={loading}
        isWatched={isWatched}
        onToggleWatch={onToggleWatch}
      />

      {/* Two-column: chart + overview */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_360px] gap-4 flex-1 min-h-0">
        {/* Chart */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 450 }}>
          <BloombergChart ticker={data?.symbol} activeHoldings={activeHoldings} />
        </div>
        {/* Company Overview */}
        <div style={{ overflowY: 'auto' }}>
          <CompanyOverview data={data} loading={loading} />
        </div>
      </div>

    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const { user, token, signOut } = useAuth()
  const [activeHoldings, setActiveHoldings] = useState([])
  const [activePage, setActivePage] = useState('dashboard')

  // load user's active holdings for chart markers
  useEffect(() => {
    if (!user || !token) {
      setActiveHoldings([])
      return
    }
    fetch(`${API_BASE}/api/portfolio/summary`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : Promise.reject('fetch failed'))
      .then(d => setActiveHoldings(d.active_holdings || []))
      .catch(e => console.warn('holdings fetch error', e))
  }, [user, token])
  const [marketData, setMarketData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTicker, setActiveTicker] = useState(null)
  const [activeRange, setActiveRange] = useState('1Y')

  const [watchlist, setWatchlist] = useState([])  // array of ticker strings

  // Load from Backend on mount
  useEffect(() => {
    if (!user || !token) return
    fetch(`${API_BASE}/api/watchlist`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setWatchlist(data)
      })
      .catch(console.error)
  }, [user, token])

  const toggleWatchlist = useCallback(async (ticker) => {
    if (!ticker || !user || !token) return
    const exists = watchlist.includes(ticker)

    try {
      if (exists) {
        await fetch(`${API_BASE}/api/watchlist/${ticker}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        })
        setWatchlist(prev => prev.filter(t => t !== ticker))
      } else {
        await fetch(`${API_BASE}/api/watchlist`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ ticker })
        })
        setWatchlist(prev => [...prev, ticker])
      }
    } catch (e) { console.error('Watchlist toggle failed', e) }
  }, [watchlist, user, token])

  const removeWatchlist = useCallback(async (ticker) => {
    if (!ticker || !user || !token) return
    try {
      await fetch(`${API_BASE}/api/watchlist/${ticker}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      setWatchlist(prev => prev.filter(t => t !== ticker))
    } catch (e) { console.error('Watchlist remove failed', e) }
  }, [user, token])

  // Map watchlist strings to objects for Sidebar
  const watchlistItems = React.useMemo(() => {
    return watchlist.map(sym => {
      const t = TICKER_LIST.find(x => x.symbol === sym)
      return { symbol: sym, label: t ? (t.name.split(' ')[0] || t.name) : sym }
    })
  }, [watchlist])

  const fetchMarket = useCallback(async (ticker, range = activeRange) => {
    if (!ticker) return
    setLoading(true)
    setError(null)
    setActiveTicker(ticker)
    try {
      const res = await fetch(`${API_BASE}/api/market/${ticker}?range=${range}`)
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
  }, [activeRange])

  const handleRangeChange = useCallback((range) => {
    setActiveRange(range)
    if (activeTicker) fetchMarket(activeTicker, range)
  }, [activeTicker, fetchMarket])

  const handleTickerSelect = useCallback((ticker) => {
    setActiveRange('1Y')
    setActivePage('market')
    fetchMarket(ticker, '1Y')
  }, [fetchMarket])

  return (
    <div className="app-layout">
      <ThreeBackground />

      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        onSelectTicker={handleTickerSelect}
        watchlist={watchlistItems}
        onRemoveWatchlist={removeWatchlist}
      />

      <main className="main-content">
        <TopBar onSearch={handleTickerSelect} />
        <StatsBar />

        {activePage === 'edit-profile' ? (
          <EditProfile onBack={() => setActivePage('dashboard')} />
        ) : activePage === 'dashboard' ? (
          <Dashboard onSelectTicker={handleTickerSelect} />
        ) : activePage === 'ai' ? (
          <MarketData />
        ) : activePage === 'strategy' ? (
          <StrategyLab />
        ) : activePage === 'portfolio' ? (
          <Portfolio />
        ) : (
          <>
            {error && <ErrorBanner message={error} />}

            {(loading || marketData) ? (
              <ChartView
                data={marketData}
                loading={loading}
                activeRange={activeRange}
                onRangeChange={handleRangeChange}
                onRefresh={() => activeTicker && fetchMarket(activeTicker, activeRange)}
                isWatched={marketData?.symbol ? watchlist.includes(marketData.symbol) : false}
                onToggleWatch={() => toggleWatchlist(marketData?.symbol)}
                activeHoldings={activeHoldings}
              />
            ) : (
              !error && <WelcomePanel />
            )}
          </>
        )}
      </main>

      <style>{`
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`}</style>
    </div>
  )
}
