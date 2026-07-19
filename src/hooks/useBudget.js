/**
 * This is a PATCH to useBudget.js — it shows only the lines that change.
 *
 * In your existing useBudget.js, find the "Derived totals" section
 * and replace the three active row filters with these:
 *
 * BEFORE:
 *   const activeIncome  = income.filter(r => r.enabled !== false)
 *   const activeMonthly = monthly.filter(r => r.enabled !== false)
 *   const activeAnnual  = annual.filter(r => r.enabled !== false)
 *
 * AFTER:
 *   const activeIncome  = income.filter(r => r.enabled !== false && !isSystemCategory(r, categories))
 *   const activeMonthly = monthly.filter(r => r.enabled !== false && !isSystemCategory(r, categories))
 *   const activeAnnual  = annual.filter(r => r.enabled !== false && !isSystemCategory(r, categories))
 *
 * And add this helper function anywhere above the return statement:
 *
 *   function isSystemCategory(row, categories) {
 *     if (!row.category_id) return false
 *     const cat = categories.find(c => c.id === row.category_id)
 *     return cat?.is_system === true
 *   }
 *
 * Also update the CategoriesPage to hide system categories from the
 * editable category grid (they should be read-only / not deletable).
 */

// ── Full updated useBudget.js for reference ──────────────────────────────────
// If you prefer to replace the whole file, the full version is below.
// The only changes from the previous version are:
//   1. The isSystemCategory helper (new)
//   2. The three activeIncome/Monthly/Annual filters (updated)
//   3. The disabledIncome/Monthly/Annual counts (updated to also exclude system)

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

function isSystemCategory(row, categories) {
  if (!row.category_id) return false
  const cat = categories.find(c => c.id === row.category_id)
  return cat?.is_system === true
}

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

    // Deduplicate categories by name — guards against double-seeding
    const rawCats = catRes.data ?? []
    const seen = new Set()
    const dedupedCats = rawCats.filter(c => {
      if (seen.has(c.name)) return false
      seen.add(c.name)
      return true
    })
    setCategories(dedupedCats)

    // Build a name→canonical-id map so expense items pointing at duplicate
    // category rows (same name, different id) are remapped to the keeper id
    const nameToCanonicalId = Object.fromEntries(dedupedCats.map(c => [c.name, c.id]))
    const allCatsById = Object.fromEntries(rawCats.map(c => [c.id, c]))
    function remapCategoryId(exp) {
      if (!exp.category_id) return exp
      if (nameToCanonicalId[allCatsById[exp.category_id]?.name]) {
        return { ...exp, category_id: nameToCanonicalId[allCatsById[exp.category_id].name] }
      }
      return exp
    }

    const expenses = (expRes.data ?? []).map(remapCategoryId)
    setIncome(incRes.data ?? [])
    setMonthly(expenses.filter(e => e.frequency === 'monthly'))
    setAnnual (expenses.filter(e => e.frequency === 'annual'))
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  async function updateTemplateField(table, id, field, value, setFn) {
    setFn(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
    const { error } = await supabase.from(table).update({ [field]: value }).eq('id', id)
    if (error) { load(); return { error } }
    // If frequency changed, reload so item moves between monthly/annual lists,
    // and ensure a period_item exists in the new period type
    if (field === 'frequency' && !error && periods) {
      await periods.ensurePeriodItem(id, 'expense', value)
      load()
    }
    return { error: null }
  }

  async function updatePeriodField(row, field, value) {
    if (!periods || !row.period_item_id) return { error: new Error('No active period item') }
    return periods.updatePeriodItem(row.period_item_id, field, value)
  }

  function mergePeriod(items, periodItems, itemType) {
    return items.map(item => {
      const pi = periodItems?.find(p => p.item_id === item.id && p.item_type === itemType)
      return {
        ...item,
        budgeted:       pi?.budgeted ?? 0,
        actual:         pi?.actual ?? 0,
        flagged:        pi?.flagged ?? false,
        flag_variance:  pi?.flag_variance ?? null,
        period_item_id: pi?.id ?? null,
      }
    })
  }

  const incomeWithPeriod  = periods ? mergePeriod(income,  periods.monthItems, 'income')  : income
  const monthlyWithPeriod = periods ? mergePeriod(monthly, periods.monthItems, 'expense') : monthly
  const annualWithPeriod  = periods ? mergePeriod(annual,  periods.yearItems,  'expense') : annual

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

  async function addIncome(row) {
    const { budgeted, actual, ...templateFields } = row
    const newRow = { ...templateFields, user_id: user.id, sort_order: income.length, enabled: true }
    const { data, error } = await supabase.from('income_items').insert(newRow).select().single()
    if (error) return { error }
    setIncome(prev => [...prev, data])
    if (periods) await periods.ensurePeriodItem(data.id, 'income', 'monthly')
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
    await supabase.from('income_items').delete().eq('id', id)
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

  const updateCategory = (id, field, value) => updateTemplateField('categories', id, field, value, setCategories)
  async function addCategory(row) {
    const newRow = { ...row, user_id: user.id, sort_order: categories.filter(c => !c.is_system).length }
    const { data, error } = await supabase.from('categories').insert(newRow).select().single()
    if (!error) setCategories(prev => [...prev, data])
    return { error }
  }
  async function deleteCategory(id) {
    // Prevent deletion of system categories
    const cat = categories.find(c => c.id === id)
    if (cat?.is_system) return { error: new Error('System categories cannot be deleted') }
    setCategories(prev => prev.filter(c => c.id !== id))
    await supabase.from('categories').delete().eq('id', id)
  }

  // ── Totals — system categories excluded ────────────────────────────────────
  const activeIncome  = incomeWithPeriod.filter(r => r.enabled !== false && !isSystemCategory(r, categories))
  const activeMonthly = monthlyWithPeriod.filter(r => r.enabled !== false && !isSystemCategory(r, categories))
  const activeAnnual  = annualWithPeriod.filter(r => r.enabled !== false && !isSystemCategory(r, categories))

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

  // Disabled count excludes system category rows
  const nonSystemMonthly = monthlyWithPeriod.filter(r => !isSystemCategory(r, categories))
  const nonSystemAnnual  = annualWithPeriod.filter(r => !isSystemCategory(r, categories))
  const disabledIncome   = incomeWithPeriod.filter(r => r.enabled === false).length
  const disabledMonthly  = nonSystemMonthly.filter(r => r.enabled === false).length
  const disabledAnnual   = nonSystemAnnual.filter(r => r.enabled === false).length

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
