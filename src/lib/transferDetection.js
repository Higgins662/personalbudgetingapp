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
// SCOPE: this list is only for credit card payments and transfers between
// the user's own accounts — money that moves without being spent. P2P sends
// (Venmo, Zelle, Apple Cash, Cash App) and payment rails (PayPal) are
// deliberately NOT here: a Venmo send is real money leaving the budget, and
// PayPal is how a Hulu or GoDaddy charge arrives, not what it is. Excluding
// either would hide genuine spending.
//
// Match on the ISSUER or the transfer itself, never on the payment mechanism.
// Bare rails ('internet payment', 'ach debit') look tempting but are worthless
// as signals — measured against a real Truist statement, 'internet payment'
// matched 15 rows of which only 4 were in scope (it also catches PayPal, Venmo
// and a Comporium phone bill), and 'ach debit' caught two utility bills paid
// by ACH. The issuer name is what actually distinguishes a card payment.
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
  'minimum payment',
  'min payment',
  // 'phone payment' was removed: matching is plain substring, so it fires on
  // "TELE(PHONE PAYMENT)" and swept a City of Rock Hill utility bill into the
  // exclusion list. Paying a card by phone is rare enough not to be worth a
  // rule that misfiles a real bill.

  // Credit card issuer patterns
  'crcardpmt',             // Truist's prefix for a card payment
  'credit crd',
  'credit card payment',
  'creditcard payment',
  'cardmember serv',
  'chase credit crd',
  'chase card',
  'citi payment',
  'citi autopay',
  'citi card',
  'citibank payment',
  'amex payment',
  'american express payment',
  'discover payment',
  'bank of america card',
  'boa card',
  'capital one payment',
  'crcardpmt capital one', // Truist writes 'CRCARDPMT CAPITAL ONE <ref>'
  'barclays payment',
  'synchrony payment',
  'wells fargo card',
  'us bank card',
  'navy federal',          // common credit union transfers
  'usaa payment',
  'applecard',             // Apple Card (one word in GS Bank descriptions)
  'apple card',
  'gsbank',                // Goldman Sachs, the Apple Card issuer

  // Transfer keywords — between the user's OWN accounts
  'transfer to',
  'transfer from',
  'online transfer',
  'acct transfer',
  'account transfer',
  'internal transfer',
  'mobile transfer',
  'mobile from',           // 'MOBILE FROM ****9623 - TRUIST ONLINE TRANSFER'
  'mobile to',

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
