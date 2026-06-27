import { useState, useMemo } from 'react'
import { fmt } from '../../lib/format'
import { collapseToCategories, calculateBudgets, estimateMonths } from '../../lib/transactionAnalysis'
import './WizardSteps.css'

/**
 * Step 5: Set your budget.
 *
 * Props:
 *   transactions    — all staged debit transactions with assignedCategoryId
 *   incomeSelections — checked income groups with labels + totals
 *   categories      — full category list
 *   assignments     — { [payeeKey]: categoryId }
 *   budgetOverrides — { [categoryId]: manualAmount } — controlled from parent
 *   onOverridesChange — (overrides) => void
 *   savingsPct      — 0–50 — controlled from parent
 *   onSavingsPctChange — (pct) => void
 */
export default function WizardBudgetStep({
  transactions,
  incomeSelections,
  categories,
  assignments,
  budgetOverrides,
  onOverridesChange,
  savingsPct,
  onSavingsPctChange,
}) {
  // Tag each transaction with its assigned category
  const taggedTx = useMemo(() => transactions.map(tx => {
    const { normalizePattern } = require('../../lib/fuzzyMatch')
    const key = normalizePattern(tx.description)
    return { ...tx, assignedCategoryId: assignments[key] ?? null }
  }), [transactions, assignments])

  const months = useMemo(() => estimateMonths(transactions), [transactions])

  const categoryTotals = useMemo(() =>
    collapseToCategories(
      Object.entries(assignments).map(([key, catId]) => {
        const cat = categories.find(c => c.id === catId)
        const groupTx = taggedTx.filter(tx => {
          const { normalizePattern } = require('../../lib/fuzzyMatch')
          return normalizePattern(tx.description) === key
        })
        const total = groupTx.reduce((s, t) => s + Math.abs(t.amount), 0)
        return { key, assignedCategoryId: catId, assignedCategoryName: cat?.name ?? '', total, groups: [] }
      }),
      categories
    ),
    [assignments, taggedTx, categories]
  )

  const budgets = useMemo(() =>
    calculateBudgets(categoryTotals, months, savingsPct, budgetOverrides, categories),
    [categoryTotals, months, savingsPct, budgetOverrides, categories]
  )

  // Income totals
  const totalIncomeActual = Object.values(incomeSelections)
    .filter(s => s.checked)
    .reduce((sum, s) => sum + (s.total || 0), 0)
  const monthlyIncome = totalIncomeActual / months

  const totalBudgetedExpenses = Object.values(budgets).reduce((s, v) => s + v, 0)
  const netMonthly = monthlyIncome - totalBudgetedExpenses
  const additionalSavings = Object.entries(budgets)
    .filter(([catId]) => {
      const cat = categories.find(c => c.id === catId)
      return cat && !['Housing', 'Savings'].some(n => cat.name.toLowerCase().includes(n.toLowerCase()))
    })
    .reduce((s, [catId]) => {
      const actual = (categoryTotals.find(c => c.categoryId === catId)?.total ?? 0) / months
      return s + Math.max(0, actual - (budgets[catId] ?? actual))
    }, 0)

  function handleOverride(catId, val) {
    const num = parseFloat(val)
    if (isNaN(num)) return
    onOverridesChange({ ...budgetOverrides, [catId]: Math.max(0, num) })
  }

  function clearOverride(catId) {
    const next = { ...budgetOverrides }
    delete next[catId]
    onOverridesChange(next)
  }

  return (
    <div>
      <p className="wiz-step-hint">
        Based on <strong>{months < 1.5 ? '1 month' : `${Math.round(months)} months`}</strong> of transactions,
        here's your spending by category. Adjust the savings target or any individual amount to set your budget.
      </p>

      {/* Summary row */}
      <div className="wiz-summary-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="wiz-scard">
          <div className="wiz-scard-val v-green">{fmt(monthlyIncome)}</div>
          <div className="wiz-scard-lbl">Monthly Income</div>
        </div>
        <div className="wiz-scard">
          <div className="wiz-scard-val v-red">{fmt(totalBudgetedExpenses)}</div>
          <div className="wiz-scard-lbl">Budgeted Expenses</div>
        </div>
        <div className="wiz-scard">
          <div className="wiz-scard-val" style={{ color: netMonthly >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {netMonthly >= 0 ? '+' : ''}{fmt(netMonthly)}
          </div>
          <div className="wiz-scard-lbl">Monthly Net</div>
        </div>
      </div>

      {/* Savings target slider */}
      <div className="wiz-slider-card">
        <div className="wiz-slider-hdr">
          <span>Savings target</span>
          <span className="wiz-slider-val">{savingsPct}% reduction in discretionary spending</span>
        </div>
        <input
          type="range" min="0" max="50" step="1"
          value={savingsPct}
          onChange={e => onSavingsPctChange(parseInt(e.target.value))}
          className="wiz-slider"
        />
        <div className="wiz-slider-labels">
          <span>0% (spend as-is)</span>
          <span>25%</span>
          <span>50%</span>
        </div>
        {additionalSavings > 0 && (
          <div className="wiz-slider-impact">
            At {savingsPct}% you'd save an additional <strong className="v-green">{fmt(additionalSavings)}/month</strong>
          </div>
        )}
      </div>

      {/* Per-category budget table */}
      <div className="tbl-wrap" style={{ marginTop: '1rem' }}>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th className="r">Actual / mo</th>
              <th className="r">Budget</th>
              <th style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {categoryTotals.map(cat => {
              const monthlyActual = cat.total / months
              const budget = budgets[cat.categoryId] ?? Math.floor(monthlyActual)
              const isOverridden = budgetOverrides[cat.categoryId] !== undefined
              const catObj = categories.find(c => c.id === cat.categoryId)

              return (
                <tr key={cat.categoryId}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                      {catObj && <span style={{ width: 8, height: 8, borderRadius: '50%', background: catObj.color, flexShrink: 0, display: 'inline-block' }} />}
                      <span style={{ fontSize: '.875rem' }}>{cat.categoryName}</span>
                    </div>
                  </td>
                  <td className="r mono" style={{ fontSize: '.85rem', color: 'var(--ink3)' }}>
                    {fmt(monthlyActual)}
                  </td>
                  <td className="r">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={budget}
                      onChange={e => handleOverride(cat.categoryId, e.target.value)}
                      className="wiz-budget-input"
                      style={{ borderColor: isOverridden ? 'var(--blue)' : undefined }}
                    />
                  </td>
                  <td>
                    {isOverridden && (
                      <button
                        className="del-btn"
                        title="Reset to suggested"
                        onClick={() => clearOverride(cat.categoryId)}
                      >↺</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="r mono">{fmt(categoryTotals.reduce((s, c) => s + c.total / months, 0))}</td>
              <td className="r mono">{fmt(totalBudgetedExpenses)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
