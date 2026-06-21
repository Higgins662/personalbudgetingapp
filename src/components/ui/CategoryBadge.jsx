import { useState, useRef, useEffect } from 'react'

export default function CategoryBadge({ categoryId, categories, onSelect, readOnly = false }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const ref = useRef(null)
  const popRef = useRef(null)

  const cat = categories.find(c => c.id === categoryId)

  function handleToggle() {
    if (readOnly) return
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const popWidth = 200 // matches .popover min-width + a little padding
      const margin = 8

      let left = rect.left
      let top = rect.bottom + 4

      // Keep popover on-screen horizontally
      if (left + popWidth > window.innerWidth - margin) {
        left = window.innerWidth - popWidth - margin
      }
      // If there's not enough room below, open upward instead
      const estimatedHeight = 260
      if (top + estimatedHeight > window.innerHeight - margin) {
        top = rect.top - estimatedHeight - 4
        if (top < margin) top = margin // clamp if neither direction has room
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
    // Reposition on scroll/resize instead of leaving a stale popover floating
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
        onClick={handleToggle}
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
