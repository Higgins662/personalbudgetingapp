import BudgetTable from '../components/ui/BudgetTable'
import { MonthSelector } from '../components/ui/PeriodSelector'
import { fmt } from '../lib/format'

export default function MonthlyPage({ budget, transactions, periods }) {
  const { monthly, categories, updateMonthly, addMonthly, deleteMonthly, totals, loading } = budget
  const bankAccounts = transactions?.bankAccounts ?? []

  if (loading) return <div className="loading-center"><span className="spinner" /> Loading…</div>

  return (
    <div className="fadein">
      <div className="sec-hdr">
        <span className="sec-title">Monthly Expenses</span>
        <span className="sec-hint">
          Budgeted: <strong className="mono">{fmt(totals.budgetedMonthly)}</strong>
          &nbsp;·&nbsp;
          Actual: <strong className="mono v-red">{fmt(totals.actualMonthly)}</strong>
        </span>
      </div>

      {periods && <MonthSelector periods={periods} />}

      {bankAccounts.length === 0 && (
        <div className="alert alert-info" style={{ marginBottom: '1rem', fontSize: '.83rem' }}>
          Add a bank account in <strong>Reconcile</strong> to assign payment methods to your expenses.
        </div>
      )}

      <div className="tbl-wrap">
        <BudgetTable
          rows={monthly}
          categories={categories}
          bankAccounts={bankAccounts}
          onUpdate={updateMonthly}
          onAdd={addMonthly}
          onDelete={deleteMonthly}
          showPaymentMethod
          addLabel="+ Add monthly expense"
          emptyMessage="No monthly expenses yet. Add one below."
        />
      </div>
    </div>
  )
}
