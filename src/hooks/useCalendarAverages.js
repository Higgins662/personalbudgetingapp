import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

/**
 * Historical per-item averages for the Calendar view.
 *
 * Mirrors ReportsPage.jsx's multi-month period_items fetch pattern (budget_periods
 * + .in('period_id', ids) on period_items) so numbers stay consistent with what
 * Reports already shows — but averages only over periods where a period_items
 * row actually exists for that item, not a flat divide-by-`months`. A bill only
 * two months old shouldn't look artificially cheap just because it wasn't
 * budgeted for months it didn't exist yet.
 *
 * Monthly items (income, and monthly-frequency expenses) average over the last
 * `months` monthly periods. Annual-frequency expenses average over the last few
 * yearly periods instead — usually just 1-2 years of history.
 *
 * @param {number} months — how many monthly periods to look back (default 6)
 * @returns {{ averagesByItemId: { [item_id]: { avg: number, periodsCounted: number } }, loading: boolean }}
 */
export function useCalendarAverages(months = 6) {
  const { user } = useAuth()
  const [averagesByItemId, setAveragesByItemId] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    let alive = true
    ;(async () => {
      setLoading(true)

      const [monthlyPeriodsRes, yearlyPeriodsRes] = await Promise.all([
        supabase
          .from('budget_periods')
          .select('id')
          .eq('user_id', user.id)
          .eq('period_type', 'monthly')
          .order('period_start', { ascending: false })
          .limit(months),
        supabase
          .from('budget_periods')
          .select('id')
          .eq('user_id', user.id)
          .eq('period_type', 'yearly')
          .order('period_start', { ascending: false })
          .limit(3),
      ])
      if (!alive) return

      const monthlyIds = (monthlyPeriodsRes.data ?? []).map(p => p.id)
      const yearlyIds  = (yearlyPeriodsRes.data  ?? []).map(p => p.id)

      const [monthlyItemsRes, yearlyItemsRes] = await Promise.all([
        monthlyIds.length
          ? supabase.from('period_items').select('item_id, actual').in('period_id', monthlyIds).in('item_type', ['expense', 'income'])
          : Promise.resolve({ data: [] }),
        yearlyIds.length
          ? supabase.from('period_items').select('item_id, actual').in('period_id', yearlyIds).eq('item_type', 'expense')
          : Promise.resolve({ data: [] }),
      ])
      if (!alive) return

      // item_id → { total, count }. An item is only ever monthly or annual,
      // never both, so combining the two fetches here is safe.
      const sums = {}
      for (const pi of [...(monthlyItemsRes.data ?? []), ...(yearlyItemsRes.data ?? [])]) {
        if (!sums[pi.item_id]) sums[pi.item_id] = { total: 0, count: 0 }
        sums[pi.item_id].total += pi.actual || 0
        sums[pi.item_id].count += 1
      }

      const averages = {}
      for (const [itemId, { total, count }] of Object.entries(sums)) {
        averages[itemId] = { avg: count ? total / count : 0, periodsCounted: count }
      }

      setAveragesByItemId(averages)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [user, months])

  return { averagesByItemId, loading }
}
