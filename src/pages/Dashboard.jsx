import { fmt } from '../lib/format'
import './Dashboard.css'

/** Build a clean disabled-rows summary string with no spacing artifacts */
function buildDisabledNotice(disabledIncome, disabledMonthly, disabledAnnual) {
  const parts = []
  if (disabledIncome  > 0) parts.push(`${disabledIncome} income`)
  if (disabledMonthly > 0) parts.push(`${disabledMonthly} monthly`)
  if (disabledAnnual  > 0) parts.push(`${disabledAnnual} yearly`)
  const total = (disabledIncome || 0) + (disabledMonthly || 0) + (disabledAnnual || 0)
  return `${total} row${total === 1 ? '' : 's'} excluded from totals (${parts.join(', ')}). Enable them in their respective tabs.`
}

export default function Dashboard({ budget, goalsHook }) {
  const { totals, categories, monthly, annual, loading } = budget

  if (loading) {
    return <div className="loading-center"><span className="spinner" /> Loading…</div>
  }

  const {
    budgetedIncome, actualIncome,
    budgetedExpenses, actualExpenses,
    netBudgeted, netActual,
    savingsRateBudgeted, savingsRateActual,
    disabledIncome, disabledMonthly, disabledAnnual,
  } = totals

  const goals        = goalsHook?.goals ?? []
  const goalsLoading = goalsHook?.loading
  const goalsTotals  = goalsHook?.totals ?? { totalMonthly: 0, totalSaved: 0, totalTarget: 0 }

  const activeMonthly = monthly.filter(r => r.enabled !== false)
  const activeAnnual  = annual.filter(r => r.enabled !== false)
  const allExpenses   = [
    ...activeMonthly,
    ...activeAnnual.map(e => ({ ...e, budgeted: e.budgeted / 12, actual: e.actual / 12 })),
  ]

  const catSummary = categories.map(cat => {
    const rows = allExpenses.filter(e => e.category_id === cat.id)
    const bud  = rows.reduce((s, r) => s + (r.budgeted || 0), 0)
    const act  = rows.reduce((s, r) => s + (r.actual   || 0), 0)
    const pct  = bud > 0 ? Math.min(100, Math.round((act / bud) * 100)) : 0
    return { ...cat, bud, act, pct }
  }).filter(c => c.bud > 0 || c.act > 0)

  const totalDisabled = (disabledIncome || 0) + (disabledMonthly || 0) + (disabledAnnual || 0)
  const goalColors    = ['#1a3a6b', '#1a6b3a', '#b8860b', '#4a1a6b', '#0a4a4a']

  return (
    <div className="fadein">
      {/* Summary cards */}
      <div className="summary-grid">
        <SummaryCard label="Monthly Income"   budgeted={budgetedIncome}   actual={actualIncome}   color="var(--green)" />
        <SummaryCard label="Monthly Expenses" budgeted={budgetedExpenses} actual={actualExpenses} color="var(--red)" flip />
        <SummaryCard label="Net Cash Flow"    budgeted={netBudgeted}      actual={netActual}      color={netActual >= 0 ? 'var(--green)' : 'var(--red)'} signed />
        <div className="scard">
          <div className="slabel">Savings / Month</div>
          <div className="sval v-blue">{fmt(goalsTotals.totalMonthly)}</div>
          <div className="ssub">toward your goals</div>
        </div>
      </div>

      {/* Savings rate */}
      <div className="scard" style={{ marginBottom: '1.5rem' }}>
        <div className="slabel">Savings Rate</div>
        <div className="sval" style={{ color: savingsRateActual >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {savingsRateActual}%
        </div>
        <div className="ssub">Budget: {savingsRateBudgeted}%</div>
      </div>

      {/* Category breakdown */}
      <div className="dash-section card" style={{ marginBottom: '1.5rem' }}>
        <div className="sec-hdr">
          <span className="sec-title">Spending by Category</span>
          <span className="sec-hint">Monthly equivalent · enabled rows only</span>
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
                    <span style={{ color: cat.pct > 100 ? 'var(--red)' : 'var(--ink2)' }}>{fmt(cat.act)}</span>
                    <span style={{ color: 'var(--ink3)' }}> / {fmt(cat.bud)}</span>
                  </span>
                </div>
                <div className="prog-bar">
                  <div className="prog-fill" style={{ width: `${cat.pct}%`, background: cat.pct > 100 ? 'var(--red)' : cat.color }} />
                </div>
                <div className="cat-pct" style={{ color: cat.pct > 100 ? 'var(--red)' : 'var(--ink3)' }}>
                  {cat.pct}% of budget
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Savings goals progress */}
      {!goalsLoading && goals.length > 0 && (
        <div className="dash-section card" style={{ marginBottom: '1.5rem' }}>
          <div className="sec-hdr">
            <span className="sec-title">Savings Goals Progress</span>
            <span className="sec-hint">{fmt(goalsTotals.totalSaved)} of {fmt(goalsTotals.totalTarget)} saved</span>
          </div>
          <div className="goal-bars">
            {goals.map((g, i) => {
              const pct = g.target > 0 ? Math.min(100, ((g.saved || 0) / g.target) * 100) : 0
              return (
                <div key={g.id} className="goal-bar-row">
                  <div className="goal-bar-hdr">
                    <span>{g.name}</span>
                    <span className="mono" style={{ fontSize: '.78rem', color: 'var(--ink3)' }}>
                      {fmt(g.saved || 0)} / {fmt(g.target || 0)}
                    </span>
                  </div>
                  <div className="prog-bar">
                    <div className="prog-fill" style={{ width: `${pct}%`, background: goalColors[i % goalColors.length] }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Disabled-rows notice — bottom of page, unobtrusive */}
      {totalDisabled > 0 && (
        <div className="alert alert-info" style={{ fontSize: '.82rem', color: 'var(--ink3)' }}>
          ⚠️ {buildDisabledNotice(disabledIncome, disabledMonthly, disabledAnnual)}
        </div>
      )}
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
