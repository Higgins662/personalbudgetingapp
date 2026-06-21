import { useState, useRef, useEffect } from 'react'

/**
 * Shows the bank account assigned to an expense as a clickable badge.
 * Click opens a popover listing all the user's bank accounts (from
 * Reconcile/onboarding) plus an "Unassigned" option for cash or
 * anything not tied to a tracked account.
 */
export default function PaymentMethodBadge({ bankAccountId, bankAccounts, onSelect, readOnly = false }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const ref = useRef(null)
  const popRef = useRef(null)

  const acct = bankAccounts.find(b => b.id === bankAccountId)

  function handleToggle() {
    if (readOnly) return
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const popWidth = 200
      const margin = 8

      let left = rect.left
      let top = rect.bottom + 4

      if (left + popWidth > window.innerWidth - margin) {
        left = window.innerWidth - popWidth - margin
      }
      const estimatedHeight = 260
      if (top + estimatedHeight > window.innerHeight - margin) {
        top = rect.top - estimatedHeight - 4
        if (top < margin) top = margin
      }

      setCoords({ top, left })
    }
    setOpen(o => !o)
  }

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target) &&
          popRef.current && !popRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    function handleReflow() { setOpen(false) }

    document.addEventListener('mousedown', handleClick)
    window.addEventListener('scroll', handleReflow, true)
    window.addEventListener('resize', handleReflow)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      window.removeEventListener('scroll', handleReflow, true)
      window.removeEventListener('resize', handleReflow)
    }
  }, [open])

  function handleSelect(id) {
    setOpen(false)
    onSelect && onSelect(id)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} ref={ref}>
      <span
        className="badge pay-badge"
        onClick={handleToggle}
        title={readOnly ? undefined : 'Click to change payment method'}
      >
        🏦 {acct?.name ?? 'Unassigned'}
      </span>

      {open && (
        <div
          className="popover"
          ref={popRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, zIndex: 1000 }}
        >
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
