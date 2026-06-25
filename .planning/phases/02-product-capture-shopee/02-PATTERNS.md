# Phase 2: Product Capture (Shopee) — Pattern Map

**Mapped:** 2026-06-25
**Files analyzed:** 16 new/modified files
**Analogs found:** 6 / 16 (10 are greenfield extension files with no codebase analog)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/routes/products.ts` | route | request-response (POST) | `backend/src/routes/settings.ts` | exact |
| `backend/src/db/schema.ts` *(modify)* | model | — | self (existing) | modify |
| `backend/drizzle/0001_add_product_url_unique.sql` | migration | — | `backend/drizzle/0000_lyrical_the_initiative.sql` | role-match |
| `backend/index.ts` *(modify)* | config | — | self (existing) | modify |
| `backend/src/routes/products.test.ts` | test | request-response | `backend/src/routes/settings.test.ts` | exact |
| `backend/src/db/migrate.ts` *(no change needed)* | utility | — | self | no-op |
| `extension/wxt.config.ts` | config | — | none (greenfield) | new |
| `extension/package.json` | config | — | `backend/package.json` | partial |
| `extension/lib/messaging.ts` | utility | event-driven | none (greenfield) | new |
| `extension/lib/normalizer.ts` | utility | transform | none (greenfield) | new |
| `extension/lib/normalizer.test.ts` | test | transform | `backend/src/routes/health.test.ts` | partial |
| `extension/entrypoints/background.ts` | middleware | event-driven | none (greenfield) | new |
| `extension/entrypoints/content.ts` | middleware | event-driven | none (greenfield) | new |
| `extension/entrypoints/popup/index.html` | component | request-response | none (greenfield) | new |
| `extension/entrypoints/popup/main.ts` | component | request-response | none (greenfield) | new |
| `extension/parsers/shopee.ts` | utility | transform | none (greenfield) | new |
| `extension/public/selectors.config.json` | config | — | none (greenfield) | new |

---

## Pattern Assignments

### `backend/src/routes/products.ts` (route, request-response)

**Analog:** `backend/src/routes/settings.ts`

**Imports pattern** (lines 11–18):
```typescript
import { Elysia, t } from 'elysia'
import { desc } from 'drizzle-orm'
import { db } from '../db/client'
import { pages, settings } from '../db/schema'
import { verifyToken } from '../services/fbService'
import { encrypt, decrypt } from '../services/cryptoService'
import { connectPage } from '../services/pagesService'
```
For `products.ts` adapt as:
```typescript
import { Elysia, t } from 'elysia'
import { sql } from 'drizzle-orm'
import { db } from '../db/client'
import { products } from '../db/schema'
```

**Route declaration pattern** (line 19):
```typescript
export const settingsRoutes = new Elysia({ prefix: '/api/settings' })
```
Adapt to:
```typescript
export const productsRoutes = new Elysia({ prefix: '/api/products' })
```

**POST handler with TypeBox body + `set.status` error** (lines 25–64):
```typescript
.post(
  '/fb-connect',
  async ({ body, set }) => {
    const { pageId, accessToken } = body

    const result = await verifyToken(accessToken, pageId)
    if (!result.ok) {
      set.status = 422
      return {
        error: 'invalid_token',
        detail: result.error,
      }
    }
    // ... business logic ...
    return { ok: true, pageName: result.pageName, ... }
  },
  {
    body: t.Object({
      pageId:      t.String({ minLength: 1 }),
      accessToken: t.String({ minLength: 10 }),
    }),
  }
)
```

**Upsert pattern** — use Drizzle `onConflictDoUpdate` with `sql\`excluded.*\`` refs (from RESEARCH.md Pattern 8, verified against official Drizzle docs):
```typescript
const result = await db
  .insert(products)
  .values(row)
  .onConflictDoUpdate({
    target: products.productUrl,      // requires UNIQUE(product_url) from migration 0001
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
```

**TypeBox body schema for capture** — full product payload including nullable optional fields:
```typescript
body: t.Object({
  platform:    t.Union([t.Literal('shopee'), t.Literal('lazada'), t.Literal('tiktok')]),
  name:        t.String({ minLength: 1 }),
  price:       t.Number({ minimum: 0 }),
  discountPct: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
  rating:      t.Optional(t.Nullable(t.Number({ minimum: 0, maximum: 5 }))),
  reviewCount: t.Optional(t.Nullable(t.Integer({ minimum: 0 }))),
  salesCount:  t.Optional(t.Nullable(t.Integer({ minimum: 0 }))),
  shop:        t.Optional(t.Nullable(t.String())),
  productUrl:  t.String({ minLength: 10, format: 'uri' }),
})
```

