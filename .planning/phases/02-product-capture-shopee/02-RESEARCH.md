# Phase 2: Product Capture (Shopee) - Research

**Researched:** 2026-06-25
**Domain:** Chrome MV3 Extension (WXT) + Elysia capture endpoint + Drizzle upsert migration
**Confidence:** MEDIUM — WXT/messaging APIs verified via official docs; Shopee DOM selectors are ASSUMED (must be verified against live page per ROADMAP research flag)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Capture is triggered from the **extension toolbar popup only** — no on-page overlay. Click extension icon → popup opens with "Capture" button and result UI.
- **D-02:** Popup UI design (Capture button, review form, N/N summary, error/warning states) **MUST be designed using the `ui-ux-pro-max` skill** — invoke during planning/implementation.
- **D-03:** After "Capture", content script reads page → popup shows **review form** of parsed fields. Operator can edit any field (including manually filling empty ones), then clicks **Save** → backend write. NOT fire-and-forget. Shows **"N/N fields captured"** summary.
- **D-04:** Operator can **paste a product URL** in popup. Auto-detects platform from URL domain. Creates empty record pre-filled with URL + platform. Opens **same review form** for manual fill + Save.
- **D-05:** Capturing a product whose `productUrl` already exists = **upsert** (update existing record). Requires adding **UNIQUE constraint on `products.product_url`** via tracked Drizzle migration (NOT present in Phase 1 schema).
- **D-06:** Shopee CSS selectors live in **`selectors.config.json` bundled inside the extension**. Editing file + reloading (WXT `Alt+R`) is the fix path. NOT backend-served.
- **D-07:** Zero fields read (0/N) → popup shows warning ("couldn't read product data"), offers "Try again", opens **empty review form**. Do NOT silently save empty record.
- **D-08:** Backend offline when Save is pressed → **keep form populated**, show error ("can't reach backend — start `bun dev` then press Save again"). No offline queue.
- **D-09:** Extension normalizes before populating review form: price-range → lowest number; `12.3k`/`1.2พัน` → integer; strip `฿`/commas.

### Claude's Discretion
- Exact MV3 plumbing: content script MUST NOT fetch localhost directly — route via `chrome.runtime.sendMessage` → background `fetch()`. Register `onMessage` synchronously at top level of `background.ts`. `MutationObserver` + timeout for Shopee's async/SPA DOM. Declare `http://localhost/*` in `host_permissions`.
- Validate actual Shopee selectors against a live page at plan/research time (ROADMAP research-flag).

### Deferred Ideas (OUT OF SCOPE)
- On-page injected overlay capture button on Shopee product pages
- Offline capture queue + background retry (chrome.storage queue)
- Lazada & TikTok parsers (Phase 8)
- Server-served / live-editable selector config
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAP-01 | Operator can capture product data (name, price, discount %, rating, review count, sales count, shop, product URL) from an open Shopee page with one click in the extension | WXT popup entrypoint + content script DOM parsing + `selectors.config.json` |
| CAP-02 | Captured data is sent to the localhost backend and persisted | MV3 message routing: content→background→fetch→`POST /api/products/capture`; Drizzle upsert on `product_url` |
| CAP-03 | Fields that cannot be read are left empty for later manual entry without failing the whole capture | Graceful null/empty from parser; D-03 review form allows manual fill before Save |
| CAP-04 | Operator can paste a product URL to create a basic product record as a fallback | D-04 paste-URL flow; platform auto-detect from domain; same review form surface |
| CAP-05 | Platform CSS selectors live in an editable config file so the operator can fix them when a site changes | `selectors.config.json` in `public/` + `web_accessible_resources` + `browser.runtime.getURL()` in content script |
</phase_requirements>

---

## Summary

Phase 2 has two orthogonal workstreams that must both ship before the phase is complete:

**Extension workstream (greenfield):** Scaffold a WXT 0.20.26 Chrome MV3 extension with three entrypoints — `popup`, `background`, and `content` — plus a `parsers/shopee.ts` module driven by `public/selectors.config.json`. The popup provides the only UI surface: a Capture button that triggers the content script, shows a review form with "N/N captured" summary, and sends the confirmed data to the backend on Save. Message routing goes through the background service worker because content scripts running on HTTPS pages cannot `fetch()` to `http://localhost/*` directly (mixed-content block). `@webext-core/messaging` 3.0.2 provides typed, promise-based message passing that eliminates the raw `return true` async-channel requirement.

**Backend workstream (additive):** Add a `POST /api/products/capture` Elysia route to the existing backend and a Drizzle migration to add `UNIQUE(product_url)` to the `products` table. The route accepts a full product payload and upserts using Drizzle's `onConflictDoUpdate`, keyed on `product_url`. This is the first entity-write endpoint; all existing Phase 1 patterns (TypeBox `t.Object`, `set.status` errors, dynamic route import in `index.ts`) apply.

The biggest practical unknown remains the Shopee DOM selectors — Shopee's React SPA uses obfuscated class names that change frequently. The research flag from ROADMAP must be satisfied at plan time by inspecting a live `shopee.co.th` product page. The selectors are separated into `selectors.config.json` precisely because they will break; the architecture makes the fix a 30-second config edit + `Alt+R` rather than a rebuild.

**Primary recommendation:** Build backend first (Drizzle migration + capture endpoint), then scaffold WXT extension (messaging protocol → content script → popup review form → normalization helpers), validate selectors against live Shopee page, and wire the round-trip integration test last.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Product page DOM parsing | Browser / Content Script | — | Content script runs in page context; only tier with DOM access |
| Data normalization (price ranges, k-abbreviations) | Browser / Content Script | — | Must happen before user review; extension-side per D-09 |
| Message routing (content→background) | Browser / Background SW | — | MV3 mixed-content rule: only background SW can fetch localhost |
| HTTP POST to backend | Browser / Background SW | — | background.ts owns all outbound network calls |
| Capture endpoint + persistence | Backend API | — | Elysia route writes to SQLite via Drizzle |
| Upsert conflict resolution | Backend API | — | `onConflictDoUpdate` on `product_url` unique index |
| Review form UI | Browser / Popup | — | Popup is the only UI surface (D-01) |
| Selector config lookup | Browser / Content Script | — | `browser.runtime.getURL()` fetches from `public/` dir (D-06) |
| Schema migration | Backend / Drizzle | — | `drizzle-kit generate` + `migrate:run` adds UNIQUE constraint |

