import BudgetTable from '../components/ui/BudgetTable'
import { MonthSelector } from '../components/ui/PeriodSelector'
import { fmt } from '../lib/format'

export default function IncomePage({ budget, transactions, periods }) {
  const { income, categories, updateIncome, addIncome, deleteIncome, totals, loading } = budget
  const bankAccounts = transactions?.bankAccounts ?? []

  if (loading) return <div className="loading-center"><span className="spinner" /> Loading…</div>

  return (
    <div className="fadein">
      <div className="sec-hdr">
        <span className="sec-title">Income</span>
        <span className="sec-hint">
          Budgeted: <strong className="mono">{fmt(totals.budgetedIncome)}</strong>
          &nbsp;·&nbsp;
          Actual: <strong className="mono v-green">{fmt(totals.actualIncome)}</strong>
        </span>
      </div>

      {periods && <MonthSelector periods={periods} />}

      {bankAccounts.length === 0 && (
        <div className="alert alert-info" style={{ marginBottom: '1rem', fontSize: '.83rem' }}>
          Add a bank account in <strong>Reconcile</strong> to track which account each income source deposits into.
        </div>
      )}

      <div className="tbl-wrap">
        <BudgetTable
          rows={income}
          categories={categories}
          bankAccounts={bankAccounts}
          onUpdate={updateIncome}
          onAdd={addIncome}
          onDelete={deleteIncome}
          showCategory={false}
          showPaymentMethod
          paymentMethodLabel="Deposit Account"
          isIncome
          addLabel="+ Add income source"
          emptyMessage="No income sources yet. Add one below."
        />
      </div>
    </div>
  )
}
