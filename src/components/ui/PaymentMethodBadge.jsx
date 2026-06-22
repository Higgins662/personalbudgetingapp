import { useState, useRef, useCallback } from 'react'
import PopoverPortal from './PopoverPortal'

export default function PaymentMethodBadge({ bankAccountId, bankAccounts, onSelect, readOnly = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const acct = bankAccounts.find(b => b.id === bankAccountId)
  const handleClose = useCallback(() => setOpen(false), [])

  function handleSelect(id) {
    setOpen(false)
    onSelect && onSelect(id)
  }

  return (
    <span style={{ position: 'relative', display: 'inline-block' }} ref={ref}>
      <span
        className="badge pay-badge"
        onClick={() => !readOnly && setOpen(o => !o)}
        title={readOnly ? undefined : 'Click to change payment method'}
      >
        🏦 {acct?.name ?? 'Unassigned'}
      </span>

      {open && (
        <PopoverPortal anchorRef={ref} onClose={handleClose}>
          <div
            className="pop-item"
            onClick={() => handleSelect(null)}
            style={{ color: '#888', fontStyle: 'italic' }}
          >
            — Unassigned —
          </div>
          {bankAccounts.map(b => (
            <div
              key={b.id}
              className="pop-item"
              onClick={() => handleSelect(b.id)}
            >
              🏦 {b.name}
            </div>
          ))}
          {bankAccounts.length === 0 && (
            <div className="pop-item" style={{ color: '#888', fontStyle: 'italic', cursor: 'default' }}>
              No banks yet — add one in Reconcile
            </div>
          )}
        </PopoverPortal>
      )}
    </span>
  )
}
