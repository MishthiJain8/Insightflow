import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import {
  Bot, Play, Square, TrendingUp, TrendingDown, DollarSign,
  BarChart3, Clock, Target, AlertTriangle, RefreshCw, Zap,
  ArrowUpRight, ArrowDownRight, Activity, Wallet, Trophy,
  Skull, Timer, RotateCcw, Settings
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'

const API = 'http://localhost:8000'

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = '#06b6d4', glow = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 14, padding: '18px 16px', position: 'relative', overflow: 'hidden',
      }}
    >
      {glow && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: `${color}15`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={14} color={color} />
        </div>
        <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#f1f5f9', fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 4 }}>{sub}</div>}
    </motion.div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AutoTrader() {
  const { token } = useAuth()
  const [status, setStatus] = useState(null)
  const [history, setHistory] = useState([])
  const [equityCurve, setEquityCurve] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [capitalInput, setCapitalInput] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [activeTab, setActiveTab] = useState('all')
  const [targetZone, setTargetZone] = useState('All Active')

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }

  const fetchAll = useCallback(async () => {
    if (!token) return
    try {
      const [sRes, hRes, eRes, stRes] = await Promise.all([
        fetch(`${API}/api/autotrader/status`, { headers }),
        fetch(`${API}/api/autotrader/history?limit=100`, { headers }),
        fetch(`${API}/api/autotrader/equity-curve?limit=300`, { headers }),
        fetch(`${API}/api/autotrader/stats`, { headers }),
      ])
      if (sRes.ok) {
        const data = await sRes.json()
        setStatus(data)
        if (data.target_zone) setTargetZone(data.target_zone)
      }
      if (hRes.ok) setHistory(await hRes.json())
      if (eRes.ok) setEquityCurve(await eRes.json())
      if (stRes.ok) setStats(await stRes.json())
    } catch (e) { console.error('AutoTrader fetch error', e) }
    finally { setLoading(false) }
  }, [token])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { const iv = setInterval(fetchAll, 30000); return () => clearInterval(iv) }, [fetchAll])

  const handleStart = async () => {
    setActionLoading(true)
    const capital = parseFloat(capitalInput) || 100000
    await fetch(`${API}/api/autotrader/start`, { method: 'POST', headers, body: JSON.stringify({ capital }) })
    await fetchAll()
    setActionLoading(false)
  }

  const handleUpdateZone = async (e) => {
    const newZone = e.target.value
    setTargetZone(newZone)
    await fetch(`${API}/api/autotrader/config`, { method: 'POST', headers, body: JSON.stringify({ target_zone: newZone }) })
    await fetchAll()
  }

  const handleStop = async () => {
    setActionLoading(true)
    await fetch(`${API}/api/autotrader/stop`, { method: 'POST', headers })
    await fetchAll()
    setActionLoading(false)
  }

  const handleReset = async () => {
    if (!window.confirm('Reset all bot data and start fresh?')) return
    setActionLoading(true)
    const capital = parseFloat(capitalInput) || status?.starting_capital || 100000
    await fetch(`${API}/api/autotrader/reset`, { method: 'POST', headers, body: JSON.stringify({ capital }) })
    await fetchAll()
    setActionLoading(false)
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
        <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginRight: 10 }} /> Loading AutoTrader...
      </div>
    )
  }

  const isRunning = status?.is_running
  const pnl = status?.total_pnl || 0
  const pnlPct = status?.total_pnl_pct || 0
  const pnlColor = pnl >= 0 ? '#10b981' : '#ef4444'

  const filteredHistory = activeTab === 'all' ? history.filter(t => t.action === 'BUY' || t.action === 'SELL')
    : activeTab === 'buys' ? history.filter(t => t.action === 'BUY')
    : history.filter(t => t.action === 'SELL')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0, overflow: 'auto', padding: '0 0 20px' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(139,92,246,0.15))', border: '1px solid rgba(6,182,212,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bot size={22} color="#06b6d4" />
          </div>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
              AutoTrader Bot
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: isRunning ? '#10b981' : '#ef4444', boxShadow: isRunning ? '0 0 12px rgba(16,185,129,0.6)' : 'none', animation: isRunning ? 'pulse 2s infinite' : 'none' }} />
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
              {isRunning ? `Running • Cycle #${status.cycle_count} • ${status.num_positions}/${status.max_positions} positions` : 'Stopped'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isRunning && (
            <input
              type="number" placeholder="Capital ($)" value={capitalInput}
              onChange={e => setCapitalInput(e.target.value)}
              style={{ width: 130, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: '0.8rem', outline: 'none' }}
            />
          )}
          <select 
            value={targetZone} 
            onChange={handleUpdateZone}
            style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: '0.8rem', outline: 'none', cursor: 'pointer' }}
          >
            <option value="All Active" style={{ background: '#080c14' }}>All Active</option>
            <option value="US" style={{ background: '#080c14' }}>US Markets</option>
            <option value="India" style={{ background: '#080c14' }}>India (NSE/BSE)</option>
            <option value="UK" style={{ background: '#080c14' }}>UK (LSE)</option>
            <option value="Europe" style={{ background: '#080c14' }}>Europe</option>
            <option value="Japan" style={{ background: '#080c14' }}>Japan (TYO)</option>
            <option value="Hong Kong" style={{ background: '#080c14' }}>Hong Kong</option>
            <option value="Australia" style={{ background: '#080c14' }}>Australia</option>
            <option value="Canada" style={{ background: '#080c14' }}>Canada</option>
            <option value="Crypto" style={{ background: '#080c14' }}>Crypto</option>
          </select>
          {isRunning ? (
            <button onClick={handleStop} disabled={actionLoading}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
              <Square size={14} /> Stop Bot
            </button>
          ) : (
            <button onClick={handleStart} disabled={actionLoading}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', boxShadow: '0 0 20px rgba(6,182,212,0.3)' }}>
              <Play size={14} /> Start Bot
            </button>
          )}
          {isRunning && (
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5], scale: [0.95, 1.05, 0.95] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: 20, color: '#10b981', fontSize: '0.75rem', fontWeight: 700, marginLeft: 6 }}
            >
              <Activity size={14} />
              Scanning (Cycle {status?.cycle_count || 0})
            </motion.div>
          )}
          <button onClick={handleReset} disabled={actionLoading} title="Reset"
            style={{ padding: '9px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b', cursor: 'pointer' }}>
            <RotateCcw size={14} />
          </button>
          <button onClick={fetchAll} title="Refresh"
            style={{ padding: '9px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b', cursor: 'pointer' }}>
            <RefreshCw size={14} />
          </button>
        </div>
      </motion.div>

      {/* ── Stats Grid ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <StatCard icon={Wallet} label="Capital" value={`$${(status?.current_capital || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}`} sub={`Started: $${(status?.starting_capital || 0).toLocaleString()}`} color="#8b5cf6" glow />
        <StatCard icon={pnl >= 0 ? TrendingUp : TrendingDown} label="Total P&L" value={`${pnl >= 0 ? '+' : ''}$${pnl.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} sub={`${pnlPct >= 0 ? '+' : ''}${pnlPct}%`} color={pnlColor} glow />
        <StatCard icon={Trophy} label="Win Rate" value={`${status?.win_rate || 0}%`} sub={`${status?.winning_trades || 0}W / ${status?.losing_trades || 0}L`} color="#f59e0b" />
        <StatCard icon={BarChart3} label="Total Trades" value={status?.total_trades || 0} sub={`${status?.num_positions || 0} open positions`} color="#06b6d4" />
        <StatCard icon={DollarSign} label="Realized P&L" value={`${(status?.total_realized_pnl || 0) >= 0 ? '+' : ''}$${(status?.total_realized_pnl || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} color="#10b981" />
        <StatCard icon={Target} label="Portfolio Value" value={`$${(status?.total_value || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}`} color="#ec4899" />
      </div>

      {/* ── Equity Curve ────────────────────────────────────────────────── */}
      {equityCurve.length > 1 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '18px 16px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <Activity size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} /> Equity Curve
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={equityCurve}>
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="timestamp" tick={{ fontSize: 9, fill: '#475569' }} tickFormatter={v => v ? v.substring(11, 16) : ''} />
              <YAxis tick={{ fontSize: 9, fill: '#475569' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ background: '#0a0f1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: '0.75rem' }}
                formatter={v => [`$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'Value']} />
              <Area type="monotone" dataKey="total_value" stroke="#06b6d4" strokeWidth={2} fill="url(#eqGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* ── Active Positions ────────────────────────────────────────────── */}
      {status?.positions?.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '18px 16px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <Zap size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} /> Open Positions ({status.positions.length})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Ticker', 'Qty', 'Entry', 'Live', 'P&L', 'P&L %', 'Signal'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {status.positions.map((p, i) => {
                  const pnl = p.unrealized_pnl || 0
                  const c = pnl >= 0 ? '#10b981' : '#ef4444'
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '10px', fontWeight: 800, color: '#f1f5f9' }}>{p.ticker}</td>
                      <td style={{ padding: '10px', color: '#94a3b8' }}>{p.quantity}</td>
                      <td style={{ padding: '10px', color: '#94a3b8', fontFamily: 'JetBrains Mono, monospace' }}>${p.entry_price?.toFixed(2)}</td>
                      <td style={{ padding: '10px', color: '#f1f5f9', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>${p.live_price?.toFixed(2)}</td>
                      <td style={{ padding: '10px', color: c, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</td>
                      <td style={{ padding: '10px', color: c, fontWeight: 700 }}>{(p.unrealized_pnl_pct || 0) >= 0 ? '+' : ''}{(p.unrealized_pnl_pct || 0).toFixed(1)}%</td>
                      <td style={{ padding: '10px', color: '#64748b', fontSize: '0.7rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.entry_reason}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* ── Trade History ───────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '18px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <Clock size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} /> Trade History
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['all', 'buys', 'sells'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{ padding: '4px 12px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: activeTab === tab ? 'rgba(6,182,212,0.15)' : 'transparent',
                  color: activeTab === tab ? '#06b6d4' : '#64748b' }}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#475569', fontSize: '0.82rem' }}>
            No trades yet. The bot will start trading after its first scan cycle.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#080c14' }}>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Action', 'Ticker', 'Price', 'Qty', 'P&L', 'Reason', 'Time'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: '0.63rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((t, i) => {
                  const isBuy = t.action === 'BUY'
                  const pnlVal = t.pnl || 0
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 5, fontSize: '0.68rem', fontWeight: 800,
                          background: isBuy ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                          color: isBuy ? '#10b981' : '#ef4444', border: `1px solid ${isBuy ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                          {isBuy ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}{t.action}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 800, color: '#f1f5f9' }}>{t.ticker}</td>
                      <td style={{ padding: '8px 10px', color: '#94a3b8', fontFamily: 'JetBrains Mono, monospace' }}>${t.price?.toFixed(2)}</td>
                      <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{t.quantity}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: !isBuy ? (pnlVal >= 0 ? '#10b981' : '#ef4444') : '#475569' }}>
                        {isBuy ? '—' : `${pnlVal >= 0 ? '+' : ''}$${pnlVal.toFixed(2)}`}
                      </td>
                      <td style={{ padding: '8px 10px', color: '#64748b', fontSize: '0.68rem', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.reason || t.entry_reason || '—'}</td>
                      <td style={{ padding: '8px 10px', color: '#475569', fontSize: '0.68rem', fontFamily: 'JetBrains Mono, monospace' }}>
                        {t.timestamp ? new Date(t.timestamp).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* ── Performance Stats ───────────────────────────────────────────── */}
      {stats && stats.total_trades > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '18px 16px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            <Trophy size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} /> Performance Analytics
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {[
              { l: 'Win Rate', v: `${stats.win_rate}%`, c: stats.win_rate >= 50 ? '#10b981' : '#ef4444' },
              { l: 'Avg Profit', v: `$${stats.avg_profit?.toFixed(2)}`, c: '#10b981' },
              { l: 'Avg Loss', v: `$${stats.avg_loss?.toFixed(2)}`, c: '#ef4444' },
              { l: 'Profit Factor', v: stats.profit_factor === Infinity ? '∞' : stats.profit_factor?.toFixed(2), c: '#8b5cf6' },
              { l: 'Avg Hold Mins', v: `${stats.avg_hold_mins}m`, c: '#f59e0b' },
              { l: 'Largest Win', v: `+$${stats.largest_win?.toFixed(2)}`, c: '#10b981' },
              { l: 'Largest Loss', v: `$${stats.largest_loss?.toFixed(2)}`, c: '#ef4444' },
              { l: 'Total P&L', v: `$${stats.total_realized_pnl?.toFixed(2)}`, c: stats.total_realized_pnl >= 0 ? '#10b981' : '#ef4444' },
            ].map(({ l, v, c }) => (
              <div key={l} style={{ padding: '12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: '0.6rem', color: '#475569', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{l}</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: c, fontFamily: 'JetBrains Mono, monospace' }}>{v}</div>
              </div>
            ))}
          </div>
          {stats.best_trade && (
            <div style={{ marginTop: 12, display: 'flex', gap: 10, fontSize: '0.72rem' }}>
              <div style={{ flex: 1, padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <span style={{ color: '#64748b' }}>Best: </span>
                <span style={{ color: '#10b981', fontWeight: 800 }}>{stats.best_trade.ticker}</span>
                <span style={{ color: '#10b981' }}> +${stats.best_trade.pnl?.toFixed(2)} ({stats.best_trade.pnl_pct?.toFixed(1)}%)</span>
              </div>
              {stats.worst_trade && (
                <div style={{ flex: 1, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <span style={{ color: '#64748b' }}>Worst: </span>
                  <span style={{ color: '#ef4444', fontWeight: 800 }}>{stats.worst_trade.ticker}</span>
                  <span style={{ color: '#ef4444' }}> ${stats.worst_trade.pnl?.toFixed(2)} ({stats.worst_trade.pnl_pct?.toFixed(1)}%)</span>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
        @keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
      `}</style>
    </div>
  )
}
