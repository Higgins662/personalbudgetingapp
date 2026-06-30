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
import SettingsPage from './SettingsPage'
import { useBudget } from '../hooks/useBudget'
import { useTransactions } from '../hooks/useTransactions'
import { useGoals } from '../hooks/useGoals'
import { usePeriods } from '../hooks/usePeriods'

export default function AppShell() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const periods      = usePeriods()
  const budget        = useBudget(periods)
  const transactions = useTransactions()
  const goalsHook    = useGoals()

  function renderTab() {
    switch (activeTab) {
      case 'dashboard':  return <Dashboard     budget={budget} goalsHook={goalsHook} periods={periods} />
      case 'income':     return <IncomePage    budget={budget} transactions={transactions} periods={periods} />
      case 'monthly':    return <MonthlyPage   budget={budget} transactions={transactions} periods={periods} />
      case 'annual':     return <AnnualPage    budget={budget} transactions={transactions} periods={periods} />
      case 'goals':      return <GoalsPage     goalsHook={goalsHook} />
      case 'categories': return <CategoriesPage budget={budget} />
      case 'reconcile':  return <ReconcilePage budget={budget} transactions={transactions} periods={periods} />
      case 'payees':     return <PayeesPage    transactions={transactions} />
      case 'settings':   return <SettingsPage />
      default:           return <Dashboard     budget={budget} goalsHook={goalsHook} periods={periods} />
    }
  }

  return (
    <>
      <Nav activeTab={activeTab} onTabChange={setActiveTab} />
      <main>{renderTab()}</main>
    </>
  )
}
