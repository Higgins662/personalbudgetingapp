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

      <div className="nav-right">
        <span className="nav-email">{user?.email}</span>
        <button className="nav-signout" onClick={signOut} title="Sign out">↪</button>
      </div>
    </nav>
  )
}
