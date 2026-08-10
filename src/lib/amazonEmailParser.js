// Parses Amazon order-confirmation / shipment HTML emails into structured
// line items. Runs against the raw HTML body pulled from the Gmail API
// (see gmailFetch.js). No DOM/browser dependency — safe for a Deno/Node
// edge function.
//
// Output shape is intentionally close to `transactions`/`expense_items`
// so a caller can create one parent transaction (the bank-statement line)
// plus N child line items without reshaping.

import { parse } from 'node-html-parser';

/**
 * @typedef {Object} AmazonLineItem
 * @property {string} name
 * @property {number} quantity
 * @property {number} unitPrice
 * @property {number} lineTotal
 * @property {string|null} asin
 *
 * @typedef {Object} AmazonOrderEmail
 * @property {string} template        - which parser matched, for debugging/telemetry
 * @property {string|null} orderId    - e.g. "112-1234567-1234567"
 * @property {string|null} orderDate
 * @property {number|null} orderTotal
 * @property {AmazonLineItem[]} items
 * @property {number} confidence      - 0..1, heuristic
 * @property {string[]} warnings
 */

const TEMPLATES = [
  { name: 'order-confirmation', match: parseOrderConfirmation },
  { name: 'shipped', match: parseShipmentEmail },
  { name: 'digital-order', match: parseDigitalOrder },
];

/**
 * @param {string} html
 * @returns {AmazonOrderEmail}
 */
export function parseAmazonEmail(html) {
  const root = parse(html, { lowerCaseTagName: true });
  const warnings = [];

  for (const template of TEMPLATES) {
    const result = template.match(root, warnings);
    if (result && result.items.length > 0) {
      return {
        template: template.name,
        ...result,
        confidence: scoreConfidence(result),
        warnings,
      };
    }
  }

  return {
    template: 'unrecognized',
    orderId: extractOrderId(root),
    orderDate: null,
    orderTotal: null,
    items: [],
    confidence: 0,
    warnings: [...warnings, 'no template matched — needs manual review'],
  };
}

// ── Template: standard order confirmation ──────────────────────────────
// Layout (2023–2026 era): a table of rows, each with a product name link,
// a qty, and a price cell. Amazon changes class names periodically, so we
// match on structural + text patterns rather than exact class names.

function parseOrderConfirmation(root, warnings) {
  const items = [];

  // Product rows are typically the only <a> tags whose href contains
  // "/dp/" or "/gp/product/" (the canonical Amazon product-page pattern).
  // This is far more stable across template changes than class names.
  const productLinks = root.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]');

  const seen = new Set();
  for (const link of productLinks) {
    const name = clean(link.text);
    if (!name || name.length < 3) continue;
    if (seen.has(name)) continue; // Amazon sometimes duplicates the link (image + text)
    seen.add(name);

    const asin = extractAsin(link.getAttribute('href') || '');

    // Walk up to the containing row/table-cell and look for a price and
    // quantity nearby (siblings or same ancestor block).
    const container = closestRowContainer(link);
    const priceText = container ? findPriceNear(container) : null;
    const qty = container ? findQuantityNear(container) : 1;

    const unitPrice = priceText != null ? parsePrice(priceText) : null;
    if (unitPrice == null) {
      warnings.push(`no price found for item "${name}"`);
    }

    items.push({
      name,
      quantity: qty ?? 1,
      unitPrice: unitPrice ?? 0,
      lineTotal: unitPrice != null ? round2(unitPrice * (qty ?? 1)) : 0,
      asin,
    });
  }

  if (items.length === 0) return null;

  return {
    orderId: extractOrderId(root),
    orderDate: extractOrderDate(root),
    orderTotal: extractOrderTotal(root, warnings),
    items,
  };
}

// ── Template: shipment notification ─────────────────────────────────────
// Similar structure, usually fewer items per email since large orders
// split into multiple shipments. Reuse the same product-link strategy.

