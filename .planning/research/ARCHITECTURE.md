# Architecture Research

**Domain:** Self-hosted browser-extension + localhost-backend + SQLite + dashboard (affiliate analytics tool)
**Researched:** 2026-06-23
**Confidence:** HIGH — all component boundaries and patterns verified against official MV3 docs, Elysia official docs, and authoritative community sources

---

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│  BROWSER (Chrome, Manifest V3)                                     │
│                                                                     │
│  ┌─────────────────────┐   ┌──────────────────────────────────┐    │
│  │  Content Script     │   │  Extension Popup (popup.html)    │    │
│  │  - Reads page DOM   │──▶│  - Shows capture status         │    │
│  │  - Sends message to │   │  - Triggers capture action      │    │
│  │    service worker   │   └──────────────────────────────────┘    │
│  └─────────────────────┘                                           │
│           │ chrome.runtime.sendMessage                              │
│           ▼                                                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Background Service Worker (background.ts)                   │  │
│  │  - Receives message from content script                      │  │
│  │  - Calls fetch() to http://localhost:3000/api/products/      │  │
│  │    capture (has host_permissions for localhost)              │  │
│  │  - Returns result to popup via sendResponse                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
                        │
                        │ HTTP POST (JSON)
                        ▼
┌────────────────────────────────────────────────────────────────────┐
│  BACKEND (Bun + Elysia)   localhost:3000                           │
│                                                                     │
│  ┌────────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  Routes            │  │  Services        │  │  Scheduler      │ │
│  │  /api/products/*   │  │  scoringService  │  │  postScheduler  │ │
│  │  /api/drafts/*     │──▶  draftService   │  │  (in-process    │ │
│  │  /api/posts/*      │  │  publishService  │  │   cron)         │ │
│  │  /api/results/*    │  │  ollamaService   │  └────────┬────────┘ │
│  │  /api/settings/*   │  │  resultService   │           │          │
│  └────────────────────┘  └────────┬────────┘           │          │
│                                   │                     │          │
└───────────────────────────────────┼─────────────────────┼──────────┘
                                    │                     │
              ┌─────────────────────┘                     │
              ▼                                           │ (scheduled)
┌─────────────────────────┐                              ▼
│  SQLite (single file)   │              ┌───────────────────────┐
│  - products             │              │  External APIs        │
│  - product_extras       │              │  Ollama (localhost)   │
│  - post_drafts          │              │  Facebook Graph API   │
│  - published_posts      │              └───────────────────────┘
│  - result_entries       │
│  - settings             │
└─────────────────────────┘
              ▲
              │ HTTP (fetch to /api/*)
              │
┌────────────────────────────────────────────────────────────────────┐
│  FRONTEND DASHBOARD (Next.js + React + Tailwind + Recharts)        │
│  localhost:3001                                                     │
│                                                                     │
│  /products       — ranked table, filter, compare                   │
│  /products/[id]  — detail, edit commission/link                    │
│  /drafts         — approval queue                                  │
│  /results        — manual result entry, trend charts               │
│  /settings       — score weights, FB token, tone, limits           │
└────────────────────────────────────────────────────────────────────┘
```

---

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| Content Script | Read DOM on product page; extract raw product fields using config-driven selectors; send parsed data to service worker via `chrome.runtime.sendMessage` | Service Worker (via message) |
| Background Service Worker | Receive message from content/popup; POST data to backend via `fetch()`; return success/error to popup | Content Script (message), Backend (HTTP POST) |
| Extension Popup | Trigger capture; show status feedback; read from `chrome.storage` for last-capture state | Service Worker (message), chrome.storage |
| Parser Modules | Per-platform DOM parsing logic (one file per platform); read selectors from `selectors.config.json` at runtime | Called by Content Script |
| Backend (Elysia routes) | Expose REST API; validate/normalize inputs; delegate to services | Services, SQLite |
| scoringService | Compute 0-100 promote-worthiness score from ProductExtra data using configurable weights | Called by productService |
| draftService | Generate captions via template or Ollama; store PostDraft in SQLite | ollamaService (optional), SQLite |
| ollamaService | Call Ollama HTTP API; enforce timeout; signal failure so draftService falls back to template | draftService |
| publishService | POST to Facebook Graph API; store fbPostId; log failures; queue retries | Facebook Graph API, SQLite |
| postScheduler | In-process cron; poll `approved` drafts with `scheduledAt <= now`; trigger publishService | publishService, SQLite |
| SQLite | Single-file persistent store; single-user; no external process | Backend services |
| Next.js Dashboard | Fetch all data from backend REST API; render ranked product table, draft queue, result entry, settings | Backend (HTTP GET/PUT/POST) |

---

## Recommended Project Structure

```
Affilytics/
├── extension/
│   ├── manifest.json               # MV3 config: host_permissions for localhost
│   ├── popup.html / popup.ts       # Extension popup UI + capture trigger
│   ├── content.ts                  # Content script: DOM reading + sendMessage
│   ├── background.ts               # Service worker: message handler + fetch to backend
│   ├── parsers/
│   │   ├── index.ts                # Parser factory: dispatch by platform URL
│   │   ├── shopee.ts               # Shopee DOM parser (Phase 2)
│   │   ├── lazada.ts               # Lazada parser (Phase 7)
│   │   ├── tiktok.ts               # TikTok parser (Phase 7)
│   │   └── selectors.config.json   # CSS selectors per platform (runtime-loaded)
│   └── styles/popup.css
│
├── backend/
│   └── src/
│       ├── index.ts                # Elysia app entry, plugin registration
│       ├── db/
│       │   ├── client.ts           # bun:sqlite connection + init
│       │   ├── schema.ts           # Table definitions + migrations
│       │   └── queries.ts          # Typed prepared statements
│       ├── routes/                 # Elysia plugins (one per resource)
│       │   ├── products.ts         # /api/products/*
│       │   ├── drafts.ts           # /api/drafts/*
│       │   ├── posts.ts            # /api/posts/*
│       │   ├── results.ts          # /api/results/*
│       │   └── settings.ts         # /api/settings/*
│       ├── services/               # Business logic, no Elysia dependency
│       │   ├── scoringService.ts   # Pure function: inputs → score 0-100
│       │   ├── draftService.ts     # Caption generation + state transitions
│       │   ├── ollamaService.ts    # Ollama HTTP client + timeout/fallback
│       │   ├── publishService.ts   # FB Graph API client + retry
│       │   └── resultService.ts    # Result CRUD
│       ├── scheduler/
│       │   └── postScheduler.ts    # node-cron / setInterval post dispatcher
│       ├── middleware/
│       │   └── cors.ts             # CORS headers for localhost
│       └── types/
│           └── domain.ts           # Shared TypeScript domain types
│
└── frontend/
    └── app/
        ├── page.tsx                # Dashboard home
        ├── products/page.tsx       # Ranked table + filter
        ├── products/[id]/page.tsx  # Product detail + edit
        ├── drafts/page.tsx         # Approval queue
        ├── results/page.tsx        # Manual result entry + charts
        └── settings/page.tsx       # Score weights, FB token
```

### Structure Rationale

- **extension/parsers/**: Isolating each platform parser prevents cross-platform breakage. The selector config is a separate JSON file so selectors can be patched without recompiling the extension — just update the JSON, reload the extension.
- **backend/routes/**: Each Elysia route file is a self-contained plugin with its own prefix. This matches Elysia's official recommended plugin architecture, enabling independent testing and clean separation.
- **backend/services/**: Services contain zero Elysia dependencies. Elysia docs explicitly recommend making non-request-dependent logic into static classes or functions — this makes the scoring formula, caption generation, and FB publish logic independently unit-testable.
- **backend/db/**: The `queries.ts` file holds typed prepared statements, keeping SQL out of services and preventing injection. The `schema.ts` handles migrations on startup.

---

## Architectural Patterns

### Pattern 1: MV3 Message-Passing for Localhost Fetch

**What:** Content scripts cannot fetch to localhost directly in MV3 (CORS isolation + privilege boundary). The correct pattern is: content script reads DOM → sends message to background service worker → service worker does the `fetch()` → sends result back.

**When to use:** Every time the extension needs to POST to the backend.

**Why this matters:** In Manifest V3, `XMLHttpRequest` is gone in service workers. All extension-to-backend communication must use `fetch()` from the privileged service worker context, with `"http://localhost/*"` declared in `host_permissions`. Listeners must be registered synchronously at the top level of `background.ts` — not inside async callbacks — or they will not fire when the service worker wakes from idle.

**Example:**
```typescript
// content.ts — runs on product page
chrome.runtime.sendMessage(
  { type: "CAPTURE_PRODUCT", data: parsedProduct },
  (response) => { showStatusInPopup(response.success) }
);

// background.ts — service worker (listeners MUST be synchronous at top level)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "CAPTURE_PRODUCT") {
    fetch("http://localhost:3000/api/products/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.data),
    })
      .then(r => r.json())
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // keep the channel open for async sendResponse
  }
});
```

**manifest.json requirement:**
```json
{
  "host_permissions": ["http://localhost/*"],
  "background": { "service_worker": "background.js" }
}
```

---

### Pattern 2: Config-Driven Selector Parsing

**What:** CSS selectors for each platform are stored in `selectors.config.json`, not hardcoded in parser files. The parser factory loads the config at runtime and dispatches to the correct platform parser. Updating selectors means editing one JSON file and reloading the extension — no rebuild, no republish.

**When to use:** Whenever a platform updates its DOM structure (frequent — e-commerce sites ship updates weekly).

**Trade-offs:** Bundled JSON requires extension reload to pick up changes (acceptable for a self-hosted tool). Remote config fetch would allow true hot-update but adds network dependency at parse time — not worth it here.

**Example:**
```typescript
// parsers/selectors.config.json
{
  "shopee": {
    "name": ".pdp-product-title",
    "price": ".pdp-price_type_normal",
    "discountPct": ".pdp-product-discount",
    "rating": ".shopee-rating-stars__stars-active",
    "reviewCount": ".product-rating-overview__filter",
    "salesCount": ".pdp-product-highlights__item"
  }
}

// parsers/index.ts — parser factory
import selectors from "./selectors.config.json";

export function parseCurrentPage(doc: Document, platform: Platform): RawProduct {
  const cfg = selectors[platform];
  return {
    name: doc.querySelector(cfg.name)?.textContent?.trim() ?? null,
    price: parsePrice(doc.querySelector(cfg.price)?.textContent),
    // ...remaining fields — null on failure, never throws
  };
}
```

---

### Pattern 3: PostDraft State Machine (Status Column + Guard Enforcement)

**What:** A `status` column on the `post_drafts` table encodes the lifecycle. All transitions are validated by the service layer before the SQL UPDATE executes. SQLite CHECK constraints enforce valid states at the DB level.

**When to use:** The entire caption drafting → FB publishing flow.

**The state machine:**
```
                   ┌──────────────────────────────┐
                   │                              │
[create draft] → draft → pending_approval → approved → published
                              │
                              └──→ rejected
```

**Transition rules:**
- `draft` → `pending_approval`: operator submits draft for review
- `pending_approval` → `approved`: operator approves
- `pending_approval` → `rejected`: operator rejects
- `approved` → `published`: publishService posts to FB Graph API and receives fbPostId
- `rejected` can be edited back to `draft`
- Only `approved` drafts can enter the publish flow (enforced at service layer, not just UI)

**Schema:**
```sql
CREATE TABLE post_drafts (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  caption_th TEXT NOT NULL,
  caption_en TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','pending_approval','approved','rejected','published')),
  scheduled_at INTEGER,  -- Unix timestamp, NULL = immediate
  drafted_at INTEGER NOT NULL,
  approved_at INTEGER,
  drafted_by TEXT NOT NULL  -- 'ollama' | 'template'
);
```

**TypeScript guard:**
```typescript
const VALID_TRANSITIONS: Record<DraftStatus, DraftStatus[]> = {
  draft: ["pending_approval"],
  pending_approval: ["approved", "rejected"],
  approved: ["published"],
  rejected: ["draft"],
  published: [],
};

function transitionDraft(current: DraftStatus, next: DraftStatus): void {
  if (!VALID_TRANSITIONS[current].includes(next)) {
    throw new Error(`Invalid transition: ${current} → ${next}`);
  }
}
```

---

### Pattern 4: Scoring Service as Pure Function

**What:** `scoringService.ts` is a pure function with no Elysia or DB dependencies. It takes normalized product data and a weights config object and returns a score 0-100. This matches Elysia's official recommendation to keep services decoupled from HTTP context.

**Why:** Scoring is the core business logic. Making it pure enables unit testing with edge cases (0 commission, all-zero inputs, extreme values) without any HTTP or DB setup.

**Formula:**
```typescript
export function computeScore(data: ProductScoringInput, weights: ScoreWeights): number {
  const { commissionPct, salesCount, maxSalesCount, rating, reviewCount, discountPct } = data;
  const w = weights;

  const components = {
    commission: (commissionPct / 100) * w.commission,
    popularity: (salesCount / (maxSalesCount || 1)) * w.popularity,
    rating: (rating / 5) * w.rating,
    reviews: (Math.min(reviewCount, 100) / 100) * w.reviews,
    discount: (discountPct / 100) * w.discount,
  };

  const totalWeight = Object.values(w).reduce((a, b) => a + b, 0);
  const rawScore = Object.values(components).reduce((a, b) => a + b, 0);

  return totalWeight === 0 ? 0 : Math.round((rawScore / totalWeight) * 100);
}
```

---

### Pattern 5: Elysia Route-as-Plugin with Feature-Scoped Files

**What:** Each resource (products, drafts, posts, results, settings) is its own Elysia plugin with a self-contained prefix. The main `index.ts` mounts plugins. This is Elysia's officially recommended structure.

**Example:**
```typescript
// routes/products.ts
import Elysia, { t } from "elysia";
import { productService } from "../services/productService";

export const productsPlugin = new Elysia({ prefix: "/api/products" })
  .post("/capture", ({ body }) => productService.capture(body), {
    body: t.Object({ platform: t.String(), name: t.String(), /* ... */ }),
  })
  .get("/", () => productService.list())
  .put("/:id/extra", ({ params, body }) => productService.updateExtra(params.id, body));

