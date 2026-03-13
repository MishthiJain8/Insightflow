import React, { useState } from 'react'
import Login from '../pages/Auth/Login'
import Signup from '../pages/Auth/Signup'
import VerifyOTP from '../pages/Auth/VerifyOTP'
import ResetPassword from '../pages/Auth/ResetPassword'
import { useAuth } from '../context/AuthContext'
import ProfileGuard from './ProfileGuard'

/**
 * AuthRouter
 * Top-level router for auth vs app states.
 *
 * States:
 *   'login'  → Login page
 *   'signup' → Signup page
 *   'otp'    → VerifyOTP page (needs email + type from navigate payload)
 *   'forgot' → ResetPassword step 1 (request OTP)
 *   'reset'  → ResetPassword step 2 (set new password, session active)
 *
 * When user IS authenticated:
 *   → ProfileGuard checks profile completeness
 *   → If complete, renders children (the real App shell)
 */
export default function AuthRouter({ children }) {
    const { user, authLoading } = useAuth()
    const [authPage, setAuthPage] = useState('login')
    const [otpPayload, setOtpPayload] = useState({ email: '', type: 'signup', otp: '' })

    // Universal navigate helper passed as prop to auth pages
    const navigate = (page, payload = {}) => {
        if (page === 'otp') setOtpPayload({ email: payload.email ?? '', type: payload.type ?? 'signup', otp: '' })
        if (page === 'reset') setOtpPayload(prev => ({ ...prev, otp: payload.otp ?? '' }))
        setAuthPage(page)
    }

    // ── Loading splash ───────────────────────────────────────────────
    if (authLoading) {
        return (
            <div style={{
                minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-primary)',
            }}>
                <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    border: '3px solid rgba(6,182,212,0.2)',
                    borderTop: '3px solid var(--accent-cyan)',
                    animation: 'spin 0.8s linear infinite',
                }} />
                <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
            </div>
        )
    }

    // ── Logged in → Profile check → App ─────────────────────────────
    if (user) {
        return <ProfileGuard>{children}</ProfileGuard>
    }

    // ── Not logged in → Auth pages ───────────────────────────────────
    if (authPage === 'signup')
        return <Signup onNavigate={navigate} />

    if (authPage === 'otp')
        return <VerifyOTP onNavigate={navigate} email={otpPayload.email} otpType={otpPayload.type} />

    if (authPage === 'forgot' || authPage === 'reset')
        return <ResetPassword
            onNavigate={navigate}
            inheritedEmail={otpPayload.email}
            verifiedOtp={otpPayload.otp}
            initialStep={authPage === 'reset' ? 'update' : 'request'}
        />

    return <Login onNavigate={navigate} />
}
