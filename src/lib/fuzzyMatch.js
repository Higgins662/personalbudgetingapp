/**
 * Fuzzy matching utilities extracted from the original budget HTML.
 * Used in the Reconcile tab to match transaction descriptions → expense items.
 */

/** Normalize a string for comparison */
function norm(s) {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
}

/** Simple token overlap score (0–1) */
function tokenScore(a, b) {
  const ta = new Set(norm(a).split(/\s+/).filter(Boolean))
  const tb = new Set(norm(b).split(/\s+/).filter(Boolean))
  if (!ta.size || !tb.size) return 0
  let overlap = 0
  for (const t of ta) if (tb.has(t)) overlap++
  return overlap / Math.max(ta.size, tb.size)
}

/** Longest common substring length */
function lcs(a, b) {
  const na = norm(a), nb = norm(b)
  let best = 0
  for (let i = 0; i < na.length; i++) {
    for (let j = 0; j < nb.length; j++) {
      let l = 0
      while (i + l < na.length && j + l < nb.length && na[i + l] === nb[j + l]) l++
      if (l > best) best = l
    }
  }
  return best
}

/** Contains-check score */
function containsScore(desc, label) {
  const nd = norm(desc), nl = norm(label)
  if (!nl) return 0
  if (nd.includes(nl)) return 1
  if (nl.includes(nd) && nd.length > 3) return 0.8
  return 0
}

/**
 * Score a transaction description against a budget item label.
 * Returns 0–1. Values ≥ 0.4 are considered a match.
 */
export function matchScore(description, label) {
  const cs = containsScore(description, label)
  const ts = tokenScore(description, label)
  const ls = lcs(description, label) / Math.max(norm(label).length, 1)
  return Math.min(1, cs * 0.5 + ts * 0.3 + ls * 0.2)
}

/**
 * Given a transaction description, find the best matching expense item.
 * @param {string} description
 * @param {Array}  expenseItems  — [{id, label, ...}]
 * @param {number} threshold     — minimum score to count (default 0.4)
 * @returns {{ item, score } | null}
 */
export function findBestMatch(description, expenseItems, threshold = 0.4) {
  let best = null
  let bestScore = threshold

  for (const item of expenseItems) {
    const score = matchScore(description, item.label)
    if (score > bestScore) { best = item; bestScore = score }
  }

  return best ? { item: best, score: bestScore } : null
}

/**
 * Auto-match an array of transactions against expense items.
 * Returns transactions with { matched_expense_id, matched_score } filled in
 * where a match was found.
 */
export function autoMatch(transactions, expenseItems, threshold = 0.4) {
  return transactions.map(tx => {
    if (tx.matched_expense_id || tx.ignored || tx.amount >= 0) return tx
    const result = findBestMatch(tx.description, expenseItems, threshold)
    if (!result) return tx
    return { ...tx, matched_expense_id: result.item.id, matched_score: result.score }
  })
}
