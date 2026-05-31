import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

/**
 * Central data hook. Loads income_items, expense_items, and categories
 * for the current user. Exposes CRUD helpers that optimistically update
 * local state then persist to Supabase.
 */
export function useBudget() {
  const { user } = useAuth()

  const [income,     setIncome]     = useState([])
  const [monthly,    setMonthly]    = useState([])
  const [annual,     setAnnual]     = useState([])
  const [categories, setCategories] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)

  // ── Load all data ──────────────────────────────────────────────────────────
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

  // ── Generic cell update helper ─────────────────────────────────────────────
  async function updateCell(table, id, field, value, setFn) {
    // Optimistic update
    setFn(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
    const { error } = await supabase.from(table).update({ [field]: value }).eq('id', id)
    if (error) { load(); return { error } } // revert on failure
    return { error: null }
  }

  // ── Income ─────────────────────────────────────────────────────────────────
  const updateIncome = (id, field, value) =>
    updateCell('income_items', id, field, value, setIncome)

  async function addIncome(row) {
    const newRow = { ...row, user_id: user.id, sort_order: income.length }
    const { data, error } = await supabase.from('income_items').insert(newRow).select().single()
    if (!error) setIncome(prev => [...prev, data])
    return { error }
  }

  async function deleteIncome(id) {
    setIncome(prev => prev.filter(r => r.id !== id))
    await supabase.from('income_items').delete().eq('id', id)
  }

  // ── Monthly expenses ───────────────────────────────────────────────────────
  const updateMonthly = (id, field, value) =>
    updateCell('expense_items', id, field, value, setMonthly)

  async function addMonthly(row) {
    const newRow = { ...row, user_id: user.id, frequency: 'monthly', sort_order: monthly.length }
    const { data, error } = await supabase.from('expense_items').insert(newRow).select().single()
    if (!error) setMonthly(prev => [...prev, data])
    return { error }
  }

  async function deleteMonthly(id) {
    setMonthly(prev => prev.filter(r => r.id !== id))
    await supabase.from('expense_items').delete().eq('id', id)
  }

  // ── Annual expenses ────────────────────────────────────────────────────────
  const updateAnnual = (id, field, value) =>
    updateCell('expense_items', id, field, value, setAnnual)

  async function addAnnual(row) {
    const newRow = { ...row, user_id: user.id, frequency: 'annual', sort_order: annual.length }
    const { data, error } = await supabase.from('expense_items').insert(newRow).select().single()
    if (!error) setAnnual(prev => [...prev, data])
    return { error }
  }

  async function deleteAnnual(id) {
    setAnnual(prev => prev.filter(r => r.id !== id))
    await supabase.from('expense_items').delete().eq('id', id)
  }

  // ── Categories ─────────────────────────────────────────────────────────────
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

  // ── Derived totals ─────────────────────────────────────────────────────────
  const totalBudgetedIncome   = income.reduce((s, r) => s + (r.budgeted || 0), 0)
  const totalActualIncome     = income.reduce((s, r) => s + (r.actual   || 0), 0)
  const totalBudgetedMonthly  = monthly.reduce((s, r) => s + (r.budgeted || 0), 0)
  const totalActualMonthly    = monthly.reduce((s, r) => s + (r.actual   || 0), 0)
  const totalBudgetedAnnual   = annual.reduce((s, r) => s + (r.budgeted || 0), 0)
  const totalActualAnnual     = annual.reduce((s, r) => s + (r.actual   || 0), 0)
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

  return {
    // Data
    income, monthly, annual, categories,
    loading, error, reload: load,
    // Income
    updateIncome, addIncome, deleteIncome,
    // Monthly
    updateMonthly, addMonthly, deleteMonthly,
    // Annual
    updateAnnual, addAnnual, deleteAnnual,
    // Categories
    updateCategory, addCategory, deleteCategory,
    // Totals
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
    },
  }
}
