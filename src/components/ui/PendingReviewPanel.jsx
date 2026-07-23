import { useState, useMemo } from 'react'
import { fmt } from '../../lib/format'
import { isTransferOrPayment } from '../../lib/transferDetection'
import { supabase } from '../../lib/supabase'
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
  onFrequencyChange,
}) {
  const [showRecent, setShowRecent] = useState(false)
  const budgetCats = (categories ?? []).filter(c => !c.is_system)

  const recentCutoff = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - RECENT_DAYS)
    return d.toISOString().split('T')[0]
  }, [])

  const debits = useMemo(() =>
    transactions.filter(t =>
      !t.ignored &&
      t.amount < 0 &&
      !isTransferOrPayment(t.description)
    ), [transactions])

  const unmatched    = useMemo(() => debits.filter(t => !t.matched_expense_id && !t.applied), [debits])
  const unapplied    = useMemo(() => debits.filter(t =>  t.matched_expense_id && !t.applied), [debits])
  const recentApplied = useMemo(() => debits.filter(t => t.applied && t.date >= recentCutoff), [debits, recentCutoff])

  const hasAnything = unmatched.length > 0 || unapplied.length > 0

  if (!hasAnything && recentApplied.length === 0) {
    return (
      <div className="pending-panel pending-panel-clean">
        <span className="pending-panel-title">✅ All caught up — nothing needs your attention</span>
      </div>
    )
  }

  const rowProps = { allExpenses, categories: budgetCats, bankAccounts, onReassign, onFrequencyChange }

  return (
    <div className="pending-panel">
      <div className="pending-panel-hdr">
        <span className="pending-panel-title">
          {hasAnything ? '⏳ Needs your attention' : '✅ All caught up'}
        </span>
        <div className="pending-panel-counts">
          {unmatched.length > 0 && <span className="pending-badge unmatched">{unmatched.length} unmatched</span>}
          {unapplied.length > 0 && <span className="pending-badge pending">{unapplied.length} ready to apply</span>}
        </div>
      </div>

      {unmatched.length > 0 && (
        <div className="pending-section">
          <div className="pending-section-label">Unmatched expenses — assign a budget item</div>
          {unmatched.map(tx => <PendingRow key={tx.id} tx={tx} {...rowProps} />)}
        </div>
      )}

      {unapplied.length > 0 && (
        <div className="pending-section">
          <div className="pending-section-label">Ready to apply — confirm or reassign</div>
          {unapplied.map(tx => (
            <PendingRow
              key={tx.id}
              tx={tx}
              matched={allExpenses.find(e => e.id === tx.matched_expense_id)}
              {...rowProps}
            />
          ))}
          <button className="btn btn-p pending-apply-btn" onClick={onApply} disabled={applying}>
            {applying
              ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Updating…</>
              : `✓ Update my budget with ${unapplied.length} transaction${unapplied.length === 1 ? '' : 's'}`}
          </button>
        </div>
      )}

      {recentApplied.length > 0 && (
        <div className="pending-section pending-section-recent">
          <button className="pending-recent-toggle" onClick={() => setShowRecent(v => !v)}>
            {showRecent ? '▲' : '▼'} Recently applied ({recentApplied.length})
            <span style={{ fontSize: '.72rem', fontWeight: 400, marginLeft: '.35rem' }}>
              — click to correct mistakes
            </span>
          </button>
          {showRecent && (
            <div className="fadein" style={{ marginTop: '.5rem' }}>
              {recentApplied.map(tx => (
                <PendingRow
                  key={tx.id}
                  tx={tx}
                  matched={allExpenses.find(e => e.id === tx.matched_expense_id)}
                  {...rowProps}
                  dimmed
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PendingRow({ tx, matched, allExpenses, categories, bankAccounts, onReassign, onFrequencyChange, dimmed }) {
  const [busy,    setBusy]    = useState(false)
  const [yearly,  setYearly]  = useState(matched?.frequency === 'annual')
  const acct = bankAccounts?.find(b => b.id === tx.bank_account_id)

  // Keep yearly checkbox in sync if matched item changes
  const currentlyAnnual = matched?.frequency === 'annual'

  async function handleChange(id) {
    setBusy(true)
    await onReassign(tx.id, id)
    // After assignment, if yearly is checked, flip the expense_item frequency
    if (yearly && id) {
      await supabase.from('expense_items').update({ frequency: 'annual' }).eq('id', id)
      if (onFrequencyChange) onFrequencyChange()
    }
    setBusy(false)
  }

  async function handleYearlyToggle(e) {
    e.stopPropagation()
    const nowYearly = !yearly
    setYearly(nowYearly)
    // If already assigned, flip the existing expense_item immediately
    if (tx.matched_expense_id) {
      setBusy(true)
      await supabase
        .from('expense_items')
        .update({ frequency: nowYearly ? 'annual' : 'monthly' })
        .eq('id', tx.matched_expense_id)
      if (onFrequencyChange) onFrequencyChange()
      setBusy(false)
    }
  }

  return (
    <div className={`pending-row${dimmed ? ' dimmed' : ''}`}>
      <div className="pending-row-info">
        <span className="pending-row-date">{tx.date}</span>
        <span className="pending-row-desc">{tx.description}</span>
        {acct && <span className="pending-row-acct">{acct.name}</span>}
      </div>
      <div className="pending-row-right">
        {/* Yearly checkbox — between description and amount */}
        <label className="pending-yearly-label" title="Mark as yearly charge">
          <input
            type="checkbox"
            checked={yearly || currentlyAnnual}
            onChange={handleYearlyToggle}
            disabled={busy}
          />
          <span className="pending-yearly-text">Yearly</span>
        </label>

        <span className="mono pending-row-amt v-red">{fmt(tx.amount)}</span>

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
