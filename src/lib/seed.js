import { supabase } from './supabase'
import {
  DEFAULT_CATEGORIES,
  DEFAULT_INCOME,
  DEFAULT_MONTHLY_EXPENSES,
  DEFAULT_ANNUAL_EXPENSES,
} from './seedData'

/**
 * Seeds default budget data for a brand-new user.
 * Called once during onboarding if the user has no existing data.
 * Returns { error } — null error means success.
 */
export async function seedNewUser(userId) {
  // 1. Insert categories
  const { data: cats, error: catErr } = await supabase
    .from('categories')
    .insert(DEFAULT_CATEGORIES.map(c => ({ ...c, user_id: userId })))
    .select('id, name')

  if (catErr) return { error: catErr }

  // Build name → id lookup
  const catMap = Object.fromEntries(cats.map(c => [c.name, c.id]))

  // 2. Insert income items
  const { error: incErr } = await supabase
    .from('income_items')
    .insert(DEFAULT_INCOME.map(i => ({ ...i, user_id: userId })))

  if (incErr) return { error: incErr }

  // 3. Insert monthly expenses
  const monthly = DEFAULT_MONTHLY_EXPENSES.map(e => ({
    user_id:     userId,
    label:       e.label,
    budgeted:    e.budgeted,
    actual:      e.actual,
    note:        e.note,
    frequency:   'monthly',
    category_id: catMap[e.category_name] ?? null,
    sort_order:  e.sort_order,
  }))

  const { error: monErr } = await supabase.from('expense_items').insert(monthly)
  if (monErr) return { error: monErr }

  // 4. Insert annual expenses
  const annual = DEFAULT_ANNUAL_EXPENSES.map(e => ({
    user_id:     userId,
    label:       e.label,
    budgeted:    e.budgeted,
    actual:      e.actual,
    note:        e.note,
    frequency:   'annual',
    category_id: catMap[e.category_name] ?? null,
    sort_order:  e.sort_order,
  }))

  const { error: annErr } = await supabase.from('expense_items').insert(annual)
  if (annErr) return { error: annErr }

  return { error: null }
}

/**
 * Returns true if the user already has budget data (i.e. not a new user).
 */
export async function userHasBudget(userId) {
  const { count } = await supabase
    .from('income_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  return (count ?? 0) > 0
}
