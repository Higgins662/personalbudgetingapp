import BudgetTable from '../components/ui/BudgetTable'
import { YearSelector } from '../components/ui/PeriodSelector'
import { fmt } from '../lib/format'

export default function AnnualPage({ budget, transactions, periods }) {
  const { annual, categories, updateAnnual, addAnnual, deleteAnnual, totals, loading } = budget
  const bankAccounts = transactions?.bankAccounts ?? []

  if (loading) return <div className="loading-center"><span className="spinner" /> Loading…</div>

  const monthlyEquiv = totals.budgetedAnnual / 12

  return (
    <div className="fadein">
      <div className="sec-hdr">
        <span className="sec-title">Yearly Subscriptions</span>
        <span className="sec-hint">
          Total: <strong className="mono">{fmt(totals.budgetedAnnual)}</strong>
          &nbsp;·&nbsp;
          Monthly equiv: <strong className="mono">{fmt(monthlyEquiv)}</strong>
        </span>
      </div>

      {periods && <YearSelector periods={periods} />}

      <div className="alert alert-info" style={{ marginBottom: '1rem', fontSize: '.83rem' }}>
        Annual expenses are divided by 12 and included in your monthly budget totals.
      </div>

      {bankAccounts.length === 0 && (
        <div className="alert alert-info" style={{ marginBottom: '1rem', fontSize: '.83rem' }}>
          Add a bank account in <strong>Reconcile</strong> to assign payment methods to your annual expenses.
        </div>
      )}

      <div className="tbl-wrap">
        <BudgetTable
          rows={annual}
          categories={categories}
          bankAccounts={bankAccounts}
          onUpdate={updateAnnual}
          onAdd={addAnnual}
          onDelete={deleteAnnual}
          showFrequency
          addLabel="+ Add annual expense"
          emptyMessage="No annual expenses yet."
        />
      </div>
    </div>
  )
}
