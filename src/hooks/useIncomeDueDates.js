import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { detectCycle, suggestDueDay, usesDayOfMonth, patternKey, canonicalizeKeys, anchorDaysOf } from '../lib/cadence'

/**
 * Works out when each recurring income source actually lands, and how much
 * it deposits, from transactions already matched to an income_items row
 * (matched_income_id, set by matchIncomeTransactions in fuzzyMatch.js).
 *
 * Income runs through the same cadence engine as recurring expenses, and
 * for the same reason: most paychecks are biweekly, not monthly. A biweekly
 * deposit lands on days 30, 16, 2, 18, 4 — so "the most common day of the
 * month" is a meaningless number for it, and pinning it to one both puts it
 * on the wrong date and hides the fact that it arrives 2-3 times a month.
 *
 * A due_day is therefore only stored for genuinely monthly sources; the
 * rest carry their cycle and last deposit date so the calendar can project
 * them forward (see projectDatesInMonth), which keeps a Thursday paycheck
 * on Thursdays.
 *
 * Per-deposit amounts come from the transactions themselves, NOT from
 * period_items — a month's `actual` for a biweekly source is the sum of
 * every deposit that month, so using it would show one entry at 2-3x the
 * real paycheck.
 *
 * @returns {{
 *   incomeStreams: { [itemId]: { cycle, medianGap, dueDay, lastDate, avgAmount, occurrences } },
 *   loading: boolean,
 * }}
 */
export function useIncomeDueDates(incomeItems, updateIncome, months = 12) {
  const { user } = useAuth()
  const [incomeStreams, setIncomeStreams] = useState({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)

    const since = new Date()
    since.setMonth(since.getMonth() - months)
    const sinceStr = since.toISOString().slice(0, 10)

    const { data } = await supabase
      .from('transactions')
      .select('matched_income_id, date, amount, description, ignored')
      .eq('user_id', user.id)
      .gte('date', sinceStr)
      .order('date', { ascending: false })

    const deposits = (data ?? []).filter(tx => !tx.ignored && tx.amount > 0)

    // Income matching runs at import time against whatever income_items
    // existed then, so deposits that predate an item keep a null
    // matched_income_id — for this user, most paychecks. Cadence needs the
    // whole series to see the rhythm, so deposits are grouped by pattern
    // first and then attributed to whichever income item that pattern's
    // matched deposits point at.
    //
    // patternKey (not normalizePattern) because payroll descriptions carry a
    // week/batch number that differs every deposit; canonicalizeKeys then
    // merges the variants where the bank appends the account holder's name
    // to some deposits and not others. Without both, every paycheck is its
    // own single-occurrence group and no cadence is ever found.
    const rawKeyByTx = new Map()
    for (const tx of deposits) rawKeyByTx.set(tx, patternKey(tx.description))
    const canonical = canonicalizeKeys([...rawKeyByTx.values()])
    const keyOf = tx => canonical[rawKeyByTx.get(tx)] ?? rawKeyByTx.get(tx)

    const itemIdByKey = {}
    for (const tx of deposits) {
      if (!tx.matched_income_id) continue
      itemIdByKey[keyOf(tx)] = tx.matched_income_id
    }

    const byItemId = {}
    for (const tx of deposits) {
      const itemId = tx.matched_income_id ?? itemIdByKey[keyOf(tx)]
      if (!itemId) continue
      if (!byItemId[itemId]) byItemId[itemId] = []
      byItemId[itemId].push(tx)
    }

    const streams = {}
    for (const [itemId, txs] of Object.entries(byItemId)) {
      // A matched income source is already known to be recurring, so a
      // single clean gap is believable here in a way it isn't for spending.
      const cycleInfo = detectCycle(txs, { lenient: true })
      if (!cycleInfo) continue

      txs.sort((a, b) => (a.date < b.date ? 1 : -1)) // newest first

      // One deposit per date: a paycheck split across two rows on the same
      // day is one payday, and its amount is their sum.
      const byDate = {}
      for (const t of txs) byDate[t.date] = (byDate[t.date] || 0) + Math.abs(t.amount)
      const perDeposit = Object.values(byDate)
      const avgAmount = perDeposit.reduce((s, a) => s + a, 0) / perDeposit.length

      streams[itemId] = {
        cycle: cycleInfo.cycle,
        medianGap: cycleInfo.medianGap,
        dueDay: usesDayOfMonth(cycleInfo.cycle) ? suggestDueDay(txs) : null,
        lastDate: txs[0].date,
        anchorDays: cycleInfo.cycle === 'semimonthly' ? anchorDaysOf(txs) : null,
        avgAmount,
        occurrences: perDeposit.length,
      }
    }

    setIncomeStreams(streams)
    setLoading(false)
  }, [user, months])

  useEffect(() => { load() }, [load])

  // Fill in a due_day for monthly sources that don't have one. Never
  // overwrites an existing value: for a non-monthly source the stored day is
  // unused anyway (dates come from the cycle), and clearing it would wipe a
  // day the user had just typed in on the Income tab.
  //
  // Each item is attempted at most once per mount. updateIncome reloads on
  // failure, which changes the incomeItems identity and re-fires this
  // effect — without the guard a write that keeps failing (say the due_day
  // column isn't migrated yet) would loop indefinitely.
  const attemptedRef = useRef(new Set())
  useEffect(() => {
    if (loading || !incomeItems?.length) return
    for (const item of incomeItems) {
      if (item.due_day != null) continue
      const stream = incomeStreams[item.id]
      if (stream?.dueDay == null) continue
      if (attemptedRef.current.has(item.id)) continue
      attemptedRef.current.add(item.id)
      updateIncome(item.id, 'due_day', stream.dueDay)
    }
  }, [loading, incomeItems, incomeStreams, updateIncome])

  return { incomeStreams, loading }
}
