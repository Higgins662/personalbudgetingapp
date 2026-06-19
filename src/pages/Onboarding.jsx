import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { seedNewUser } from '../lib/seed'
import { fmt } from '../lib/format'
import WizardCsvStep from '../components/wizard/WizardCsvStep'
import './Onboarding.css'

const STEPS = [
  { label: 'Welcome' },
  { label: 'Accounts' },
  { label: 'Income' },
  { label: 'Statements' },
  { label: 'Review' },
  { label: 'Done' },
]

const GOALS = [
  { id: 'track', label: '📊 Just track spending' },
  { id: 'save',  label: '💰 Build savings' },
  { id: 'debt',  label: '📉 Pay down debt' },
  { id: 'plan',  label: '🎯 Plan a big goal' },
]

const FREQS = ['Every Paycheck', 'Monthly', 'Biweekly', 'Weekly', 'Annual']

export default function Onboarding() {
  const { user } = useAuth()
  const navigate  = useNavigate()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1 — Welcome
  const [name, setName] = useState('')
  const [household, setHousehold] = useState('')
  const [goal, setGoal] = useState('')

  // Step 2 — Account names (just labels at this point, created for real in step 4)
  const [accountNames, setAccountNames] = useState([''])

  // Step 3 — Income
  const [incomeRows, setIncomeRows] = useState([{ name: '', amount: '', freq: 'Every Paycheck' }])

  // Step 4 — Multi-bank CSV staging
  const [pendingBanks, setPendingBanks] = useState([]) // [{ name, colMap, fileName, transactions }]

  // Created after seeding (needed in step 5 to label matches)
  const [expenseItems, setExpenseItems] = useState([]) // [{id, label, ...}] from DB after seed

  function addBankToPending(bank) {
    setPendingBanks(prev => [...prev, bank])
  }
  function removeBankFromPending(i) {
    setPendingBanks(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Step 2 helpers ──
  function updateAccountName(i, val) {
    setAccountNames(prev => prev.map((a, idx) => idx === i ? val : a))
  }
  function addAccountRow() { setAccountNames(prev => [...prev, '']) }
  function removeAccountRow(i) { setAccountNames(prev => prev.filter((_, idx) => idx !== i)) }

  // ── Step 3 helpers ──
  function updateIncomeRow(i, field, val) {
    setIncomeRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  }
  function addIncomeRow() { setIncomeRows(prev => [...prev, { name: '', amount: '', freq: 'Every Paycheck' }]) }
  function removeIncomeRow(i) { setIncomeRows(prev => prev.filter((_, idx) => idx !== i)) }

  // ── Seed budget + income when entering step 4 ──
  async function handleSeedAndAdvance() {
    setLoading(true)
    setError('')

    const { error: seedErr } = await seedNewUser(user.id)
    if (seedErr) { setError(seedErr.message); setLoading(false); return }

    // Overwrite seeded income with what the user entered in step 3
    const validIncome = incomeRows.filter(r => r.name.trim())
    if (validIncome.length) {
      // Remove the default seeded income rows, replace with user's
      await supabase.from('income_items').delete().eq('user_id', user.id)
      const rows = validIncome.map((r, i) => ({
        user_id: user.id,
        label: r.name.trim(),
        budgeted: monthlyEquivalent(parseFloat(r.amount) || 0, r.freq),
        actual: 0,
        note: r.freq,
        sort_order: i,
      }))
      await supabase.from('income_items').insert(rows)
    }

    // Load expense items for fuzzy matching in step 4/5
    const { data: expenses } = await supabase
      .from('expense_items')
      .select('id, label, frequency')
      .eq('user_id', user.id)
    setExpenseItems(expenses ?? [])

    setLoading(false)
    setStep(4)
  }

  function monthlyEquivalent(amount, freq) {
    switch (freq) {
      case 'Every Paycheck': return amount * 26 / 12 // biweekly paycheck assumption
      case 'Biweekly':       return amount * 26 / 12
      case 'Weekly':         return amount * 52 / 12
      case 'Annual':         return amount / 12
      default:                return amount // Monthly
    }
  }

  // ── Save bank accounts + transactions to DB, advance to review ──
  async function handleSaveBanksAndReview() {
    setLoading(true)
    setError('')

    for (const bank of pendingBanks) {
      const { data: acct, error: acctErr } = await supabase
        .from('bank_accounts')
        .insert({
          user_id: user.id,
          name: bank.name,
          col_date: bank.colMap.dateCol,
          col_desc: bank.colMap.descCol,
          col_amount: bank.colMap.amountCol,
          amount_sign: bank.colMap.amountSign,
        })
        .select().single()

      if (acctErr) { setError(acctErr.message); setLoading(false); return }

      const txRows = bank.transactions.map(t => ({
        user_id: user.id,
        bank_account_id: acct.id,
        date: t.date,
        description: t.description,
        amount: t.amount,
        matched_expense_id: t.matched_expense_id ?? null,
        matched_score: t.matched_score ?? null,
        ignored: false,
        applied: false,
      }))

      const { error: txErr } = await supabase.from('transactions').insert(txRows)
      if (txErr) { setError(txErr.message); setLoading(false); return }
    }

    setLoading(false)
    setStep(5)
  }

  function handleFinish() {
    if (name.trim()) document.title = `${name.trim()}'s Budget`
    navigate('/dashboard', { replace: true })
  }

  // ── Derived totals for review/done steps ──
  const allTxns = pendingBanks.flatMap(b => b.transactions)
  const matchedTxns = allTxns.filter(t => t.matched_expense_id)
  const totalIncomeMonthly = incomeRows
    .filter(r => r.name.trim())
    .reduce((s, r) => s + monthlyEquivalent(parseFloat(r.amount) || 0, r.freq), 0)

  return (
    <div className="wiz-overlay-page">
      <div className="wiz-modal-page fadein">

        {/* ── Header / step track ── */}
        <div className="wiz-header">
          <div className="wiz-logo">💵 Budget Setup</div>
          <div className="wiz-step-track">
            {STEPS.map((s, i) => {
              const n = i + 1
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

        {/* ── Body ── */}
        <div className="wiz-body">
          {error && <div className="alert alert-error">{error}</div>}

          {/* Step 1: Welcome */}
          {step === 1 && (
            <div className="fadein">
              <div className="wiz-step-title">Welcome! Let's start with the basics.</div>
              <div className="wiz-step-hint">Tell us a little about yourself so we can personalize your budget.</div>

              <div className="wiz-greeting-grid">
                <div className="wiz-field">
                  <label>Your name</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sarah" autoFocus />
                </div>
                <div className="wiz-field">
                  <label>Household size</label>
                  <input
                    type="number" min="1" max="20"
                    value={household}
                    onChange={e => setHousehold(e.target.value)}
                    placeholder="e.g. 4"
                  />
                </div>
              </div>

              <div className="wiz-field" style={{ marginBottom: '1rem' }}>
                <label>What's your main goal?</label>
                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.35rem' }}>
                  {GOALS.map(g => (
                    <button
                      key={g.id}
                      className={`freq-btn${goal === g.id ? ' active' : ''}`}
                      onClick={() => setGoal(g.id)}
                      type="button"
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Accounts */}
          {step === 2 && (
            <div className="fadein">
              <div className="wiz-step-title">Which bank accounts do you use?</div>
              <div className="wiz-step-hint">
                Add the accounts you pay bills from. You'll upload statements for these in a later step.
              </div>

              <div className="wiz-account-list">
                {accountNames.map((a, i) => (
                  <div className="wiz-account-row" key={i}>
                    <input
                      value={a}
                      placeholder="e.g. Chase Checking"
                      onChange={e => updateAccountName(i, e.target.value)}
                    />
                    <button className="del-btn" onClick={() => removeAccountRow(i)}>×</button>
                  </div>
                ))}
              </div>
              <button className="btn-add" onClick={addAccountRow} type="button">+ Add another account</button>
            </div>
          )}

          {/* Step 3: Income */}
          {step === 3 && (
            <div className="fadein">
              <div className="wiz-step-title">Add your income sources</div>
              <div className="wiz-step-hint">
                Enter each paycheck or income stream. We'll use this to calculate your monthly budget headroom.
              </div>

              <div className="wiz-income-rows">
                {incomeRows.map((r, i) => (
                  <div className="wiz-income-row" key={i}>
                    <input
                      value={r.name}
                      placeholder="e.g. Paycheck"
                      onChange={e => updateIncomeRow(i, 'name', e.target.value)}
                    />
                    <input
                      type="number" step="0.01"
                      value={r.amount}
                      placeholder="Amount $"
                      style={{ width: 110 }}
                      onChange={e => updateIncomeRow(i, 'amount', e.target.value)}
                    />
                    <select value={r.freq} onChange={e => updateIncomeRow(i, 'freq', e.target.value)}>
                      {FREQS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <button className="del-btn" onClick={() => removeIncomeRow(i)}>×</button>
                  </div>
                ))}
              </div>
              <button className="btn-add" onClick={addIncomeRow} type="button">+ Add income source</button>
            </div>
          )}

          {/* Step 4: Multi-bank CSV upload */}
          {step === 4 && (
            <div className="fadein">
              <div className="wiz-step-title">Upload your bank statements</div>
              <div className="wiz-step-hint">
                Upload a CSV for each bank or card you want to track. We'll match transactions to
                your budget items automatically — review everything before it's applied.
              </div>
              <WizardCsvStep
                expenseItems={expenseItems}
                pendingBanks={pendingBanks}
                onAddBank={addBankToPending}
                onRemoveBank={removeBankFromPending}
              />
            </div>
          )}

          {/* Step 5: Review */}
          {step === 5 && (
            <div className="fadein">
              <div className="wiz-step-title">Review your imports</div>
              <div className="wiz-step-hint">
                We matched <strong>{matchedTxns.length}</strong> of <strong>{allTxns.length}</strong> transactions
                across <strong>{pendingBanks.length}</strong> bank{pendingBanks.length === 1 ? '' : 's'}.
                Unmatched items will stay in Reconcile for you to assign later.
              </div>

              <div className="wiz-summary-grid">
                <div className="wiz-scard">
                  <div className="wiz-scard-val">{allTxns.length}</div>
                  <div className="wiz-scard-lbl">Transactions</div>
                </div>
                <div className="wiz-scard">
                  <div className="wiz-scard-val" style={{ color: 'var(--green)' }}>{matchedTxns.length}</div>
                  <div className="wiz-scard-lbl">Matched</div>
                </div>
                <div className="wiz-scard">
                  <div className="wiz-scard-val" style={{ color: 'var(--gold)' }}>{allTxns.length - matchedTxns.length}</div>
                  <div className="wiz-scard-lbl">Unmatched</div>
                </div>
              </div>

              {pendingBanks.length === 0 ? (
                <div className="empty-state" style={{ padding: '2rem' }}>
                  <div className="empty-state-body">No statements were uploaded — that's fine, you can add them anytime from Reconcile.</div>
                </div>
              ) : (
                <div className="wiz-match-preview">
                  <div className="wiz-bank-group-hdr">
                    <div>Transaction</div><div>Bank</div><div>Matched to</div>
                  </div>
                  {pendingBanks.flatMap((b, bi) =>
                    b.transactions.slice(0, 8).map((t, ti) => {
                      const matched = expenseItems.find(e => e.id === t.matched_expense_id)
                      return (
                        <div className="wiz-match-row" key={`${bi}-${ti}`}>
                          <div>
                            <div style={{ fontSize: '.82rem', color: 'var(--ink2)' }}>{t.description}</div>
                            <div style={{ fontSize: '.74rem', color: 'var(--ink3)' }}>{fmt(Math.abs(t.amount))}{t.date ? ' · ' + t.date : ''}</div>
                          </div>
                          <div style={{ fontSize: '.78rem', color: 'var(--ink3)' }}>{b.name}</div>
                          <div style={{ fontSize: '.78rem', color: matched ? 'var(--ink)' : 'var(--ink3)' }}>
                            {matched ? matched.label : <em>unmatched</em>}
                          </div>
                        </div>
                      )
                    })
                  )}
                  {allTxns.length > pendingBanks.length * 8 && (
                    <div style={{ padding: '.6rem .75rem', fontSize: '.78rem', color: 'var(--ink3)', textAlign: 'center' }}>
                      …and more, viewable in Reconcile
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 6: Done */}
          {step === 6 && (
            <div className="fadein">
              <div className="wiz-step-title">You're all set! 🎉</div>
              <div className="wiz-step-hint">
                {name ? `${name}, your` : 'Your'} budget is ready. Here's what we set up:
              </div>
              <div className="wiz-summary-grid">
                <div className="wiz-scard">
                  <div className="wiz-scard-val" style={{ color: 'var(--green)' }}>{fmt(totalIncomeMonthly)}</div>
                  <div className="wiz-scard-lbl">Monthly Income</div>
                </div>
                <div className="wiz-scard">
                  <div className="wiz-scard-val">{pendingBanks.length}</div>
                  <div className="wiz-scard-lbl">Banks Connected</div>
                </div>
                <div className="wiz-scard">
                  <div className="wiz-scard-val" style={{ color: 'var(--blue)' }}>{matchedTxns.length}</div>
                  <div className="wiz-scard-lbl">Actuals Applied</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="wiz-footer">
          {step > 1
            ? <button className="wiz-skip" onClick={() => setStep(s => s - 1)}>← Back</button>
            : <span />}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '.78rem', color: 'var(--ink3)' }}>Step {step} of {STEPS.length}</span>
            {step < 6 && (
              <button className="wiz-skip" onClick={handleFinish}>Skip setup</button>
            )}
            <button
              className="btn btn-p"
              disabled={loading}
              onClick={() => {
                if (step === 3) handleSeedAndAdvance()
                else if (step === 4) handleSaveBanksAndReview()
                else if (step === 6) handleFinish()
                else setStep(s => s + 1)
              }}
            >
              {loading
                ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Working…</>
                : step === 6 ? 'Go to Dashboard →'
                : step === 4 ? (pendingBanks.length ? 'Review matches →' : 'Skip statements →')
                : 'Next →'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
