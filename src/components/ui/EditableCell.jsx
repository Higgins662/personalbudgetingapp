import { useState, useRef, useEffect } from 'react'

/**
 * Click-to-edit inline cell.
 * Props:
 *   value      — current value (string or number)
 *   onSave     — async (newValue) => void
 *   type       — 'text' | 'number' | 'currency' (default 'text')
 *   className  — extra class on the display span
 *   display    — optional render function (value) => ReactNode
 */
export default function EditableCell({ value, onSave, type = 'text', className = '', display }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing) {
      setDraft(type === 'currency' ? String(Math.abs(value ?? 0)) : String(value ?? ''))
      setTimeout(() => inputRef.current?.select(), 0)
    }
  }, [editing])

  function commit() {
    setEditing(false)
    let val = draft
    if (type === 'number' || type === 'currency') {
      val = parseFloat(draft.replace(/[$,]/g, '')) || 0
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
        className={`cell-input${type === 'currency' || type === 'number' ? ' mono' : ''}`}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        type="text"
        inputMode={type === 'currency' || type === 'number' ? 'decimal' : 'text'}
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
