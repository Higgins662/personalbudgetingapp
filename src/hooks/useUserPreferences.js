import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

/**
 * User-level preferences (currently: share_payee_patterns).
 * Row is created lazily on first write — if it doesn't exist yet,
 * the user is treated as opted-in by default (matches the RPC's
 * server-side default).
 */
export function useUserPreferences() {
  const { user } = useAuth()
  const [sharePatterns, setSharePatterns] = useState(true)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('user_preferences')
      .select('share_payee_patterns')
      .eq('user_id', user.id)
      .maybeSingle()
    setSharePatterns(data?.share_payee_patterns ?? true)
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  async function setSharePayeePatterns(value) {
    setSharePatterns(value) // optimistic
    const { error } = await supabase
      .from('user_preferences')
      .upsert({ user_id: user.id, share_payee_patterns: value, updated_at: new Date().toISOString() })
    if (error) load() // revert on failure
    return { error }
  }

  return { sharePatterns, loading, setSharePayeePatterns }
}
