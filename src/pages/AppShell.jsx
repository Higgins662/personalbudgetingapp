import { Component, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Nav, { TABS } from '../components/layout/Nav'
import Dashboard from './Dashboard'
import IncomePage from './IncomePage'
import MonthlyPage from './MonthlyPage'
import AnnualPage from './AnnualPage'
import GoalsPage from './GoalsPage'
import CategoriesPage from './CategoriesPage'
import TransactionsPage from './TransactionsPage'
import ReportsPage from './ReportsPage'
import SettingsPage from './SettingsPage'
import { useBudget } from '../hooks/useBudget'
import { useTransactions } from '../hooks/useTransactions'
import { useGoals } from '../hooks/useGoals'
import { usePeriods } from '../hooks/usePeriods'

class TabErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(e, info) { console.error('Tab render error:', e, info) }
  render() {
    if (this.state.hasError) {
      return (
        <div className="empty-state">
          <div className="empty-state-icon">⚠️</div>
          <div className="empty-state-title">Something went wrong on this page</div>
          <div className="empty-state-body">
            Try refreshing the page. If this keeps happening, use the thumbs-down
            button to send feedback so we can take a look.
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function AppShell() {
  // Active tab lives in the URL (?tab=...) instead of local state, so every
  // tab switch creates a real browser history entry — Back/Forward move
  // between previously-viewed tabs instead of leaving the app entirely.
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'dashboard'
  function setActiveTab(tab) {
    setSearchParams(tab === 'dashboard' ? {} : { tab })
  }

  useEffect(() => {
    const tabLabel = activeTab === 'settings'
      ? 'Settings'
      : TABS.find(t => t.id === activeTab)?.label
    document.title = tabLabel ? `${tabLabel} · Budget` : 'Budget'
  }, [activeTab])

  const periods      = usePeriods()
  const budget       = useBudget(periods)
  const transactions = useTransactions()
  const goalsHook    = useGoals()

  function renderTab() {
    switch (activeTab) {
      case 'dashboard':  return <Dashboard     budget={budget} goalsHook={goalsHook} periods={periods} onTabChange={setActiveTab} />
      case 'income':     return <IncomePage    budget={budget} transactions={transactions} periods={periods} />
      case 'monthly':    return <MonthlyPage   budget={budget} transactions={transactions} periods={periods} />
      case 'annual':     return <AnnualPage    budget={budget} transactions={transactions} periods={periods} />
      case 'goals':      return <GoalsPage     goalsHook={goalsHook} />
      case 'categories': return <CategoriesPage budget={budget} />
      case 'transactions': return <TransactionsPage budget={budget} transactions={transactions} periods={periods} />
      case 'reports':    return <ReportsPage    budget={budget} periods={periods} />
      case 'settings':   return <SettingsPage />
      default:           return <Dashboard     budget={budget} goalsHook={goalsHook} periods={periods} onTabChange={setActiveTab} />
    }
  }

  return (
    <>
      <Nav activeTab={activeTab} onTabChange={setActiveTab} />
      <main><TabErrorBoundary key={activeTab}>{renderTab()}</TabErrorBoundary></main>
    </>
  )
}
