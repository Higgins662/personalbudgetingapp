import { useState, Component } from 'react'
import Nav from '../components/layout/Nav'
import Dashboard from './Dashboard'
import IncomePage from './IncomePage'
import MonthlyPage from './MonthlyPage'
import AnnualPage from './AnnualPage'
import GoalsPage from './GoalsPage'
import CategoriesPage from './CategoriesPage'
import ReconcilePage from './ReconcilePage'
import TransactionsPage from './TransactionsPage'
import SettingsPage from './SettingsPage'
import { useBudget } from '../hooks/useBudget'
import { useTransactions } from '../hooks/useTransactions'
import { useGoals } from '../hooks/useGoals'
import { usePeriods } from '../hooks/usePeriods'

class TabErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  componentDidCatch(e, info) { console.error('Tab render error:', e, info) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', color: 'var(--red)' }}>
          <strong>Something went wrong on this page.</strong>
          <pre style={{ marginTop: '1rem', fontSize: '.8rem', whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

export default function AppShell() {
  const [activeTab, setActiveTab] = useState('dashboard')
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
      case 'reconcile':  return <ReconcilePage budget={budget} transactions={transactions} periods={periods} onTabChange={setActiveTab} />
      case 'transactions': return <TransactionsPage budget={budget} transactions={transactions} periods={periods} />
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