---

## Standard Stack

### Core (all from locked CLAUDE.md stack — versions verified against npm registry 2026-06-25)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| WXT | 0.20.26 (locked) — latest: 0.20.27 | Chrome MV3 extension bundler | Vite-powered HMR, file-based entrypoints, MV3-first, handles manifest generation automatically; `[VERIFIED: npm registry]` |
| `@webext-core/messaging` | 3.0.2 | Typed content↔background↔popup messaging | Type-safe wrapper around `browser.runtime`; eliminates `return true` footgun; `[VERIFIED: npm registry]` |
| Elysia | 1.4.29 (existing) | Backend HTTP route for capture endpoint | Already installed in Phase 1; same pattern as `settings.ts` |
| Drizzle ORM | 0.45.2 (existing) | SQLite upsert via `onConflictDoUpdate` | Already installed; `bun:sqlite` adapter |
| drizzle-kit | 0.31.10 (existing) | Generate + apply UNIQUE constraint migration | Already installed; `migrate:generate` + `migrate:run` scripts |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| WXT `browser` global | (WXT built-in) | Cross-browser polyfill for `chrome.*` APIs | Always — replaces raw `chrome.*` calls; WXT injects this |
| `public/selectors.config.json` | — | Shopee CSS selectors, editable without rebuild | Only content script reads this via `browser.runtime.getURL()` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@webext-core/messaging` | Raw `chrome.runtime.sendMessage` + `return true` | Raw API requires `return true` exactly for async channels; easy to forget; no type safety |
| `browser.runtime.getURL()` for selector config | Import JSON directly in content script bundle | Direct import bakes selectors into compiled bundle — defeats D-06 (can't edit without rebuild) |
| `onConflictDoUpdate` | DELETE + INSERT | Two operations not atomic in SQLite without explicit transaction; upsert is single atomic write |

### Installation (extension workspace — greenfield)

```bash
cd extension
bun create wxt@latest . --template vanilla-ts
bun add @webext-core/messaging
```

> Note: WXT scaffold uses npm by default; override with `--pm bun` if desired. The `bun create wxt` command bootstraps the entrypoints structure and `wxt.config.ts`.

---

## Package Legitimacy Audit

> Phase 2 introduces new packages only for the **extension** workspace. Backend packages are already installed from Phase 1.

| Package | Registry | Age | Source Repo | Postinstall | Disposition |
|---------|----------|-----|-------------|-------------|-------------|
| `wxt` | npm | ~3 yrs (2023-06-26) | github.com/wxt-dev/wxt | none | Approved |
| `@webext-core/messaging` | npm | ~4 yrs (2022-11-07) | github.com/aklinker1/webext-core | none | Approved |

`[VERIFIED: npm registry]` — both packages confirmed via `npm view`. No suspicious postinstall scripts detected.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*Note: slopcheck defaults to PyPI ecosystem; these are npm packages. Registry verification performed directly via `npm view` against npm registry.*

---

## Architecture Patterns

### System Architecture Diagram

```
Operator (Chrome browser)
         │
         │ clicks extension icon
         ▼
┌─────────────────────────────┐
│  Popup (entrypoints/popup)  │
│  ┌─────────────────────┐    │
│  │  [Capture] button   │────┼──── sendMessage('readPage') ──────────┐
│  │  Review form (N/N)  │    │                                        │
│  │  [Save] button      │────┼──── sendMessage('saveProduct', data) ──┤
│  └─────────────────────┘    │                                        │
└─────────────────────────────┘                                        │
                                                                       ▼
┌──────────────────────────────────────────────────────┐   ┌──────────────────────┐
│  Content Script (entrypoints/content.ts)             │   │  Background SW       │
│  matches: *://shopee.co.th/*, *://shopee.th/*        │   │  (entrypoints/       │
│                                                      │   │   background.ts)     │
│  onMessage('readPage'):                              │   │                      │
│    1. fetch('selectors.config.json' via getURL)      │   │  onMessage registered│
│    2. MutationObserver → wait for DOM ready          │   │  at TOP LEVEL (sync) │
│    3. Parse DOM → normalize → return RawProduct      │◄──┤                      │
│                                                      │   │  onMessage('save'):  │
└──────────────────────────────────────────────────────┘   │    fetch(localhost)──┼──► POST /api/products/capture
                                                           │    return result     │         │
                                                           └──────────────────────┘         ▼
                                                                                  ┌──────────────────┐
                                                                                  │  Elysia Backend  │
                                                                                  │  productsRoute   │
                                                                                  │  .post('/capture')│
                                                                                  │   TypeBox validate│
                                                                                  │   Drizzle upsert  │
                                                                                  │   on product_url  │
                                                                                  └──────────────────┘
                                                                                         │
                                                                                         ▼
                                                                                  SQLite products table
                                                                                  (UNIQUE product_url)
