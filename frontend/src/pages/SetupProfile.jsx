import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Activity, User, Phone, ArrowRight } from 'lucide-react'
import { styles } from './Auth/_authStyles'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export default function SetupProfile() {
    const { user, token, refreshProfile } = useAuth()
    const [fullName, setFullName] = useState('')
    const [phone, setPhone] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!fullName.trim()) { setError('Please enter your full name.'); return }
        setLoading(true); setError(null)

        try {
            const res = await fetch(`${API_BASE}/api/profile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    full_name: fullName.trim(),
                    phone_number: phone.trim() || null
                })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.detail || 'Failed to save profile')

            await refreshProfile()   // triggers re-render in ProfileGuard
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={styles.page}>
            <div style={styles.card}>
                <div style={styles.logoRow}>
                    <div style={styles.logoIcon}><Activity size={22} color="var(--accent-cyan)" /></div>
                    <span style={styles.logoText}>InsightFlow</span>
                </div>

                <h1 style={styles.title}>Complete your profile</h1>
                <p style={styles.subtitle}>A few quick details before you access your terminal.</p>

                <form onSubmit={handleSubmit} style={styles.form}>
                    {/* Full Name */}
                    <label style={styles.label}>Full Name *</label>
                    <div style={styles.inputWrap}>
                        <User size={14} color="var(--text-muted)" style={styles.ico} />
                        <input
                            type="text" required
                            value={fullName} onChange={e => setFullName(e.target.value)}
                            placeholder="e.g. Arjun Sharma"
                            style={styles.input}
                        />
                    </div>

                    {/* Phone */}
                    <label style={{ ...styles.label, marginTop: 14 }}>Phone Number <span style={{ opacity: 0.5 }}>(optional)</span></label>
                    <div style={styles.inputWrap}>
                        <Phone size={14} color="var(--text-muted)" style={styles.ico} />
                        <input
                            type="tel"
                            value={phone} onChange={e => setPhone(e.target.value)}
                            placeholder="+91 98765 43210"
                            style={styles.input}
                        />
                    </div>

                    {error && <div style={styles.error}>{error}</div>}

                    <button type="submit" disabled={loading} style={styles.btn}>
                        {loading
                            ? <span style={styles.spinner} />
                            : <><ArrowRight size={14} /> Enter InsightFlow</>
                        }
                    </button>
                </form>

                <p style={{ marginTop: 16, fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
                    Logged in as <span style={{ color: 'var(--accent-cyan)' }}>{user?.email}</span>
                </p>
            </div>
        </div>
    )
}