---

### `backend/src/db/schema.ts` *(modify — add `.unique()` to `productUrl`)*

**Analog:** self — `backend/src/db/schema.ts` lines 12–26 (existing `products` table)

**Current `productUrl` column** (line 23):
```typescript
productUrl:   text('product_url').notNull(),
```

**Modified form (add `.unique()`):**
```typescript
productUrl:   text('product_url').notNull().unique(),
```

**Reference: existing `.unique()` usage in same file** (line 86):
```typescript
fbPageId:   text('fb_page_id').notNull().unique(),
```
Copy this pattern — same column builder, same chain position.

**Existing `id` with `$defaultFn`** (line 14 — DO NOT change):
```typescript
id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
```

**Existing timestamp column** (lines 24–25 — DO NOT change):
```typescript
capturedAt: integer('captured_at', { mode: 'timestamp' }).notNull()
              .default(sql`(unixepoch())`),
```

---

### `backend/drizzle/0001_add_product_url_unique.sql` (migration)

**Analog:** `backend/drizzle/0000_lyrical_the_initiative.sql`

**Migration format** (copy the `-->statement-breakpoint` delimiter pattern, lines 10, 12):
```sql
--> statement-breakpoint
CREATE UNIQUE INDEX `products_product_url_unique` ON `products` (`product_url`);
```

**Note:** Do NOT hand-write this file. Run `bun run migrate:generate` after adding `.unique()` to `schema.ts` — drizzle-kit generates a `CREATE UNIQUE INDEX` statement (SQLite does not support `ALTER TABLE ADD CONSTRAINT`). The file name will differ from the example above; that is expected.

**Reference existing UNIQUE INDEX syntax** (line 10 of migration 0000):
```sql
CREATE UNIQUE INDEX `pages_fb_page_id_unique` ON `pages` (`fb_page_id`);
```

---

### `backend/index.ts` *(modify — add productsRoutes)*

**Analog:** self — `backend/index.ts` lines 35–74

**Dynamic import + `.use()` pattern** (lines 35–37, 72–74):
```typescript
// After requireEncryptionKey() call (line 31)
const { healthRoutes }   = await import('./src/routes/health')
const { settingsRoutes } = await import('./src/routes/settings')
const { fbOauthRoutes }  = await import('./src/routes/fbOauth')
// ...
app
  .use(healthRoutes)
  .use(settingsRoutes)
  .use(fbOauthRoutes)
```

**Add productsRoutes after existing imports (same pattern):**
```typescript
const { productsRoutes } = await import('./src/routes/products')
// ...
app
  .use(healthRoutes)
  .use(settingsRoutes)
  .use(fbOauthRoutes)
  .use(productsRoutes)   // <-- add here
```

**Critical guard** (lines 80–87) — seed + listen only inside `import.meta.main`:
```typescript
if (import.meta.main) {
  const { seedDefaultSettings } = await import('./seed')
  await seedDefaultSettings()
  app.listen(PORT)
  console.log(`Listening on http://${app.server?.hostname}:${app.server?.port}`)
}
```
Do NOT move the `productsRoutes` import inside this block — it must be at the top level so tests can import the app without binding a port.

---

### `backend/src/routes/products.test.ts` (test, request-response)

**Analog:** `backend/src/routes/settings.test.ts`

**Test file header pattern** (lines 1–13):
```typescript
/**
 * VALIDATION: CAP-02 — POST /api/products/capture persists + upserts
 * ...
 */