function parseShipmentEmail(root, warnings) {
  const hasShippedMarker = /has shipped|on the way|out for delivery/i.test(root.text);
  if (!hasShippedMarker) return null;
  return parseOrderConfirmation(root, warnings);
}

// ── Template: digital order (Kindle, digital games, etc.) ───────────────
// No shipment, usually a single item, different total-only layout.

function parseDigitalOrder(root, warnings) {
  const isDigital = /digital order|your digital order/i.test(root.text);
  if (!isDigital) return null;

  const productLinks = root.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]');
  if (productLinks.length === 0) return null;

  const items = [];
  for (const link of productLinks) {
    const name = clean(link.text);
    if (!name) continue;
    const total = extractOrderTotal(root, warnings);
    items.push({
      name,
      quantity: 1,
      unitPrice: total ?? 0,
      lineTotal: total ?? 0,
      asin: extractAsin(link.getAttribute('href') || ''),
    });
  }

  if (items.length === 0) return null;

  return {
    orderId: extractOrderId(root),
    orderDate: extractOrderDate(root),
    orderTotal: extractOrderTotal(root, warnings),
    items,
  };
}

// ── Shared extraction helpers ────────────────────────────────────────────

function extractOrderId(root) {
  const match = root.text.match(/Order\s*#\s*:?\s*(\d{3}-\d{7}-\d{7})/i);
  return match ? match[1] : null;
}

function extractOrderDate(root) {
  // "Order Placed: January 5, 2026" or "Order placed January 5, 2026"
  const match = root.text.match(
    /Order Placed:?\s*([A-Z][a-z]+ \d{1,2},? \d{4})/
  );
  if (!match) return null;
  const parsed = new Date(match[1]);
  return isNaN(parsed) ? null : parsed.toISOString().slice(0, 10);
}

function extractOrderTotal(root, warnings) {
  // Look for a labeled total: "Order Total: $42.19", "Grand Total", etc.
  const match = root.text.match(
    /(?:Order|Grand)\s*Total:?\s*\$?([\d,]+\.\d{2})/i
  );
  if (!match) {
    warnings.push('order total not found');
    return null;
  }
  return parsePrice(match[1]);
}

function extractAsin(href) {
  const match = href.match(/\/dp\/([A-Z0-9]{10})|\/gp\/product\/([A-Z0-9]{10})/);
  if (!match) return null;
  return match[1] || match[2] || null;
}

/**
 * Find a stable-ish ancestor to search for price/qty — walk up a fixed
 * number of levels rather than assuming a specific tag, since Amazon
 * nests these emails in tables with varying depth.
 */
function closestRowContainer(el, maxLevels = 4) {
  let node = el;
  for (let i = 0; i < maxLevels && node.parentNode; i++) {
    node = node.parentNode;
    // A row-like container usually has more text than just the link
    // (price, qty) but isn't the whole email body.
    if (node.text && node.text.length > el.text.length + 3) {
      return node;
    }
  }
  return node;
}

function findPriceNear(container) {
  const match = container.text.match(/\$([\d,]+\.\d{2})/);
  return match ? match[1] : null;
}

function findQuantityNear(container) {
  const match = container.text.match(/Qty:?\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : 1;
}

function parsePrice(text) {
  const num = parseFloat(String(text).replace(/,/g, ''));
  return isNaN(num) ? null : num;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function clean(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

// ── Confidence heuristic ─────────────────────────────────────────────────
// Used to decide whether to auto-apply line items to a transaction or
// route the order to a manual-review queue in the UI.

function scoreConfidence(result) {
  let score = 0.4; // base: at least one item found
  if (result.orderId) score += 0.2;
  if (result.orderDate) score += 0.1;
  if (result.orderTotal != null) score += 0.1;

  const itemsHavePrices = result.items.every((i) => i.unitPrice > 0);
  if (itemsHavePrices) score += 0.1;

  if (result.orderTotal != null) {
    const sum = round2(result.items.reduce((s, i) => s + i.lineTotal, 0));
    if (Math.abs(sum - result.orderTotal) < 0.05) score += 0.1;
  }

  return Math.min(1, round2(score));
}
