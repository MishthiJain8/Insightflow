import React, { useState, useRef } from 'react'
import { Activity, ShieldCheck } from 'lucide-react'
import { styles } from './_authStyles'

export default function VerifyOTP({ onNavigate, email = '', otpType = 'signup' }) {
    const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://insightflow-api-git-main-mishthi-jains-projects.vercel.app' : 'http://localhost:8000')
    const [otp, setOtp] = useState(['', '', '', '', '', ''])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(false)
    const inputs = useRef([])

    const handleChange = (i, val) => {
        if (!/^\d*$/.test(val)) return
        const next = [...otp]
        next[i] = val.slice(-1)
        setOtp(next)
        if (val && i < 5) inputs.current[i + 1]?.focus()
    }

    const handleKeyDown = (i, e) => {
        if (e.key === 'Backspace' && !otp[i] && i > 0) inputs.current[i - 1]?.focus()
    }

    const handlePaste = (e) => {
        const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('')
        setOtp([...paste, ...Array(6 - paste.length).fill('')])
        inputs.current[Math.min(paste.length, 5)]?.focus()
    }

    const handleVerify = async () => {
        const token = otp.join('')
        if (token.length < 6) { setError('Please enter all 6 digits.'); return }
        try {
            const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp: token }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.detail || 'Invalid OTP')

            setSuccess(true)
            if (otpType === 'recovery') {
                setTimeout(() => onNavigate('reset', { otp: token }), 1500)
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleResend = async () => {
        try {
            await fetch(`${API_BASE}/api/auth/send-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            })
            setError(null)
        } catch (e) { }
    }

    return (
        <div style={styles.page}>
            <div style={styles.card}>
                <div style={styles.logoRow}>
                    <div style={styles.logoIcon}><Activity size={22} color="var(--accent-cyan)" /></div>
                    <span style={styles.logoText}>InsightFlow</span>
                </div>

                <div style={{ textAlign: 'center', marginBottom: 8 }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 14, margin: '0 auto 14px',
                        background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.15))',
                        border: '1px solid rgba(139,92,246,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <ShieldCheck size={26} color="var(--accent-violet)" />
                    </div>
                    <h1 style={{ ...styles.title, fontSize: '1.3rem' }}>Verify your email</h1>
                    <p style={styles.subtitle}>
                        We sent a 6-digit OTP to<br />
                        <strong style={{ color: 'var(--accent-cyan)' }}>{email}</strong>
                    </p>
                </div>

                {/* OTP cells */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }} onPaste={handlePaste}>
                    {otp.map((digit, i) => (
                        <input
                            key={i}
                            ref={el => inputs.current[i] = el}
                            type="text" inputMode="numeric" maxLength={1}
                            value={digit}
                            onChange={e => handleChange(i, e.target.value)}
                            onKeyDown={e => handleKeyDown(i, e)}
                            style={{
                                width: 48, height: 52, textAlign: 'center',
                                fontSize: '1.4rem', fontWeight: 800, fontFamily: 'monospace',
                                background: digit ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.05)',
                                border: digit ? '1px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 10, color: 'var(--text-primary)',
                                outline: 'none', caretColor: 'var(--accent-violet)',
                                transition: 'all 0.15s',
                            }}
                        />
                    ))}
                </div>

                {success && <div style={styles.success}>✅ Verified! {otpType === 'recovery' ? 'Redirecting…' : 'Logging you in…'}</div>}
                {error && <div style={styles.error}>{error}</div>}

                <button onClick={handleVerify} disabled={loading || success} style={styles.btn}>
                    {loading ? <span style={styles.spinner} /> : <><ShieldCheck size={14} /> Verify OTP</>}
                </button>
                <button onClick={handleResend} style={styles.btnSecondary}>Resend OTP</button>

                <p style={styles.foot}>
                    Wrong email?{' '}
                    <button onClick={() => onNavigate('login')} style={styles.link}>Go back</button>
                </p>
            </div>
        </div>
    )
}
