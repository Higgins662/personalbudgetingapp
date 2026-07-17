import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import './Nav.css'

const TABS = [
  { id: 'dashboard',  label: 'Dashboard',              icon: '📊' },
  { id: 'income',     label: 'Income',                 icon: '💵' },
  { id: 'monthly',    label: 'Monthly Expenses',       icon: '📅' },
  { id: 'annual',     label: 'Yearly Subscriptions',   icon: '🔁' },
  { id: 'goals',      label: 'Savings Goals',          icon: '🎯' },
  { id: 'categories', label: 'Categories & Colors',    icon: '🏷️' },
  { id: 'reconcile',  label: 'Reconcile',              icon: '🔄' },
  { id: 'transactions', label: 'Transactions',           icon: '🧾' },
]

export default function Nav({ activeTab, onTabChange }) {
  const { signOut, user } = useAuth()
  const [menuOpen,   setMenuOpen]   = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const menuRef  = useRef(null)
  const btnRef   = useRef(null)

  const closeMenu   = useCallback(() => setMenuOpen(false), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  // Close avatar dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e) {
      if (
        menuRef.current && !menuRef.current.contains(e.target) &&
        btnRef.current  && !btnRef.current.contains(e.target)
      ) closeMenu()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen, closeMenu])

  // Close drawer on outside click (backdrop handles it, but also ESC)
  useEffect(() => {
    if (!drawerOpen) return
    function handleKey(e) { if (e.key === 'Escape') closeDrawer() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [drawerOpen, closeDrawer])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  const initial = user?.email?.[0]?.toUpperCase() ?? '?'

  function handleTabChange(id) {
    onTabChange(id)
    closeDrawer()
  }

  function handleSettings() {
    closeMenu()
    onTabChange('settings')
  }

  async function handleSignOut() {
    closeMenu()
    closeDrawer()
    await signOut()
  }

  return (
    <>
      <nav className="nav">
        <span className="nav-brand">Budget</span>

        {/* Desktop: horizontal tab bar */}
        <div className="nav-tabs" role="tablist">
          {TABS.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              className={`nav-tab${activeTab === t.id ? ' active' : ''}`}
              onClick={() => onTabChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Mobile: hamburger button */}
        <button
          className="nav-hamburger"
          onClick={() => setDrawerOpen(o => !o)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
        >
          <span className={`nav-hamburger-icon${drawerOpen ? ' open' : ''}`}>
            <span /><span /><span />
          </span>
        </button>

        {/* User avatar — desktop only */}
        <div className="nav-user" ref={btnRef}>
          <button
            className={`nav-avatar${menuOpen ? ' open' : ''}`}
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Account menu"
            aria-expanded={menuOpen}
          >
            {initial}
          </button>

          {menuOpen && (
            <div className="nav-dropdown fadein" ref={menuRef}>
              <div className="nav-dropdown-email">{user?.email}</div>
              <div className="nav-dropdown-divider" />
              <button className="nav-dropdown-item" onClick={handleSettings}>
                <span className="nav-dropdown-icon">⚙️</span>
                Settings
              </button>
              <button className="nav-dropdown-item nav-dropdown-item-danger" onClick={handleSignOut}>
                <span className="nav-dropdown-icon">↪</span>
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="drawer-backdrop" onClick={closeDrawer} aria-hidden="true" />
      )}
      <div className={`drawer${drawerOpen ? ' drawer-open' : ''}`} role="dialog" aria-label="Navigation">
        {/* Drawer header */}
        <div className="drawer-header">
          <span className="drawer-brand">💵 Budget</span>
          <button className="drawer-close" onClick={closeDrawer} aria-label="Close menu">✕</button>
        </div>

        {/* Drawer email */}
        <div className="drawer-email">{user?.email}</div>

        {/* Nav items */}
        <nav className="drawer-nav">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`drawer-item${activeTab === t.id ? ' active' : ''}`}
              onClick={() => handleTabChange(t.id)}
            >
              <span className="drawer-item-icon">{t.icon}</span>
              <span className="drawer-item-label">{t.label}</span>
              {activeTab === t.id && <span className="drawer-item-dot" />}
            </button>
          ))}
        </nav>

        {/* Drawer footer */}
        <div className="drawer-footer">
          <button className="drawer-item" onClick={() => { handleTabChange('settings') }}>
            <span className="drawer-item-icon">⚙️</span>
            <span className="drawer-item-label">Settings</span>
          </button>
          <button className="drawer-item drawer-item-danger" onClick={handleSignOut}>
            <span className="drawer-item-icon">↪</span>
            <span className="drawer-item-label">Sign out</span>
          </button>
        </div>
      </div>
    </>
  )
}