```

**Data flow for Paste-URL fallback (D-04):**
`Popup text input` → `platform detect from domain` → `sendMessage('saveProduct', {url, platform, ...empty fields})` → background → backend upsert → same result state in popup.

### Recommended Project Structure

```
extension/                          # WXT workspace root (greenfield)
├── wxt.config.ts                   # host_permissions, manifest, web_accessible_resources
├── package.json                    # bun workspace; wxt + @webext-core/messaging
├── tsconfig.json                   # WXT-generated
├── public/
│   └── selectors.config.json       # Shopee CSS selectors (editable without rebuild)
├── entrypoints/
│   ├── background.ts               # Service worker; onMessage at TOP LEVEL (sync)
│   ├── content.ts                  # Matches shopee.co.th/*; reads DOM, sends to background
│   └── popup/
│       ├── index.html              # Popup HTML shell
│       └── main.ts                 # Popup logic: Capture btn, review form, Save btn
├── parsers/
│   ├── index.ts                    # Parser factory: dispatch by platform string
│   └── shopee.ts                   # Shopee-specific DOM parser
├── lib/
│   ├── messaging.ts                # defineExtensionMessaging ProtocolMap
│   └── normalizer.ts               # Price-range, k-abbreviation, currency stripping
└── assets/
    └── icon*.png                   # Extension icons

backend/src/routes/
└── products.ts                     # NEW: POST /api/products/capture

backend/drizzle/
└── 0001_add_product_url_unique.sql # NEW: migration adding UNIQUE(product_url)
```

---

### Pattern 1: WXT Configuration (`wxt.config.ts`)

**What:** Central manifest configuration for host_permissions, web_accessible_resources, and permissions.
**When to use:** Once at scaffold time; update when adding new host origins or accessible resources.

```typescript
// Source: https://wxt.dev/guide/essentials/config/manifest.html [VERIFIED: official docs]
import { defineConfig } from 'wxt'

export default defineConfig({
  manifest: {
    permissions: ['tabs', 'activeTab'],
    host_permissions: [
      'http://localhost/*',
      'http://127.0.0.1/*',
      '*://shopee.co.th/*',
    ],
    web_accessible_resources: [
      {
        resources: ['selectors.config.json'],
        matches: ['*://shopee.co.th/*'],
      },
    ],
  },
})
```

> **Critical:** `selectors.config.json` MUST be declared in `web_accessible_resources` for the content script to access it via `browser.runtime.getURL()`. Without this, `fetch(url)` from a content script will be blocked.

---

### Pattern 2: @webext-core/messaging — Typed Protocol

**What:** Define a single typed ProtocolMap; import `sendMessage`/`onMessage` everywhere.
**When to use:** All content↔background↔popup communication in this phase.

```typescript
// Source: github.com/aklinker1/webext-core/packages/messaging README [VERIFIED: official docs]
// extension/lib/messaging.ts
import { defineExtensionMessaging } from '@webext-core/messaging'

// RawProduct is the normalized-but-unconfirmed data from the parser
export interface RawProduct {
  name: string
  price: number            // lowest of range, stripped of ฿/commas
  discountPct: number      // 0 if not found
  rating: number | null
  reviewCount: number | null
  salesCount: number | null
  shop: string | null
  productUrl: string
  platform: 'shopee' | 'lazada' | 'tiktok'
  fieldsRead: number       // for N/N summary
  fieldsTotal: number
}

export interface CapturePayload extends RawProduct {
  // operator may have edited any field in the review form
}

interface ProtocolMap {
  readPage(): RawProduct        // popup→content: parse current page, return data
  saveProduct(data: CapturePayload): { ok: true; id: string } | { ok: false; error: string }
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>()
```

---

### Pattern 3: Background Service Worker — Synchronous onMessage Registration

**What:** Register ALL `onMessage` listeners at the TOP LEVEL of `background.ts`, not inside async functions.
**When to use:** Every MV3 background service worker. This is the critical MV3 pitfall #2 from ROADMAP.

```typescript
// Source: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/events [VERIFIED: official docs]
// extension/entrypoints/background.ts
import { defineBackground } from 'wxt/sandbox'
import { onMessage } from '../lib/messaging'

export default defineBackground(() => {
  // MUST be synchronous — registered at module init time, not inside async chains
  // Chrome dispatches events only to listeners registered at startup
  onMessage('saveProduct', async (message) => {
    const data = message.data
    try {
      const res = await fetch('http://localhost:3000/api/products/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        return { ok: false as const, error: body?.message ?? `HTTP ${res.status}` }
      }
      const json = await res.json()
      return { ok: true as const, id: json.id }
    } catch (err) {
      // Network error — backend offline
      return { ok: false as const, error: 'backend_offline' }
    }
  })
  // Note: 'readPage' is handled by the content script, not background
  // Popup sends 'readPage' directly to the content script via tabs.sendMessage
})
```

> **Why `@webext-core/messaging` helps here:** The library wraps `chrome.runtime.onMessage` and handles the `return true` / promise channel internally. Using the library removes the footgun where forgetting `return true` silently breaks async responses. The `async` handler pattern is valid because the library handles the channel lifetime.

---

### Pattern 4: Content Script — MutationObserver + Timeout for Shopee SPA

**What:** Shopee is a React SPA; product data does not exist in the initial HTML — it loads asynchronously after page render. Use MutationObserver with a 10-second timeout.
**When to use:** Any time content script reads product fields that might not be present at `document_idle`.

```typescript
// Source: ROADMAP pitfall #6 + Chrome docs ISOLATED world [ASSUMED pattern — verified approach]
// extension/parsers/shopee.ts
export async function waitForElement(
  selector: string,
  timeout = 10_000
): Promise<Element | null> {
  // Check if already present
  const existing = document.querySelector(selector)
  if (existing) return existing

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
      resolve(null)   // timeout — field will be null/empty (CAP-03)
    }, timeout)
  })
}
```

> **WXT content script entrypoint requirement:** All runtime code in `entrypoints/content.ts` MUST be inside the `main()` callback. No top-level DOM access — WXT imports the file in Node at build time.

```typescript
// extension/entrypoints/content.ts
import { defineContentScript } from 'wxt/sandbox'
import { onMessage } from '../lib/messaging'
import { parseShopee } from '../parsers/shopee'

