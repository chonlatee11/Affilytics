# Project Research Summary

**Project:** Affilytics — Affiliate Product Analytics & Publishing Tool
**Domain:** Self-hosted browser-extension + localhost-backend + SQLite + dashboard (single-operator, zero-cost, Thai-market affiliate creator)
**Researched:** 2026-06-23
**Confidence:** HIGH

## Executive Summary

Affilytics is a self-hosted affiliate content pipeline tool — it combines a browser extension for product data capture, a local backend that scores products by promotion ROI, and a dashboard that handles caption drafting, approval, and Facebook publishing. The research confirms this class of tool is well-understood architecturally: a Manifest V3 extension communicates through a background service worker (not content script) to a local Elysia/Bun backend, with SQLite for persistence and an in-process cron scheduler for Facebook post dispatching. The stack is fully resolved with verified versions, and the build order is clear: backend schema first, extension second, scoring and dashboard third, caption/approval/publishing fourth, result tracking last, parser expansion last.

The most important recommendation from combined research is to treat the extension-to-backend message-passing architecture and the Facebook token pipeline as Phase 1 and Phase 2 constraints respectively — not Phase 5/6 problems. The content script must never fetch localhost directly (mixed-content block on HTTPS pages), and the Facebook non-expiring Page access token plus Meta App Review must be initiated early because the review process takes 5–15 business days. Both are hard blockers, not quality improvements, and both are commonly discovered only at launch.

The biggest ongoing risk is brittleness: Shopee, Lazada, and TikTok update their DOM structures regularly, Ollama cold-starts can block caption drafts, and the Facebook data-access token silently expires after ~90 days. All three are addressed in the architecture through config-driven selectors (hot-patchable JSON), template fallback for Ollama, and a proactive FB health-check endpoint. Building these resilience mechanisms from Phase 1 rather than retrofitting them later is the key implementation discipline this project requires.

---

## Key Findings

### Recommended Stack

All dependencies verified against npm registry and Context7 live docs at HIGH confidence. The stack is Bun-native throughout.

- **Bun 1.3.x**: Runtime + package manager + bundler — native SQLite, native fetch, single binary; never `better-sqlite3` (incompatible with Bun)
- **Elysia 1.4.x**: HTTP API framework — Bun-native, built-in TypeBox validation, plugin-per-route architecture; do not mix Zod into it
- **Drizzle ORM 0.45.x**: SQLite ORM — import path `drizzle-orm/bun-sqlite`; `--bun` flag on drizzle-kit; Prisma incompatible (separate binary engine)
- **WXT 0.20.x**: Extension framework — MV3-first, Vite HMR, file-based entrypoints; Plasmo deprecated (10x larger bundles, maintenance mode) — do not use
- **Next.js 16.x + Recharts 3.x**: Dashboard — all Recharts components must be `'use client'`; backend is localhost so client-side fetch
- **croner 10.x**: In-process scheduler — pure TypeScript, DST-aware; no Redis/external queue needed
- **`ollama` 0.6.x**: Local LLM client — AbortController with 120s timeout; set `OLLAMA_KEEP_ALIVE=24h` to prevent cold-start
- **Node `crypto` (built-in)**: FB token encryption — AES-256-GCM on `accessTokenEnc` column; key from `BUN_ENCRYPTION_KEY` env var

### Expected Features

MVP is US-1..US-6 from the spec. Dependencies form a strict chain: extension capture → scoring (also needs commission entry) → dashboard comparison → caption drafting → approval queue → FB publishing. Ollama is an enhancement layered on top of template drafting, not a dependency.

**Table stakes:** extension captures Shopee data; weighted 0-100 promote-worthiness score per product; ranked dashboard table (sort/filter by score, platform, price, rating); commission % + affiliate URL entry; template Thai+English captions with auto link + #ad; draft approval queue enforcing the state machine; publish to FB Page (immediate + scheduled) with rate guard + fbPostId; manual result entry; FB OAuth + encrypted token + weight settings; config-driven selectors from day one.

**Differentiators:** the weighted score itself (no zero-cost tool combines commission/popularity/rating/reviews into one tunable score for a creator); Ollama/Qwen captioning with fallback; actual-vs-predicted score chart (US-6 feedback loop); Lazada parser; "fields captured/missing" popup feedback; FB health-check endpoint.

**Anti-features (guard hardest):** mass scraping (ToS/blocking), auto link generation (no free API), link cloaking (compliance/reputation risk), multi-user (invalidates single-machine architecture), TikTok parser deferred (heavy SPA/lazy-load risk).

### Architecture Approach

Three-tier localhost system: MV3 extension (content script reads DOM → background service worker sends HTTP POST) → Elysia backend (routes as plugins → pure service functions → Drizzle/SQLite) → Next.js dashboard (client-side fetch to localhost). Business logic lives exclusively in service files with no Elysia imports (scoringService is a pure, independently-testable function). Post lifecycle is a SQLite CHECK-constrained state machine with TypeScript guard functions. In-process cron (croner) calls publishService directly.

Components: (1) content script — config-driven selectors, `MutationObserver` for SPA timing, never fetches; (2) background service worker — issues all `fetch()`, registers `onMessage` synchronously at top level; (3) Elysia route plugins — TypeBox validation, delegate to services; (4) scoringService — pure function; (5) draftService + ollamaService — explicit Ollama→template fallback, state guards; (6) publishService + postScheduler — raw fetch to Graph API, croner dispatch, retry; (7) SQLite WAL mode — `journal_mode=WAL` + `busy_timeout=5000` at connection open.

