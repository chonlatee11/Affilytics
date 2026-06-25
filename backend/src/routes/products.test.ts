/**
 * VALIDATION: CAP-02, CAP-03, CAP-04 — POST /api/products/capture
 *
 * Tests the capture endpoint for:
 * - CAP-02: full valid payload persists one row, returns { ok: true, id }
 * - CAP-02 upsert (B1): same productUrl twice → exactly ONE row, updated fields
 *   (proves UNIQUE(product_url) index from migration 0001 is applied to in-memory test DB)
 * - CAP-03: null optional fields (rating/reviewCount/salesCount/shop) succeed, stored as null
 * - CAP-04: minimal payload (platform + name + price + productUrl) creates a basic record
 * - Validation: missing name / price < 0 / bad productUrl → 4xx TypeBox rejection
 *
 * Setup (B1): DATABASE_URL=':memory:' is set in beforeAll BEFORE any import of db/route.
 * openDatabase(':memory:') resolves to a unique temp file and APPLIES tracked migrations
 * at open time — so the in-memory DB carries the UNIQUE(product_url) index from migration 0001.
 *
 * RED state: This test will fail until backend/src/routes/products.ts is implemented (Plan 02-02).
 */

import { test, expect, describe, beforeAll, beforeEach } from 'bun:test'

// CRITICAL (B1): Set DATABASE_URL BEFORE any dynamic import that would load the db singleton.
// The db singleton is created at module load — if we import products.ts before setting this env,
// the singleton uses the default path 'data/affilytics.db' and migrations may not apply.
beforeAll(() => {
  process.env.BUN_ENCRYPTION_KEY = 'a'.repeat(64)
  process.env.DATABASE_URL = ':memory:'
})

// Dynamic import AFTER env vars are set (B1).
// This WILL fail until backend/src/routes/products.ts exists → RED state is correct.
const getRoutes = async () => {
  const { productsRoutes } = await import('../routes/products')
  return productsRoutes
}

const getDb = async () => {
  const { db } = await import('../db/client')
  const { products } = await import('../db/schema')
  return { db, products }
}

const FULL_PAYLOAD = {
  platform: 'shopee' as const,
  name: 'เสื้อยืด ลาย Affilytics',
  price: 290,
  discountPct: 10,
  rating: 4.7,
  reviewCount: 1500,
  salesCount: 3200,
  shop: 'ShopeeTestStore',
  productUrl: 'https://shopee.co.th/product/12345/67890',
}

const MINIMAL_PAYLOAD = {
  platform: 'shopee' as const,
  name: 'สินค้าทดสอบ',
  price: 100,
  productUrl: 'https://shopee.co.th/product/99999/11111',
}