export default defineContentScript({
  matches: ['*://shopee.co.th/*', '*://www.shopee.co.th/*'],
  runAt: 'document_idle',
  main() {
    // Register listener inside main() — all runtime code here
    onMessage('readPage', async () => {
      // Load selector config at runtime (not bundled) via extension URL
      const configUrl = browser.runtime.getURL('/selectors.config.json')
      const selectors = await fetch(configUrl).then(r => r.json())
      return parseShopee(document, selectors)
    })
  },
})
```

---

### Pattern 5: Selector Config JSON Structure

**What:** Config-driven selector mapping per D-06. Editable without rebuild.

```json
// extension/public/selectors.config.json
// [ASSUMED — selectors require live-page verification per ROADMAP research flag]
{
  "shopee": {
    "name": "[data-sqe='name'] h1, .product-briefing h1",
    "price": ".product-price .price, ._3_ISdg",
    "priceRange": ".product-price .range-price",
    "discountBadge": ".discount-badge, ._3EVKSI",
    "rating": ".rating-stars__stars--active, .shopee-rating-stars",
    "reviewCount": "._3Oj5_n .rating-count, .product-rating__count",
    "salesCount": "._3Oj5_n .rating-sold, .product-rating__sold",
    "shop": ".seller-name__text, .shop-name"
  }
}
```

> **[ASSUMED] — CRITICAL:** All selector values above are best-effort training data. Shopee frequently changes its React bundle class names (obfuscated, version-stamped). The operator MUST open a live `shopee.co.th` product page with DevTools, inspect each element, and update this file before first capture. The config-driven architecture (D-06) makes this a ~5 minute fix without any rebuild. See ROADMAP research flag.

**Inspection procedure (to perform at plan time):**
1. Open any `shopee.co.th` product page in Chrome
2. Open DevTools → Elements tab
3. Right-click each field element → Copy → Copy selector
4. Update `selectors.config.json` with verified selectors
5. Test with `document.querySelector(selector)` in DevTools console
6. Commit updated `selectors.config.json` as the verified baseline

---

### Pattern 6: Normalization Helpers (D-09)

**What:** Pure functions that normalize raw DOM text into schema-compatible numbers.
**Where:** `extension/lib/normalizer.ts` — extension-side, run before populating review form.

```typescript
// extension/lib/normalizer.ts [ASSUMED pattern — logic derived from D-09 spec]

/** Parse price: ฿290 - ฿500 → 290; ฿1,290 → 1290 */
export function parsePrice(raw: string): number | null {
  if (!raw) return null
  // Strip currency, spaces; take the lower bound of a range
  const cleaned = raw.replace(/฿|,|\s/g, '')
  const parts = cleaned.split('-').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
  if (parts.length === 0) return null
  return Math.min(...parts)   // lowest price in range
}

/** Parse abbreviated counts: 12.3k → 12300; 1.2พัน → 1200; 1.5ล้าน → 1500000 */
export function parseCount(raw: string): number | null {
  if (!raw) return null
  const s = raw.trim()
  // Thai abbreviations: พัน = thousand, หมื่น = 10k, แสน = 100k, ล้าน = million
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
  // English k/m abbreviations
  if (/k$/i.test(s)) return Math.round(parseFloat(s) * 1_000)
  if (/m$/i.test(s)) return Math.round(parseFloat(s) * 1_000_000)
  // Plain number
  const n = parseFloat(s.replace(/,/g, ''))
  return isNaN(n) ? null : Math.round(n)
}

/** Parse discount: "10%" → 10; "-10%" → 10 */
export function parseDiscount(raw: string): number {
  if (!raw) return 0
  const n = parseFloat(raw.replace(/%|-/g, ''))
  return isNaN(n) ? 0 : Math.abs(n)
}
```

---

### Pattern 7: Drizzle Migration — Add UNIQUE(product_url)

**What:** Add a UNIQUE index on `products.product_url` to enable upsert (D-05).
**Steps:**

1. Update schema in `backend/src/db/schema.ts`:
```typescript
// Source: Drizzle ORM docs [VERIFIED: official docs]
// Add .unique() to the productUrl column definition:
productUrl: text('product_url').notNull().unique(),
```

2. Generate migration:
```bash
cd backend
bun run migrate:generate
# Creates: drizzle/0001_add_product_url_unique.sql
# Drizzle-kit --bun flag is NOT needed for generate (only for push); the package.json
# drizzle.config.ts already points to bun-sqlite dialect.
```

3. Apply migration (auto-applied at server boot via `openDatabase()`, or manually):
```bash
bun run migrate:run
```

The generated SQL will be an `ALTER TABLE` or equivalent unique index creation. SQLite does not support `ADD CONSTRAINT` — drizzle-kit generates a `CREATE UNIQUE INDEX` statement instead.

---

### Pattern 8: Backend Capture Endpoint

**What:** `POST /api/products/capture` — validates, normalizes platform enum, upserts product.

```typescript
// backend/src/routes/products.ts [ASSUMED pattern — modeled on settings.ts]
import { Elysia, t } from 'elysia'
import { db } from '../db/client'
import { products } from '../db/schema'
import { sql } from 'drizzle-orm'

export const productsRoutes = new Elysia({ prefix: '/api/products' })
  .post(
    '/capture',
    async ({ body, set }) => {
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

      // Upsert: insert or update on product_url conflict (D-05)
      // Requires UNIQUE(product_url) from the 0001 migration
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
      }),
    }
  )
