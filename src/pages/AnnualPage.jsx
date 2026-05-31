import BudgetTable from '../components/ui/BudgetTable'
import { fmt } from '../lib/format'

export default function AnnualPage({ budget }) {
  const { annual, categories, updateAnnual, addAnnual, deleteAnnual, totals, loading } = budget

  if (loading) return <div className="loading-center"><span className="spinner" /> Loading…</div>

  const monthlyEquiv = totals.budgetedAnnual / 12

  return (
    <div className="fadein">
      <div className="sec-hdr">
        <span className="sec-title">Annual Expenses</span>
        <span className="sec-hint">
          Total: <strong className="mono">{fmt(totals.budgetedAnnual)}</strong>
          &nbsp;·&nbsp;
          Monthly equiv: <strong className="mono">{fmt(monthlyEquiv)}</strong>
        </span>
      </div>

      <div className="alert alert-info" style={{ marginBottom: '1rem', fontSize: '.83rem' }}>
        Annual expenses are divided by 12 and included in your monthly budget totals.
      </div>

      <div className="tbl-wrap">
        <BudgetTable
          rows={annual}
          categories={categories}
          onUpdate={updateAnnual}
          onAdd={addAnnual}
          onDelete={deleteAnnual}
          addLabel="+ Add annual expense"
          emptyMessage="No annual expenses yet."
        />
      </div>
    </div>
  )
}
