import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function ForgotPassword() {
  const { resetPasswordForEmail } = useAuth()

  const [email,   setEmail]   = useState('')
  const [error,   setError]   = useState('')
  const [sent,    setSent]    = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await resetPasswordForEmail(email)
    setLoading(false)
    // Show the same success state whether or not the email exists,
    // so this can't be used to check who has an account.
    if (error) { setError(error.message); return }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="auth-page">
        <div className="auth-card fadein" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✉️</div>
          <div className="auth-brand" style={{ marginBottom: '.5rem' }}>Check your email</div>
          <p style={{ color: 'var(--ink3)', fontSize: '.9rem', marginBottom: '1.5rem' }}>
            If an account exists for <strong>{email}</strong>, we sent a link to reset your password.
            It's valid for a limited time.
          </p>
          <Link to="/login" className="btn btn-p" style={{ justifyContent: 'center' }}>
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card fadein">
        <img src="/brand/veravo-wordmark-primary.svg" alt="Veravo" className="auth-logo" />
        <div className="auth-subtitle">Reset your password</div>
        <p style={{ color: 'var(--ink3)', fontSize: '.85rem', marginTop: '-.5rem', marginBottom: '1.2rem' }}>
          Enter the email on your account and we'll send you a link to set a new password.
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="fg" style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            className="btn btn-p"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={loading}
          >
            {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Sending…</> : 'Send reset link'}
          </button>
        </form>

        <div className="auth-footer">
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    </div>
  )
}
