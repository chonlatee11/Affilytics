/**
 * VALIDATION: D-09 — Normalizer pure functions for DOM text → typed numbers
 *
 * Tests:
 * - parsePrice: ฿290 - ฿500 → 290 (take lowest of range)
 * - parsePrice: ฿1,290 → 1290 (strip commas)
 * - parsePrice: '' → null
 * - parseCount: 12.3k → 12300
 * - parseCount: 1.2พัน → 1200 (Thai abbreviation)
 * - parseCount: 1.5ล้าน → 1500000
 * - parseDiscount: '10%' → 10
 * - parseDiscount: '-10%' → 10 (absolute value)
 * - parseDiscount: '' → 0
 *
 * RED state: This test will fail until extension/lib/normalizer.ts is implemented (Plan 02-02).
 */

import { test, expect, describe } from 'bun:test'
import { parsePrice, parseCount, parseDiscount } from './normalizer'

describe('normalizer — parsePrice (D-09)', () => {
  test('parsePrice("฿290 - ฿500") → 290 (lowest price in range)', () => {
    expect(parsePrice('฿290 - ฿500')).toBe(290)
  })

  test('parsePrice("฿1,290") → 1290 (strip comma)', () => {
    expect(parsePrice('฿1,290')).toBe(1290)
  })

  test('parsePrice("฿290") → 290 (simple price)', () => {
    expect(parsePrice('฿290')).toBe(290)
  })

  test('parsePrice("290.00") → 290 (no currency symbol)', () => {
    expect(parsePrice('290.00')).toBe(290)
  })

  test('parsePrice("") → null (empty string)', () => {
    expect(parsePrice('')).toBeNull()
  })

  test('parsePrice("฿500 - ฿290") → 290 (lowest even if second)', () => {
    expect(parsePrice('฿500 - ฿290')).toBe(290)
  })
})

describe('normalizer — parseCount (D-09)', () => {
  test('parseCount("12.3k") → 12300 (English k abbreviation)', () => {
    expect(parseCount('12.3k')).toBe(12300)
  })

  test('parseCount("1.2พัน") → 1200 (Thai พัน = 1000)', () => {
    expect(parseCount('1.2พัน')).toBe(1200)
  })

  test('parseCount("1.5ล้าน") → 1500000 (Thai ล้าน = 1,000,000)', () => {
    expect(parseCount('1.5ล้าน')).toBe(1500000)
  })

  test('parseCount("1,500") → 1500 (plain number with comma)', () => {
    expect(parseCount('1,500')).toBe(1500)
  })

  test('parseCount("100") → 100 (plain integer)', () => {
    expect(parseCount('100')).toBe(100)
  })

  test('parseCount("2แสน") → 200000 (Thai แสน = 100,000)', () => {
    expect(parseCount('2แสน')).toBe(200000)
  })

  test('parseCount("3หมื่น") → 30000 (Thai หมื่น = 10,000)', () => {
    expect(parseCount('3หมื่น')).toBe(30000)
  })

  test('parseCount("") → null (empty string)', () => {
    expect(parseCount('')).toBeNull()
  })
})

describe('normalizer — parseDiscount (D-09)', () => {
  test('parseDiscount("10%") → 10', () => {
    expect(parseDiscount('10%')).toBe(10)
  })

  test('parseDiscount("-10%") → 10 (absolute value)', () => {
    expect(parseDiscount('-10%')).toBe(10)
  })

  test('parseDiscount("") → 0 (empty string → no discount)', () => {
    expect(parseDiscount('')).toBe(0)
  })

  test('parseDiscount("15%") → 15', () => {
    expect(parseDiscount('15%')).toBe(15)
  })

  test('parseDiscount("0%") → 0', () => {
    expect(parseDiscount('0%')).toBe(0)
  })
})
