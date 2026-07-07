import { createPortal } from 'react-dom'
import { fmt } from '../../lib/format'
import { formatMonthLabel } from '../../hooks/usePeriods'

/**
 * Two-click confirmation modal for "Clear this month's import."
 * Rendered via a portal directly onto document.body so it
 * sits above everything including sticky nav and popovers.
 *
 * Props:
 *   monthStart    — ISO date string e.g. "2026-10-01"
 *   txCount       — number of transactions that will be deleted
 *   totalAmount   — absolute sum of those transactions (for context)
 *   clearing      — boolean — show spinner on confirm button
 *   error         — string error message if the call failed
 *   onConfirm     — () => void
 *   onCancel      — () => void
 */
export default function ClearMonthModal({
  monthStart,
  txCount,
  totalAmount,
  clearing,
  error,
  onConfirm,
  onCancel,
}) {
  const monthLabel = monthStart ? formatMonthLabel(monthStart) : 'this month'

  return createPortal(
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal-box fadein">
        <div className="modal-icon">🗑️</div>
        <div className="modal-title">Clear {monthLabel} import?</div>
        <p className="modal-body">
          This will permanently delete <strong>{txCount} transaction{txCount === 1 ? '' : 's'}</strong>
          {totalAmount > 0 ? ` (${fmt(totalAmount)} total)` : ''} from {monthLabel} and reset
          all actual amounts for that month back to $0.
        </p>
        <p className="modal-body" style={{ color: 'var(--ink3)', fontSize: '.82rem' }}>
          Your budget structure (income sources, expense categories, savings goals) will
          not be affected. Bank account column mappings are also preserved.
          You can re-import a corrected statement afterward.
        </p>

        {error && <div className="alert alert-error" style={{ marginBottom: '.75rem' }}>{error}</div>}

        <div className="modal-actions">
          <button className="btn btn-danger" onClick={onConfirm} disabled={clearing}>
            {clearing
              ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Clearing…</>
              : `Yes, clear ${monthLabel}`}
          </button>
          <button className="btn btn-g" onClick={onCancel} disabled={clearing}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
