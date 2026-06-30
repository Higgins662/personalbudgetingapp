import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

/**
 * useBudget now manages the TEMPLATE side of income/expense items —
 * label, category, bank_account_id, enabled, note. The budgeted/actual
 * numbers live in period_items (see usePeriods) and are merged in here
 * via the `periods` argument so existing pages don't need a full rewrite
 * of their render logic — they just read `row.budgeted`/`row.actual` as
 * before, except those values now reflect whichever period is selected.
 *
 * @param {object} periods — the object returned by usePeriods()
 */
export function useBudget(periods) {
  const { user } = useAuth()

  const [income,     setIncome]     = useState([])
  const [monthly,    setMonthly]    = useState([])
  const [annual,     setAnnual]     = useState([])
  const [categories, setCategories] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)

    const [catRes, incRes, expRes] = await Promise.all([
      supabase.from('categories').select('*').eq('user_id', user.id).order('sort_order'),
      supabase.from('income_items').select('*').eq('user_id', user.id).order('sort_order'),
      supabase.from('expense_items').select('*').eq('user_id', user.id).order('sort_order'),
    ])

    const err = catRes.error || incRes.error || expRes.error
    if (err) { setError(err.message); setLoading(false); return }

    setCategories(catRes.data ?? [])
    setIncome(incRes.data ?? [])
    setMonthly((expRes.data ?? []).filter(e => e.frequency === 'monthly'))
    setAnnual ((expRes.data ?? []).filter(e => e.frequency === 'annual'))
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  // ── Merge period_items (budgeted/actual/flagged) onto the template rows ────
  function mergePeriod(items, periodItems, itemType) {
    return items.map(item => {
      const pi = periodItems?.find(p => p.item_id === item.id && p.item_type === itemType)
      return {
        ...item,
        budgeted:      pi?.budgeted ?? 0,
        actual:        pi?.actual ?? 0,
        flagged:       pi?.flagged ?? false,
        flag_variance: pi?.flag_variance ?? null,
        period_item_id: pi?.id ?? null,
      }
    })
  }

  const incomeWithPeriod  = periods ? mergePeriod(income,  periods.monthItems, 'income')  : income
  const monthlyWithPeriod = periods ? mergePeriod(monthly, periods.monthItems, 'expense') : monthly
  const annualWithPeriod  = periods ? mergePeriod(annual,  periods.yearItems,  'expense') : annual

  // ── Template field updates (label, category, bank account, enabled, note) ──
  async function updateTemplateField(table, id, field, value, setFn) {
    setFn(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
    const { error } = await supabase.from(table).update({ [field]: value }).eq('id', id)
    if (error) { load(); return { error } }
    return { error: null }
  }

  // ── Period field updates (budgeted/actual) — routed through usePeriods ─────
  async function updatePeriodField(row, field, value) {
    if (!periods || !row.period_item_id) return { error: new Error('No active period item') }
    return periods.updatePeriodItem(row.period_item_id, field, value)
  }

  /**
   * Unified update — figures out whether `field` belongs on the template
   * row or the period row and routes accordingly. This is what the UI
   * components call; they don't need to know about the split.
   */
  function makeUpdater(table, setFn, rows) {
    return (id, field, value) => {
      if (field === 'budgeted' || field === 'actual') {
        const row = rows.find(r => r.id === id)
        return updatePeriodField(row, field, value)
      }
      return updateTemplateField(table, id, field, value, setFn)
    }
  }

  const updateIncome  = makeUpdater('income_items',  setIncome,  incomeWithPeriod)
  const updateMonthly = makeUpdater('expense_items', setMonthly, monthlyWithPeriod)
  const updateAnnual  = makeUpdater('expense_items', setAnnual,  annualWithPeriod)

  // ── Add rows — create template + ensure a period_items row exists ──────────
  async function addIncome(row) {
    const { budgeted, actual, ...templateFields } = row
    const newRow = { ...templateFields, user_id: user.id, sort_order: income.length, enabled: true }
    const { data, error } = await supabase.from('income_items').insert(newRow).select().single()
    if (error) return { error }
    setIncome(prev => [...prev, data])
    if (periods) {
      await periods.ensurePeriodItem(data.id, 'income', 'monthly')
      if (budgeted) await periods.updatePeriodItem(
        periods.monthItems.find(p => p.item_id === data.id)?.id, 'budgeted', budgeted
      )
    }
    return { error: null }
  }

  async function addMonthly(row) {
    const { budgeted, actual, ...templateFields } = row
    const newRow = { ...templateFields, user_id: user.id, frequency: 'monthly', sort_order: monthly.length, enabled: true }
    const { data, error } = await supabase.from('expense_items').insert(newRow).select().single()
    if (error) return { error }
    setMonthly(prev => [...prev, data])
    if (periods) await periods.ensurePeriodItem(data.id, 'expense', 'monthly')
    return { error: null }
  }

  async function addAnnual(row) {
    const { budgeted, actual, ...templateFields } = row
    const newRow = { ...templateFields, user_id: user.id, frequency: 'annual', sort_order: annual.length, enabled: true }
    const { data, error } = await supabase.from('expense_items').insert(newRow).select().single()
    if (error) return { error }
    setAnnual(prev => [...prev, data])
    if (periods) await periods.ensurePeriodItem(data.id, 'expense', 'annual')
    return { error: null }
  }

  async function deleteIncome(id) {
    setIncome(prev => prev.filter(r => r.id !== id))
    await supabase.from('income_items').delete().eq('id', id) // cascades period_items via FK? No FK to item_id, clean up explicitly:
    await supabase.from('period_items').delete().eq('item_id', id).eq('item_type', 'income')
  }
  async function deleteMonthly(id) {
    setMonthly(prev => prev.filter(r => r.id !== id))
    await supabase.from('expense_items').delete().eq('id', id)
    await supabase.from('period_items').delete().eq('item_id', id).eq('item_type', 'expense')
  }
  async function deleteAnnual(id) {
    setAnnual(prev => prev.filter(r => r.id !== id))
    await supabase.from('expense_items').delete().eq('id', id)
    await supabase.from('period_items').delete().eq('item_id', id).eq('item_type', 'expense')
  }

  // ── Categories — unchanged, not period-scoped ───────────────────────────────
  const updateCategory = (id, field, value) => updateTemplateField('categories', id, field, value, setCategories)

  async function addCategory(row) {
    const newRow = { ...row, user_id: user.id, sort_order: categories.length }
    const { data, error } = await supabase.from('categories').insert(newRow).select().single()
    if (!error) setCategories(prev => [...prev, data])
    return { error }
  }
  async function deleteCategory(id) {
    setCategories(prev => prev.filter(c => c.id !== id))
    await supabase.from('categories').delete().eq('id', id)
  }

  // ── Derived totals — based on the period-merged rows, active rows only ─────
  const activeIncome  = incomeWithPeriod.filter(r => r.enabled !== false)
  const activeMonthly = monthlyWithPeriod.filter(r => r.enabled !== false)
  const activeAnnual  = annualWithPeriod.filter(r => r.enabled !== false)

  const totalBudgetedIncome   = activeIncome.reduce((s, r)  => s + (r.budgeted || 0), 0)
  const totalActualIncome     = activeIncome.reduce((s, r)  => s + (r.actual   || 0), 0)
  const totalBudgetedMonthly  = activeMonthly.reduce((s, r) => s + (r.budgeted || 0), 0)
  const totalActualMonthly    = activeMonthly.reduce((s, r) => s + (r.actual   || 0), 0)
  const totalBudgetedAnnual   = activeAnnual.reduce((s, r)  => s + (r.budgeted || 0), 0)
  const totalActualAnnual     = activeAnnual.reduce((s, r)  => s + (r.actual   || 0), 0)
  const totalBudgetedAnnualMo = totalBudgetedAnnual / 12
  const totalActualAnnualMo   = totalActualAnnual   / 12
  const totalBudgetedExpenses = totalBudgetedMonthly + totalBudgetedAnnualMo
  const totalActualExpenses   = totalActualMonthly   + totalActualAnnualMo
  const netBudgeted           = totalBudgetedIncome  - totalBudgetedExpenses
  const netActual             = totalActualIncome    - totalActualExpenses
  const savingsRateBudgeted   = totalBudgetedIncome > 0 ? Math.round((netBudgeted / totalBudgetedIncome) * 100) : 0
  const savingsRateActual     = totalActualIncome   > 0 ? Math.round((netActual   / totalActualIncome)   * 100) : 0

  const disabledIncome  = income.filter(r => r.enabled === false).length
  const disabledMonthly = monthly.filter(r => r.enabled === false).length
  const disabledAnnual  = annual.filter(r => r.enabled === false).length

  return {
    income: incomeWithPeriod, monthly: monthlyWithPeriod, annual: annualWithPeriod,
    categories,
    loading: loading || (periods?.loading ?? false),
    error, reload: load,
    updateIncome, addIncome, deleteIncome,
    updateMonthly, addMonthly, deleteMonthly,
    updateAnnual, addAnnual, deleteAnnual,
    updateCategory, addCategory, deleteCategory,
    totals: {
      budgetedIncome: totalBudgetedIncome, actualIncome: totalActualIncome,
      budgetedMonthly: totalBudgetedMonthly, actualMonthly: totalActualMonthly,
      budgetedAnnual: totalBudgetedAnnual, actualAnnual: totalActualAnnual,
      budgetedExpenses: totalBudgetedExpenses, actualExpenses: totalActualExpenses,
      netBudgeted, netActual, savingsRateBudgeted, savingsRateActual,
      disabledIncome, disabledMonthly, disabledAnnual,
    },
  }
}
