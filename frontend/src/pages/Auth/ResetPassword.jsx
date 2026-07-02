const API_BASE = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? 'https://insightflow-api-git-main-mishthi-jains-projects.vercel.app' : 'http://localhost:8000')
import { Activity, Mail, ArrowRight } from 'lucide-react'
import { styles } from './_authStyles'

export default function ResetPassword({ onNavigate, inheritedEmail = '', verifiedOtp = '', initialStep = 'request' }) {
    const [step, setStep] = useState(initialStep)   // 'request' | 'update'
    const [email, setEmail] = useState(inheritedEmail)
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(false)

    // Step 1 — send OTP to email
    const handleRequest = async (e) => {
        e.preventDefault()
        setLoading(true); setError(null)
        try {
            const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.detail || 'Failed to request reset')

            // Go to OTP screen in recovery mode
            onNavigate('otp', { email, type: 'recovery' })
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    // Step 2 — update password after OTP verified (session is active)
    const handleUpdate = async (e, otp) => {
        e.preventDefault()
        if (password !== confirm) { setError('Passwords do not match.'); return }
        if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
        setLoading(true); setError(null)

        try {
            const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    otp,
                    new_password: password
                })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.detail || 'Failed to update password')

            setSuccess(true)
            setTimeout(() => onNavigate('login'), 2000)
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

                {step === 'request' ? (
                    <>
                        <h1 style={styles.title}>Reset password</h1>
                        <p style={styles.subtitle}>We'll send an OTP to your email to verify your identity.</p>

                        <form onSubmit={handleRequest} style={styles.form}>
                            <label style={styles.label}>Email address</label>
                            <div style={styles.inputWrap}>
                                <Mail size={14} color="var(--text-muted)" style={styles.ico} />
                                <input type="email" required value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="you@example.com" style={styles.input} />
                            </div>

                            {error && <div style={styles.error}>{error}</div>}

                            <button type="submit" disabled={loading} style={styles.btn}>
                                {loading ? <span style={styles.spinner} /> : <><ArrowRight size={14} /> Send OTP</>}
                            </button>
                        </form>
                    </>
                ) : (
                    <>
                        <h1 style={styles.title}>New password</h1>
                        <p style={styles.subtitle}>Choose a strong password for your account.</p>

                        <form onSubmit={(e) => handleUpdate(e, verifiedOtp)} style={styles.form}>
                            <label style={styles.label}>New Password</label>
                            <div style={styles.inputWrap}>
                                <input type="password" required value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Min. 8 characters" style={styles.input} />
                            </div>

                            <label style={{ ...styles.label, marginTop: 14 }}>Confirm Password</label>
                            <div style={styles.inputWrap}>
                                <input type="password" required value={confirm}
                                    onChange={e => setConfirm(e.target.value)}
                                    placeholder="Repeat password" style={styles.input} />
                            </div>

                            {error && <div style={styles.error}>{error}</div>}
                            {success && <div style={styles.success}>✅ Password updated! Redirecting…</div>}

                            <button type="submit" disabled={loading || success} style={styles.btn}>
                                {loading ? <span style={styles.spinner} /> : 'Update Password'}
                            </button>
                        </form>
                    </>
                )}

                <p style={styles.foot}>
                    <button onClick={() => onNavigate('login')} style={styles.link}>← Back to Sign In</button>
                </p>
            </div>
        </div>
    )
}
