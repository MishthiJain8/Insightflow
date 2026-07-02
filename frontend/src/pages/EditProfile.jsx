import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Activity, User, Phone, Lock, Eye, EyeOff, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react'
import { styles } from './Auth/_authStyles'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export default function EditProfile({ onBack }) {
    const { user, profile, token, refreshProfile } = useAuth()

    const [fullName, setFullName] = useState(profile?.full_name || '')
    const [phone, setPhone] = useState(profile?.phone_number || '')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [saved, setSaved] = useState(false)

    // Password-change OTP state
    const [pwdStep, setPwdStep] = useState('idle')  // 'idle' | 'sent' | 'updating'
    const [pwdOtp, setPwdOtp] = useState('')
    const [newPwd, setNewPwd] = useState('')
    const [confirmPwd, setConfirmPwd] = useState('')
    const [showPwd, setShowPwd] = useState(false)
    const [pwdLoading, setPwdLoading] = useState(false)
    const [pwdError, setPwdError] = useState(null)
    const [pwdSuccess, setPwdSuccess] = useState(false)

    // ── Save profile ────────────────────────────────────────────────
    const handleSave = async (e) => {
        e.preventDefault()
        if (!fullName.trim()) { setError('Full name is required.'); return }
        setLoading(true); setError(null); setSaved(false)

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

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.detail || 'Failed to update profile')
            }

            setSaved(true)
            await refreshProfile()
            setTimeout(() => setSaved(false), 3000)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    // ── Send password-change OTP ─────────────────────────────────
    const handleSendPwdOtp = async () => {
        setPwdLoading(true); setPwdError(null)
        try {
            const res = await fetch(`${API_BASE}/api/auth/profile/password-otp`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.detail || 'Failed to send OTP')
            }
            setPwdStep('sent')
        } catch (err) {
            setPwdError(err.message)
        } finally {
            setPwdLoading(false)
        }
    }

    // ── Verify OTP and set new password ─────────────────────────
    const handleUpdatePwd = async (e) => {
        e.preventDefault()
        if (newPwd !== confirmPwd) { setPwdError('Passwords do not match.'); return }
        if (newPwd.length < 8) { setPwdError('Minimum 8 characters.'); return }
        setPwdLoading(true); setPwdError(null)

        try {
            const res = await fetch(`${API_BASE}/api/auth/profile/update-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    otp: pwdOtp,
                    new_password: newPwd
                })
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.detail || 'Failed to update password')
            }

            setPwdSuccess(true)
            setPwdStep('idle')
            setNewPwd(''); setConfirmPwd(''); setPwdOtp('')
        } catch (err) {
            setPwdError(err.message)
        } finally {
            setPwdLoading(false)
        }
    }

    const inputStyle = {
        ...styles.input, padding: '10px 12px 10px 34px',
    }

    return (
        <div style={{ ...styles.page, alignItems: 'flex-start', paddingTop: 48 }}>
            <div style={{ ...styles.card, maxWidth: 500 }}>
                <div style={styles.logoRow}>
                    <div style={styles.logoIcon}><Activity size={22} color="var(--accent-cyan)" /></div>
                    <span style={styles.logoText}>Edit Profile</span>
                </div>

                {/* ── Profile Info ─────────────────────────────────────── */}
                <h2 style={{ ...styles.title, fontSize: '1.1rem', marginBottom: 4 }}>Personal Information</h2>
                <p style={{ ...styles.subtitle, marginBottom: 20 }}>Changes sync automatically to your account.</p>

                <form onSubmit={handleSave} style={styles.form}>
                    <label style={styles.label}>Full Name *</label>
                    <div style={styles.inputWrap}>
                        <User size={14} color="var(--text-muted)" style={styles.ico} />
                        <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" style={inputStyle} />
                    </div>

                    <label style={{ ...styles.label, marginTop: 14 }}>Phone <span style={{ opacity: 0.5 }}>(optional)</span></label>
                    <div style={styles.inputWrap}>
                        <Phone size={14} color="var(--text-muted)" style={styles.ico} />
                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 00000 00000" style={inputStyle} />
                    </div>

                    {error && <div style={styles.error}>{error}</div>}
                    {saved && <div style={styles.success}>✅ Profile saved!</div>}

                    <button type="submit" disabled={loading} style={{ ...styles.btn, marginTop: 14 }}>
                        {loading ? <span style={styles.spinner} /> : <><ArrowRight size={14} /> Save Changes</>}
                    </button>
                </form>

                {/* ── Divider ──────────────────────────────────────────── */}
                <div style={{ borderTop: '1px solid var(--glass-border)', margin: '24px 0' }} />

                {/* ── Password Change ──────────────────────────────────── */}
                <h2 style={{ ...styles.title, fontSize: '1.1rem', marginBottom: 4 }}>Change Password</h2>
                <p style={{ ...styles.subtitle, marginBottom: 16 }}>We'll send an OTP to <span style={{ color: 'var(--accent-cyan)' }}>{user?.email}</span></p>

                {pwdStep === 'idle' && !pwdSuccess && (
                    <button onClick={handleSendPwdOtp} disabled={pwdLoading} style={{ ...styles.btnSecondary, marginTop: 0 }}>
                        <ShieldCheck size={14} />
                        {pwdLoading ? 'Sending OTP…' : 'Send Password-Change OTP'}
                    </button>
                )}

                {pwdSuccess && (
                    <div style={styles.success}><CheckCircle2 size={14} style={{ verticalAlign: 'middle' }} /> Password updated successfully!</div>
                )}

                {pwdStep === 'sent' && (
                    <form onSubmit={handleUpdatePwd} style={styles.form}>
                        <label style={styles.label}>OTP from Email</label>
                        <div style={styles.inputWrap}>
                            <Lock size={14} color="var(--text-muted)" style={styles.ico} />
                            <input type="text" inputMode="numeric" maxLength={6} required value={pwdOtp}
                                onChange={e => setPwdOtp(e.target.value.replace(/\D/g, ''))}
                                placeholder="6-digit code" style={{ ...inputStyle, fontFamily: 'monospace', letterSpacing: '0.2em' }} />
                        </div>

                        <label style={{ ...styles.label, marginTop: 14 }}>New Password</label>
                        <div style={styles.inputWrap}>
                            <Lock size={14} color="var(--text-muted)" style={styles.ico} />
                            <input type={showPwd ? 'text' : 'password'} required value={newPwd}
                                onChange={e => setNewPwd(e.target.value)} placeholder="Min. 8 characters"
                                style={{ ...inputStyle, paddingRight: 40 }} />
                            <button type="button" onClick={() => setShowPwd(v => !v)} style={styles.eyeBtn}>
                                {showPwd ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                        </div>

                        <label style={{ ...styles.label, marginTop: 14 }}>Confirm Password</label>
                        <div style={styles.inputWrap}>
                            <Lock size={14} color="var(--text-muted)" style={styles.ico} />
                            <input type={showPwd ? 'text' : 'password'} required value={confirmPwd}
                                onChange={e => setConfirmPwd(e.target.value)} placeholder="Repeat password" style={inputStyle} />
                        </div>

                        {pwdError && <div style={styles.error}>{pwdError}</div>}

                        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                            <button type="button" onClick={() => setPwdStep('idle')} style={{ ...styles.btnSecondary, flex: 1, marginTop: 0 }}>Cancel</button>
                            <button type="submit" disabled={pwdLoading} style={{ ...styles.btn, flex: 2, marginTop: 0 }}>
                                {pwdLoading ? <span style={styles.spinner} /> : 'Update Password'}
                            </button>
                        </div>
                    </form>
                )}

                <div style={{ borderTop: '1px solid var(--glass-border)', marginTop: 24, paddingTop: 16 }}>
                    <button onClick={onBack} style={styles.link}>← Back to Dashboard</button>
                </div>
            </div>
        </div>
    )
}
