import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { normalizePattern } from '../lib/fuzzyMatch'
import { detectCycle, suggestDueDay, usesDayOfMonth, patternKey, anchorDaysOf } from '../lib/cadence'

// Same date-fragment shapes normalizePattern strips, used here to find WHERE
// a description's date starts so the display label can just be everything
// before it (e.g. "SP BEAM 05-22 SHOPBEAM.COM ..." -> "SP BEAM"), instead of
// normalizePattern's own output which keeps the merchant-key tail intact.
const DATE_FRAGMENT = /\b(\d{2}[-/]\d{2}[-/]\d{4}|\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2})\b/
const NOISE_WORDS = /\b(DEBIT CARD|RECURRING PYMT|RECURRING PAYMENT|RECURRING|PURCHASE|POS PURCHASE|POS DEBIT|PYMT|ONLINE PMT|ONLINE)\b/
const PHONE_TOKEN = /^\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}$|^\d{10,}$/
const US_STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
])
const MAX_LABEL_WORDS = 4

/** Short display label: the merchant name portion before any embedded date
 *  (or, when there's no embedded date, before trailing phone/state noise). */
function extractLabel(description) {
  const raw = (description ?? '').trim()
  const dateMatch = raw.match(DATE_FRAGMENT)
  const head = dateMatch ? raw.slice(0, dateMatch.index) : raw.replace(NOISE_WORDS, '')

  let words = head.trim().split(/\s+/).filter(Boolean)
  if (!dateMatch) {
    // Trim trailing phone-number / bare-digit-run / state-code tokens, e.g.
    // "GEICO *AUTO 800-841-3000 CT" -> "GEICO *AUTO".
    while (words.length > 1) {
      const last = words[words.length - 1].toUpperCase()
      if (PHONE_TOKEN.test(last) || US_STATE_CODES.has(last)) words.pop()
      else break
    }
  }

  const label = words.slice(0, MAX_LABEL_WORDS).join(' ')
  return label || raw
}

const MAX_AMOUNT_VARIATION = 0.35 // amounts must stay within ±35% of their average
// Categories that exist to hold bills get more latitude: a power bill can
// easily double between a mild month and a heatwave and still be a bill.
const MAX_AMOUNT_VARIATION_RECURRING = 0.7

/**
 * A recurring charge has a detectable cadence AND a roughly-consistent
 * amount. Amount tolerance is loose (±35%) because usage-based bills —
 * power, water, phone overage — genuinely swing month to month; the cadence
 * check is what does the real work of separating bills from errands.
 *
 * The category the charge is budgeted under refines this in both
 * directions. 'everyday' categories (Groceries, Dining, Fuel...) are vetoed
 * outright: a grocery run every ~30 days at a similar amount is a habit, not
 * a bill, and no amount of cadence evidence should put it on a due-date
 * calendar. 'recurring' categories (Utilities, Insurance, Streaming...)
 * exist to hold bills, so they get more latitude on amount swing.
 * Uncategorized patterns are 'neutral' and judged on cadence alone.
 */
function isTrueRecurrence(txs, categoryKind = 'neutral') {
  // Everyday spending is never a bill, however regular it looks.
  if (categoryKind === 'everyday') return false

  const amounts = txs.map(t => Math.abs(t.amount))
  const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length
  if (avgAmount === 0) return false
  const maxAmountDelta = Math.max(...amounts.map(a => Math.abs(a - avgAmount)))
  const amountTolerance = categoryKind === 'recurring'
    ? MAX_AMOUNT_VARIATION_RECURRING
    : MAX_AMOUNT_VARIATION
  if (maxAmountDelta / avgAmount > amountTolerance) return false

  // A bills category is enough to believe a single clean sub-monthly gap.
  return detectCycle(txs, { lenient: categoryKind === 'recurring' }) != null
}

