import { createPortal } from 'react-dom'
import { formatMonthLabel } from '../../hooks/usePeriods'

/**
 * Confirmation modal for the "Start New Month" early-rollover button.
 *
 * This is an easy button to click by mistake: the calendar month already
 * rolls forward automatically, so this is specifically for jumping AHEAD
 * of that — e.g. starting next month's budget a few days early. Someone
 * who actually wants to import last month's statement to fill in this
 * month's actuals doesn't need this at all, so the modal calls that out
 * and offers a direct way out to Transactions instead.
 *
 * Props:
 *   nextMonthStart — ISO date string for the month this will create/open
 *   rolling        — boolean — show spinner on confirm button
 *   onConfirm      — () => void
 *   onGoToImport   — () => void  (escape hatch: navigate to Transactions instead)
 *   onCancel       — () => void
 */
export default function StartNewMonthModal({
  nextMonthStart,
  rolling,
  onConfirm,
  onGoToImport,
  onCancel,
}) {
  const nextMonthLabel = nextMonthStart ? formatMonthLabel(nextMonthStart) : 'next month'

  return createPortal(
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal-box fadein">
        <div className="modal-icon">→</div>
        <div className="modal-title">Start {nextMonthLabel} early?</div>
        <p className="modal-body">
          This jumps ahead to <strong>{nextMonthLabel}</strong> before its date arrives, with a
          fresh $0 budget. Your calendar month already advances on its own — you only need this
          if you want to start planning {nextMonthLabel} a few days early.
        </p>

        <div className="alert alert-info" style={{ textAlign: 'left', fontSize: '.83rem' }}>
          Looking to import last month's transactions to fill in this month's actuals?
          You don't need this button —{' '}
          <button
            onClick={onGoToImport}
            style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--blue)', textDecoration: 'underline', cursor: 'pointer' }}
          >
            go to Transactions instead
          </button>.
        </div>

        <div className="modal-actions">
          <button className="btn btn-p" onClick={onConfirm} disabled={rolling}>
            {rolling
              ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Starting…</>
              : `Yes, start ${nextMonthLabel}`}
          </button>
          <button className="btn btn-g" onClick={onCancel} disabled={rolling}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
