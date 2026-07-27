import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { userHasBudget } from '../../lib/seed'

/**
 * Wraps the main app (AppShell). Checks whether the signed-in user has
 * completed onboarding (i.e. has at least one income_item). If not,
 * redirects to /onboarding instead of dropping them into an empty dashboard.
 *
 * This is intentionally separate from ProtectedRoute (auth-only) so that
 * /onboarding itself never gets caught in a redirect loop.
 */
export default function RequireBudget({ children }) {
  const { user } = useAuth()
  const [checking,  setChecking]  = useState(true)
  const [hasBudget, setHasBudget] = useState(true)

  useEffect(() => {
    let alive = true
    if (!user) return
    userHasBudget(user.id).then(result => {
      if (alive) { setHasBudget(result); setChecking(false) }
    })
    return () => { alive = false }
  }, [user])

  if (checking) {
    return (
      <div className="loading-center">
        <span className="spinner" />
        Loading…
      </div>
    )
  }

  if (!hasBudget) {
    return <Navigate to="/onboarding" replace />
  }

  return children
}
