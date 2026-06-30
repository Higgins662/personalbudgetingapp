import { formatMonthLabel, formatYearLabel } from '../../hooks/usePeriods'
import './PeriodSelector.css'

/**
 * Shown at the top of Dashboard, Income, Monthly Expenses.
 * Lets the user browse current/previous month and trigger early rollover.
 */
export function MonthSelector({ periods }) {
  const {
    viewingMonth, isViewingCurrentMonth,
    canGoPrevMonth, canGoNextMonth,
    goPrevMonth, goNextMonth,
    startNewMonth, rolling,
  } = periods

  return (
    <div className="period-selector">
      <button className="period-nav-btn" onClick={goPrevMonth} disabled={!canGoPrevMonth} title="Previous month">‹</button>
      <div className="period-label-group">
        <span className="period-label">{formatMonthLabel(viewingMonth)}</span>
        {isViewingCurrentMonth
          ? <span className="period-badge period-badge-current">Current</span>
          : <span className="period-badge period-badge-past">Past · view only recommended</span>}
      </div>
      <button className="period-nav-btn" onClick={goNextMonth} disabled={!canGoNextMonth} title="Next month">›</button>

      {isViewingCurrentMonth && (
        <button className="btn btn-g period-roll-btn" onClick={startNewMonth} disabled={rolling}>
          {rolling ? <span className="spinner" style={{ width: 13, height: 13 }} /> : '→ Start New Month'}
        </button>
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