import { test, expect, describe, beforeEach, afterEach, beforeAll } from 'bun:test'
import { productsRoutes } from '../routes/products'
```

**In-process route testing pattern** (lines 46–55) — use `routeInstance.handle(new Request(...))` without binding a socket:
```typescript
const response = await settingsRoutes.handle(
  new Request('http://localhost/api/settings', { method: 'GET' })
)
```
Adapt to:
```typescript
const response = await productsRoutes.handle(
  new Request('http://localhost/api/products/capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
)
```

**Test environment setup** (lines 23–27) — set env vars in `beforeAll`:
```typescript
beforeAll(() => {
  process.env.BUN_ENCRYPTION_KEY = 'a'.repeat(64)
  process.env.DATABASE_URL = ':memory:'
})
```

**Table cleanup pattern for test isolation** (lines 89–95):
```typescript
beforeEach(async () => {
  const { db } = await import('../db/client')
  const { pages } = await import('../db/schema')
  await db.delete(pages)
})
```
Adapt to clear `products` table:
```typescript
beforeEach(async () => {
  const { db } = await import('../db/client')
  const { products } = await import('../db/schema')
  await db.delete(products)
})
```

**`describe` block structure** — group by requirement ID (lines 22, 36, 82, 130, 181):
```typescript
describe('Products routes — capture (CAP-02)', () => {
  describe('CAP-02: upsert on same productUrl updates existing row', () => { ... })
  describe('CAP-03: null optional fields do not fail capture', () => { ... })
  describe('CAP-04: minimal payload (URL + platform only) creates basic record', () => { ... })
})
```

---

## Greenfield Extension Files (No Codebase Analog)

The following 10 files have no existing analog in the codebase. The planner MUST reference RESEARCH.md patterns and official docs instead of codebase excerpts.

### `extension/wxt.config.ts` (config)

**Source:** RESEARCH.md Pattern 1 (lines 222–241) — `host_permissions`, `web_accessible_resources`.

**Critical items:**
- `host_permissions` must include `'http://localhost/*'` and `'http://127.0.0.1/*'` — both are required because the backend binds to `127.0.0.1`
- `selectors.config.json` MUST be in `web_accessible_resources.resources` or content script fetch is blocked (Pitfall 4)
- `matches` on `web_accessible_resources` must be `['*://shopee.co.th/*', '*://www.shopee.co.th/*']`

```typescript
// RESEARCH.md Pattern 1
import { defineConfig } from 'wxt'

export default defineConfig({
  manifest: {
    permissions: ['tabs', 'activeTab'],
    host_permissions: [
      'http://localhost/*',
      'http://127.0.0.1/*',
      '*://shopee.co.th/*',
      '*://www.shopee.co.th/*',
    ],
    web_accessible_resources: [
      {
        resources: ['selectors.config.json'],
        matches: ['*://shopee.co.th/*', '*://www.shopee.co.th/*'],
      },
    ],
  },
})
```

---

### `extension/lib/messaging.ts` (utility, event-driven)

**Source:** RESEARCH.md Pattern 2 (lines 250–282) — `defineExtensionMessaging` ProtocolMap.

**Key constraint:** `RawProduct` interface defines the data contract between content script and popup; must match the `CapturePayload` sent to background. `fieldsRead`/`fieldsTotal` are needed for the N/N badge (D-03).

```typescript
// RESEARCH.md Pattern 2
import { defineExtensionMessaging } from '@webext-core/messaging'

export interface RawProduct {
  name: string | null
  price: number | null
  discountPct: number
  rating: number | null
  reviewCount: number | null
  salesCount: number | null
  shop: string | null
  productUrl: string
  platform: 'shopee' | 'lazada' | 'tiktok'
  fieldsRead: number
  fieldsTotal: number
}

export interface CapturePayload extends Omit<RawProduct, 'fieldsRead' | 'fieldsTotal'> {
  name: string   // required by backend; must be non-null before Save
}

interface ProtocolMap {
  readPage(): RawProduct
  saveProduct(data: CapturePayload): { ok: true; id: string } | { ok: false; error: string }
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>()
```

---

### `extension/entrypoints/background.ts` (middleware, event-driven)

**Source:** RESEARCH.md Pattern 3 (lines 289–326) — synchronous `onMessage` registration.

**Critical MV3 pitfall:** `onMessage` MUST be called at the top level of `defineBackground(() => { ... })` — never inside an `async` function or after an `await`. See RESEARCH.md Pitfall 2.

```typescript
// RESEARCH.md Pattern 3
import { defineBackground } from 'wxt/sandbox'
import { onMessage } from '../lib/messaging'

export default defineBackground(() => {
  // SYNC registration — no await before this line
  onMessage('saveProduct', async (message) => {
    const data = message.data
    try {
      const res = await fetch('http://127.0.0.1:3000/api/products/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        return { ok: false as const, error: (body as any)?.message ?? `HTTP ${res.status}` }
      }
      const json = await res.json() as { id: string }
      return { ok: true as const, id: json.id }
    } catch {
      return { ok: false as const, error: 'backend_offline' }
    }
  })
})
```

---

### `extension/entrypoints/content.ts` (middleware, event-driven)

**Source:** RESEARCH.md Pattern 4 (lines 363–384) — `defineContentScript` with `main()` wrapper.

**Key constraint:** All runtime code inside `main()` callback — no top-level DOM access (WXT imports file in Node at build time). Use `browser.runtime.getURL()` to load `selectors.config.json` at runtime, NOT via `import`.

```typescript
// RESEARCH.md Pattern 4
import { defineContentScript } from 'wxt/sandbox'
import { onMessage } from '../lib/messaging'
import { parseShopee } from '../parsers/shopee'

export default defineContentScript({
  matches: ['*://shopee.co.th/*', '*://www.shopee.co.th/*'],
  runAt: 'document_idle',
  main() {
    onMessage('readPage', async () => {
      const configUrl = browser.runtime.getURL('/selectors.config.json')
      const selectors = await fetch(configUrl).then(r => r.json())
      return parseShopee(document, selectors)
    })
  },
})
```

---

### `extension/parsers/shopee.ts` (utility, transform)

**Source:** RESEARCH.md Pattern 4 — `waitForElement` helper (lines 332–360); Pattern 5 — selector config shape (lines 388–408).

**Key constraint:** `waitForElement` uses `MutationObserver` with 10-second timeout because Shopee is a React SPA — DOM is not ready at `document_idle`. Return `null` on timeout (CAP-03 graceful empty).

```typescript
// RESEARCH.md Pattern 4 — MutationObserver pattern
export async function waitForElement(selector: string, timeout = 10_000): Promise<Element | null> {
  const existing = document.querySelector(selector)
  if (existing) return existing
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector)
      if (el) { observer.disconnect(); clearTimeout(timer); resolve(el) }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    const timer = setTimeout(() => { observer.disconnect(); resolve(null) }, timeout)
  })
}
```

**Selector config shape** (RESEARCH.md Pattern 5):
```json
{
  "shopee": {
    "name": "...",
    "price": "...",
    "priceRange": "...",
    "discountBadge": "...",
    "rating": "...",
    "reviewCount": "...",
    "salesCount": "...",
    "shop": "..."
  }
}
```

**[CRITICAL — RESEARCH FLAG UNRESOLVED]:** All selector values in `public/selectors.config.json` are ASSUMED (training data only, LOW confidence). The executor MUST verify each selector against a live `shopee.co.th` product page using DevTools before first use. This is Wave 0 task 0 in the plan.

---

### `extension/lib/normalizer.ts` (utility, transform)

**Source:** RESEARCH.md Pattern 6 (lines 424–468) — `parsePrice`, `parseCount`, `parseDiscount`.

**Key constraint:** Pure functions only — no DOM access. These run in the content script after DOM parsing, before the operator sees the review form (D-09).

```typescript
// RESEARCH.md Pattern 6
export function parsePrice(raw: string): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/฿|,|\s/g, '')
  const parts = cleaned.split('-').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
  if (parts.length === 0) return null
  return Math.min(...parts)
}

