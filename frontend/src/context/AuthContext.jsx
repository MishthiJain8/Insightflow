import React, { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export function AuthProvider({ children }) {
    const [token, setToken] = useState(null)
    const [user, setUser] = useState(null) // { id: str, email: str }
    const [profile, setProfile] = useState(null)
    const [authLoading, setAuthLoading] = useState(true)

    // Load initial session from localStorage
    useEffect(() => {
        const storedToken = localStorage.getItem('token')
        const storedUser = localStorage.getItem('user_data')
        if (storedToken && storedUser) {
            try {
                const parsedUser = JSON.parse(storedUser)
                setToken(storedToken)
                setUser(parsedUser)
                // Only fetch profile if we have both token and user ID
                if (storedToken && parsedUser?.id) {
                    fetchProfile(parsedUser.id, storedToken)
                } else {
                    setAuthLoading(false)
                }
            } catch (e) {
                console.error('Auth restore error:', e)
                signOut()
            }
        } else {
            setAuthLoading(false)
        }
    }, [])

    const login = (jwt, userData) => {
        localStorage.setItem('token', jwt)
        localStorage.setItem('user_data', JSON.stringify(userData))
        setToken(jwt)
        setUser(userData)
        fetchProfile(userData.id, jwt)
    }

    const signOut = () => {
        localStorage.removeItem('token')
        localStorage.removeItem('user_data')
        setToken(null)
        setUser(null)
        setProfile(null)
        setAuthLoading(false)
    }

    // Proxy the profile fetch through the Python backend using the JWT
    const fetchProfile = async (uid, jwt) => {
        if (!jwt || !uid) {
            setAuthLoading(false)
            return
        }
        try {
            const res = await fetch(`${API_BASE}/api/profile`, {
                headers: { 'Authorization': `Bearer ${jwt}` }
            })
            if (res.ok) {
                const data = await res.json()
                setProfile(data)
            } else {
                if (res.status === 401) {
                    console.warn('Profile fetch returned 401, signing out')
                    signOut()
                    return
                }
                setProfile(null)
            }
        } catch (err) {
            console.error('Profile fetch error:', err)
            setProfile(null)
        } finally {
            setAuthLoading(false)
        }
    }

    const refreshProfile = () => fetchProfile(user?.id, token)

    return (
        <AuthContext.Provider value={{ token, user, profile, authLoading, login, signOut, refreshProfile }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
    return ctx
}
