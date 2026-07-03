import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { toCSV, downloadZip } from '../lib/exportUtils'
import './SettingsPage.css'

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const [exporting,  setExporting]  = useState(false)
  const [exportDone, setExportDone] = useState(false)
  const [exportErr,  setExportErr]  = useState('')

  const [deleteStep,   setDeleteStep]   = useState('idle')
  const [deletePhrase, setDeletePhrase] = useState('')
  const [deleteErr,    setDeleteErr]    = useState('')

  const CONFIRM_PHRASE = 'delete my account'

  async function handleExport() {
    setExporting(true); setExportErr(''); setExportDone(false)
    try {
      const [txRes, budgetRes, goalsRes, catsRes] = await Promise.all([
        supabase.from('export_transactions').select('*'),
        supabase.from('export_budget').select('*'),
        supabase.from('export_goals').select('*'),
        supabase.from('export_categories').select('*'),
      ])
      const err = txRes.error || budgetRes.error || goalsRes.error || catsRes.error
      if (err) { setExportErr(err.message); setExporting(false); return }
      const date = new Date().toISOString().split('T')[0]
      await downloadZip([
        { name: 'transactions.csv', content: toCSV(txRes.data) },
        { name: 'budget.csv',       content: toCSV(budgetRes.data) },
        { name: 'goals.csv',        content: toCSV(goalsRes.data) },
        { name: 'categories.csv',   content: toCSV(catsRes.data) },
      ], `budget-export-${date}.zip`)
      setExportDone(true)
    } catch (e) {
      setExportErr(e.message ?? 'Export failed. Please try again.')
    }
    setExporting(false)
  }

  async function handleDelete() {
    if (deletePhrase.toLowerCase().trim() !== CONFIRM_PHRASE) {
      setDeleteErr(`Please type "${CONFIRM_PHRASE}" exactly to confirm.`); return
    }
    setDeleteStep('deleting'); setDeleteErr('')
    const { error } = await supabase.rpc('delete_user_account', { p_user_id: user.id })
    if (error) { setDeleteErr(error.message); setDeleteStep('confirm'); return }
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="fadein settings-page">
      <div className="sec-hdr">
        <span className="sec-title">Settings</span>
      </div>

      {/* Account info */}
      <div className="settings-section card">
        <div className="settings-section-title">Account</div>
        <div className="settings-row">
          <span className="settings-label">Email</span>
          <span className="settings-value">{user?.email}</span>
        </div>
        <div className="settings-row">
          <span className="settings-label">User ID</span>
          <span className="settings-value mono" style={{ fontSize: '.75rem', color: 'var(--ink3)' }}>
            {user?.id}
          </span>
        </div>
      </div>

      {/* Privacy */}
      <div className="settings-section card">
        <div className="settings-section-title">Privacy</div>
        <div className="settings-row">
          <div>
            <div className="settings-label">Merchant matching contributions</div>
            <div className="settings-sublabel">
              When you assign a transaction to a category, an anonymized version of
              that merchant → category pairing is shared with all users to improve
              automatic matching. No personal data is included.
              See our <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
            </div>
          </div>
          <span style={{ fontSize: '.8rem', color: 'var(--green)', fontWeight: 600 }}>Enabled</span>
        </div>
        <p style={{ fontSize: '.78rem', color: 'var(--ink3)', marginTop: '.5rem' }}>
          To opt out of merchant matching contributions, contact us at privacy@[your-domain.com].
          Full opt-out controls are coming soon.
        </p>
      </div>

      {/* Data export */}
      <div className="settings-section card">
        <div className="settings-section-title">Export Your Data</div>
        <p className="settings-desc">
          Download a ZIP file containing all your data — transactions, budget items,
          savings goals, and categories — as CSV files you can open in any spreadsheet app.
        </p>
        {exportErr  && <div className="alert alert-error"   style={{ marginBottom: '.75rem' }}>{exportErr}</div>}
        {exportDone && <div className="alert alert-success" style={{ marginBottom: '.75rem' }}>✅ Export downloaded successfully.</div>}
        <div className="settings-export-files">
          <div className="export-file-chip">📄 transactions.csv</div>
          <div className="export-file-chip">📄 budget.csv</div>
          <div className="export-file-chip">📄 goals.csv</div>
          <div className="export-file-chip">📄 categories.csv</div>
        </div>
        <button className="btn btn-p" onClick={handleExport} disabled={exporting} style={{ marginTop: '1rem' }}>
          {exporting ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Preparing export…</> : '⬇ Download my data'}
        </button>
      </div>

      {/* Danger zone */}
      <div className="settings-section card settings-danger-card">
        <div className="settings-section-title settings-danger-title">Danger Zone</div>

        {deleteStep === 'idle' && (
          <>
            <p className="settings-desc">
              Permanently delete your account and all associated data — transactions,
              budget items, categories, savings goals, bank accounts, and payee rules.
              This action cannot be undone.
            </p>
            <button className="btn btn-danger" onClick={() => setDeleteStep('confirm')}>
              Delete my account
            </button>
          </>
        )}

        {deleteStep === 'confirm' && (
          <div className="fadein">
            <div className="alert alert-error" style={{ marginBottom: '1.25rem' }}>
              ⚠️ <strong>This cannot be undone.</strong> All your transactions, budget data,
              savings goals, and account information will be permanently deleted.
            </div>

            {/* Fix #17 — download suggestion is now a prominent button, not small inline text */}
            <div className="settings-delete-download">
              <div className="settings-delete-download-text">
                <strong>Recommended first:</strong> download a copy of your data before deleting.
                Once your account is gone, there's no way to recover it.
              </div>
              <button
                className="btn btn-p"
                onClick={handleExport}
                disabled={exporting}
                style={{ flexShrink: 0 }}
              >
                {exporting
                  ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Preparing…</>
                  : '⬇ Download my data first'}
              </button>
            </div>

            <div className="fg" style={{ marginBottom: '1rem', marginTop: '1.25rem' }}>
              <label style={{ fontSize: '.84rem', color: 'var(--ink2)', marginBottom: '.35rem', display: 'block', fontWeight: 500 }}>
                Type <strong>{CONFIRM_PHRASE}</strong> to confirm:
              </label>
              <input
                type="text"
                value={deletePhrase}
                onChange={e => { setDeletePhrase(e.target.value); setDeleteErr('') }}
                placeholder={CONFIRM_PHRASE}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleDelete()}
                style={{
                  border: '1.5px solid var(--red)', borderRadius: 'var(--radius-sm)',
                  padding: '.5rem .7rem', fontFamily: 'inherit', fontSize: '.875rem',
                  width: '100%', outline: 'none', background: '#fff8f8',
                }}
              />
            </div>

            {deleteErr && <div className="alert alert-error" style={{ marginBottom: '.75rem' }}>{deleteErr}</div>}

            <div style={{ display: 'flex', gap: '.75rem' }}>
              <button
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={deletePhrase.toLowerCase().trim() !== CONFIRM_PHRASE}
              >
                Permanently delete my account
              </button>
              <button className="btn btn-g"
                onClick={() => { setDeleteStep('idle'); setDeletePhrase(''); setDeleteErr('') }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {deleteStep === 'deleting' && (
          <div className="loading-center">
            <span className="spinner" /> Deleting your account…
          </div>
        )}
      </div>

      <div className="settings-legal">
        <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
        <span>·</span>
        <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
      </div>
    </div>
  )
}
