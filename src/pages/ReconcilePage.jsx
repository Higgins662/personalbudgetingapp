import { useState, useRef } from 'react'
import { parseCSV, getCSVHeaders, extractTransactions } from '../lib/csvParser'
import { autoMatch } from '../lib/fuzzyMatch'
import { fmt } from '../lib/format'
import { usePayeeRules } from '../hooks/usePayeeRules'
import { useGlobalPatterns } from '../hooks/useGlobalPatterns'
import './ReconcilePage.css'

export default function ReconcilePage({ budget, transactions: txHook }) {
  const { monthly, annual, categories, loading: budgetLoading } = budget
  const { bankAccounts, transactions, insertTransactions, updateBankAccount, addBankAccount,
          updateTransaction, loading: txLoading } = txHook
  const { rules: personalRules, learnRule } = usePayeeRules()
  const { patterns: globalPatterns, contribute } = useGlobalPatterns()

  const fileRef  = useRef(null)
  const [stage,  setStage]  = useState('bank')
  const [selAcct, setSelAcct] = useState('')
  const [newAcctName, setNewAcctName] = useState('')
  const [creatingNew, setCreatingNew] = useState(bankAccounts.length === 0)
  const [csvHeaders, setCsvHeaders] = useState([])
  const [csvRows,    setCsvRows]    = useState([])
  const [colMap,     setColMap]     = useState({ dateCol: '', descCol: '', amountCol: '', amountSign: 'negative' })
  const [preview,    setPreview]    = useState([])
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  const allExpenses = [...monthly, ...annual]

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

  function handleBuildPreview() {
    if (!colMap.dateCol || !colMap.descCol || !colMap.amountCol) {
      setError('Please select Date, Description, and Amount columns.'); return
    }
    const raw = extractTransactions(csvRows, colMap, selAcct || 'pending')
    if (!raw.length) { setError('No valid transactions found. Check your column mapping.'); return }
    const matched = autoMatch(raw, allExpenses, personalRules, globalPatterns)
    setPreview(matched)
    setStage('preview')
    setError('')
  }

  /** User manually picks an expense item for a preview row — learns a rule + contributes globally */
  async function handleAssignMatch(index, expenseItemId) {
    const tx = preview[index]
    const expenseItem = allExpenses.find(e => e.id === expenseItemId)

    setPreview(prev => prev.map((t, i) => i === index
      ? { ...t, matched_expense_id: expenseItemId, matched_score: 1, matched_source: 'manual',
          suggested_category_name: undefined, suggested_pattern: undefined, suggested_hit_count: undefined }
      : t))

    if (expenseItem) {
      learnRule(tx.description, expenseItemId)
      const cat = categories.find(c => c.id === expenseItem.category_id)
      if (cat) contribute(tx.description, cat.name)
    }
  }

  /** User accepts a global suggestion chip — needs them to confirm which of THEIR expense items it maps to */
  function handleAcceptSuggestion(index) {
    // Filter the user's own expense items down to the suggested category to make the choice fast
    const tx = preview[index]
    const suggestedCat = categories.find(c => c.name === tx.suggested_category_name)
    setPreview(prev => prev.map((t, i) => i === index
      ? { ...t, _showAssignFor: suggestedCat?.id ?? true }
      : t))
  }

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
      .map(({ _showAssignFor, suggested_category_name, suggested_pattern, suggested_hit_count, matched_source, ...t }) =>
        ({ ...t, bank_account_id: acctId }))

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

  function startAnotherBank() { reset() }

  if (budgetLoading || txLoading) {
    return <div className="loading-center"><span className="spinner" /> Loading…</div>
  }

  const recentTx = transactions.slice(0, 50)
  const currentBankName = creatingNew
    ? newAcctName.trim()
    : bankAccounts.find(b => b.id === selAcct)?.name

  const ruleMatchCount   = preview.filter(t => t.matched_source === 'rule').length
  const fuzzyMatchCount  = preview.filter(t => t.matched_source === 'fuzzy').length
  const suggestionCount  = preview.filter(t => t.matched_source === 'global').length

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

        {stage === 'preview' && (
          <div className="rec-body fadein">
            <p className="rec-map-hint">
              <strong>{preview.filter(t => !t._skip).length}</strong> transactions ready to import for <strong>{currentBankName}</strong>.
            </p>
            <div className="rec-match-stats">
              {ruleMatchCount > 0 && <span className="rec-stat rec-stat-rule">🎯 {ruleMatchCount} from your rules</span>}
              {fuzzyMatchCount > 0 && <span className="rec-stat rec-stat-fuzzy">✓ {fuzzyMatchCount} matched</span>}
              {suggestionCount > 0 && <span className="rec-stat rec-stat-global">💡 {suggestionCount} suggested</span>}
            </div>

            <div className="rec-preview-list">
              {preview.map((tx, i) => {
                const matched = allExpenses.find(e => e.id === tx.matched_expense_id)
                const suggestedCat = tx.suggested_category_name
                  ? categories.find(c => c.name === tx.suggested_category_name)
                  : null
                const candidateExpenses = suggestedCat
                  ? allExpenses.filter(e => e.category_id === suggestedCat.id)
                  : []

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

                    {matched && tx.matched_source === 'rule' && (
                      <div className="rec-tx-match rec-tx-match-rule">
                        🎯 Auto-matched from your rules to <strong>{matched.label}</strong>
                      </div>
                    )}
                    {matched && tx.matched_source === 'fuzzy' && (
                      <div className="rec-tx-match">
                        ✓ Matched to <strong>{matched.label}</strong>
                      </div>
                    )}
                    {matched && tx.matched_source === 'manual' && (
                      <div className="rec-tx-match rec-tx-match-rule">
                        ✓ Assigned to <strong>{matched.label}</strong> — rule saved for next time
                      </div>
                    )}

                    {!matched && tx.suggested_category_name && !tx._showAssignFor && (
                      <div className="rec-tx-suggestion">
                        <span>
                          💡 Others categorize this as <strong>{tx.suggested_category_name}</strong>
                          {tx.suggested_hit_count > 1 ? ` (${tx.suggested_hit_count} users)` : ''}
                        </span>
                        <button
                          className="btn btn-g"
                          style={{ padding: '.18rem .5rem', fontSize: '.72rem' }}
                          onClick={() => handleAcceptSuggestion(i)}
                        >
                          Apply
                        </button>
                      </div>
                    )}

                    {!matched && tx._showAssignFor && (
                      <div className="rec-tx-assign">
                        <span style={{ fontSize: '.78rem', color: 'var(--ink3)' }}>
                          Which {tx.suggested_category_name} item is this?
                        </span>
                        <select
                          className="cell-select"
                          defaultValue=""
                          onChange={e => e.target.value && handleAssignMatch(i, e.target.value)}
                        >
                          <option value="" disabled>Select…</option>
                          {candidateExpenses.map(e => (
                            <option key={e.id} value={e.id}>{e.label}</option>
                          ))}
                          {candidateExpenses.length === 0 && (
                            <option value="" disabled>No items in this category yet</option>
                          )}
                        </select>
                      </div>
                    )}

                    {!matched && !tx.suggested_category_name && (
                      <div className="rec-tx-assign">
                        <span style={{ fontSize: '.78rem', color: 'var(--ink3)' }}>No match — assign manually:</span>
                        <select
                          className="cell-select"
                          defaultValue=""
                          onChange={e => e.target.value && handleAssignMatch(i, e.target.value)}
                        >
                          <option value="" disabled>Select…</option>
                          {allExpenses.map(e => (
                            <option key={e.id} value={e.id}>{e.label}</option>
                          ))}
                        </select>
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