/**
 * Detects recurring monthly expense transactions and exposes their calendar
 * due dates. A monthly expense_item (e.g. "Utilities") is often a category-
 * level aggregate of several unrelated real bills (electric, water, internet)
 * each with its own due date — so due dates for monthly recurring expenses
 * live on the transaction PATTERN, not on the category item itself.
 *
 * A "pattern" here means: matched, non-ignored, debit transactions whose
 * normalized description recurs across 2+ distinct months in the last
 * `months` months, AND (isTrueRecurrence) lands on a consistent amount and
 * a consistent day-of-month across at least 3 occurrences — the second
 * check is what separates an actual bill from an ordinary repeat merchant
 * (Target, Starbucks, Walmart get visited most months too, just at
 * unpredictable amounts and days). Each detected pattern is cross-referenced
 * against recurring_due_days for a stored due_day — if none exists yet, the
 * most common day-of-month from its own history is written there, so the
 * calendar starts populated instead of empty; the user can still change it
 * any time via setDueDay. Due days are deliberately NOT stored on
 * payee_rules, which drives import auto-matching (see setDueDay).
 *
 * @returns {{
 *   patterns: Array<{ key, label, avgAmount, occurrences, expenseItemId, cycle, dueDay, dueDayIsSuggested }>,
 *   loading: boolean,
 *   setDueDay: (pattern, day) => Promise<{ error: any }>,
 * }}
 */
