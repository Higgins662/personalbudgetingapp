import { useState } from 'react'
import { fmt } from '../../lib/format'

const CYCLE_LABELS = {
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  semimonthly: 'Twice a month',
  monthly: 'Every month',
  quarterly: 'Every 3 months',
  interval: 'Fixed cycle',
}

/**
 * One due-item chip for a Calendar day cell or agenda row.
 * Reuses CategoryBadge's cat.color + '22'/'55' alpha-suffix convention for
 * background/border so due-date chips read as the same visual language as
 * category badges elsewhere in the app. Styled via CalendarPage.css (its
 * only consumer), same as CategoryBadge has no CSS import of its own.
 *
 * Day cells are narrow, so the label is always truncated — hovering opens a
 * flyout with the full description, amount, category and cadence.
 *
 * Props:
 *   item           — the expense_items/income_items row (needs .label)
 *   category       — the resolved category row, or null/undefined
 *   amount         — dollar amount to show (averaged, or budgeted fallback)
 *   isPast         — true if this due date already passed this month (muted)
 *   isEstimate     — true when `amount` is a budgeted fallback, not a real average
 *   isDateEstimate — true when the due DAY itself is an auto-suggestion the
 *                    user hasn't confirmed yet (shows a dashed border)
 *   itemType       — 'income' | 'expense', for the flyout's wording
 *   cycle          — detected cadence name, when known
 *   fullLabel      — untruncated source description, when it differs from label
 */
export default function DueDateBadge({
  item, category, amount, isPast = false, isEstimate = false,
  isDateEstimate = false, itemType = 'expense', cycle, fullLabel,
}) {
  const [hovered, setHovered] = useState(false)
  const color = category?.color ?? '#888'

  return (
    <div
      className={`due-date-badge-wrap${hovered ? ' is-hovered' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`due-date-badge${isPast ? ' due-date-badge-past' : ''}${isDateEstimate ? ' due-date-badge-suggested' : ''}`}
        style={{ background: color + '22', color, borderColor: color + '55' }}
      >
        <span className="due-date-badge-dot" style={{ background: color }} />
        <span className="due-date-badge-label">{item.label}</span>
        <span className="due-date-badge-amt">{isEstimate ? '~' : ''}{fmt(amount)}</span>
      </div>

      {hovered && (
        <div className="due-flyout" role="tooltip">
          <div className="due-flyout-label">{fullLabel || item.label}</div>
          <div className="due-flyout-amt" style={{ color }}>
            {itemType === 'income' ? '+' : '−'}{isEstimate ? '~' : ''}{fmt(amount)}
          </div>
          <div className="due-flyout-meta">
            {category && (
              <span
                className="due-flyout-chip"
                style={{ background: color + '22', color, borderColor: color + '55' }}
              >
                <span className="due-date-badge-dot" style={{ background: color }} />
                {category.name}
              </span>
            )}
            {cycle && <span className="due-flyout-cycle">{CYCLE_LABELS[cycle] ?? cycle}</span>}
          </div>
          {(isDateEstimate || isEstimate) && (
            <div className="due-flyout-note">
              {isDateEstimate && <div>Date estimated from past activity</div>}
              {isEstimate && <div>Amount estimated from your budget</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
