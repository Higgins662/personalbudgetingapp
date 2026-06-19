import { useState } from 'react'
import Nav from '../components/layout/Nav'
import Dashboard from './Dashboard'
import IncomePage from './IncomePage'
import MonthlyPage from './MonthlyPage'
import AnnualPage from './AnnualPage'
import GoalsPage from './GoalsPage'
import CategoriesPage from './CategoriesPage'
import ReconcilePage from './ReconcilePage'
import PayeesPage from './PayeesPage'
import { useBudget } from '../hooks/useBudget'
import { useTransactions } from '../hooks/useTransactions'
import { useGoals } from '../hooks/useGoals'

export default function AppShell() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const budget       = useBudget()
  const transactions = useTransactions()
  const goalsHook     = useGoals()

  function renderTab() {
    switch (activeTab) {
      case 'dashboard':  return <Dashboard  budget={budget} goalsHook={goalsHook} />
      case 'income':     return <IncomePage budget={budget} />
      case 'monthly':    return <MonthlyPage budget={budget} />
      case 'annual':     return <AnnualPage  budget={budget} />
      case 'goals':      return <GoalsPage goalsHook={goalsHook} />
      case 'categories': return <CategoriesPage budget={budget} />
      case 'reconcile':  return <ReconcilePage budget={budget} transactions={transactions} />
      case 'payees':     return <PayeesPage transactions={transactions} />
      default:           return <Dashboard budget={budget} />
    }
  }

  return (
    <>
      <Nav activeTab={activeTab} onTabChange={setActiveTab} />
      <main>{renderTab()}</main>
    </>
  )
}