export function parseCount(raw: string): number | null {
  if (!raw) return null
  const s = raw.trim()
  const thaiMap: [string, number][] = [
    ['ล้าน', 1_000_000], ['แสน', 100_000], ['หมื่น', 10_000], ['พัน', 1_000],
  ]
  for (const [suffix, mult] of thaiMap) {
    if (s.includes(suffix)) return Math.round(parseFloat(s.replace(suffix, '').replace(/,/g, '')) * mult)
  }
  if (/k$/i.test(s)) return Math.round(parseFloat(s) * 1_000)
  if (/m$/i.test(s)) return Math.round(parseFloat(s) * 1_000_000)
  const n = parseFloat(s.replace(/,/g, ''))
  return isNaN(n) ? null : Math.round(n)
}

export function parseDiscount(raw: string): number {
  if (!raw) return 0
  const n = parseFloat(raw.replace(/%|-/g, ''))
  return isNaN(n) ? 0 : Math.abs(n)
}
```

---

### `extension/lib/normalizer.test.ts` (test, transform)

**Partial analog:** `backend/src/routes/health.test.ts` — bun test structure (no mocks needed for pure functions)

**Test structure pattern** (health.test.ts lines 14–46):
```typescript
import { test, expect, describe, beforeAll } from 'bun:test'

