import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

/**
 * Shared reset logic used by both ReconcilePage and SettingsPage.
 *
 * clearMonth()  — deletes current month's transactions + resets period actuals
 * softReset()   — wipes all budget data, keeps bank accounts + auth record
 */
export function useReset({ onMonthCleared, onSoftReset } = {}) {
  const { user } = useAuth()

  const [clearingMonth, setClearingMonth] = useState(false)
  const [clearMonthResult, setClearMonthResult] = useState(null)
  const [clearMonthError, setClearMonthError] = useState('')

  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')

  async function clearMonth(monthStart = null) {
    setClearingMonth(true)
    setClearMonthError('')
    setClearMonthResult(null)

    const params = { p_user_id: user.id }
    if (monthStart) params.p_month_start = monthStart

    const { data, error } = await supabase.rpc('clear_month_import', params)

    setClearingMonth(false)
    if (error) { setClearMonthError(error.message); return { error } }
    setClearMonthResult(data)
    onMonthCleared?.()
    return { data, error: null }
  }

  async function softReset() {
    setResetting(true)
    setResetError('')

    const { data, error } = await supabase.rpc('soft_reset_budget', { p_user_id: user.id })

    setResetting(false)
    if (error) { setResetError(error.message); return { error } }
    onSoftReset?.()
    return { data, error: null }
  }

  return {
    clearMonth, clearingMonth, clearMonthResult, clearMonthError,
    softReset,  resetting,     resetError,
  }
}
