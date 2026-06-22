import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * PopoverPortal — renders children directly onto document.body via a React
 * portal so no ancestor's CSS (overflow: hidden, transform, will-change,
 * filter) can affect the popover's position or clip it.
 *
 * Props:
 *   anchorRef  — ref to the element the popover should appear below
 *   onClose    — called when user clicks outside or scrolls/resizes
 *   children   — the popover content
 *   minWidth   — minimum width in px (default 200)
 */
export default function PopoverPortal({ anchorRef, onClose, children, minWidth = 200 }) {
  const popRef = useRef(null)

  // Calculate position from the anchor element's real viewport coords
  function getStyle() {
    if (!anchorRef.current) return {}
    const rect = anchorRef.current.getBoundingClientRect()
    const margin = 6
    const popWidth = minWidth

    // Horizontal: align left edge of popover with left edge of anchor,
    // clamping so it doesn't overflow the right side of the viewport.
    let left = rect.left + window.scrollX
    if (rect.left + popWidth > window.innerWidth - margin) {
      left = window.innerWidth - popWidth - margin + window.scrollX
    }

    // Vertical: open below by default, flip above if not enough room.
    const estimatedHeight = 280
    let top
    if (rect.bottom + estimatedHeight + margin > window.innerHeight) {
      // Not enough room below — open upward
      top = rect.top + window.scrollY - estimatedHeight - 4
      if (top < window.scrollY + margin) top = window.scrollY + margin
    } else {
      top = rect.bottom + window.scrollY + 4
    }

    return { top, left, minWidth: popWidth }
  }

  useEffect(() => {
    function handleOutsideClick(e) {
      if (
        anchorRef.current && !anchorRef.current.contains(e.target) &&
        popRef.current && !popRef.current.contains(e.target)
      ) {
        onClose()
      }
    }
    function handleReflow() { onClose() }

    document.addEventListener('mousedown', handleOutsideClick)
    window.addEventListener('scroll', handleReflow, true)
    window.addEventListener('resize', handleReflow)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      window.removeEventListener('scroll', handleReflow, true)
      window.removeEventListener('resize', handleReflow)
    }
  }, [onClose, anchorRef])

  const style = { ...getStyle(), position: 'absolute', zIndex: 9999 }

  return createPortal(
    <div className="popover" ref={popRef} style={style}>
      {children}
    </div>,
    document.body
  )
}
