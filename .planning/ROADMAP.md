# Roadmap: Affilytics

## Overview

Affilytics is built as eight dependency-ordered vertical slices. We start with a thin backend + SQLite foundation (Phase 1) that establishes the schema, encryption, and FB-settings base everything else writes to. Then each phase adds an end-to-end operator capability: capture a Shopee product (Phase 2), score it with commission and links (Phase 3), rank and compare in a dashboard (Phase 4 — core value visible), draft and approve captions (Phase 5), publish to Facebook (Phase 6), track real results against predicted scores (Phase 7), and finally broaden capture to Lazada and TikTok (Phase 8). Critical architectural constraints surfaced by research — MV3 mixed-content, SQLite WAL, Ollama fallback, and the Meta App Review lead time — are pinned to the phases that must handle them.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Backend Foundation** - Bun+Elysia+SQLite base, full schema, encrypted FB token, Page connect (verification 2026-06-24: gaps found — gap closure pending) (completed 2026-06-24)
- [ ] **Phase 2: Product Capture (Shopee)** - MV3 extension captures a Shopee product into the backend
- [ ] **Phase 3: Scoring, Commission & Links** - weighted promote-worthiness score with tunable weights
- [ ] **Phase 4: Dashboard** - ranked/filterable product table + multi-product comparison
- [ ] **Phase 5: Captions & Approval** - template/Ollama caption drafting with #ad + approval queue
- [ ] **Phase 6: Facebook Publishing** - publish/schedule to FB Page with retry and rate guard
- [ ] **Phase 7: Result Tracking** - manual result entry + actual-vs-predicted score chart
- [ ] **Phase 8: Parser Expansion** - Lazada then TikTok capture

## Phase Details

### Phase 1: Backend Foundation

**Goal**: Stand up the localhost Bun+Elysia backend with a SQLite database (WAL + busy_timeout), the full schema for every core entity, an encrypted Facebook token column, and a settings flow to connect a Facebook Page.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, SET-01
**Success Criteria** (what must be TRUE):

  1. Backend starts on localhost and responds to a health/API request
  2. SQLite opens in WAL mode with busy_timeout set, and tables exist for Product, ProductExtra, PostDraft, PublishedPost, ResultEntry, Page, and Setting
  3. Operator can connect a Facebook Page via OAuth and the access token is stored encrypted at rest (AES-256-GCM), never returned in plaintext by any API
  4. API is reachable only over localhost

**Plans**: 5 plans (3 original + 2 gap-closure)

