import { useState, useRef, useMemo } from 'react'
import { parseCSV, getCSVHeaders, extractTransactions } from '../lib/csvParser'
import { autoMatch } from '../lib/fuzzyMatch'
import { fmt } from '../lib/format'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { usePayeeRules } from '../hooks/usePayeeRules'
import { useGlobalPatterns } from '../hooks/useGlobalPatterns'
import GroupedExpenseSelect from '../components/ui/GroupedExpenseSelect'
import './ReconcilePage.css'

export default function ReconcilePage({ budget, transactions: txHook, periods }) {
  const { monthly, annual, categories, loading: budgetLoading, reload: reloadBudget } = budget
  const { bankAccounts, transactions, insertTransactions, updateBankAccount, addBankAccount,
          loading: txLoading, reload: reloadTx } = txHook
  const { user }                             = useAuth()
  const { rules: personalRules, learnRule }  = usePayeeRules()
  const { patterns: globalPatterns, contribute } = useGlobalPatterns()

  const fileRef = useRef(null)
  const [stage,       setStage]       = useState('bank')
  const [selAcct,     setSelAcct]     = useState('')
  const [newAcctName, setNewAcctName] = useState('')
  const [creatingNew, setCreatingNew] = useState(bankAccounts.length === 0)
  const [csvHeaders,  setCsvHeaders]  = useState([])
  const [csvRows,     setCsvRows]     = useState([])
  const [colMap,      setColMap]      = useState({ dateCol: '', descCol: '', amountCol: '', amountSign: 'negative' })
  const [preview,     setPreview]     = useState([])
  const [saving,      setSaving]      = useState(false)
  const [applying,    setApplying]    = useState(false)
  const [error,       setError]       = useState('')
  const [importResult, setImportResult] = useState(null)
  const [applyResult,  setApplyResult]  = useState(null)

  const allExpenses = [...monthly, ...annual]

  // Fix #3 — determine which bank accounts have already been imported this period
  const importedThisPeriod = useMemo(() => {
    if (!periods?.viewingMonth || !transactions.length) return new Set()
    const periodStart = periods.viewingMonth
    const periodEnd   = periodStart.slice(0, 7) + '-31' // overshoot — JS Date handles it
    const imported    = new Set()
    for (const tx of transactions) {
      if (tx.date >= periodStart && tx.date <= periodEnd && tx.bank_account_id) {
        imported.add(tx.bank_account_id)
      }
    }
    return imported
  }, [transactions, periods?.viewingMonth])

  // Fix #4 — live preview row from current colMap + first CSV row
  const livePreview = useMemo(() => {
    if (!csvRows.length || !colMap.dateCol || !colMap.descCol || !colMap.amountCol) return null
    const row = csvRows[0]
    return {
      date:   row[colMap.dateCol]   ?? '—',
      desc:   row[colMap.descCol]   ?? '—',
      amount: row[colMap.amountCol] ?? '—',
    }
  }, [csvRows, colMap])

  function handleConfirmBank() {
    if (creatingNew && !newAcctName.trim()) { setError('Please name this bank account.'); return }
    if (!creatingNew && !selAcct)           { setError('Please select a bank account.'); return }
    setError(''); setStage('select')
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text    = ev.target.result
      const headers = getCSVHeaders(text)
      const rows    = parseCSV(text)
      setCsvHeaders(headers); setCsvRows(rows)
      const acct = bankAccounts.find(b => b.id === selAcct)
      if (!creatingNew && acct?.col_date) {
        setColMap({ dateCol: acct.col_date, descCol: acct.col_desc,
                    amountCol: acct.col_amount, amountSign: acct.amount_sign ?? 'negative' })
      } else {
        const guess = k => headers.find(h => h.toLowerCase().includes(k)) ?? ''
        setColMap({ dateCol: guess('date'), descCol: guess('desc') || guess('payee') || guess('memo'),
                    amountCol: guess('amount') || guess('debit') || guess('withdrawal'), amountSign: 'negative' })
      }
      setStage('map'); setError('')
    }
    reader.readAsText(file)
  }

  function handleBuildPreview() {
    if (!colMap.dateCol || !colMap.descCol || !colMap.amountCol) {
      setError('Please select Date, Description, and Amount columns.'); return
    }
    const raw     = extractTransactions(csvRows, colMap, selAcct || 'pending')
    if (!raw.length) { setError('No valid transactions found. Check your column mapping.'); return }
    const matched = autoMatch(raw, allExpenses, personalRules, globalPatterns)
    setPreview(matched); setStage('preview'); setError('')
  }

  async function handleAssignMatch(index, expenseItemId) {
    const tx          = preview[index]
    const expenseItem = allExpenses.find(e => e.id === expenseItemId)
    setPreview(prev => prev.map((t, i) => i === index
      ? { ...t, matched_expense_id: expenseItemId, matched_score: 1, matched_source: 'manual',
          suggested_category_name: undefined, _showAssignFor: undefined }
      : t))
    if (expenseItem) {
      learnRule(tx.description, expenseItemId)
      const cat = categories.find(c => c.id === expenseItem.category_id)
      if (cat) contribute(tx.description, cat.name)
    }
  }

  function handleAcceptSuggestion(index) {
    const tx           = preview[index]
    const suggestedCat = categories.find(c => c.name === tx.suggested_category_name)
    setPreview(prev => prev.map((t, i) => i === index
      ? { ...t, _showAssignFor: suggestedCat?.id ?? true } : t))
  }

  async function handleSave() {
    setSaving(true); setError('')
    let acctId = selAcct
    if (creatingNew) {
      const { data, error } = await addBankAccount({
        name: newAcctName.trim(), col_date: colMap.dateCol, col_desc: colMap.descCol,
        col_amount: colMap.amountCol, amount_sign: colMap.amountSign,
      })
      if (error) { setError(error.message); setSaving(false); return }
      acctId = data.id
    } else {
      await updateBankAccount(acctId, {
        col_date: colMap.dateCol, col_desc: colMap.descCol,
        col_amount: colMap.amountCol, amount_sign: colMap.amountSign,
      })
    }
    const toInsert = preview.filter(t => !t._skip).map(
      ({ _showAssignFor, suggested_category_name, suggested_pattern,
         suggested_hit_count, matched_source, ...t }) => ({ ...t, bank_account_id: acctId }))
    const { error } = await insertTransactions(toInsert)
    setSaving(false)
    if (error) { setError(error.message); return }
    const matched       = toInsert.filter(t => t.matched_expense_id).length
    const unmatched     = toInsert.filter(t => !t.matched_expense_id && !t.ignored).length
    const unmatchedTotal = toInsert.filter(t => !t.matched_expense_id && !t.ignored && t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0)
    setImportResult({ matched, unmatched, unmatchedTotal, total: toInsert.length })
    setStage('done')
  }

  // Fix #10 — plain-English apply button label used below
  async function handleApplyToBudget() {
    setApplying(true); setError('')
    const { data, error } = await supabase.rpc('apply_transactions_to_budget', { p_user_id: user.id })
    setApplying(false)
    if (error) { setError(error.message); return }
    setApplyResult(data)
    reloadBudget(); reloadTx()
    if (periods) periods.reload()
  }

  function reset() {
    setStage('bank'); setPreview([]); setCsvRows([]); setCsvHeaders([])
    setError(''); setNewAcctName(''); setSelAcct('')
    setImportResult(null); setApplyResult(null)
    setCreatingNew(bankAccounts.length === 0)
    if (fileRef.current) fileRef.current.value = ''
  }

  if (budgetLoading || txLoading) return <div className="loading-center"><span className="spinner" /> Loading…</div>

  const recentTx        = transactions.slice(0, 50)
  const currentBankName = creatingNew ? newAcctName.trim() : bankAccounts.find(b => b.id === selAcct)?.name
  const ruleMatchCount  = preview.filter(t => t.matched_source === 'rule').length
  const fuzzyMatchCount = preview.filter(t => t.matched_source === 'fuzzy').length
  const suggestionCount = preview.filter(t => t.matched_source === 'global').length
  const unappliedCount  = transactions.filter(t => !t.applied && !t.ignored && t.matched_expense_id).length

  return (
    <div className="fadein">
      <div className="sec-hdr">
        <span className="sec-title">🔄 Reconcile</span>
        <span className="sec-hint">Import bank statements</span>
      </div>

      {unappliedCount > 0 && stage === 'bank' && !applyResult && (
        <div className="alert alert-info" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem' }}>
          <span><strong>{unappliedCount}</strong> matched transaction{unappliedCount === 1 ? '' : 's'} ready to add to your budget.</span>
          {/* Fix #10 */}
          <button className="btn btn-p" style={{ fontSize: '.82rem' }} onClick={handleApplyToBudget} disabled={applying}>
            {applying ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Updating…</> : '✓ Update my budget totals'}
          </button>
        </div>
      )}

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

        {/* Bank stage */}
        {stage === 'bank' && (
          <div className="rec-body fadein">
            <p className="rec-map-hint">Select the bank account this statement is from, or add a new one.</p>
            {bankAccounts.length > 0 && (
              <div className="fg" style={{ marginBottom: '1rem' }}>
                <label>Which bank is this statement from?</label>
                <select value={creatingNew ? '__new__' : selAcct} onChange={e => {
                  if (e.target.value === '__new__') { setCreatingNew(true); setSelAcct('') }
                  else { setCreatingNew(false); setSelAcct(e.target.value) }
                }}>
                  <option value="">— Select a bank —</option>
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}{importedThisPeriod.has(b.id) ? ' ✓ already imported this month' : ''}
                    </option>
                  ))}
                  <option value="__new__">+ Add a new bank account</option>
                </select>
              </div>
            )}
            {/* Fix #3 — warning if selected bank already imported this period */}
            {!creatingNew && selAcct && importedThisPeriod.has(selAcct) && (
              <div className="alert alert-info" style={{ marginBottom: '1rem', fontSize: '.83rem' }}>
                ⚠️ You've already imported a statement from this account this month.
                Importing again will add duplicate transactions. Only continue if you're
                importing a different date range.
              </div>
            )}
            {(creatingNew || bankAccounts.length === 0) && (
              <div className="fg" style={{ marginBottom: '1rem' }}>
                <label>New bank account name</label>
                <input value={newAcctName} onChange={e => setNewAcctName(e.target.value)}
                  placeholder="e.g. Chase Checking" autoFocus />
              </div>
            )}
            <button className="btn btn-p" onClick={handleConfirmBank}>Continue →</button>
          </div>
        )}

        {/* Upload stage */}
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

        {/* Map stage */}
        {stage === 'map' && (
          <div className="rec-body fadein">
            <p className="rec-map-hint">
              Found <strong>{csvRows.length}</strong> rows for <strong>{currentBankName}</strong>.
              Map each column from your CSV.
            </p>
            <div className="fgrid">
              {[{ key: 'dateCol', label: 'Date column' },
                { key: 'descCol', label: 'Description column' },
                { key: 'amountCol', label: 'Amount column' }].map(({ key, label }) => (
                <div className="fg" key={key}>
                  <label>{label}</label>
                  <select value={colMap[key]} onChange={e => setColMap(m => ({ ...m, [key]: e.target.value }))}>
                    <option value="">— Select —</option>
                    {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
              <div className="fg">
                <label>Debit amounts are…</label>
                <select value={colMap.amountSign} onChange={e => setColMap(m => ({ ...m, amountSign: e.target.value }))}>
                  <option value="negative">Negative numbers (−$50)</option>
                  <option value="positive">Positive numbers ($50)</option>
                </select>
              </div>
            </div>

            {/* Fix #4 — live column mapping preview */}
            {livePreview && (
              <div className="rec-col-preview">
                <div className="rec-col-preview-label">First transaction with these mappings:</div>
                <div className="rec-col-preview-row">
                  <span className="rec-col-preview-field">
                    <span className="rec-col-preview-key">Date</span>
                    <span className="rec-col-preview-val">{livePreview.date}</span>
                  </span>
                  <span className="rec-col-preview-field">
                    <span className="rec-col-preview-key">Description</span>
                    <span className="rec-col-preview-val">{livePreview.desc}</span>
                  </span>
                  <span className="rec-col-preview-field">
                    <span className="rec-col-preview-key">Amount</span>
                    <span className="rec-col-preview-val mono">{livePreview.amount}</span>
                  </span>
                </div>
              </div>
            )}

            {csvRows.length > 0 && (
              <div className="rec-sample">
                <div className="rec-sample-label">First 3 rows of your CSV</div>
                <div className="rec-sample-scroll">
                  <table>
                    <thead><tr>{csvHeaders.map(h => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>{csvRows.slice(0, 3).map((row, i) =>
                      <tr key={i}>{csvHeaders.map(h => <td key={h}>{row[h]}</td>)}</tr>
                    )}</tbody>
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

        {/* Preview stage */}
        {stage === 'preview' && (
          <div className="rec-body fadein">
            <p className="rec-map-hint">
              <strong>{preview.filter(t => !t._skip).length}</strong> transactions for <strong>{currentBankName}</strong>.
            </p>
            <div className="rec-match-stats">
              {ruleMatchCount  > 0 && <span className="rec-stat rec-stat-rule">🎯 {ruleMatchCount} from your rules</span>}
              {fuzzyMatchCount > 0 && <span className="rec-stat rec-stat-fuzzy">✓ {fuzzyMatchCount} matched</span>}
              {suggestionCount > 0 && <span className="rec-stat rec-stat-global">💡 {suggestionCount} suggested</span>}
            </div>

            <div className="rec-preview-list">
              {preview.map((tx, i) => {
                const matched      = allExpenses.find(e => e.id === tx.matched_expense_id)
                const suggestedCat = tx.suggested_category_name
                  ? categories.find(c => c.name === tx.suggested_category_name) : null
                const candidates   = suggestedCat
                  ? allExpenses.filter(e => e.category_id === suggestedCat.id) : []

                return (
                  <div key={i} className={`rec-tx${tx._skip ? ' rec-tx-skip' : ''}`}>
                    <div className="rec-tx-main">
                      <div className="rec-tx-info">
                        <span className="rec-tx-date">{tx.date}</span>
                        <span className="rec-tx-desc">{tx.description}</span>
                      </div>
                      <div className="rec-tx-right">
                        <span className={`mono ${tx.amount < 0 ? 'v-red' : 'v-green'}`}>{fmt(tx.amount)}</span>
                        <button className="btn btn-g" style={{ padding: '.2rem .5rem', fontSize: '.73rem' }}
                          onClick={() => setPreview(p => p.map((t, j) => j === i ? { ...t, _skip: !t._skip } : t))}>
                          {tx._skip ? 'Restore' : 'Skip'}
                        </button>
                      </div>
                    </div>

                    {matched && tx.matched_source === 'rule'   && <div className="rec-tx-match rec-tx-match-rule">🎯 Auto-matched to <strong>{matched.label}</strong></div>}
                    {matched && tx.matched_source === 'fuzzy'  && <div className="rec-tx-match">✓ Matched to <strong>{matched.label}</strong></div>}
                    {matched && tx.matched_source === 'manual' && <div className="rec-tx-match rec-tx-match-rule">✓ Assigned to <strong>{matched.label}</strong></div>}

                    {!matched && tx.suggested_category_name && !tx._showAssignFor && (
                      <div className="rec-tx-suggestion">
                        <span>💡 Others categorize this as <strong>{tx.suggested_category_name}</strong>
                          {tx.suggested_hit_count > 1 ? ` (${tx.suggested_hit_count} users)` : ''}</span>
                        <button className="btn btn-g" style={{ padding: '.18rem .5rem', fontSize: '.72rem' }}
                          onClick={() => handleAcceptSuggestion(i)}>Apply</button>
                      </div>
                    )}

                    {/* Fix #9 — grouped dropdown for suggestions */}
                    {!matched && tx._showAssignFor && (
                      <div className="rec-tx-assign">
                        <span style={{ fontSize: '.78rem', color: 'var(--ink3)' }}>
                          Which {tx.suggested_category_name} item is this?
                        </span>
                        <GroupedExpenseSelect
                          allExpenses={candidates.length ? candidates : allExpenses}
                          categories={categories}
                          onChange={id => handleAssignMatch(i, id)}
                          placeholder={candidates.length ? `Select ${tx.suggested_category_name} item…` : 'Assign to budget item…'}
                        />
                      </div>
                    )}

                    {/* Fix #9 — grouped dropdown for unmatched */}
                    {!matched && !tx.suggested_category_name && (
                      <div className="rec-tx-assign">
                        <span style={{ fontSize: '.78rem', color: 'var(--ink3)' }}>No match — assign to:</span>
                        <GroupedExpenseSelect
                          allExpenses={allExpenses}
                          categories={categories}
                          onChange={id => handleAssignMatch(i, id)}
                        />
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

        {/* Done stage */}
        {stage === 'done' && (
          <div className="rec-body fadein">
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '.5rem' }}>✅</div>
              <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>Import complete for {currentBankName}</div>
            </div>

            {importResult && (
              <div className="rec-apply-summary">
                <div className="wiz-summary-grid" style={{ marginBottom: '1rem' }}>
                  <div className="wiz-scard"><div className="wiz-scard-val">{importResult.total}</div><div className="wiz-scard-lbl">Imported</div></div>
                  <div className="wiz-scard"><div className="wiz-scard-val" style={{ color: 'var(--green)' }}>{importResult.matched}</div><div className="wiz-scard-lbl">Matched</div></div>
                  <div className="wiz-scard">
                    <div className="wiz-scard-val" style={{ color: importResult.unmatched > 0 ? 'var(--gold)' : 'var(--ink3)' }}>{importResult.unmatched}</div>
                    <div className="wiz-scard-lbl">Unmatched</div>
                  </div>
                </div>
                {importResult.unmatched > 0 && (
                  <div className="alert alert-info" style={{ fontSize: '.83rem', marginBottom: '1rem' }}>
                    💡 <strong>{fmt(importResult.unmatchedTotal)}</strong> across {importResult.unmatched} transaction{importResult.unmatched === 1 ? '' : 's'} couldn't be matched. Assign them in the Recent Transactions list below, then update your budget totals.
                  </div>
                )}
              </div>
            )}

            {/* Fix #10 — plain-English button label */}
            {!applyResult ? (
              <div className="rec-apply-box">
                <div className="rec-apply-title">Add these transactions to your budget</div>
                <p className="rec-apply-desc">
                  This updates the <strong>Actual</strong> amounts on your Income and Expenses tabs
                  with what you really spent — so your Dashboard shows real numbers for this month.
                  Each transaction is marked as counted so it won't be added again.
                </p>
                {error && <div className="alert alert-error" style={{ marginBottom: '.75rem' }}>{error}</div>}
                <button className="btn btn-p" onClick={handleApplyToBudget} disabled={applying}>
                  {applying
                    ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Updating…</>
                    : '✓ Update my budget with these transactions'}
                </button>
                <button className="btn btn-g" style={{ marginLeft: '.5rem' }} onClick={reset}>Skip for now</button>
              </div>
            ) : (
              <div className="rec-apply-result fadein">
                <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
                  ✅ Budget updated — {applyResult.transactions_applied} transaction{applyResult.transactions_applied === 1 ? '' : 's'} added across {applyResult.expense_items_updated + applyResult.income_items_updated} line items.
                </div>
                {applyResult.unmatched_count > 0 && (
                  <div className="alert alert-info" style={{ fontSize: '.83rem', marginBottom: '1rem' }}>
                    💡 <strong>{applyResult.unmatched_count}</strong> unmatched transaction{applyResult.unmatched_count === 1 ? '' : 's'} ({fmt(applyResult.unmatched_total)}) still need assignment in Recent Transactions below.
                  </div>
                )}
                <button className="btn btn-p" onClick={reset}>Import another statement</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recent transactions */}
      {recentTx.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <div className="sec-hdr">
            <span className="sec-title">Recent Transactions</span>
            <span className="sec-hint">{transactions.length} total · {transactions.filter(t => t.applied).length} counted</span>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Description</th><th>Account</th>
                  <th className="r">Amount</th><th>Matched to</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTx.map(tx => {
                  const matched = allExpenses.find(e => e.id === tx.matched_expense_id)
                  const acct    = bankAccounts.find(b => b.id === tx.bank_account_id)
                  return (
                    <tr key={tx.id} style={{ opacity: tx.applied ? .6 : 1 }}>
                      <td className="mono" style={{ fontSize: '.8rem', color: 'var(--ink3)' }}>{tx.date}</td>
                      <td style={{ fontSize: '.85rem' }}>{tx.description}</td>
                      <td style={{ fontSize: '.8rem', color: 'var(--ink3)' }}>{acct?.name ?? '—'}</td>
                      <td className={`r mono ${tx.amount < 0 ? 'v-red' : 'v-green'}`}>{fmt(tx.amount)}</td>
                      <td>{matched
                        ? <span style={{ fontSize: '.8rem', color: 'var(--green)' }}>✓ {matched.label}</span>
                        : <span style={{ fontSize: '.8rem', color: 'var(--ink3)' }}>—</span>}
                      </td>
                      <td>
                        {tx.applied
                          ? <span style={{ fontSize: '.75rem', color: 'var(--ink3)' }}>counted</span>
                          : tx.matched_expense_id
                            ? <span style={{ fontSize: '.75rem', color: 'var(--gold)' }}>pending</span>
                            : <span style={{ fontSize: '.75rem', color: 'var(--red)' }}>unmatched</span>}
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
