/** Format a number as USD currency string */
export function fmt(n, opts = {}) {
  const { sign = false, decimals = 2 } = opts
  const abs = Math.abs(n ?? 0)
  const str = abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  if (sign && n < 0) return `-$${str}`
  if (sign && n > 0) return `+$${str}`
  return `$${str}`
}

/** Parse a currency string to a number */
export function parseCurrency(s) {
  return parseFloat((s ?? '').replace(/[$,]/g, '')) || 0
}
