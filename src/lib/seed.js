import { supabase } from './supabase'
import { DEFAULT_CATEGORIES, DEFAULT_INCOME, DEFAULT_MONTHLY_EXPENSES } from './seedData'
import { DEFAULT_GOALS } from './goalSeedData'

/**
 * Seed the 17 default categories for a new user.
 * Always called — both CSV and fallback paths need categories.
 * Returns { catMap: { name → id }, error }.
 */
export async function seedCategories(userId) {
  const { data: cats, error } = await supabase
    .from('categories')
    .insert(DEFAULT_CATEGORIES.map(c => ({ ...c, user_id: userId })))
    .select('id, name')

  if (error) return { catMap: {}, error }
  const catMap = Object.fromEntries(cats.map(c => [c.name, c.id]))
  return { catMap, error: null }
}

/**
 * Fallback budget seed — used when user skips CSV upload.
 * Inserts zeroed-out income + expense rows and sample goals.
 */
export async function seedFallbackBudget(userId, catMap) {
  const { error: incErr } = await supabase
    .from('income_items')
    .insert(DEFAULT_INCOME.map(i => ({ ...i, user_id: userId })))
  if (incErr) return { error: incErr }

  const monthly = DEFAULT_MONTHLY_EXPENSES.map(e => ({
    user_id:     userId,
    label:       e.label,
    budgeted:    0,
    actual:      0,
    note:        '',
    frequency:   'monthly',
    enabled:     true,
    category_id: catMap[e.category_name] ?? null,
    sort_order:  e.sort_order,
  }))

  const { error: expErr } = await supabase.from('expense_items').insert(monthly)
  if (expErr) return { error: expErr }

  const { error: goalErr } = await seedSampleGoals(userId)
  return { error: goalErr }
}

/**
 * CSV-derived budget seed — used when user completes the CSV upload wizard.
 *
 * @param {string} userId
 * @param {Object} options
 *   incomeRows      — [{ label, budgeted, actual }]
 *   expenseRows     — [{ label, category_id, budgeted, actual }]
 *   bankAccounts    — [{ name, colMap, stagingId }]
 *   transactions    — all staged transactions
 *   payeeRuleMap    — { pattern → categoryId }
 *   userCategories  — categories created during step 4 with temp ids (user-*)
 */
export async function seedFromTransactions(userId, {
  incomeRows,
  expenseRows,
  bankAccounts,
  transactions,
  payeeRuleMap,
  userCategories = [],
}) {
  // 0. Insert any user-created categories from step 4 (have temp 'user-*' ids).
  //    Build a tempId → realId map so expense rows and payee rules can
  //    reference the correct real DB ids.
  const tempToRealCatId = {}
  if (userCategories.length) {
    const { data: newCats, error: catErr } = await supabase
      .from('categories')
      .insert(userCategories.map((c, i) => ({
        user_id:     userId,
        name:        c.name,
        color:       c.color,
        description: c.description ?? '',
        enabled:     true,
        sort_order:  1000 + i, // append after the 17 seeded categories
      })))
      .select('id, name')
    if (catErr) return { error: catErr }
    for (const nc of newCats) {
      const orig = userCategories.find(c => c.name === nc.name)
      if (orig) tempToRealCatId[orig.id] = nc.id
    }
  }

  // Resolve a category id — maps temp 'user-*' ids to real DB ids
  function resolvecat(id) {
    return tempToRealCatId[id] ?? id
  }

  // 1. Create bank accounts, get their real IDs
  const acctIdMap = {} // stagingId → real db id
  for (const bank of bankAccounts) {
    const { data, error } = await supabase
      .from('bank_accounts')
      .insert({
        user_id:     userId,
        name:        bank.name,
        col_date:    bank.colMap.dateCol,
        col_desc:    bank.colMap.descCol,
        col_amount:  bank.colMap.amountCol,
        amount_sign: bank.colMap.amountSign,
      })
      .select().single()
    if (error) return { error }
    acctIdMap[bank.stagingId] = data.id
  }

  // 2. Insert income items
  const { error: incErr } = await supabase
    .from('income_items')
    .insert(incomeRows.map((r, i) => ({ ...r, user_id: userId, sort_order: i, enabled: true })))
  if (incErr) return { error: incErr }

  // 3. Insert expense items — resolve any temp category ids to real ids
  const resolvedExpenseRows = expenseRows.map(r => ({
    ...r,
    category_id: r.category_id ? resolvecat(r.category_id) : null,
  }))

  const { data: expData, error: expErr } = await supabase
    .from('expense_items')
    .insert(resolvedExpenseRows.map((r, i) => ({
      ...r,
      user_id:    userId,
      sort_order: i,
      frequency:  'monthly',
      enabled:    true,
    })))
    .select('id, category_id')
  if (expErr) return { error: expErr }

  // Build category_id → expense_item id lookup (one expense item per category)
  const catToExpItemId = Object.fromEntries(expData.map(e => [e.category_id, e.id]))

  // 4. Insert transactions — resolve staging ids to real ids
  const txRows = transactions.map(tx => ({
    user_id:            userId,
    bank_account_id:    acctIdMap[tx.stagingBankId] ?? null,
    date:               tx.date,
    description:        tx.description,
    amount:             tx.amount,
    matched_expense_id: tx.assignedCategoryId
      ? (catToExpItemId[resolvecat(tx.assignedCategoryId)] ?? null)
      : null,
    ignored:  tx.ignored ?? false,
    applied:  false,
  }))

  const { error: txErr } = await supabase.from('transactions').insert(txRows)
  if (txErr) return { error: txErr }

  // 5. Insert payee rules — resolve temp category ids
  if (payeeRuleMap && Object.keys(payeeRuleMap).length) {
    const ruleRows = Object.entries(payeeRuleMap)
      .map(([pattern, catId]) => [pattern, resolvecat(catId)])
      .filter(([, catId]) => catToExpItemId[catId])
      .map(([pattern, catId]) => ({
        user_id:         userId,
        pattern,
        expense_item_id: catToExpItemId[catId],
        hit_count:       1,
      }))
    if (ruleRows.length) {
      await supabase.from('payee_rules').insert(ruleRows)
    }
  }

  // 6. Seed sample goals
  await seedSampleGoals(userId)

  return { error: null }
}

/**
 * Insert the 5 sample savings goals.
 */
export async function seedSampleGoals(userId) {
  const { error } = await supabase
    .from('savings_goals')
    .insert(DEFAULT_GOALS.map(g => ({ ...g, user_id: userId })))
  return { error }
}

/**
 * Legacy combined seed — kept for any code paths that still call it.
 * Now calls seedCategories + seedFallbackBudget.
 */
export async function seedNewUser(userId) {
  const { catMap, error: catErr } = await seedCategories(userId)
  if (catErr) return { error: catErr }
  return seedFallbackBudget(userId, catMap)
}

export async function userHasBudget(userId) {
  const { count } = await supabase
    .from('income_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  return (count ?? 0) > 0
}
