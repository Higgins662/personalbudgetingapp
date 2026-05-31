import { fmt } from '../lib/format'
import './Dashboard.css'

export default function Dashboard({ budget }) {
  const { totals, categories, monthly, annual, loading } = budget

  if (loading) {
    return <div className="loading-center"><span className="spinner" /> Loading…</div>
  }

  const {
    budgetedIncome, actualIncome,
    budgetedExpenses, actualExpenses,
    netBudgeted, netActual,
    savingsRateBudgeted, savingsRateActual,
  } = totals

  // Build per-category spending summary
  const allExpenses = [...monthly, ...annual.map(e => ({ ...e, budgeted: e.budgeted / 12, actual: e.actual / 12 }))]
  const catSummary  = categories.filter(c => c.enabled).map(cat => {
    const rows    = allExpenses.filter(e => e.category_id === cat.id)
    const bud     = rows.reduce((s, r) => s + (r.budgeted || 0), 0)
    const act     = rows.reduce((s, r) => s + (r.actual   || 0), 0)
    const pct     = bud > 0 ? Math.min(100, Math.round((act / bud) * 100)) : 0
    return { ...cat, bud, act, pct, count: rows.length }
  }).filter(c => c.bud > 0 || c.act > 0)

  return (
    <div className="fadein">
      {/* Summary cards */}
      <div className="summary-grid">
        <SummaryCard
          label="Monthly Income"
          budgeted={budgetedIncome}
          actual={actualIncome}
          color="var(--green)"
        />
        <SummaryCard
          label="Monthly Expenses"
          budgeted={budgetedExpenses}
          actual={actualExpenses}
          color="var(--red)"
          flip
        />
        <SummaryCard
          label="Net Cash Flow"
          budgeted={netBudgeted}
          actual={netActual}
          color={netActual >= 0 ? 'var(--green)' : 'var(--red)'}
          signed
        />
        <div className="scard">
          <div className="slabel">Savings Rate</div>
          <div className="sval" style={{ color: savingsRateActual >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {savingsRateActual}%
          </div>
          <div className="ssub">Budget: {savingsRateBudgeted}%</div>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="dash-section card">
        <div className="sec-hdr">
          <span className="sec-title">Spending by Category</span>
          <span className="sec-hint">Monthly equivalent</span>
        </div>
        {catSummary.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <div className="empty-state-title">No category data yet</div>
            <div className="empty-state-body">Add expenses and assign categories to see a breakdown here.</div>
          </div>
        ) : (
          <div className="cat-grid">
            {catSummary.map(cat => (
              <div key={cat.id} className="cat-row">
                <div className="cat-row-hdr">
                  <span className="cat-dot" style={{ background: cat.color }} />
                  <span className="cat-name">{cat.name}</span>
                  <span className="cat-amounts mono">
                    <span style={{ color: cat.pct > 100 ? 'var(--red)' : 'var(--ink2)' }}>
                      {fmt(cat.act)}
                    </span>
                    <span style={{ color: 'var(--ink3)' }}> / {fmt(cat.bud)}</span>
                  </span>
                </div>
                <div className="prog-bar">
                  <div
                    className="prog-fill"
                    style={{
                      width: `${cat.pct}%`,
                      background: cat.pct > 100 ? 'var(--red)' : cat.color,
                    }}
                  />
                </div>
                <div className="cat-pct" style={{ color: cat.pct > 100 ? 'var(--red)' : 'var(--ink3)' }}>
                  {cat.pct}% of budget
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, budgeted, actual, color, flip = false, signed = false }) {
  return (
    <div className="scard">
      <div className="slabel">{label}</div>
      <div className="sval" style={{ color }}>
        {signed && actual > 0 ? '+' : ''}{fmt(actual)}
      </div>
      <div className="ssub">
        Budget: {signed && budgeted > 0 ? '+' : ''}{fmt(budgeted)}
        {!signed && (
          <span style={{ marginLeft: '.5rem', color: flip
            ? (actual <= budgeted ? 'var(--green)' : 'var(--red)')
            : (actual >= budgeted ? 'var(--green)' : 'var(--red)')
          }}>
            {flip
              ? (actual <= budgeted ? '✓ under' : '↑ over')
              : (actual >= budgeted ? '✓ on track' : '↓ under')}
          </span>
        )}
      </div>
    </div>
  )
}
