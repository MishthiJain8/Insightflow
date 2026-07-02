import React, { useState } from 'react'
import { Activity, Mail, Lock, Eye, EyeOff, LogIn } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://insightflow-api-git-main-mishthi-jains-projects.vercel.app' : 'http://localhost:8000')

export default function Login({ onNavigate }) {
    const { login } = useAuth()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPwd, setShowPwd] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    const handleLogin = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        try {
            const res = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.detail || 'Login failed')

            login(data.token, data.user)
            // AuthRouter will detect user state change and redirect automatically via ProfileGuard
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={styles.page}>
            <div style={styles.card}>
                {/* Logo */}
                <div style={styles.logoRow}>
                    <div style={styles.logoIcon}><Activity size={22} color="var(--accent-cyan)" /></div>
                    <span style={styles.logoText}>InsightFlow</span>
                </div>

                <h1 style={styles.title}>Welcome back</h1>
                <p style={styles.subtitle}>Sign in to your trading terminal</p>

                <form onSubmit={handleLogin} style={styles.form}>
                    {/* Email */}
                    <label style={styles.label}>Email</label>
                    <div style={styles.inputWrap}>
                        <Mail size={14} color="var(--text-muted)" style={styles.ico} />
                        <input
                            type="email" required autoComplete="email"
                            value={email} onChange={e => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            style={styles.input}
                        />
                    </div>

                    {/* Password */}
                    <label style={{ ...styles.label, marginTop: 14 }}>Password</label>
                    <div style={styles.inputWrap}>
                        <Lock size={14} color="var(--text-muted)" style={styles.ico} />
                        <input
                            type={showPwd ? 'text' : 'password'} required
                            value={password} onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            style={{ ...styles.input, paddingRight: 40 }}
                        />
                        <button type="button" onClick={() => setShowPwd(v => !v)} style={styles.eyeBtn}>
                            {showPwd ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                    </div>

                    <div style={{ textAlign: 'right', marginTop: 6 }}>
                        <button type="button" onClick={() => onNavigate('forgot')} style={styles.link}>
                            Forgot password?
                        </button>
                    </div>

                    {error && <div style={styles.error}>{error}</div>}

                    <button type="submit" disabled={loading} style={styles.btn}>
                        {loading
                            ? <span style={styles.spinner} />
                            : <><LogIn size={14} /> Sign In</>
                        }
                    </button>
                </form>

                <p style={styles.foot}>
                    Don't have an account?{' '}
                    <button onClick={() => onNavigate('signup')} style={styles.link}>Create one</button>
                </p>
            </div>
        </div>
    )
}

const styles = {
    page: {
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px', background: 'var(--bg-primary)',
    },
    card: {
        width: '100%', maxWidth: 420,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--glass-border)',
        borderRadius: 20, padding: '36px 32px',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
    },
    logoRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 },
    logoIcon: {
        width: 40, height: 40, borderRadius: 10,
        background: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(139,92,246,0.15))',
        border: '1px solid rgba(6,182,212,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    logoText: { fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' },
    title: { fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 },
    subtitle: { fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 28 },
    form: { display: 'flex', flexDirection: 'column' },
    label: { fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 6 },
    inputWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
    ico: { position: 'absolute', left: 12 },
    input: {
        width: '100%', padding: '10px 12px 10px 34px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10, color: 'var(--text-primary)', fontSize: '0.88rem',
        outline: 'none', boxSizing: 'border-box',
        transition: 'border-color 0.2s',
    },
    eyeBtn: {
        position: 'absolute', right: 10, background: 'none', border: 'none',
        color: 'var(--text-muted)', cursor: 'pointer', padding: 4,
    },
    error: {
        marginTop: 12, padding: '9px 12px', borderRadius: 8,
        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
        color: 'var(--accent-red)', fontSize: '0.78rem',
    },
    btn: {
        marginTop: 20, padding: '12px', borderRadius: 12, fontWeight: 700, fontSize: '0.9rem',
        cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-violet))',
        color: '#fff', boxShadow: '0 0 20px rgba(6,182,212,0.3)',
        transition: 'opacity 0.2s',
    },
    spinner: {
        width: 16, height: 16, borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.3)',
        borderTop: '2px solid #fff',
        animation: 'spin 0.7s linear infinite', display: 'inline-block',
    },
    link: { background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 },
    foot: { marginTop: 22, textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' },
}
