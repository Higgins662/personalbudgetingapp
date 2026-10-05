import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { normalizePattern } from '../lib/fuzzyMatch'

/**
 * Crowd-sourced category suggestions ("Others categorize this as ...").
 *
 * The shared data never reaches the browser. Contributions and lookups both
 * go through database functions that reduce a transaction description to
 * its merchant words (no account numbers, reference ids or names), keep one
 * vote per user per merchant, and only answer for merchants that at least
 * two different users agree on. See supabase-shared-merchant-keys.sql.
 */
export function useGlobalPatterns() {
  /**
   * Look up suggestions for a batch of transaction descriptions.
   * Resolves to a Map of description -> { category_name, likely_annual,
   * contributors }. Suggestions are a convenience, so any failure resolves
   * to an empty Map rather than blocking the import that asked.
   */
  const suggest = useCallback(async (descriptions) => {
    const unique = [...new Set((descriptions ?? []).filter(Boolean))]
    if (!unique.length) return new Map()

    const { data, error } = await supabase.rpc('suggest_categories', {
      p_descriptions: unique,
    })
    if (error) return new Map()
    return new Map((data ?? []).map(row => [row.description, row]))
  }, [])

  /**
   * Record that this user filed a description under a category. Fire-and-
   * forget: a failure here must never block the user's own action. The
   * server derives the merchant key, ignores personal payments (P2P,
   * transfers, checks) and rejects categories the user doesn't have.
   */
  const contribute = useCallback(async (description, categoryName, likelyAnnual = false) => {
    const pattern = normalizePattern(description)
    if (!pattern || !categoryName) return { error: null }

    const { error } = await supabase.rpc('contribute_payee_pattern', {
      p_pattern:       pattern,
      p_category_name: categoryName,
      p_likely_annual: likelyAnnual,
    })
    return { error }
  }, [])

  return { suggest, contribute }
}
