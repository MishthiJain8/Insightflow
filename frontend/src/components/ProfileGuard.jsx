import React from 'react'
import { useAuth } from '../context/AuthContext'
import SetupProfile from '../pages/SetupProfile'

/**
 * ProfileGuard
 * Wraps the main app shell. If the logged-in user has no profile row,
 * or a profile without a full_name, they are shown SetupProfile.
 * Once the profile is complete, children render normally.
 */
export default function ProfileGuard({ children }) {
    const { profile, authLoading } = useAuth()

    // Still checking auth / profile
    if (authLoading) return null

    // Profile exists and has a name → let them through
    if (profile?.full_name) return children

    // Profile missing or incomplete → force setup
    return <SetupProfile />
}
