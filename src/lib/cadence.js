import { normalizePattern } from './fuzzyMatch'

/**
 * Cadence detection — how often a stream of transactions repeats.
 *
 * Shared by recurring EXPENSE patterns (useRecurringPatterns) and recurring
 * INCOME deposits (useIncomeDueDates). Both answer the same question: does
 * this set of dates follow a regular cycle, and if so which one?
 *
 * The key idea is that cadence lives in the GAPS between transactions, not
 * in their day-of-month. A biweekly paycheck lands on days 30, 16, 2, 18, 4
 * — apparently random — yet is perfectly regular at 14-day intervals. A
 * restaurant visited three times in a quarter can land on similar days by
 * pure chance. Measuring gaps gets both cases right; day-of-month gets both
 * wrong.
 */

/** Per-transaction reference numbers that normalizePattern doesn't strip —
 *  payroll week/batch ids ("PAYROLL 260709 WEEK11520675"), invoice numbers,
 *  auth codes. Left in place they fragment one recurring stream into a
 *  separate single-occurrence group per transaction, so nothing ever looks
 *  recurring. Any run of 4+ digits (optionally glued to a word like
 *  WEEK11520675) is treated as such a reference. */
const REFERENCE_NUMBER = /\b[A-Z]*\d{4,}[A-Z0-9]*\b/g

/**
 * Grouping key for "the same recurring stream": normalizePattern plus
 * reference-number stripping.
 */
export function patternKey(description) {
  return normalizePattern((description ?? '').replace(REFERENCE_NUMBER, ' '))
}

/** Number of leading words two keys share. */
function commonPrefixWords(a, b) {
  const wa = a.split(' '), wb = b.split(' ')
  let n = 0
  while (n < wa.length && n < wb.length && wa[n] === wb[n]) n++
  return n
}

/**
 * Merge keys that are the same stream described inconsistently.
 *
 * Banks append things to a description unpredictably — the same payroll
 * deposit arrives as "CHARTER COMMUNIC PAYROLL" one fortnight and
 * "CHARTER COMMUNIC PAYROLL Higginbotham Eric" the next. Since the variable
 * part is always trailing, a key that is a strict word-prefix of another is
 * the same stream, and both collapse onto the shorter one.
 *
 * Requires a decent prefix (3+ words) so unrelated keys that merely share a
 * first word — "PAYPAL HULU" and "PAYPAL SPOTIFY" — are never merged.
 */
export function canonicalizeKeys(keys, { minPrefixWords = 3 } = {}) {
  const sorted = [...new Set(keys)].sort((a, b) => a.split(' ').length - b.split(' ').length)
  const canonical = {}
  for (const key of sorted) {
    let target = key
    for (const shorter of sorted) {
      if (shorter === key) break // only merge onto a strictly shorter key
      const shared = commonPrefixWords(shorter, key)
      if (shared === shorter.split(' ').length && shared >= minPrefixWords) {
        target = canonical[shorter] ?? shorter
        break
      }
    }
    canonical[key] = target
  }
  return canonical
}

/** Recognized cadences, by typical gap between occurrences (days). */
export const CYCLES = [
  { name: 'weekly',      days: 7,    tol: 2 },
  { name: 'biweekly',    days: 14,   tol: 3 },
  { name: 'semimonthly', days: 15.2, tol: 3 },
  { name: 'monthly',     days: 30.4, tol: 6 },
  { name: 'quarterly',   days: 91,   tol: 12 },
]

/** Step size for cadences that are projected forward rather than pinned to a
 *  day-of-month. 'interval' uses its own measured median gap instead. */
export const CYCLE_DAYS = { weekly: 7, biweekly: 14, semimonthly: 15 }

/** Cadences anchored to a day-of-month; everything else is projected from
 *  the last occurrence by stepping forward a cycle at a time. */
export function usesDayOfMonth(cycle) {
  return cycle === 'monthly' || cycle === 'quarterly'
}

const MAX_MONTHLY_DAY_SPREAD = 4

/** Shortest distance between two days-of-month on a 31-day wheel, so day 28
 *  and day 2 read as 4 apart rather than 26. */
