import { useState, useRef, useEffect } from 'react'

/**
 * Shows the bank account assigned to an expense as a clickable badge.
 * Click opens a popover listing all the user's bank accounts (from
 * Reconcile/onboarding) plus an "Unassigned" option for cash or
 * anything not tied to a tracked account.
 */
export default function PaymentMethodBadge({ bankAccountId, bankAccounts, onSelect, readOnly = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const popRef = useRef(null)

  const acct = bankAccounts.find(b => b.id === bankAccountId)

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target) &&
          popRef.current && !popRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function handleSelect(id) {
    setOpen(false)
    onSelect && onSelect(id)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} ref={ref}>
      <span
        className="badge pay-badge"
        onClick={() => !readOnly && setOpen(o => !o)}
        title={readOnly ? undefined : 'Click to change payment method'}
      >
        🏦 {acct?.name ?? 'Unassigned'}
      </span>

      {open && (
        <div className="popover" ref={popRef} style={{ top: '110%', left: 0, zIndex: 400 }}>
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
        </div>
      )}
    </div>
  )
}
