import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
}
function startOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1).toISOString().split('T')[0]
}
function addMonths(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setMonth(d.getMonth() + n)
  return d.toISOString().split('T')[0]
}
function addYears(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setFullYear(d.getFullYear() + n)
  return d.toISOString().split('T')[0]
}

export function formatMonthLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
export function formatYearLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.getFullYear().toString()
}

/**
 * Manages monthly and yearly budget periods.
 *
 * On mount: ensures the current month's and current year's periods exist
 * (auto-rolling forward from the most recent prior period if needed),
 * then loads them plus their period_items.
 *
 * Exposes a `viewingMonth`/`viewingYear` selector so the UI can browse
 * the current or previous period without changing what's "active."
 */
export function usePeriods() {
  const { user } = useAuth()

  const [currentMonthPeriod, setCurrentMonthPeriod] = useState(null) // { id, period_start }
  const [currentYearPeriod,  setCurrentYearPeriod]  = useState(null)
  const [monthItems, setMonthItems] = useState([]) // period_items for the viewed month
  const [yearItems,  setYearItems]  = useState([])

  const [viewingMonth, setViewingMonth] = useState(startOfMonth())
  const [viewingYear,  setViewingYear]  = useState(startOfYear())

  const [availableMonths, setAvailableMonths] = useState([]) // [period_start, ...] descending
  const [availableYears,  setAvailableYears]  = useState([])

  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [rolling, setRolling] = useState(false)

  // ── Ensure current periods exist, then load everything ─────────────────────
  const init = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)

    const thisMonth = startOfMonth()
    const thisYear  = startOfYear()

    const [monthRes, yearRes] = await Promise.all([
      supabase.rpc('get_or_create_period', { p_user_id: user.id, p_period_type: 'monthly', p_period_start: thisMonth }),
      supabase.rpc('get_or_create_period', { p_user_id: user.id, p_period_type: 'yearly',  p_period_start: thisYear }),
    ])

    // Log errors from period creation but don't block — periods may already exist
    if (monthRes.error) console.warn('get_or_create_period (monthly):', monthRes.error.message)
    if (yearRes.error)  console.warn('get_or_create_period (yearly):', yearRes.error.message)

    const { data: allPeriods } = await supabase
      .from('budget_periods')
      .select('id, period_type, period_start')
      .eq('user_id', user.id)
      .order('period_start', { ascending: false })

    const months = (allPeriods ?? []).filter(p => p.period_type === 'monthly')
    const years  = (allPeriods ?? []).filter(p => p.period_type === 'yearly')

    setAvailableMonths(months.map(p => p.period_start))
    setAvailableYears(years.map(p => p.period_start))

    const curMonth = months.find(p => p.period_start === thisMonth)
    const curYear  = years.find(p => p.period_start === thisYear)
    setCurrentMonthPeriod(curMonth ?? null)
    setCurrentYearPeriod(curYear ?? null)

    setViewingMonth(thisMonth)
    setViewingYear(thisYear)

    setLoading(false)
  }, [user])

  useEffect(() => { init() }, [init])

  // ── Load period_items whenever the viewed month/year changes ───────────────
  const loadMonthItems = useCallback(async (periodStart) => {
    if (!user) return
    const { data: period } = await supabase
      .from('budget_periods')
      .select('id')
      .eq('user_id', user.id).eq('period_type', 'monthly').eq('period_start', periodStart)
      .maybeSingle()

    if (!period) { setMonthItems([]); return }

    const { data } = await supabase
      .from('period_items')
      .select('*')
      .eq('period_id', period.id)
    setMonthItems(data ?? [])
  }, [user])

  const loadYearItems = useCallback(async (periodStart) => {
    if (!user) return
    const { data: period } = await supabase
      .from('budget_periods')
      .select('id')
      .eq('user_id', user.id).eq('period_type', 'yearly').eq('period_start', periodStart)
      .maybeSingle()

    if (!period) { setYearItems([]); return }

    const { data } = await supabase
      .from('period_items')
      .select('*')
      .eq('period_id', period.id)
    setYearItems(data ?? [])
  }, [user])

  useEffect(() => { if (!loading) loadMonthItems(viewingMonth) }, [viewingMonth, loading, loadMonthItems])
  useEffect(() => { if (!loading) loadYearItems(viewingYear) },   [viewingYear,  loading, loadYearItems])

  // ── Manual rollover ──────────────────────────────────────────────────────
  async function startNewMonth() {
    if (!currentMonthPeriod) return
    setRolling(true)
    const nextStart = addMonths(currentMonthPeriod.period_start, 1)
    const { data: newId, error } = await supabase.rpc('get_or_create_period', {
      p_user_id: user.id, p_period_type: 'monthly', p_period_start: nextStart,
    })
    setRolling(false)
    if (error) return { error }
    await init() // refresh available periods + current pointers
    setViewingMonth(nextStart)
    return { error: null, periodId: newId }
  }

  async function startNewYear() {
    if (!currentYearPeriod) return
    setRolling(true)
    const nextStart = addYears(currentYearPeriod.period_start, 1)
    const { data: newId, error } = await supabase.rpc('get_or_create_period', {
      p_user_id: user.id, p_period_type: 'yearly', p_period_start: nextStart,
    })
    setRolling(false)
    if (error) return { error }
    await init()
    setViewingYear(nextStart)
    return { error: null, periodId: newId }
  }

  // ── Item-level update/insert within the viewed period ───────────────────────
  async function updatePeriodItem(periodItemId, field, value) {
    setMonthItems(prev => prev.map(pi => pi.id === periodItemId ? { ...pi, [field]: value } : pi))
    setYearItems (prev => prev.map(pi => pi.id === periodItemId ? { ...pi, [field]: value } : pi))
    const { error } = await supabase.from('period_items').update({ [field]: value }).eq('id', periodItemId)
    if (error) { loadMonthItems(viewingMonth); loadYearItems(viewingYear) }
    return { error }
  }

  /** Ensure a period_items row exists for a newly-created income/expense item */
  async function ensurePeriodItem(itemId, itemType, frequency = 'monthly') {
    await supabase.rpc('ensure_period_item', {
      p_user_id: user.id, p_item_id: itemId, p_item_type: itemType, p_frequency: frequency,
    })
    // Refresh whichever list is relevant
    if (frequency === 'annual') loadYearItems(viewingYear)
    else loadMonthItems(viewingMonth)
  }

  const isViewingCurrentMonth = viewingMonth === currentMonthPeriod?.period_start
  const isViewingCurrentYear  = viewingYear  === currentYearPeriod?.period_start

  const canGoPrevMonth = availableMonths.includes(addMonths(viewingMonth, -1))
  const canGoNextMonth = availableMonths.includes(addMonths(viewingMonth, 1))
  const canGoPrevYear  = availableYears.includes(addYears(viewingYear, -1))
  const canGoNextYear  = availableYears.includes(addYears(viewingYear, 1))

  return {
    loading, error, rolling,
    currentMonthPeriod, currentYearPeriod,
    viewingMonth, viewingYear,
    setViewingMonth, setViewingYear,
    isViewingCurrentMonth, isViewingCurrentYear,
    canGoPrevMonth, canGoNextMonth, canGoPrevYear, canGoNextYear,
    goPrevMonth: () => setViewingMonth(m => addMonths(m, -1)),
    goNextMonth: () => setViewingMonth(m => addMonths(m, 1)),
    goPrevYear:  () => setViewingYear(y => addYears(y, -1)),
    goNextYear:  () => setViewingYear(y => addYears(y, 1)),
    monthItems, yearItems,
    updatePeriodItem, ensurePeriodItem,
    startNewMonth, startNewYear,
    reload: init,
  }
}
