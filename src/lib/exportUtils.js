/**
 * CSV export utilities for the data export feature.
 */

// A cell starting with one of these is evaluated as a formula by Excel,
// Sheets and LibreOffice. Transaction descriptions come from merchants, not
// the user, so a description like "=HYPERLINK(...)" must not run when the
// export is opened.
const FORMULA_START = /^[=+\-@\t\r]/
const PLAIN_NUMBER  = /^-?\d+(\.\d+)?$/

/**
 * Convert an array of objects to a CSV string.
 * Handles values that contain commas, quotes, or newlines, and neutralizes
 * text that a spreadsheet would execute as a formula.
 */
export function toCSV(rows) {
  if (!rows || !rows.length) return ''

  const headers = Object.keys(rows[0])
  const escape  = val => {
    if (val === null || val === undefined) return ''
    let str = String(val)
    // A leading apostrophe makes spreadsheets treat the cell as literal text.
    // Real numbers are exempt so negative amounts (-55.00) stay numeric.
    if (typeof val !== 'number' && FORMULA_START.test(str) && !PLAIN_NUMBER.test(str)) {
      str = `'${str}`
    }
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(h => escape(row[h])).join(',')),
  ]

  return lines.join('\n')
}

/**
 * Trigger a browser download of a text file.
 */
export function downloadFile(content, filename, mimeType = 'text/csv') {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href     = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Trigger a download of a ZIP containing multiple CSV files.
 * Uses JSZip loaded from CDN — only imported when needed.
 *
 * @param {Array} files — [{ name: 'transactions.csv', content: '...' }]
 * @param {string} zipName
 */
export async function downloadZip(files, zipName) {
  // Dynamically load JSZip only when the user actually exports
  const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default
  const zip   = new JSZip()

  for (const file of files) {
    zip.file(file.name, file.content)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  downloadFile(blob, zipName, 'application/zip')
}