export function useRecurringPatterns(months = 12) {
  const { user } = useAuth()
  const [patterns, setPatterns] = useState([])
  const [loading, setLoading] = useState(true)

  // Guards setPatterns after unmount, and stops a stale in-flight load from
  // overwriting a newer one.
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false }
  }, [])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)

    const since = new Date()
    since.setMonth(since.getMonth() - months)
    const sinceStr = since.toISOString().slice(0, 10)

    const [txRes, dueDaysRes, itemsRes, catsRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('id, description, amount, date, matched_expense_id, ignored')
        .eq('user_id', user.id)
        .gte('date', sinceStr)
        .order('date', { ascending: false }),
      supabase
        .from('recurring_due_days')
        .select('id, pattern, due_day')
        .eq('user_id', user.id),
      supabase
        .from('expense_items')
        .select('id, category_id')
        .eq('user_id', user.id),
      supabase
        .from('categories')
        .select('id, recurring_kind')
        .eq('user_id', user.id),
    ])

    const dueDayByPattern = {}
    for (const r of dueDaysRes.data ?? []) {
      dueDayByPattern[patternKey(r.pattern)] = r
    }

    // expense_item -> the recurring_kind of the category it's budgeted under.
    // Falls back to 'neutral' everywhere if the recurring_kind column hasn't
    // been migrated yet, which just means cadence alone decides (the old
    // behaviour) rather than the page erroring out.
    const kindByCategoryId = {}
    for (const c of catsRes.data ?? []) {
      kindByCategoryId[c.id] = c.recurring_kind ?? 'neutral'
    }
    const kindByExpenseItemId = {}
    for (const i of itemsRes.data ?? []) {
      kindByExpenseItemId[i.id] = kindByCategoryId[i.category_id] ?? 'neutral'
    }

    const groups = {}
    for (const tx of txRes.data ?? []) {
      if (tx.ignored || tx.amount >= 0) continue // only recurring debits
      const key = patternKey(tx.description)
      if (!key) continue
      if (!groups[key]) groups[key] = { txs: [] }
      groups[key].txs.push(tx)
    }

    const detected = []
    for (const [key, { txs }] of Object.entries(groups)) {
      // Most frequent matched_expense_id among this pattern's transactions —
      // drives the category colour, and the category's recurring_kind, which
      // vetoes everyday spending and relaxes the bar for bill categories.
      const expenseCounts = {}
      for (const t of txs) {
        if (!t.matched_expense_id) continue
        expenseCounts[t.matched_expense_id] = (expenseCounts[t.matched_expense_id] || 0) + 1
      }
      let expenseItemId = null, bestCount = 0
      for (const [id, count] of Object.entries(expenseCounts)) {
        if (count > bestCount) { expenseItemId = id; bestCount = count }
      }
      const categoryKind = kindByExpenseItemId[expenseItemId] ?? 'neutral'

      // Cadence (not day-of-month clustering) is what makes something a bill.
      const cycleInfo = detectCycle(txs, { lenient: categoryKind === 'recurring' })
      if (!cycleInfo) continue
      if (!isTrueRecurrence(txs, categoryKind)) continue

      txs.sort((a, b) => (a.date < b.date ? 1 : -1))
      const label = extractLabel(txs[0].description)

      const avgAmount = txs.reduce((sum, t) => sum + Math.abs(t.amount), 0) / txs.length

      const stored = dueDayByPattern[key]
      // Only a monthly cadence has a meaningful day-of-month. Biweekly and
      // weekly patterns walk through the month, so they're projected from
      // their last occurrence + cycle length instead (see CalendarPage).
      const isMonthlyish = usesDayOfMonth(cycleInfo.cycle)
      const dueDay = isMonthlyish ? (stored?.due_day ?? suggestDueDay(txs)) : null

      detected.push({
        key,
        label,
        fullLabel: txs[0].description, // untruncated, for the calendar hover flyout
        avgAmount,
        occurrences: txs.length,
        expenseItemId,
        categoryKind,
        cycle: cycleInfo.cycle,
        medianGap: cycleInfo.medianGap,
        lastDate: txs[0].date, // txs sorted newest-first above
        anchorDays: cycleInfo.cycle === 'semimonthly' ? anchorDaysOf(txs) : null,
        dueDay,
        rowId: stored?.id ?? null,
        dueDayIsSuggested: isMonthlyish && !stored?.due_day,
      })
    }

    detected.sort((a, b) => a.label.localeCompare(b.label))
    if (!aliveRef.current) return
    setPatterns(detected)
    setLoading(false)

    // Persist auto-suggested due days so the calendar starts populated
    // instead of empty. Awaited as one upsert: PostgrestBuilder is lazy, so
    // a query that is never awaited (or .then()'d) issues no request at all.
    const toPersist = detected
      .filter(p => p.dueDayIsSuggested && p.dueDay != null)
      .map(p => ({ user_id: user.id, pattern: p.key, due_day: p.dueDay }))

    if (toPersist.length) {
      const { data, error } = await supabase
        .from('recurring_due_days')
        .upsert(toPersist, { onConflict: 'user_id,pattern' })
        .select()
      if (!aliveRef.current) return
      if (!error && data) {
        const idByPattern = Object.fromEntries(data.map(r => [r.pattern, r.id]))
        setPatterns(prev => prev.map(p =>
          idByPattern[p.key] ? { ...p, rowId: idByPattern[p.key] } : p))
      }
    }
  }, [user, months])

  useEffect(() => { load() }, [load])

  /**
   * Set (or clear) the due day for a detected pattern.
   *
   * Writes to recurring_due_days, NOT payee_rules: payee_rules drives
   * auto-matching for future imports, and this hook's grouping key is
   * deliberately aggressive (reference numbers stripped), so storing it as a
   * matching rule would let a short pattern hijack unrelated transactions
   * through findPersonalRule's containment test.
   */
  const setDueDay = useCallback(async (pattern, day) => {
    if (!user) return { error: null }

    const { error } = await supabase
      .from('recurring_due_days')
      .upsert({ user_id: user.id, pattern: pattern.key, due_day: day },
              { onConflict: 'user_id,pattern' })

    if (!error) {
      setPatterns(prev => prev.map(p =>
        p.key === pattern.key ? { ...p, dueDay: day, dueDayIsSuggested: false } : p))
    }
    return { error }
  }, [user])

  const patternsWithDueDay = useMemo(() => patterns.filter(p => p.dueDay != null), [patterns])

  return { patterns, patternsWithDueDay, loading, setDueDay, reload: load }
}
