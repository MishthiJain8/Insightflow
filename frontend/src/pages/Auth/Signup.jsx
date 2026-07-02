import React, { useState, useRef } from 'react'
import { Activity, Mail, Lock, Eye, EyeOff, ShieldCheck, RefreshCw, ArrowRight, LayoutDashboard } from 'lucide-react'
import { styles } from './_authStyles'
import { useAuth } from '../../context/AuthContext'

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://insightflow-api-git-main-mishthi-jains-projects.vercel.app' : 'http://localhost:8000')

export default function Signup({ onNavigate }) {
    const { login } = useAuth()
    // ── Step tracking ─────────────────────────────────────────────────────────
    // step: 'form' → 'otp' → 'done'
    const [step, setStep] = useState('form')

    // ── Form fields ───────────────────────────────────────────────────────────
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [showPwd, setShowPwd] = useState(false)

    // ── OTP fields ────────────────────────────────────────────────────────────
    const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', ''])
    const otpRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()]

    // ── Status ────────────────────────────────────────────────────────────────
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [resendCooldown, setResendCooldown] = useState(0)
    const [demoOtp, setDemoOtp] = useState(null)

    // ── Step 1: Validate form + send OTP via backend ──────────────────────────
    const handleSendOtp = async (e) => {
        e.preventDefault()
        if (password !== confirm) { setError('Passwords do not match.'); return }
        if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
        setLoading(true); setError(null)
        try {
            const res = await fetch(`${API_BASE}/api/auth/send-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.detail || 'Failed to send OTP')
            if (data.dev_otp) {
                setDemoOtp(data.dev_otp)
                setOtpDigits(data.dev_otp.split('').slice(0, 6))
            }
            setStep('otp')
            startResendCooldown()
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    // ── Resend OTP cooldown timer ─────────────────────────────────────────────
    const startResendCooldown = () => {
        setResendCooldown(60)
        const t = setInterval(() => {
            setResendCooldown(prev => {
                if (prev <= 1) { clearInterval(t); return 0 }
                return prev - 1
            })
        }, 1000)
    }

    const handleResend = async () => {
        if (resendCooldown > 0) return
        setLoading(true); setError(null)
        try {
            const res = await fetch(`${API_BASE}/api/auth/send-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.detail || 'Failed to resend OTP')
            if (data.dev_otp) {
                setDemoOtp(data.dev_otp)
                setOtpDigits(data.dev_otp.split('').slice(0, 6))
            } else {
                setDemoOtp(null)
                setOtpDigits(['', '', '', '', '', ''])
            }
            startResendCooldown()
            otpRefs[0].current?.focus()
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    // ── OTP digit input handling ──────────────────────────────────────────────
    const handleOtpChange = (index, value) => {
        const digit = value.replace(/\D/g, '').slice(-1)
        const next = [...otpDigits]
        next[index] = digit
        setOtpDigits(next)
        if (digit && index < 5) otpRefs[index + 1].current?.focus()
    }

    const handleOtpKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !otpDigits[index] && index > 0)
            otpRefs[index - 1].current?.focus()
    }

    const handleOtpPaste = (e) => {
        e.preventDefault()
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
        const next = [...otpDigits]
        for (let i = 0; i < 6; i++) next[i] = pasted[i] || ''
        setOtpDigits(next)
        otpRefs[Math.min(pasted.length, 5)].current?.focus()
    }

    // ── Step 2: Verify OTP → Call Python Backend to Register ─────────────────
    const handleVerifyAndCreate = async (e) => {
        e.preventDefault()
        const otp = otpDigits.join('')
        if (otp.length < 6) { setError('Please enter the full 6-digit code.'); return }
        setLoading(true); setError(null)

        try {
            // 1) Verify OTP via backend
            const verifyRes = await fetch(`${API_BASE}/api/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp }),
            })
            const verifyData = await verifyRes.json()
            if (!verifyRes.ok) throw new Error(verifyData.detail || 'Invalid OTP')

            // 2) OTP valid → Create user via Custom Python Backend Auth
            const registerRes = await fetch(`${API_BASE}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            })
            const data = await registerRes.json()
            if (!registerRes.ok) throw new Error(data.detail || 'Failed to create account')

            setStep('done')
            // Log the user into Context using the JWT returned from backend
            login(data.token, data.user)
            // ProfileGuard will redirect them to /setup-profile automatically
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div style={styles.page}>
            <div style={styles.card}>
                <div style={styles.logoRow}>
                    <div style={styles.logoIcon}><Activity size={22} color="var(--accent-cyan)" /></div>
                    <span style={styles.logoText}>InsightFlow</span>
                </div>

                {/* ── Step: done ────────────────────────────────────────── */}
                {step === 'done' && (
                    <div style={{ padding: '24px 0', textAlign: 'center' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🎉</div>
                        <h2 style={{ ...styles.title, marginBottom: 8 }}>Account created!</h2>
                        <p style={{ ...styles.subtitle, marginBottom: 24 }}>
                            Welcome to InsightFlow. You're being signed in automatically.
                        </p>

                        {error ? (
                            <div style={{ ...styles.error, marginBottom: 20 }}>{error}</div>
                        ) : (
                            <div style={styles.success}>✅ Successfully verified and registered.</div>
                        )}

                        <button
                            onClick={() => window.location.reload()}
                            style={{ ...styles.btn, marginTop: 12, background: 'rgba(255,255,255,0.1)', border: '1px solid var(--glass-border)' }}
                        >
                            <LayoutDashboard size={14} /> Proceed to Dashboard
                        </button>
                    </div>
                )}

                {/* ── Step: otp ─────────────────────────────────────────── */}
                {step === 'otp' && (
                    <>
                        <h1 style={styles.title}>Verify your email</h1>
                        <p style={styles.subtitle}>
                            We sent a 6-digit code to <span style={{ color: 'var(--accent-cyan)' }}>{email}</span>
                        </p>
                        {demoOtp && (
                            <div style={{ ...styles.success, marginBottom: 16 }}>
                                Demo code: <strong style={{ letterSpacing: '0.18em' }}>{demoOtp}</strong>
                            </div>
                        )}

                        <form onSubmit={handleVerifyAndCreate} style={{ ...styles.form, marginTop: 20 }}>
                            {/* OTP digit boxes */}
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }} onPaste={handleOtpPaste}>
                                {otpDigits.map((d, i) => (
                                    <input
                                        key={i}
                                        ref={otpRefs[i]}
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={1}
                                        value={d}
                                        onChange={e => handleOtpChange(i, e.target.value)}
                                        onKeyDown={e => handleOtpKeyDown(i, e)}
                                        style={{
                                            width: 44, height: 52, textAlign: 'center',
                                            fontSize: '1.3rem', fontWeight: 700, fontFamily: 'monospace',
                                            background: 'rgba(255,255,255,0.05)',
                                            border: d ? '1px solid var(--accent-cyan)' : '1px solid var(--glass-border)',
                                            borderRadius: 8, color: 'var(--text-primary)',
                                            outline: 'none', transition: 'border 0.2s',
                                        }}
                                    />
                                ))}
                            </div>

                            {error && <div style={styles.error}>{error}</div>}

                            <button type="submit" disabled={loading} style={styles.btn}>
                                {loading
                                    ? <span style={styles.spinner} />
                                    : <><ShieldCheck size={14} /> Verify &amp; Create Account</>
                                }
                            </button>
                        </form>

                        {/* Resend */}
                        <p style={{ marginTop: 16, textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Didn't receive it?{' '}
                            {resendCooldown > 0
                                ? <span style={{ color: 'var(--text-muted)' }}>Resend in {resendCooldown}s</span>
                                : (
                                    <button onClick={handleResend} disabled={loading} style={styles.link}>
                                        <RefreshCw size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                                        Resend OTP
                                    </button>
                                )
                            }
                        </p>

                        <p style={{ marginTop: 8, textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            <button onClick={() => { setStep('form'); setError(null) }} style={styles.link}>
                                ← Change email
                            </button>
                        </p>
                    </>
                )}

                {/* ── Step: form ────────────────────────────────────────── */}
                {step === 'form' && (
                    <>
                        <h1 style={styles.title}>Create account</h1>
                        <p style={styles.subtitle}>Start your quantitative trading journey</p>

                        <form onSubmit={handleSendOtp} style={styles.form}>
                            <label style={styles.label}>Email</label>
                            <div style={styles.inputWrap}>
                                <Mail size={14} color="var(--text-muted)" style={styles.ico} />
                                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" style={styles.input} />
                            </div>

                            <label style={{ ...styles.label, marginTop: 14 }}>Password</label>
                            <div style={styles.inputWrap}>
                                <Lock size={14} color="var(--text-muted)" style={styles.ico} />
                                <input type={showPwd ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" style={{ ...styles.input, paddingRight: 40 }} />
                                <button type="button" onClick={() => setShowPwd(v => !v)} style={styles.eyeBtn}>
                                    {showPwd ? <EyeOff size={13} /> : <Eye size={13} />}
                                </button>
                            </div>

                            <label style={{ ...styles.label, marginTop: 14 }}>Confirm Password</label>
                            <div style={styles.inputWrap}>
                                <Lock size={14} color="var(--text-muted)" style={styles.ico} />
                                <input type={showPwd ? 'text' : 'password'} required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat your password" style={styles.input} />
                            </div>

                            {error && <div style={styles.error}>{error}</div>}

                            <button type="submit" disabled={loading} style={styles.btn}>
                                {loading
                                    ? <span style={styles.spinner} />
                                    : <><ArrowRight size={14} /> Send Verification Code</>
                                }
                            </button>
                        </form>
                    </>
                )}

                {step !== 'done' && (
                    <p style={styles.foot}>
                        Already have an account?{' '}
                        <button onClick={() => onNavigate('login')} style={styles.link}>Sign in</button>
                    </p>
                )}
            </div>
        </div>
    )
}
