import { useState, useEffect } from 'react'
import { fmt } from '../../lib/format'
import { groupByPayee, tagLikelyIncome } from '../../lib/transactionAnalysis'
import './WizardSteps.css'

export default function WizardIncomeStep({ transactions, selections, onChange }) {
  const [groups, setGroups] = useState([])

  useEffect(() => {
    const credits = groupByPayee(transactions, 'credit')
    setGroups(tagLikelyIncome(credits))
  }, [transactions])

  function toggle(key, checked) {
    onChange({
      ...selections,
      [key]: {
        ...selections[key],
        checked,
        label: selections[key]?.label ?? groups.find(g => g.key === key)?.description ?? '',
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

  return (
    <div>
      {/* ── Disambiguation hint — fix #2 ── */}
      <div className="wiz-income-hint">
        <strong>Check only money that comes in regularly from an outside source</strong> —
        your paycheck, freelance payments, rental income, etc.<br />
        <span style={{ color: 'var(--red)', fontWeight: 600 }}>Uncheck</span> transfers
        between your own accounts, refunds, tax returns, or any one-time deposits.
        Including these will inflate your income total.
      </div>

      <div className="wiz-income-groups">
        {groups.map(g => {
          const sel       = selections[g.key] ?? { checked: g.likelyIncome, label: g.description }
          const isChecked = sel.checked ?? g.likelyIncome
          return (
            <div key={g.key} className={`wiz-income-group${isChecked ? ' selected' : ''}`}>
              <label className="wiz-income-check">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={e => toggle(g.key, e.target.checked)}
                />
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
                  {g.likelyIncome && (
                    <span className="wiz-likely-badge">likely recurring</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