```

Mount in `backend/index.ts` via dynamic import after `requireEncryptionKey()`:
```typescript
const { productsRoutes } = await import('./src/routes/products')
// ...
app.use(productsRoutes)
```

---

### Anti-Patterns to Avoid

- **Content script fetch to localhost directly:** Content scripts on HTTPS Shopee pages cannot `fetch('http://localhost:3000/...')` — this is blocked as a mixed-content upgrade. ALL backend calls must go via `sendMessage` → background SW.
- **`onMessage` inside an async function in background.ts:** The Chrome runtime registers service worker event listeners only during synchronous startup. If registration happens after an `await`, Chrome cannot dispatch events to that listener. Use `@webext-core/messaging` which registers synchronously.
- **Baking selectors into the compiled bundle:** Using `import selectors from './selectors.config.json'` bundles the JSON — editing it requires a rebuild. Use `browser.runtime.getURL('/selectors.config.json')` + `fetch()` at runtime. The file must be in `public/` (not `assets/`).
- **Missing `web_accessible_resources` declaration:** `selectors.config.json` in `public/` is still blocked from content script access without an explicit `web_accessible_resources` entry in `wxt.config.ts`.
- **`drizzle-kit push` instead of generate+migrate:** Project uses tracked migrations (CLAUDE.md D-07 from Phase 1). Run `bun run migrate:generate` then `bun run migrate:run`. Never use `drizzle-kit push` in this project.
- **`better-sqlite3` in extension:** Not applicable here — extension has no SQLite access. This anti-pattern is backend-only.
- **Forgetting `import.meta.main` guard:** Any new code in `backend/index.ts` that adds side effects (DB writes, port binds) must be inside the `if (import.meta.main)` block to avoid test pollution.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Typed extension messaging | Custom `chrome.runtime.sendMessage` wrapper | `@webext-core/messaging` | Eliminates `return true` async channel footgun; full TypeScript protocol types |
| MV3 manifest generation | Hand-write `manifest.json` | WXT `wxt.config.ts` manifest field | WXT generates correct MV3 manifest with proper service worker configuration |
| Extension HMR during dev | Custom reload scripts | WXT `Alt+R` shortcut + `bun run dev` in extension/ | WXT registers HMR automatically; manual reload shortcut built-in |
| Cross-browser extension API shims | Polyfill `chrome.*` vs `browser.*` | WXT's `browser` global | WXT injects a unified `browser` API polyfill that works on Chrome and Firefox |
| SQL upsert conflict handling | Manual SELECT → INSERT or UPDATE | `db.insert().onConflictDoUpdate()` | Atomic single statement; avoids TOCTOU race on concurrent captures |

**Key insight:** The extension plumbing (messaging, manifest, HMR) is exactly where DIY solutions break in subtle ways specific to MV3 service worker lifecycle. WXT and `@webext-core/messaging` encode the correct patterns; hand-rolling reintroduces known bugs.

---

## Common Pitfalls

### Pitfall 1: Content Script Mixed-Content Block
**What goes wrong:** `fetch('http://localhost:3000/...')` called from content script on a Shopee HTTPS page throws a network error or is silently blocked. Capture appears to do nothing.
**Why it happens:** Browsers enforce mixed-content rules — HTTPS pages cannot make HTTP subrequests. Content scripts inherit the page's security context.
**How to avoid:** ALL backend calls go through `sendMessage('saveProduct', data)` → background SW → `fetch('http://localhost:3000/...')`. Background SW runs in the extension's own origin, not the page's.
**Warning signs:** Network panel shows no request to localhost; content script console shows `TypeError: Failed to fetch`.

### Pitfall 2: Async onMessage Registration in Background
**What goes wrong:** `onMessage` registered inside an `async` function or after an `await`. Messages from popup are silently dropped when the service worker restarts.
**Why it happens:** Chrome only registers event listeners that execute synchronously during service worker startup. Any registration deferred by an `await` is missed.
**How to avoid:** All `onMessage` calls at the TOP LEVEL of `defineBackground(() => { ... })`. No `await` before `onMessage(...)`.
**Warning signs:** Popup shows "no response" error intermittently; works on first load but breaks after service worker goes idle and restarts.

### Pitfall 3: Shopee SPA Async DOM
**What goes wrong:** `document.querySelector('.price')` returns `null` — parser reads 0/8 fields. MutationObserver not used.
**Why it happens:** Shopee is a React SPA. Product data is injected asynchronously after the initial DOM parse. `document_idle` fires before React finishes rendering product details.
**How to avoid:** Use MutationObserver with a 10-second timeout for each field's selector. Return `null` for fields that timeout (CAP-03 graceful empty).
**Warning signs:** All fields in review form show empty on first capture attempt; popup shows "0/8 fields captured".

### Pitfall 4: selectors.config.json Blocked in Content Script
**What goes wrong:** `fetch(browser.runtime.getURL('/selectors.config.json'))` returns 404 or is blocked.
**Why it happens:** Extension resources in `public/` are not accessible to content scripts unless declared in `web_accessible_resources`. This is a MV3 security restriction.
**How to avoid:** Add `selectors.config.json` to `web_accessible_resources.resources` in `wxt.config.ts` with `matches: ['*://shopee.co.th/*']`.
**Warning signs:** Console error in content script: "Failed to fetch" or 404 for the extension resource URL.

### Pitfall 5: Drizzle Upsert Fails Without UNIQUE Constraint
**What goes wrong:** `onConflictDoUpdate({ target: products.productUrl })` throws `no conflict target specified` or silently fails.
**Why it happens:** Drizzle's `onConflictDoUpdate` requires a UNIQUE index on the target column. The Phase 1 migration created `products.product_url` as `NOT NULL` but without `UNIQUE`.
**How to avoid:** Run the Phase 2 migration (add `UNIQUE` index) before deploying the capture endpoint. Migration must precede any upsert attempt.
**Warning signs:** `LibsqlError: UNIQUE constraint failed` (on insert) OR no error but duplicates appear in DB.

### Pitfall 6: Shopee Selector Staleness
**What goes wrong:** All selectors return null after a Shopee frontend update. Capture always shows 0/N.
**Why it happens:** Shopee uses a React build with obfuscated/versioned class names (e.g., `_3Oj5_n`). These change on every Shopee frontend deploy.
**How to avoid:** The `selectors.config.json` architecture (D-06) makes the fix a config-only change. Operator opens DevTools on Shopee product page, finds new selectors, updates JSON, presses `Alt+R` to reload extension. No rebuild needed.
**Warning signs:** Every capture shows 0/N fields; last working date correlates with a Shopee deploy.

### Pitfall 7: Price Normalization Edge Cases
**What goes wrong:** `parsePrice` returns `null` for valid Shopee price strings; downstream score is 0 or null.
**Why it happens:** Shopee price formats vary: `฿290`, `฿1,290`, `฿290 - ฿500`, `290.00`, with or without spaces/symbols. A simple `parseFloat` fails on most of these.
**How to avoid:** `normalizer.ts` handles currency stripping, comma removal, range extraction (take lowest). Unit-test all edge cases before integration.
**Warning signs:** Review form shows `NaN` or `null` in price field after capture on a page with a visible price.

---

## Shopee Selector Research

> **RESEARCH FLAG STATUS: UNRESOLVED** — This is the ROADMAP-noted research item that MUST be completed before implementation begins.

### What is Known [ASSUMED — from training data + community sources]

Shopee Thailand (`shopee.co.th`) is a React SPA. Product page data attributes observed in the wild (NOT verified against a live 2026 page):

| Field | Likely Selector Candidates | Confidence |
|-------|--------------------------|------------|
| Product name | `div[data-sqe="name"] h1`, `h1.product-briefing__title` | LOW |
| Price (single) | `.product-price .price`, `._3_ISdg` | LOW |
| Price range | The price element containing ` - ` text | LOW |
| Discount badge | `.discount-badge`, `._3EVKSI` | LOW |
| Rating | `.shopee-rating-stars .rating`, `[class*="rating-stars"]` | LOW |
| Review count | `[class*="rating-count"]`, `._3Oj5_n` | LOW |
| Sales count | `[class*="sold"]`, text containing "ขายแล้ว" | LOW |
| Shop name | `.seller-name__text`, `[class*="shop-name"]` | LOW |

**All selector values are [ASSUMED].** The `_3Oj5_n` style obfuscated classes are known to change on every Shopee frontend deploy.

### Alternative: `data-sqe` Attribute Approach [ASSUMED]

Shopee has been observed (in 2023-2024 reports) using `data-sqe` attributes as internal tracking markers. These may be more stable than obfuscated class names:
- `div[data-sqe="name"]` — product name container
- `div[data-sqe="price"]` — price container

However, `data-sqe` presence and values are also unverified for 2026. Include in `selectors.config.json` as first-try selectors with obfuscated class fallbacks.

### Mandatory Pre-Implementation Action

The planner MUST include a Wave 0 task: **"Verify Shopee selectors against live shopee.co.th product page."** This task:
1. Opens a live Shopee product page in Chrome
2. Uses DevTools to verify each selector
3. Updates `selectors.config.json` with verified values
4. Commits the verified config as the baseline

This is a human-in-the-loop task — cannot be automated without browser access.

---

## UI Design Contract (D-02: ui-ux-pro-max)

The popup is the only UI surface in Phase 2. It is a small Chrome extension popup (typically 380-400px wide, max 600px tall).

**Invoke `ui-ux-pro-max` skill for:**
- Popup layout: Capture button, N/N captured summary badge, review form (8 editable fields), Save/Cancel buttons
- Warning state: "0/N captured" warning with "Try again" button
- Error state: "Backend offline" error banner (D-08)
- Paste-URL input: text field for URL paste fallback (D-04)
- Field count badge style: "6/8 fields captured" summary

**Stack for popup:** The popup uses WXT's vanilla TypeScript entrypoint (`entrypoints/popup/`). It can use any frontend library. Given the project's Next.js/Tailwind frontend direction, **using plain TypeScript + inline Tailwind via a CDN or building a mini React component tree** are both viable. The planner should specify this choice and invoke `ui-ux-pro-max` with the chosen stack.

**Accessibility requirements from ui-ux-pro-max skill:**
- Minimum 44×44px touch targets on all buttons
- Form labels with `for` attribute on all inputs
- 4.5:1 color contrast minimum
- Disable buttons during async operations (loading state while Capture/Save is in-flight)

---

## Code Examples

### Verified Patterns from Official Sources

#### WXT host_permissions and web_accessible_resources
```typescript
// Source: https://wxt.dev/guide/essentials/config/manifest.html [VERIFIED: official docs]
export default defineConfig({
  manifest: {
    host_permissions: ['http://localhost/*', '*://shopee.co.th/*'],
    web_accessible_resources: [{
      resources: ['selectors.config.json'],
      matches: ['*://shopee.co.th/*'],
    }],
  },
})
```

#### @webext-core/messaging defineExtensionMessaging
```typescript
// Source: github.com/aklinker1/webext-core README [VERIFIED: official docs]
import { defineExtensionMessaging } from '@webext-core/messaging'

