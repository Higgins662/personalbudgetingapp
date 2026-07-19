import { useState, useEffect } from 'react'
import { fmt } from '../../lib/format'
import { groupByPayee } from '../../lib/transactionAnalysis'
import { findBestMatch } from '../../lib/fuzzyMatch'
import { randomCategoryColor } from '../../lib/transactionAnalysis'
import './WizardSteps.css'

const CONFIDENCE_THRESHOLD = 0.6

/**
 * Step 4: Categorize expense payee groups.
 *
 * Props:
 *   transactions    — all staged debit transactions
 *   categories      — seeded category list [{ id, name, color }]
 *   assignments     — { [payeeKey]: categoryId } — controlled from parent
 *   onChange        — (assignments) => void
 *   onAddCategory   — (newCategory) => void — parent appends to category list
 */
export default function WizardExpenseStep({ transactions, categories, assignments, yearlyKeys, onChange, onSetYearly, onAddCategory }) {
  const [groups,    setGroups]    = useState([])
  const [showNew,   setShowNew]   = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [expandedConfirmed, setExpandedConfirmed] = useState(false)

  useEffect(() => {
    const debits = groupByPayee(transactions, 'debit')

    // Build a quick lookup: normalised pattern → category name from global pool
    const globalPatternMap = {}
    for (const p of globalPatterns) {
      globalPatternMap[normalizePattern(p.pattern)] = p.category_name
    }

    // Match tier 1: global payee patterns (crowd-sourced, high confidence)
    // Match tier 2: fuzzy match against category names
    const withMatches = debits.map(g => {
      const key           = normalizePattern(g.description)
      const globalCatName = globalPatternMap[key]
      const globalCat     = globalCatName
        ? categories.find(c => c.name === globalCatName)
        : null

      const match = globalCat
        ? { item: { id: globalCat.id, label: globalCat.name }, score: 0.95 }
        : findBestMatch(g.description, categories.map(c => ({ id: c.id, label: c.name })), CONFIDENCE_THRESHOLD) ?? null

      return { ...g, autoMatch: match, suggestYearly: g.count === 1 }
    })

    setGroups(withMatches)

    // Seed assignments with high-confidence matches that aren't already set
    const initial = { ...assignments }
    for (const g of withMatches) {
      if (!initial[g.key] && g.autoMatch) {
        initial[g.key] = g.autoMatch.item.id
      }
    }
    onChange(initial)
  }, [transactions, categories.length]) // eslint-disable-line react-hooks/exhaustive-deps

  function assign(key, categoryId) {
    onChange({ ...assignments, [key]: categoryId })
  }

  function handleAddCategory() {
    if (!newCatName.trim()) return
    const color = randomCategoryColor()
    onAddCategory({ name: newCatName.trim(), color, description: '', enabled: true })
    setNewCatName('')
    setShowNew(false)
  }

  const confirmedGroups = groups.filter(g => assignments[g.key] && g.autoMatch && g.autoMatch.score >= CONFIDENCE_THRESHOLD)
  const reviewGroups    = groups.filter(g => !assignments[g.key] || !g.autoMatch || g.autoMatch.score < CONFIDENCE_THRESHOLD)
  const totalAssigned   = groups.filter(g => assignments[g.key]).length

  return (
    <div>
      <p className="wiz-step-hint">
        We found <strong>{groups.length}</strong> payee{groups.length === 1 ? '' : 's'} in your statements.
        Assign each to a category so we can group your spending.
        {confirmedGroups.length > 0 && ` ${confirmedGroups.length} were matched automatically.`}
      </p>

      <div className="wiz-assign-progress">
        <div className="wiz-assign-bar">
          <div
            className="wiz-assign-fill"
            style={{ width: `${groups.length ? (totalAssigned / groups.length) * 100 : 0}%` }}
          />
        </div>
        <span className="wiz-assign-label">{totalAssigned} of {groups.length} assigned</span>
      </div>

      {/* Needs review section */}
      {reviewGroups.length > 0 && (
        <div className="wiz-group-section">
          <div className="wiz-group-section-hdr">
            Needs your review
            <span className="wiz-group-count">{reviewGroups.length}</span>
          </div>
          {reviewGroups.map(g => (
            <PayeeGroup
              key={g.key}
              group={g}
              categories={categories}
              assigned={assignments[g.key]}
              yearly={yearlyKeys?.has(g.key)}
              suggestYearly={g.suggestYearly}
              onAssign={id => assign(g.key, id)}
              onToggleYearly={() => onSetYearly(g.key)}
              defaultExpanded
            />
          ))}
        </div>
      )}

      {/* Auto-matched section */}
      {confirmedGroups.length > 0 && (
        <div className="wiz-group-section">
          <button
            className="wiz-group-section-hdr wiz-group-section-toggle"
            onClick={() => setExpandedConfirmed(e => !e)}
          >
            Auto-matched — looks right?
            <span className="wiz-group-count">{confirmedGroups.length}</span>
            <span style={{ marginLeft: 'auto', fontSize: '.8rem' }}>{expandedConfirmed ? '▲' : '▼'}</span>
          </button>
          {expandedConfirmed && confirmedGroups.map(g => (
            <PayeeGroup
              key={g.key}
              group={g}
              categories={categories}
              assigned={assignments[g.key]}
              yearly={yearlyKeys?.has(g.key)}
              suggestYearly={g.suggestYearly}
              onAssign={id => assign(g.key, id)}
              onToggleYearly={() => onSetYearly(g.key)}
              defaultExpanded={false}
            />
          ))}
        </div>
      )}

      {/* Add new category */}
      {showNew ? (
        <div className="wiz-new-cat fadein">
          <input
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            placeholder="New category name…"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
          />
          <button className="btn btn-p" onClick={handleAddCategory}>Add</button>
          <button className="btn btn-g" onClick={() => setShowNew(false)}>Cancel</button>
        </div>
      ) : (
        <button className="btn-add" onClick={() => setShowNew(true)}>+ Add a new category</button>
      )}
    </div>
  )
}

