import { useState, useRef, useEffect } from 'react'

/**
 * Click-to-edit inline cell.
 * Props:
 *   value      — current value (string or number)
 *   onSave     — async (newValue) => void
 *   type       — 'text' | 'number' | 'currency' | 'day' (default 'text')
 *                'day' is a 1-31 day-of-month; an empty draft saves as null
 *                (clears the value) instead of coercing to 0 like number/currency.
 *   className  — extra class on the display span
 *   display    — optional render function (value) => ReactNode
 *   emptyDraft — optional value to seed the input with when value is null/empty
 *                (e.g. an auto-suggested default) — lets the user accept it by
 *                just clicking away, while still saving as a real new value
 *                since commit() always compares against the true `value` prop,
 *                not the seeded draft.
 */
export default function EditableCell({ value, onSave, type = 'text', className = '', display, emptyDraft }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing) {
      const seed = (value == null || value === '') && emptyDraft != null ? emptyDraft : value
      setDraft(type === 'currency' ? String(Math.abs(seed ?? 0)) : String(seed ?? ''))
      setTimeout(() => inputRef.current?.select(), 0)
    }
  }, [editing])

  function commit() {
    setEditing(false)
    let val = draft
    if (type === 'number' || type === 'currency') {
      val = parseFloat(draft.replace(/[$,]/g, '')) || 0
    } else if (type === 'day') {
      // Unparseable input clears the day rather than silently becoming the
      // 1st — "n/a" or a stray keystroke shouldn't invent a due date.
      const trimmed = draft.trim()
      const parsed = /^\d+$/.test(trimmed) ? parseInt(trimmed, 10) : NaN
      val = Number.isNaN(parsed) || parsed < 1 ? null : Math.min(31, parsed)
    }
    if (val !== value) onSave(val)
  }

  function handleKey(e) {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`cell-input${type === 'currency' || type === 'number' || type === 'day' ? ' mono' : ''}`}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        type="text"
        inputMode={type === 'currency' || type === 'number' ? 'decimal' : type === 'day' ? 'numeric' : 'text'}
      />
    )
  }

  return (
    <span
      className={`cell ${className}`}
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      {display ? display(value) : value}
    </span>
  )
}
