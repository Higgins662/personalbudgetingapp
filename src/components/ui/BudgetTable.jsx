import { useState } from 'react'
import EditableCell from '../ui/EditableCell'
import CategoryBadge from '../ui/CategoryBadge'
import { fmt } from '../../lib/format'
import './BudgetTable.css'

/**
 * Reusable budget table used for Income, Monthly Expenses, and Annual Expenses.
 *
 * Props:
 *   rows          — array of row objects
 *   categories    — all categories (for badge picker)
 *   onUpdate      — (id, field, value) => void
 *   onAdd         — (newRow) => void
 *   onDelete      — (id) => void
 *   showCategory  — bool (default true)
 *   showNote      — bool (default true)
 *   isIncome      — bool — changes totals display
 *   addLabel      — string for the "add row" button
 *   emptyMessage  — string shown when rows is empty
 */
export default function BudgetTable({
  rows = [],
  categories = [],
  onUpdate,
  onAdd,
  onDelete,
  showCategory = true,
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

  const totalBudgeted = rows.reduce((s, r) => s + (r.budgeted || 0), 0)
  const totalActual   = rows.reduce((s, r) => s + (r.actual   || 0), 0)

  async function handleAdd() {
    if (!newLabel.trim()) return
    await onAdd({
      label:       newLabel.trim(),
      budgeted:    parseFloat(newBud) || 0,
      actual:      0,
      note:        newNote.trim(),
      category_id: newCat || null,
    })
    setNewLabel(''); setNewBud(''); setNewNote(''); setNewCat(''); setShowAdd(false)
  }

  return (
    <div>
      {/* ── Desktop table ── */}
      <div className="tbl-wrap tbl-desktop">
        <table>
          <thead>
            <tr>
              <th style={{ width: '35%' }}>Description</th>
              {showCategory && <th>Category</th>}
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
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink3)', padding: '1.5rem' }}>
                  {emptyMessage}
                </td>
              </tr>
            )}
            {rows.map(row => {
              const diff = isIncome
                ? (row.actual || 0) - (row.budgeted || 0)
                : (row.budgeted || 0) - (row.actual || 0)
              return (
                <tr key={row.id}>
                  <td>
                    <EditableCell
                      value={row.label}
                      onSave={v => onUpdate(row.id, 'label', v)}
                    />
                  </td>
                  {showCategory && (
                    <td>
                      <CategoryBadge
                        categoryId={row.category_id}
                        categories={categories}
                        onSelect={id => onUpdate(row.id, 'category_id', id)}
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
              <td colSpan={showCategory ? 2 : 1}>Total</td>
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
          const diff = isIncome
            ? (row.actual || 0) - (row.budgeted || 0)
            : (row.budgeted || 0) - (row.actual || 0)
          return (
            <MobileRow
              key={row.id}
              row={row}
              diff={diff}
              categories={categories}
              showCategory={showCategory}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          )
        })}
        <div className="mob-total">
          <span>Total</span>
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
                type="number"
                min="0"
                step="0.01"
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
                  {categories.filter(c => c.enabled !== false).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
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

function MobileRow({ row, diff, categories, showCategory, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const cat = categories.find(c => c.id === row.category_id)

  return (
    <div className="mob-row">
      <div className="mob-row-main" onClick={() => setExpanded(e => !e)}>
        <div className="mob-row-left">
          {cat && (
            <span className="mob-cat-dot" style={{ background: cat.color }} />
          )}
          <span className="mob-label">{row.label}</span>
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
            <EditableCell
              value={row.budgeted || 0}
              type="currency"
              onSave={v => onUpdate(row.id, 'budgeted', v)}
              display={fmt}
              className="mono"
            />
          </div>
          <div className="mob-detail-row">
            <span>Actual</span>
            <EditableCell
              value={row.actual || 0}
              type="currency"
              onSave={v => onUpdate(row.id, 'actual', v)}
              display={fmt}
              className="mono"
            />
          </div>
          {showCategory && (
            <div className="mob-detail-row">
              <span>Category</span>
              <CategoryBadge
                categoryId={row.category_id}
                categories={categories}
                onSelect={id => onUpdate(row.id, 'category_id', id)}
              />
            </div>
          )}
          <div className="mob-detail-row">
            <span>Note</span>
            <EditableCell
              value={row.note || ''}
              onSave={v => onUpdate(row.id, 'note', v)}
            />
          </div>
          <div className="mob-detail-row">
            <span>Label</span>
            <EditableCell
              value={row.label}
              onSave={v => onUpdate(row.id, 'label', v)}
            />
          </div>
          <button className="btn btn-danger" style={{ marginTop: '.5rem', fontSize: '.8rem' }}
            onClick={() => onDelete(row.id)}>
            Delete row
          </button>
        </div>
      )}
    </div>
  )
}
