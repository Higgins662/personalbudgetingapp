/**
 * Fuzzy matching utilities extracted from the original budget HTML,
 * extended with a tiered matching system:
 *
 *   1. Personal payee rules (learned from this user's past manual
 *      assignments) — auto-applied with full confidence.
 *   2. Global payee pattern suggestions (anonymized, crowd-sourced
 *      category pairings from all users) — surfaced as a suggestion,
 *      never auto-applied to a specific budget line item.
 *   3. Fuzzy string match against the user's own budget items — the
 *      original fallback behavior.
 */

/** Normalize a string for comparison */
function norm(s) {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
}

/** Normalize a transaction description into a rule "pattern" key */
export function normalizePattern(description) {
  return (description ?? '').toUpperCase().trim()
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
 * Given a transaction description, find the best matching expense item
 * using pure fuzzy string matching (tier 3 — the original fallback).
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
 * Find a personal rule matching this description.
 * A rule matches if its pattern is contained in the (normalized)
 * transaction description, or vice versa for short patterns.
 *
 * @param {string} description
 * @param {Array}  personalRules — [{ pattern, expense_item_id, hit_count }]
 * @returns {object|null} the matching rule, or null
 */
export function findPersonalRule(description, personalRules) {
  const nd = normalizePattern(description)
  if (!nd || !personalRules?.length) return null

  // Prefer the longest matching pattern (most specific) if multiple match
  let best = null
  for (const rule of personalRules) {
    const np = normalizePattern(rule.pattern)
    if (!np) continue
    if (nd.includes(np) || np.includes(nd)) {
      if (!best || np.length > normalizePattern(best.pattern).length) best = rule
    }
  }
  return best
}

/**
 * Find a global pattern suggestion matching this description.
 * Same containment logic as personal rules, but returns a
 * category_name (string) rather than a specific expense_item_id,
 * since global patterns aren't tied to any one user's budget items.
 *
 * @param {string} description
 * @param {Array}  globalPatterns — [{ pattern, category_name, hit_count }]
 * @returns {object|null}
 */
export function findGlobalSuggestion(description, globalPatterns) {
  const nd = normalizePattern(description)
  if (!nd || !globalPatterns?.length) return null

  let best = null
  for (const p of globalPatterns) {
    const np = normalizePattern(p.pattern)
    if (!np) continue
    if (nd.includes(np) || np.includes(nd)) {
      if (!best || np.length > normalizePattern(best.pattern).length) best = p
    }
  }
  return best
}

/**
 * Tiered auto-match for an array of transactions.
 *
 * For each unmatched debit transaction, tries in order:
 *   1. Personal rule       → matched_expense_id set, matched_source: 'rule'
 *   2. Global suggestion   → matched_expense_id stays null, but
 *                            suggested_category_name + suggested_score set,
 *                            matched_source: 'global'
 *   3. Fuzzy fallback      → matched_expense_id set if score clears
 *                            threshold, matched_source: 'fuzzy'
 *
 * @param {Array} transactions
 * @param {Array} expenseItems    — this user's monthly+annual expense items
 * @param {Array} personalRules   — this user's payee_rules rows
 * @param {Array} globalPatterns  — global_payee_patterns rows (read-only)
 * @param {number} threshold      — fuzzy match threshold (default 0.4)
 */
export function autoMatch(transactions, expenseItems, personalRules = [], globalPatterns = [], threshold = 0.4) {
  return transactions.map(tx => {
    if (tx.matched_expense_id || tx.ignored || tx.amount >= 0) return tx

    // Tier 1: personal rule
    const rule = findPersonalRule(tx.description, personalRules)
    if (rule) {
      // Confirm the referenced expense item still exists
      const item = expenseItems.find(e => e.id === rule.expense_item_id)
      if (item) {
        return {
          ...tx,
          matched_expense_id: item.id,
          matched_score: 1,
          matched_source: 'rule',
        }
      }
    }

    // Tier 2: global suggestion (not auto-applied — surfaced for confirmation)
    const suggestion = findGlobalSuggestion(tx.description, globalPatterns)
    if (suggestion) {
      return {
        ...tx,
        suggested_category_name: suggestion.category_name,
        suggested_pattern: suggestion.pattern,
        suggested_hit_count: suggestion.hit_count,
        matched_source: 'global',
      }
    }

    // Tier 3: fuzzy fallback against this user's own budget items
    const result = findBestMatch(tx.description, expenseItems, threshold)
    if (result) {
      return {
        ...tx,
        matched_expense_id: result.item.id,
        matched_score: result.score,
        matched_source: 'fuzzy',
      }
    }

    return tx
  })
}
