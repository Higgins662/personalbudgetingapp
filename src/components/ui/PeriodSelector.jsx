import { useState } from 'react'
import { formatMonthLabel, formatYearLabel } from '../../hooks/usePeriods'
import StartNewMonthModal from './StartNewMonthModal'
import './PeriodSelector.css'

/**
 * Shown at the top of Dashboard, Income, Monthly Expenses.
 * Lets the user browse current/previous month and trigger early rollover.
 */
export function MonthSelector({ periods, onTabChange, showRecentHint = false, showRecentBadge = false }) {
  const {
    viewingMonth, isViewingCurrentMonth, isViewingMostRecentPastMonth,
    canGoPrevMonth, canGoNextMonth,
    goPrevMonth, goNextMonth,
    startNewMonth, rolling,
  } = periods

  const [showConfirm, setShowConfirm] = useState(false)

  const nextMonthStart = (() => {
    const [y, m] = viewingMonth.split('-').map(Number)
    const d = new Date(y, m, 1) // JS months 0-based → m is already "next month" index
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  })()

  async function handleConfirm() {
    await startNewMonth()
    setShowConfirm(false)
  }

  function handleGoToImport() {
    setShowConfirm(false)
    onTabChange?.('transactions')
  }

  return (
    <div className="period-selector">
      <button className="period-nav-btn" onClick={goPrevMonth} disabled={!canGoPrevMonth} title="Previous month">‹</button>
      <div className="period-label-group">
        <span className="period-label">{formatMonthLabel(viewingMonth)}</span>
        {isViewingCurrentMonth
          ? <span className="period-badge period-badge-current">Current</span>
          : (showRecentHint || showRecentBadge) && isViewingMostRecentPastMonth
            ? <span className="period-badge period-badge-recent">Most Recent</span>
            : <span className="period-badge period-badge-past">Past · view only recommended</span>}
      </div>
      <button className="period-nav-btn" onClick={goNextMonth} disabled={!canGoNextMonth} title="Next month">›</button>

      {showRecentHint && isViewingMostRecentPastMonth && (
        <div className="period-hint">
          <img src="/brand/veravo-favicon.svg" alt="" className="period-hint-icon" />
          This is where your most recent uploaded transactions appear. Review actuals against your budget and adjust where you need to keep on track for the new month.
        </div>
      )}

      {isViewingCurrentMonth && (
        <button className="btn btn-g period-roll-btn" onClick={() => setShowConfirm(true)} disabled={rolling}
          title="Jump ahead to next month's budget before its date arrives">
          {rolling ? <span className="spinner" style={{ width: 13, height: 13 }} /> : '→ Start Next Month Early'}
        </button>
      )}

      {showConfirm && (
        <StartNewMonthModal
          nextMonthStart={nextMonthStart}
          rolling={rolling}
          onConfirm={handleConfirm}
          onGoToImport={handleGoToImport}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  )
}

/**
 * Shown at the top of Yearly Subscriptions.
 */
export function YearSelector({ periods }) {
  const {
    viewingYear, isViewingCurrentYear,
    canGoPrevYear, canGoNextYear,
    goPrevYear, goNextYear,
    startNewYear, rolling,
  } = periods

  return (
    <div className="period-selector">
      <button className="period-nav-btn" onClick={goPrevYear} disabled={!canGoPrevYear} title="Previous year">‹</button>
      <div className="period-label-group">
        <span className="period-label">{formatYearLabel(viewingYear)}</span>
        {isViewingCurrentYear
          ? <span className="period-badge period-badge-current">Current</span>
          : <span className="period-badge period-badge-past">Past · view only recommended</span>}
      </div>
      <button className="period-nav-btn" onClick={goNextYear} disabled={!canGoNextYear} title="Next year">›</button>

      {isViewingCurrentYear && (
        <button className="btn btn-g period-roll-btn" onClick={startNewYear} disabled={rolling}>
          {rolling ? <span className="spinner" style={{ width: 13, height: 13 }} /> : '→ Start New Year'}
        </button>
      )}
    </div>
  )
}
