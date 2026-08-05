import { useState } from 'react'

const REFUND      = '__refund__'
const NON_PAYROLL  = '__non_payroll__'
const NEW_INCOME   = '__new__'

/**
 * Dropdown for assigning a positive-amount transaction to an income source —
 * or flagging it as something that isn't recurring income at all (a refund,
 * or a one-off deposit like a check or reimbursement), or creating a brand
 * new income source on the fly.
 *
 * Props:
 *   incomeItems    — this user's income_items
 *   value          — currently assigned income item id, or ''
 *   status         — 'refund' | 'non_payroll_deposit' | null — set when the
 *                     transaction is flagged as not-income instead
 *   onSelectIncome — (incomeItemId) => void
 *   onMarkAs       — (reason: 'refund' | 'non_payroll_deposit') => void
 *   onCreateIncome — (label) => Promise<newIncomeItemId | null>
 *   placeholder    — string shown when nothing is selected
 */
export default function IncomeSelect({
  incomeItems,
  value = '',
  status = null,
  onSelectIncome,
  onMarkAs,
  onCreateIncome,
  placeholder = 'Choose income source…',
}) {
  const [addingNew, setAddingNew] = useState(false)
  const [newLabel,  setNewLabel]  = useState('')
  const [creating,  setCreating]  = useState(false)

  const selectValue = status === 'refund' ? REFUND
    : status === 'non_payroll_deposit' ? NON_PAYROLL
    : value || ''

  function handleChange(e) {
    const v = e.target.value
    if (v === NEW_INCOME)  { setAddingNew(true); return }
    if (v === REFUND)      { onMarkAs('refund'); return }
    if (v === NON_PAYROLL) { onMarkAs('non_payroll_deposit'); return }
    if (v) onSelectIncome(v)
  }

  async function handleCreate() {
    if (!newLabel.trim()) return
    setCreating(true)
    const newId = await onCreateIncome(newLabel.trim())
    setCreating(false)
    if (newId) { setAddingNew(false); setNewLabel('') }
  }

  if (addingNew) {
    return (
      <div className="income-select-new">
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          placeholder="New income source name"
          autoFocus
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
        />
        <button className="btn btn-p" style={{ padding: '.3rem .6rem', fontSize: '.75rem' }}
          onClick={handleCreate} disabled={creating || !newLabel.trim()}>
          {creating ? '…' : 'Add'}
        </button>
        <button className="btn btn-g" style={{ padding: '.3rem .6rem', fontSize: '.75rem' }}
          onClick={() => { setAddingNew(false); setNewLabel('') }}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <select className="cell-select grouped-expense-select" value={selectValue} onChange={handleChange}>
      <option value="" disabled>{placeholder}</option>
      {incomeItems.map(inc => <option key={inc.id} value={inc.id}>{inc.label}</option>)}
      <option value={REFUND}>🔄 Refund (not income)</option>
      <option value={NON_PAYROLL}>💰 Non-payroll deposit (not income)</option>
      <option value={NEW_INCOME}>+ Add new income source…</option>
    </select>
  )
}
