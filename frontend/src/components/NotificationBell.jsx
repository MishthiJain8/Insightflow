import React, { useState, useEffect, useRef } from 'react'
import { Bell, X, Trash2, Activity } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'

// Supabase realtime will update bell instantly
const API_BASE = 'http://localhost:8000'

export default function NotificationBell() {
    const { user, token } = useAuth()
    const [notifications, setNotifications] = useState([])
    const [isOpen, setIsOpen] = useState(false)
    const [isFlashing, setIsFlashing] = useState(false)
    const [pendingSummary, setPendingSummary] = useState({ pending_count: 0, ready_tickers: [] })
    const dropdownRef = useRef(null)
    const channelRef = useRef(null)

    // ── Fetch notifications and pending evaluations ───────────────────
    const fetchNotifications = async () => {
        if (!user || !token) return
        try {
            // 1. Fetch from Local Backend notifications
            const res = await fetch(`${API_BASE}/api/notifications`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setNotifications(data || [])
            }

            // 2. Fetch Pending Evaluations from Backend
            const readyRes = await fetch(`${API_BASE}/api/notifications/pending-evaluations`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (readyRes.ok) {
                const summary = await readyRes.json()
                setPendingSummary(summary)
            }
        } catch (e) {
            console.error('Failed to fetch notifications', e)
        }
    }

    useEffect(() => {
        if (!user) return
        fetchNotifications()

        // Poll for notifications every 2 minutes (replaces Realtime)
        const poll = setInterval(fetchNotifications, 2 * 60 * 1000)

        return () => {
            clearInterval(poll)
        }
    }, [user, token])

    // Sync with manual evaluation triggers from other components
    useEffect(() => {
        const handler = () => fetchNotifications();
        window.addEventListener('eval-sync', handler)
        return () => window.removeEventListener('eval-sync', handler)
    }, [user, token])

    // Click outside closes dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Mark as read when dropdown is opened
    useEffect(() => {
        if (isOpen && user && token && notifications.some(n => !n.is_read)) {
            fetch(`${API_BASE}/api/notifications/mark-read`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(res => {
                if (res.ok) {
                    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
                    // Dispatch event for Sidebar dot to update immediately
                    window.dispatchEvent(new Event('notifs-read'))
                }
            }).catch(e => console.error('Failed to mark as read', e))
        }
    }, [isOpen, user, token, notifications])

    const handleDelete = async (id, e) => {
        e.stopPropagation()
        if (!token) return
        try {
            const res = await fetch(`${API_BASE}/api/notifications/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) setNotifications(prev => prev.filter(n => n.id !== id))
        } catch (e) {
            console.error('Failed to delete', e)
        }
    }

    const handleClearAll = async (e) => {
        e.stopPropagation()
        if (!user || !token) return
        try {
            const res = await fetch(`${API_BASE}/api/notifications`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                setNotifications([])
            }
        } catch (e) {
            console.error('Failed to clear notifications', e)
        }
    }

    const unreadCount = notifications.filter(n => !n.is_read).length
    const totalDisplayCount = unreadCount + (pendingSummary?.pending_count || 0)

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`relative p-2 rounded-lg transition-colors hover:bg-white/10 text-gray-400 hover:text-white ${isFlashing || (pendingSummary?.pending_count > 0) ? 'critical-flash' : ''}`}
            >
                <Bell size={18} />
                <style dangerouslySetInnerHTML={{
                    __html: `
                    @keyframes criticalFlash {
                        0% { background: rgba(239, 68, 68, 0); transform: scale(1); }
                        50% { background: rgba(239, 68, 68, 0.4); transform: scale(1.1); box-shadow: 0 0 15px rgba(239, 68, 68, 0.6); }
                        100% { background: rgba(239, 68, 68, 0); transform: scale(1); }
                    }
                    .critical-flash {
                        animation: criticalFlash 0.5s infinite;
                        color: #ef4444 !important;
                    }
                `}} />
                {totalDisplayCount > 0 && (
                    <span className="absolute top-1 right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 text-[8px] font-bold text-white items-center justify-center">
                            {totalDisplayCount}
                        </span>
                    </span>
                )}
            </button>

            {isOpen && (
                <div
                    className="absolute right-0 mt-3 w-80 sm:w-[400px] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_30px_rgba(0,0,0,0.5)] border overflow-hidden flex flex-col"
                    style={{
                        borderColor: 'rgba(255,255,255,0.1)',
                        background: 'rgba(8, 12, 18, 0.98)',
                        backdropFilter: 'blur(30px)',
                        WebkitBackdropFilter: 'blur(30px)',
                        zIndex: 100000
                    }}
                >
                    <div className="p-4 border-b flex justify-between items-center bg-white/2" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                        <h3 className="text-sm font-black uppercase tracking-[0.15em] text-white flex items-center gap-2">
                            <Activity size={16} className="text-[#06b6d4]" /> AI Guardian Alerts
                        </h3>
                        {notifications.length > 0 && (
                            <button onClick={handleClearAll} className="text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-red-400 transition-colors">
                                Clear All
                            </button>
                        )}
                    </div>

                    <div className="max-h-96 overflow-y-auto custom-scrollbar flex flex-col">
                        {pendingSummary?.pending_count > 0 && (
                            <div
                                onClick={() => {
                                    setIsOpen(false);
                                    const el = document.getElementById('ticker-vault-accuracy');
                                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                                }}
                                className="p-4 border-b bg-cyan-500/10 border-cyan-500/20 text-cyan-400 group hover:bg-cyan-500/20 transition-colors cursor-pointer"
                                style={{ borderColor: 'rgba(255,255,255,0.03)' }}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <Activity size={12} className="text-cyan-400" />
                                    <span className="text-[9px] uppercase font-black tracking-wider">Maturity Alert</span>
                                </div>
                                <p className="text-xs text-white font-medium leading-relaxed">
                                    You have {pendingSummary.pending_count} predictions ready to evaluate for <span className="mono font-bold text-cyan-400">{pendingSummary.ready_tickers.join(', ')}</span>.
                                </p>
                                <p className="text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-widest">Click to grade them</p>
                            </div>
                        )}

                        {notifications.length > 0 ? (
                            notifications.map((notif, idx) => {
                                const isSell = notif.type?.toLowerCase().includes('sell')
                                const isBuy = notif.type?.toLowerCase().includes('buy') || notif.type?.toLowerCase().includes('profit')
                                const bgClass = isSell ? 'bg-red-500/10 border-red-500/20 text-red-400' : isBuy ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' : 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                                const dateVal = notif.created_at || notif.timestamp
                                const dateObj = dateVal ? new Date(dateVal) : new Date()
                                const isValid = !isNaN(dateObj.getTime())
                                const timeStr = isValid ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
                                const dateStr = isValid ? dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Just Now'

                                return (
                                    <div key={notif.id || `notif-${idx}`} className={`p-4 border-b group hover:bg-white/5 transition-colors relative ${bgClass}`} style={{ borderColor: 'rgba(255,255,255,0.03)', opacity: notif.is_read ? 0.65 : 1 }}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                {!notif.is_read && (
                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-cyan)', flexShrink: 0 }} />
                                                )}
                                                <span className="text-[9px] uppercase font-black px-1.5 py-0.5 rounded tracking-wider" style={{ color: isSell ? 'var(--accent-red)' : isBuy ? 'var(--accent-cyan)' : 'var(--accent-purple)' }}>
                                                    {notif.type}
                                                </span>
                                                <span className="font-mono font-bold text-white text-sm">{notif.ticker}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[10px] text-gray-500 font-mono">{dateStr} {timeStr}</span>
                                                <button onClick={(e) => handleDelete(notif.id, e)} className="text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-400 leading-relaxed pr-6">{notif.message}</p>
                                    </div>
                                )
                            })
                        ) : (
                            <div className="p-12 text-center flex flex-col items-center justify-center gap-4">
                                <div className="p-4 rounded-full bg-white/3 border border-white/5">
                                    <Bell size={28} className="text-gray-600" />
                                </div>
                                <p className="text-sm text-gray-400 font-bold uppercase tracking-widest">No new AI alerts</p>
                                <p className="text-[10px] text-gray-600 font-medium">Monitoring market sentiment for signals...</p>
                            </div>
                        )}
                    </div>
                    {notifications.length > 0 && (
                        <div className="p-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                            <button onClick={handleClearAll} className="text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-red-400 transition-colors w-full">
                                Clear All
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
