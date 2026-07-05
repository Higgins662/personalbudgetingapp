import { useState, useEffect } from 'react'
import { fmt } from '../../lib/format'
import { groupByPayee, tagLikelyIncome } from '../../lib/transactionAnalysis'
import { isTransferOrPayment } from '../../lib/transferDetection'
import './WizardSteps.css'

export default function WizardIncomeStep({ transactions, selections, onChange }) {
  const [groups, setGroups] = useState([])

  useEffect(() => {
    const credits = groupByPayee(transactions, 'credit')
    const tagged  = tagLikelyIncome(credits).map(g => ({
      ...g,
      likelyTransfer: isTransferOrPayment(g.description),
    }))
    setGroups(tagged)

    // Auto-uncheck groups that look like transfers
    const initial = { ...selections }
    for (const g of tagged) {
      if (initial[g.key] === undefined) {
        initial[g.key] = {
          checked: g.likelyIncome && !g.likelyTransfer,
          label:   g.description,
          total:   g.total,
          avgPerOccurrence: g.avgPerOccurrence,
        }
      }
    }
    onChange(initial)
  }, [transactions]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(key, checked) {
    const g = groups.find(g => g.key === key)
    onChange({
      ...selections,
      [key]: {
        ...selections[key],
        checked,
        label: selections[key]?.label ?? g?.description ?? '',
        total: g?.total ?? 0,
        avgPerOccurrence: g?.avgPerOccurrence ?? 0,
      },
    })
  }

  function setLabel(key, label) {
    onChange({ ...selections, [key]: { ...selections[key], label } })
  }

  if (!groups.length) {
    return (
      <div className="wiz-empty-step">
        <div className="empty-state-icon">💳</div>
        <div className="empty-state-title">No deposits found</div>
        <div className="empty-state-body">
          Your statements didn't contain any positive transactions. You can add
          income sources manually on the Income tab after setup.
        </div>
      </div>
    )
  }

  const transferGroups = groups.filter(g => g.likelyTransfer)
  const normalGroups   = groups.filter(g => !g.likelyTransfer)

  return (
    <div>
      <div className="wiz-income-hint">
        <strong>Check only money that comes in regularly from an outside source</strong> —
        your paycheck, freelance payments, rental income, etc.<br />
        <span style={{ color: 'var(--red)', fontWeight: 600 }}>Uncheck</span> transfers
        between your own accounts, refunds, tax returns, or any one-time deposits.
      </div>

      {/* Flagged transfers — shown first, collapsed, auto-unchecked */}
      {transferGroups.length > 0 && (
        <div className="wiz-transfer-notice">
          <div className="wiz-transfer-notice-hdr">
            🔄 {transferGroups.length} deposit{transferGroups.length === 1 ? '' : 's'} look like credit card payments or transfers — automatically unchecked
          </div>
          <div className="wiz-income-groups" style={{ marginTop: '.5rem' }}>
            {transferGroups.map(g => {
              const sel       = selections[g.key] ?? { checked: false }
              const isChecked = sel.checked ?? false
              return (
                <div key={g.key} className={`wiz-income-group${isChecked ? ' selected' : ''}`}>
                  <label className="wiz-income-check">
                    <input type="checkbox" checked={isChecked} onChange={e => toggle(g.key, e.target.checked)} />
                    <span className="wiz-income-check-box" />
                  </label>
                  <div className="wiz-income-group-body">
                    <span className="wiz-income-group-desc">{g.description}</span>
                    <div className="wiz-income-group-meta">
                      <span>{g.count} deposit{g.count === 1 ? '' : 's'}</span>
                      <span>·</span>
                      <span className="mono">{fmt(g.total)} total</span>
                      <span className="wiz-transfer-badge">🔄 looks like a payment</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <p style={{ fontSize: '.75rem', color: 'var(--ink3)', marginTop: '.4rem' }}>
            Check any of these if they are actually income for you.
          </p>
        </div>
      )}

      {/* Normal income candidates */}
      <div className="wiz-income-groups">
        {normalGroups.map(g => {
          const sel       = selections[g.key] ?? { checked: g.likelyIncome }
          const isChecked = sel.checked ?? g.likelyIncome
          return (
            <div key={g.key} className={`wiz-income-group${isChecked ? ' selected' : ''}`}>
              <label className="wiz-income-check">
                <input type="checkbox" checked={isChecked} onChange={e => toggle(g.key, e.target.checked)} />
                <span className="wiz-income-check-box" />
              </label>
              <div className="wiz-income-group-body">
                {isChecked ? (
                  <input
                    className="wiz-income-label-input"
                    value={sel.label ?? g.description}
                    onChange={e => setLabel(g.key, e.target.value)}
                    placeholder="Click to rename this income source…"
                  />
                ) : (
                  <span className="wiz-income-group-desc">{g.description}</span>
                )}
                <div className="wiz-income-group-meta">
                  <span>{g.count} deposit{g.count === 1 ? '' : 's'}</span>
                  <span>·</span>
                  <span className="mono">{fmt(g.total)} total</span>
                  <span>·</span>
                  <span className="mono">{fmt(g.avgPerOccurrence)} avg</span>
                  {g.likelyIncome && <span className="wiz-likely-badge">likely recurring</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