interface ProtocolMap {
  capture(): RawProduct
}
export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>()
```

#### Chrome MV3 async message handler (keeping channel open)
```typescript
// Source: https://developer.chrome.com/docs/extensions/develop/concepts/messaging [VERIFIED: official docs]
// Raw chrome API pattern (shown for reference; @webext-core/messaging handles this internally):
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  fetch('http://localhost:3000/api/products/capture', { method: 'POST', ... })
    .then(r => r.json())
    .then(data => sendResponse({ ok: true, data }))
  return true   // CRITICAL: keep channel open for async sendResponse
})
```

#### Drizzle upsert with excluded columns
```typescript
// Source: https://orm.drizzle.team/docs/insert#on-conflict-do-update [VERIFIED: official docs]
await db.insert(products)
  .values(row)
  .onConflictDoUpdate({
    target: products.productUrl,    // requires UNIQUE(product_url)
    set: {
      name: sql`excluded.name`,     // excluded.* = the values we tried to insert
      price: sql`excluded.price`,
    },
  })
```

#### WXT content script entrypoint (all code inside main())
```typescript
// Source: https://wxt.dev/guide/essentials/entrypoints.html [VERIFIED: official docs]
import { defineContentScript } from 'wxt/sandbox'

export default defineContentScript({
  matches: ['*://shopee.co.th/*'],
  runAt: 'document_idle',
  main() {
    // ALL runtime code here — WXT imports this file in Node at build time
    // so no top-level DOM access
  },
})
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Manual `manifest.json` for Chrome extension | WXT `wxt.config.ts` with auto manifest generation | No manual MV3 service worker config needed |
| Plasmo extension framework | WXT (2023+) | 10x smaller bundles, Vite HMR, not React-only |
| Raw `chrome.runtime.onMessage` + `return true` | `@webext-core/messaging` typed protocol | Type safety + no async channel footgun |
| `chrome.*` APIs directly | WXT `browser.*` polyfill global | Cross-browser (Chrome + Firefox) from same codebase |
| Drizzle-kit `push` for schema changes | `generate` + `migrate:run` | Tracked SQL files in git; production-safe |

