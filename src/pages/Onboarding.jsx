import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useGlobalPatterns } from '../hooks/useGlobalPatterns'
import { seedCategories, seedFallbackBudget, seedFromTransactions } from '../lib/seed'
import { DEFAULT_CATEGORIES } from '../lib/seedData'
import { collapseToCategories, calculateBudgets, estimateMonths } from '../lib/transactionAnalysis'
import { normalizePattern } from '../lib/fuzzyMatch'
import { fmt } from '../lib/format'
import WizardCsvStep from '../components/wizard/WizardCsvStep'
import WizardIncomeStep from '../components/wizard/WizardIncomeStep'
import WizardExpenseStep from '../components/wizard/WizardExpenseStep'
import WizardBudgetStep from '../components/wizard/WizardBudgetStep'
import StepTrack from '../components/wizard/StepTrack'
import './Onboarding.css'

class StepBoundary extends React.Component {
  constructor(p) { super(p); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '1rem', color: 'var(--red)' }}>
          <strong>Something went wrong on this step.</strong>
          <pre style={{ fontSize: '.75rem', marginTop: '.5rem', whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
          </pre>
          <button className="btn btn-g" style={{ marginTop: '1rem' }}
            onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const STEPS = [
  { label: 'Welcome' },
  { label: 'Statements' },
  { label: 'Income' },
  { label: 'Expenses' },
  { label: 'Budget' },
  { label: 'Done' },
]

// Fix #6 — bank-specific CSV export instructions
const BANK_TIPS = [
  { bank: 'Chase',           tip: 'Sign in → choose an account → Activity → Download Account Activity → select date range → CSV' },
  { bank: 'Bank of America', tip: 'Sign in → Accounts → Download → choose date range → Comma Delimited (CSV)' },
  { bank: 'Wells Fargo',     tip: 'Sign in → Accounts tab → Download Account Activity → select dates → Download (.csv)' },
  { bank: 'Truist',          tip: 'Sign in → Account Activity → Export → CSV' },
  { bank: 'Capital One',     tip: 'Sign in → account → Download Transactions → CSV' },
  { bank: 'Citi',            tip: 'Sign in → Account Details → Download → CSV' },
  { bank: 'US Bank',         tip: 'Sign in → Transactions → Download → CSV format' },
  { bank: 'Other banks',     tip: 'Look for "Download," "Export," or "Account Activity" in your online banking. Choose CSV or Comma Separated Values format.' },
]

export default function Onboarding() {
  const { user } = useAuth()
  const { patterns: globalPatterns } = useGlobalPatterns()
  const navigate  = useNavigate()

  const [step,    setStep]    = useState(1)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  // Fix #5 — goal question removed; only name and household remain
  const [name,      setName]      = useState('')
  const [household, setHousehold] = useState('')

  // Fix #6 — CSV tip panel toggle
  const [showCsvTip, setShowCsvTip] = useState(false)

  // Step 2 — CSV staging
  const [pendingBanks, setPendingBanks] = useState([])

  // Working categories
  const [categories, setCategories] = useState(
    DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: `seed-${i}`, user_id: null }))
  )
  const [userCategories, setUserCategories] = useState([])

  // Step 3 — income
  const [incomeSelections, setIncomeSelections] = useState({})

  // Step 4 — expense assignments
  const [assignments, setAssignments] = useState({})

  // Step 4 — yearly payee keys (Set of payee keys flagged as annual)
  const [yearlyKeys, setYearlyKeys] = useState(new Set())

  // Step 5 — budget overrides + slider
  const [budgetOverrides, setBudgetOverrides] = useState({})
  const [savingsPct,      setSavingsPct]      = useState(0)

  const allTransactions = useMemo(() =>
    pendingBanks.flatMap((b, bi) =>
      b.transactions.map(tx => ({ ...tx, stagingBankId: `bank-${bi}` }))
    ), [pendingBanks])

  const debitTx = allTransactions.filter(t => t.amount < 0)

  function canAdvanceFrom(s) { return true }

  async function handleNext() {
    setError('')

    if (step === 2) {
      setLoading(true)
      if (pendingBanks.length === 0) {
        const { catMap, error } = await seedCategories(user.id)
        if (error) { setError(error.message); setLoading(false); return }
        await seedFallbackBudget(user.id, catMap)
        setLoading(false)
        navigate('/dashboard', { replace: true })
        return
      }
      const { catMap, error: catErr } = await seedCategories(user.id)
      if (catErr) { setError(catErr.message); setLoading(false); return }
      setCategories(prev => prev.map(c => {
        const realId = catMap[c.name]
        return realId ? { ...c, id: realId } : c
      }))
      setLoading(false)
      setStep(3)
      return
    }

    if (step === 5) {
      setLoading(true)
      try {
        const err = await handleCommit()
        setLoading(false)
        if (err) { setError(err.message ?? String(err)); return }
        setStep(6)
      } catch (e) {
        setLoading(false)
        setError(e.message ?? 'Something went wrong saving your budget. Please try again.')
      }
      return
    }

    setStep(s => s + 1)
  }

  async function handleCommit() {
    const months = estimateMonths(allTransactions)

    const taggedGroups = Object.entries(assignments).map(([key, catId]) => {
      const cat    = categories.find(c => c.id === catId)
      const groupTx = debitTx.filter(tx => normalizePattern(tx.description) === key)
      const total  = groupTx.reduce((s, t) => s + Math.abs(t.amount), 0)
      return { key, assignedCategoryId: catId, assignedCategoryName: cat?.name ?? '', total }
    }).filter(g => g.assignedCategoryId)

    const categoryTotals = collapseToCategories(taggedGroups, categories)
    const budgets        = calculateBudgets(categoryTotals, months, savingsPct, budgetOverrides, categories)

    const incomeRows = Object.entries(incomeSelections)
      .filter(([, s]) => s.checked)
      .map(([, s], i) => ({
        label:    s.label || 'Income',
        budgeted: Math.floor((s.total || 0) / months),
        actual:   Math.floor((s.total || 0) / months),
        note:     '',
        sort_order: i,
      }))
    if (!incomeRows.length) {
      incomeRows.push({ label: 'Income', budgeted: 0, actual: 0, note: '', sort_order: 0 })
    }

    // Yearly payees become individual expense_items (one per payee, not per category)
    // so they show as named subscriptions on the Yearly tab
    const yearlyExpenseRows = [...yearlyKeys].map((key, i) => {
      const catId   = assignments[key]
      const cat     = categories.find(c => c.id === catId)
      // Get all transactions for this payee to get the real annual total
      const groupTx = debitTx.filter(tx => normalizePattern(tx.description) === key)
      const total   = groupTx.reduce((s, t) => s + Math.abs(t.amount), 0)
      // Use the original description as the label (prettified)
      const label   = groupTx[0]?.description ?? key
      return {
        label,
        category_id: catId ?? null,
        budgeted:    Math.round(total),  // full annual amount
        actual:      Math.round(total),
        frequency:   'annual',
        note:        '',
        sort_order:  1000 + i,           // after monthly items
      }
    }).filter(r => r.category_id)

    // Monthly expenseRows: exclude any categories that are ONLY yearly
    // (categories shared by monthly + yearly payees still appear monthly)
    const yearlyCatIds = new Set(
      [...yearlyKeys].map(key => assignments[key]).filter(Boolean)
    )
    // A category is monthly-only if it has at least one non-yearly payee assigned to it
    const monthlyCatIds = new Set(
      Object.entries(assignments)
        .filter(([key]) => !yearlyKeys.has(key))
        .map(([, catId]) => catId)
        .filter(Boolean)
    )

    const expenseRows = [
      // Monthly: category-level rows, excluding purely-yearly categories
      ...categoryTotals
        .filter(cat => monthlyCatIds.has(cat.categoryId))
        .map((cat, i) => ({
          label:       cat.categoryName,
          category_id: cat.categoryId,
          budgeted:    budgets[cat.categoryId] ?? 0,
          actual:      Math.floor(cat.total / months),
          frequency:   'monthly',
          note:        '',
          sort_order:  i,
        })),
      // Yearly: individual payee rows
      ...yearlyExpenseRows,
    ]

    const payeeRuleMap = {}
    for (const [key, catId] of Object.entries(assignments)) {
      if (catId) payeeRuleMap[key] = catId
    }

    const bankAccountsWithIds = pendingBanks.map((b, i) => ({ ...b, stagingId: `bank-${i}` }))

    const taggedTx = allTransactions.map(tx => ({
      ...tx,
      assignedCategoryId: assignments[normalizePattern(tx.description)] ?? null,
    }))

    const { error } = await seedFromTransactions(user.id, {
      incomeRows, expenseRows, bankAccounts: bankAccountsWithIds,
      transactions: taggedTx, payeeRuleMap, userCategories,
    })
    return error ?? null
  }

  function handleFinish() {
    navigate('/dashboard', { replace: true })
  }

  function handleToggleYearly(key) {
    // User explicitly clicked — toggle on/off
    setYearlyKeys(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function handleAutoSetYearly(key) {
    // Called by auto-detection — only adds, never removes user's choices
    setYearlyKeys(prev => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }

  function handleAddCategory(newCat) {
    const tempId  = `user-${Date.now()}`
    const withId  = { ...newCat, id: tempId, user_id: null }
    setCategories(prev => [...prev, withId])
    setUserCategories(prev => [...prev, withId])
  }

  const hasBanks = pendingBanks.length > 0
  const txCount  = allTransactions.length

  // Fix #15 — "Spending Categories" count for done screen
  const activeCatCount = useMemo(() => {
    if (!assignments) return 0
    const ids = new Set(Object.values(assignments).filter(Boolean))
    return ids.size
  }, [assignments])

  return (
    <div className="wiz-overlay-page">
      <div className="wiz-modal-page fadein">

        <div className="wiz-header">
          <div className="wiz-logo">💵 Budget Setup</div>
          <StepTrack step={step} steps={STEPS} />
        </div>

        <div className="wiz-body">
          {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

          {/* Step 1: Welcome — fix #5: goal question removed */}
          {step === 1 && (
            <div className="fadein">
              <div className="wiz-step-title">Welcome! Let's get started.</div>
              <div className="wiz-step-hint">
                We'll walk you through importing your bank statements so your budget
                is built from real numbers — not guesses — from day one.
              </div>
              <div className="wiz-greeting-grid">
                <div className="wiz-field">
                  <label>Your name <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>(optional)</span></label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sarah" autoFocus />
                </div>
                <div className="wiz-field">
                  <label>Household size <span style={{ color: 'var(--ink3)', fontWeight: 400 }}>(optional)</span></label>
                  <input type="number" min="1" max="20" value={household}
                    onChange={e => setHousehold(e.target.value)} placeholder="e.g. 4" />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Upload — fix #6: CSV export tip */}
          {step === 2 && (
            <div className="fadein">
              <div className="wiz-step-title">Upload your bank statements</div>
              <div className="wiz-step-hint">
                Export a CSV from each bank or credit card you use. We'll analyze your
                transactions to build your budget from real spending.
              </div>

              {/* Fix #6 — expandable CSV instructions */}
              <div className="wiz-csv-tip">
                <button
                  className="wiz-csv-tip-toggle"
                  onClick={() => setShowCsvTip(v => !v)}
                >
                  {showCsvTip ? '▲' : '▼'} How do I export a CSV from my bank?
                </button>
                {showCsvTip && (
                  <div className="wiz-csv-tip-body fadein">
                    {BANK_TIPS.map(({ bank, tip }) => (
                      <div key={bank} className="wiz-csv-tip-row">
                        <span className="wiz-csv-tip-bank">{bank}</span>
                        <span className="wiz-csv-tip-text">{tip}</span>
                      </div>
                    ))}
                    <p className="wiz-csv-tip-note">
                      Tip: exporting 2–3 months of history gives Budget a more accurate
                      baseline than a single month.
                    </p>
                  </div>
                )}
              </div>

              <WizardCsvStep
                expenseItems={[]}
                pendingBanks={pendingBanks}
                onAddBank={b => setPendingBanks(prev => [...prev, b])}
                onRemoveBank={i => setPendingBanks(prev => prev.filter((_, idx) => idx !== i))}
              />
            </div>
          )}

          {/* Step 3: Income */}
          {step === 3 && (
            <div className="fadein">
              <div className="wiz-step-title">Which deposits are income?</div>
              <div className="wiz-step-hint">
                We found {allTransactions.filter(t => t.amount > 0).length} deposits
                across your statements.
              </div>
              <WizardIncomeStep
                transactions={allTransactions}
                selections={incomeSelections}
                onChange={setIncomeSelections}
              />
            </div>
          )}

          {/* Step 4: Categorize */}
          {step === 4 && (
            <StepBoundary key={step}><div className="fadein">
              <div className="wiz-step-title">Categorize your spending</div>
              <div className="wiz-step-hint">
                Assign each payee to a category. We've pre-matched what we can —
                review the rest and click the right category for each one.
              </div>
              <WizardExpenseStep
                transactions={debitTx}
                categories={categories}
                assignments={assignments}
                yearlyKeys={yearlyKeys}
                globalPatterns={globalPatterns}
                onChange={setAssignments}
                onSetYearly={handleAutoSetYearly}
                onAddCategory={handleAddCategory}
              />
            </div>
          </StepBoundary>
          )}

          {/* Step 5: Budget */}
          {step === 5 && (
            <div className="fadein">
              <div className="wiz-step-title">Set your budget</div>
              <div className="wiz-step-hint">
                Based on your real spending, here's a suggested budget. Use the slider
                to set a savings target, or adjust any category individually.
              </div>
              <WizardBudgetStep
                transactions={debitTx}
                incomeSelections={incomeSelections}
                categories={categories}
                assignments={assignments}
                budgetOverrides={budgetOverrides}
                onOverridesChange={setBudgetOverrides}
                savingsPct={savingsPct}
                onSavingsPctChange={setSavingsPct}
              />
            </div>
          )}

          {/* Step 6: Done — fix #15: "Spending Categories" */}
          {step === 6 && (
            <div className="fadein" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '.75rem' }}>🎉</div>
              <div className="wiz-step-title">Your budget is ready{name ? `, ${name}` : ''}!</div>
              <div className="wiz-step-hint" style={{ marginBottom: '1.5rem' }}>
                {hasBanks
                  ? `We imported ${txCount} transactions, built your budget from real spending, and set your actuals from day one. Your Dashboard has real numbers.`
                  : 'Your budget is set up with 17 default categories. Head to Reconcile anytime to import a bank statement and populate your actuals.'}
              </div>
              <div className="wiz-summary-grid" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
                <div className="wiz-scard">
                  <div className="wiz-scard-val">{txCount}</div>
                  <div className="wiz-scard-lbl">Transactions</div>
                </div>
                <div className="wiz-scard">
                  <div className="wiz-scard-val" style={{ color: 'var(--green)' }}>
                    {Object.values(incomeSelections).filter(s => s.checked).length}
                  </div>
                  <div className="wiz-scard-lbl">Income Sources</div>
                </div>
                {/* Fix #15 — renamed from "Categories Active" */}
                <div className="wiz-scard">
                  <div className="wiz-scard-val" style={{ color: 'var(--blue)' }}>
                    {activeCatCount}
                  </div>
                  <div className="wiz-scard-lbl">Spending Categories</div>
                </div>
              </div>
              <div className="alert alert-info" style={{ textAlign: 'left', fontSize: '.84rem' }}>
                💡 At the end of each month, go to <strong>🔄 Reconcile</strong> to import
                your latest statement and apply it to your budget — your actuals update automatically.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="wiz-footer">
          {step > 1 && step < 6
            ? <button className="wiz-skip" onClick={() => setStep(s => s - 1)}>← Back</button>
            : <span style={{ flex: 1 }} />}

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '.78rem', color: 'var(--ink3)' }}>Step {step} of {STEPS.length}</span>
            {step < 6 && step !== 2 && (
              <button className="wiz-skip" onClick={handleFinish}>Skip setup</button>
            )}
            {step === 2 && (
              <button className="wiz-skip" onClick={async () => {
                setLoading(true)
                const { catMap, error } = await seedCategories(user.id)
                if (!error) await seedFallbackBudget(user.id, catMap)
                setLoading(false)
                navigate('/dashboard', { replace: true })
              }}>
                Skip — set up manually
              </button>
            )}
            {step < 6 && (
              <button className="btn btn-p" disabled={loading || !canAdvanceFrom(step)} onClick={handleNext}>
                {loading
                  ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Working…</>
                  : step === 2 && !hasBanks ? 'Skip statements →'
                  : step === 5 ? 'Save my budget →'
                  : 'Next →'}
              </button>
            )}
            {step === 6 && (
              <button className="btn btn-p" onClick={handleFinish}>Go to Dashboard →</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
