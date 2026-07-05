/**
 * Transfer and payment detection.
 *
 * Identifies transactions that are almost certainly credit card payments,
 * loan payments, or inter-account transfers rather than real expenses.
 *
 * These should be excluded from budget calculations and surfaced for
 * user confirmation rather than silently discarded.
 */

/**
 * Patterns that strongly indicate a transfer or payment transaction.
 * Each entry is a substring to search for in the normalized description.
 * All matching is case-insensitive.
 */
const TRANSFER_PATTERNS = [
  // Generic payment keywords
  'payment thank you',
  'autopay',
  'auto pay',
  'auto-pay',
  'online payment',
  'online pmt',
  'online pmnt',
  'bill payment',
  'bill pay',
  'epayment',
  'e-payment',
  'web payment',
  'phone payment',
  'minimum payment',
  'min payment',

  // Credit card issuer patterns
  'chase credit crd',
  'chase card',
  'citi payment',
  'citi card',
  'citibank payment',
  'amex payment',
  'american express payment',
  'discover payment',
  'bank of america card',
  'boa card',
  'capital one payment',
  'barclays payment',
  'synchrony payment',
  'wells fargo card',
  'us bank card',
  'navy federal',          // common credit union transfers
  'usaa payment',

  // Transfer keywords
  'transfer to',
  'transfer from',
  'online transfer',
  'acct transfer',
  'account transfer',
  'internal transfer',
  'zelle to',
  'zelle from',
  'mobile transfer',

  // Loan / mortgage payments
  'loan payment',
  'mortgage payment',
  'student loan',
  'auto loan',
  'car loan',

  // Generic inter-account
  'savings transfer',
  'checking transfer',
  'deposit transfer',
]

/**
 * Returns true if the description looks like a transfer or payment.
 * @param {string} description
 */
export function isTransferOrPayment(description) {
  if (!description) return false
  const lower = description.toLowerCase()
  return TRANSFER_PATTERNS.some(p => lower.includes(p))
}

/**
 * Tag an array of transaction objects with `likelyTransfer: true`
 * where the description matches known transfer/payment patterns.
 *
 * @param {Array} transactions
 * @returns {Array} same transactions with likelyTransfer property added
 */
export function tagTransfers(transactions) {
  return transactions.map(tx => ({
    ...tx,
    likelyTransfer: isTransferOrPayment(tx.description),
  }))
}

/**
 * Split an array of transactions into two groups:
 *   { transfers: [...], normal: [...] }
 */
export function splitTransfers(transactions) {
  const transfers = []
  const normal    = []
  for (const tx of transactions) {
    if (tx.likelyTransfer || isTransferOrPayment(tx.description)) {
      transfers.push(tx)
    } else {
      normal.push(tx)
    }
  }
  return { transfers, normal }
}