function wrappedDayDistance(a, b) {
  const diff = Math.abs(a - b)
  return Math.min(diff, 31 - diff)
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Identify the cadence of a set of transactions from the gaps between them.
 *
 * @param {Array<{date: string}>} txs
 * @param {{ lenient?: boolean }} opts — `lenient` believes a single
 *        sub-monthly gap, for streams already known to be recurring (a
 *        bills category, or a matched income source).
 * @returns {{ cycle: string, medianGap: number } | null}
 */
export function detectCycle(txs, { lenient = false } = {}) {
  // Same-day duplicate charges are one event, not a 0-day cycle.
  const dates = [...new Set(txs.map(t => t.date))].sort()
  if (dates.length < 2) return null

  const gaps = []
  for (let i = 1; i < dates.length; i++) {
    const d1 = new Date(dates[i - 1] + 'T12:00:00')
    const d2 = new Date(dates[i] + 'T12:00:00')
    gaps.push(Math.round((d2 - d1) / 86400000))
  }
  // Drop sub-3-day gaps: a bill re-tried or split across two days is still
  // one billing event, and those tiny gaps would wreck the median.
  const realGaps = gaps.filter(g => g >= 3)
  if (!realGaps.length) return null

  const med = median(realGaps)
  // Closest cadence, not merely the first in range: the biweekly (14±3) and
  // semimonthly (15.2±3) bands overlap, and semimonthly pay on the 15th and
  // month end has a median gap of 15 — which both bands admit, but only
  // semimonthly describes correctly.
  const cycle = CYCLES
    .filter(c => Math.abs(med - c.days) <= c.tol)
    .sort((a, b) => Math.abs(med - a.days) - Math.abs(med - b.days))[0]
  if (!cycle) return null

  // A single gap is one coincidence, not a cadence — two gas-station stops
  // two weeks apart aren't a biweekly subscription. Sub-monthly cycles
  // therefore need at least two gaps (3+ occurrences) before we believe
  // them, unless the caller already knows this stream is recurring.
  if (realGaps.length < 2 && cycle.days < 20 && !lenient) return null

  // Every gap must be one cycle, or a clean multiple of it (a skipped or
  // missing month), otherwise this is irregular activity that happens to
  // have a plausible median.
  const consistent = realGaps.every(g => {
    const multiple = Math.round(g / cycle.days)
    return multiple >= 1 && multiple <= 3
      && Math.abs(g - multiple * cycle.days) <= cycle.tol + 2
  })
  if (!consistent) return null

  // A genuinely monthly cycle tracks the CALENDAR month, so it recurs on
  // roughly the same day-of-month (gaps naturally vary 28-31). A constant
  // 28-day cycle is four weeks, not a month — it walks backward ~2 days
  // every month, so day-of-month is meaningless for it. Without this, a
  // 4-weekly paycheck reads as "monthly" and gets pinned to a due day.
  if (cycle.name === 'monthly') {
    const days = dates.map(d => parseInt(d.slice(8, 10), 10))
    const spread = Math.min(
      ...days.map(center => Math.max(...days.map(d => wrappedDayDistance(d, center))))
    )
    if (spread > MAX_MONTHLY_DAY_SPREAD) {
      // Regular cadence, but not anchored to a day-of-month: treat it as a
      // fixed-interval cycle and project it forward from the last one.
      // Needs more than one gap — a lone ~30-day gap landing on unrelated
      // days-of-month is two coincidental events, not a cycle.
      if (realGaps.length < 2) return null
      return { cycle: 'interval', medianGap: med }
    }
  }

  return { cycle: cycle.name, medianGap: med }
}

/** Most common day-of-month across a set of transactions (ties -> most
 *  recent). Only meaningful for cadences that pass `usesDayOfMonth`. */
export function suggestDueDay(txs) {
  const counts = {}
  for (const t of txs) {
    const day = parseInt(t.date.slice(8, 10), 10)
    if (!counts[day]) counts[day] = { count: 0, mostRecent: t.date }
    counts[day].count++
    if (t.date > counts[day].mostRecent) counts[day].mostRecent = t.date
  }
  let best = null
  for (const [day, info] of Object.entries(counts)) {
    if (!best
      || info.count > best.count
      || (info.count === best.count && info.mostRecent > best.mostRecent)
    ) {
      best = { day: parseInt(day, 10), count: info.count, mostRecent: info.mostRecent }
    }
  }
  return best?.day ?? null
}

/** The distinct days-of-month a semimonthly stream lands on (the two most
 *  common), used to project it onto its real calendar anchors. */
export function anchorDaysOf(txs) {
  const counts = {}
  for (const t of txs) {
    const day = parseInt(t.date.slice(8, 10), 10)
    counts[day] = (counts[day] || 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([day]) => parseInt(day, 10))
    .sort((a, b) => a - b)
}

/** A due_day of 31 in a 30-day (or shorter) month lands on that month's real last day. */
export function clampDueDay(year, monthIndex, day) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  return Math.min(day, lastDay)
}

/**
 * Every date a recurring stream is expected to land on within a given month.
 *
 * Day-of-month cadences (monthly, quarterly) use their stored due day.
 * Everything else is stepped forward from the last observed occurrence by
 * the cycle length, which keeps a biweekly paycheck on its real weekday and
 * yields the 2-3 occurrences it actually has in a month.
 */
export function projectDatesInMonth(stream, year, monthIndex) {
  // Semimonthly pay lands on two fixed calendar anchors (typically the 15th
  // and month end), not every 15 days — a fixed stride would drift further
  // off those anchors the further the projection runs from lastDate. Use the
  // two days-of-month actually observed.
  if (stream.cycle === 'semimonthly' && stream.anchorDays?.length) {
    return [...new Set(stream.anchorDays)]
      .map(d => clampDueDay(year, monthIndex, d))
      .sort((a, b) => a - b)
      .map(d => new Date(year, monthIndex, d))
  }

  const stride = stream.cycle === 'interval'
    ? Math.round(stream.medianGap)
    : CYCLE_DAYS[stream.cycle]

  if (!stride) {
    if (!stream.dueDay) return []
    if (stream.cycle === 'quarterly') {
      // Only show a quarterly charge in months it actually falls in.
      const last = new Date(stream.lastDate + 'T12:00:00')
      const monthsSince =
        (year - last.getFullYear()) * 12 + (monthIndex - last.getMonth())
      if (monthsSince % 3 !== 0) return []
    }
    return [new Date(year, monthIndex, clampDueDay(year, monthIndex, stream.dueDay))]
  }

  if (!stream.lastDate) return []

  const monthStart = new Date(year, monthIndex, 1)
  const monthEnd = new Date(year, monthIndex + 1, 0)
  const cursor = new Date(stream.lastDate + 'T12:00:00')
  cursor.setHours(0, 0, 0, 0)

  // Walk back to just before the month, then forward through it.
  while (cursor > monthStart) cursor.setDate(cursor.getDate() - stride)
  while (cursor < monthStart) cursor.setDate(cursor.getDate() + stride)

  const dates = []
  while (cursor <= monthEnd) {
    dates.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + stride)
  }
  return dates
}
