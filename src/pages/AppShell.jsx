import { useState } from 'react'
import Nav from '../components/layout/Nav'
import Dashboard from './Dashboard'
import IncomePage from './IncomePage'
import MonthlyPage from './MonthlyPage'
import AnnualPage from './AnnualPage'
import CategoriesPage from './CategoriesPage'
import ReconcilePage from './ReconcilePage'
import PayeesPage from './PayeesPage'
import { useBudget } from '../hooks/useBudget'
import { useTransactions } from '../hooks/useTransactions'

export default function AppShell() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const budget       = useBudget()
  const transactions = useTransactions()

  function renderTab() {
    switch (activeTab) {
      case 'dashboard':  return <Dashboard  budget={budget} />
      case 'income':     return <IncomePage budget={budget} />
      case 'monthly':    return <MonthlyPage budget={budget} />
      case 'annual':     return <AnnualPage  budget={budget} />
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
