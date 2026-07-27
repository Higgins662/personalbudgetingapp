import { supabase } from './supabase'

/**
 * Promote a transaction to its own annual expense_item.
 *
 * Creates a NEW dedicated annual item (label = transaction description,
 * inherits the category from the item the transaction is currently matched
 * to), reassigns the transaction to it, moves the applied amount out of the
 * monthly period into the yearly period, and returns the new item id.
 *
 * @param {object} tx                    — the transaction row (needs id, user_id, amount, date, description, applied, matched_expense_id)
 * @param {string} existingExpenseItemId — the item the tx is currently matched to (source of the category)
 * @returns {string|null} the new annual expense_item id, or null on failure
 */
export async function promoteToAnnual(tx, existingExpenseItemId) {
  // 1. Inherit category from the existing item
  const { data: existingItem } = await supabase
    .from('expense_items')
    .select('category_id, user_id, sort_order')
    .eq('id', existingExpenseItemId)
    .single()
  if (!existingItem) return null

  // 2. Create the dedicated annual item for this payee
  const { data: newItem, error: newErr } = await supabase
    .from('expense_items')
    .insert({
      user_id:     existingItem.user_id ?? tx.user_id,
      label:       tx.description,
      category_id: existingItem.category_id,
      note:        '',
      frequency:   'annual',
      enabled:     true,
      sort_order:  (existingItem.sort_order ?? 0) + 1,
    })
    .select()
    .single()
  if (newErr || !newItem) return null

  // 3. Reassign the transaction
  await supabase
    .from('transactions')
    .update({ matched_expense_id: newItem.id })
    .eq('id', tx.id)

  // 4. Find/create the yearly period
  const now        = new Date()
  const yearStart  = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

  const { data: allPeriods } = await supabase
    .from('budget_periods')
    .select('id, period_type, period_start')
    .in('period_type', ['monthly', 'yearly'])

  const monthPeriod = allPeriods?.find(p => p.period_type === 'monthly' && p.period_start === monthStart)
  let   yearPeriod  = allPeriods?.find(p => p.period_type === 'yearly'  && p.period_start === yearStart)

  if (!yearPeriod) {
    const { data: np } = await supabase
      .from('budget_periods')
      .insert({ user_id: tx.user_id, period_type: 'yearly', period_start: yearStart })
      .select().single()
    yearPeriod = np
  }
  if (!yearPeriod) return newItem.id

  // 5. Move the applied amount out of the monthly item
  let actualAmount   = Math.abs(tx.amount)
  let budgetedAmount = Math.abs(tx.amount)

  if (monthPeriod && tx.applied) {
    const { data: oldMonthItem } = await supabase
      .from('period_items')
      .select('actual, budgeted')
      .eq('period_id', monthPeriod.id)
      .eq('item_id', existingExpenseItemId)
      .maybeSingle()
    if (oldMonthItem) {
      budgetedAmount = oldMonthItem.budgeted || Math.abs(tx.amount)
      await supabase
        .from('period_items')
        .update({ actual: Math.max(0, (oldMonthItem.actual ?? 0) - Math.abs(tx.amount)) })
        .eq('period_id', monthPeriod.id)
        .eq('item_id', existingExpenseItemId)
    }
  }

  // 6. Upsert the yearly period_item with the real amounts
  await supabase
    .from('period_items')
    .upsert({
      period_id: yearPeriod.id,
      user_id:   tx.user_id,
      item_id:   newItem.id,
      item_type: 'expense',
      budgeted:  budgetedAmount,
      actual:    tx.applied ? actualAmount : 0,
    }, { onConflict: 'period_id,item_id' })

  // If the tx wasn't applied yet, apply it now against the yearly item
  if (!tx.applied) {
    await supabase
      .from('period_items')
      .update({ actual: actualAmount })
      .eq('period_id', yearPeriod.id)
      .eq('item_id', newItem.id)
    await supabase
      .from('transactions')
      .update({ applied: true })
      .eq('id', tx.id)
  }

  return newItem.id
}

/**
 * Demote an annual expense_item back to monthly via the atomic RPC.
 * All its transactions merge back into the category's monthly numbers,
 * the item disappears from the Yearly tab, payee rules are repointed.
 *
 * @returns {{ error }} supabase-style result
 */
export async function demoteAnnualItem(userId, annualItemId) {
  const { error } = await supabase.rpc('demote_annual_item', {
    p_user_id: userId,
    p_item_id: annualItemId,
  })
  return { error }
}
