import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useBudget() {
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

  async function updateCell(table, id, field, value, setFn) {
    setFn(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
    const { error } = await supabase.from(table).update({ [field]: value }).eq('id', id)
    if (error) { load(); return { error } }
    return { error: null }
  }

  // ── Income ────────────────────────────────────────────────────────────────
  const updateIncome = (id, field, value) =>
    updateCell('income_items', id, field, value, setIncome)

  async function addIncome(row) {
    const newRow = { ...row, user_id: user.id, sort_order: income.length, enabled: true }
    const { data, error } = await supabase.from('income_items').insert(newRow).select().single()
    if (!error) setIncome(prev => [...prev, data])
    return { error }
  }

  async function deleteIncome(id) {
    setIncome(prev => prev.filter(r => r.id !== id))
    await supabase.from('income_items').delete().eq('id', id)
  }

  // ── Monthly expenses ──────────────────────────────────────────────────────
  const updateMonthly = (id, field, value) =>
    updateCell('expense_items', id, field, value, setMonthly)

  async function addMonthly(row) {
    const newRow = { ...row, user_id: user.id, frequency: 'monthly', sort_order: monthly.length, enabled: true }
    const { data, error } = await supabase.from('expense_items').insert(newRow).select().single()
    if (!error) setMonthly(prev => [...prev, data])
    return { error }
  }

  async function deleteMonthly(id) {
    setMonthly(prev => prev.filter(r => r.id !== id))
    await supabase.from('expense_items').delete().eq('id', id)
  }

  // ── Annual expenses ───────────────────────────────────────────────────────
  const updateAnnual = (id, field, value) =>
    updateCell('expense_items', id, field, value, setAnnual)

  async function addAnnual(row) {
    const newRow = { ...row, user_id: user.id, frequency: 'annual', sort_order: annual.length, enabled: true }
    const { data, error } = await supabase.from('expense_items').insert(newRow).select().single()
    if (!error) setAnnual(prev => [...prev, data])
    return { error }
  }

  async function deleteAnnual(id) {
    setAnnual(prev => prev.filter(r => r.id !== id))
    await supabase.from('expense_items').delete().eq('id', id)
  }

  // ── Categories ────────────────────────────────────────────────────────────
  const updateCategory = (id, field, value) =>
    updateCell('categories', id, field, value, setCategories)

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

  // ── Derived totals — disabled rows excluded from every calculation ────────
  // Mirrors the original HTML: income.filter(r=>r.enabled!==false), etc.
  const activeIncome  = income.filter(r => r.enabled !== false)
  const activeMonthly = monthly.filter(r => r.enabled !== false)
  const activeAnnual  = annual.filter(r => r.enabled !== false)

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
  const savingsRateBudgeted   = totalBudgetedIncome > 0
    ? Math.round((netBudgeted / totalBudgetedIncome) * 100) : 0
  const savingsRateActual     = totalActualIncome > 0
    ? Math.round((netActual   / totalActualIncome)   * 100) : 0

  // Count of disabled rows per table — shown on Dashboard as a notice
  const disabledIncome  = income.filter(r => r.enabled === false).length
  const disabledMonthly = monthly.filter(r => r.enabled === false).length
  const disabledAnnual  = annual.filter(r => r.enabled === false).length

  return {
    income, monthly, annual, categories,
    loading, error, reload: load,
    updateIncome, addIncome, deleteIncome,
    updateMonthly, addMonthly, deleteMonthly,
    updateAnnual, addAnnual, deleteAnnual,
    updateCategory, addCategory, deleteCategory,
    totals: {
      budgetedIncome:   totalBudgetedIncome,
      actualIncome:     totalActualIncome,
      budgetedMonthly:  totalBudgetedMonthly,
      actualMonthly:    totalActualMonthly,
      budgetedAnnual:   totalBudgetedAnnual,
      actualAnnual:     totalActualAnnual,
      budgetedExpenses: totalBudgetedExpenses,
      actualExpenses:   totalActualExpenses,
      netBudgeted,
      netActual,
      savingsRateBudgeted,
      savingsRateActual,
      disabledIncome,
      disabledMonthly,
      disabledAnnual,
    },
  }
}
