import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Signup() {
  const { signUp } = useAuth()
  const navigate   = useNavigate()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    const { error } = await signUp(email, password)
    setLoading(false)
    if (error) { setError(error.message); return }
    // Supabase sends a confirmation email; show a message instead of redirecting
    setSuccess(true)
  }

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-card fadein" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✉️</div>
          <div className="auth-brand" style={{ marginBottom: '.5rem' }}>Check your email</div>
          <p style={{ color: 'var(--ink3)', fontSize: '.9rem', marginBottom: '1.5rem' }}>
            We sent a confirmation link to <strong>{email}</strong>.
            Click it to activate your account, then sign in.
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
        <div className="auth-brand">Budget</div>
        <div className="auth-subtitle">Create your free account</div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="fg" style={{ marginBottom: '.9rem' }}>
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

          <div className="fg" style={{ marginBottom: '.9rem' }}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="Min. 8 characters"
            />
          </div>

          <div className="fg" style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="btn btn-p"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={loading}
          >
            {loading
              ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Creating account…</>
              : 'Create account'}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  )
}
