import { useState, useMemo } from 'react'
import { fmt } from '../../lib/format'
import { isTransferOrPayment } from '../../lib/transferDetection'
import GroupedExpenseSelect from './GroupedExpenseSelect'
import './PendingReviewPanel.css'

const RECENT_DAYS = 30

export default function PendingReviewPanel({
  transactions,
  allExpenses,
  categories,
  bankAccounts,
  applying,
  onApply,
  onReassign,
}) {
  const [showRecent, setShowRecent] = useState(false)
  const budgetCats = (categories ?? []).filter(c => !c.is_system)

  const recentCutoff = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - RECENT_DAYS)
    return d.toISOString().split('T')[0]
  }, [])

  // Only care about debits (expenses) — income and transfers handled elsewhere
  const debits = useMemo(() =>
    transactions.filter(t =>
      !t.ignored &&
      t.amount < 0 &&
      !isTransferOrPayment(t.description)
    ), [transactions])

  // Unmatched debits — need a category assigned
  const unmatched = useMemo(() =>
    debits.filter(t => !t.matched_expense_id && !t.applied),
    [debits])

  // Matched debits not yet applied to budget totals
  const unapplied = useMemo(() =>
    debits.filter(t => t.matched_expense_id && !t.applied),
    [debits])

  // Recently applied debits — user can correct mistakes
  const recentApplied = useMemo(() =>
    debits.filter(t => t.applied && t.date >= recentCutoff),
    [debits, recentCutoff])

  const hasAnything = unmatched.length > 0 || unapplied.length > 0

  if (!hasAnything && recentApplied.length === 0) {
    return (
      <div className="pending-panel pending-panel-clean">
        <span className="pending-panel-title">✅ All caught up — nothing needs your attention</span>
      </div>
    )
  }

  return (
    <div className="pending-panel">
      <div className="pending-panel-hdr">
        <span className="pending-panel-title">
          {hasAnything ? '⏳ Needs your attention' : '✅ All caught up'}
        </span>
        <div className="pending-panel-counts">
          {unmatched.length > 0 && (
            <span className="pending-badge unmatched">{unmatched.length} unmatched</span>
          )}
          {unapplied.length > 0 && (
            <span className="pending-badge pending">{unapplied.length} ready to apply</span>
          )}
        </div>
      </div>

      {/* Unmatched expense transactions */}
      {unmatched.length > 0 && (
        <div className="pending-section">
          <div className="pending-section-label">
            Unmatched expenses — assign a budget item
          </div>
          {unmatched.map(tx => (
            <PendingRow
              key={tx.id}
              tx={tx}
              allExpenses={allExpenses}
              categories={budgetCats}
              bankAccounts={bankAccounts}
              onReassign={onReassign}
            />
          ))}
        </div>
      )}

      {/* Unapplied matched transactions */}
      {unapplied.length > 0 && (
        <div className="pending-section">
          <div className="pending-section-label">
            Ready to apply — confirm or reassign
          </div>
          {unapplied.map(tx => {
            const matched = allExpenses.find(e => e.id === tx.matched_expense_id)
            return (
              <PendingRow
                key={tx.id}
                tx={tx}
                matched={matched}
                allExpenses={allExpenses}
                categories={budgetCats}
                bankAccounts={bankAccounts}
                onReassign={onReassign}
              />
            )
          })}
          <button
            className="btn btn-p pending-apply-btn"
            onClick={onApply}
            disabled={applying}
          >
            {applying
              ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Updating…</>
              : `✓ Update my budget with ${unapplied.length} transaction${unapplied.length === 1 ? '' : 's'}`}
          </button>
        </div>
      )}

      {/* Recently applied — collapsible correction panel */}
      {recentApplied.length > 0 && (
        <div className="pending-section pending-section-recent">
          <button
            className="pending-recent-toggle"
            onClick={() => setShowRecent(v => !v)}
          >
            {showRecent ? '▲' : '▼'} Recently applied ({recentApplied.length})
            <span style={{ fontSize: '.72rem', fontWeight: 400, marginLeft: '.35rem' }}>
              — click to correct mistakes
            </span>
          </button>
          {showRecent && (
            <div className="fadein" style={{ marginTop: '.5rem' }}>
              {recentApplied.map(tx => {
                const matched = allExpenses.find(e => e.id === tx.matched_expense_id)
                return (
                  <PendingRow
                    key={tx.id}
                    tx={tx}
                    matched={matched}
                    allExpenses={allExpenses}
                    categories={budgetCats}
                    bankAccounts={bankAccounts}
                    onReassign={onReassign}
                    dimmed
                  />
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PendingRow({ tx, matched, allExpenses, categories, bankAccounts, onReassign, dimmed }) {
  const [busy, setBusy] = useState(false)
  const acct = bankAccounts?.find(b => b.id === tx.bank_account_id)

  async function handleChange(id) {
    setBusy(true)
    await onReassign(tx.id, id)
    setBusy(false)
  }

  return (
    <div className={`pending-row${dimmed ? ' dimmed' : ''}`}>
      <div className="pending-row-info">
        <span className="pending-row-date">{tx.date}</span>
        <span className="pending-row-desc">{tx.description}</span>
        {acct && <span className="pending-row-acct">{acct.name}</span>}
      </div>
      <div className="pending-row-right">
        <span className="mono pending-row-amt v-red">
          {fmt(tx.amount)}
        </span>
        {busy ? (
          <span className="spinner" style={{ width: 14, height: 14 }} />
        ) : (
          <GroupedExpenseSelect
            allExpenses={allExpenses}
            categories={categories}
            value={tx.matched_expense_id ?? ''}
            onChange={handleChange}
            placeholder={matched ? matched.label : 'Assign…'}
          />
        )}
      </div>
    </div>
  )
}
