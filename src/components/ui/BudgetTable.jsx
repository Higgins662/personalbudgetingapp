import { useState } from 'react'
import EditableCell from '../ui/EditableCell'
import CategoryBadge from '../ui/CategoryBadge'
import PaymentMethodBadge from '../ui/PaymentMethodBadge'
import FlagBadge from '../ui/FlagBadge'
import { fmt } from '../../lib/format'
import './BudgetTable.css'

export default function BudgetTable({
  rows = [],
  categories = [],
  bankAccounts = [],
  onUpdate,
  onAdd,
  onDelete,
  showCategory = true,
  showLabel = true,
  showPaymentMethod = false,
  showFrequency = false,
  paymentMethodLabel = 'Payment Method',
  showNote = true,
  isIncome = false,
  addLabel = '+ Add row',
  emptyMessage = 'No rows yet.',
}) {
  const [showAdd,  setShowAdd]  = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newBud,   setNewBud]   = useState('')
  const [newNote,  setNewNote]  = useState('')
  const [newCat,   setNewCat]   = useState('')
  const [newBank,  setNewBank]  = useState('')

  const activeRows = rows.filter(r => r.enabled !== false)
  const totalBudgeted = activeRows.reduce((s, r) => s + (r.budgeted || 0), 0)
  const totalActual   = activeRows.reduce((s, r) => s + (r.actual   || 0), 0)

  async function handleAdd() {
    if (!newLabel.trim()) return
    await onAdd({
      label:       newLabel.trim(),
      budgeted:    parseFloat(newBud) || 0,
      actual:      0,
      note:        newNote.trim(),
      category_id: newCat || null,
      enabled:     true,
      ...(showPaymentMethod ? { bank_account_id: newBank || null } : {}),
    })
    setNewLabel(''); setNewBud(''); setNewNote(''); setNewCat(''); setNewBank('')
    setShowAdd(false)
  }

  const colCount = 4
    + (showLabel ? 1 : 0)
    + (showCategory ? 1 : 0)
    + (showPaymentMethod ? 1 : 0)
    + (showNote ? 1 : 0)
    + 2 // toggle + delete

  return (
    <div>
      {/* ── Desktop table ── */}
      <div className="tbl-wrap tbl-desktop">
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }} title="Enable / disable row" />
              {showLabel && <th style={{ width: '28%' }}>Description</th>}
              {showCategory && <th>Category</th>}
              {showPaymentMethod && <th>{paymentMethodLabel}</th>}
              <th className="r">Budgeted</th>
              <th className="r">Actual</th>
              <th className="r">Difference</th>
              {showNote && <th>Note</th>}
              <th style={{ width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={colCount} style={{ textAlign: 'center', color: 'var(--ink3)', padding: '1.5rem' }}>
                  {emptyMessage}
                </td>
              </tr>
            )}
            {rows.map(row => {
              const enabled = row.enabled !== false
              const diff = isIncome
                ? (row.actual || 0) - (row.budgeted || 0)
                : (row.budgeted || 0) - (row.actual || 0)
              return (
                <tr key={row.id} className={enabled ? '' : 'row-disabled'}>
                  <td>
                    <RowToggle
                      enabled={enabled}
                      onChange={v => onUpdate(row.id, 'enabled', v)}
                    />
                  </td>
                  {showLabel && (
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' }}>
                        <EditableCell
                          value={row.label}
                          onSave={v => onUpdate(row.id, 'label', v)}
                        />
                        {row.flagged && <FlagBadge variance={row.flag_variance} />}
                      </div>
                    </td>
                  )}
                  {showCategory && (
                    <td>
                      <CategoryBadge
                        categoryId={row.category_id}
                        categories={categories}
                        onSelect={id => onUpdate(row.id, 'category_id', id)}
                      />
                    </td>
                  )}
                  {showPaymentMethod && (
                    <td>
                      <PaymentMethodBadge
                        bankAccountId={row.bank_account_id}
                        bankAccounts={bankAccounts}
                        onSelect={id => onUpdate(row.id, 'bank_account_id', id)}
                      />
                    </td>
                  )}
                  <td className="r">
                    <EditableCell
                      value={row.budgeted || 0}
                      type="currency"
                      onSave={v => onUpdate(row.id, 'budgeted', v)}
                      display={fmt}
                      className="mono"
                    />
                  </td>
                  <td className="r">
                    <EditableCell
                      value={row.actual || 0}
                      type="currency"
                      onSave={v => onUpdate(row.id, 'actual', v)}
                      display={fmt}
                      className="mono"
                    />
                  </td>
                  <td className="r">
                    <span className={`mono ${diff >= 0 ? 'v-green' : 'v-red'}`}>
                      {diff >= 0 ? '+' : ''}{fmt(diff)}
                    </span>
                  </td>
                  {showNote && (
                    <td>
                      <EditableCell
                        value={row.note || ''}
                        onSave={v => onUpdate(row.id, 'note', v)}
                        className="note-cell"
                      />
                    </td>
                  )}
                  <td>
                    <button className="del-btn" onClick={() => onDelete(row.id)} title="Delete row">
                      ×
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td colSpan={(showLabel ? 1 : 0) + (showCategory ? 1 : 0) + 1}>
                Total
                {rows.some(r => r.enabled === false) && (
                  <span className="disabled-banner">
                    {rows.filter(r => r.enabled === false).length} excluded
                  </span>
                )}
              </td>
              {showPaymentMethod && <td />}
              <td className="r">{fmt(totalBudgeted)}</td>
              <td className="r">{fmt(totalActual)}</td>
              <td className="r">
                <span className={totalActual - totalBudgeted >= 0 ? 'v-green' : 'v-red'}>
                  {totalActual >= totalBudgeted ? '+' : ''}{fmt(totalActual - totalBudgeted)}
                </span>
              </td>
              {showNote && <td />}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Mobile card list ── */}
      <div className="tbl-mobile">
        {rows.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-body">{emptyMessage}</div>
          </div>
        )}
        {rows.map(row => {
          const enabled = row.enabled !== false
          const diff = isIncome
            ? (row.actual || 0) - (row.budgeted || 0)
            : (row.budgeted || 0) - (row.actual || 0)
          return (
            <MobileRow
              key={row.id}
              row={row}
              diff={diff}
              enabled={enabled}
              categories={categories}
              bankAccounts={bankAccounts}
              showCategory={showCategory}
              readOnlyCategory={readOnlyCategory}
              showPaymentMethod={showPaymentMethod}
              showFrequency={showFrequency}
              paymentMethodLabel={paymentMethodLabel}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          )
        })}
        <div className="mob-total">
          <span>
            Total
            {rows.some(r => r.enabled === false) && (
              <span className="disabled-banner" style={{ marginLeft: '.4rem' }}>
                {rows.filter(r => r.enabled === false).length} excluded
              </span>
            )}
          </span>
          <span className="mono">{fmt(totalBudgeted)}</span>
          <span className="mono">{fmt(totalActual)}</span>
        </div>
      </div>

      {/* ── Add row form ── */}
      {showAdd ? (
        <div className="add-form fadein">
          <div className="fgrid">
            <div className="fg">
              <label>Description</label>
              <input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="e.g. Netflix"
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                autoFocus
              />
            </div>
            <div className="fg">
              <label>Budgeted ($)</label>
              <input
                type="number" min="0" step="0.01"
                value={newBud}
                onChange={e => setNewBud(e.target.value)}
                placeholder="0.00"
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
            </div>
            {showCategory && (
              <div className="fg">
                <label>Category</label>
                <select value={newCat} onChange={e => setNewCat(e.target.value)}>
                  <option value="">— None —</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            {showPaymentMethod && (
              <div className="fg">
                <label>{paymentMethodLabel}</label>
                <select value={newBank} onChange={e => setNewBank(e.target.value)}>
                  <option value="">— Unassigned —</option>
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}
            {showNote && (
              <div className="fg">
                <label>Note</label>
                <input
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder="Optional note"
                />
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button className="btn btn-p" onClick={handleAdd}>Add</button>
            <button className="btn btn-g" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn-add" onClick={() => setShowAdd(true)}>{addLabel}</button>
      )}
    </div>
  )
}

function RowToggle({ enabled, onChange }) {
  return (
    <label className="row-toggle" title={enabled ? 'Click to exclude from totals' : 'Click to include in totals'}>
      <input type="checkbox" checked={enabled} onChange={e => onChange(e.target.checked)} />
      <span className="row-toggle-track">
        <span className="row-toggle-thumb" />
      </span>
    </label>
  )
}

function MobileRow({ row, diff, enabled, categories, bankAccounts, showCategory,
                     readOnlyCategory, showPaymentMethod, showFrequency, paymentMethodLabel, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const cat  = categories.find(c => c.id === row.category_id)
  const bank = bankAccounts.find(b => b.id === row.bank_account_id)

  return (
    <div className={`mob-row${enabled ? '' : ' mob-row-disabled'}`}>
      <div className="mob-row-main" onClick={() => setExpanded(e => !e)}>
        <div className="mob-row-left">
          <RowToggle enabled={enabled} onChange={v => { onUpdate(row.id, 'enabled', v) }} />
          {cat && <span className="mob-cat-dot" style={{ background: cat.color }} />}
          <span className="mob-label">{row.label}</span>
          {row.flagged && <FlagBadge variance={row.flag_variance} />}
        </div>
        <div className="mob-row-right">
          <span className="mono" style={{ fontSize: '.85rem' }}>{fmt(row.actual || 0)}</span>
          <span className={`mob-diff mono ${diff >= 0 ? 'v-green' : 'v-red'}`}>
            {diff >= 0 ? '+' : ''}{fmt(diff)}
          </span>
          <span className="mob-chevron">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {expanded && (
        <div className="mob-row-detail fadein">
          <div className="mob-detail-row">
            <span>Budgeted</span>
            <EditableCell value={row.budgeted || 0} type="currency" onSave={v => onUpdate(row.id, 'budgeted', v)} display={fmt} className="mono" />
          </div>
          <div className="mob-detail-row">
            <span>Actual</span>
            <EditableCell value={row.actual || 0} type="currency" onSave={v => onUpdate(row.id, 'actual', v)} display={fmt} className="mono" />
          </div>
          {showCategory && (
            <div className="mob-detail-row">
              <span>Category</span>
              <CategoryBadge categoryId={row.category_id} categories={categories} onSelect={id => onUpdate(row.id, 'category_id', id)} readOnly={readOnlyCategory} />
            </div>
          )}
          {showPaymentMethod && (
            <div className="mob-detail-row">
              <span>{paymentMethodLabel}</span>
              <PaymentMethodBadge bankAccountId={row.bank_account_id} bankAccounts={bankAccounts} onSelect={id => onUpdate(row.id, 'bank_account_id', id)} />
            </div>
          )}
          {showFrequency && (
            <div className="mob-detail-row">
              <span>Frequency</span>
              <button
                className={`freq-toggle-btn${row.frequency === 'annual' ? ' annual' : ''}`}
                onClick={() => onUpdate(row.id, 'frequency', row.frequency === 'annual' ? 'monthly' : 'annual')}
              >
                {row.frequency === 'annual' ? '📅 Yearly' : '📆 Monthly'}
              </button>
            </div>
          )}
          <div className="mob-detail-row">
            <span>Note</span>
            <EditableCell value={row.note || ''} onSave={v => onUpdate(row.id, 'note', v)} />
          </div>
          <div className="mob-detail-row">
            <span>Label</span>
            <EditableCell value={row.label} onSave={v => onUpdate(row.id, 'label', v)} />
          </div>
          <button className="btn btn-danger" style={{ marginTop: '.5rem', fontSize: '.8rem' }} onClick={() => onDelete(row.id)}>
            Delete row
          </button>
        </div>
      )}
    </div>
  )
}
