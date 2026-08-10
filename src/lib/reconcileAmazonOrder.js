/**
 * Reconciles a parsed Amazon order (see amazonEmailParser.js) against the
 * user's already-imported bank transactions, and turns its line items into
 * category splits.
 *
 * Ordering matters: transactions come from the bank statement upload and
 * are the source of truth for amount/date. Amazon orders are enrichment —
 * we're finding which existing transaction an order belongs to, never
 * creating a transaction from the email.
 */

import { findPersonalRule, findGlobalSuggestion, findBestMatch } from './fuzzyMatch'

/** Amazon's statement descriptors vary by region/card network but reliably
 *  contain one of these tokens. */
const AMAZON_DESC_PATTERN = /AMAZON|AMZN/i

/**
 * @param {{orderId, orderDate, orderTotal, items}} parsedOrder
 * @param {Array} transactions — this user's transactions (already loaded)
 * @param {number} dateWindowDays — Amazon charges settle 0-3 days after
 *   the order email typically; widen slightly for weekends/holds.
 * @returns {{ transaction: object, confidence: number, reason: string } | null}
 */
export function matchOrderToTransaction(parsedOrder, transactions, dateWindowDays = 5) {
  if (parsedOrder.orderTotal == null) return null

  const orderDate = parsedOrder.orderDate ? new Date(parsedOrder.orderDate) : null

  const candidates = transactions.filter(tx => {
    if (tx.amount >= 0) return false // splits only apply to debits
    if (!AMAZON_DESC_PATTERN.test(tx.description || '')) return false
    if (Math.abs(Math.abs(tx.amount) - parsedOrder.orderTotal) > 0.01) return false

    if (orderDate && tx.date) {
      const diffDays = Math.abs((new Date(tx.date) - orderDate) / 86400000)
      if (diffDays > dateWindowDays) return false
    }
    return true
  })

  if (candidates.length === 0) return null

  if (candidates.length === 1) {
    return { transaction: candidates[0], confidence: 0.95, reason: 'unique amount+date match' }
  }

  // Multiple transactions share this exact amount (e.g. two orders that
  // happen to cost the same) — pick the closest by date but flag lower
  // confidence since this is a guess, not a certainty.
  if (orderDate) {
    const sorted = [...candidates].sort((a, b) =>
      Math.abs(new Date(a.date) - orderDate) - Math.abs(new Date(b.date) - orderDate))
    return { transaction: sorted[0], confidence: 0.5, reason: 'ambiguous amount match, nearest date chosen' }
  }

  return { transaction: candidates[0], confidence: 0.3, reason: 'ambiguous amount match, no order date to disambiguate' }
}

/**
 * Suggest a category for a single Amazon line item using the same
 * personal-rule / global-pattern / fuzzy tiers as normal transaction
 * matching, but scored against the *item name* instead of a bank
 * description string.
 *
 * @param {string} itemName
 * @param {Array} expenseItems
 * @param {Array} personalRules
 * @param {Array} globalPatterns
 */
export function suggestCategoryForItem(itemName, expenseItems, personalRules, globalPatterns) {
  const rule = findPersonalRule(itemName, personalRules)
  if (rule) {
    const item = expenseItems.find(e => e.id === rule.expense_item_id)
    if (item) return { categoryId: item.category_id, expenseItemId: item.id, source: 'rule' }
  }

  const fuzzy = findBestMatch(itemName, expenseItems, 0.35) // slightly looser than tx matching — product names are noisier
  if (fuzzy) {
    return { categoryId: fuzzy.item.category_id, expenseItemId: fuzzy.item.id, source: 'fuzzy' }
  }

  const global = findGlobalSuggestion(itemName, globalPatterns)
  if (global) {
    return { categoryId: null, categoryName: global.category_name, source: 'global' }
  }

  return null
}

/**
 * Build transaction_splits rows for a reconciled order, given a category
 * assignment per line item (from suggestCategoryForItem or manual user
 * choice). Items that share a category are combined into one split row
 * per category rather than one row per item, matching how the amount is
 * actually meaningful (per-category budget totals, not per-product).
 *
 * Any leftover cents from rounding are folded into the largest split so
 * the sum always equals the transaction amount exactly — this matters
 * because downstream aggregation trusts splits to reconcile to the parent.
 *
 * @param {object} transaction — the parent transactions row
 * @param {Array} items — [{ ...AmazonLineItem, categoryId, expenseItemId }]
 * @returns {Array} rows ready to insert into transaction_splits
 */
export function buildSplits(transaction, items) {
  const byCategory = new Map()

  for (const item of items) {
    const key = item.categoryId ?? 'uncategorized'
    if (!byCategory.has(key)) {
      byCategory.set(key, { categoryId: item.categoryId ?? null, expenseItemId: item.expenseItemId ?? null, amount: 0 })
    }
    byCategory.get(key).amount += item.lineTotal
  }

  const splits = [...byCategory.values()].map(s => ({
    ...s,
    amount: Math.round(s.amount * 100) / 100,
  }))

  const txAmount = Math.abs(transaction.amount)
  const splitSum = Math.round(splits.reduce((s, x) => s + x.amount, 0) * 100) / 100
  const diff = Math.round((txAmount - splitSum) * 100) / 100

  if (diff !== 0 && splits.length > 0) {
    // Reconcile rounding drift (and any shipping/tax not itemized as a
    // product line) into the largest split rather than leaving a gap.
    const largest = splits.reduce((a, b) => (b.amount > a.amount ? b : a))
    largest.amount = Math.round((largest.amount + diff) * 100) / 100
  }

  return splits.map(s => ({
    transaction_id: transaction.id,
    category_id: s.categoryId,
    expense_item_id: s.expenseItemId,
    amount: s.amount,
    source: 'amazon_email',
  }))
}
