import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { seedCategories, seedFallbackBudget, seedFromTransactions } from '../lib/seed'
import { DEFAULT_CATEGORIES } from '../lib/seedData'
import { parseCSV, getCSVHeaders, extractTransactions } from '../lib/csvParser'
import { collapseToCategories, estimateMonths, calculateBudgets } from '../lib/transactionAnalysis'
import { normalizePattern } from '../lib/fuzzyMatch'
import { fmt } from '../lib/format'
import WizardCsvStep from '../components/wizard/WizardCsvStep'
import WizardIncomeStep from '../components/wizard/WizardIncomeStep'
import WizardExpenseStep from '../components/wizard/WizardExpenseStep'
import WizardBudgetStep from '../components/wizard/WizardBudgetStep'
import './Onboarding.css'

const STEPS = [
  { label: 'Welcome' },
  { label: 'Statements' },
  { label: 'Income' },
  { label: 'Expenses' },
  { label: 'Budget' },
  { label: 'Done' },
]

const GOALS = [
  { id: 'track', label: '📊 Just track spending' },
  { id: 'save',  label: '💰 Build savings' },
  { id: 'debt',  label: '📉 Pay down debt' },
  { id: 'plan',  label: '🎯 Plan a big goal' },
]

export default function Onboarding() {
  const { user } = useAuth()
  const navigate  = useNavigate()

  const [step,    setStep]    = useState(1)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  // Step 1
  const [name,      setName]      = useState('')
  const [household, setHousehold] = useState('')
  const [goal,      setGoal]      = useState('')

  // Step 2 — CSV staging (same as before)
  const [pendingBanks, setPendingBanks] = useState([])

  // Working categories — seeded defaults + any user-added during step 4
  // We keep these in memory during the wizard; they get written to DB at completion
  const [categories, setCategories] = useState(
    DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: `seed-${i}`, user_id: null }))
  )

  // User-created categories (added during step 4) — tracked separately
  // so we can pass them to seedFromTransactions for DB insertion
  const [userCategories, setUserCategories] = useState([])

  // Step 3 — income selections
  // { [payeeKey]: { checked, label, total, avgPerOccurrence } }
  const [incomeSelections, setIncomeSelections] = useState({})

  // Step 4 — expense category assignments
  // { [payeeKey]: categoryId }
  const [assignments, setAssignments] = useState({})

  // Step 5 — budget overrides + savings slider
  const [budgetOverrides,  setBudgetOverrides]  = useState({})
  const [savingsPct,       setSavingsPct]        = useState(0)

  // All staged transactions flattened across all banks
  const allTransactions = useMemo(() =>
    pendingBanks.flatMap((b, bi) =>
      b.transactions.map(tx => ({ ...tx, stagingBankId: `bank-${bi}` }))
    ), [pendingBanks])

  const debitTx = allTransactions.filter(t => t.amount < 0)

  // ── Navigation helpers ────────────────────────────────────────────────────

  function canAdvanceFrom(s) {
    if (s === 1) return true // name/goal optional
    if (s === 2) return true // CSV optional — skip allowed
    if (s === 3) return true // income optional
    if (s === 4) return true // can advance even with unassigned payees
    if (s === 5) return true
    return true
  }

  async function handleNext() {
    setError('')

    // Step 2 → 3: seed categories in DB now (needed for IDs in later steps)
    if (step === 2) {
      setLoading(true)
      // If no banks uploaded, go straight to fallback
      if (pendingBanks.length === 0) {
        const { catMap, error } = await seedCategories(user.id)
        if (error) { setError(error.message); setLoading(false); return }
        await seedFallbackBudget(user.id, catMap)
        setLoading(false)
        navigate('/dashboard', { replace: true })
        return
      }

      // Seed categories, get real DB ids
      const { catMap, error: catErr } = await seedCategories(user.id)
      if (catErr) { setError(catErr.message); setLoading(false); return }

      // Replace temp seed ids with real DB ids on our local category list
      setCategories(prev => prev.map(c => {
        const realId = catMap[c.name]
        return realId ? { ...c, id: realId } : c
      }))
      setLoading(false)
      setStep(3)
      return
    }

    // Step 5 → 6: write everything to DB
    if (step === 5) {
      setLoading(true)
      const err = await handleCommit()
      setLoading(false)
      if (err) { setError(err.message); return }
      setStep(6)
      return
    }

    setStep(s => s + 1)
  }

  // ── Commit to DB at end of step 5 ─────────────────────────────────────────
  async function handleCommit() {
    const months = estimateMonths(allTransactions)

    // Resolve category totals for budget calculation
    const taggedGroups = Object.entries(assignments).map(([key, catId]) => {
      const cat = categories.find(c => c.id === catId)
      const groupTx = debitTx.filter(tx => normalizePattern(tx.description) === key)
      const total = groupTx.reduce((s, t) => s + Math.abs(t.amount), 0)
      return { key, assignedCategoryId: catId, assignedCategoryName: cat?.name ?? '', total }
    }).filter(g => g.assignedCategoryId)

    const categoryTotals = collapseToCategories(taggedGroups, categories)
    const budgets = calculateBudgets(categoryTotals, months, savingsPct, budgetOverrides, categories)

    // Build income rows
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

    // Build expense rows — one per category
    const expenseRows = categoryTotals.map((cat, i) => ({
      label:       cat.categoryName,
      category_id: cat.categoryId,
      budgeted:    budgets[cat.categoryId] ?? 0,
      actual:      Math.floor(cat.total / months),
      note:        '',
      sort_order:  i,
    }))

    // Build payee rule map: pattern → categoryId
    const payeeRuleMap = {}
    for (const [key, catId] of Object.entries(assignments)) {
      if (catId) payeeRuleMap[key] = catId
    }

    // Bank configs with staging IDs
    const bankAccountsWithIds = pendingBanks.map((b, i) => ({
      ...b,
      stagingId: `bank-${i}`,
    }))

    // Tag each transaction with its assigned category and staging bank id
    const taggedTx = allTransactions.map(tx => ({
      ...tx,
      assignedCategoryId: assignments[normalizePattern(tx.description)] ?? null,
    }))

    const { error } = await seedFromTransactions(user.id, {
      incomeRows,
      expenseRows,
      bankAccounts: bankAccountsWithIds,
      transactions: taggedTx,
      payeeRuleMap,
      userCategories,
    })

    return error ?? null
  }

  function handleFinish() {
    navigate('/dashboard', { replace: true })
  }

  function handleAddCategory(newCat) {
    // Temporary id until committed — WizardExpenseStep uses it for assignment keys
    const tempId = `user-${Date.now()}`
    const withId = { ...newCat, id: tempId, user_id: null }
    setCategories(prev => [...prev, withId])
    setUserCategories(prev => [...prev, withId])
  }

  const hasBanks = pendingBanks.length > 0
  const txCount  = allTransactions.length

  return (
    <div className="wiz-overlay-page">
      <div className="wiz-modal-page fadein">

        {/* Header */}
        <div className="wiz-header">
          <div className="wiz-logo">💵 Budget Setup</div>
          <div className="wiz-step-track">
            {STEPS.map((s, i) => {
              const n   = i + 1
              const cls = n < step ? 'done' : n === step ? 'active' : 'future'
              return (
                <div key={s.label} className="wiz-step-wrap">
                  <div className={`wiz-step-dot ${cls}`}>{n < step ? '✓' : n}</div>
                  <div className="wiz-step-label" style={{ color: n === step ? '#e8d58a' : '#6b7f94' }}>
                    {s.label}
                  </div>
                  {i < STEPS.length - 1 && <div className={`wiz-step-line${n < step ? ' done' : ''}`} />}
                </div>
              )
            })}
          </div>
        </div>

        {/* Body */}
        <div className="wiz-body">
          {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

          {/* Step 1: Welcome */}
          {step === 1 && (
            <div className="fadein">
              <div className="wiz-step-title">Welcome! Let's get started.</div>
              <div className="wiz-step-hint">
                We'll walk you through importing your bank statements so your budget is built from
                real numbers — not guesses — from day one.
              </div>
              <div className="wiz-greeting-grid">
                <div className="wiz-field">
                  <label>Your name</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sarah" autoFocus />
                </div>
                <div className="wiz-field">
                  <label>Household size</label>
                  <input type="number" min="1" max="20" value={household} onChange={e => setHousehold(e.target.value)} placeholder="e.g. 4" />
                </div>
              </div>
              <div className="wiz-field" style={{ marginBottom: '1rem' }}>
                <label>What's your main goal?</label>
                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.35rem' }}>
                  {GOALS.map(g => (
                    <button key={g.id} className={`freq-btn${goal === g.id ? ' active' : ''}`} onClick={() => setGoal(g.id)} type="button">
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Upload statements */}
          {step === 2 && (
            <div className="fadein">
              <div className="wiz-step-title">Upload your bank statements</div>
              <div className="wiz-step-hint">
                Export a CSV from each bank or credit card you use. We'll analyze your transactions
                to build your budget from real spending — no manual entry needed.
              </div>
              <WizardCsvStep
                expenseItems={[]}
                pendingBanks={pendingBanks}
                onAddBank={b => setPendingBanks(prev => [...prev, b])}
                onRemoveBank={i => setPendingBanks(prev => prev.filter((_, idx) => idx !== i))}
              />
            </div>
          )}

          {/* Step 3: Identify income */}
          {step === 3 && (
            <div className="fadein">
              <div className="wiz-step-title">Which deposits are income?</div>
              <div className="wiz-step-hint">
                We found {allTransactions.filter(t => t.amount > 0).length} deposits across your statements.
                Check the ones that are regular income — paychecks, freelance payments, side income.
                Uncheck transfers, refunds, or one-time deposits.
              </div>
              <WizardIncomeStep
                transactions={allTransactions}
                selections={incomeSelections}
                onChange={setIncomeSelections}
              />
            </div>
          )}

          {/* Step 4: Categorize expenses */}
          {step === 4 && (
            <div className="fadein">
              <div className="wiz-step-title">Categorize your spending</div>
              <div className="wiz-step-hint">
                Assign each payee to a category. We've pre-matched what we can —
                review the rest and click the right category for each one.
              </div>
              <WizardExpenseStep
                transactions={debitTx}
                categories={categories}
                assignments={assignments}
                onChange={setAssignments}
                onAddCategory={handleAddCategory}
              />
            </div>
          )}

          {/* Step 5: Set budget */}
          {step === 5 && (
            <div className="fadein">
              <div className="wiz-step-title">Set your budget</div>
              <div className="wiz-step-hint">
                Based on your real spending, here's a suggested budget. Use the slider to
                set a savings target, or adjust any category individually.
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

          {/* Step 6: Done */}
          {step === 6 && (
            <div className="fadein" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '.75rem' }}>🎉</div>
              <div className="wiz-step-title">Your budget is ready{name ? `, ${name}` : ''}!</div>
              <div className="wiz-step-hint" style={{ marginBottom: '1.5rem' }}>
                {hasBanks
                  ? `We imported ${txCount} transactions, built your budget from real spending, and set your actuals from day one. Your Dashboard has real numbers.`
                  : 'Your budget is set up with the 17 default categories. Head to Reconcile anytime to import a bank statement and populate your actuals.'}
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
                <div className="wiz-scard">
                  <div className="wiz-scard-val" style={{ color: 'var(--blue)' }}>
                    {Object.values(assignments).filter(Boolean).length > 0
                      ? collapseToCategories(
                          Object.entries(assignments).filter(([,v])=>v).map(([k,v])=>({key:k,assignedCategoryId:v,assignedCategoryName:'',total:0})),
                          categories
                        ).length
                      : 0}
                  </div>
                  <div className="wiz-scard-lbl">Categories Active</div>
                </div>
              </div>
              <div className="alert alert-info" style={{ textAlign: 'left', fontSize: '.84rem' }}>
                💡 At the end of each month, go to <strong>🔄 Reconcile</strong> to import your latest statement
                and apply it to your budget — your actuals update automatically.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="wiz-footer">
          {step > 1 && step < 6
            ? <button className="wiz-skip" onClick={() => setStep(s => s - 1)}>← Back</button>
            : <span />}

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
              <button className="btn btn-p" onClick={handleFinish}>
                Go to Dashboard →
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
