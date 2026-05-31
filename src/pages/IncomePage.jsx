import BudgetTable from '../components/ui/BudgetTable'
import { fmt } from '../lib/format'

export default function IncomePage({ budget }) {
  const { income, categories, updateIncome, addIncome, deleteIncome, totals, loading } = budget

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

      <div className="tbl-wrap">
        <BudgetTable
          rows={income}
          categories={categories}
          onUpdate={updateIncome}
          onAdd={addIncome}
          onDelete={deleteIncome}
          showCategory={false}
          isIncome
          addLabel="+ Add income source"
          emptyMessage="No income sources yet. Add one below."
        />
      </div>
    </div>
  )
}