function PayeeGroup({ group, categories, assigned, yearly, suggestYearly, onAssign, onToggleYearly, defaultExpanded }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const assignedCat = categories.find(c => c.id === assigned)

  return (
    <div className={`wiz-payee-group${assigned ? ' assigned' : ''}`}>
      <div className="wiz-payee-group-hdr" onClick={() => setExpanded(e => !e)}>
        <div className="wiz-payee-group-left">
          <span className="wiz-payee-desc">{group.description}</span>
          <span className="wiz-payee-meta">
            {group.count} transaction{group.count === 1 ? '' : 's'} · <span className="mono">{fmt(group.total)}</span>
          </span>
        </div>
        <div className="wiz-payee-group-right">
          {yearly && <span className="wiz-yearly-badge-sm">📅 Yearly</span>}
          {assignedCat && (
            <span className="badge" style={{ background: assignedCat.color + '22', color: assignedCat.color, borderColor: assignedCat.color + '55', fontSize: '.72rem' }}>
              {assignedCat.name}
            </span>
          )}
          <span className="mob-chevron">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <>
        <div className="wiz-payee-yearly-row">
          <label className="wiz-yearly-toggle" onClick={e => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={!!yearly}
              onChange={() => onToggleYearly()}
            />
            <span className="wiz-yearly-check-box" />
            <span className="wiz-yearly-label">This is a yearly expense</span>
          </label>
          {suggestYearly && !yearly && (
            <span className="wiz-yearly-hint">appears only once — might be annual?</span>
          )}
        </div>
        <div className="wiz-cat-palette fadein">
          {categories.map(cat => (
            <button
              key={cat.id}
              className={`wiz-cat-chip${assigned === cat.id ? ' selected' : ''}`}
              style={{
                '--chip-color': cat.color,
                background: assigned === cat.id ? cat.color : cat.color + '18',
                color: assigned === cat.id ? '#fff' : cat.color,
                borderColor: cat.color + '66',
              }}
              onClick={() => onAssign(cat.id)}
            >
              {cat.name}
            </button>
          ))}
          <button
            className="wiz-cat-chip"
            style={{ background: '#f5f0ea', color: 'var(--ink3)', borderColor: 'var(--border2)' }}
            onClick={() => onAssign(null)}
          >
            Skip
          </button>
        </div>
        </>
      )}
    </div>
  )
}