**Deprecated/outdated:**
- Plasmo extension framework: Maintenance slowing, React-only, 10x larger bundles vs WXT
- `node-fetch` / `axios`: Bun has native `fetch` globally available

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Shopee product page selectors: `div[data-sqe="name"]`, `._3_ISdg`, etc. | Shopee Selector Research | 0/N fields captured; must re-inspect and update selectors.config.json |
| A2 | `data-sqe` attributes are more stable than obfuscated class names | Shopee Selector Research | data-sqe may also change; fallback class selectors needed |
| A3 | Price range format `฿290 - ฿500` with ` - ` separator | Normalization Pattern 6 | parsePrice returns null for differently formatted ranges |
| A4 | Thai abbreviation `พัน` = 1000, `แสน` = 100000, `ล้าน` = 1000000 | Normalization Pattern 6 | Thai locale numbers: this is standard Thai but could have variants |
| A5 | Shopee Thailand URL pattern `shopee.co.th/*` matches all product pages | WXT config content_matches | Shopee might use subdomains; would miss capture |
| A6 | Popup uses vanilla TypeScript (not React) for simplicity | Directory structure | If operator prefers React popup, WXT supports React template |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.
> This table is NOT empty — A1 and A2 are the highest-risk items and must be resolved before implementation.

---

## Open Questions

1. **Popup framework: vanilla TypeScript or React?**
   - What we know: WXT supports both. Project uses React (Next.js) for frontend.
   - What's unclear: Operator preference; React adds ~200KB to popup bundle.
   - Recommendation: Use vanilla TypeScript for popup (simpler, faster, smaller). If shared component library with dashboard is desired, revisit in Phase 4.

2. **WXT version: pin at 0.20.26 (CLAUDE.md) or use current 0.20.27?**
   - What we know: 0.20.27 is latest (released 2026-06-23). CLAUDE.md locks 0.20.26.
   - What's unclear: Whether 0.20.27 has any breaking changes relevant to this phase.
   - Recommendation: Use 0.20.26 as specified in CLAUDE.md (locked decision). The difference is a patch.

3. **Shopee mobile vs. desktop product page URL pattern?**
   - What we know: `shopee.co.th` is the desktop site; `m.shopee.co.th` is mobile.
   - What's unclear: Whether operators use mobile URLs in practice.
   - Recommendation: Target `*://shopee.co.th/*` for Phase 2. Add `*://m.shopee.co.th/*` if needed (config change only).

4. **Review form: use shadow DOM or plain DOM injection?**
   - What we know: Popup is in its own HTML context — no injection needed. Content script only reads DOM, does not inject UI (D-01).
   - Clarification: This is NOT an issue — popup is a separate HTML page, not injected into the Shopee page. No shadow DOM needed.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | Extension + backend build | ✓ | 1.3.14 | — |
| Node.js | npm view / WXT tooling | ✓ | v24.10.0 | — |
| Chrome (extension loading) | Live Shopee selector verification | [assumed ✓] | unknown | — |
| WXT (to be installed) | Extension scaffold | not yet | 0.20.26 target | — |
| Backend (Phase 1) | Capture endpoint target | ✓ | — | — |
| SQLite (bun:sqlite) | Drizzle upsert | ✓ | built-in bun 1.3.14 | — |
| Ollama | NOT needed in Phase 2 | n/a | — | — |

**Missing dependencies with no fallback:**
- Chrome browser (for live Shopee selector verification) — assumed present on operator machine but not probed programmatically.

**Missing dependencies with fallback:**
- WXT (needs `bun create wxt`) — install at Wave 0 task.

---

## Validation Architecture

> `workflow.nyquist_validation: true` — section required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `bun test` (built-in, no Jest) |
| Config file | `bunfig.toml` (existing in `backend/`) |
| Quick run command | `cd backend && bun test src/routes/products.test.ts` |
| Full suite command | `cd backend && bun test` |
| Extension tests | `cd extension && bun test` (after scaffold) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Notes |
|--------|----------|-----------|-------------------|-------|
| CAP-01 | Shopee DOM parsed into RawProduct | unit | `cd extension && bun test lib/parsers.test.ts` | Tests normalizer + parser with mock DOM |
| CAP-01 | N/N fields captured summary correct | unit | `cd extension && bun test lib/normalizer.test.ts` | Count null vs non-null fields |
| CAP-02 | POST /api/products/capture persists product | integration | `cd backend && bun test src/routes/products.test.ts` | Test with in-memory SQLite (existing pattern) |
| CAP-02 | Upsert updates existing row on same productUrl | integration | `cd backend && bun test src/routes/products.test.ts` | Insert twice, verify single row updated |
| CAP-03 | Null fields do not fail capture, stored as null | integration | `cd backend && bun test src/routes/products.test.ts` | Payload with null rating/reviewCount/salesCount |
| CAP-04 | Paste-URL creates basic product record | integration | `cd backend && bun test src/routes/products.test.ts` | Minimal payload: only platform + productUrl |
| CAP-05 | selectors.config.json parseable JSON | unit | `cd extension && bun test lib/selectors.test.ts` | JSON.parse + schema validation |
| D-09 | `parsePrice('฿290 - ฿500')` → 290 | unit | `cd extension && bun test lib/normalizer.test.ts` | All edge cases: range, k-abbrev, Thai |
| D-09 | `parseCount('12.3k')` → 12300 | unit | same as above | |
| D-09 | `parseCount('1.2พัน')` → 1200 | unit | same as above | |