### Critical Pitfalls

1. **Content script fetching localhost directly** — Chrome blocks `http://localhost` from HTTPS pages as mixed content. Always route through the background service worker; declare `"http://localhost/*"` in `host_permissions`. Wrong here = full pipeline refactor. (Phase 2)
2. **MV3 service worker loses state after ~5 min idle** — register all `onMessage` listeners synchronously at top level; persist state in `chrome.storage.local`, not globals; use `chrome.alarms` not `setInterval`. (Phase 2)
3. **Facebook App Review blocks public publishing** — Development Mode posts are invisible to followers. Submit for `pages_manage_posts` Advanced Access ~3 weeks before Phase 6 ships. Use the 3-step token exchange (short-lived → long-lived → non-expiring Page token). (Phase 5 end → Phase 6)
4. **Ollama cold-start blocks first caption** — models unload after 5 min idle; CPU inference 15–90s; default request timeout 30s. Set `OLLAMA_KEEP_ALIVE=24h`, 120s AbortController, template fallback on any error. Prove template path first. (Phase 5)
5. **SQLite write contention API vs cron** — without WAL + `busy_timeout`, concurrent writes throw `SQLITE_BUSY`. Set both in Phase 1 DB init; retrofitting needs a migration. (Phase 1)
6. **SPA DOM timing** — product data loads async; naive `DOMContentLoaded` parsers miss it. Use `MutationObserver` with timeout; keep selectors in `selectors.config.json`. (Phase 2)

---

## Implications for Roadmap

Suggested phases: **8**

1. **Backend Foundation** — Bun + Elysia skeleton, full SQLite schema, `/api/settings`, AES-256-GCM `accessTokenEnc`, WAL + `busy_timeout` in DB init, `BUN_ENCRYPTION_KEY` startup check, localhost CORS. Schema/encryption/WAL decisions cascade everywhere — establish correctly from the start.
2. **Browser Extension (Shopee only)** — WXT-scaffolded MV3 extension, `content.ts` with `MutationObserver`, `background.ts` with synchronous top-level `onMessage` + `fetch()`, `selectors.config.json` (Shopee), `POST /api/products/capture`, popup "N/N fields captured". Prove MV3 message-passing on one platform before multiplying parsers.
3. **Scoring + Commission Entry** — `scoringService.ts` pure function, `PUT /api/products/:id/extra` with immediate recalc, "enter commission" badge state, score breakdown in API response, weights in settings. Core value; resolve zero-score UX before dashboard.
4. **Frontend Dashboard** — Next.js + Tailwind + Recharts, `/products` ranked table, `/products/[id]` detail/edit, multi-product comparison. Full capture→score→rank loop surfaces to operator; establish Recharts `'use client'` pattern.
5. **Caption Drafting + Approval Queue** — template Thai+English captions per tone, `draftService.ts` state-machine guards, `/api/drafts`, `/drafts` approval UI, Ollama with 120s fallback, #ad disclosure validation. Template proven before Ollama; **submit Meta App Review at end of this phase**.
6. **Facebook Publishing** — 3-step OAuth token exchange, `data_access_expiration_time` + 80-day alert, `publishService.ts` raw fetch to Graph API v22.0, `POST /api/posts/publish`, `postScheduler.ts` (croner), retry, daily rate guard, `GET /api/settings/fb-status` health-check, failed-post surfacing. Requires Phase 5 approval gate + Meta review.
7. **Manual Result Tracking** — `ResultEntry` schema + CRUD, `/api/results`, `/results` entry form, Recharts actual-vs-predicted chart. Requires published posts to be meaningful.
8. **Expand Parsers (Lazada + TikTok)** — `lazada.ts` + selectors, `tiktok.ts` + selectors, `MutationObserver` tuning. Additive once factory pattern proven; Lazada first (simpler), TikTok second (heavier lazy-load).

### Research Flags

- **Phase 2** — Shopee live DOM selectors + `MutationObserver` patterns; get a current Shopee DOM snapshot at plan time.
- **Phase 6** — Meta Graph API permissions & App Review checklist change frequently; verify current `pages_manage_posts` Advanced Access requirements before planning.
- Standard patterns (skip phase research): Phases 1, 3, 4, 5, 7, 8.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified vs npm + Context7 on 2026-06-23 |
| Features | HIGH | Constraints explicit in spec; dependency chain unambiguous |
| Architecture | HIGH | MV3/Elysia official docs + reference implementations |
| Pitfalls | HIGH (MV3/FB/SQLite) / MEDIUM (scoring model) | Infra from official docs; scoring normalization from community sources |

**Overall confidence:** HIGH

### Gaps to Address

- **Shopee current CSS selectors** — validate against live DOM in Phase 2 (research selectors are illustrative).
- **Meta App Review timeline/checklist** — verify at Phase 5 planning (5–15 business days, changes periodically).
- **Ollama inference time on Ryzen 5 1600X (no GPU)** — validate `qwen2.5` model size + timeout budget during Phase 5.
- **TikTok DOM lazy-load patterns** — treat Phase 8 TikTok parser as its own research spike.

---

*Research completed: 2026-06-23 — Ready for roadmap: yes*
