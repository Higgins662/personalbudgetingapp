import { useState, useRef } from 'react'
import { parseCSV, getCSVHeaders, extractTransactions } from '../lib/csvParser'
import { autoMatch } from '../lib/fuzzyMatch'
import { fmt } from '../lib/format'
import './ReconcilePage.css'

export default function ReconcilePage({ budget, transactions: txHook }) {
  const { monthly, annual, loading: budgetLoading } = budget
  const { bankAccounts, transactions, insertTransactions, updateBankAccount, addBankAccount,
          loading: txLoading } = txHook

  const fileRef  = useRef(null)
  // Stages: bank -> select -> map -> preview -> done
  const [stage,  setStage]  = useState('bank')
  const [selAcct, setSelAcct] = useState('')      // chosen existing bank account id
  const [newAcctName, setNewAcctName] = useState('')
  const [creatingNew, setCreatingNew] = useState(bankAccounts.length === 0)
  const [csvHeaders, setCsvHeaders] = useState([])
  const [csvRows,    setCsvRows]    = useState([])
  const [colMap,     setColMap]     = useState({ dateCol: '', descCol: '', amountCol: '', amountSign: 'negative' })
  const [preview,    setPreview]    = useState([])
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  const allExpenses = [...monthly, ...annual]

  // ── Stage: confirm which bank this import is for ──────────────────────────
  function handleConfirmBank() {
    if (creatingNew && !newAcctName.trim()) {
      setError('Please name this bank account.'); return
    }
    if (!creatingNew && !selAcct) {
      setError('Please select a bank account.'); return
    }
    setError('')
    setStage('select')
  }

  // ── Stage: upload CSV ──────────────────────────────────────────────────────
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

      const acct = bankAccounts.find(b => b.id === selAcct)
      if (!creatingNew && acct?.col_date) {
        setColMap({
          dateCol:    acct.col_date,
          descCol:    acct.col_desc,
          amountCol:  acct.col_amount,
          amountSign: acct.amount_sign ?? 'negative',
        })
      } else {
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

  // ── Stage: column mapping → build preview ──────────────────────────────────
  function handleBuildPreview() {
    if (!colMap.dateCol || !colMap.descCol || !colMap.amountCol) {
      setError('Please select Date, Description, and Amount columns.'); return
    }
    const raw = extractTransactions(csvRows, colMap, selAcct || 'pending')
    if (!raw.length) { setError('No valid transactions found. Check your column mapping.'); return }
    const matched = autoMatch(raw, allExpenses)
    setPreview(matched)
    setStage('preview')
    setError('')
  }

  // ── Stage: save ──────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    setError('')

    let acctId = selAcct
    if (creatingNew) {
      const { data, error } = await addBankAccount({
        name: newAcctName.trim(),
        col_date:    colMap.dateCol,
        col_desc:    colMap.descCol,
        col_amount:  colMap.amountCol,
        amount_sign: colMap.amountSign,
      })
      if (error) { setError(error.message); setSaving(false); return }
      acctId = data.id
    } else {
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
    setStage('bank'); setPreview([]); setCsvRows([]); setCsvHeaders([])
    setError(''); setNewAcctName(''); setSelAcct('')
    setCreatingNew(bankAccounts.length === 0)
    if (fileRef.current) fileRef.current.value = ''
  }

  function startAnotherBank() {
    // Keep going back to the bank-selection stage so the user can
    // import a second/third statement without leaving Reconcile.
    reset()
  }

  if (budgetLoading || txLoading) {
    return <div className="loading-center"><span className="spinner" /> Loading…</div>
  }

  const recentTx = transactions.slice(0, 50)
  const currentBankName = creatingNew
    ? newAcctName.trim()
    : bankAccounts.find(b => b.id === selAcct)?.name

  return (
    <div className="fadein">
      <div className="sec-hdr">
        <span className="sec-title">Reconcile</span>
        <span className="sec-hint">Import bank statements</span>
      </div>

      <div className="card rec-wizard">
        <div className="rec-wizard-hdr">
          <StepDot n={1} active={stage === 'bank'}    done={stage !== 'bank'} label="Bank" />
          <div className="rec-line" />
          <StepDot n={2} active={stage === 'select'}  done={['map','preview','done'].includes(stage)} label="Upload" />
          <div className="rec-line" />
          <StepDot n={3} active={stage === 'map'}     done={['preview','done'].includes(stage)} label="Map" />
          <div className="rec-line" />
          <StepDot n={4} active={stage === 'preview'} done={stage === 'done'} label="Review" />
          <div className="rec-line" />
          <StepDot n={5} active={false} done={stage === 'done'} label="Done" />
        </div>

        {error && <div className="alert alert-error" style={{ margin: '1rem 1.25rem 0' }}>{error}</div>}

        {/* Stage: bank selection — required first step */}
        {stage === 'bank' && (
          <div className="rec-body fadein">
            <p className="rec-map-hint">
              Every import needs to be tied to a bank account so we can keep your statements organized
              and remember each bank's column layout.
            </p>

            {bankAccounts.length > 0 && (
              <div className="fg" style={{ marginBottom: '1rem' }}>
                <label>Which bank is this statement from?</label>
                <select
                  value={creatingNew ? '__new__' : selAcct}
                  onChange={e => {
                    if (e.target.value === '__new__') { setCreatingNew(true); setSelAcct('') }
                    else { setCreatingNew(false); setSelAcct(e.target.value) }
                  }}
                >
                  <option value="">— Select a bank —</option>
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                  <option value="__new__">+ Add a new bank account</option>
                </select>
              </div>
            )}

            {(creatingNew || bankAccounts.length === 0) && (
              <div className="fg" style={{ marginBottom: '1rem' }}>
                <label>New bank account name</label>
                <input
                  value={newAcctName}
                  onChange={e => setNewAcctName(e.target.value)}
                  placeholder="e.g. Chase Checking"
                  autoFocus
                />
              </div>
            )}

            <button className="btn btn-p" onClick={handleConfirmBank}>Continue →</button>
          </div>
        )}

        {/* Stage: upload CSV */}
        {stage === 'select' && (
          <div className="rec-body fadein">
            <div className="alert alert-info" style={{ marginBottom: '1rem', fontSize: '.83rem' }}>
              Importing for <strong>{currentBankName}</strong>
            </div>
            <div className="rec-upload-area" onClick={() => fileRef.current?.click()}>
              <div className="rec-upload-icon">📄</div>
              <div className="rec-upload-label">Click to upload a CSV bank statement</div>
              <div className="rec-upload-hint">Exported from your bank's website or app</div>
              <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
            </div>
            <button className="btn btn-g" style={{ marginTop: '1rem' }} onClick={() => setStage('bank')}>← Back</button>
          </div>
        )}

        {/* Stage: map columns */}
        {stage === 'map' && (
          <div className="rec-body fadein">
            <p className="rec-map-hint">
              Found <strong>{csvRows.length}</strong> rows for <strong>{currentBankName}</strong>.
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
              <button className="btn btn-g" onClick={() => setStage('select')}>← Back</button>
            </div>
          </div>
        )}

        {/* Stage: preview */}
        {stage === 'preview' && (
          <div className="rec-body fadein">
            <p className="rec-map-hint">
              <strong>{preview.filter(t => !t._skip).length}</strong> transactions ready to import for <strong>{currentBankName}</strong>.
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
              <button className="btn btn-g" onClick={() => setStage('map')}>← Back</button>
            </div>
          </div>
        )}

        {/* Stage: done */}
        {stage === 'done' && (
          <div className="rec-body fadein" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '.75rem' }}>✅</div>
            <div style={{ fontWeight: 600, marginBottom: '.4rem' }}>Import complete!</div>
            <p style={{ color: 'var(--ink3)', fontSize: '.875rem', marginBottom: '1.25rem' }}>
              Transactions for <strong>{currentBankName}</strong> have been saved and matched to budget items.
            </p>
            <button className="btn btn-p" onClick={startAnotherBank}>Import another statement</button>
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
