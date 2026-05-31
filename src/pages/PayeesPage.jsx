import { fmt } from '../lib/format'
import './PayeesPage.css'

export default function PayeesPage({ transactions: txHook }) {
  const { getPayees, transactions, loading } = txHook

  if (loading) return <div className="loading-center"><span className="spinner" /> Loading…</div>

  const payees = getPayees()

  if (!transactions.length) {
    return (
      <div className="fadein">
        <div className="sec-hdr">
          <span className="sec-title">Payees</span>
        </div>
        <div className="empty-state card" style={{ padding: '3rem' }}>
          <div className="empty-state-icon">🏪</div>
          <div className="empty-state-title">No payees yet</div>
          <div className="empty-state-body">
            Import a bank statement in the <strong>Reconcile</strong> tab to see your debit payees here.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fadein">
      <div className="sec-hdr">
        <span className="sec-title">Payees</span>
        <span className="sec-hint">{payees.length} unique debit payees</span>
      </div>

      <div className="alert alert-info" style={{ marginBottom: '1.25rem', fontSize: '.83rem' }}>
        Bank connections coming soon — you'll be able to auto-download transactions per payee.
      </div>

      {/* Desktop table */}
      <div className="tbl-wrap payee-tbl-desktop">
        <table>
          <thead>
            <tr>
              <th>Payee</th>
              <th className="r">Transactions</th>
              <th className="r">Total Spent</th>
              <th className="r">Avg / Month</th>
              <th className="r">Matched</th>
              <th style={{ width: 120 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {payees.map((p, i) => (
              <tr key={i}>
                <td>
                  <div className="payee-name">{p.description}</div>
                </td>
                <td className="r mono" style={{ color: 'var(--ink3)', fontSize: '.8rem' }}>{p.count}</td>
                <td className="r amnt-r">{fmt(p.total)}</td>
                <td className="r mono" style={{ fontSize: '.85rem' }}>
                  {fmt(p.total / Math.max(1, estimateMonths(transactions)))}
                </td>
                <td className="r">
                  {p.matched > 0
                    ? <span style={{ color: 'var(--green)', fontSize: '.8rem' }}>✓ {p.matched}</span>
                    : <span style={{ color: 'var(--ink3)', fontSize: '.8rem' }}>—</span>}
                </td>
                <td>
                  <button
                    className="btn-connect"
                    disabled
                    title="Bank connections coming soon"
                  >
                    Connect (soon)
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="payee-mobile">
        {payees.map((p, i) => (
          <div key={i} className="payee-mob-row card">
            <div className="payee-mob-top">
              <span className="payee-name">{p.description}</span>
              <span className="amnt-r">{fmt(p.total)}</span>
            </div>
            <div className="payee-mob-sub">
              <span>{p.count} transactions</span>
              {p.matched > 0 && <span style={{ color: 'var(--green)' }}>✓ {p.matched} matched</span>}
              <button className="btn-connect" disabled title="Coming soon">Connect (soon)</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Estimate the number of months spanned by the transactions */
function estimateMonths(transactions) {
  if (!transactions.length) return 1
  const debits = transactions.filter(t => t.amount < 0 && t.date)
  if (!debits.length) return 1
  const dates = debits.map(t => new Date(t.date)).sort((a, b) => a - b)
  const diff = (dates.at(-1) - dates[0]) / (1000 * 60 * 60 * 24 * 30)
  return Math.max(1, Math.round(diff))
}