describe('normalizer — parsePrice', () => {
  test('parsePrice("฿290 - ฿500") → 290', () => {
    expect(parsePrice('฿290 - ฿500')).toBe(290)
  })
  // ...
})
```

**Required test cases from RESEARCH.md Validation Architecture:**
- `parsePrice('฿290 - ฿500')` → `290`
- `parsePrice('฿1,290')` → `1290`
- `parseCount('12.3k')` → `12300`
- `parseCount('1.2พัน')` → `1200`
- `parseCount('1.5ล้าน')` → `1500000`
- `parseDiscount('10%')` → `10`
- `parseDiscount('-10%')` → `10`

---

### `extension/entrypoints/popup/index.html` + `extension/entrypoints/popup/main.ts` (component, request-response)

**Source:** `02-UI-SPEC.md` — complete layout, colors, component inventory, and copywriting contract.

**Key UI patterns from `02-UI-SPEC.md`:**

HTML head setup (lines 91–96):
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600&display=swap" rel="stylesheet">
```
`<body style="font-family: 'Noto Sans Thai', sans-serif; width: 380px; background: #F0FDFA;">` with Tailwind CDN script.

**5 popup states** (02-UI-SPEC.md lines 140–268):
1. **Idle** — "จับข้อมูล" CTA + URL paste input
2. **Review Form** — 8 editable fields, N/N badge, Save/Cancel footer
3. **Zero-Fields Warning** — amber banner + "ลองใหม่อีกครั้ง" + empty form
4. **Backend Offline** — form preserved + red error banner above footer
5. **Success** — check-circle + "บันทึกสำเร็จ!" + auto-reset 3s

**Primary button class** (02-UI-SPEC.md Component Inventory, line 297):
```
w-full h-11 rounded-lg bg-orange-500 text-white font-semibold text-[13px] flex items-center justify-center gap-2 transition-colors duration-150 hover:bg-orange-600 cursor-pointer
```

**Form input class** (line 299):
```
w-full h-9 px-3 rounded-md border border-teal-200 bg-white text-[13px] text-teal-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent
```

**Empty field input class** — same as FormInput + `border-amber-300 bg-amber-50`

**Accessibility requirement** — every `<button>` that triggers async operation needs `aria-busy="true"` + `opacity-60 cursor-not-allowed pointer-events-none` during load (02-UI-SPEC.md lines 279–285).

**`main.ts` state management pattern** — use `innerHTML` replacement or CSS `hidden` class to switch between the 5 screens. Never `innerHTML` on untrusted data — use `textContent` for any DOM values from the parsed product (security: XSS via crafted Shopee page names).

---

### `extension/public/selectors.config.json` (config)

**Source:** RESEARCH.md Pattern 5 (lines 388–410) — structure only; values are ASSUMED.

```json
{
  "shopee": {
    "name": "[data-sqe='name'] h1, .product-briefing h1",
    "price": ".product-price .price, ._3_ISdg",
    "priceRange": ".product-price .range-price",
    "discountBadge": ".discount-badge, ._3EVKSI",
    "rating": ".shopee-rating-stars .rating, [class*='rating-stars']",
    "reviewCount": "[class*='rating-count'], ._3Oj5_n",
    "salesCount": "[class*='sold'], [class*='rating-sold']",
    "shop": ".seller-name__text, [class*='shop-name']"
  }
}
```

**[CRITICAL]:** These values are training-data assumptions (LOW confidence). Must be verified against a live `shopee.co.th` product page in Wave 0 before any other extension work.

---

## Shared Patterns

### TypeBox Body Validation
**Source:** `backend/src/routes/settings.ts` lines 59–63
**Apply to:** `backend/src/routes/products.ts` POST /capture handler
```typescript
// Elysia's built-in t (TypeBox) — never Zod
{
  body: t.Object({
    field: t.Type({ ...constraints }),
  })
}
```
TypeBox validates and rejects malformed requests before the handler runs. `422` status is set manually with `set.status = 422` before returning an error object.

