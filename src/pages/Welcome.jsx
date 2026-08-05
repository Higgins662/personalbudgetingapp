import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { userHasBudget } from '../lib/seed'
import { markWelcomeGuideSeen } from '../lib/welcomeGuide'
import './Welcome.css'

const PAGES = [
  {
    icon: '🧭',
    title: 'The Setup Wizard',
    body: (
      <>
        Getting started takes one trip through the setup wizard: upload a bank
        statement CSV, and Veravo reads your real transactions to suggest
        categories and a starting budget for you to review — built from what
        you actually spent, not a guess.
      </>
    ),
  },
  {
    icon: '💰',
    title: 'Your Budget',
    body: (
      <>
        Income and Monthly Expenses are where your plan lives. Every category
        gets a budgeted amount and tracks its actual spending side by side, so
        you can see exactly where you stand each month once you've imported
        your statement.
      </>
    ),
  },
  {
    icon: '🏷️',
    title: 'Categories & Colors',
    body: (
      <>
        Categories group your spending and drive the automatic matching that
        sorts transactions for you. Rename them, recolor them, or add your
        own from Categories &amp; Colors — the whole app follows your setup.
      </>
    ),
  },
  {
    icon: '🔁',
    title: 'Yearly Subscriptions',
    body: (
      <>
        Not everything is monthly. Flag a transaction as yearly — from the
        Transactions tab or during import — and Veravo tracks it as its own
        line under Yearly Subscriptions, budgeted and reviewed separately
        from your regular monthly spending.
      </>
    ),
  },
  {
    icon: '🎯',
    title: 'Savings Goals',
    body: (
      <>
        Set a target, a monthly contribution, and — optionally — a target
        date. Savings Goals keeps short-term and long-term goals visible
        alongside your budget, instead of tracked somewhere else entirely.
      </>
    ),
  },
  {
    icon: '🧾',
    title: 'Transactions',
    body: (
      <>
        Every imported transaction lands here. Review anything unmatched,
        reassign a category from the dropdown, exclude transfers, and mark
        recurring charges as yearly — this is mission control for keeping
        your budget accurate.
      </>
    ),
  },
]

export default function Welcome() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [page, setPage] = useState(0) // 0 = cover, 1..PAGES.length = content, last = outro
  const [hasBudget, setHasBudget] = useState(false)

  const lastPage = PAGES.length + 1

  useEffect(() => {
    let alive = true
    if (!user) return
    userHasBudget(user.id).then(result => { if (alive) setHasBudget(result) })
    return () => { alive = false }
  }, [user])

  function finish(destination) {
    markWelcomeGuideSeen()
    navigate(destination, { replace: true })
  }

  function next() { setPage(p => Math.min(p + 1, lastPage)) }
  function back() { setPage(p => Math.max(p - 1, 0)) }

  return (
    <div className="welcome-overlay">
      <div className="welcome-modal fadein">

        {/* ── Cover page ── */}
        {page === 0 && (
          <div className="welcome-cover">
            <img src="/brand/veravo-wordmark-primary.svg" alt="Veravo" className="welcome-logo" />
            <p className="welcome-tagline">True numbers. Yours alone.</p>
            <p className="welcome-cover-body">
              Veravo builds your budget from your actual bank transactions —
              not guesses. This quick tour covers how the setup wizard,
              budget, categories, yearly subscriptions, savings goals, and
              transactions fit together.
            </p>
            <div className="welcome-cover-actions">
              <button className="btn btn-p" onClick={next}>Take the tour →</button>
              <button className="btn btn-g" onClick={() => finish('/onboarding')}>Skip to setup wizard</button>
              {hasBudget && (
                <button className="btn btn-g" onClick={() => finish('/dashboard')}>Skip to dashboard</button>
              )}
            </div>
          </div>
        )}

        {/* ── Content pages ── */}
        {page >= 1 && page <= PAGES.length && (
          <div className="welcome-content">
            <div className="welcome-icon">{PAGES[page - 1].icon}</div>
            <h2 className="welcome-page-title">{PAGES[page - 1].title}</h2>
            <p className="welcome-page-body">{PAGES[page - 1].body}</p>
          </div>
        )}

        {/* ── Outro page ── */}
        {page === lastPage && (
          <div className="welcome-content">
            <div className="welcome-icon">✅</div>
            <h2 className="welcome-page-title">You're all set</h2>
            <p className="welcome-page-body">
              That's the whole picture. Next stop: the setup wizard, so Veravo
              can build your first budget from real numbers.
            </p>
            <div className="welcome-cover-actions" style={{ marginTop: '1.5rem' }}>
              <button className="btn btn-p" onClick={() => finish('/onboarding')}>Start setup wizard</button>
              {hasBudget && (
                <button className="btn btn-g" onClick={() => finish('/dashboard')}>Go to dashboard instead</button>
              )}
            </div>
          </div>
        )}

        {/* ── Nav: dots + arrows (hidden on cover) ── */}
        {page > 0 && (
          <div className="welcome-nav">
            <button className="welcome-arrow" onClick={back} aria-label="Back">←</button>
            <div className="welcome-dots">
              {Array.from({ length: lastPage + 1 }).map((_, i) => (
                <span key={i} className={`welcome-dot${i === page ? ' active' : ''}`} />
              ))}
            </div>
            {page < lastPage
              ? <button className="welcome-arrow" onClick={next} aria-label="Next">→</button>
              : <span className="welcome-arrow welcome-arrow-spacer" />}
          </div>
        )}

        {page > 0 && page < lastPage && (
          <div className="welcome-skip-row">
            <button className="welcome-skip-link" onClick={() => finish('/onboarding')}>
              Skip to setup wizard
            </button>
            {hasBudget && (
              <button className="welcome-skip-link" onClick={() => finish('/dashboard')}>
                Skip to dashboard
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
