import React, { useState, useEffect } from 'react'
import {
    LayoutDashboard, TrendingUp, FlaskConical,
    BrainCircuit, Briefcase, UserCircle, LogOut,
    Zap, X, AlertTriangle, Info, BarChart3, ShieldCheck,
    ChevronRight, Eye
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', id: 'dashboard' },
    { icon: TrendingUp, label: 'Stock Chart', id: 'market' },
    { icon: FlaskConical, label: 'Strategy Lab', id: 'strategy' },
    { icon: BrainCircuit, label: 'News & Analysis', id: 'ai' },
    { icon: Briefcase, label: 'Portfolio', id: 'portfolio' },
]

// ─── Logout Confirmation Modal ────────────────────────────────────────────────
function LogoutModal({ onConfirm, onCancel }) {
    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 99999,
                background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}
            onClick={onCancel}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: '100%', maxWidth: 360,
                    background: 'rgba(15,20,30,0.97)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: 18, padding: '28px 28px 24px',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 40px rgba(239,68,68,0.08)',
                }}
            >
                {/* Icon */}
                <div style={{
                    width: 48, height: 48, borderRadius: 12, margin: '0 auto 16px',
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <AlertTriangle size={22} color="var(--accent-red)" />
                </div>

                <h3 style={{ textAlign: 'center', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 8 }}>
                    Secure Log Out
                </h3>
                <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
                    Are you sure you want to securely log out of InsightFlow? Your session will be terminated.
                </p>

                <div style={{ display: 'flex', gap: 10 }}>
                    <button
                        onClick={onCancel}
                        style={{
                            flex: 1, padding: '10px', borderRadius: 10,
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid var(--glass-border)',
                            color: 'var(--text-secondary)', cursor: 'pointer',
                            fontWeight: 600, fontSize: '0.85rem',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            flex: 1, padding: '10px', borderRadius: 10,
                            background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                            border: '1px solid rgba(239,68,68,0.4)',
                            color: '#fff', cursor: 'pointer',
                            fontWeight: 700, fontSize: '0.85rem',
                            boxShadow: '0 0 16px rgba(239,68,68,0.3)',
                        }}
                    >
                        Confirm Log Out
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────
export default function Sidebar({ activePage, onNavigate, onSelectTicker, watchlist = [], onRemoveWatchlist }) {
    const { user, token, profile, signOut } = useAuth()
    const [showLogoutModal, setShowLogoutModal] = useState(false)
    const [alerts, setAlerts] = useState([])
    const [loadingAlerts, setLoadingAlerts] = useState(false)
    const [selectedAlert, setSelectedAlert] = useState(null)
    const [showWatchlistModal, setShowWatchlistModal] = useState(false)
    const [unreadNotifCount, setUnreadNotifCount] = useState(0)
    const [seenAlertHashes, setSeenAlertHashes] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('seen_sidebar_alerts') || '[]')
        } catch { return [] }
    })

    const fetchAlerts = async () => {
        if (!user || !token) return
        setLoadingAlerts(true)
        try {
            const res = await fetch('http://localhost:8000/api/portfolio/alerts', {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) setAlerts(await res.json())
        } catch (e) {
            console.error('sidebar alerts fetch failed', e)
        } finally {
            setLoadingAlerts(false)
        }
    }

    const fetchUnreadCount = async () => {
        if (!user) return
        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('is_read', false)
        if (!error) setUnreadNotifCount(count || 0)
    }

    useEffect(() => {
        if (!user) return
        fetchAlerts()
        fetchUnreadCount()

        // ── Realtime listener for the Sidebar red dot ──
        const channel = supabase
            .channel('sidebar-notifs')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${user.id}`
            }, () => {
                // Refresh count on any change (read, delete, insert)
                fetchUnreadCount()
            })
            .subscribe()

        const iv = setInterval(() => {
            fetchAlerts()
            fetchUnreadCount()
        }, 300000) // refresh every 5m

        return () => {
            clearInterval(iv)
            supabase.removeChannel(channel)
        }
    }, [user, token])

    const markAlertAsSeen = (alert) => {
        const hash = `${alert.ticker}-${alert.ai_status}-${alert.reason.substring(0, 20)}`
        if (!seenAlertHashes.includes(hash)) {
            const newHashes = [hash, ...seenAlertHashes].slice(0, 100)
            setSeenAlertHashes(newHashes)
            localStorage.setItem('seen_sidebar_alerts', JSON.stringify(newHashes))
        }
        setSelectedAlert(alert)
    }

    const handleConfirmLogout = async () => {
        setShowLogoutModal(false)
        await signOut()
    }

    const markAllNotificationsAsRead = async () => {
        if (!user) return
        try {
            const { error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('user_id', user.id)
                .eq('is_read', false)

            if (!error) {
                setUnreadNotifCount(0)
            }
        } catch (e) {
            console.error('Failed to mark all notifications as read', e)
        }
    }

    const displayName = profile?.full_name || user?.email?.split('@')[0] || 'User'
    const initials = displayName[0].toUpperCase()

    // Filter alerts for the modal list
    const actionableAlerts = alerts.filter(a => a.ai_status === 'SELL' || a.ai_status === 'BUY MORE')
    const monitorAlerts = alerts.filter(a => a.ai_status !== 'SELL' && a.ai_status !== 'BUY MORE')

    const [showAllAlertsModal, setShowAllAlertsModal] = useState(false)

    return (
        <>
            {showLogoutModal && (
                <LogoutModal
                    onConfirm={handleConfirmLogout}
                    onCancel={() => setShowLogoutModal(false)}
                />
            )}
            {/* Modals Integrated into Sidebar */}
            <AnimatePresence>
                {/* 1. Master Alerts List Modal */}
                {showAllAlertsModal && (
                    <div className="fixed inset-0 z-110000 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAllAlertsModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
                        <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-2xl bg-[#080c12] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-auto max-h-[80vh] z-110001">
                            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/2 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                                        <AlertTriangle size={20} className="text-red-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black uppercase tracking-widest text-white">AI Guardian Terminal</h3>
                                        <p className="text-[10px] text-gray-500 font-mono">Live Risk & Opportunity Monitoring</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowAllAlertsModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X size={20} className="text-gray-500" /></button>
                            </div>

                            <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
                                {alerts.length === 0 ? (
                                    <div className="text-center py-20">
                                        <div className="text-gray-600 font-mono text-sm mb-2">Scanning Global Markets...</div>
                                        <div className="text-xs text-gray-700 uppercase tracking-[0.2em]">No High-Confidence Triggers Detected</div>
                                    </div>
                                ) : (
                                    <>
                                        {actionableAlerts.length > 0 && (
                                            <div>
                                                <div className="text-[10px] font-black text-red-500/80 uppercase tracking-[0.3em] mb-3 ml-1">Critical Signals</div>
                                                <div className="space-y-2">
                                                    {actionableAlerts.map((a, i) => {
                                                        const hash = `${a.ticker}-${a.ai_status}-${a.reason.substring(0, 20)}`
                                                        const isUnseen = !seenAlertHashes.includes(hash)
                                                        return (
                                                            <div
                                                                key={i}
                                                                onClick={() => markAlertAsSeen(a)}
                                                                className="p-4 rounded-xl border border-white/5 bg-white/2 hover:bg-white/5 transition-all cursor-pointer group relative overflow-hidden"
                                                            >
                                                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${a.ai_status === 'SELL' ? 'bg-red-500' : 'bg-cyan-500'}`} />
                                                                <div className="flex justify-between items-start mb-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-black text-white text-lg tracking-tighter">{a.ticker}</span>
                                                                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-white/5" style={{ color: a.status_color }}>{a.ai_status}</span>
                                                                        {isUnseen && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                                                                    </div>
                                                                    <div className="text-[10px] font-mono text-gray-500">{a.confidence}% Confidence</div>
                                                                </div>
                                                                <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">{a.reason}</p>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {monitorAlerts.length > 0 && (
                                            <div>
                                                <div className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-3 ml-1">Active Monitoring</div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    {monitorAlerts.map((a, i) => (
                                                        <div
                                                            key={i}
                                                            onClick={() => markAlertAsSeen(a)}
                                                            className="p-3 rounded-xl border border-white/5 bg-white/2 hover:bg-white/4 transition-all cursor-pointer flex justify-between items-center"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center font-bold text-xs text-gray-400">{a.ticker[0]}</div>
                                                                <div>
                                                                    <div className="font-bold text-white text-xs">{a.ticker}</div>
                                                                    <div className="text-[9px] text-gray-600 uppercase font-bold">{a.ai_status}</div>
                                                                </div>
                                                            </div>
                                                            <ChevronRight size={14} className="text-gray-700" />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}

                {selectedAlert && (
                    <div className="fixed inset-0 z-110000 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedAlert(null)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
                        <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-lg bg-[#080c12] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-auto max-h-[90vh] z-110001">
                            <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-cyan-500 to-purple-500 shrink-0" />
                            <div className="flex justify-between items-start p-6 pb-2 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                                        <ShieldCheck size={24} className="text-cyan-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black uppercase tracking-widest text-white">AI Guardian Intel</h3>
                                        <p className="text-xs text-gray-400 font-mono">{selectedAlert.ticker} Analysis</p>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedAlert(null)} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X size={20} className="text-gray-500" /></button>
                            </div>
                            <div className="p-6 pt-2 overflow-y-auto space-y-6 custom-scrollbar flex-1">
                                <div className="p-4 rounded-xl bg-white/2 border border-white/5">
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Actionable Signal</span>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded tracking-tighter`} style={{ background: selectedAlert.status_color + '22', color: selectedAlert.status_color }}>{selectedAlert.ai_status}</span>
                                    </div>
                                    <p className="text-sm leading-relaxed text-gray-300 font-medium italic">"{selectedAlert.reason}"</p>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-xl bg-white/2 border border-white/5">
                                        <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">Model Confidence</div>
                                        <div className="text-xl font-black text-cyan-400 font-mono">{selectedAlert.confidence}%</div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-white/2 border border-white/5">
                                        <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">Market Sentiment</div>
                                        <div className="text-xl font-black text-purple-400 font-mono">{selectedAlert.sentiment}</div>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedAlert(null)} className="w-full py-4 rounded-xl bg-cyan-500 text-black font-black uppercase tracking-widest text-xs hover:bg-cyan-400 transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)]">Acknowledge Alert</button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {showWatchlistModal && (
                    <div className="fixed inset-0 z-110000 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowWatchlistModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-md" />
                        <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-2xl bg-[#080c12] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-auto max-h-[80vh] z-110001">
                            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/2 shrink-0">
                                <div className="flex items-center gap-3">
                                    <BarChart3 size={24} className="text-cyan-400" />
                                    <h3 className="text-xl font-black uppercase tracking-widest text-white">Global Watchlist</h3>
                                </div>
                                <button onClick={() => setShowWatchlistModal(false)} className="p-2 hover:bg-white/5 rounded-full"><X size={20} className="text-gray-500" /></button>
                            </div>
                            <div className="p-6 overflow-y-auto space-y-3 custom-scrollbar flex-1">
                                {watchlist.length === 0 ? (
                                    <div className="text-center py-20 text-gray-500 font-medium">No stocks in your watchlist yet.</div>
                                ) : (
                                    watchlist.map(({ symbol, label }, idx) => (
                                        <div key={`${symbol || 'sym'}-${idx}`} className="p-4 rounded-xl border border-white/10 bg-white/2 flex justify-between items-center group hover:bg-white/4 transition-all cursor-pointer"
                                            onClick={() => { onSelectTicker?.(symbol); setShowWatchlistModal(false); }}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center font-black text-cyan-400 text-sm shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">{symbol[0]}</div>
                                                <div>
                                                    <div className="font-black text-white text-base tracking-tight">{label}</div>
                                                    <div className="text-[11px] text-cyan-500/70 font-mono tracking-[0.2em] font-bold uppercase">{symbol}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onRemoveWatchlist?.(symbol); }}
                                                    className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100"
                                                    title="Delete Asset"
                                                >
                                                    <X size={18} />
                                                </button>
                                                <div className="p-3 bg-white/5 rounded-xl group-hover:bg-cyan-500 group-hover:text-black transition-all">
                                                    <ChevronRight size={20} />
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <aside className="sidebar glass" style={{ borderRight: 'none' }}>
                {/* Logo */}
                <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: 34, height: 34, borderRadius: 8,
                            background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 0 18px rgba(6,182,212,0.4)'
                        }}>
                            <Zap size={18} color="white" />
                        </div>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', letterSpacing: '-0.01em' }}>InsightFlow</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--accent-cyan)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Quant Terminal</div>
                        </div>
                    </div>
                </div>

                {/* Live Status */}
                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="pulse-dot" />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Engine Active</span>
                    </div>
                </div>

                {/* Scrollable Content Area */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* Navigation */}
                    <nav style={{ padding: '12px 10px' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px 10px' }}>
                            Navigation
                        </div>
                        {navItems.map(({ icon: Icon, label, id }) => {
                            const isActive = activePage === id
                            return (
                                <button
                                    key={id}
                                    id={`nav-${id}`}
                                    onClick={() => onNavigate?.(id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        width: '100%', padding: '9px 10px', borderRadius: 8,
                                        background: isActive ? 'rgba(6,182,212,0.1)' : 'transparent',
                                        border: isActive ? '1px solid rgba(6,182,212,0.2)' : '1px solid transparent',
                                        color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                                        cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left',
                                        marginBottom: 2, fontSize: '0.85rem', fontWeight: isActive ? 600 : 400,
                                    }}
                                    className="glass-hover"
                                >
                                    <Icon size={16} />
                                    {label}
                                </button>
                            )
                        })}
                    </nav>

                    {/* Alerts & Watchlist Section - Buttons instead of lists */}
                    <div style={{ padding: '20px 10px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--glass-border)' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 10px 4px' }}>
                            Intelligence
                        </div>

                        {/* AI Alerts Button */}
                        <button
                            onClick={() => {
                                setShowAllAlertsModal(true)
                                markAllNotificationsAsRead()
                            }}
                            draggable={false}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                width: '100%', padding: '12px 14px', borderRadius: 12,
                                background: 'rgba(255,255,255,0.03)',
                                border: unreadNotifCount > 0 ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--glass-border)',
                                color: 'var(--text-primary)', cursor: 'pointer', transition: 'all 0.2s',
                                position: 'relative'
                            }}
                            className="glass-hover"
                        >
                            <div style={{
                                width: 32, height: 32, borderRadius: 8,
                                background: 'rgba(239,68,68,0.1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <AlertTriangle size={16} color="var(--accent-red)" />
                            </div>
                            <div style={{ flex: 1, textAlign: 'left' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>AI alerts</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{alerts.length} signals active</div>
                            </div>
                            {unreadNotifCount > 0 ? (
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse" />
                            ) : (
                                <ChevronRight size={14} className="text-gray-600" />
                            )}
                        </button>

                        {/* Watchlist Button */}
                        <button
                            onClick={() => setShowWatchlistModal(true)}
                            draggable={false}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                width: '100%', padding: '12px 14px', borderRadius: 12,
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid var(--glass-border)',
                                color: 'var(--text-primary)', cursor: 'pointer', transition: 'all 0.2s',
                            }}
                            className="glass-hover"
                        >
                            <div style={{
                                width: 32, height: 32, borderRadius: 8,
                                background: 'rgba(6,182,212,0.1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <BarChart3 size={16} color="var(--accent-cyan)" />
                            </div>
                            <div style={{ flex: 1, textAlign: 'left' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>Watchlist</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{watchlist.length} assets tracked</div>
                            </div>
                            <ChevronRight size={14} className="text-gray-600" />
                        </button>
                    </div>
                </div>

                {/* ── Settings Section ───────────────────────────────────────── */}
                <div style={{ padding: '10px', borderTop: '1px solid var(--glass-border)' }}>
                    {/* User info strip */}
                    {user && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
                            marginBottom: 4, borderRadius: 8,
                            background: 'rgba(255,255,255,0.03)',
                        }}>
                            <div style={{
                                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                                background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-violet))',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.65rem', fontWeight: 800, color: '#fff',
                            }}>{initials}</div>
                            <div style={{ overflow: 'hidden' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {displayName}
                                </div>
                                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {user.email}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 👤 Edit Profile */}
                    <button
                        onClick={() => onNavigate?.('edit-profile')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            width: '100%', padding: '9px 10px', borderRadius: 8,
                            background: 'transparent', border: '1px solid transparent',
                            color: 'var(--text-secondary)', cursor: 'pointer',
                            fontSize: '0.85rem', marginBottom: 2, textAlign: 'left',
                        }}
                        className="glass-hover"
                    >
                        <UserCircle size={15} />
                        Edit Profile
                    </button>

                    {/* 🚪 Log Out */}
                    <button
                        onClick={() => setShowLogoutModal(true)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            width: '100%', padding: '9px 10px', borderRadius: 8,
                            background: 'transparent', border: '1px solid transparent',
                            color: 'var(--accent-red)', cursor: 'pointer',
                            fontSize: '0.85rem', textAlign: 'left',
                        }}
                        className="glass-hover"
                    >
                        <LogOut size={15} />
                        Log Out
                    </button>
                </div>
            </aside>
        </>
    )
}
