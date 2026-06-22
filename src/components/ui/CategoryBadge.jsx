import { useState, useRef, useCallback } from 'react'
import PopoverPortal from './PopoverPortal'

export default function CategoryBadge({ categoryId, categories, onSelect, readOnly = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const cat = categories.find(c => c.id === categoryId)

  const handleClose = useCallback(() => setOpen(false), [])

  function handleSelect(id) {
    setOpen(false)
    onSelect && onSelect(id)
  }

  const style = cat
    ? { background: cat.color + '22', color: cat.color, borderColor: cat.color + '55' }
    : { background: '#f0f0f0', color: '#888', borderColor: '#ddd' }

  return (
    <span style={{ position: 'relative', display: 'inline-block' }} ref={ref}>
      <span
        className={`badge${cat?.enabled === false ? ' disabled-cat' : ''}`}
        style={style}
        onClick={() => !readOnly && setOpen(o => !o)}
        title={readOnly ? undefined : 'Click to change category'}
      >
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: cat?.color ?? '#888',
          display: 'inline-block', flexShrink: 0,
        }} />
        {cat?.name ?? 'Uncategorized'}
      </span>

      {open && (
        <PopoverPortal anchorRef={ref} onClose={handleClose}>
          <div
            className="pop-item"
            onClick={() => handleSelect(null)}
            style={{ color: '#888', fontStyle: 'italic' }}
          >
            — None —
          </div>
          {categories.filter(c => c.enabled !== false).map(c => (
            <div
              key={c.id}
              className="pop-item"
              onClick={() => handleSelect(c.id)}
            >
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                background: c.color, flexShrink: 0,
              }} />
              {c.name}
            </div>
          ))}
        </PopoverPortal>
      )}
    </span>
  )
}
