import { useState, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { usePayeeRules } from '../hooks/usePayeeRules'
import { useGlobalPatterns } from '../hooks/useGlobalPatterns'
import { useReset } from '../hooks/useReset'
import { fmt } from '../lib/format'
import { normalizePattern } from '../lib/fuzzyMatch'
import { isTransferOrPayment } from '../lib/transferDetection'
import { promoteToAnnual, demoteAnnualItem } from '../lib/annualConversion'
import GroupedExpenseSelect from '../components/ui/GroupedExpenseSelect'
import ImportWizard from '../components/transactions/ImportWizard'
import ClearMonthModal from '../components/ui/ClearMonthModal'
import './TransactionsPage.css'

export default function TransactionsPage({ budget, transactions: txHook, periods }) {
  const { user } = useAuth()
  const { monthly, annual, categories, reload: reloadBudget } = budget
  const { transactions, bankAccounts, reload: reloadTx } = txHook
  const { learnRule }  = usePayeeRules()
  const { contribute } = useGlobalPatterns()

  const allExpenses = [...(monthly ?? []), ...(annual ?? [])]
  const budgetCats  = (categories ?? [])
    .filter(c => !c.is_system)
    .filter((c, i, arr) => arr.findIndex(x => x.name === c.name) === i)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showImport,     setShowImport]     = useState(false)
  const [showMenu,       setShowMenu]       = useState(false)
  const [showClearModal, setShowClearModal] = useState(false)
  const [showPayees,     setShowPayees]     = useState(false)
  const [applying,       setApplying]       = useState(false)
  const [error,          setError]          = useState('')
  const [busy,           setBusy]           = useState({}) // { [txId]: true }

  // ── Filters ───────────────────────────────────────────────────────────────
  const [chip,        setChip]        = useState('auto') // auto → review if any, else all
  const [filterMonth, setFilterMonth] = useState('')
  const [filterBank,  setFilterBank]  = useState('')
  const [filterCat,   setFilterCat]   = useState('')
  const [search,      setSearch]      = useState('')

  const { clearMonth, clearingMonth, clearMonthError } = useReset({
    onMonthCleared: () => {
      setShowClearModal(false)
      reloadBudget(); reloadTx(); if (periods) periods.reload()
    },
  })

  // ── Status sets ───────────────────────────────────────────────────────────
  const isReviewable = useCallback(t =>
    !t.ignored && t.amount < 0 && !isTransferOrPayment(t.description) && !t.applied,
    [])

  const reviewCount = useMemo(() => transactions.filter(isReviewable).length, [transactions, isReviewable])
  const unappliedMatched = useMemo(() =>
    transactions.filter(t => isReviewable(t) && t.matched_expense_id),
    [transactions, isReviewable])

  const activeChip = chip === 'auto' ? (reviewCount > 0 ? 'review' : 'all') : chip

  // ── Filtered list ─────────────────────────────────────────────────────────
  const availableMonths = useMemo(() => {
    const months = new Set()
    for (const tx of transactions) if (tx.date) months.add(tx.date.slice(0, 7))
    return [...months].sort().reverse()
  }, [transactions])

  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      if (activeChip === 'review'   && !isReviewable(tx)) return false
      if (activeChip === 'applied'  && (!tx.applied || tx.ignored)) return false
      if (activeChip === 'excluded' && !tx.ignored) return false
      if (activeChip === 'all'      && tx.ignored) return false

      if (filterMonth && !tx.date?.startsWith(filterMonth)) return false
      if (filterBank  && tx.bank_account_id !== filterBank) return false
      if (filterCat) {
        const item = allExpenses.find(e => e.id === tx.matched_expense_id)
        if (!item || item.category_id !== filterCat) return false
      }
      if (search && !tx.description?.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [transactions, activeChip, filterMonth, filterBank, filterCat, search, allExpenses, isReviewable])

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

  // ── Shared reload after any accounting change ─────────────────────────────
  const refreshAll = useCallback(() => {
    reloadTx(); reloadBudget(); if (periods) periods.reload()
  }, [reloadTx, reloadBudget, periods])

  // ── Row actions ───────────────────────────────────────────────────────────
  const setRowBusy = (id, v) => setBusy(b => ({ ...b, [id]: v }))

  const handleReassign = useCallback(async (tx, newExpenseItemId) => {
    setRowBusy(tx.id, true); setError('')
    const { error } = await supabase.rpc('reassign_transaction', {
      p_user_id:             user.id,
      p_tx_id:               tx.id,
      p_new_expense_item_id: newExpenseItemId || null,
    })
    if (error) setError(error.message)
    else {
      if (newExpenseItemId) {
        learnRule(tx.description, newExpenseItemId)
        const expItem = allExpenses.find(e => e.id === newExpenseItemId)
        const cat = categories.find(c => c.id === expItem?.category_id)
        if (cat && !cat.is_system) contribute(tx.description, cat.name)
      }
      refreshAll()
    }
    setRowBusy(tx.id, false)
  }, [user, allExpenses, categories, learnRule, contribute, refreshAll])

  const handleYearlyToggle = useCallback(async (tx, matchedItem) => {
    if (!matchedItem) return
    setRowBusy(tx.id, true); setError('')
    if (matchedItem.frequency === 'annual') {
      // Yearly → monthly: fold all this item's transactions back into the category
      const { error } = await demoteAnnualItem(user.id, matchedItem.id)
      if (error) setError(error.message)
    } else {
      // Monthly → yearly: dedicated annual item for this payee
      const newItemId = await promoteToAnnual(tx, matchedItem.id)
      if (newItemId) learnRule(tx.description, newItemId)
      else setError('Could not convert to yearly')
    }
    refreshAll()
    setRowBusy(tx.id, false)
  }, [user, learnRule, refreshAll])

  const handleIgnore = useCallback(async (txId, currentlyIgnored) => {
    setRowBusy(txId, true)
    await supabase
      .from('transactions')
      .update({ ignored: !currentlyIgnored, applied: false })
      .eq('id', txId).eq('user_id', user.id)
    refreshAll()
    setRowBusy(txId, false)
  }, [user, refreshAll])

  const handleUnapply = useCallback(async (tx) => {
    setRowBusy(tx.id, true)
    const keepItemId = tx.matched_expense_id
    const { error } = await supabase.rpc('reassign_transaction', {
      p_user_id: user.id, p_tx_id: tx.id, p_new_expense_item_id: null,
    })
    if (!error && keepItemId) {
      await supabase
        .from('transactions')
        .update({ matched_expense_id: keepItemId, applied: false })
        .eq('id', tx.id)
    }
    refreshAll()
    setRowBusy(tx.id, false)
  }, [user, refreshAll])

  const handleBatchApply = useCallback(async () => {
    setApplying(true); setError('')
    const { error } = await supabase.rpc('apply_transactions_to_budget', { p_user_id: user.id })
    if (error) setError(error.message)
    refreshAll()
    setApplying(false)
  }, [user, refreshAll])

  const totalFiltered = filtered.reduce((s, t) => s + (t.amount < 0 ? Math.abs(t.amount) : 0), 0)

  // ── Import mode takes over the whole tab ──────────────────────────────────
  if (showImport) {
    return (
      <ImportWizard
        budget={budget}
        transactions={txHook}
        periods={periods}
        onClose={() => { setShowImport(false); refreshAll() }}
      />
    )
  }

  return (
    <div className="fadein">
      <div className="sec-hdr" style={{ flexWrap: 'wrap', gap: '.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
          <span className="sec-title">Transactions</span>
          <span className="sec-hint">
            {filtered.length} shown{totalFiltered > 0 && ` · ${fmt(totalFiltered)} spending`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <button className="btn btn-p" style={{ fontSize: '.82rem' }} onClick={() => setShowImport(true)}>
            ⬆ Import statement
          </button>
          <div className="tx-menu-wrap">
            <button className="btn btn-g tx-menu-btn" onClick={() => setShowMenu(v => !v)}>⋯</button>
            {showMenu && (
              <div className="tx-menu fadein">
                <button onClick={() => { setShowMenu(false); setShowClearModal(true) }}>
                  🗑 Clear this month's transactions
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* Needs-review banner + batch apply */}
      {reviewCount > 0 && activeChip !== 'review' && (
        <div className="tx-review-banner" onClick={() => setChip('review')}>
          ⏳ <strong>{reviewCount}</strong> transaction{reviewCount === 1 ? '' : 's'} need{reviewCount === 1 ? 's' : ''} review — click to see them
        </div>
      )}
      {activeChip === 'review' && unappliedMatched.length > 0 && (
        <div className="tx-batch-apply">
          <span>{unappliedMatched.length} matched and ready</span>
          <button className="btn btn-p" style={{ fontSize: '.82rem' }} onClick={handleBatchApply} disabled={applying}>
            {applying
              ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Updating…</>
              : `✓ Update my budget with ${unappliedMatched.length} transaction${unappliedMatched.length === 1 ? '' : 's'}`}
          </button>
        </div>
      )}

      {/* Status chips */}
      <div className="tx-chips">
        {[
          { id: 'all',      label: 'All' },
          { id: 'review',   label: `Needs review${reviewCount ? ` (${reviewCount})` : ''}` },
          { id: 'applied',  label: 'Applied' },
          { id: 'excluded', label: 'Excluded' },
        ].map(c => (
          <button
            key={c.id}
            className={`tx-chip${activeChip === c.id ? ' active' : ''}`}
            onClick={() => setChip(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Filters */}
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
      </div>

      {/* Ledger */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">{activeChip === 'review' ? '✅' : '🧾'}</div>
          <div className="empty-state-title">
            {activeChip === 'review' ? 'All caught up — nothing needs review' : 'No transactions match your filters'}
          </div>
          <div className="empty-state-body">
            {activeChip === 'review' ? 'New imports will appear here when they need attention.' : 'Try adjusting the filters above.'}
          </div>
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
                <th>Yearly</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(tx => {
                const isIncome = tx.amount > 0
                const matched  = allExpenses.find(e => e.id === tx.matched_expense_id)
                const cat      = !isIncome ? categories?.find(c => c.id === matched?.category_id) : null
                const acct     = bankAccounts.find(b => b.id === tx.bank_account_id)
                const rowBusy  = busy[tx.id]
                const isAnnual = matched?.frequency === 'annual'

                return (
                  <tr key={tx.id} className={tx.ignored ? 'tx-row-ignored' : ''}>
                    <td className="mono tx-date">{tx.date}</td>
                    <td className="tx-desc">{tx.description}</td>
                    <td className="tx-acct">{acct?.name ?? '—'}</td>
                    <td className={`r mono ${tx.amount < 0 ? 'v-red' : 'v-green'}`}>{fmt(tx.amount)}</td>

                    {/* Category cell */}
                    <td className="tx-cat">
                      {tx.ignored ? (
                        <span className="tx-status-badge ignored">Excluded</span>
                      ) : isIncome ? (
                        <span className="tx-income-badge">💵 Credit</span>
                      ) : rowBusy ? (
                        <span className="spinner" style={{ width: 14, height: 14 }} />
                      ) : (
                        <>
                          <GroupedExpenseSelect
                            allExpenses={allExpenses}
                            categories={budgetCats}
                            value={tx.matched_expense_id ?? ''}
                            onChange={id => handleReassign(tx, id)}
                            placeholder="Assign to budget item…"
                          />
                          {cat && (
                            <span className="tx-cat-name" style={{ color: cat.color }}>{cat.name}</span>
                          )}
                        </>
                      )}
                    </td>

                    {/* Yearly cell */}
                    <td>
                      {!tx.ignored && !isIncome && matched && (
                        <label className="tx-yearly-label" title={isAnnual
                          ? 'Uncheck to fold this back into the monthly category'
                          : 'Check to track this as its own yearly subscription'}>
                          <input
                            type="checkbox"
                            checked={isAnnual}
                            disabled={rowBusy}
                            onChange={() => handleYearlyToggle(tx, matched)}
                          />
                        </label>
                      )}
                    </td>

                    {/* Status + actions */}
                    <td>
                      <div className="tx-status-cell">
                        {tx.ignored
                          ? <span className="tx-status-badge ignored">excluded</span>
                          : tx.applied
                            ? <span className="tx-status-badge applied">applied</span>
                            : tx.matched_expense_id
                              ? <span className="tx-status-badge pending">pending</span>
                              : <span className="tx-status-badge unmatched">unmatched</span>}
                        {!tx.ignored && tx.amount < 0 && (
                          tx.applied ? (
                            <button className="tx-action-btn" disabled={rowBusy}
                              onClick={() => handleUnapply(tx)}>↩ Undo</button>
                          ) : (
                            <button className="tx-action-btn" disabled={rowBusy}
                              onClick={() => handleIgnore(tx.id, false)}>✕ Exclude</button>
                          )
                        )}
                        {tx.ignored && (
                          <button className="tx-action-btn" disabled={rowBusy}
                            onClick={() => handleIgnore(tx.id, true)}>↩ Restore</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Payee summary */}
      <div className="tx-payee-section">
        <button className="tx-payee-toggle" onClick={() => setShowPayees(v => !v)}>
          {showPayees ? '▲' : '▼'} Spending by payee
          <span className="tx-payee-count">{payeeSummary.length}</span>
        </button>
        {showPayees && (
          <div className="tbl-wrap fadein" style={{ marginTop: '.75rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Payee</th><th>Category</th>
                  <th className="r">Transactions</th><th className="r">Total Spent</th>
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

      {showClearModal && (
        <ClearMonthModal
          monthStart={periods?.viewingMonth ?? ''}
          txCount={transactions.filter(t => !t.ignored).length}
          totalAmount={transactions.filter(t => !t.ignored && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)}
          clearing={clearingMonth}
          error={clearMonthError}
          onConfirm={() => clearMonth(periods?.viewingMonth)}
          onCancel={() => setShowClearModal(false)}
        />
      )}
    </div>
  )
}
