import { useState, useRef, useMemo } from 'react'
import { MonthSelector } from '../components/ui/PeriodSelector'
import DueDateBadge from '../components/ui/DueDateBadge'
import EditableCell from '../components/ui/EditableCell'
import PopoverPortal from '../components/ui/PopoverPortal'
import { isSystemCategory } from '../hooks/useBudget'
import { useCalendarAverages } from '../hooks/useCalendarAverages'
import { useRecurringPatterns } from '../hooks/useRecurringPatterns'
import { useIncomeDueDates } from '../hooks/useIncomeDueDates'
import { clampDueDay, projectDatesInMonth, usesDayOfMonth } from '../lib/cadence'
import { fmt } from '../lib/format'
import './CalendarPage.css'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MAX_VISIBLE_PER_DAY = 3

function dateOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function amountFor(item, averagesByItemId) {
  const avgInfo = averagesByItemId[item.id]
  if (avgInfo?.periodsCounted) return { amount: avgInfo.avg, isEstimate: false }
  return { amount: item.budgeted || 0, isEstimate: true }
}

export default function CalendarPage({ budget, periods, onTabChange }) {
  const {
    monthly = [], annual = [], income = [], categories = [], loading,
    updateAnnual, updateIncome,
  } = budget
  const { averagesByItemId } = useCalendarAverages()
  const { patterns = [], loading: patternsLoading, setDueDay: setPatternDueDay } = useRecurringPatterns()
  const { incomeStreams } = useIncomeDueDates(income, updateIncome)

  // usePeriods seeds viewingMonth synchronously, but guard anyway since every
  // hook below must run unconditionally regardless of whether periods/budget
  // have finished loading — the loading check happens once, after all hooks.
  const viewingMonth = periods?.viewingMonth ?? null
  const now = new Date()
  const [viewYear, viewMonth1] = viewingMonth
    ? viewingMonth.split('-').map(Number)
    : [now.getFullYear(), now.getMonth() + 1]
  const viewMonthIndex = viewMonth1 - 1
  const isCurrentMonth = !!periods?.isViewingCurrentMonth

  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories])

  // Which categories the recurrence detector will and won't consider. Shown
  // at the bottom of the page so a bill sitting in the wrong category — and
  // therefore silently kept off the calendar — is easy to spot and fix.
  const categoryKinds = useMemo(() => {
    const seen = new Set()
    const groups = { recurring: [], neutral: [], everyday: [] }
    for (const c of categories) {
      // Categories can be duplicated in the data; show each name once.
      if (seen.has(c.name)) continue
      seen.add(c.name)
      const kind = c.recurring_kind || 'neutral'
      if (groups[kind]) groups[kind].push(c)
    }
    for (const list of Object.values(groups)) {
      list.sort((a, b) => a.name.localeCompare(b.name))
    }
    return groups
  }, [categories])
  const categoryIdByExpenseItemId = useMemo(
    () => Object.fromEntries([...monthly, ...annual].map(i => [i.id, i.category_id])),
    [monthly, annual]
  )

  // ── Due entries for the viewed month ──────────────────────────────────────
  const dueEntries = useMemo(() => {
    const today = dateOnly(new Date())
    const entries = []

    for (const pattern of patterns) {
      // Monthly/quarterly patterns have a real day-of-month. Weekly and
      // biweekly ones walk through the month, so their dates are projected
      // forward from the last observed charge — a biweekly paycheck lands
      // 2-3 times in a month, each as its own entry.
      const dates = projectDatesInMonth(pattern, viewYear, viewMonthIndex)
      for (const dueDate of dates) {
        entries.push({
          item: {
            id: `${pattern.key}@${dueDate.getDate()}`,
            label: pattern.label,
          },
          itemType: 'expense',
          category: catById[categoryIdByExpenseItemId[pattern.expenseItemId]] ?? null,
          dueDate,
          amount: pattern.avgAmount,
          isEstimate: false,
          isDateEstimate: pattern.dueDayIsSuggested || pattern.cycle !== 'monthly',
          isPast: isCurrentMonth && dateOnly(dueDate) < today,
          cycle: pattern.cycle,
          fullLabel: pattern.fullLabel,
        })
      }
    }

    for (const item of annual) {
      if (item.enabled === false || isSystemCategory(item, categories)) continue
      if (!item.due_day || !item.due_month || item.due_month !== viewMonthIndex + 1) continue
      const day = clampDueDay(viewYear, viewMonthIndex, item.due_day)
      const dueDate = new Date(viewYear, viewMonthIndex, day)
      const { amount, isEstimate } = amountFor(item, averagesByItemId)
      entries.push({
        item, itemType: 'expense', category: catById[item.category_id], dueDate,
        amount, isEstimate,
        isPast: isCurrentMonth && dateOnly(dueDate) < today,
      })
    }

    for (const item of income) {
      if (item.enabled === false || isSystemCategory(item, categories)) continue

      // Most paychecks are biweekly, so income is projected from its detected
      // cycle rather than a day-of-month — that keeps a Thursday paycheck on
      // Thursdays and shows all 2-3 of them in the month. Sources with no
      // detected cadence fall back to a manually-set due day.
      // A stored due_day wins for monthly sources (the user may have set it);
      // for cycle-projected ones it's unused, since the dates come from the
      // cadence rather than a day of the month.
      const stream = incomeStreams[item.id]
      const dates = stream
        ? projectDatesInMonth({ ...stream, dueDay: item.due_day ?? stream.dueDay },
                              viewYear, viewMonthIndex)
        : (item.due_day
            ? [new Date(viewYear, viewMonthIndex, clampDueDay(viewYear, viewMonthIndex, item.due_day))]
            : [])

      // Per-deposit amount from the transactions themselves. The period_items
      // average would be the month's TOTAL income for this source, which for a
      // biweekly paycheck is 2-3x what actually arrives on any one day.
      const fallback = amountFor(item, averagesByItemId)
      const amount = stream ? stream.avgAmount : fallback.amount
      const isEstimate = stream ? false : fallback.isEstimate

      for (const dueDate of dates) {
        entries.push({
          item: stream && dates.length > 1
            ? { ...item, id: `${item.id}@${dueDate.getDate()}` }
            : item,
          itemType: 'income',
          category: null,
          dueDate,
          amount,
          isEstimate,
          isDateEstimate: !!stream && stream.cycle !== 'monthly',
          isPast: isCurrentMonth && dateOnly(dueDate) < today,
          cycle: stream?.cycle,
        })
      }
    }

    entries.sort((a, b) => a.dueDate - b.dueDate)
    return entries
  }, [patterns, annual, income, incomeStreams, categories, catById, categoryIdByExpenseItemId, averagesByItemId, viewYear, viewMonthIndex, isCurrentMonth])

  // ── Items missing a due date entirely ───────────────────────────────────
  const needsDueDate = useMemo(() => {
    const list = []
    for (const pattern of patterns) {
      // Weekly/biweekly patterns are projected from their cycle, not from a
      // day-of-month — there's nothing for the user to set.
      const usesDueDay = usesDayOfMonth(pattern.cycle)
      if (usesDueDay && !pattern.dueDay) {
        list.push({
          key: `pattern-${pattern.key}`,
          label: pattern.label,
          category: catById[categoryIdByExpenseItemId[pattern.expenseItemId]] ?? null,
          dueDay: null, dueMonth: null, showDueMonth: false,
          onSetDay: v => setPatternDueDay(pattern, v), onSetMonth: null,
        })
      }
    }
    for (const item of annual) {
      if (item.enabled === false || isSystemCategory(item, categories)) continue
      if (!item.due_day || !item.due_month) {
        list.push({
          key: `annual-${item.id}`,
          label: item.label,
          category: catById[item.category_id],
          dueDay: item.due_day, dueMonth: item.due_month, showDueMonth: true,
          onSetDay: v => updateAnnual(item.id, 'due_day', v),
          onSetMonth: v => updateAnnual(item.id, 'due_month', v),
        })
      }
    }
    for (const item of income) {
      if (item.enabled === false || isSystemCategory(item, categories)) continue
      // A source with a detected cadence needs nothing set — its dates are
      // projected. Only ask about ones we couldn't work out from history.
      if (incomeStreams[item.id]) continue
      if (!item.due_day) {
        list.push({
          key: `income-${item.id}`,
          label: item.label,
          category: null,
          dueDay: item.due_day, dueMonth: null, showDueMonth: false,
          onSetDay: v => updateIncome(item.id, 'due_day', v), onSetMonth: null,
        })
      }
    }
    return list
  }, [patterns, annual, income, incomeStreams, categories, catById, categoryIdByExpenseItemId, setPatternDueDay, updateAnnual, updateIncome])

  // ── Cash flow summary ────────────────────────────────────────────────────
  const summary = useMemo(() => {
    let incomeTotal = 0, expenseTotal = 0, incomeCount = 0, expenseCount = 0
    for (const e of dueEntries) {
      if (isCurrentMonth && e.isPast) continue
      if (e.itemType === 'income') { incomeTotal += e.amount; incomeCount++ }
      else { expenseTotal += e.amount; expenseCount++ }
    }
    return {
      incomeTotal, expenseTotal,
      net: incomeTotal - expenseTotal,
      incomeCount, expenseCount,
    }
  }, [dueEntries, isCurrentMonth])

  const entriesByDay = useMemo(() => {
    const map = {}
    for (const e of dueEntries) {
      const d = e.dueDate.getDate()
      if (!map[d]) map[d] = []
      map[d].push(e)
    }
    return map
  }, [dueEntries])

  if (loading || patternsLoading || !periods) {
    return <div className="loading-center"><span className="spinner" /> Loading…</div>
  }

  // ── Grid layout (not hooks — safe to compute after the loading check) ────
  const daysInMonth  = new Date(viewYear, viewMonthIndex + 1, 0).getDate()
  const firstWeekday = new Date(viewYear, viewMonthIndex, 1).getDay()
  const todayNum     = isCurrentMonth ? dateOnly(new Date()).getDate() : null

  const cells = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="fadein">
      <div className="sec-hdr">
        <span className="sec-title">Calendar</span>
        <span className="sec-hint">Due dates for recurring monthly and yearly items</span>
      </div>

      <MonthSelector periods={periods} onTabChange={onTabChange} />

      <div className="cal-summary-wrap" style={{ marginBottom: '1.25rem' }}>
        <div className="scard">
          <div className="slabel">
            {isCurrentMonth ? 'Income Remaining' : 'Total Income'}
          </div>
          <div className="sval" style={{ color: 'var(--green)' }}>
            {fmt(summary.incomeTotal)}
          </div>
          <div className="ssub">
            {summary.incomeCount} deposit{summary.incomeCount === 1 ? '' : 's'}
          </div>
        </div>

        <div className="scard">
          <div className="slabel">
            {isCurrentMonth ? 'Due Remaining' : 'Total Due'}
          </div>
          <div className="sval" style={{ color: 'var(--red)' }}>
            {fmt(summary.expenseTotal)}
          </div>
          <div className="ssub">
            {summary.expenseCount} charge{summary.expenseCount === 1 ? '' : 's'}
          </div>
        </div>

        <div className="scard">
          <div className="slabel">
            {isCurrentMonth ? 'Net Remaining' : 'Net This Month'}
          </div>
          <div className="sval" style={{ color: summary.net >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {summary.net >= 0 ? '+' : ''}{fmt(summary.net)}
          </div>
          <div className="ssub">income minus what's due</div>
        </div>
      </div>

      {needsDueDate.length > 0 && (
        <div className="cal-section card" style={{ marginBottom: '1.25rem' }}>
          <div className="sec-hdr">
            <span className="sec-title" style={{ fontSize: '1.1rem' }}>Needs a due date</span>
            <span className="sec-hint">{needsDueDate.length} item{needsDueDate.length === 1 ? '' : 's'} won't show on the calendar until set</span>
          </div>
          <div className="cal-needs-list">
            {needsDueDate.map(({ key, label, category, dueDay, dueMonth, showDueMonth, onSetDay, onSetMonth }) => (
              <div key={key} className="cal-needs-row">
                <span className="cal-cat-dot" style={{ background: category?.color ?? '#888' }} />
                <span className="cal-needs-label">{label}</span>
                <div className="due-cell">
                  {showDueMonth && (
                    <select
                      className="cell-select due-month-select"
                      value={dueMonth ?? ''}
                      onChange={e => onSetMonth(e.target.value ? parseInt(e.target.value, 10) : null)}
                    >
                      <option value="">Month</option>
                      {MONTH_NAMES.map((m, i) => (
                        <option key={m} value={i + 1}>{m}</option>
                      ))}
                    </select>
                  )}
                  <EditableCell
                    type="day"
                    value={dueDay ?? null}
                    onSave={onSetDay}
                    display={d => d ? `Due ${d}` : 'Set due day'}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Desktop month grid ── */}
      <div className="cal-section card cal-grid-wrap">
        <div className="cal-weekday-row">
          {WEEKDAYS.map(w => <div key={w} className="cal-weekday">{w}</div>)}
        </div>
        <div className="cal-grid">
          {cells.map((day, i) => (
            day == null
              ? <div key={`blank-${i}`} className="cal-day cal-day-empty" />
              : <DayCell key={day} day={day} entries={entriesByDay[day] ?? []} isToday={day === todayNum} />
          ))}
        </div>
      </div>

      {/* ── Mobile agenda ── */}
      <div className="cal-agenda">
        {dueEntries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🗓️</div>
            <div className="empty-state-title">Nothing due this month yet</div>
            <div className="empty-state-body">Set due dates on your budget items to see them here.</div>
          </div>
        ) : (
          Object.keys(entriesByDay).map(Number).sort((a, b) => a - b).map(day => (
            <div key={day} className="cal-agenda-day">
              <div className="cal-agenda-day-hdr">
                {MONTH_NAMES[viewMonthIndex]} {day}
                {day === todayNum && <span className="cal-today-tag">Today</span>}
              </div>
              {entriesByDay[day].map(e => (
                <DueDateBadge key={`${e.itemType}-${e.item.id}`} item={e.item} category={e.category} amount={e.amount} isPast={e.isPast} isEstimate={e.isEstimate} isDateEstimate={e.isDateEstimate} itemType={e.itemType} cycle={e.cycle} fullLabel={e.fullLabel} />
              ))}
            </div>
          ))
        )}
      </div>

      <CategoryLegend groups={categoryKinds} onTabChange={onTabChange} />
    </div>
  )
}

/**
 * Explains which categories the recurrence detector treats as bills, which
 * it ignores, and which it judges on transaction history alone.
 *
 * Without this the 'everyday' veto is invisible: a bill filed under
 * Groceries simply never appears on the calendar and there's nothing to
 * indicate why. Listing the groupings makes a miscategorized payment
 * obvious and points at where to change it.
 */
function CategoryLegend({ groups, onTabChange }) {
  const sections = [
    { kind: 'recurring', title: 'Always considered',
      hint: 'Charges here are treated as bills when they repeat on a schedule.' },
    { kind: 'neutral', title: 'Considered if they look recurring',
      hint: 'Included only when the amount and timing form a clear pattern.' },
    { kind: 'everyday', title: 'Never considered',
      hint: 'Everyday spending — skipped even when it looks regular.' },
  ].filter(s => groups[s.kind].length > 0)

  if (!sections.length) return null

  return (
    <div className="cal-legend">
      <div className="cal-legend-hdr">
        <span className="cal-legend-title">How categories are used</span>
        <span className="cal-legend-hint">
          A bill in the wrong category may not show up here.{' '}
          {onTabChange && (
            <button className="cal-legend-link" onClick={() => onTabChange('categories')}>
              Change these in Categories
            </button>
          )}
        </span>
      </div>

      <div className="cal-legend-grid">
        {sections.map(({ kind, title, hint }) => (
          <div key={kind} className={`cal-legend-group cal-legend-${kind}`}>
            <div className="cal-legend-group-title">{title}</div>
            <div className="cal-legend-group-hint">{hint}</div>
            <div className="cal-legend-cats">
              {groups[kind].map(c => (
                <span key={c.id} className="cal-legend-cat"
                      style={{ background: c.color + '22', color: c.color, borderColor: c.color + '55' }}>
                  <span className="cal-legend-dot" style={{ background: c.color }} />
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DayCell({ day, entries, isToday }) {
  const [showMore, setShowMore] = useState(false)
  const anchorRef = useRef(null)
  const visible = entries.slice(0, MAX_VISIBLE_PER_DAY)
  const overflow = entries.length - visible.length

  return (
    <div className={`cal-day${isToday ? ' cal-day-today' : ''}`}>
      <div className="cal-day-num">{day}</div>
      <div className="cal-day-entries">
        {visible.map(e => (
          <DueDateBadge key={`${e.itemType}-${e.item.id}`} item={e.item} category={e.category} amount={e.amount} isPast={e.isPast} isEstimate={e.isEstimate} isDateEstimate={e.isDateEstimate} itemType={e.itemType} cycle={e.cycle} fullLabel={e.fullLabel} />
        ))}
        {overflow > 0 && (
          <button className="cal-day-more" ref={anchorRef} onClick={() => setShowMore(v => !v)}>
            +{overflow} more
          </button>
        )}
      </div>
      {showMore && (
        <PopoverPortal anchorRef={anchorRef} onClose={() => setShowMore(false)} minWidth={220}>
          <div className="cal-day-more-list">
            {entries.map(e => (
              <DueDateBadge key={`${e.itemType}-${e.item.id}`} item={e.item} category={e.category} amount={e.amount} isPast={e.isPast} isEstimate={e.isEstimate} isDateEstimate={e.isDateEstimate} itemType={e.itemType} cycle={e.cycle} fullLabel={e.fullLabel} />
            ))}
          </div>
        </PopoverPortal>
      )}
    </div>
  )
}