### Sampling Rate
- **Per task commit:** `cd backend && bun test src/routes/products.test.ts`
- **Per wave merge:** `cd backend && bun test` + `cd extension && bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `extension/` — WXT scaffold does not exist; create via `bun create wxt@0.20.26 .`
- [ ] `backend/src/routes/products.test.ts` — does not exist yet; covers CAP-02, CAP-03, CAP-04
- [ ] `extension/lib/normalizer.test.ts` — does not exist; covers D-09 edge cases
- [ ] `extension/lib/parsers.test.ts` — does not exist; covers CAP-01 with mock document
- [ ] `backend/drizzle/0001_*.sql` — migration not yet generated; needed before any capture test

---

## Security Domain

> `security_enforcement` not set to false — section required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Not applicable — single-operator local tool, no multi-user auth |
| V3 Session Management | no | No sessions; extension communicates to localhost only |
| V4 Access Control | no | Single operator; backend bound to 127.0.0.1 (Phase 1) |
| V5 Input Validation | yes | Elysia TypeBox `t.Object` on POST body; Drizzle parameterized queries |
| V6 Cryptography | no | No new secrets in Phase 2 (FB token encryption is Phase 1) |
| V10 Malicious Code | yes | Extension content script: no eval, no innerHTML with raw DOM text; use textContent |

### Known Threat Patterns for Chrome MV3 + Elysia Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via product name in popup | Tampering | Use `textContent` / `innerText` not `innerHTML` when populating review form fields |
| DOM injection via crafted Shopee page | Tampering | Content script is ISOLATED world; no `eval()`; parse DOM values as strings only |
| Oversized payload to capture endpoint | DoS | TypeBox body validation rejects malformed types at Elysia layer |
| Shopee page injects fake data into extension | Spoofing | Extension runs in ISOLATED world; page cannot modify extension's globals |
| localhost endpoint reachable from other local apps | Elevation of Privilege | Backend already bound to 127.0.0.1 + CORS allowlist (Phase 1); capture endpoint same treatment |

**Note on CORS:** Phase 1 already allows `chrome-extension://` origins. The capture endpoint inherits this — no additional CORS work needed.

---

## Project Constraints (from CLAUDE.md)

- **Runtime:** Bun 1.3.14 — use `bun:sqlite`, `bun test`, `bun run dev`
- **Extension framework:** WXT 0.20.26 (Chrome MV3, Manifest V3-first)
- **HTTP framework:** Elysia 1.4.29 with TypeBox `t` for validation — never Zod
- **ORM:** Drizzle ORM 0.45.2 with `drizzle-orm/bun-sqlite` import path — never `better-sqlite3` or Prisma
- **Messaging:** `@webext-core/messaging` 3.0.2 — not raw `chrome.runtime.sendMessage`
- **Content scripts:** `world: 'ISOLATED'` (default) — no `MAIN` world access needed
- **Selectors:** `parsers/selectors.config.json` outside compiled bundle (D-06)
- **No external APIs:** Capture reads operator-opened pages only; no mass scraping
- **Localhost only:** Extension communicates to `http://localhost:3000` (or configured port) only
- **Migrations:** `drizzle-kit generate` + `migrate:run` — never `drizzle-kit push`
- **TypeScript:** All layers (extension, backend, frontend) share types via workspace
- **Test runner:** `bun test` — no Jest
- **No paid services:** Zero-cost stack; no external LLMs or APIs in Phase 2

---

## Sources

### Primary (HIGH confidence)
- `https://wxt.dev/guide/essentials/config/manifest.html` — host_permissions, web_accessible_resources configuration
- `https://wxt.dev/guide/essentials/entrypoints.html` — popup/content/background entrypoint definitions
- `https://wxt.dev/guide/essentials/assets.html` — public/ directory, runtime.getURL() for content scripts
- `https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/events` — synchronous listener registration requirement
- `https://developer.chrome.com/docs/extensions/develop/concepts/messaging` — sendMessage/onMessage async pattern, `return true` requirement
- `https://orm.drizzle.team/docs/insert#on-conflict-do-update` — onConflictDoUpdate upsert pattern
- `github.com/aklinker1/webext-core/packages/messaging README` — defineExtensionMessaging usage

### Secondary (MEDIUM confidence)
- npm registry: WXT 0.20.27 (latest; pin 0.20.26 per CLAUDE.md), `@webext-core/messaging` 3.0.2 — confirmed current via `npm view`
- Chrome for Developers: `https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts` — ISOLATED world, mixed-content context

### Tertiary (LOW confidence — Shopee selectors)
- Community scraping guides (kameleo.io, various) — confirm Shopee uses dynamic React DOM, frequent class name changes; NO verified current selectors found
- Training data — `data-sqe` attribute patterns, `._3Oj5_n` style classes; all marked [ASSUMED]; must be verified against live page

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm-verified versions; official docs for WXT and @webext-core/messaging
- Architecture: HIGH — MV3 patterns from Chrome official docs; Drizzle upsert from official docs
- Shopee selectors: LOW — training data only; live verification required
- Normalization helpers: MEDIUM — D-09 spec is clear; Thai abbreviations are well-documented locale knowledge
- Pitfalls: HIGH — sourced from official Chrome docs + ROADMAP documented pitfalls

**Research date:** 2026-06-25
**Valid until:** 2026-07-25 for stack/architecture; Shopee selectors valid until next Shopee frontend deploy (can be days)
