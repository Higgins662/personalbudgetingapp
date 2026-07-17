import { useState, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { fmt } from '../lib/format'
import { normalizePattern } from '../lib/fuzzyMatch'
import GroupedExpenseSelect from '../components/ui/GroupedExpenseSelect'
import './TransactionsPage.css'

const STATUS_OPTIONS = [
  { value: 'all',       label: 'All transactions' },
  { value: 'unmatched', label: 'Unmatched' },
  { value: 'pending',   label: 'Pending (matched, not applied)' },
  { value: 'applied',   label: 'Applied' },
  { value: 'ignored',   label: 'Excluded' },
]

export default function TransactionsPage({ budget, transactions: txHook, periods }) {
  const { user } = useAuth()
  const { monthly, annual, categories } = budget
  const { transactions, bankAccounts, reload: reloadTx } = txHook

  const allExpenses    = [...(monthly ?? []), ...(annual ?? [])]
  const budgetCats     = (categories ?? []).filter(c => !c.is_system)

  // ── Filters ───────────────────────────────────────────────────────────────
  const [filterMonth,  setFilterMonth]  = useState('')
  const [filterBank,   setFilterBank]   = useState('')
  const [filterCat,    setFilterCat]    = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [search,       setSearch]       = useState('')
  const [showPayees,   setShowPayees]   = useState(false)

  // ── Reassignment state ────────────────────────────────────────────────────
  const [reassigning, setReassigning] = useState({}) // { [txId]: true }
  const [error,       setError]       = useState('')

  // ── Available months from transaction dates ───────────────────────────────
  const availableMonths = useMemo(() => {
    const months = new Set()
    for (const tx of transactions) {
      if (tx.date) months.add(tx.date.slice(0, 7))
    }
    return [...months].sort().reverse()
  }, [transactions])

  // ── Filtered transactions ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      if (tx.ignored && filterStatus !== 'ignored' && filterStatus !== 'all') return false
      if (filterMonth && !tx.date?.startsWith(filterMonth)) return false
      if (filterBank  && tx.bank_account_id !== filterBank) return false

      if (filterCat) {
        const item = allExpenses.find(e => e.id === tx.matched_expense_id)
        if (!item || item.category_id !== filterCat) return false
      }

      if (filterStatus !== 'all') {
        if (filterStatus === 'unmatched' && (tx.matched_expense_id || tx.ignored)) return false
        if (filterStatus === 'pending'   && (tx.applied || !tx.matched_expense_id || tx.ignored)) return false
        if (filterStatus === 'applied'   && (!tx.applied || tx.ignored)) return false
        if (filterStatus === 'ignored'   && !tx.ignored) return false
      }

      if (search) {
        const q = search.toLowerCase()
        if (!tx.description?.toLowerCase().includes(q)) return false
      }

      return true
    })
  }, [transactions, filterMonth, filterBank, filterCat, filterStatus, search, allExpenses])

  // ── Payee summary ─────────────────────────────────────────────────────────
  const payeeSummary = useMemo(() => {
    const map = {}
    for (const tx of filtered) {
      if (tx.ignored || tx.amount >= 0) continue
      const key  = normalizePattern(tx.description)
      const item = allExpenses.find(e => e.id === tx.matched_expense_id)
      const cat  = categories?.find(c => c.id === item?.category_id)
      if (!map[key]) map[key] = { description: tx.description, total: 0, count: 0, category: cat?.name ?? '—' }
      map[key].total += Math.abs(tx.amount)
      map[key].count++
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [filtered, allExpenses, categories])

  // ── Reassign a transaction ────────────────────────────────────────────────
  const handleReassign = useCallback(async (txId, newExpenseItemId) => {
    setReassigning(r => ({ ...r, [txId]: true }))
    setError('')

    const { error } = await supabase.rpc('reassign_transaction', {
      p_user_id:             user.id,
      p_tx_id:               txId,
      p_new_expense_item_id: newExpenseItemId || null,
    })

    setReassigning(r => ({ ...r, [txId]: false }))

    if (error) {
      setError(error.message)
    } else {
      reloadTx()
      if (periods) periods.reload()
    }
  }, [user, reloadTx, periods])

  const totalFiltered = filtered.reduce((s, t) => s + (t.amount < 0 ? Math.abs(t.amount) : 0), 0)

  return (
    <div className="fadein">
      <div className="sec-hdr">
        <span className="sec-title">Transactions</span>
        <span className="sec-hint">
          {filtered.length} transaction{filtered.length === 1 ? '' : 's'}
          {totalFiltered > 0 && ` · ${fmt(totalFiltered)} spending`}
        </span>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* ── Filters ── */}
      <div className="tx-filters">
        <input
          className="tx-search"
          placeholder="Search descriptions…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
          <option value="">All months</option>
          {availableMonths.map(m => (
            <option key={m} value={m}>{new Date(m + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</option>
          ))}
        </select>
        <select value={filterBank} onChange={e => setFilterBank(e.target.value)}>
          <option value="">All accounts</option>
          {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">All categories</option>
          {budgetCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* ── Transaction list ── */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🧾</div>
          <div className="empty-state-title">No transactions match your filters</div>
          <div className="empty-state-body">Try adjusting the filters above.</div>
        </div>
      ) : (
        <div className="tbl-wrap">
          <table className="tx-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Account</th>
                <th className="r">Amount</th>
                <th>Category / Budget Item</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(tx => {
                const matched = allExpenses.find(e => e.id === tx.matched_expense_id)
                const cat     = categories?.find(c => c.id === matched?.category_id)
                const acct    = bankAccounts.find(b => b.id === tx.bank_account_id)
                const busy    = reassigning[tx.id]

                return (
                  <tr key={tx.id} className={tx.ignored ? 'tx-row-ignored' : tx.applied ? 'tx-row-applied' : ''}>
                    <td className="mono tx-date">{tx.date}</td>
                    <td className="tx-desc">{tx.description}</td>
                    <td className="tx-acct">{acct?.name ?? '—'}</td>
                    <td className={`r mono ${tx.amount < 0 ? 'v-red' : 'v-green'}`}>
                      {fmt(tx.amount)}
                    </td>
                    <td className="tx-cat">
                      {tx.ignored ? (
                        <span className="tx-status-badge ignored">Excluded</span>
                      ) : busy ? (
                        <span className="spinner" style={{ width: 14, height: 14 }} />
                      ) : (
                        <GroupedExpenseSelect
                          allExpenses={allExpenses}
                          categories={budgetCats}
                          value={tx.matched_expense_id ?? ''}
                          onChange={id => handleReassign(tx.id, id)}
                          placeholder="Assign to budget item…"
                        />
                      )}
                      {cat && !tx.ignored && (
                        <span className="tx-cat-name" style={{ color: cat.color }}>
                          {cat.name}
                        </span>
                      )}
                    </td>
                    <td>
                      {tx.ignored
                        ? <span className="tx-status-badge ignored">excluded</span>
                        : tx.applied
                          ? <span className="tx-status-badge applied">applied</span>
                          : tx.matched_expense_id
                            ? <span className="tx-status-badge pending">pending</span>
                            : <span className="tx-status-badge unmatched">unmatched</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Payee summary ── */}
      <div className="tx-payee-section">
        <button
          className="tx-payee-toggle"
          onClick={() => setShowPayees(v => !v)}
        >
          {showPayees ? '▲' : '▼'} Spending by payee
          <span className="tx-payee-count">{payeeSummary.length}</span>
        </button>

        {showPayees && (
          <div className="tbl-wrap fadein" style={{ marginTop: '.75rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Payee</th>
                  <th>Category</th>
                  <th className="r">Transactions</th>
                  <th className="r">Total Spent</th>
                </tr>
              </thead>
              <tbody>
                {payeeSummary.map((p, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: '.85rem' }}>{p.description}</td>
                    <td style={{ fontSize: '.82rem', color: 'var(--ink3)' }}>{p.category}</td>
                    <td className="r mono" style={{ fontSize: '.82rem' }}>{p.count}</td>
                    <td className="r mono v-red">{fmt(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
