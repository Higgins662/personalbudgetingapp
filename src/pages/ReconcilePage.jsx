import { useState, useRef } from 'react'
import CategoryBadge from '../components/ui/CategoryBadge'
import { parseCSV, getCSVHeaders, extractTransactions } from '../lib/csvParser'
import { autoMatch } from '../lib/fuzzyMatch'
import { fmt } from '../lib/format'
import './ReconcilePage.css'

export default function ReconcilePage({ budget, transactions: txHook }) {
  const { categories, monthly, annual, loading: budgetLoading } = budget
  const { bankAccounts, transactions, insertTransactions, updateBankAccount, addBankAccount,
          updateTransaction, loading: txLoading } = txHook

  const fileRef  = useRef(null)
  const [stage,  setStage]  = useState('select') // select | map | preview | done
  const [selAcct, setSelAcct] = useState('')      // chosen bank account id
  const [newAcctName, setNewAcctName] = useState('')
  const [csvHeaders, setCsvHeaders] = useState([])
  const [csvRows,    setCsvRows]    = useState([])
  const [colMap,     setColMap]     = useState({ dateCol: '', descCol: '', amountCol: '', amountSign: 'negative' })
  const [preview,    setPreview]    = useState([])  // matched transaction objects
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  const allExpenses = [...monthly, ...annual]

  // ── Stage: select bank account and upload CSV ──────────────────────────────
  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target.result
      const headers = getCSVHeaders(text)
      const rows    = parseCSV(text)
      setCsvHeaders(headers)
      setCsvRows(rows)
      // Pre-fill colMap from saved mapping if we have an account selected
      const acct = bankAccounts.find(b => b.id === selAcct)
      if (acct?.col_date) {
        setColMap({
          dateCol:    acct.col_date,
          descCol:    acct.col_desc,
          amountCol:  acct.col_amount,
          amountSign: acct.amount_sign ?? 'negative',
        })
      } else {
        // Auto-guess common column names
        const guess = k => headers.find(h => h.toLowerCase().includes(k)) ?? ''
        setColMap({
          dateCol:    guess('date'),
          descCol:    guess('desc') || guess('payee') || guess('memo'),
          amountCol:  guess('amount') || guess('debit') || guess('withdrawal'),
          amountSign: 'negative',
        })
      }
      setStage('map')
      setError('')
    }
    reader.readAsText(file)
  }

  // ── Stage: column mapping → build preview ─────────────────────────────────
  function handleBuildPreview() {
    if (!colMap.dateCol || !colMap.descCol || !colMap.amountCol) {
      setError('Please select Date, Description, and Amount columns.'); return
    }
    const acctId = selAcct || 'new'
    const raw = extractTransactions(csvRows, colMap, acctId)
    if (!raw.length) { setError('No valid transactions found. Check your column mapping.'); return }
    const matched = autoMatch(raw, allExpenses)
    setPreview(matched)
    setStage('preview')
    setError('')
  }

  // ── Stage: save ───────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    setError('')

    // Create bank account if new
    let acctId = selAcct
    if (!acctId) {
      const name = newAcctName.trim() || 'Unnamed Account'
      const { data, error } = await addBankAccount({
        name,
        col_date:    colMap.dateCol,
        col_desc:    colMap.descCol,
        col_amount:  colMap.amountCol,
        amount_sign: colMap.amountSign,
      })
      if (error) { setError(error.message); setSaving(false); return }
      acctId = data.id
    } else {
      // Save/update column mapping on existing account
      await updateBankAccount(acctId, {
        col_date:    colMap.dateCol,
        col_desc:    colMap.descCol,
        col_amount:  colMap.amountCol,
        amount_sign: colMap.amountSign,
      })
    }

    const toInsert = preview
      .filter(t => !t._skip)
      .map(t => ({ ...t, bank_account_id: acctId }))

    const { error } = await insertTransactions(toInsert)
    setSaving(false)
    if (error) { setError(error.message); return }
    setStage('done')
  }

  function reset() {
    setStage('select'); setPreview([]); setCsvRows([]); setCsvHeaders([])
    setError(''); setNewAcctName('')
    if (fileRef.current) fileRef.current.value = ''
  }

  if (budgetLoading || txLoading) {
    return <div className="loading-center"><span className="spinner" /> Loading…</div>
  }

  // ── Existing transactions summary ─────────────────────────────────────────
  const recentTx = transactions.slice(0, 50)

  return (
    <div className="fadein">
      <div className="sec-hdr">
        <span className="sec-title">Reconcile</span>
        <span className="sec-hint">Import bank statements</span>
      </div>

      {/* ── Import wizard ── */}
      <div className="card rec-wizard">
        <div className="rec-wizard-hdr">
          <StepDot n={1} active={stage === 'select'} done={stage !== 'select'} label="Upload" />
          <div className="rec-line" />
          <StepDot n={2} active={stage === 'map'} done={['preview','done'].includes(stage)} label="Map" />
          <div className="rec-line" />
          <StepDot n={3} active={stage === 'preview'} done={stage === 'done'} label="Review" />
          <div className="rec-line" />
          <StepDot n={4} active={false} done={stage === 'done'} label="Done" />
        </div>

        {error && <div className="alert alert-error" style={{ margin: '1rem 1.25rem 0' }}>{error}</div>}

        {/* Stage: select */}
        {stage === 'select' && (
          <div className="rec-body fadein">
            <div className="fg" style={{ marginBottom: '1rem' }}>
              <label>Bank account</label>
              <select value={selAcct} onChange={e => setSelAcct(e.target.value)}>
                <option value="">+ New bank account</option>
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {!selAcct && (
              <div className="fg" style={{ marginBottom: '1rem' }}>
                <label>Account name</label>
                <input
                  value={newAcctName}
                  onChange={e => setNewAcctName(e.target.value)}
                  placeholder="e.g. Chase Checking"
                />
              </div>
            )}

            <div className="rec-upload-area" onClick={() => fileRef.current?.click()}>
              <div className="rec-upload-icon">📄</div>
              <div className="rec-upload-label">Click to upload a CSV bank statement</div>
              <div className="rec-upload-hint">Exported from your bank's website or app</div>
              <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
            </div>
          </div>
        )}

        {/* Stage: map columns */}
        {stage === 'map' && (
          <div className="rec-body fadein">
            <p className="rec-map-hint">
              Found <strong>{csvRows.length}</strong> rows.
              Map each column from your CSV to what it represents.
            </p>
            <div className="fgrid">
              {[
                { key: 'dateCol',   label: 'Date column' },
                { key: 'descCol',   label: 'Description column' },
                { key: 'amountCol', label: 'Amount column' },
              ].map(({ key, label }) => (
                <div className="fg" key={key}>
                  <label>{label}</label>
                  <select
                    value={colMap[key]}
                    onChange={e => setColMap(m => ({ ...m, [key]: e.target.value }))}
                  >
                    <option value="">— Select —</option>
                    {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
              <div className="fg">
                <label>Debit amounts are…</label>
                <select
                  value={colMap.amountSign}
                  onChange={e => setColMap(m => ({ ...m, amountSign: e.target.value }))}
                >
                  <option value="negative">Negative numbers (−$50)</option>
                  <option value="positive">Positive numbers ($50)</option>
                </select>
              </div>
            </div>

            {/* Preview first 3 rows */}
            {csvRows.length > 0 && (
              <div className="rec-sample">
                <div className="rec-sample-label">First 3 rows of your CSV</div>
                <div className="rec-sample-scroll">
                  <table>
                    <thead>
                      <tr>{csvHeaders.map(h => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {csvRows.slice(0, 3).map((row, i) => (
                        <tr key={i}>
                          {csvHeaders.map(h => <td key={h}>{row[h]}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem' }}>
              <button className="btn btn-p" onClick={handleBuildPreview}>Preview transactions →</button>
              <button className="btn btn-g" onClick={reset}>Back</button>
            </div>
          </div>
        )}

        {/* Stage: preview */}
        {stage === 'preview' && (
          <div className="rec-body fadein">
            <p className="rec-map-hint">
              <strong>{preview.filter(t => !t._skip).length}</strong> transactions ready to import.
              Matched <strong>{preview.filter(t => t.matched_expense_id).length}</strong> to budget items automatically.
            </p>

            <div className="rec-preview-list">
              {preview.map((tx, i) => {
                const matched = allExpenses.find(e => e.id === tx.matched_expense_id)
                return (
                  <div key={i} className={`rec-tx${tx._skip ? ' rec-tx-skip' : ''}`}>
                    <div className="rec-tx-main">
                      <div className="rec-tx-info">
                        <span className="rec-tx-date">{tx.date}</span>
                        <span className="rec-tx-desc">{tx.description}</span>
                      </div>
                      <div className="rec-tx-right">
                        <span className={`mono ${tx.amount < 0 ? 'v-red' : 'v-green'}`}>
                          {fmt(tx.amount)}
                        </span>
                        <button
                          className="btn btn-g"
                          style={{ padding: '.2rem .5rem', fontSize: '.73rem' }}
                          onClick={() => setPreview(p => p.map((t, j) => j === i ? { ...t, _skip: !t._skip } : t))}
                        >
                          {tx._skip ? 'Restore' : 'Skip'}
                        </button>
                      </div>
                    </div>
                    {matched && (
                      <div className="rec-tx-match">
                        ✓ Matched to <strong>{matched.label}</strong>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: '.5rem', marginTop: '1rem' }}>
              <button className="btn btn-p" onClick={handleSave} disabled={saving}>
                {saving ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Saving…</> : 'Import transactions'}
              </button>
              <button className="btn btn-g" onClick={() => setStage('map')}>Back</button>
            </div>
          </div>
        )}

        {/* Stage: done */}
        {stage === 'done' && (
          <div className="rec-body fadein" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '.75rem' }}>✅</div>
            <div style={{ fontWeight: 600, marginBottom: '.4rem' }}>Import complete!</div>
            <p style={{ color: 'var(--ink3)', fontSize: '.875rem', marginBottom: '1.25rem' }}>
              Your transactions have been saved and matched to budget items.
            </p>
            <button className="btn btn-p" onClick={reset}>Import another statement</button>
          </div>
        )}
      </div>

      {/* ── Recent transactions ── */}
      {recentTx.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <div className="sec-hdr">
            <span className="sec-title">Recent Transactions</span>
            <span className="sec-hint">{transactions.length} total imported</span>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Account</th>
                  <th className="r">Amount</th>
                  <th>Matched to</th>
                </tr>
              </thead>
              <tbody>
                {recentTx.map(tx => {
                  const matched = allExpenses.find(e => e.id === tx.matched_expense_id)
                  const acct    = bankAccounts.find(b => b.id === tx.bank_account_id)
                  return (
                    <tr key={tx.id}>
                      <td className="mono" style={{ fontSize: '.8rem', color: 'var(--ink3)' }}>{tx.date}</td>
                      <td style={{ fontSize: '.85rem' }}>{tx.description}</td>
                      <td style={{ fontSize: '.8rem', color: 'var(--ink3)' }}>{acct?.name ?? '—'}</td>
                      <td className={`r mono ${tx.amount < 0 ? 'v-red' : 'v-green'}`}>{fmt(tx.amount)}</td>
                      <td>
                        {matched
                          ? <span style={{ fontSize: '.8rem', color: 'var(--green)' }}>✓ {matched.label}</span>
                          : <span style={{ fontSize: '.8rem', color: 'var(--ink3)' }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StepDot({ n, active, done, label }) {
  return (
    <div className={`rec-step${active ? ' active' : ''}${done ? ' done' : ''}`}>
      <div className="rec-step-dot">{done ? '✓' : n}</div>
      <span>{label}</span>
    </div>
  )
}
