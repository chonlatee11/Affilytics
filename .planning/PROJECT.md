# Affilytics

## What This Is

Affilytics is a self-hosted, zero-cost "pre-posting decision" tool for affiliate content creators. While browsing a product page on Shopee/Lazada/TikTok, the operator clicks a browser extension to capture product data; a local backend scores how worthwhile the product is to promote, manages the operator's own affiliate links, drafts Thai/English captions, publishes to a Facebook Page, and tracks manually-entered results. It runs entirely on the operator's own machine with no paid APIs.

## Core Value

**Given a set of captured products, surface a ranked "promote-worthiness" score so the operator can confidently pick which products to promote.** Capture → score → rank is the heart; everything downstream (captions, publishing, tracking) feeds or follows this decision.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- **Phase 1 — Backend Foundation (validated 2026-06-24):** Localhost Bun+Elysia backend on 127.0.0.1 with CORS; SQLite (WAL + busy_timeout) and full 7-entity schema; AES-256-GCM encrypted Facebook token at rest (never returned in plaintext); Facebook Page connect via OAuth (Dev-Mode code path) + manual paste fallback. Closes FOUND-01, FOUND-02, FOUND-03, SET-01.
  - Follow-up (non-blocking, test hygiene): `seed.test.ts` singleton opens the real DB only when that test file is run in isolation; full `bun test` is deterministic-clean. Consider a lazy DB-singleton getter or bunfig preload.

### Active

<!-- Current scope. Building toward these. v1 = MVP across US-1..US-6 -->

- [ ] Browser extension (Chrome) captures product data from an open Shopee page (name, price, discount, rating, review count, sales count, shop, URL) and POSTs to localhost backend
- [ ] Unreadable fields are left empty for manual entry — partial capture never crashes the whole record
- [ ] Fallback: paste a product URL to create a basic product record
- [ ] Backend normalizes captured data into standard fields and stores in SQLite
- [ ] Operator enters commission % and pastes an affiliate URL per product
- [ ] Backend computes a weighted promote-worthiness score (commission, sales/popularity, rating, reviews, discount) with tunable weights
- [ ] Dashboard table ranks/filters/compares products by score, platform, price range, rating
- [ ] Multi-product side-by-side comparison view
- [ ] Caption drafting in Thai + English (template first, then Ollama/Qwen 2.5) with auto-appended affiliate link + #ad disclosure; editable before save
- [ ] Ollama timeout falls back to template and notifies the operator
- [ ] Draft approval queue (draft → pending_approval → approved → published; reject path)
- [ ] Only approved drafts can publish to Facebook Page via Graph API (immediate or scheduled), storing fbPostId; failures retry + log
- [ ] Daily post-limit rate guard
- [ ] Manual result entry (clicks/orders/commission per product/campaign) with history to compare actual vs. predicted score
- [ ] Settings: connect Facebook Page (OAuth) with encrypted token; tune score weights, tone, daily post limit, draft mode
- [ ] Expand parsers to Lazada and TikTok after Shopee proven

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Affiliate Networks / third-party APIs (Involve Asia, AccessTrade) — direction change in v0.4; links come from the platforms' own affiliate programs
- Automatic product/link generation via platform APIs — not available for free
- Mass scraping / bulk automatic product harvesting — ToS/blocking risk; read only operator-opened pages at normal speed
- X (Twitter) posting via API — later phase; draft-to-copy mode only
- Automatic conversion tracking — no API access; results entered manually
- Multi-user — single operator per instance by design

## Context

- **Direction change from v0.3:** dropped affiliate networks; product data now comes from a browser extension reading pages the operator opens themselves, and affiliate links come from the platforms' own affiliate programs.
- **Recommended build order (from spec §11):** backend + DB schema + FB settings → US-1 extension (Shopee) + capture endpoint → US-2 commission/link + scorer → US-3 dashboard table/compare (core value delivered) → US-4 template drafts then Ollama → US-5 approve + FB publish → US-6 manual result tracking → expand parsers (Lazada/TikTok).
- **Scoring accuracy is a known unknown (R-3):** the US-6 actual-vs-predicted feedback loop exists specifically to tune weights over time.
- Platform DOM changes (R-1) are the biggest fragility; selectors live in config to be patched without rebuilding the extension.
- Self-hosted target machine: ~32GB RAM, Ryzen 5 1600X, CPU-only Ollama (RX 480 lacks ROCm support) — favor small models + batch drafting.

## Constraints

- **Budget**: API spend = 0 — everything free/open-source/self-run (NFR-1, C-1)
- **Compliance**: Read only operator-opened pages at normal browsing speed; post only to own FB Page; auto-include #ad disclosure (NFR-2, C-2, C-7)
- **Tech stack**: Browser extension (Chrome, Manifest V3) · Backend TypeScript + Elysia on Bun · SQLite · in-process cron scheduler · Ollama (local) + Qwen 2.5 + template fallback · Frontend Next.js/React + Tailwind + Recharts · Facebook Graph API
- **Resilience**: Parser selectors isolated in config for quick fixes when sites change (NFR-3, C-3); Ollama down → template, unreadable field → manual entry (NFR-5)
- **Security**: FB token/secrets encrypted at rest; extension ↔ backend over localhost only (NFR-4)
- **Manual data**: commission % and affiliate links are operator-entered (C-4); conversion results are operator-entered (C-5)
- **AI compute**: Ollama on CPU → small model, batch drafting, template fallback (C-6)
- **Single machine**: must run end-to-end on one machine (NFR-6)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Start extension on Chrome | Best Manifest V3 support, widest user base, best dev tools | — Pending |
| Start parser with Shopee | First MVP platform; operator's most-used platform | — Pending |
| Balanced scoring weights | No single dimension dominates upfront; tune later via US-6 actual-vs-predicted loop (R-3) | — Pending |
| Bun + Elysia backend | Tiny, fast, easy single-machine deployment | — Pending |
| SQLite single-file DB | Zero config, embedded, perfect for self-hosted single-user | — Pending |
| Template-before-Ollama for captions | Tool never fully fails; Ollama is an upgrade not a dependency | — Pending |
| Config-driven selectors | E-commerce DOM changes frequently; patch without rebuilding extension | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-24 after Phase 1 (Backend Foundation) completion*
