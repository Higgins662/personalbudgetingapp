import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { normalizePattern } from '../lib/fuzzyMatch'

export function usePayeeRules() {
  const { user } = useAuth()

  const [rules,   setRules]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('payee_rules')
      .select('*')
      .eq('user_id', user.id)
      .order('hit_count', { ascending: false })

    if (error) { setError(error.message); setLoading(false); return }
    setRules(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  /**
   * Learn (or strengthen) a personal rule from a manual match.
   * Upserts on (user_id, pattern) — if the rule already exists for this
   * pattern, bumps hit_count and updates the target expense item in case
   * the user corrected a previous assignment.
   */
  async function learnRule(description, expenseItemId) {
    const pattern = normalizePattern(description)
    if (!pattern || !expenseItemId) return { error: null }

    const existing = rules.find(r => normalizePattern(r.pattern) === pattern)

    if (existing) {
      const newCount = existing.expense_item_id === expenseItemId
        ? (existing.hit_count || 1) + 1
        : 1 // target changed; restart confidence

      const { error } = await supabase
        .from('payee_rules')
        .update({ expense_item_id: expenseItemId, hit_count: newCount })
        .eq('id', existing.id)

      if (!error) {
        setRules(prev => prev.map(r => r.id === existing.id
          ? { ...r, expense_item_id: expenseItemId, hit_count: newCount }
          : r))
      }
      return { error }
    }

    const { data, error } = await supabase
      .from('payee_rules')
      .insert({ user_id: user.id, pattern, expense_item_id: expenseItemId, hit_count: 1 })
      .select().single()

    if (!error) setRules(prev => [data, ...prev])
    return { error }
  }

  async function deleteRule(id) {
    setRules(prev => prev.filter(r => r.id !== id))
    await supabase.from('payee_rules').delete().eq('id', id)
  }

  return { rules, loading, error, reload: load, learnRule, deleteRule }
}
