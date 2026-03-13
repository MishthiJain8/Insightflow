import React, { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)
const API_BASE = 'http://localhost:8000'

export function AuthProvider({ children }) {
    const [token, setToken] = useState(null)
    const [user, setUser] = useState(null) // { id: str, email: str }
    const [profile, setProfile] = useState(null)
    const [authLoading, setAuthLoading] = useState(true)

    // Load initial session from localStorage
    useEffect(() => {
        const storedToken = localStorage.getItem('access_token')
        const storedUser = localStorage.getItem('user_data')
        if (storedToken && storedUser) {
            try {
                setToken(storedToken)
                setUser(JSON.parse(storedUser))
                fetchProfile(JSON.parse(storedUser).id, storedToken)
            } catch (e) {
                signOut()
            }
        } else {
            setAuthLoading(false)
        }
    }, [])

    const login = (jwt, userData) => {
        localStorage.setItem('access_token', jwt)
        localStorage.setItem('user_data', JSON.stringify(userData))
        setToken(jwt)
        setUser(userData)
        fetchProfile(userData.id, jwt)
    }

    const signOut = () => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('user_data')
        setToken(null)
        setUser(null)
        setProfile(null)
        setAuthLoading(false)
    }

    // Proxy the profile fetch through the Python backend using the JWT
    // For now we'll do a direct backend REST call (will build route next)
    const fetchProfile = async (uid, jwt) => {
        try {
            const res = await fetch(`${API_BASE}/api/profile`, {
                headers: { 'Authorization': `Bearer ${jwt}` }
            })
            if (res.ok) {
                const data = await res.json()
                setProfile(data)
            } else {
                setProfile(null)
            }
        } catch {
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
