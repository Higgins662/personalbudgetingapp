import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import './Nav.css'

const TABS = [
  { id: 'dashboard',  label: 'Dashboard' },
  { id: 'income',     label: 'Income' },
  { id: 'monthly',    label: 'Monthly Expenses' },
  { id: 'annual',     label: 'Yearly Subscriptions' },
  { id: 'goals',      label: 'Savings Goals' },
  { id: 'categories', label: 'Categories & Colors' },
  { id: 'reconcile',  label: '🔄 Reconcile' },
  { id: 'payees',     label: 'Payees' },
]

export default function Nav({ activeTab, onTabChange }) {
  const { signOut, user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef   = useRef(null)
  const btnRef    = useRef(null)

  const closeMenu = useCallback(() => setMenuOpen(false), [])

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e) {
      if (
        menuRef.current  && !menuRef.current.contains(e.target) &&
        btnRef.current   && !btnRef.current.contains(e.target)
      ) closeMenu()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen, closeMenu])

  // First letter of email for the avatar
  const initial = user?.email?.[0]?.toUpperCase() ?? '?'

  function handleSettings() {
    closeMenu()
    onTabChange('settings')
  }

  async function handleSignOut() {
    closeMenu()
    await signOut()
  }

  return (
    <nav className="nav">
      <span className="nav-brand">Budget</span>

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

      {/* User menu */}
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
  )
}
