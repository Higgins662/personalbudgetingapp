/**
 * Transaction analysis utilities used by the onboarding wizard.
 * These run purely on the staged (in-memory) transaction arrays
 * before anything is written to the database.
 */

import { normalizePattern } from './fuzzyMatch'

/**
 * Group transactions by normalized payee description.
 * Returns an array of payee groups sorted by total amount descending.
 *
 * @param {Array} transactions — raw transaction objects with { description, amount, date }
 * @param {'debit'|'credit'|'all'} direction
 * @returns {Array} [{ key, description, count, total, avgPerOccurrence, dates, transactions }]
 */
export function groupByPayee(transactions, direction = 'all') {
  const map = {}

  for (const tx of transactions) {
    if (direction === 'debit'  && tx.amount >= 0) continue
    if (direction === 'credit' && tx.amount <= 0) continue

    const key = normalizePattern(tx.description)
    if (!key) continue

    if (!map[key]) {
      map[key] = {
        key,
        description: tx.description, // preserve original casing for display
        count: 0,
        total: 0,
        transactions: [],
      }
    }

    map[key].count += 1
    map[key].total += Math.abs(tx.amount)
    map[key].transactions.push(tx)
  }

  return Object.values(map)
    .map(g => ({
      ...g,
      total: Math.round(g.total * 100) / 100,
      avgPerOccurrence: Math.round((g.total / g.count) * 100) / 100,
    }))
    .sort((a, b) => b.total - a.total)
}

/**
 * Estimate which credit (positive) payee groups are likely recurring income.
 * Heuristic: appears more than once OR the amount is > $500 (likely a paycheck).
 * Returns each group tagged with `likelyIncome: true/false`.
 */
export function tagLikelyIncome(creditGroups) {
  return creditGroups.map(g => ({
    ...g,
    likelyIncome: g.count > 1 || g.avgPerOccurrence >= 500,
  }))
}

/**
 * Given a list of debit payee groups with assigned category names,
 * collapse them into one row per category with combined totals.
 *
 * @param {Array} assignedGroups — [{ ...group, assignedCategoryId, assignedCategoryName }]
 * @param {Array} categories     — full category list for ordering
 * @returns {Array} [{ categoryId, categoryName, total, groups }]
 */
export function collapseToCategories(assignedGroups, categories) {
  const map = {}

  for (const g of assignedGroups) {
    if (!g.assignedCategoryId) continue
    const id = g.assignedCategoryId
    if (!map[id]) {
      map[id] = {
        categoryId:   id,
        categoryName: g.assignedCategoryName,
        total:        0,
        groups:       [],
      }
    }
    map[id].total  += g.total
    map[id].groups.push(g)
  }

  // Sort by category sort_order
  return Object.values(map).sort((a, b) => {
    const ai = categories.findIndex(c => c.id === a.categoryId)
    const bi = categories.findIndex(c => c.id === b.categoryId)
    return ai - bi
  })
}

/**
 * Calculate the number of months spanned by a set of transactions.
 * Used to convert import-period totals into monthly equivalents.
 * Returns at least 1 to avoid division by zero.
 */
export function estimateMonths(transactions) {
  const dated = transactions.filter(t => t.date).map(t => new Date(t.date))
  if (dated.length < 2) return 1
  dated.sort((a, b) => a - b)
  const diffMs = dated.at(-1) - dated[0]
  const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30.44)
  return Math.max(1, Math.round(diffMonths * 10) / 10) // one decimal place
}

/**
 * Given category totals and a savings target percentage (0–50),
 * calculate the suggested budget per category.
 * Housing and Savings categories are excluded from the reduction.
 *
 * @param {Array}  categoryTotals  — [{ categoryId, categoryName, total }]
 * @param {number} months          — period the totals cover
 * @param {number} savingsPct      — 0–50, reduction percentage
 * @param {Object} overrides       — { [categoryId]: manualBudget }
 * @param {Array}  categories      — full category list (to identify Housing/Savings)
 * @returns {Object} { [categoryId]: suggestedBudget }
 */
export function calculateBudgets(categoryTotals, months, savingsPct, overrides = {}, categories = []) {
  const EXCLUDED_FROM_REDUCTION = ['Housing', 'Savings']
  const result = {}

  for (const cat of categoryTotals) {
    if (overrides[cat.categoryId] !== undefined) {
      result[cat.categoryId] = overrides[cat.categoryId]
      continue
    }

    const monthlyAvg  = cat.total / months
    const isExcluded  = EXCLUDED_FROM_REDUCTION.some(n =>
      cat.categoryName?.toLowerCase().includes(n.toLowerCase()))
    const reduction   = isExcluded ? 0 : savingsPct / 100
    const suggested   = monthlyAvg * (1 - reduction)

    result[cat.categoryId] = Math.floor(suggested) // round down to nearest dollar
  }

  return result
}

/**
 * Generate a random color from a pleasant palette for user-created categories.
 */
const RANDOM_COLORS = [
  '#e05c5c','#e07a3a','#c8a020','#7ab840','#3aaa6a',
  '#3aaab8','#3a6ab8','#6a3ab8','#a83ab8','#c83a8a',
]
let _colorIdx = 0
export function randomCategoryColor() {
  const color = RANDOM_COLORS[_colorIdx % RANDOM_COLORS.length]
  _colorIdx++
  return color
}
