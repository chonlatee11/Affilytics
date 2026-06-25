---
phase: 02-product-capture-shopee
plan: 02
subsystem: api
tags: [elysia, drizzle, sqlite, typebox, upsert, capture-endpoint]

requires:
  - phase: 02-01
    provides: RED tests for products.test.ts (CAP-02/03/04), UNIQUE(product_url) migration 0001

provides:
  - POST /api/products/capture endpoint with TypeBox validation and upsert on product_url
  - productsRoutes Elysia plugin mounted in backend/index.ts
  - onConflictDoUpdate upsert pattern keyed on products.productUrl (D-05)

affects:
  - 02-03 (extension will POST to this endpoint)
  - 02-04 (integration test will exercise this endpoint end-to-end)
  - phase-03 (frontend will GET products created by this endpoint)

tech-stack:
  added: []
  patterns:
    - "Elysia prefix plugin with TypeBox body: new Elysia({ prefix }) .post('/path', handler, { body: t.Object({...}) })"
    - "Drizzle upsert: .insert(table).values(row).onConflictDoUpdate({ target, set: { col: sql`excluded.col` } }).returning()"
    - "t.Optional(t.Nullable(...)) for nullable optional fields in TypeBox"

key-files:
  created:
    - backend/src/routes/products.ts
  modified:
    - backend/index.ts

key-decisions:
  - "sql`excluded.*` column references in onConflictDoUpdate set — not user input, structurally injection-safe (T-02-CAP-3)"
  - "discountPct defaults to 0 in handler (not TypeBox default) to keep the body schema clean for the optional case"
  - "t.Optional(t.Nullable(...)) pattern for rating/reviewCount/salesCount/shop — allows both omission and explicit null from CAP-03 payloads"

patterns-established:
  - "products upsert: all mutable fields updated on conflict (name, price, discountPct, rating, reviewCount, salesCount, shop, capturedAt)"
  - "dynamic import of productsRoutes at top-level of index.ts after requireEncryptionKey() — key-first boot order preserved"

requirements-completed: [CAP-02, CAP-03, CAP-04]

duration: ~20min
completed: 2026-06-25
---

# Phase 02 Plan 02: Capture Endpoint + Upsert Summary

**POST /api/products/capture with TypeBox-validated onConflictDoUpdate upsert keyed on product_url, making 10/10 RED tests GREEN (CAP-02 persist+upsert, CAP-03 null fields, CAP-04 minimal payload)**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-25T14:00:00Z
- **Completed:** 2026-06-25T14:20:00Z
- **Tasks:** 2 (Task 1 confirmed pre-done; Task 2 implemented)
- **Files modified:** 2

## Accomplishments

- Confirmed Task 1 (UNIQUE migration + schema) was correctly completed in plan 02-01 — migration `0001_wild_the_watchers.sql` existed with `CREATE UNIQUE INDEX products_product_url_unique`; `bun run migrate:run` applied cleanly (idempotent)
- Created `backend/src/routes/products.ts`: Elysia plugin on `/api/products` with POST `/capture` handler, TypeBox body validation (T-02-CAP-1/2), and Drizzle `onConflictDoUpdate` upsert on `products.productUrl` (D-05)
- Mounted `productsRoutes` in `backend/index.ts` via dynamic `await import()` at top level (key-first boot order preserved)
- All 10 product tests GREEN; full suite 75/75 pass (no regression)

## Task Commits

1. **Task 1: UNIQUE(product_url) migration** - already committed in `e7592b9` (02-01) — confirmed correct, NOT regenerated
2. **Task 2: Implement POST /api/products/capture and mount** - `7ee5b97` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `backend/src/routes/products.ts` — Elysia productsRoutes plugin: POST /capture with TypeBox validation and onConflictDoUpdate upsert
- `backend/index.ts` — added dynamic import of productsRoutes at top level + .use(productsRoutes) after fbOauthRoutes

## Decisions Made

- `sql\`excluded.*\`` references in upsert `set` are SQLite column identifiers (not user input) — structurally injection-safe per T-02-CAP-3; no extra sanitization needed
- `discountPct ?? 0` defaulting in the handler body (not as a TypeBox `t.Default`) to keep the schema clean and avoid TypeBox default-injection surprises
- `t.Optional(t.Nullable(t.Number({...})))` chosen over `t.Union([t.Number, t.Null])` to allow both field omission and explicit `null` from CAP-03 payloads

## Deviations from Plan

None — plan executed exactly as written. Task 1 was confirmed pre-done as noted in the execution brief; no migration was regenerated (correct behavior per the IMPORTANT_already_done directive).

## Issues Encountered

None — tests passed on the first run after implementation.

## User Setup Required

None — no external service configuration required for this plan.

## Next Phase Readiness

- `POST /api/products/capture` is live and tested; ready for the browser extension (plan 02-03) to call it
- The upsert (D-05) is proven by the B1 in-memory test: same product_url twice → 1 row with updated fields
- Full backend suite (75 tests) is clean; no blockers for 02-03

---
*Phase: 02-product-capture-shopee*
*Completed: 2026-06-25*
