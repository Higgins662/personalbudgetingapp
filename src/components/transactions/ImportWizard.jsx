import { useState, useRef, useMemo } from 'react'
import { parseCSV, getCSVHeaders, extractTransactions, guessColMap } from '../../lib/csvParser'
import { autoMatch, matchIncomeTransactions } from '../../lib/fuzzyMatch'
import { fmt } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { usePayeeRules } from '../../hooks/usePayeeRules'
import { useGlobalPatterns } from '../../hooks/useGlobalPatterns'
import { tagTransfers } from '../../lib/transferDetection'
import { promoteToAnnual } from '../../lib/annualConversion'
import GroupedExpenseSelect from '../ui/GroupedExpenseSelect'
import IncomeSelect from '../ui/IncomeSelect'
import TransferPanel from '../ui/TransferPanel'
import '../../pages/ReconcilePage.css'

export default function ImportWizard({ budget, transactions: txHook, periods, onClose }) {
  const { monthly, annual, income, categories, addIncome, loading: budgetLoading, reload: reloadBudget } = budget
  const { bankAccounts, transactions, insertTransactions, updateBankAccount, addBankAccount,
          loading: txLoading, reload: reloadTx } = txHook
  const { user }                              = useAuth()
  const { rules: personalRules, learnRule }   = usePayeeRules()
  const { patterns: globalPatterns, contribute } = useGlobalPatterns()

  const fileRef = useRef(null)
  const [stage,        setStage]        = useState('bank')
  const [selAcct,      setSelAcct]      = useState('')
  const [newAcctName,  setNewAcctName]  = useState('')
  const [creatingNew,  setCreatingNew]  = useState(bankAccounts.length === 0)
  const [csvHeaders,   setCsvHeaders]   = useState([])
  const [csvRows,      setCsvRows]      = useState([])
  const [colMap,       setColMap]       = useState({ dateCol: '', descCol: '', amountCol: '', amountSign: 'negative', creditCol: '' })
  const [preview,      setPreview]      = useState([])
  const [transfers,    setTransfers]    = useState([])
  const [excludedTransfers, setExcludedTransfers] = useState(new Set())
  const [saving,       setSaving]       = useState(false)
  const [applying,     setApplying]     = useState(false)
  const [error,        setError]        = useState('')
  const [importResult, setImportResult] = useState(null)
  const [applyResult,  setApplyResult]  = useState(null)

  const allExpenses = [...monthly, ...annual]

  const transferCategoryId = useMemo(() =>
    categories.find(c => c.is_system)?.id ?? null, [categories])

  // Already imported this period detection
  const importedThisPeriod = useMemo(() => {
    if (!periods?.viewingMonth || !transactions.length) return new Set()
    const periodStart = periods.viewingMonth
    const periodEnd   = periodStart.slice(0, 7) + '-31'
    const imported    = new Set()
    for (const tx of transactions) {
      if (tx.date >= periodStart && tx.date <= periodEnd && tx.bank_account_id)
        imported.add(tx.bank_account_id)
    }
    return imported
  }, [transactions, periods?.viewingMonth])

  // Transactions in the current viewed month (for clear-month scope)
  const currentMonthTx = useMemo(() => {
    if (!periods?.viewingMonth) return []
    const periodStart = periods.viewingMonth
    const periodEnd   = periodStart.slice(0, 7) + '-31'
    return transactions.filter(tx =>
      !tx.ignored && tx.date >= periodStart && tx.date <= periodEnd
    )
  }, [transactions, periods?.viewingMonth])

  const currentMonthTotal = currentMonthTx
    .filter(t => t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount), 0)


  // Live column preview
  const livePreview = useMemo(() => {
    if (!csvRows.length || !colMap.dateCol || !colMap.descCol || !colMap.amountCol) return null
    const row = csvRows[0]
    return {
      date:   row[colMap.dateCol]   ?? '—',
      desc:   row[colMap.descCol]   ?? '—',
      amount: row[colMap.amountCol] ?? '—',
      credit: colMap.creditCol ? (row[colMap.creditCol] ?? '—') : null,
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
        // Restore remembered column mapping for this bank account
        setColMap({
          dateCol:    acct.col_date,
          descCol:    acct.col_desc,
          amountCol:  acct.col_amount,
          amountSign: acct.amount_sign ?? 'negative',
          creditCol:  acct.col_credit ?? '',
        })
      } else {
        // Auto-detect columns from headers
        setColMap(guessColMap(headers))
      }
      setStage('map'); setError('')
    }
    reader.readAsText(file)
  }

  function handleBuildPreview() {
    const splitMode = colMap.amountSign === 'split'
    if (!colMap.dateCol || !colMap.descCol) {
      setError('Please select Date and Description columns.'); return
    }
    if (splitMode && (!colMap.amountCol || !colMap.creditCol)) {
      setError('Please select both the Debits and Credits columns.'); return
    }
    if (!splitMode && !colMap.amountCol) {
      setError('Please select the Amount column.'); return
    }
    const raw = extractTransactions(csvRows, colMap, selAcct || 'pending')
    if (!raw.length) { setError('No valid transactions found. Check your column mapping.'); return }
    const tagged       = tagTransfers(raw)
    const txTransfers  = tagged.filter(t => t.likelyTransfer)
    const txNormal     = tagged.filter(t => !t.likelyTransfer)
    setTransfers(txTransfers)
    setExcludedTransfers(new Set(txTransfers.map((_, i) => i)))
    const matchedExpenses = autoMatch(txNormal, allExpenses, personalRules, globalPatterns)
    const matched = matchIncomeTransactions(matchedExpenses, income)
    setPreview(matched)
    setStage('preview'); setError('')
  }

  async function handleAssignMatch(index, expenseItemId) {
    const tx          = preview[index]
    const expenseItem = allExpenses.find(e => e.id === expenseItemId)
    setPreview(prev => prev.map((t, i) => i === index
      ? { ...t, matched_expense_id: expenseItemId, matched_score: 1, matched_source: 'manual',
          suggested_category_name: undefined } : t))
    if (expenseItem) {
      learnRule(tx.description, expenseItemId)
      const cat = categories.find(c => c.id === expenseItem.category_id)
      if (cat && !cat.is_system) contribute(tx.description, cat.name)
    }
  }

  function handleAssignIncome(index, incomeItemId) {
    setPreview(prev => prev.map((t, i) => i === index
      ? { ...t, matched_income_id: incomeItemId, matched_source: 'manual' } : t))
  }

  function handleMarkIncomeAs(index, reason) {
    setPreview(prev => prev.map((t, i) => i === index
      ? { ...t, matched_income_id: null, matched_source: reason } : t))
  }

  async function handleCreateIncomeInline(index, label) {
    const { error, data } = await addIncome({ label })
    if (error || !data) return null
    handleAssignIncome(index, data.id)
    return data.id
  }

  function handleAcceptSuggestion(index) {
    const tx           = preview[index]
    const suggestedCat = categories.find(c => c.name === tx.suggested_category_name)
    const repItem = suggestedCat
      ? allExpenses.find(e => e.category_id === suggestedCat.id && e.frequency !== 'annual')
      : null
    if (repItem) handleAssignMatch(index, repItem.id)
  }

  function handleToggleYearly(index) {
    setPreview(prev => prev.map((t, i) => i === index ? { ...t, _yearly: !t._yearly } : t))
  }

  function handleExcludeAllTransfers() { setExcludedTransfers(new Set(transfers.map((_, i) => i))) }
  function handleToggleTransfer(i) {
    setExcludedTransfers(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  async function handleSave() {
    setSaving(true); setError('')
    let acctId = selAcct
    if (creatingNew) {
      const { data, error } = await addBankAccount({ name: newAcctName.trim(), col_date: colMap.dateCol, col_desc: colMap.descCol, col_amount: colMap.amountCol, amount_sign: colMap.amountSign, col_credit: colMap.creditCol || null })
      if (error) { setError(error.message); setSaving(false); return }
      acctId = data.id
    } else {
      await updateBankAccount(acctId, { col_date: colMap.dateCol, col_desc: colMap.descCol, col_amount: colMap.amountCol, amount_sign: colMap.amountSign })
    }
    // Preview rows flagged yearly, keyed by the same signature insertTransactions
    // uses for dedup — lets us find each row's real (post-insert) id afterward.
    const sigOf = r => `${acctId ?? ''}|${r.date}|${r.amount}|${(r.description || '').trim().toUpperCase()}`
    const yearlyMatchByPreviewSig = new Map()
    for (const t of preview) {
      if (!t._skip && t._yearly && t.matched_expense_id) yearlyMatchByPreviewSig.set(sigOf(t), t.matched_expense_id)
    }

    const NON_INCOME_REASONS = ['refund', 'non_payroll_deposit']
    const normalToInsert = preview.filter(t => !t._skip)
      .map(({ suggested_category_name, suggested_pattern, suggested_hit_count, likelyTransfer, _yearly, ...t }) =>
        ({
          ...t,
          bank_account_id: acctId,
          ignored: t.ignored || NON_INCOME_REASONS.includes(t.matched_source),
        }))
    const transfersToInsert = transfers.filter((_, i) => !excludedTransfers.has(i))
      .map(({ likelyTransfer, matched_source, ...t }) => ({ ...t, bank_account_id: acctId, ignored: false }))
    const excludedToInsert = transfers.filter((_, i) => excludedTransfers.has(i))
      .map(({ likelyTransfer, matched_source, ...t }) => ({ ...t, bank_account_id: acctId, ignored: true }))
    const { data: insertedRows, error, duplicatesSkipped } = await insertTransactions([...normalToInsert, ...transfersToInsert, ...excludedToInsert])
    setSaving(false)
    if (error) { setError(error.message); return }

    // Promote any transaction flagged yearly to its own dedicated annual item.
    if (yearlyMatchByPreviewSig.size) {
      const promotions = (insertedRows ?? [])
        .map(row => [row, yearlyMatchByPreviewSig.get(sigOf(row))])
        .filter(([, expenseItemId]) => expenseItemId)
        .map(([row, expenseItemId]) => promoteToAnnual(row, expenseItemId))
      if (promotions.length) await Promise.all(promotions)
    }

    // Contribute every matched transaction to the global payee pattern pool.
    // Fire-and-forget — don't block the UI on these.
    for (const tx of normalToInsert) {
      if (!tx.matched_expense_id) continue
      const expenseItem = allExpenses.find(e => e.id === tx.matched_expense_id)
      if (!expenseItem) continue
      const cat = categories.find(c => c.id === expenseItem.category_id)
      if (cat && !cat.is_system) {
        contribute(tx.description, cat.name)
      }
    }
    const expenseRows    = normalToInsert.filter(t => t.amount < 0)
    const incomeRows     = normalToInsert.filter(t => t.amount > 0)
    const incomeResolved = incomeRows.filter(t => t.matched_income_id || NON_INCOME_REASONS.includes(t.matched_source))
    const matched        = expenseRows.filter(t => t.matched_expense_id).length + incomeResolved.length
    const unmatched      = expenseRows.filter(t => !t.matched_expense_id).length + (incomeRows.length - incomeResolved.length)
    const unmatchedTotal = expenseRows.filter(t => !t.matched_expense_id).reduce((s, t) => s + Math.abs(t.amount), 0)
    setImportResult({ matched, unmatched, unmatchedTotal, total: normalToInsert.length, transfersExcluded: excludedTransfers.size, transfersIncluded: transfersToInsert.length, duplicatesSkipped })
    setStage('done')
  }

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
    setStage('bank'); setPreview([]); setTransfers([]); setExcludedTransfers(new Set())
    setCsvRows([]); setCsvHeaders([])
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
  const budgetCategories = categories.filter(c => !c.is_system)

  return (
    <div className="fadein import-wizard-overlay">
      <div className="sec-hdr">
        <span className="sec-title">⬆ Import statement</span>
        <button className="btn btn-g" style={{ fontSize: '.8rem' }} onClick={onClose}>✕ Close</button>
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

        {/* Bank */}
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
            {!creatingNew && selAcct && importedThisPeriod.has(selAcct) && (
              <div className="alert alert-info" style={{ marginBottom: '1rem', fontSize: '.83rem' }}>
                ⚠️ You've already imported a statement from this account this month. Importing again may add duplicate transactions.
              </div>
            )}
            {(creatingNew || bankAccounts.length === 0) && (
              <div className="fg" style={{ marginBottom: '1rem' }}>
                <label>New bank account name</label>
                <input value={newAcctName} onChange={e => setNewAcctName(e.target.value)} placeholder="e.g. Chase Checking" autoFocus />
              </div>
            )}
            <button className="btn btn-p" onClick={handleConfirmBank}>Continue →</button>
          </div>
        )}

        {/* Upload */}
        {stage === 'select' && (
          <div className="rec-body fadein">
            <div className="alert alert-info" style={{ marginBottom: '1rem', fontSize: '.83rem' }}>Importing for <strong>{currentBankName}</strong></div>
            <div className="rec-upload-area" onClick={() => fileRef.current?.click()}>
              <div className="rec-upload-icon">📄</div>
              <div className="rec-upload-label">Click to upload a CSV bank statement</div>
              <div className="rec-upload-hint">Exported from your bank's website or app</div>
              <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
            </div>
            <button className="btn btn-g" style={{ marginTop: '1rem' }} onClick={() => setStage('bank')}>← Back</button>
          </div>
        )}

        {/* Map */}
        {stage === 'map' && (
          <div className="rec-body fadein">
            <p className="rec-map-hint">Found <strong>{csvRows.length}</strong> rows for <strong>{currentBankName}</strong>. Map each column.</p>
            <div className="fgrid">
              {[{ key: 'dateCol', label: 'Date column' }, { key: 'descCol', label: 'Description column' }].map(({ key, label }) => (
                <div className="fg" key={key}>
                  <label>{label}</label>
                  <select value={colMap[key]} onChange={e => setColMap(m => ({ ...m, [key]: e.target.value }))}>
                    <option value="">— Select —</option>
                    {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}

              {/* Single amount column */}
              {colMap.amountSign !== 'split' && (
                <div className="fg">
                  <label>Amount column</label>
                  <select value={colMap.amountCol} onChange={e => setColMap(m => ({ ...m, amountCol: e.target.value }))}>
                    <option value="">— Select —</option>
                    {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              )}

              <div className="fg">
                <label>How many amount columns?</label>
                <select
                  value={colMap.amountSign === 'split' ? '2' : '1'}
                  onChange={e => {
                    if (e.target.value === '2') {
                      setColMap(m => ({ ...m, amountSign: 'split', amountCol: '', creditCol: '' }))
                    } else {
                      setColMap(m => ({ ...m, amountSign: 'negative', creditCol: '' }))
                    }
                  }}
                >
                  <option value="1">1 column (debits + credits combined)</option>
                  <option value="2">2 columns (debits and credits separate)</option>
                </select>
              </div>

              {/* Single column — show sign selector */}
              {colMap.amountSign !== 'split' && (
                <div className="fg">
                  <label>Debit amounts are…</label>
                  <select value={colMap.amountSign} onChange={e => setColMap(m => ({ ...m, amountSign: e.target.value }))}>
                    <option value="negative">Negative  −50 or (50)</option>
                    <option value="positive">Positive  50</option>
                  </select>
                </div>
              )}
            </div>

            {/* Two-column mode */}
            {colMap.amountSign === 'split' && (
              <div className="fgrid" style={{ marginTop: '0' }}>
                <div className="fg">
                  <label>Debits / Withdrawals column</label>
                  <select value={colMap.amountCol} onChange={e => setColMap(m => ({ ...m, amountCol: e.target.value }))}>
                    <option value="">— Select —</option>
                    {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label>Credits / Deposits column</label>
                  <select value={colMap.creditCol} onChange={e => setColMap(m => ({ ...m, creditCol: e.target.value }))}>
                    <option value="">— Select —</option>
                    {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
            )}
            {livePreview && (
              <div className="rec-col-preview">
                <div className="rec-col-preview-label">First transaction with these mappings:</div>
                <div className="rec-col-preview-row">
                  <span className="rec-col-preview-field"><span className="rec-col-preview-key">Date</span><span className="rec-col-preview-val">{livePreview.date}</span></span>
                  <span className="rec-col-preview-field"><span className="rec-col-preview-key">Description</span><span className="rec-col-preview-val">{livePreview.desc}</span></span>
                  <span className="rec-col-preview-field">
                    <span className="rec-col-preview-key">{colMap.amountSign === 'split' ? 'Debits' : 'Amount'}</span>
                    <span className="rec-col-preview-val mono">{livePreview.amount}</span>
                  </span>
                  {livePreview.credit !== null && (
                    <span className="rec-col-preview-field">
                      <span className="rec-col-preview-key">Credits</span>
                      <span className="rec-col-preview-val mono">{livePreview.credit}</span>
                    </span>
                  )}
                </div>
              </div>
            )}
            {csvRows.length > 0 && (
              <div className="rec-sample">
                <div className="rec-sample-label">First 3 rows of your CSV</div>
                <div className="rec-sample-scroll">
                  <table>
                    <thead><tr>{csvHeaders.map(h => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>{csvRows.slice(0, 3).map((row, i) => <tr key={i}>{csvHeaders.map(h => <td key={h}>{row[h]}</td>)}</tr>)}</tbody>
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

        {/* Preview */}
        {stage === 'preview' && (
          <div className="rec-body fadein">
            <p className="rec-map-hint">
              <strong>{preview.filter(t => !t._skip).length}</strong> transactions
              {transfers.length > 0 && ` + ${transfers.length} detected transfer${transfers.length === 1 ? '' : 's'}`} for <strong>{currentBankName}</strong>.
            </p>
            <div className="rec-match-stats">
              {ruleMatchCount  > 0 && <span className="rec-stat rec-stat-rule">🎯 {ruleMatchCount} from your rules</span>}
              {fuzzyMatchCount > 0 && <span className="rec-stat rec-stat-fuzzy">✓ {fuzzyMatchCount} matched</span>}
              {suggestionCount > 0 && <span className="rec-stat rec-stat-global">💡 {suggestionCount} suggested</span>}
              {transfers.length > 0 && <span className="rec-stat" style={{ background: '#fff8e8', color: 'var(--gold)', border: '1px solid #e8d8a8' }}>🔄 {transfers.length} transfer{transfers.length === 1 ? '' : 's'} detected</span>}
            </div>
            <TransferPanel transfers={transfers} excluded={excludedTransfers} onExcludeAll={handleExcludeAllTransfers} onToggle={handleToggleTransfer} />
            <div className="rec-preview-list">
              {preview.map((tx, i) => {
                const isIncome = tx.amount > 0
                const matched      = !isIncome ? allExpenses.find(e => e.id === tx.matched_expense_id) : null
                const matchedIncome = isIncome ? income.find(e => e.id === tx.matched_income_id) : null
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

                    {isIncome ? (
                      <>
                        {matchedIncome && (
                          <div className={`rec-tx-match${income.length === 1 ? ' rec-tx-match-rule' : ''}`}>
                            💵 Matched to <strong>{matchedIncome.label}</strong> — change below if wrong
                          </div>
                        )}
                        {tx.matched_source === 'refund' && (
                          <div className="rec-tx-match">🔄 Marked as a refund — not counted as income</div>
                        )}
                        {tx.matched_source === 'non_payroll_deposit' && (
                          <div className="rec-tx-match">💰 Marked as a non-payroll deposit — not counted as income</div>
                        )}
                        <div className="rec-tx-assign">
                          <IncomeSelect
                            incomeItems={income}
                            value={tx.matched_income_id ?? ''}
                            status={['refund', 'non_payroll_deposit'].includes(tx.matched_source) ? tx.matched_source : null}
                            onSelectIncome={id => handleAssignIncome(i, id)}
                            onMarkAs={reason => handleMarkIncomeAs(i, reason)}
                            onCreateIncome={label => handleCreateIncomeInline(i, label)}
                            placeholder="Choose income source…"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        {matched && tx.matched_source === 'rule'   && <div className="rec-tx-match rec-tx-match-rule">🎯 Auto-matched to <strong>{matched.label}</strong> — change below if wrong</div>}
                        {matched && tx.matched_source === 'fuzzy'  && <div className="rec-tx-match">✓ Matched to <strong>{matched.label}</strong> — change below if wrong</div>}
                        {matched && tx.matched_source === 'manual' && <div className="rec-tx-match rec-tx-match-rule">✓ Assigned to <strong>{matched.label}</strong></div>}
                        {!matched && tx.suggested_category_name && (
                          <div className="rec-tx-suggestion">
                            <span>💡 Others categorize this as <strong>{tx.suggested_category_name}</strong>{tx.suggested_hit_count > 1 ? ` (${tx.suggested_hit_count} users)` : ''}</span>
                            <button className="btn btn-g" style={{ padding: '.18rem .5rem', fontSize: '.72rem' }} onClick={() => handleAcceptSuggestion(i)}>Apply</button>
                          </div>
                        )}
                        <div className="rec-tx-assign">
                          <GroupedExpenseSelect
                            allExpenses={allExpenses}
                            categories={budgetCategories}
                            value={tx.matched_expense_id ?? ''}
                            onChange={id => handleAssignMatch(i, id)}
                            placeholder="Choose category…"
                          />
                          <label className="rec-tx-yearly-label" title={tx.matched_expense_id ? 'Track as its own yearly line instead of monthly' : 'Choose a category first'}>
                            <input
                              type="checkbox"
                              checked={!!tx._yearly}
                              disabled={!tx.matched_expense_id}
                              onChange={() => handleToggleYearly(i)}
                            />
                            Yearly
                          </label>
                        </div>
                      </>
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

        {/* Done */}
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
                  <div className="wiz-scard"><div className="wiz-scard-val" style={{ color: importResult.unmatched > 0 ? 'var(--gold)' : 'var(--ink3)' }}>{importResult.unmatched}</div><div className="wiz-scard-lbl">Unmatched</div></div>
                </div>
                {importResult.transfersExcluded > 0 && (
                  <div className="alert alert-info" style={{ fontSize: '.83rem', marginBottom: '1rem' }}>
                    🔄 <strong>{importResult.transfersExcluded}</strong> transfer{importResult.transfersExcluded === 1 ? '' : 's'} excluded and saved as ignored.
                  </div>
                )}
                {importResult.duplicatesSkipped > 0 && (
                  <div className="alert alert-info" style={{ fontSize: '.83rem', marginBottom: '1rem' }}>
                    ⏭ <strong>{importResult.duplicatesSkipped}</strong> duplicate transaction{importResult.duplicatesSkipped === 1 ? '' : 's'} already existed and {importResult.duplicatesSkipped === 1 ? 'was' : 'were'} skipped.
                  </div>
                )}
                {importResult.unmatched > 0 && (
                  <div className="alert alert-info" style={{ fontSize: '.83rem', marginBottom: '1rem' }}>
                    💡 <strong>{fmt(importResult.unmatchedTotal)}</strong> across {importResult.unmatched} unmatched transaction{importResult.unmatched === 1 ? '' : 's'}. Assign them in the transaction list after closing this wizard.
                  </div>
                )}
              </div>
            )}
            {!applyResult ? (
              <div className="rec-apply-box">
                <div className="rec-apply-title">Add these transactions to your budget</div>
                <p className="rec-apply-desc">This updates your Actual amounts for this month so your Dashboard shows real numbers. Each transaction is marked as counted so it won't be added again.</p>
                {error && <div className="alert alert-error" style={{ marginBottom: '.75rem' }}>{error}</div>}
                <button className="btn btn-p" onClick={handleApplyToBudget} disabled={applying}>
                  {applying ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Updating…</> : '✓ Update my budget with these transactions'}
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
                    💡 <strong>{applyResult.unmatched_count}</strong> unmatched transaction{applyResult.unmatched_count === 1 ? '' : 's'} ({fmt(applyResult.unmatched_total)}) still need assignment below.
                  </div>
                )}
                <div className="btn-row">
                  <button className="btn btn-p" onClick={onClose}>✓ Done</button>
                  <button className="btn btn-g" onClick={reset}>Import another statement</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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
