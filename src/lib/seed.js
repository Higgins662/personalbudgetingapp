import { supabase } from './supabase'
import { normalizePattern } from './fuzzyMatch'
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
  const { data: incData, error: incErr } = await supabase
    .from('income_items')
    .insert(incomeRows.map((r, i) => ({ ...r, user_id: userId, sort_order: i, enabled: true })))
    .select('id, label')
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
      frequency:  r.frequency ?? 'monthly',
      enabled:    true,
    })))
    .select('id, category_id, frequency, label')
  if (expErr) return { error: expErr }

  // Two SEPARATE lookups — a category can have both a monthly item AND one
  // or more dedicated annual items (e.g. "Subscriptions" monthly + "Ring" yearly).
  // Using a single category_id → item map would collapse them and misroute
  // every transaction in that category to whichever item was inserted last.
  const catToMonthlyItemId = Object.fromEntries(
    expData.filter(e => e.frequency !== 'annual').map(e => [e.category_id, e.id])
  )
  const annualPatternToItemId = {}
  for (const e of expData) {
    if (e.frequency === 'annual') {
      annualPatternToItemId[normalizePattern(e.label)] = e.id
    }
  }

  // Insert empty monthly expense_items for any categories not covered by transactions
  // so they still appear in the Reconcile/Transactions assign dropdowns
  const coveredCatIds = new Set(Object.keys(catToMonthlyItemId))
  const uncoveredCats = userCategories.filter(c =>
    !c.is_system && !coveredCatIds.has(c.id)
  )
  if (uncoveredCats.length) {
    const emptyRows = uncoveredCats.map((c, i) => ({
      user_id:    userId,
      label:      c.name,
      category_id: c.id,
      note:       '',
      frequency:  'monthly',
      budgeted:   0,
      actual:     0,
      enabled:    true,
      sort_order: (resolvedExpenseRows.length) + i,
    }))
    const { data: emptyData } = await supabase
      .from('expense_items')
      .insert(emptyRows)
      .select('id, category_id, frequency, label')
    if (emptyData) {
      for (const e of emptyData) catToMonthlyItemId[e.category_id] = e.id
      expData.push(...emptyData)
    }
  }

  // 4. Insert transactions — resolve staging ids to real ids.
  // Match to the dedicated ANNUAL item first (by normalised description),
  // falling back to the category's monthly item. This is what keeps a
  // once-a-year charge (Ring) from being lumped into the same bucket as
  // the category's regular monthly charges.
  const txRows = transactions.map(tx => {
    const pattern       = normalizePattern(tx.description)
    const annualMatch    = annualPatternToItemId[pattern]
    const monthlyMatch   = tx.assignedCategoryId
      ? (catToMonthlyItemId[resolvecat(tx.assignedCategoryId)] ?? null)
      : null
    return {
      user_id:            userId,
      bank_account_id:    acctIdMap[tx.stagingBankId] ?? null,
      date:               tx.date,
      description:        tx.description,
      amount:             tx.amount,
      matched_expense_id: annualMatch ?? monthlyMatch ?? null,
      ignored:  tx.ignored ?? false,
      applied:  false,
    }
  })

  // Build income item lookup: normalise description → income item id
  // so income deposits get matched to income items, not left unmatched
  const incItemMap = {}
  for (const item of incData) {
    const key = item.label?.toUpperCase().trim()
    if (key) incItemMap[key] = item.id
  }

  // Tag income transactions with matched_income_id (not matched_expense_id —
  // that FK references expense_items, not income_items). Left applied:
  // false, same as matched expenses — apply_transactions_to_budget (called
  // right after insert) is what actually applies each transaction to its
  // own transaction-dated period.
  const finalTxRows = txRows.map(tx => {
    if (tx.matched_expense_id) return tx // already matched as expense
    if (tx.amount > 0) {
      const key = tx.description?.toUpperCase().trim()
      const incomeItemId = incItemMap[key]
      if (incomeItemId) {
        return { ...tx, matched_source: 'income', matched_income_id: incomeItemId }
      }
    }
    return tx
  })

  // Insert transactions in batches of 500 to avoid Supabase payload limits
  const BATCH_SIZE = 500
  for (let i = 0; i < finalTxRows.length; i += BATCH_SIZE) {
    const batch = finalTxRows.slice(i, i + BATCH_SIZE)
    const { error: txErr } = await supabase.from('transactions').insert(batch)
    if (txErr) return { error: txErr }
  }

  // 5. Insert payee rules — resolve temp category ids.
  // A pattern that was flagged yearly gets a rule pointing at its OWN
  // annual item; everything else points at the category's monthly item.
  if (payeeRuleMap && Object.keys(payeeRuleMap).length) {
    const ruleRows = Object.entries(payeeRuleMap)
      .map(([pattern, catId]) => {
        const itemId = annualPatternToItemId[pattern] ?? catToMonthlyItemId[resolvecat(catId)]
        return { pattern, itemId }
      })
      .filter(({ itemId }) => itemId)
      .map(({ pattern, itemId }) => ({
        user_id:         userId,
        pattern,
        expense_item_id: itemId,
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
      // Fire-and-forget: wrap in Promise.resolve so .catch works on the thenable
      // Flag as likely_annual if this pattern appears in the yearly expense rows
      const isAnnual = (expenseRows ?? []).some(r =>
        r.frequency === 'annual' &&
        (r.label ?? '').toUpperCase().trim() === (pattern ?? '').toUpperCase().trim()
      )
      Promise.resolve(supabase.rpc('contribute_payee_pattern', {
        p_pattern:       pattern,
        p_category_name: cat.name,
        p_likely_annual: isAnnual,
      })).catch(() => {})
    }
  }

  // 6. Create the current monthly period and write period_items with
  //    BUDGETED values only (actual left at 0 — see seedCurrentPeriodWithValues).
  //    This MUST run before apply_transactions_to_budget: the upsert here
  //    replaces the whole row, so if it ran after apply it would wipe out
  //    the real actuals apply had just computed.
  const { error: periodErr } = await seedCurrentPeriodWithValues(userId, incData, expData, resolvedExpenseRows, incomeRows)
  if (periodErr) return { error: periodErr }

  // 7. NOW apply all matched transactions to the budget — this is the ONLY
  //    place actuals get written, added on top of the budgeted-only rows
  //    from step 6, correctly split across whichever month/year each
  //    transaction's own date falls in.
  await supabase.rpc('apply_transactions_to_budget', { p_user_id: userId })

  // 8. Seed sample goals
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
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const yearStart  = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]

  // Create monthly and yearly periods
  const { data: monthPeriodId, error: monthErr } = await supabase.rpc('get_or_create_period', {
    p_user_id: userId, p_period_type: 'monthly', p_period_start: monthStart,
  })
  if (monthErr) return { error: monthErr }

  const { data: yearPeriodId } = await supabase.rpc('get_or_create_period', {
    p_user_id: userId, p_period_type: 'yearly', p_period_start: yearStart,
  })
  // yearPeriodId failure is non-fatal — only matters if there are annual items

  const periodItemRows = []

  // Income → monthly period. Only BUDGETED is seeded here, same as expenses
  // below — ACTUAL is deliberately left at 0. apply_transactions_to_budget
  // (called right after this) date-routes each matched income transaction
  // to its own transaction date's month, same as it already does for
  // expenses, instead of collapsing everything into a single current-month
  // aggregate here.
  for (const item of incData) {
    const sourceRow = incomeRows.find(r => r.label === item.label)
    periodItemRows.push({
      period_id: monthPeriodId,
      user_id:   userId,
      item_id:   item.id,
      item_type: 'income',
      budgeted:  sourceRow?.budgeted ?? 0,
      actual:    0,
    })
  }

  // Expenses → monthly or yearly period depending on frequency.
  // Only BUDGETED is seeded here — ACTUAL is deliberately left at 0.
  // apply_transactions_to_budget (called right after this) adds the real,
  // date-routed transaction amounts on top. Seeding a non-zero actual here
  // as well would double-count every transaction.
  for (const item of expData) {
    // Match by id first (yearly items have unique label, monthly match by category)
    const sourceRow = expenseRows.find(r =>
      item.frequency === 'annual'
        ? r.frequency === 'annual' && r.label === item.label
        : r.frequency !== 'annual' && r.category_id === item.category_id
    ) ?? expenseRows.find(r => r.category_id === item.category_id)

    const isAnnual  = item.frequency === 'annual'
    const periodId  = isAnnual ? yearPeriodId : monthPeriodId
    if (!periodId) continue

    periodItemRows.push({
      period_id: periodId,
      user_id:   userId,
      item_id:   item.id,
      item_type: 'expense',
      budgeted:  sourceRow?.budgeted ?? 0,
      actual:    0,
    })
  }

  if (periodItemRows.length) {
    const BATCH = 500
    for (let i = 0; i < periodItemRows.length; i += BATCH) {
      // Upsert so we overwrite the zeros that get_or_create_period already inserted
      const { error } = await supabase
        .from('period_items')
        .upsert(periodItemRows.slice(i, i + BATCH), {
          onConflict: 'period_id,item_id',
          ignoreDuplicates: false,
        })
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
