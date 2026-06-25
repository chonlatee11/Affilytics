/**
 * VALIDATION: CAP-01 — Shopee DOM parser
 *
 * Tests parseShopee() with fixture HTML Documents built via happy-dom's DOMParser.
 * W1: Bun's test runner has no global DOMParser/Document — bunfig.toml preloads
 *     test-setup.ts which calls GlobalRegistrator.register() from happy-dom.
 *
 * Tests:
 * - Full fixture (all 8 selectors present) → RawProduct with fieldsRead === 8
 * - Partial fixture (only name + price) → fieldsRead === 2, missing fields are null
 *
 * RED state: This test will fail until extension/parsers/shopee.ts is implemented (Plan 02-02).
 */

import { test, expect, describe } from 'bun:test'
import { parseShopee } from '../parsers/shopee'

// Selector config that matches the fixture HTML below.
// These selectors are FIXTURE-specific (not production selectors from selectors.config.json).
// Production selectors will be verified in Task 3 (human checkpoint).
const FIXTURE_SELECTORS = {
  name: '.fixture-name',
  price: '.fixture-price',
  priceRange: '.fixture-price-range',
  discountBadge: '.fixture-discount',
  rating: '.fixture-rating',
  reviewCount: '.fixture-review-count',
  salesCount: '.fixture-sales-count',
  shop: '.fixture-shop',
}

// Full fixture HTML — all 8 fields present
const FULL_FIXTURE_HTML = `<!DOCTYPE html><html><body>
  <h1 class="fixture-name">เสื้อยืดทดสอบ</h1>
  <span class="fixture-price">฿290</span>
  <span class="fixture-price-range">฿290 - ฿500</span>
  <span class="fixture-discount">10%</span>
  <span class="fixture-rating">4.8</span>
  <span class="fixture-review-count">1,234</span>
  <span class="fixture-sales-count">5,678</span>
  <span class="fixture-shop">ร้านทดสอบ</span>
</body></html>`

// Partial fixture HTML — only name + price
const PARTIAL_FIXTURE_HTML = `<!DOCTYPE html><html><body>
  <h1 class="fixture-name">สินค้าน้อยฟิลด์</h1>
  <span class="fixture-price">฿150</span>
</body></html>`

describe('parsers — parseShopee (CAP-01)', () => {
  test('full fixture: parseShopee returns RawProduct with fieldsRead === 8', () => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(FULL_FIXTURE_HTML, 'text/html')

    const result = parseShopee(doc, FIXTURE_SELECTORS)

    expect(result.fieldsTotal).toBe(8)
    expect(result.fieldsRead).toBe(8)
    expect(result.platform).toBe('shopee')
    expect(result.name).toBe('เสื้อยืดทดสอบ')
  })

  test('full fixture: parseShopee returns correct price (lowest of range)', () => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(FULL_FIXTURE_HTML, 'text/html')

    const result = parseShopee(doc, FIXTURE_SELECTORS)

    expect(result.price).toBe(290)
  })

  test('full fixture: parseShopee returns correct rating, shop, reviewCount, salesCount', () => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(FULL_FIXTURE_HTML, 'text/html')

    const result = parseShopee(doc, FIXTURE_SELECTORS)

    expect(result.rating).toBe(4.8)
    expect(result.shop).toBe('ร้านทดสอบ')
    expect(result.reviewCount).toBe(1234)
    expect(result.salesCount).toBe(5678)
  })

  test('partial fixture (name+price only): fieldsRead === 2, missing fields are null', () => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(PARTIAL_FIXTURE_HTML, 'text/html')

    const result = parseShopee(doc, FIXTURE_SELECTORS)

    expect(result.fieldsTotal).toBe(8)
    expect(result.fieldsRead).toBe(2)
    expect(result.name).toBe('สินค้าน้อยฟิลด์')
    expect(result.price).toBe(150)
    expect(result.rating).toBeNull()
    expect(result.reviewCount).toBeNull()
    expect(result.salesCount).toBeNull()
    expect(result.shop).toBeNull()
    expect(result.discountPct).toBe(0)  // missing discount → 0 default
  })

  test('CAP-03: parseShopee never throws on missing elements — returns null for missing fields', () => {
    const parser = new DOMParser()
    // Empty page — no product elements
    const doc = parser.parseFromString('<html><body></body></html>', 'text/html')

    expect(() => parseShopee(doc, FIXTURE_SELECTORS)).not.toThrow()
    const result = parseShopee(doc, FIXTURE_SELECTORS)
    expect(result.fieldsRead).toBe(0)
    expect(result.name).toBeNull()
    expect(result.price).toBeNull()
  })
})
