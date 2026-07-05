import { useState } from 'react'
import { fmt } from '../../lib/format'

/**
 * Shows detected credit card payments / transfers at the top of the
 * Reconcile preview, collapsed by default with an "Exclude all" button.
 * Users can expand to review and override individual items.
 *
 * Props:
 *   transfers       — array of transaction objects flagged as transfers
 *   excluded        — Set of indices (into the transfers array) already excluded
 *   onExcludeAll    — () => void
 *   onToggle        — (index) => void — toggle one item's excluded state
 */
export default function TransferPanel({ transfers, excluded, onExcludeAll, onToggle }) {
  const [expanded, setExpanded] = useState(false)

  if (!transfers.length) return null

  const excludedCount = excluded.size
  const allExcluded   = excludedCount === transfers.length

  return (
    <div className="transfer-panel">
      <div className="transfer-panel-hdr">
        <div className="transfer-panel-hdr-left">
          <span className="transfer-panel-icon">🔄</span>
          <div>
            <div className="transfer-panel-title">
              {transfers.length} transaction{transfers.length === 1 ? '' : 's'} look like credit card payments or transfers
            </div>
            <div className="transfer-panel-sub">
              {allExcluded
                ? 'All excluded — won\'t be imported'
                : excludedCount > 0
                  ? `${excludedCount} of ${transfers.length} excluded`
                  : 'None excluded yet — click "Exclude all" to skip them'}
            </div>
          </div>
        </div>
        <div className="transfer-panel-hdr-right">
          {!allExcluded && (
            <button className="btn btn-g transfer-panel-exclude-btn" onClick={onExcludeAll}>
              Exclude all
            </button>
          )}
          <button className="transfer-panel-toggle" onClick={() => setExpanded(e => !e)}>
            {expanded ? 'Hide ▲' : 'Review ▼'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="transfer-panel-list fadein">
          {transfers.map((tx, i) => {
            const isExcluded = excluded.has(i)
            return (
              <div key={i} className={`transfer-row${isExcluded ? ' transfer-row-excluded' : ''}`}>
                <div className="transfer-row-info">
                  <span className="rec-tx-date">{tx.date}</span>
                  <span className="rec-tx-desc">{tx.description}</span>
                  <span className={`mono ${tx.amount < 0 ? 'v-red' : 'v-green'}`} style={{ fontSize: '.83rem' }}>
                    {fmt(tx.amount)}
                  </span>
                </div>
                <button
                  className="btn btn-g"
                  style={{ padding: '.2rem .55rem', fontSize: '.73rem', flexShrink: 0 }}
                  onClick={() => onToggle(i)}
                >
                  {isExcluded ? 'Include' : 'Exclude'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
