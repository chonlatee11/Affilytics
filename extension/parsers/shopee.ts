/**
 * Shopee DOM parser — CAP-01, CAP-03, D-06, D-09
 *
 * Exports:
 *   waitForElement(selector, timeout?) → Promise<Element|null>
 *   parseShopee(doc, selectors) → RawProduct  (synchronous; caller awaits waitForElement externally if needed)
 *
 * Security (T-02-PARSE-1): All DOM values read via .textContent only — never innerHTML.
 * The content script runs in an ISOLATED world (T-02-PARSE-2), so page cannot modify extension globals.
 */

import { parsePrice, parseCount, parseDiscount } from '../lib/normalizer'
import type { RawProduct } from '../lib/messaging'

/** Selector shape from selectors.config.json → shopee key */
export interface ShopeeSelectors {
  name: string
  price: string
  priceRange: string
  discountBadge: string
  rating: string
  reviewCount: string
  salesCount: string
  shop: string
}

/**
 * Wait for a CSS selector to appear in the document (handles Shopee SPA async render).
 * Returns the element if already present, or waits up to `timeout` ms via MutationObserver.
 * Resolves null on timeout — caller treats the field as missing (CAP-03).
 *
 * NOTE: Uses global `document` / `document.body` — this function is only called inside
 * the content script's main() where the DOM is available.
 */
export function waitForElement(
  selector: string,
  timeout = 10_000,
): Promise<Element | null> {
  // Check immediately — element may already be in the DOM
  const existing = document.querySelector(selector)
  if (existing) return Promise.resolve(existing)

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector)
      if (el) {
        observer.disconnect()
        clearTimeout(timer)
        resolve(el)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    const timer = setTimeout(() => {
      observer.disconnect()
      resolve(null) // timeout — field will be null (CAP-03)
    }, timeout)
  })
}

/**
 * Parse a Shopee product page Document into a normalized RawProduct.
 *
 * Accepts a Document so the function is testable against fixture Documents in bun test.
 * In production the content script passes the real `document`.
 *
 * @param doc       The Document to read (real or fixture)
 * @param selectors The shopee selectors from selectors.config.json (runtime-loaded, CAP-05/D-06)
 * @returns         RawProduct — missing fields are null; never throws (CAP-03)
 */
export function parseShopee(doc: Document, selectors: ShopeeSelectors): RawProduct {
  const FIELDS_TOTAL = 8

  // Helper: read .textContent from first matching element, trimmed; null if not found
  function readText(selector: string): string | null {
    if (!selector) return null
    const el = doc.querySelector(selector)
    if (!el) return null
    const text = el.textContent?.trim() ?? ''
    return text.length > 0 ? text : null
  }

  let fieldsRead = 0

  // --- name ---
  const rawName = readText(selectors.name)
  const name = rawName !== null ? rawName : null
  if (name !== null) fieldsRead++

  // --- price (field 2 of 8) ---
  const rawPrice = readText(selectors.price)
  const price = rawPrice !== null ? parsePrice(rawPrice) : null
  if (price !== null) fieldsRead++

  // --- priceRange (field 3 of 8) ---
  // Separate field; when present and contains a range, parsePrice takes the lowest value.
  // In production the selectors.config.json may alias priceRange to the same selector as price;
  // in the test fixture they are distinct CSS classes.
  const rawPriceRange = readText(selectors.priceRange)
  if (rawPriceRange !== null) fieldsRead++

  // --- discountBadge ---
  const rawDiscount = readText(selectors.discountBadge)
  const discountPct = rawDiscount !== null ? parseDiscount(rawDiscount) : 0
  if (rawDiscount !== null) fieldsRead++

  // --- rating ---
  const rawRating = readText(selectors.rating)
  let rating: number | null = null
  if (rawRating !== null) {
    const r = parseFloat(rawRating)
    rating = !isNaN(r) ? Math.max(0, Math.min(5, r)) : null
    if (rating !== null) fieldsRead++
  }

  // --- reviewCount ---
  const rawReviewCount = readText(selectors.reviewCount)
  const reviewCount = rawReviewCount !== null ? parseCount(rawReviewCount) : null
  if (reviewCount !== null) fieldsRead++

  // --- salesCount ---
  const rawSalesCount = readText(selectors.salesCount)
  const salesCount = rawSalesCount !== null ? parseCount(rawSalesCount) : null
  if (salesCount !== null) fieldsRead++

  // --- shop ---
  const rawShop = readText(selectors.shop)
  const shop = rawShop !== null ? rawShop : null
  if (shop !== null) fieldsRead++

  // --- productUrl ---
  // Use the document's URL if available (real browser); empty string for test fixtures
  // (fixture Documents created by DOMParser have no location)
  const productUrl =
    (doc as Document & { location?: { href?: string } }).location?.href ?? ''

  return {
    name,
    price,
    discountPct,
    rating,
    reviewCount,
    salesCount,
    shop,
    productUrl,
    platform: 'shopee',
    fieldsRead,
    fieldsTotal: FIELDS_TOTAL,
  }
}
