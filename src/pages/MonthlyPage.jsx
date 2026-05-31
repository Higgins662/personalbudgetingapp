import BudgetTable from '../components/ui/BudgetTable'
import { fmt } from '../lib/format'

export default function MonthlyPage({ budget }) {
  const { monthly, categories, updateMonthly, addMonthly, deleteMonthly, totals, loading } = budget

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

      <div className="tbl-wrap">
        <BudgetTable
          rows={monthly}
          categories={categories}
          onUpdate={updateMonthly}
          onAdd={addMonthly}
          onDelete={deleteMonthly}
          addLabel="+ Add monthly expense"
          emptyMessage="No monthly expenses yet. Add one below."
        />
      </div>
    </div>
  )
}
