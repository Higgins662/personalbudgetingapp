import { useState, useRef } from 'react'
import { parseCSV, getCSVHeaders, extractTransactions } from '../../lib/csvParser'
import { autoMatch } from '../../lib/fuzzyMatch'

/**
 * Step 4 of the setup wizard: upload one or more bank statement CSVs.
 *
 * Unlike a single-file upload, this lets the user:
 *   1. Name a bank account ("Chase Checking")
 *   2. Upload its CSV, map columns
 *   3. See it added to a running list of "pending banks"
 *   4. Repeat for as many banks as they have, or click "Continue" when done
 *
 * Props:
 *   expenseItems   — all monthly + annual expense items, for fuzzy matching
 *   pendingBanks   — array of { name, colMap, transactions } already staged
 *   onAddBank      — (bankDraft) => void — appends a staged bank
 *   onRemoveBank   — (index) => void
 */
export default function WizardCsvStep({ expenseItems, pendingBanks, onAddBank, onRemoveBank }) {
  const fileRef = useRef(null)

  const [stage, setStage] = useState('name') // 'name' | 'upload' | 'map'
  const [bankName, setBankName] = useState('')
  const [csvFile, setCsvFile] = useState(null)
  const [csvHeaders, setCsvHeaders] = useState([])
  const [csvRows, setCsvRows] = useState([])
  const [colMap, setColMap] = useState({ dateCol: '', descCol: '', amountCol: '', amountSign: 'negative' })
  const [error, setError] = useState('')

  function resetForm() {
    setStage('name'); setBankName(''); setCsvFile(null)
    setCsvHeaders([]); setCsvRows([])
    setColMap({ dateCol: '', descCol: '', amountCol: '', amountSign: 'negative' })
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target.result
      const headers = getCSVHeaders(text)
      const rows = parseCSV(text)
      setCsvFile(file)
      setCsvHeaders(headers)
      setCsvRows(rows)

      const guess = k => headers.find(h => h.toLowerCase().includes(k)) ?? ''
      setColMap({
        dateCol: guess('date') || guess('posted'),
        descCol: guess('desc') || guess('payee') || guess('memo') || guess('merchant'),
        amountCol: guess('amount') || guess('debit') || guess('withdrawal'),
        amountSign: 'negative',
      })
      setStage('map')
      setError('')
    }
    reader.readAsText(file)
  }

  function handleAddThisBank() {
    if (!colMap.dateCol || !colMap.descCol || !colMap.amountCol) {
      setError('Please select Date, Description, and Amount columns.')
      return
    }
    const raw = extractTransactions(csvRows, colMap, null) // bank_account_id filled in after save
    if (!raw.length) {
      setError('No valid transactions found. Check your column mapping.')
      return
    }
    const matched = autoMatch(raw, expenseItems)

    onAddBank({
      name: bankName.trim() || 'Unnamed Account',
      colMap,
      fileName: csvFile?.name ?? '',
      transactions: matched,
    })
    resetForm()
  }

  return (
    <div>
      {/* ── Staged banks list ── */}
      {pendingBanks.length > 0 && (
        <div className="wiz-bank-list">
          {pendingBanks.map((b, i) => (
            <div key={i} className="wiz-bank-chip">
              <span className="wiz-bank-chip-icon">🏦</span>
              <div className="wiz-bank-chip-info">
                <span className="wiz-bank-chip-name">{b.name}</span>
                <span className="wiz-bank-chip-sub">
                  {b.transactions.length} transactions
                  {b.fileName ? ` · ${b.fileName}` : ''}
                </span>
              </div>
              <button className="del-btn" onClick={() => onRemoveBank(i)} title="Remove">×</button>
            </div>
          ))}
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {/* ── Stage: name the bank ── */}
      {stage === 'name' && (
        <div className="wiz-bank-add fadein">
          <div className="fg" style={{ marginBottom: '.85rem' }}>
            <label>Bank or card name</label>
            <input
              value={bankName}
              onChange={e => setBankName(e.target.value)}
              placeholder="e.g. Chase Checking, Wells Fargo Visa"
              autoFocus
            />
          </div>
          <button
            className="btn btn-p"
            disabled={!bankName.trim()}
            onClick={() => { setStage('upload') }}
          >
            Continue →
          </button>
        </div>
      )}

      {/* ── Stage: upload CSV for this bank ── */}
      {stage === 'upload' && (
        <div className="fadein">
          <div className="wiz-csv-zone" onClick={() => fileRef.current?.click()}>
            <div className="wiz-csv-zone-icon">📂</div>
            <div className="wiz-csv-zone-lbl">Upload CSV for {bankName}</div>
            <div className="wiz-csv-zone-hint">Exported from your bank's website or app</div>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
          </div>
          <button className="btn btn-g" onClick={() => setStage('name')}>← Back</button>
        </div>
      )}

      {/* ── Stage: map columns ── */}
      {stage === 'map' && (
        <div className="fadein">
          <p className="rec-map-hint">
            Found <strong>{csvRows.length}</strong> rows in <strong>{csvFile?.name}</strong>.
            Map the columns below.
          </p>
          <div className="fgrid">
            <div className="fg">
              <label>Date column</label>
              <select value={colMap.dateCol} onChange={e => setColMap(m => ({ ...m, dateCol: e.target.value }))}>
                <option value="">— Select —</option>
                {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div className="fg">
              <label>Description column</label>
              <select value={colMap.descCol} onChange={e => setColMap(m => ({ ...m, descCol: e.target.value }))}>
                <option value="">— Select —</option>
                {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div className="fg">
              <label>Amount column</label>
              <select value={colMap.amountCol} onChange={e => setColMap(m => ({ ...m, amountCol: e.target.value }))}>
                <option value="">— Select —</option>
                {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div className="fg">
              <label>Debits are…</label>
              <select value={colMap.amountSign} onChange={e => setColMap(m => ({ ...m, amountSign: e.target.value }))}>
                <option value="negative">Negative numbers (−$50)</option>
                <option value="positive">Positive numbers ($50)</option>
              </select>
            </div>
          </div>

          <div className="btn-row">
            <button className="btn btn-p" onClick={handleAddThisBank}>Add this bank →</button>
            <button className="btn btn-g" onClick={() => setStage('upload')}>← Back</button>
          </div>
        </div>
      )}

      {/* Add another bank prompt, shown after at least one is staged and form is idle */}
      {pendingBanks.length > 0 && stage === 'name' && !bankName && (
        <p className="wiz-add-another-hint">Add another bank above, or continue to the next step when you're done.</p>
      )}
    </div>
  )
}