// index.ts
const app = new Elysia()
  .use(corsPlugin)
  .use(productsPlugin)
  .use(draftsPlugin)
  // ...
  .listen(3000);
```

---

## Data Flow

### Flow 1: Product Capture (Extension → Backend → SQLite → Dashboard)

```
Operator opens Shopee product page
    ↓
content.ts reads DOM with selectors from selectors.config.json
    ↓
chrome.runtime.sendMessage({ type: "CAPTURE_PRODUCT", data: rawProduct })
    ↓
background.ts service worker wakes; fetch() POST /api/products/capture
    ↓
Elysia productsPlugin validates body (TypeBox schema)
    ↓
productService.capture() normalizes data → inserts Product into SQLite
    ↓
scoringService.computeScore() called (if commissionPct known) → updates ProductExtra
    ↓
Backend returns { success: true, productId }
    ↓
Popup displays "Captured: [product name]"
    ↓
Frontend dashboard /products fetches GET /api/products → displays updated table
```

### Flow 2: Caption Drafting + Publishing (Backend → Ollama/Template → FB Graph)

```
Operator clicks "Draft Caption" on /products/[id]
    ↓
POST /api/drafts { productId, tone }
    ↓
draftService: load product + productExtra from SQLite
    ↓
if settings.draftMode === "ollama":
    ollamaService.generate(prompt, timeout=30s)
    if timeout/error → fall back to template, notify operator
