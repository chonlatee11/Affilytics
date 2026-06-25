/**
 * Products routes for the Affilytics backend.
 *
 * CAP-02: POST /api/products/capture persists a captured product into the products table.
 * CAP-03: Null/missing optional fields (rating, reviewCount, salesCount, shop) stored as null.
 * CAP-04: Minimal payload (platform + name + price + productUrl) creates a basic record.
 * D-05: Re-capturing same productUrl updates the existing row (onConflictDoUpdate upsert).
 *
 * Threat mitigations (02-02 threat model):
 * T-02-CAP-1: TypeBox t.Object validates every field — numeric bounds, string length bounds, URI format.
 * T-02-CAP-2: maxLength on all string fields (name/shop ≤500, productUrl ≤2048) prevents oversized input.
 * T-02-CAP-3: Drizzle parameterizes values; sql`excluded.*` are column identifiers, not user input.
 */

import { Elysia, t } from 'elysia'
import { sql } from 'drizzle-orm'
import { db } from '../db/client'
import { products } from '../db/schema'

export const productsRoutes = new Elysia({ prefix: '/api/products' })

  // ---------------------------------------------------------------------------
  // POST /api/products/capture
  // Validates input, upserts a product row keyed on product_url (D-05).
  // Returns { ok: true, id } on success.
  // ---------------------------------------------------------------------------
  .post(
    '/capture',
    async ({ body }) => {
      const row = {
        platform:    body.platform,
        name:        body.name,
        price:       body.price,
        discountPct: body.discountPct ?? 0,
        rating:      body.rating ?? null,
        reviewCount: body.reviewCount ?? null,
        salesCount:  body.salesCount ?? null,
        shop:        body.shop ?? null,
        productUrl:  body.productUrl,
        capturedAt:  new Date(),
      }

      // Upsert on product_url (D-05): if the same URL is captured again, update all fields
      // to the latest values rather than inserting a duplicate row.
      // sql`excluded.*` references the incoming row's column value — column identifiers, not
      // user input, so injection is structurally prevented (T-02-CAP-3).
      const result = await db
        .insert(products)
        .values(row)
        .onConflictDoUpdate({
          target: products.productUrl,
          set: {
            name:        sql`excluded.name`,
            price:       sql`excluded.price`,
            discountPct: sql`excluded.discount_pct`,
            rating:      sql`excluded.rating`,
            reviewCount: sql`excluded.review_count`,
            salesCount:  sql`excluded.sales_count`,
            shop:        sql`excluded.shop`,
            capturedAt:  sql`excluded.captured_at`,
          },
        })
        .returning({ id: products.id })

      return { ok: true, id: result[0].id }
    },
    {
      // TypeBox body validation (T-02-CAP-1, T-02-CAP-2):
      // Elysia's built-in t (TypeBox) — never Zod (CLAUDE.md convention).
      body: t.Object({
        platform:    t.Union([
          t.Literal('shopee'),
          t.Literal('lazada'),
          t.Literal('tiktok'),
        ]),
        name:        t.String({ minLength: 1, maxLength: 500 }),
        price:       t.Number({ minimum: 0 }),
        discountPct: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
        rating:      t.Optional(t.Nullable(t.Number({ minimum: 0, maximum: 5 }))),
        reviewCount: t.Optional(t.Nullable(t.Integer({ minimum: 0 }))),
        salesCount:  t.Optional(t.Nullable(t.Integer({ minimum: 0 }))),
        shop:        t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
        productUrl:  t.String({ minLength: 10, maxLength: 2048, format: 'uri' }),
      }),
    }
  )