Notes: Set `PRAGMA journal_mode=WAL` + `PRAGMA busy_timeout=5000` at connection open (research pitfall #5 — retrofitting needs a migration). Encryption key from `BUN_ENCRYPTION_KEY` env var; fail fast at startup if missing. Use Drizzle ORM on `drizzle-orm/bun-sqlite`.

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Wave 0: backend Bun scaffold + all 8 VALIDATION.md test files (RED) + FB fetch mock
- [x] 01-02-PLAN.md — Wave 1: 7-entity Drizzle schema, WAL+busy_timeout DB client, tracked migration generate+apply, AES-256-GCM crypto, env fail-fast

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-03-PLAN.md — Wave 2: 127.0.0.1+CORS boot, health route, FB-connect settings (verify→encrypt→store, no token leak, disconnected state), idempotent seed, setup script

**Gap Closure** *(verification 2026-06-24: 4 gaps — wave 0, independent)*

- [x] 01-04-PLAN.md — fix broken dev script (Gap 1), stop in-memory test-DB disk leak + gitignore + remove leaked files (Gap 2), import.meta.main listen guard + collapse double-migrate (Gap 3)
- [x] 01-05-PLAN.md — Facebook OAuth Page-connect flow in Dev Mode (Gap 4 / SC-3): authorize+callback, CSRF state, code→Page-token exchange, encrypt-at-rest, manual paste fallback kept; App Review stays Phase 5

### Phase 2: Product Capture (Shopee)

**Goal**: Ship a Chrome MV3 extension (WXT) that reads a Shopee product page via config-driven selectors and sends the data through the background service worker to a backend capture endpoint, with graceful handling of missing fields and a URL-paste fallback.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: CAP-01, CAP-02, CAP-03, CAP-04, CAP-05
**Success Criteria** (what must be TRUE):

  1. Operator opens a Shopee product page, clicks the extension, and name/price/discount/rating/reviewCount/salesCount/shop/URL are captured and stored in the backend
  2. Fields that cannot be read are stored empty (not failed) and the popup shows an "N/N fields captured" summary
  3. Operator can paste a product URL to create a basic product record
  4. Shopee CSS selectors live in an editable config file that can be changed without rebuilding core logic

**Plans**: 5 plans (4 waves)

Notes: Content script MUST NOT fetch localhost directly (mixed-content block) — route via `chrome.runtime.sendMessage` → background `fetch()` (research pitfall #1). Register `onMessage` synchronously at top level of `background.ts` (pitfall #2). Use `MutationObserver` with timeout for Shopee's async/SPA DOM (pitfall #6). Declare `"http://localhost/*"` in host_permissions. Research-flag: validate selectors against a live Shopee page at plan time.

Plans:
**Wave 0** *(prerequisites)*

- [ ] 02-01-PLAN.md — WXT scaffold + RED test scaffolds + live Shopee selector verification (research flag)

**Wave 1** *(parallel: backend + extension utils)*

- [ ] 02-02-PLAN.md — backend capture endpoint + UNIQUE(product_url) migration + upsert (CAP-02/03/04)
- [ ] 02-03-PLAN.md — D-09 normalizer + typed @webext-core messaging protocol (CAP-01)

**Wave 2** *(blocked on Wave 1)*

- [ ] 02-04-PLAN.md — Shopee parser (MutationObserver) + content script runtime selector load (CAP-01/03/05)

**Wave 3** *(blocked on Wave 1+2)*

- [ ] 02-05-PLAN.md — background SW + popup UI 5-state flow + manual round-trip verify (CAP-01/02/03/04)

### Phase 3: Scoring, Commission & Links

**Goal**: Compute the weighted 0-100 promote-worthiness score from normalized product data, let the operator enter commission % and affiliate links per product, and make the score weights tunable in settings so scores recompute on change.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: SCORE-01, SCORE-02, SCORE-03, SCORE-04, LINK-01, LINK-02, LINK-03, SET-02
**Success Criteria** (what must be TRUE):

  1. Operator enters a commission % and the product receives a 0-100 score derived from commission, sales/popularity, rating, reviews, and discount
  2. Operator adjusts score weights in settings and existing product scores recompute accordingly
  3. Operator can paste an affiliate URL (format-validated) stored with the product and copy it with one click
  4. Operator can add an optional campaign tag/note per product
  5. A product with no commission entered shows a clear "enter commission" state rather than a misleading score

**Plans**: TBD

Notes: `scoringService` is a pure function with no Elysia/DB imports (independently unit-testable). Default weights balanced (per Key Decision). Address the zero-score UX before the dashboard (pitfall #6/scoring).

Plans:

- [ ] 03-01: TBD

### Phase 4: Dashboard

**Goal**: Deliver the Next.js dashboard that surfaces the core value — a ranked, filterable product table, a multi-product side-by-side comparison view, and visibility into draft/approval/post status.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: DASH-01, DASH-02, DASH-03
**Success Criteria** (what must be TRUE):

  1. Operator sees a product table ranked by score, sortable and filterable by score, platform, price range, and rating
  2. Operator can select multiple products and view them side by side
  3. Operator can see each product's draft / approval-queue / published-post status

**Plans**: TBD

Notes: Next.js App Router + Tailwind + Recharts; every Recharts-importing component needs `'use client'` (research pitfall). Client-side fetch to localhost backend. DASH-04 (results summary) lands in Phase 7 once result data exists.

Plans:

- [ ] 04-01: TBD

### Phase 5: Captions & Approval

**Goal**: Generate Thai+English captions from product data and tone (template first, Ollama as an upgrade with fallback), auto-append the affiliate link and #ad disclosure, and gate everything behind an approval state machine. Submit Meta App Review at the end of this phase.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: DRAFT-01, DRAFT-02, DRAFT-03, DRAFT-04, APPR-01, APPR-02
**Success Criteria** (what must be TRUE):

  1. Operator generates an editable Thai+English caption from a product and chosen tone, via template or Ollama
  2. Generated captions automatically include the affiliate link and an #ad disclosure
  3. When Ollama times out or is unavailable, drafting falls back to the template and notifies the operator
  4. A draft moves through draft → pending_approval → approved/rejected, and only approved drafts can be published

**Plans**: TBD

Notes: Build and prove the template path before enabling Ollama. Set `OLLAMA_KEEP_ALIVE=24h`, 120s AbortController timeout, template fallback on any error (pitfall #4). Enforce the state machine at the service layer + a SQLite CHECK constraint. **At end of phase: submit Meta App Review for `pages_manage_posts` Advanced Access** to absorb the 5–15 business-day lead time before Phase 6 (pitfall #3).

Plans:

- [ ] 05-01: TBD

### Phase 6: Facebook Publishing

**Goal**: Publish approved drafts to the Facebook Page immediately or on a schedule via the Graph API, storing fbPostId, retrying and logging failures, enforcing a daily post limit, and surfacing token health.
**Mode:** mvp
**Depends on**: Phase 5 (approval gate + submitted App Review)
**Requirements**: PUB-01, PUB-02, PUB-03
**Success Criteria** (what must be TRUE):

  1. Operator publishes an approved draft immediately or schedules it, and it appears on the Facebook Page
  2. A successful publish stores the fbPostId; a failure is retried and logged
  3. A daily post-limit rate guard blocks posting beyond the configured number per day
  4. The settings/health view shows token validity and warns ahead of data-access expiry

**Plans**: TBD

Notes: 3-step token exchange (short-lived user → long-lived → non-expiring Page token). Raw `fetch` to Graph API (no FB SDK). Scheduling via `published=false` + `scheduled_publish_time`. croner for the in-process scheduler. Store `data_access_expiration_time` and warn ~80 days (pitfall #3). Research-flag: re-verify current permission/App-Review requirements at plan time.

Plans:

- [ ] 06-01: TBD

### Phase 7: Result Tracking

**Goal**: Let the operator manually enter clicks/orders/commission per product or campaign, view history, and compare actual results against the predicted promote-worthiness score — closing the feedback loop for weight tuning.
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: TRACK-01, TRACK-02, DASH-04
**Success Criteria** (what must be TRUE):

  1. Operator enters clicks/orders/commission per product or campaign and the entry is stored with history
  2. Operator views a chart comparing actual results against the predicted score over time
  3. Dashboard shows a summary of manually-entered results (revenue / trends)

**Plans**: TBD

Notes: This is the R-3 mitigation — actual-vs-predicted data is what justifies adjusting score weights later. Recharts comparison chart.

Plans:

- [ ] 07-01: TBD

### Phase 8: Parser Expansion

**Goal**: Extend capture beyond Shopee to Lazada and then TikTok, reusing the proven config-driven parser pattern from Phase 2.
**Mode:** mvp
**Depends on**: Phase 2 (parser pattern), Phase 7 (MVP complete)
**Requirements**: PARSE-01, PARSE-02
**Success Criteria** (what must be TRUE):

  1. Operator can capture a Lazada product page into the backend with the same fields as Shopee
  2. Operator can capture a TikTok product page into the backend
  3. New platform selectors are added via the config file without changing the parser factory

**Plans**: TBD

Notes: Lazada first (simpler), TikTok second (heavy lazy-load — treat as its own research spike, pitfall #6). Additive only; the MV3 message-passing architecture is already proven.

Plans:

- [ ] 08-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Backend Foundation | 5/5 | Complete   | 2026-06-24 |
| 2. Product Capture (Shopee) | 0/TBD | Not started | - |
| 3. Scoring, Commission & Links | 0/TBD | Not started | - |
| 4. Dashboard | 0/TBD | Not started | - |
| 5. Captions & Approval | 0/TBD | Not started | - |
| 6. Facebook Publishing | 0/TBD | Not started | - |
| 7. Result Tracking | 0/TBD | Not started | - |
| 8. Parser Expansion | 0/TBD | Not started | - |