else:
    buildTemplateCaption(product, tone)
    ↓
Append affiliate URL + " #ad" to caption
    ↓
Insert PostDraft with status="draft"
    ↓
Operator reviews in /drafts, clicks "Approve"
    ↓
PUT /api/drafts/:id/status { status: "approved" }
    ↓
draftService validates transition (draft/pending_approval → approved)
    ↓
If scheduledAt set: postScheduler picks it up at scheduled time
If immediate: POST /api/posts/publish { draftId }
    ↓
publishService: fetch() POST to Facebook Graph API /me/feed
    ↓
Success: insert PublishedPost (fbPostId), update draft status → "published"
Failure: log error, leave status "approved", increment retry_count; scheduler retries
```

### Flow 3: Score Recalculation After Commission/Link Edit

```
Operator edits commission % on /products/[id]
    ↓
PUT /api/products/:id/extra { commissionPct, affiliateUrl }
    ↓
productService.updateExtra() → updates ProductExtra in SQLite
    ↓
scoringService.computeScore() with new commissionPct → updates score column
    ↓
Frontend re-fetches /api/products → table re-ranks
```

---

## Integration Points

### External Services

| Service | Integration Pattern | Key Constraint |
|---------|---------------------|----------------|
| Facebook Graph API | REST POST from publishService; token stored encrypted in SQLite | Token expires ~60 days; must re-auth; rate limit: 200 calls/hour/user |
| Ollama (localhost) | HTTP POST to `localhost:11434/api/generate`; 30s timeout | CPU-only on this machine; Qwen 2.5 model; must be running separately; fallback to template if down |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Content Script → Service Worker | `chrome.runtime.sendMessage` / `sendResponse` | Async; listener must be registered synchronously at top of background.ts; return `true` to keep channel open |
| Service Worker → Backend | `fetch()` HTTP POST over localhost | Requires `"http://localhost/*"` in `host_permissions`; CORS headers on backend |
| Backend Routes → Services | Direct TypeScript function calls | Services are pure functions or static classes — no Elysia coupling |
| Backend → SQLite | `bun:sqlite` prepared statements | Synchronous API available in Bun; use prepared statements for all queries |
| Frontend → Backend | `fetch()` HTTP to localhost:3000 | Use a lib/api.ts wrapper with typed responses; no auth needed (localhost-only) |
| postScheduler → publishService | Direct in-process function call | Cron runs in same Bun process; no message queue needed for single-user |

---

## Build Order (Dependency-Driven)

The build order flows from the most foundational (nothing depends on this yet) to the most dependent:

| Phase | What to Build | Why This Order |
|-------|---------------|----------------|
| 1 | Backend skeleton: Bun + Elysia setup, SQLite schema (`products`, `product_extras`, `post_drafts`, `published_posts`, `result_entries`, `settings`), `/api/settings` endpoint, FB token encryption | Everything else writes to this DB and hits this API. No phase can be tested without it. |
| 2 | Chrome extension (Shopee parser only): MV3 manifest, content.ts, background.ts, popup.html, `selectors.config.json` for Shopee, `POST /api/products/capture` endpoint | Extension is the only product data input. The scorer, dashboard, and drafts need real data. One platform first proves the architecture before multiplying. |
| 3 | Commission/link editing + scoring: `PUT /api/products/:id/extra`, `scoringService.ts`, score recalculation on save | Score is the core value. Dashboard is useless without it. Pure function — easy to unit-test in isolation. |
| 4 | Frontend dashboard: Next.js setup, `/products` ranked table with filter/sort, `/products/[id]` edit view, Recharts for trend visualization | Core value delivery. At this point the full capture → score → rank loop works end-to-end. |
| 5 | Caption drafting: template engine first, then Ollama integration with fallback, draft approval state machine, `/api/drafts/*` endpoints, draft queue UI at `/drafts` | Templates make this shippable immediately; Ollama is an enhancement layered on top. State machine enforces approval gate before publishing. |
| 6 | Facebook publishing: OAuth connect in settings, `publishService.ts`, `POST /api/posts/publish`, `postScheduler.ts` in-process cron, retry logic, rate guard | Requires approved drafts from Phase 5. Most complex external integration — isolate it. |
| 7 | Manual result tracking: `ResultEntry` schema + CRUD, `/api/results/*`, `/results` page with Recharts actual-vs-predicted chart | Depends on Phase 6 having published posts to track. Validates scoring weights. |
| 8 | Expand parsers: Lazada parser, TikTok parser, add to selector config and parser factory | Only after architecture is proven with Shopee. Each new parser is low-risk after the factory pattern is established. |

---

## Anti-Patterns

### Anti-Pattern 1: Fetching from Content Script Directly

**What people do:** Call `fetch("http://localhost:3000/...")` inside `content.ts`.

**Why it's wrong:** Content scripts run in an isolated world without elevated privileges. The request either fails silently (CORS) or is blocked. MV3 removed the DOM-based `XMLHttpRequest` workaround. This is a hard architectural constraint, not a configuration fix.

**Do this instead:** Send a message to the background service worker via `chrome.runtime.sendMessage`. The service worker has `host_permissions` and performs the fetch.

---

### Anti-Pattern 2: Hardcoding CSS Selectors in Parser Files

**What people do:** Embed selectors as string literals inside `shopee.ts` (e.g., `const name = doc.querySelector('.pdp-product-title-text')`).

**Why it's wrong:** E-commerce sites update their DOM structure frequently. Hardcoded selectors require recompiling and reloading the extension every time a site changes, which can break the tool overnight with no easy fix path.

**Do this instead:** Store all selectors in `selectors.config.json`. Parser files call `selectors[platform].fieldName`. Fixing a broken selector means editing one JSON file and pressing "Reload" in chrome://extensions.

---

### Anti-Pattern 3: Allowing Direct Publish Without Approval Gate

**What people do:** Wire a "Generate + Post" button that goes straight from draft → published in one action.

**Why it's wrong:** The approval gate (draft → pending_approval → approved → published) is a compliance safeguard. Skipping it removes the operator's chance to review captions for accuracy, inappropriate content, or incorrect affiliate links before they appear publicly on the Facebook Page.

**Do this instead:** Enforce the state machine transition check in the service layer, not just the UI. A `PUT /api/drafts/:id/status { status: "published" }` must be rejected — only `{ status: "approved" }` is a valid precursor, and `publishService` must verify status === "approved" before calling FB Graph API.

---

### Anti-Pattern 4: Business Logic Inside Elysia Route Handlers

**What people do:** Write scoring calculations, caption template rendering, or FB API calls inside the Elysia `handler` function directly.

**Why it's wrong:** Logic inside route handlers is coupled to HTTP context, making it impossible to unit-test without spinning up an HTTP server. It also prevents reuse (e.g., scheduler calling publishService without a mock HTTP request).

**Do this instead:** Keep all business logic in service files that have no Elysia imports. Routes validate input (TypeBox) and call service functions. This matches Elysia's official recommendation: services that don't need HTTP context should be static classes or plain functions.

---

### Anti-Pattern 5: Using Global Variables in the Service Worker for State

**What people do:** Store last-captured product or session tokens in module-level variables in `background.ts`.

**Why it's wrong:** MV3 service workers are terminated when idle and can restart at any time. Module-scope variables are wiped on every restart. On the next wake, your state is gone.

**Do this instead:** Persist any state the service worker needs across invocations in `chrome.storage.local` (for extension-internal state like the last capture timestamp). One-shot request state can live in local variables since the service worker stays alive for the duration of a single event handler.

---

## Scaling Considerations

This is a single-operator, self-hosted tool. Scaling beyond one user is explicitly out of scope. The relevant "scale" is number of products captured, not number of users.

| Concern | At 100 products | At 1000+ products |
|---------|----------------|-------------------|
| SQLite reads | No issue — reads are fast and synchronous in bun:sqlite | Add indexes on `score DESC`, `platform`, `captured_at`. Still fine. |
| Score recalculation | Recalculate one product on edit — instant | If weights change, recalculate all: `UPDATE product_extras SET score = computeScore(...)` — run as a background job, acceptable for single-user |
| Ollama caption gen | One draft at a time on CPU, ~10-30s per draft | No change needed — single-user, batch drafting works fine |
| FB post queue | Daily post limit (5-10 posts/day is typical) — in-process cron is sufficient | Never becomes a bottleneck for single-user affiliate use |

---

## Sources

- [Chrome MV3 — Migrate to Service Workers (official)](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers)
- [Chrome Extensions — CORS in MV3 (Reintech)](https://reintech.io/blog/cors-chrome-extensions)
- [Fetch Data in Chrome Extension V3 (Medium)](https://javascript.plainenglish.io/fetch-data-in-chrome-extension-v3-2b73719ffc0e)
- [Elysia Best Practices (official)](https://elysiajs.com/essential/best-practice)
- [Vertical Slicing & Clean Architecture for Elysia (GitHub Gist)](https://gist.github.com/RezaOwliaei/477ed74fc77aa5df2a854789538dd79d)
- [bun-elysia-drizzle-sqlite reference implementation (GitHub)](https://github.com/remuspoienar/bun-elysia-drizzle-sqlite)
- [Use your database to power state machines (Lawrence Jones)](https://blog.lawrencejones.dev/state-machines/)
- [Next.js — Backend for Frontend (official)](https://nextjs.org/docs/app/guides/backend-for-frontend)

---
*Architecture research for: Affilytics — self-hosted affiliate analytics tool*
*Researched: 2026-06-23*
