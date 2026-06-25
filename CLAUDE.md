# Affilytics — Developer Guide

## Project Overview

**Affilytics** is an affiliate product analytics and management tool designed to help content creators analyze products from e-commerce platforms (Shopee, Lazada, TikTok) and decide which ones are worth promoting. It combines a browser extension for product data capture with a local backend that scores products, manages affiliate links, drafts captions, and publishes to Facebook.

## Conversation Guidelines

- Always respond in Thai (TH).
- Always ask in Thai (TH).
- Never answer in English (EN).

### What Problem Does It Solve?

When running an affiliate business on social media, creators spend time manually evaluating products:
- Comparing prices, ratings, and sales numbers across items
- Deciding which products offer the best ROI for promotion
- Creating and managing affiliate links
- Drafting captions and scheduling posts to Facebook
- Tracking actual performance (clicks, orders, commissions)

Affilytics automates the "pre-posting decision pipeline": capture product data with one click → get a value score → attach affiliate links → draft captions → publish to Facebook → track results.

### Key Philosophy

- **Zero-cost**: All components are free/open-source (Ollama, Bun, SQLite, etc.). No paid API subscriptions.
- **Privacy-first**: Data comes only from pages the user opens themselves; no mass scraping.
- **Self-hosted**: Runs entirely on the operator's machine (~32GB RAM, Ryzen 5 1600X).
- **Compliance-minded**: Products data is manually entered; affiliate links are operator-created; disclosure (#ad) is automatic.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Browser Extension** | Chrome/Firefox (Manifest V3) | Content scripts parse DOM on Shopee/Lazada/TikTok |
| **Backend API** | TypeScript + Elysia (Bun) | Lightweight, fast, runs on localhost |
| **Database** | SQLite | Single-file, embedded, no external DB needed |
| **Frontend Dashboard** | Next.js + React + Tailwind CSS + Recharts | Real-time product comparison and ranking |
| **Scheduler** | In-process Node.js cron | Schedules Facebook posts, retries failed uploads |
| **AI/NLP** | Ollama (local) + Qwen 2.5 model | Caption generation; falls back to templates if model unavailable |
| **Social Publishing** | Facebook Graph API | Posts to owned Facebook page only |

### No External Dependencies

- ❌ No Affiliate Networks (Involve Asia, AccessTrade, etc.)
- ❌ No third-party APIs for product data
- ❌ No web scraping infrastructure
- ❌ No paid LLM services

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser Extension (Content Script)                         │
│  - Injects UI overlay on Shopee/Lazada/TikTok             │
│  - Parses DOM to extract: name, price, rating, etc.       │
│  - Sends data to http://localhost via fetch               │
└──────────────────┬──────────────────────────────────────────┘
                   │ HTTP POST /api/products/capture
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend (Elysia + Bun)                                     │
│  - Receives product data from extension                     │
│  - Normalizes & validates data                             │
│  - Stores in SQLite                                        │
│  - Computes ProductScore (weighted formula)                │
│  - Hosts REST API for frontend                             │
│  - In-process scheduler for FB posts                       │
│  - Integration: Facebook Graph API (POST requests)         │
└──────────────────┬──────────────────────────────────────────┘
                   │
         ┌─────────┴──────────┐
         ▼                    ▼
    ┌─────────────┐    ┌──────────────┐
    │  SQLite DB  │    │ Ollama Local │
    │  (products, │    │ (caption gen)│
    │   drafts,   │    └──────────────┘
    │   posts)    │
    └─────────────┘
         ▲
         │
    ┌────┴────────────────────────────────┐
    │  Frontend Dashboard (Next.js)       │
    │  - List/sort/filter products by     │
    │    score, commission, platform      │
    │  - Edit commission & affiliate URL  │
    │  - Draft/approve/schedule posts     │
    │  - View published posts & results   │
    └─────────────────────────────────────┘
```

### Data Flow

1. **Product Capture** → Extension reads open page → sends to backend
2. **Scoring** → Backend normalizes data + applies weights → ProductScore
3. **Management** → Frontend allows editing commission % & affiliate URL
4. **Caption Drafting** → Backend calls Ollama or uses template → stores draft
5. **Approval Queue** → Draft sits in "pending approval" state
6. **Publishing** → Operator approves → backend posts via Facebook Graph API
7. **Result Tracking** → Operator manually logs clicks/orders/commission from FB dashboard

---

## Core Domain Model

### Entities

#### Product
```
{
  id: string (UUID)
  platform: "shopee" | "lazada" | "tiktok"
  name: string
  price: number
  discountPct: number (0-100)
  rating: number (0-5)
  reviewCount: number
  salesCount: number
  shop: string
  productUrl: string (original link)
  capturedAt: Date
}
```

#### ProductExtra
```
{
  productId: string (FK → Product)
  commissionPct: number (0-100, set by operator)
  affiliateUrl: string (operator-created link)
  campaignTag?: string (for tracking in FB dashboard)
  score: number (computed, 0-100)
  scoreBreakdown?: {
    commissionWeight: number
    popularityWeight: number
    ratingWeight: number
    reviewWeight: number
    discountWeight: number
  }
}
```

#### PostDraft
```
{
  id: string
  productId: string (FK)
  captionTH: string
  captionEN: string
  status: "draft" | "pending_approval" | "approved" | "rejected" | "published"
  scheduledAt?: Date
  draftedAt: Date
  approvedAt?: Date
  draftedBy: string (Ollama or "template")
}
```

#### PublishedPost
```
{
  id: string
  draftId: string (FK)
  fbPostId: string (from Facebook Graph API response)
  publishedAt: Date
  publishedUrl?: string
}
```

#### ResultEntry
```
{
  id: string
  productId: string (or campaignTag)
  clicks: number (manual entry)
  orders: number (manual entry)
  commission: number (manual entry, THB)
  enteredAt: Date
  notes?: string
}
```

#### PageSettings
```
{
  fbPageId: string
  accessTokenEnc: string (encrypted)
  scoreWeights: {
    commission: number
    popularity: number
    rating: number
    reviews: number
    discount: number
  }
  draftMode: "ollama" | "template"
  dailyPostLimit: number
  defaultTone: "casual" | "formal" | "fun"
}
```

---

## Architecture Patterns & Conventions

### 1. **Platform-Agnostic Parser Design**

Each e-commerce platform (Shopee, Lazada, TikTok) has its own DOM structure. Parsers are:
- **Isolated**: Each in a separate file under `extension/parsers/{platform}.ts`
- **Config-driven**: CSS selectors stored in `extension/parsers/selectors.config.json` (not hardcoded)
- **Graceful fallback**: Missing fields → return empty/null, don't crash
- **Versioned**: Selectors can be updated without redeploying extension

**Example selector config structure:**
```json
{
  "shopee": {
    "name": ".product-name",
    "price": ".price-current",
    "discountPct": ".discount-badge",
    "rating": ".rating-score",
    "reviewCount": ".review-count",
    "salesCount": ".sold-count"
  }
}
```

### 2. **Scoring Function (Core Business Logic)**

Located in `backend/services/scoringService.ts`:
- Takes normalized `ProductExtra` data
- Applies configurable weights
- Returns 0-100 score

**Formula:**
```
score = (
  commissionPct * weight.commission +
  (salesCount / maxSalesCount) * weight.popularity +
  (rating / 5) * weight.rating +
  min(reviewCount, 100) / 100 * weight.reviews +
  (discountPct / 100) * weight.discount
) / sum(weights)
```

Weights are user-configurable in settings, allowing tuning per operator preference.

### 3. **Extension ↔ Backend Communication**

- **Protocol**: HTTP only (localhost:3000 or configured port)
- **Security**: CORS disabled for localhost; tokens/secrets never leave machine
- **Format**: JSON POST/PUT/GET
- **Endpoints**:
  - `POST /api/products/capture` — extension sends raw product data
  - `GET /api/products` — frontend fetches products
  - `PUT /api/products/:id/extra` — update commission/link
  - `POST /api/drafts` — create caption draft
  - `POST /api/posts/publish` — publish to Facebook

### 4. **State Machine for Post Lifecycle**

```
draft → pending_approval → approved → published
              ↓
           rejected
```

- Only `approved` posts can transition to `published`
- Operator must manually review before approval (compliance safety)
- Failed FB posts remain in `approved` with retry log

### 5. **Fallback & Error Handling**

- **Ollama unavailable** → use template instead, notify user
- **Selector fails on page** → mark field as empty, show warning in form
- **Facebook post fails** → log error, queue for retry, alert operator
- **Invalid affiliate link** → validate URL format before save, show error

### 6. **Encryption for Secrets**

- Facebook access token stored encrypted in SQLite
- Encryption key derived from operator password or env variable
- Never logged or exposed in API responses

---

## Directory Structure

### Expected Layout (Post-Implementation)

```
Affilytics/
├── extension/
│   ├── manifest.json              # Manifest V3 config
│   ├── popup.html                 # Popup UI
│   ├── popup.ts                   # Popup logic
│   ├── content.ts                 # Content script injected on pages
│   ├── background.ts              # Service worker
│   ├── parsers/
│   │   ├── index.ts               # Parser factory
│   │   ├── shopee.ts              # Shopee DOM parser
│   │   ├── lazada.ts              # Lazada DOM parser
│   │   ├── tiktok.ts              # TikTok DOM parser
│   │   └── selectors.config.json   # CSS selectors (configurable)
│   └── styles/
│       └── popup.css
│
├── backend/
│   ├── src/
│   │   ├── index.ts               # Elysia app entry point
│   │   ├── db/
│   │   │   ├── schema.ts          # SQLite schema/migrations
│   │   │   ├── client.ts          # DB connection & init
│   │   │   └── queries.ts         # Prepared queries
│   │   ├── services/
│   │   │   ├── productService.ts   # Create/update products
│   │   │   ├── scoringService.ts   # Score computation
│   │   │   ├── draftService.ts     # Caption draft logic
│   │   │   ├── publishService.ts   # FB Graph API integration
│   │   │   ├── ollamaService.ts    # Ollama API client
│   │   │   └── resultService.ts    # Result tracking
│   │   ├── routes/
│   │   │   ├── products.ts         # /api/products/* endpoints
│   │   │   ├── drafts.ts           # /api/drafts/* endpoints
│   │   │   ├── posts.ts            # /api/posts/* endpoints
│   │   │   ├── results.ts          # /api/results/* endpoints
│   │   │   └── settings.ts         # /api/settings/* endpoints
│   │   ├── middleware/
│   │   │   ├── cors.ts             # CORS for localhost
│   │   │   └── auth.ts             # Simple auth (if needed)
│   │   ├── scheduler/
│   │   │   └── postScheduler.ts    # Cron for scheduled posts
│   │   └── types/
│   │       └── domain.ts           # TypeScript types (Product, etc.)
│   ├── bun.lockb                   # Bun lock file
│   ├── bunfig.toml                 # Bun config
│   └── package.json
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx                # Dashboard home
│   │   ├── products/
│   │   │   ├── page.tsx            # Products list & ranking
│   │   │   └── [id]/
│   │   │       └── page.tsx        # Product detail & edit
│   │   ├── drafts/
│   │   │   ├── page.tsx            # Draft approval queue
│   │   │   └── [id]/
│   │   │       └── page.tsx        # Draft editor
│   │   ├── results/
│   │   │   └── page.tsx            # Result tracking & trends
│   │   ├── settings/
│   │   │   └── page.tsx            # Score weights, FB token, etc.
│   │   └── layout.tsx              # Root layout
│   ├── components/
│   │   ├── ProductTable.tsx        # Reusable table
│   │   ├── ScoreCard.tsx           # Score display
│   │   ├── FilterBar.tsx           # Platform/price filter
│   │   └── ...
│   ├── lib/
│   │   ├── api.ts                  # Fetch wrapper for /api
│   │   ├── types.ts                # Shared types
│   │   └── utils.ts                # Helpers (formatCurrency, etc.)
│   ├── next.config.js
│   ├── tailwind.config.ts
│   └── package.json
│
├── CLAUDE.md                       # This file
├── README.md                       # Quick start
├── requirements-affiliate-system-v0.4.md # Full spec
└── .gitignore
```

---

## Development Phases (Recommended Order)

### Phase 1: Backend Foundation
1. Set up Bun project, Elysia, SQLite schema
2. Create `scoringService.ts` with scoring formula
3. Build `/api/products/capture` endpoint
4. Add `/api/settings` for FB token management

### Phase 2: Browser Extension
1. Set up Manifest V3 extension
2. Implement Shopee parser first (1 platform)
3. Build content script to extract data
4. Test roundtrip: page → extension → backend → SQLite

### Phase 3: Frontend Dashboard
1. Set up Next.js + Tailwind
2. Product list page with sorting/filtering by score
3. Product detail page to edit commission % and affiliate URL
4. Tables with Recharts for trend visualization

### Phase 4: Caption Drafting
1. Implement template-based draft generation
2. Integrate Ollama API (with fallback to template)
3. Build draft approval workflow (pending → approved → published)
4. Multi-language support (Thai + English)

### Phase 5: Facebook Publishing
1. OAuth flow to connect Facebook page
2. `POST /api/posts/publish` endpoint
3. Scheduled posting with in-process cron
4. Rate limiting & retry logic

### Phase 6: Result Tracking & Reporting
1. Manual entry form for clicks/orders/commission
2. Store in `ResultEntry` table
3. Trend charts comparing actual vs. predicted scores
4. Feedback loop for tuning scoring weights

### Phase 7: Expand Parsers
1. Add Lazada parser (Phase 2 only had Shopee)
2. Add TikTok parser
3. Test all three platforms end-to-end

---

## Key Decisions & Rationale

| Decision | Why |
|----------|-----|
| **Bun + Elysia** | Tiny, fast, easy deployment; better than Node for single-machine use |
| **SQLite** | Zero config, embedded, perfect for self-hosted single-user tool |
| **Ollama local** | CPU-only (no GPU required on user's machine), free model (Qwen 2.5), keeps data private |
| **Template fallback** | Ollama might be slow or crash; templates ensure tool never fails completely |
| **No OAuth for extension** | Extension is packaged locally; no server-side auth complexity needed |
| **Config-driven selectors** | E-commerce sites update their DOM frequently; config file allows quick fixes without rebuilding extension |
| **Manual affiliate links** | Platforms don't expose affiliate programs via API; user must create links in platform dashboard then paste |
| **Manual result entry** | No API access to conversion data; operator checks dashboard, types results for manual tracking |

---

## Testing & Validation Strategy

### Unit Tests
- Scoring algorithm edge cases (0 commission, all weights = 0, etc.)
- Parsing edge cases (missing fields, malformed HTML)

### Integration Tests
- Extension → Backend HTTP roundtrip
- SQLite query correctness

### Manual Testing (MVP)
- Open real Shopee page → click extension → verify data in dashboard
- Edit commission & see score change
- Create draft → approve → confirm post on Facebook

### Monitoring
- Log all parser failures and fallback usage
- Track Ollama timeouts and template fallbacks
- Measure FB API success/retry rates

---

## Common Workflows for Developers

### Adding a New E-Commerce Platform

1. Create `backend/extension/parsers/{platform}.ts`
2. Add selectors to `selectors.config.json`
3. Implement `parseProductPage(doc: Document): RawProduct`
4. Update parser factory to dispatch on platform URL
5. Test manually on live page

### Adjusting Scoring Formula

1. Edit weights in `backend/services/scoringService.ts`
2. Recalculate all scores: `db.updateAllProductScores()`
3. Test comparison logic in frontend
4. Gather feedback from operator results

### Debugging Extension Issues

- Use Chrome DevTools on extension popup (right-click → inspect)
- Add `console.log()` in content script (check page console)
- Check network tab to see POST to `http://localhost:3000/api/products/capture`

### Running Locally

```bash
# Terminal 1: Backend
cd backend && bun install && bun run dev

# Terminal 2: Frontend
cd frontend && npm install && npm run dev

# Terminal 3: Load extension
# Chrome: chrome://extensions → Load unpacked → select extension/ folder

# Browser: Open Shopee → click extension icon → click "Capture" button
```

---

## Known Constraints & Limitations

1. **Platform-specific selectors break** when sites update HTML → requires manual selector update
2. **Ollama must be running separately** for caption generation to work (fallback to template if down)
3. **Facebook access token expires** every ~60 days → requires re-auth
4. **No multi-user** → single operator per instance
5. **Commission % is manual** → no API to fetch from platform affiliate programs
6. **Result tracking is manual** → operator must check Facebook/platform dashboards and enter numbers
7. **No real-time sync** between extension and backend → small delay before data appears in dashboard

---

## Security & Compliance Notes

- ✅ **Privacy**: Only reads pages operator opens; no background scraping
- ✅ **Compliance**: Auto-includes #ad disclosure in posts
- ✅ **Token Storage**: FB access token encrypted at rest
- ✅ **Local-only**: All data stays on operator's machine
- ⚠️ **ToS Risk**: Operator should review platform ToS before using extension (reading data from pages should be OK for personal use)
- ⚠️ **Affiliate Disclosure**: Operator is responsible for complying with FTC/local disclosure rules

---

## Useful References

- [Manifest V3 docs](https://developer.chrome.com/docs/extensions/mv3/)
- [Elysia documentation](https://elysiajs.com/)
- [SQLite best practices](https://www.sqlite.org/bestpractice.html)
- [Facebook Graph API](https://developers.facebook.com/docs/graph-api)
- [Ollama API](https://github.com/ollama/ollama/blob/main/README.md)
- [Next.js docs](https://nextjs.org/docs)

---

## Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Extension → Backend fails | Check backend is running on localhost:3000; CORS may need adjustment |
| Score not updating | Verify scoring service is called after commission/link update |
| Ollama times out | Increase timeout; verify `ollama serve` is running; fallback to template |
| FB post fails | Check access token expiry; log FB error response; retry after fixing |
| Selector doesn't match page | Open DevTools on page; inspect DOM; update selector in config |

---

## Future Enhancements (Post-MVP)

- [ ] Multi-language caption templates (beyond Thai/English)
- [ ] A/B testing different captions on same product
- [ ] Integration with TikTok/Instagram for posting (not just FB)
- [ ] Bulk upload CSV of products
- [ ] Historical comparison: predicted score vs. actual results (ML feedback loop)
- [ ] Docker containerization for easier deployment
- [ ] Cloud sync (optional) for backup of data
- [ ] Mobile app companion for checking dashboard on the go

---

**Document Version**: 1.0  
**Last Updated**: June 2026  
**Status**: Initial architecture guide for MVP development

---

# GSD Managed Sections

<!-- The sections below are generated and updated by GSD commands. Do not hand-edit inside the GSD markers. The developer guide above is hand-maintained. -->

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Affilytics**

Affilytics is a self-hosted, zero-cost "pre-posting decision" tool for affiliate content creators. While browsing a product page on Shopee/Lazada/TikTok, the operator clicks a browser extension to capture product data; a local backend scores how worthwhile the product is to promote, manages the operator's own affiliate links, drafts Thai/English captions, publishes to a Facebook Page, and tracks manually-entered results. It runs entirely on the operator's own machine with no paid APIs.

**Core Value:** **Given a set of captured products, surface a ranked "promote-worthiness" score so the operator can confidently pick which products to promote.** Capture → score → rank is the heart; everything downstream (captions, publishing, tracking) feeds or follows this decision.

### Constraints

- **Budget**: API spend = 0 — everything free/open-source/self-run (NFR-1, C-1)
- **Compliance**: Read only operator-opened pages at normal browsing speed; post only to own FB Page; auto-include #ad disclosure (NFR-2, C-2, C-7)
- **Tech stack**: Browser extension (Chrome, Manifest V3) · Backend TypeScript + Elysia on Bun · SQLite · in-process cron scheduler · Ollama (local) + Qwen 2.5 + template fallback · Frontend Next.js/React + Tailwind + Recharts · Facebook Graph API
- **Resilience**: Parser selectors isolated in config for quick fixes when sites change (NFR-3, C-3); Ollama down → template, unreadable field → manual entry (NFR-5)
- **Security**: FB token/secrets encrypted at rest; extension ↔ backend over localhost only (NFR-4)
- **Manual data**: commission % and affiliate links are operator-entered (C-4); conversion results are operator-entered (C-5)
- **AI compute**: Ollama on CPU → small model, batch drafting, template fallback (C-6)
- **Single machine**: must run end-to-end on one machine (NFR-6)
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Bun | 1.3.14 | Runtime, package manager, bundler, test runner | Native SQLite, native fetch, faster startup than Node; single binary deployment; no npm install for prod |
| Elysia | 1.4.29 | HTTP API framework (backend) | Bun-native, AOT-compiled TypeScript validation via TypeBox (18x faster than Zod), end-to-end type safety with zero extra packages |
| Drizzle ORM | 0.45.2 | SQLite ORM + migrations | Thin layer over `bun:sqlite`; type-safe SQL-like query builder; negligible overhead (~0.04%); `drizzle-kit` handles migrations cleanly |
| WXT | 0.20.26 | Chrome extension bundler/framework | Vite-powered HMR, file-based entrypoints, MV3-first, TypeScript-native, cross-browser; active maintainers; beats Plasmo on build size (5MB → 500KB) and reliability |
| Next.js | 16.2.9 | Frontend dashboard | App Router + React Server Components; best-in-class DX for a localhost dashboard; Tailwind works out of the box |
| Tailwind CSS | 4.3.1 | Dashboard styling | Utility-first; zero-runtime CSS; pairs naturally with shadcn/ui for table/form primitives |
| Recharts | 3.9.0 | Dashboard charts | SVG-based React components; `use client` compatible with App Router; safe default for score trend charts and result tracking |
| Ollama JS (`ollama`) | 0.6.3 | Local LLM client | Official Ollama library; async/await + streaming; abort() for timeout management; no extra HTTP client needed |
| croner | 10.0.1 | In-process cron scheduler | TypeScript-native, DST-aware, error recovery; 600K+ weekly downloads; runs in-process with no Redis/Mongo dependency |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@elysiajs/cors` | 1.4.2 | CORS for localhost | Required on every route — extension's `fetch` to `localhost:3000` is cross-origin from the extension's own origin |
| `@elysiajs/swagger` | 1.3.1 | OpenAPI docs auto-gen | Free during development; useful when debugging extension→backend contract |
| `drizzle-kit` | 0.31.10 | Schema migrations CLI | `drizzle-kit push` for dev, `drizzle-kit generate` + `migrate` for tracked production migrations |
| `@webext-core/messaging` | 3.0.2 | Type-safe extension messaging | Replaces raw `browser.runtime.sendMessage`; prevents runtime messaging errors between content script, background, popup |
| Node.js `crypto` (built-in) | — | Facebook token encryption at rest | AES-256-GCM field-level encryption on the `accessTokenEnc` column; no extra package; key from `BUN_ENCRYPTION_KEY` env var |
| TypeScript | 6.0.3 | Type safety across all layers | All three layers (extension, backend, frontend) share types via a `packages/shared` workspace |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| `bun test` | Unit + integration tests | Built-in test runner; no Jest needed; faster |
| `drizzle-kit studio` | Visual DB browser | `bunx drizzle-kit studio` — useful for inspecting SQLite during development |
| Chrome DevTools | Extension debugging | Right-click extension popup → Inspect; check Network tab for `POST localhost:3000/api/products/capture` |
| WXT HMR | Extension hot-reload | `bun run dev` inside `extension/`; `Alt+R` shortcut auto-registered for manual reloads |
## Installation
# Backend
# Scheduler + Ollama client
# Extension (scaffolded by WXT)
# Frontend
## Alternatives Considered
| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Drizzle ORM | Raw `bun:sqlite` | bun:sqlite alone has no migrations, no type inference on query results; Drizzle adds these for ~0.04% overhead |
| Drizzle ORM | Prisma | Prisma requires a separate engine binary and codegen step; heavier for single-file SQLite on a local machine |
| WXT | Plasmo | Plasmo uses a custom Parcel bundler (slowest), is in maintenance mode, React-only, and produces 10x larger bundles |
| WXT | CRXJS | CRXJS is a Vite plugin not a framework; minimal abstraction means more setup; maintenance concerns in 2025-2026 |
| WXT | Plain Vite | WXT wraps Vite with extension-specific conventions (manifest gen, HMR, background/content/popup entrypoints) saving significant boilerplate |
| croner | node-cron | node-cron is less TypeScript-native; croner is DST-aware and has better error recovery; same in-process model |
| Raw `fetch` for FB API | facebook-nodejs-business-sdk | The SDK is large and targets the Marketing/Ads API; for simple Page post publishing, raw `fetch` to `graph.facebook.com/v22.0/{page_id}/feed` is 3 lines and has zero overhead |
| Node `crypto` (built-in) | SQLCipher | SQLCipher requires a native module fork of better-sqlite3; `bun:sqlite` doesn't support SQLCipher; field-level AES-256-GCM on the single sensitive column (accessTokenEnc) is simpler and sufficient |
| Recharts | Apache ECharts | ECharts is overkill for score trend lines and bar charts at <1000 data points; Recharts is smaller and easier in React |
| Recharts | Chart.js / react-chartjs-2 | Canvas rendering has no advantage at this data scale; Recharts SVG integrates cleanly with Tailwind theming |
| Tailwind CSS | CSS Modules | Tailwind + shadcn/ui provides ready-made table, form, and badge components that match this dashboard's UX needs |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `better-sqlite3` | Does not work with Bun's native runtime; requires Node.js `node_modules` binding | `bun:sqlite` (via `drizzle-orm/bun-sqlite`) |
| `Prisma` | Requires binary query engine download; codegen; much heavier than Drizzle for a local SQLite file | Drizzle ORM |
| `Plasmo` extension framework | Custom Parcel bundler (slowest), React-only, maintenance slowing, 10x larger bundles vs WXT | WXT |
| `node-fetch` or `axios` | Bun has native `fetch` built-in; adding another HTTP client is redundant weight | Native `fetch` (globally available in Bun) |
| `facebook-nodejs-business-sdk` | Large; designed for Ads/Marketing API; overkill for simple page feed posting | Raw `fetch` to `https://graph.facebook.com/v22.0/{pageId}/feed` |
| `Zod` for Elysia validation | Elysia has its own TypeBox-based `t` validator built-in with AOT compilation; mixing Zod duplicates validation and slows routes | Elysia's built-in `t` (TypeBox) |
| `jsonwebtoken` | Not needed — this is a single-operator local tool; no multi-user session management required | No auth needed; extension communicates to localhost only |
| `SQLCipher` / `@journeyapps/sqlcipher` | Requires native Node.js binding incompatible with Bun's SQLite; adds complexity for one sensitive column | Node.js built-in `crypto`, AES-256-GCM on the `accessTokenEnc` column only |
## Stack Patterns by Layer
- Single `src/index.ts` entry point; Elysia plugins for CORS and Swagger
- Schema defined in `db/schema.ts` using Drizzle's SQLite column builders
- All route handlers are typed end-to-end: Elysia infers body/response types from `t.Object()` schemas
- Scheduler (`croner`) registered at app startup in `index.ts`; fires `publishService.runPendingPosts()` on cron tick
- `entrypoints/content.ts` — injects overlay UI on Shopee/Lazada/TikTok product pages
- `entrypoints/background.ts` — service worker; relays messages from content script to backend `fetch`
- `entrypoints/popup.ts` — popup UI; shows capture status
- Selectors stored in `parsers/selectors.config.json` outside the compiled bundle so they can be edited without a rebuild
- `@webext-core/messaging` for typed content↔background↔popup communication
- Use `world: 'ISOLATED'` (default) for content scripts — no need for `MAIN` world access
- All API calls go to `http://localhost:3000/api` via a thin `lib/api.ts` fetch wrapper
- Charts must be in `'use client'` components — Recharts uses browser APIs
- Use `shadcn/ui` for table/form/badge primitives; pair with Recharts for trend/comparison charts
- No server-side data fetching for dashboard data — all client-side polling/fetch since the backend is localhost
## Version Compatibility
| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `elysia@1.4.29` | `bun@1.3.x` | Elysia is Bun-first; works on Node too but optimized for Bun |
| `drizzle-orm@0.45.2` | `bun:sqlite` (built-in) | Use `drizzle-orm/bun-sqlite` import path; add `--bun` flag to `drizzle-kit` commands in package.json scripts |
| `wxt@0.20.26` | Chrome MV3, Firefox MV2/MV3 | MV3 service worker is the default for Chrome; WXT handles the manifest generation |
| `recharts@3.9.0` | `next@16.x`, React 19 | Requires `'use client'` directive on any component that imports Recharts |
| `croner@10.0.1` | Bun 1.3.x | Pure TypeScript/JS; no native bindings; runs identically on Bun and Node |
| `ollama@0.6.3` | Ollama daemon ≥0.4.x | Uses Ollama REST API (`/api/chat`); no hard version coupling — just needs the daemon running on port 11434 |
## Sources
- `/elysiajs/documentation` (Context7) — CORS plugin, validation (`t` TypeBox), plugin setup
- `/oven-sh/bun` (Context7) — `bun:sqlite` + Drizzle integration patterns
- `/wxt-dev/wxt` (Context7 + wxt.dev) — MV3 content script setup, messaging, service worker
- `/drizzle-team/drizzle-orm-docs` (Context7) — `drizzle-orm/bun-sqlite` connect pattern, migrations
- npm registry (live) — elysia@1.4.29, wxt@0.20.26, drizzle-orm@0.45.2, drizzle-kit@0.31.10, croner@10.0.1, ollama@0.6.3, next@16.2.9, recharts@3.9.0, tailwindcss@4.3.1, typescript@6.0.3
- WebSearch (MEDIUM confidence) — WXT vs Plasmo comparison; croner vs node-cron; bun:sqlite vs Drizzle; FB Graph API raw fetch vs SDK; token encryption patterns
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
