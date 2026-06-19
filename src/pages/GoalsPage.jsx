import { useState } from 'react'
import EditableCell from '../components/ui/EditableCell'
import { fmt } from '../lib/format'
import './GoalsPage.css'

const GOAL_COLORS = ['#1a3a6b', '#1a6b3a', '#b8860b', '#4a1a6b', '#0a4a4a']

export default function GoalsPage({ goalsHook }) {
  const { goals, loading, updateGoal, addGoal, deleteGoal, addSampleGoals, totals } = goalsHook

  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('Short-Term')
  const [newTarget, setNewTarget] = useState('')
  const [newSaved, setNewSaved] = useState('')
  const [newMonthly, setNewMonthly] = useState('')
  const [newDate, setNewDate] = useState('')

  if (loading) return <div className="loading-center"><span className="spinner" /> Loading…</div>

  async function handleAdd() {
    if (!newName.trim()) return
    await addGoal({
      name: newName.trim(),
      type: newType,
      target: parseFloat(newTarget) || 0,
      saved: parseFloat(newSaved) || 0,
      monthly: parseFloat(newMonthly) || 0,
      target_date: newDate.trim(),
    })
    setNewName(''); setNewType('Short-Term'); setNewTarget('')
    setNewSaved(''); setNewMonthly(''); setNewDate('')
    setShowAdd(false)
  }

  return (
    <div className="fadein">
      <div className="sec-hdr">
        <span className="sec-title">Savings Goals</span>
        <span className="sec-hint">Short- &amp; long-term targets</span>
      </div>

      <div className="summary-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="scard">
          <div className="slabel">Monthly Toward Goals</div>
          <div className="sval v-blue">{fmt(totals.totalMonthly)}</div>
          <div className="ssub">across {goals.length} goal{goals.length === 1 ? '' : 's'}</div>
        </div>
        <div className="scard">
          <div className="slabel">Total Saved</div>
          <div className="sval v-green">{fmt(totals.totalSaved)}</div>
          <div className="ssub">of {fmt(totals.totalTarget)} target</div>
        </div>
      </div>

      {goals.length === 0 ? (
        <div className="empty-state card" style={{ padding: '3rem', marginBottom: '1.5rem' }}>
          <div className="empty-state-icon">🎯</div>
          <div className="empty-state-title">No savings goals yet</div>
          <div className="empty-state-body" style={{ marginBottom: '1rem' }}>
            Add your first goal below, or start with a few common ones.
          </div>
          <button className="btn btn-p" onClick={addSampleGoals}>+ Add sample goals</button>
        </div>
      ) : (
        <div className="goals-grid">
          {goals.map((g, i) => (
            <GoalCard
              key={g.id}
              goal={g}
              color={GOAL_COLORS[i % GOAL_COLORS.length]}
              onUpdate={updateGoal}
              onDelete={deleteGoal}
            />
          ))}
        </div>
      )}

      {showAdd ? (
        <div className="add-form fadein">
          <div className="fgrid">
            <div className="fg">
              <label>Goal name</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Emergency Fund"
                autoFocus
              />
            </div>
            <div className="fg">
              <label>Type</label>
              <select value={newType} onChange={e => setNewType(e.target.value)}>
                <option>Short-Term</option>
                <option>Long-Term</option>
              </select>
            </div>
            <div className="fg">
              <label>Target ($)</label>
              <input type="number" min="0" step="0.01" value={newTarget} onChange={e => setNewTarget(e.target.value)} placeholder="0.00" />
            </div>
            <div className="fg">
              <label>Already saved ($)</label>
              <input type="number" min="0" step="0.01" value={newSaved} onChange={e => setNewSaved(e.target.value)} placeholder="0.00" />
            </div>
            <div className="fg">
              <label>Monthly contribution ($)</label>
              <input type="number" min="0" step="0.01" value={newMonthly} onChange={e => setNewMonthly(e.target.value)} placeholder="0.00" />
            </div>
            <div className="fg">
              <label>Target date</label>
              <input value={newDate} onChange={e => setNewDate(e.target.value)} placeholder="e.g. Dec 2027" />
            </div>
          </div>
          <div className="btn-row">
            <button className="btn btn-p" onClick={handleAdd}>Add goal</button>
            <button className="btn btn-g" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn-add" onClick={() => setShowAdd(true)}>+ Add savings goal</button>
      )}
    </div>
  )
}

function GoalCard({ goal, color, onUpdate, onDelete }) {
  const target  = goal.target || 0
  const saved   = goal.saved || 0
  const monthly = goal.monthly || 0
  const pct     = target > 0 ? Math.min(1, saved / target) : 0
  const moLeft  = monthly > 0 && target > 0 ? Math.max(0, (target - saved) / monthly) : null

  return (
    <div className="goal-card card">
      <div className="goal-hdr">
        <EditableCell
          value={goal.name}
          onSave={v => onUpdate(goal.id, 'name', v)}
          className="goal-name"
        />
        <span
          className={`badge ${goal.type === 'Short-Term' ? 't-short' : 't-long'}`}
          onClick={() => onUpdate(goal.id, 'type', goal.type === 'Short-Term' ? 'Long-Term' : 'Short-Term')}
          title="Click to toggle"
        >
          {goal.type}
        </span>
      </div>

      <div className="prog-track">
        <div className="prog-fill" style={{ width: `${(pct * 100).toFixed(1)}%`, background: color }} />
      </div>

      <div className="goal-prog-row">
        <span><strong>{fmt(saved)}</strong> saved</span>
        <span>{(pct * 100).toFixed(1)}%</span>
        <span>of <strong>{fmt(target)}</strong></span>
      </div>

      <div className="goal-meta">
        <span>
          Monthly: <EditableCell value={monthly} type="currency" onSave={v => onUpdate(goal.id, 'monthly', v)} display={fmt} className="mono" />
        </span>
        <span>
          Saved: <EditableCell value={saved} type="currency" onSave={v => onUpdate(goal.id, 'saved', v)} display={fmt} className="mono" />
        </span>
        <span>
          Target: <EditableCell value={target} type="currency" onSave={v => onUpdate(goal.id, 'target', v)} display={fmt} className="mono" />
        </span>
        {moLeft != null && <span>{moLeft.toFixed(0)} mo to go</span>}
      </div>

      <div className="goal-footer">
        <EditableCell
          value={goal.target_date || ''}
          onSave={v => onUpdate(goal.id, 'target_date', v)}
          className="note-t"
          display={v => `📅 ${v || 'set date…'}`}
        />
        <button className="del-btn" onClick={() => onDelete(goal.id)} title="Delete goal">×</button>
      </div>
    </div>
  )
}
