import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { seedNewUser } from '../lib/seed'
import './Onboarding.css'

const STEPS = ['Welcome', 'Your Budget', 'Bank Statements']

export default function Onboarding() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const [step,    setStep]    = useState(0)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handleSeedAndContinue() {
    setLoading(true)
    setError('')
    const { error } = await seedNewUser(user.id)
    setLoading(false)
    if (error) { setError(error.message); return }
    setStep(2)
  }

  function handleFinish() {
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="ob-page">
      <div className="ob-card fadein">
        {/* Step indicator */}
        <div className="ob-steps">
          {STEPS.map((s, i) => (
            <div key={s} className={`ob-step${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}>
              <div className="ob-step-dot">{i < step ? '✓' : i + 1}</div>
              <span>{s}</span>
            </div>
          ))}
        </div>

        {/* ── Step 0: Welcome ── */}
        {step === 0 && (
          <div className="ob-body fadein">
            <div className="ob-emoji">👋</div>
            <h1 className="ob-title">Welcome to Budget</h1>
            <p className="ob-text">
              Let's get your personal budget set up in about two minutes.
              We'll start with a set of sensible defaults you can customize,
              then optionally import your bank statements to see where your
              money is actually going.
            </p>
            <button className="btn btn-p ob-btn" onClick={() => setStep(1)}>
              Get started →
            </button>
          </div>
        )}

        {/* ── Step 1: Seed budget ── */}
        {step === 1 && (
          <div className="ob-body fadein">
            <div className="ob-emoji">📋</div>
            <h1 className="ob-title">Your starter budget</h1>
            <p className="ob-text">
              We'll create a budget with common income and expense categories
              pre-filled with typical amounts. You can edit every number,
              add new rows, or delete anything that doesn't apply to you.
            </p>
            <ul className="ob-list">
              <li>✓ Income items</li>
              <li>✓ Monthly expenses across 9 categories</li>
              <li>✓ Annual / one-time expenses</li>
              <li>✓ Color-coded category system</li>
            </ul>
            {error && <div className="alert alert-error">{error}</div>}
            <button
              className="btn btn-p ob-btn"
              onClick={handleSeedAndContinue}
              disabled={loading}
            >
              {loading
                ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Setting up…</>
                : 'Create my budget →'}
            </button>
          </div>
        )}

        {/* ── Step 2: Bank statements ── */}
        {step === 2 && (
          <div className="ob-body fadein">
            <div className="ob-emoji">🏦</div>
            <h1 className="ob-title">Import bank statements</h1>
            <p className="ob-text">
              Upload a CSV export from each bank or credit card you want to
              track. We'll walk you through mapping the columns once per bank
              and remember the mapping for future imports.
            </p>
            <div className="alert alert-info" style={{ marginBottom: '1.25rem' }}>
              You can skip this for now and import statements anytime from the
              <strong> Reconcile</strong> tab.
            </div>
            <div className="ob-btn-row">
              <button className="btn btn-g" onClick={handleFinish}>
                Skip for now
              </button>
              <button className="btn btn-p" onClick={handleFinish}>
                Go to my dashboard →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