### Dynamic Route Import in `index.ts`
**Source:** `backend/index.ts` lines 35–37
**Apply to:** Adding `productsRoutes` to `backend/index.ts`
```typescript
// Dynamic import AFTER requireEncryptionKey() — preserves key-first boot order
const { productsRoutes } = await import('./src/routes/products')
```
Static imports are hoisted and evaluated BEFORE `requireEncryptionKey()` — always use `await import()` for route modules in this project.

### `import.meta.main` Guard
**Source:** `backend/index.ts` lines 80–87
**Apply to:** Any new side-effect code in `backend/index.ts` (port bind, seed writes)
```typescript
if (import.meta.main) {
  // port bind and seed ONLY here — never at module top level
}
```

### Test In-Process Route Handle
**Source:** `backend/src/routes/settings.test.ts` line 48
**Apply to:** `backend/src/routes/products.test.ts`
```typescript
// No port bind — test routes directly via .handle()
const response = await routeInstance.handle(new Request('http://localhost/...', { ... }))
```

### Test Environment Isolation
**Source:** `backend/src/routes/settings.test.ts` lines 23–27, 89–95
**Apply to:** `backend/src/routes/products.test.ts`
```typescript
beforeAll(() => {
  process.env.BUN_ENCRYPTION_KEY = 'a'.repeat(64)
  process.env.DATABASE_URL = ':memory:'
})
beforeEach(async () => {
  const { db } = await import('../db/client')
  const { products } = await import('../db/schema')
  await db.delete(products)
})
```

### Drizzle `onConflictDoUpdate` Upsert
**Source:** RESEARCH.md Pattern 7 / Code Examples (lines 753–765, verified against official Drizzle docs)
**Apply to:** `backend/src/routes/products.ts` POST /capture
```typescript
// Requires UNIQUE index on target column — must run migration 0001 first
await db.insert(table).values(row).onConflictDoUpdate({
  target: table.column,          // column with UNIQUE constraint
  set: { col: sql`excluded.col` },
})
```

### WXT `browser` Global (Cross-Browser API)
**Source:** RESEARCH.md Stack Patterns (line: "Use WXT's `browser` global")
**Apply to:** All extension entrypoints — `background.ts`, `content.ts`, `popup/main.ts`
```typescript
// Always browser.* not chrome.* — WXT injects the unified polyfill
browser.runtime.getURL('/selectors.config.json')
browser.tabs.query({ active: true, currentWindow: true })
```

### No `innerHTML` on Parsed Data (Security)
**Source:** RESEARCH.md Security Domain — "XSS via product name in popup"
**Apply to:** `extension/entrypoints/popup/main.ts`
```typescript
// SAFE: use textContent for any value from the product page
element.textContent = product.name ?? ''
// UNSAFE: never innerHTML with DOM-sourced values
// element.innerHTML = product.name  ← XSS risk via crafted Shopee page
```

---

## No Analog Found

Files with no close match in the codebase (planner uses RESEARCH.md patterns as reference):

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `extension/wxt.config.ts` | config | — | No WXT project exists yet; greenfield |
| `extension/lib/messaging.ts` | utility | event-driven | No extension messaging code exists |
| `extension/entrypoints/background.ts` | middleware | event-driven | No MV3 service worker code exists |
| `extension/entrypoints/content.ts` | middleware | event-driven | No content script code exists |
| `extension/entrypoints/popup/index.html` | component | request-response | No popup HTML exists |
| `extension/entrypoints/popup/main.ts` | component | request-response | No popup logic exists |
| `extension/parsers/shopee.ts` | utility | transform | No DOM parser code exists |
| `extension/public/selectors.config.json` | config | — | No selector config exists |
| `extension/lib/normalizer.ts` | utility | transform | No normalization code exists; pattern from RESEARCH.md §Pattern 6 |
| `extension/lib/normalizer.test.ts` | test | transform | Partial analog: `health.test.ts` for bun test structure only |

---

## Metadata

**Analog search scope:** `backend/src/routes/`, `backend/src/db/`, `backend/index.ts`, `backend/src/services/`, `backend/test/`
**Files scanned:** 14 backend files
**Extension files:** 10 greenfield (no prior extension workspace)
**Pattern extraction date:** 2026-06-25

**Confidence:**
- Backend patterns (routes, schema, tests): HIGH — extracted from real running code
- Extension patterns: MEDIUM — sourced from RESEARCH.md which cites official WXT/Chrome docs
- Shopee selectors: LOW — RESEARCH FLAG UNRESOLVED; must be verified before extension build
