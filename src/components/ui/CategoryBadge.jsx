import { useState, useRef, useEffect } from 'react'

export default function CategoryBadge({ categoryId, categories, onSelect, readOnly = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const popRef = useRef(null)

  const cat = categories.find(c => c.id === categoryId)

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

  const style = cat
    ? { background: cat.color + '22', color: cat.color, borderColor: cat.color + '55' }
    : { background: '#f0f0f0', color: '#888', borderColor: '#ddd' }

  function handleSelect(id) {
    setOpen(false)
    onSelect && onSelect(id)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} ref={ref}>
      <span
        className={`badge${cat?.enabled === false ? ' disabled-cat' : ''}`}
        style={style}
        onClick={() => !readOnly && setOpen(o => !o)}
        title={readOnly ? undefined : 'Click to change category'}
      >
        <span
          style={{
            width: 7, height: 7, borderRadius: '50%',
            background: cat?.color ?? '#888',
            display: 'inline-block', flexShrink: 0,
          }}
        />
        {cat?.name ?? 'Uncategorized'}
      </span>

      {open && (
        <div className="popover" ref={popRef} style={{ top: '110%', left: 0, zIndex: 400 }}>
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
        </div>
      )}
    </div>
  )
}
