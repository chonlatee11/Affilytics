/**
 * D-09 — Normalizer pure functions for DOM text → typed numbers
 *
 * All functions are pure: no DOM access, no side effects.
 * Used by content script after parsing, before review form display.
 */

/**
 * Parse a price string into a number.
 * Handles:
 *   - Currency symbol: ฿
 *   - Commas as thousands separators
 *   - Price ranges ("฿290 - ฿500") → returns the lowest value
 *   - Empty/missing string → null
 */
export function parsePrice(raw: string): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/฿|,|\s/g, '')
  const parts = cleaned.split('-').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
  if (parts.length === 0) return null
  return Math.min(...parts)
}

/**
 * Parse a count/quantity string into an integer.
 * Handles:
 *   - Thai abbreviations: ล้าน (1,000,000), แสน (100,000), หมื่น (10,000), พัน (1,000)
 *   - English abbreviations: k (1,000), m (1,000,000)
 *   - Commas as thousands separators
 *   - Empty/missing string → null
 */
export function parseCount(raw: string): number | null {
  if (!raw) return null
  const s = raw.trim()
  const thaiMap: [string, number][] = [
    ['ล้าน', 1_000_000],
    ['แสน', 100_000],
    ['หมื่น', 10_000],
    ['พัน', 1_000],
  ]
  for (const [suffix, mult] of thaiMap) {
    if (s.includes(suffix)) {
      return Math.round(parseFloat(s.replace(suffix, '').replace(/,/g, '')) * mult)
    }
  }
  if (/k$/i.test(s)) return Math.round(parseFloat(s) * 1_000)
  if (/m$/i.test(s)) return Math.round(parseFloat(s) * 1_000_000)
  const n = parseFloat(s.replace(/,/g, ''))
  return isNaN(n) ? null : Math.round(n)
}

/**
 * Parse a discount percentage string into a number.
 * Handles:
 *   - Percentage symbol: %
 *   - Negative prefix: "-10%" → 10 (absolute value)
 *   - Empty/missing string → 0 (no discount)
 */
export function parseDiscount(raw: string): number {
  if (!raw) return 0
  const n = parseFloat(raw.replace(/%|-/g, ''))
  return isNaN(n) ? 0 : Math.abs(n)
}
