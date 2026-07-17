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
  if (goalErr) return { error: goalErr }

  // Create the current monthly period and seed period_items for all items
  const { error: periodErr } = await seedCurrentPeriod(userId)
  return { error: periodErr ?? null }
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

  // Insert transactions in batches of 500 to avoid Supabase payload limits
  const BATCH_SIZE = 500
  for (let i = 0; i < txRows.length; i += BATCH_SIZE) {
    const batch = txRows.slice(i, i + BATCH_SIZE)
    const { error: txErr } = await supabase.from('transactions').insert(batch)
    if (txErr) return { error: txErr }
  }

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

    // Contribute every assigned payee pattern to the global pool.
    // Fetch categories to get names, then fire-and-forget per pattern.
    const { data: cats } = await supabase
      .from('categories')
      .select('id, name, is_system')
      .eq('user_id', userId)
    const catNameMap = Object.fromEntries((cats ?? []).map(c => [c.id, c]))

    for (const [pattern, catId] of Object.entries(payeeRuleMap)) {
      const cat = catNameMap[resolvecat(catId)]
      if (!cat || cat.is_system) continue
      supabase.rpc('contribute_payee_pattern', {
        p_pattern:       pattern,
        p_category_name: cat.name,
      }).catch(() => {})
    }
  }

  // 6. Create the current monthly period and write period_items with real values
  const { error: periodErr } = await seedCurrentPeriodWithValues(userId, incData, expData, resolvedExpenseRows, incomeRows)
  if (periodErr) return { error: periodErr }

  // 7. Seed sample goals
  await seedSampleGoals(userId)

  return { error: null }
}

/**
 * Create the current monthly budget period and seed zero period_items.
 * Used by the fallback (no CSV) path.
 */
async function seedCurrentPeriod(userId) {
  const monthStart = new Date()
  monthStart.setDate(1)
  const periodStart = monthStart.toISOString().split('T')[0]

  const { data: periodId, error: periodErr } = await supabase.rpc('get_or_create_period', {
    p_user_id:     userId,
    p_period_type: 'monthly',
    p_period_start: periodStart,
  })
  if (periodErr) return { error: periodErr }
  return { error: null }
}

/**
 * Create the current monthly budget period and seed period_items with
 * the real budgeted/actual values from the CSV-driven wizard.
 * Used by the seedFromTransactions path.
 */
async function seedCurrentPeriodWithValues(userId, incData, expData, expenseRows, incomeRows) {
  const monthStart = new Date()
  monthStart.setDate(1)
  const periodStart = monthStart.toISOString().split('T')[0]

  // Create (or get) the current monthly period
  const { data: periodId, error: periodErr } = await supabase.rpc('get_or_create_period', {
    p_user_id:      userId,
    p_period_type:  'monthly',
    p_period_start: periodStart,
  })
  if (periodErr) return { error: periodErr }

  // Build period_items rows — one per income item
  const periodItemRows = []

  for (const item of incData) {
    const sourceRow = incomeRows.find(r => r.label === item.label)
    periodItemRows.push({
      period_id:  periodId,
      user_id:    userId,
      item_id:    item.id,
      item_type:  'income',
      budgeted:   sourceRow?.budgeted ?? 0,
      actual:     sourceRow?.actual   ?? 0,
    })
  }

  // One per expense item
  for (const item of expData) {
    const sourceRow = expenseRows.find(r => r.category_id === item.category_id)
    periodItemRows.push({
      period_id:  periodId,
      user_id:    userId,
      item_id:    item.id,
      item_type:  'expense',
      budgeted:   sourceRow?.budgeted ?? 0,
      actual:     sourceRow?.actual   ?? 0,
    })
  }

  if (periodItemRows.length) {
    const BATCH = 500
    for (let i = 0; i < periodItemRows.length; i += BATCH) {
      const { error } = await supabase.from('period_items').insert(periodItemRows.slice(i, i + BATCH))
      if (error) return { error }
    }
  }

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
