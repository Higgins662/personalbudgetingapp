import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { normalizePattern } from '../lib/fuzzyMatch'

/**
 * Manages the anonymized, crowd-sourced global_payee_patterns table.
 * Reads are plain SELECTs (RLS allows any authenticated user to read).
 * Writes only ever go through the contribute_payee_pattern() RPC
 * function — there is no direct insert/update path from the client,
 * by design, so individual users can't tamper with the shared table.
 */
export function useGlobalPatterns() {
  const [patterns, setPatterns] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('global_payee_patterns')
      .select('pattern, category_name, hit_count, likely_annual')

    if (error) { setError(error.message); setLoading(false); return }
    setPatterns(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  /**
   * Contribute a confirmed pattern → category pairing to the global
   * table. Fire-and-forget from the UI's perspective — failures here
   * shouldn't block the user's own action (e.g. saving their personal
   * rule), so callers generally don't need to await this.
   */
  async function contribute(description, categoryName, likelyAnnual = false) {
    const pattern = normalizePattern(description)
    if (!pattern || !categoryName) return { error: null }

    const { error } = await supabase.rpc('contribute_payee_pattern', {
      p_pattern:       pattern,
      p_category_name: categoryName,
      p_likely_annual: likelyAnnual,
    })

    if (!error) {
      setPatterns(prev => {
        const idx = prev.findIndex(p => normalizePattern(p.pattern) === pattern)
        if (idx === -1) {
          return [...prev, { pattern, category_name: categoryName, hit_count: 1, likely_annual: likelyAnnual }]
        }
        const updated  = [...prev]
        const existing = updated[idx]
        updated[idx] = {
          ...existing,
          category_name: categoryName,
          hit_count:     (existing.hit_count || 1) + 1,
          likely_annual: existing.likely_annual || likelyAnnual,
        }
        return updated
      })
    }

    return { error }
  }

  return { patterns, loading, error, reload: load, contribute }
}