describe('Products routes — capture endpoint', () => {
  // Clear products table before each test for isolation
  beforeEach(async () => {
    const { db, products } = await getDb()
    await db.delete(products)
  })

  // --------------------------------------------------------------------------
  // CAP-02: Full payload creates a product row and returns { ok: true, id }
  // --------------------------------------------------------------------------
  describe('CAP-02: full valid payload persists one row', () => {
    test('CAP-02: POST /api/products/capture with full payload returns { ok: true, id }', async () => {
      const productsRoutes = await getRoutes()
      const response = await productsRoutes.handle(
        new Request('http://localhost/api/products/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(FULL_PAYLOAD),
        })
      )

      expect(response.status).toBe(200)
      const body = await response.json() as { ok: boolean; id: string }
      expect(body.ok).toBe(true)
      expect(typeof body.id).toBe('string')
      expect(body.id.length).toBeGreaterThan(0)
    })

    test('CAP-02: after capture, exactly one row exists in the products table', async () => {
      const productsRoutes = await getRoutes()
      await productsRoutes.handle(
        new Request('http://localhost/api/products/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(FULL_PAYLOAD),
        })
      )

      const { db, products } = await getDb()
      const rows = await db.select().from(products)
      expect(rows.length).toBe(1)
      expect(rows[0].name).toBe(FULL_PAYLOAD.name)
      expect(rows[0].price).toBe(FULL_PAYLOAD.price)
    })
  })

  // --------------------------------------------------------------------------
  // CAP-02 upsert (B1): same productUrl twice → exactly ONE row, updated fields
  // Proves UNIQUE(product_url) from migration 0001 is present in in-memory test DB.
  // --------------------------------------------------------------------------
  describe('CAP-02 upsert (B1): duplicate productUrl updates existing row', () => {
    test('B1: posting same productUrl twice leaves exactly 1 row with updated price/name', async () => {
      const productsRoutes = await getRoutes()

      // First capture
      const first = await productsRoutes.handle(
        new Request('http://localhost/api/products/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(FULL_PAYLOAD),
        })
      )
      expect(first.status).toBe(200)

      // Second capture — same URL, different name and price
      const updatedPayload = {
        ...FULL_PAYLOAD,
        name: 'ชื่อใหม่หลังอัปเดต',
        price: 350,
      }
      const second = await productsRoutes.handle(
        new Request('http://localhost/api/products/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedPayload),
        })
      )
      expect(second.status).toBe(200)

      // Must be exactly ONE row (upsert, not duplicate insert)
      const { db, products } = await getDb()
      const rows = await db.select().from(products)
      expect(rows.length).toBe(1)

      // The row must reflect the SECOND capture's fields
      expect(rows[0].name).toBe('ชื่อใหม่หลังอัปเดต')
      expect(rows[0].price).toBe(350)
      expect(rows[0].productUrl).toBe(FULL_PAYLOAD.productUrl)
    })
  })

  // --------------------------------------------------------------------------
  // CAP-03: null optional fields do not fail capture, stored as null
  // --------------------------------------------------------------------------
  describe('CAP-03: null optional fields succeed and are stored as null', () => {
    test('CAP-03: payload with null rating/reviewCount/salesCount/shop succeeds (200)', async () => {
      const productsRoutes = await getRoutes()
      const nullablePayload = {
        platform: 'shopee' as const,
        name: 'สินค้าไม่มีรีวิว',
        price: 199,
        discountPct: 5,
        rating: null,
        reviewCount: null,
        salesCount: null,
        shop: null,
        productUrl: 'https://shopee.co.th/product/55555/66666',
      }

      const response = await productsRoutes.handle(
        new Request('http://localhost/api/products/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nullablePayload),
        })
      )

      expect(response.status).toBe(200)
    })

    test('CAP-03: null optional fields are stored as null in the DB', async () => {
      const productsRoutes = await getRoutes()
      const nullablePayload = {
        platform: 'shopee' as const,
        name: 'สินค้าไม่มีรีวิว',
        price: 199,
        rating: null,
        reviewCount: null,
        salesCount: null,
        shop: null,
        productUrl: 'https://shopee.co.th/product/55555/66666',
      }

      await productsRoutes.handle(
        new Request('http://localhost/api/products/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nullablePayload),
        })
      )

      const { db, products } = await getDb()
      const rows = await db.select().from(products)
      expect(rows.length).toBe(1)
      expect(rows[0].rating).toBeNull()
      expect(rows[0].reviewCount).toBeNull()
      expect(rows[0].salesCount).toBeNull()
      expect(rows[0].shop).toBeNull()
    })
  })

  // --------------------------------------------------------------------------
  // CAP-04: minimal payload (platform + name + price + productUrl) creates a basic record
  // --------------------------------------------------------------------------
  describe('CAP-04: minimal payload creates a basic record', () => {
    test('CAP-04: platform + name + price + productUrl is sufficient for capture', async () => {
      const productsRoutes = await getRoutes()
      const response = await productsRoutes.handle(
        new Request('http://localhost/api/products/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(MINIMAL_PAYLOAD),
        })
      )

      expect(response.status).toBe(200)
      const body = await response.json() as { ok: boolean; id: string }
      expect(body.ok).toBe(true)
    })

    test('CAP-04: minimal payload creates a row with expected defaults', async () => {
      const productsRoutes = await getRoutes()
      await productsRoutes.handle(
        new Request('http://localhost/api/products/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(MINIMAL_PAYLOAD),
        })
      )

      const { db, products } = await getDb()
      const rows = await db.select().from(products)
      expect(rows.length).toBe(1)
      expect(rows[0].platform).toBe('shopee')
      expect(rows[0].name).toBe(MINIMAL_PAYLOAD.name)
      expect(rows[0].price).toBe(MINIMAL_PAYLOAD.price)
      expect(rows[0].productUrl).toBe(MINIMAL_PAYLOAD.productUrl)
    })
  })

  // --------------------------------------------------------------------------
  // Validation: malformed payloads must return 4xx (TypeBox rejection)
  // --------------------------------------------------------------------------
  describe('Validation: malformed payloads return 4xx', () => {
    test('Validation: payload missing name returns 4xx', async () => {
      const productsRoutes = await getRoutes()
      const response = await productsRoutes.handle(
        new Request('http://localhost/api/products/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: 'shopee',
            price: 100,
            productUrl: 'https://shopee.co.th/product/1/2',
          }),
        })
      )
      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(response.status).toBeLessThan(500)
    })

    test('Validation: price < 0 returns 4xx', async () => {
      const productsRoutes = await getRoutes()
      const response = await productsRoutes.handle(
        new Request('http://localhost/api/products/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: 'shopee',
            name: 'test',
            price: -10,
            productUrl: 'https://shopee.co.th/product/1/2',
          }),
        })
      )
      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(response.status).toBeLessThan(500)
    })

    test('Validation: malformed productUrl (no protocol) returns 4xx', async () => {
      const productsRoutes = await getRoutes()
      const response = await productsRoutes.handle(
        new Request('http://localhost/api/products/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: 'shopee',
            name: 'test',
            price: 100,
            productUrl: 'not-a-url',
          }),
        })
      )
      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(response.status).toBeLessThan(500)
    })
  })
})
