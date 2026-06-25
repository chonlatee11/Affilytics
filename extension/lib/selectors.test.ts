/**
 * VALIDATION: CAP-05 — selectors.config.json structure validation
 *
 * Tests:
 * - selectors.config.json is valid JSON (JSON.parse succeeds)
 * - shopee object has exactly 8 keys: name, price, priceRange, discountBadge,
 *   rating, reviewCount, salesCount, shop
 *
 * NOTE: This test reads the file at runtime from the current filesystem.
 * It will PASS once the file exists with the correct shape — which it does as of Task 1
 * (assumed selectors, pending live verification in Task 3).
 * The test is written in this plan to guard against future shape regressions.
 */

import { test, expect, describe } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CONFIG_PATH = join(import.meta.dir, '..', 'public', 'selectors.config.json')
const REQUIRED_SHOPEE_KEYS = [
  'name',
  'price',
  'priceRange',
  'discountBadge',
  'rating',
  'reviewCount',
  'salesCount',
  'shop',
] as const

describe('selectors.config.json — CAP-05', () => {
  test('selectors.config.json is valid JSON (JSON.parse succeeds)', () => {
    const raw = readFileSync(CONFIG_PATH, 'utf-8')
    expect(() => JSON.parse(raw)).not.toThrow()
  })

  test('selectors.config.json has a "shopee" key', () => {
    const raw = readFileSync(CONFIG_PATH, 'utf-8')
    const config = JSON.parse(raw)
    expect(config).toHaveProperty('shopee')
    expect(typeof config.shopee).toBe('object')
  })

  test('shopee object has exactly 8 required keys', () => {
    const raw = readFileSync(CONFIG_PATH, 'utf-8')
    const config = JSON.parse(raw)
    const shopeeKeys = Object.keys(config.shopee)

    for (const required of REQUIRED_SHOPEE_KEYS) {
      expect(shopeeKeys).toContain(required)
    }

    expect(shopeeKeys.length).toBe(REQUIRED_SHOPEE_KEYS.length)
  })

  test('all shopee selector values are non-empty strings', () => {
    const raw = readFileSync(CONFIG_PATH, 'utf-8')
    const config = JSON.parse(raw)

    for (const key of REQUIRED_SHOPEE_KEYS) {
      const value = config.shopee[key]
      expect(typeof value).toBe('string')
      expect((value as string).length).toBeGreaterThan(0)
    }
  })
})
