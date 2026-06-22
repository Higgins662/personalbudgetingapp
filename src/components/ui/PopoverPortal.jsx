import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * PopoverPortal — renders children directly onto document.body via a React
 * portal so no ancestor's CSS (overflow: hidden, transform, will-change,
 * filter) can affect the popover's position or clip it.
 *
 * Scroll handling:
 *   - Scrolling INSIDE the popover (when the options list is taller than
 *     max-height) never closes it.
 *   - Scrolling the PAGE closes the popover only if the scroll target is
 *     outside the popover — and only after a short debounce so a single
 *     mousewheel tick doesn't immediately dismiss it while the user is
 *     trying to reach an option.
 *   - Clicking the scrollbar itself (which fires mousedown on document but
 *     with a target of <html> or <body>) is ignored.
 */
export default function PopoverPortal({ anchorRef, onClose, children, minWidth = 200 }) {
  const popRef = useRef(null)
  const scrollTimerRef = useRef(null)

  function getStyle() {
    if (!anchorRef.current) return {}
    const rect = anchorRef.current.getBoundingClientRect()
    const margin = 6

    let left = rect.left + window.scrollX
    if (rect.left + minWidth > window.innerWidth - margin) {
      left = window.innerWidth - minWidth - margin + window.scrollX
    }
    if (left < margin + window.scrollX) left = margin + window.scrollX

    const estimatedHeight = 280
    let top
    if (rect.bottom + estimatedHeight + margin > window.innerHeight) {
      top = rect.top + window.scrollY - estimatedHeight - 4
      if (top < window.scrollY + margin) top = window.scrollY + margin
    } else {
      top = rect.bottom + window.scrollY + 4
    }

    return { top, left, minWidth }
  }

  useEffect(() => {
    function handleOutsideClick(e) {
      // Ignore clicks on the browser scrollbar — these have no real target
      // inside the document body and would otherwise close the popover when
      // the user is just trying to scroll to see more options.
      if (e.target === document.documentElement || e.target === document.body) return

      if (
        anchorRef.current && !anchorRef.current.contains(e.target) &&
        popRef.current && !popRef.current.contains(e.target)
      ) {
        onClose()
      }
    }

    function handleScroll(e) {
      // If the scroll event came from inside the popover itself, ignore it —
      // the user is scrolling through the options list.
      if (popRef.current && popRef.current.contains(e.target)) return

      // For page/window scroll, use a short debounce so a single mousewheel
      // tick doesn't close the popover before the user's click registers.
      // 150ms is long enough to feel stable but short enough that actual
      // page navigation closes it promptly.
      clearTimeout(scrollTimerRef.current)
      scrollTimerRef.current = setTimeout(() => {
        onClose()
      }, 150)
    }

    function handleResize() {
      onClose()
    }

    document.addEventListener('mousedown', handleOutsideClick)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
      clearTimeout(scrollTimerRef.current)
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
