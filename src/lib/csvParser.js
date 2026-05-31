/**
 * CSV parsing utilities extracted from the original budget HTML.
 */

/**
 * Parse a CSV string into an array of objects.
 * Handles quoted fields, commas inside quotes, and CRLF line endings.
 */
export function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (!lines.length) return []

  const headers = splitCSVLine(lines[0])

  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const values = splitCSVLine(line)
      const row = {}
      headers.forEach((h, i) => { row[h] = (values[i] ?? '').trim() })
      return row
    })
}

function splitCSVLine(line) {
  const result = []
  let cur = ''
  let inQuote = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      result.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  result.push(cur)
  return result
}

/**
 * Given parsed CSV rows and a column mapping, extract transactions.
 * @param {Array}  rows       — raw parsed rows from parseCSV()
 * @param {Object} colMap     — { dateCol, descCol, amountCol, amountSign }
 *   amountSign: 'negative' = debits are negative numbers (standard)
 *               'positive' = debits are positive numbers (some banks)
 *               'split'    = separate debit/credit columns
 * @param {string} bankAccountId
 * @returns {Array} of transaction objects ready for DB insert
 */
export function extractTransactions(rows, colMap, bankAccountId) {
  const { dateCol, descCol, amountCol, amountSign = 'negative' } = colMap
  const results = []

  for (const row of rows) {
    const rawDate   = row[dateCol]?.trim()
    const rawDesc   = row[descCol]?.trim()
    const rawAmount = row[amountCol]?.trim().replace(/[$,]/g, '')

    if (!rawDate || !rawDesc || !rawAmount) continue

    const date   = parseDate(rawDate)
    const amount = parseFloat(rawAmount)

    if (!date || isNaN(amount)) continue

    // Normalize so that debits are negative
    const normalized = amountSign === 'positive' ? -Math.abs(amount) : amount

    results.push({
      bank_account_id: bankAccountId,
      date:            date.toISOString().split('T')[0],
      description:     rawDesc,
      amount:          normalized,
      ignored:         false,
      applied:         false,
    })
  }

  return results
}

/** Try common date formats */
function parseDate(str) {
  // Already ISO: 2024-01-15
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str + 'T00:00:00')
  // MM/DD/YYYY or MM-DD-YYYY
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (m) return new Date(`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}T00:00:00`)
  // Try native parser as fallback
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

/** Return the column headers from a CSV string */
export function getCSVHeaders(text) {
  const firstLine = text.replace(/\r\n/g, '\n').split('\n')[0]
  return splitCSVLine(firstLine).map(h => h.trim())
}
