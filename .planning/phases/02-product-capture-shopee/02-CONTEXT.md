# Phase 2: Product Capture (Shopee) - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship a Chrome MV3 extension (WXT) that reads a Shopee product page via config-driven CSS selectors and routes the captured data through the background service worker to a NEW backend capture endpoint (`POST /api/products/capture`), which persists into the existing `products` table. Includes graceful handling of missing/unreadable fields and a paste-a-URL fallback for creating a basic record.

In scope: Shopee only (Lazada/TikTok are Phase 8). The extension popup is the only UI surface. The backend gains its first entity endpoint (capture); the `products` schema already exists from Phase 1.

Out of scope: scoring/commission/links (Phase 3), dashboard (Phase 4), captions/publishing/results (Phase 5–7), and any non-Shopee parser.

</domain>

<decisions>
## Implementation Decisions

### Capture Trigger & UI Surface
- **D-01:** Capture is triggered from the **extension toolbar popup only** — click the extension icon → popup opens with a "Capture" button and the result UI. No on-page injected overlay button in this phase. Rationale: simplest to build, no Shopee DOM/CSS injection or layout-collision risk, matches "click the extension" in ROADMAP. (On-page overlay is deferred — see Deferred Ideas.)
- **D-02:** Popup UI design (Capture button, review form, N/N summary, error/warning states) **MUST be designed using the `ui-ux-pro-max` skill** — invoke it during planning/implementation rather than hand-rolling styling. This applies to all Affilytics frontend/UI work (extension popup here, dashboard in Phase 4).

### Capture Flow (review-before-save)
- **D-03:** After "Capture", the content script reads the page and the popup shows a **review form** of the parsed fields. The operator can inspect and **edit any field — including manually filling fields that could not be read (CAP-03)** — then clicks **Save**, which sends the data to the backend. Capture is NOT fire-and-forget; nothing is written to the DB until the operator confirms. The form shows an **"N/N fields captured"** summary so the operator sees read coverage at a glance.

### Paste-URL Fallback (CAP-04)
- **D-04:** Operator can **paste a product URL** in the popup (for when they are not on the page, or DOM can't be read). The system **auto-detects the platform from the URL domain** (e.g. shopee → `platform: "shopee"`), creates an empty record pre-filled only with the URL + platform, and opens the **same review form** for the operator to fill in name/price/etc. and Save. (For Phase 2, only Shopee URLs are expected; platform field still set from domain.)

### Duplicate Handling
- **D-05:** Capturing a product whose **`productUrl` already exists = update the existing record** (upsert on `product_url`), not a new row — so the dashboard stays clean and re-capturing refreshes price/rating/sales. **Requires adding a UNIQUE constraint on `products.product_url`** via a tracked Drizzle migration (Phase 1 schema does NOT have one yet — see Code Context). Upsert keyed on `product_url`.

### Selector Config (CAP-05)
- **D-06:** Shopee CSS selectors live in a **`selectors.config.json` bundled inside the extension**, separated from parser logic. Editing the file + reloading the extension (WXT `Alt+R`, no core rebuild) is the fix path when Shopee changes its DOM. NOT backend-served — keeps capture working without requiring the backend to be online for selector lookup, and matches the CLAUDE.md `parsers/selectors.config.json` convention.

### Failure & Edge-Case UX
- **D-07:** **Zero fields read (0/N — page still loading or all selectors broken):** popup shows a clear **warning** ("couldn't read product data — the page may not be fully loaded"), offers a **"Try again"** action, and opens the **empty review form** so the operator can fill it manually (same surface as the paste-URL fallback). Do NOT silently save an empty record.
- **D-08:** **Backend offline when Save is pressed** (server not running): **keep the form populated** (do not close the popup or lose the operator's input) and show an error like "can't reach backend — start `bun dev` then press Save again." **No offline queue / chrome.storage retry** in this phase — too much sync/queue complexity for the MVP.

### Data Normalization
- **D-09:** The **extension normalizes values into the numeric shapes the schema expects** before populating the review form: a **price range** (e.g. `฿290 - ฿500`) → the **lowest number** (the cheaper/starting price); abbreviated counts (e.g. `12.3k`) → integer `12300`; strip currency symbols/commas. The operator can correct any value in the review form before Save. This keeps `price` (real) and `salesCount`/`reviewCount` (integer) clean for Phase 3 scoring.

### Claude's Discretion
- Exact MV3 plumbing is locked by ROADMAP pitfalls (content script must NOT fetch localhost directly — route via `chrome.runtime.sendMessage` → background `fetch()`; register `onMessage` synchronously at top level of `background.ts`; `MutationObserver` + timeout for Shopee's async/SPA DOM; declare `http://localhost/*` in `host_permissions`). Planner/researcher own these; not re-litigated here.
- Validate the actual Shopee selectors against a live page at plan/research time (ROADMAP research-flag).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition & requirements
- `.planning/ROADMAP.md` § "Phase 2: Product Capture (Shopee)" — goal, success criteria, and the locked MV3 pitfall notes (mixed-content routing #1, synchronous onMessage #2, MutationObserver #6, host_permissions, selector-validation research flag)
- `.planning/REQUIREMENTS.md` — CAP-01, CAP-02, CAP-03, CAP-04, CAP-05
- `.planning/PROJECT.md` — core value (capture → score → rank), constraints (zero-cost, localhost-only, privacy: only operator-opened pages)

### Tech stack (locked)
- `CLAUDE.md` § "Technology Stack" — WXT 0.20.26 (MV3 extension bundler), `@webext-core/messaging` 3.0.2 (typed content↔background↔popup), content scripts `world: 'ISOLATED'`, selectors in `parsers/selectors.config.json` outside the compiled bundle
- `CLAUDE.md` § "Architecture Patterns & Conventions" #1 (Platform-Agnostic Parser Design) and #3 (Extension ↔ Backend Communication) — parser isolation, config-driven selectors, `POST /api/products/capture` contract
- `CLAUDE.md` § "Core Domain Model" — Product entity field shapes

### Existing backend (Phase 1 — integration target)
- `backend/src/db/schema.ts` § `products` table — capture endpoint writes here; note NO unique constraint on `product_url` yet (D-05 adds one)
- `backend/index.ts` — CORS allowlist already includes `/^chrome-extension:\/\//` (Phase 1 T-1-CORS) so the extension origin is permitted; new capture route mounts here via `.use(...)`
- `backend/src/routes/settings.ts` — reference pattern for a new Elysia route (`new Elysia({ prefix: '/api/...' })`, TypeBox `t.Object()` body validation, `set.status` error handling)

### UI design
- `ui-ux-pro-max` skill — invoke for popup UI design per D-02

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`products` table** (`backend/src/db/schema.ts`) already defined with all capture fields: `platform` enum, `name`, `price` (real), `discountPct`, `rating`, `reviewCount`, `salesCount`, `shop`, `productUrl`, `capturedAt`. Capture endpoint just inserts/updates here.
- **Elysia route pattern** (`backend/src/routes/settings.ts`, `health.ts`) — `export const xRoutes = new Elysia({ prefix: '/api/...' })`, TypeBox `t` body schemas, `set.status` for errors. Mount in `backend/index.ts` via dynamic `await import()` + `.use(...)` (preserves the key-first boot order).
- **CORS for extension already configured** — `backend/index.ts` allows `chrome-extension://` origins; no CORS work needed for capture.
- **Drizzle migration workflow** (D-07 from Phase 1) — `drizzle-kit generate` + `migrate:run`; use this to add the `product_url` UNIQUE constraint.

### Established Patterns
- Backend: single entry `backend/index.ts`, fail-fast on `BUN_ENCRYPTION_KEY`, dynamic route imports, `127.0.0.1` bind only.
- Tests live beside source (`*.test.ts`, `bun test`).
- No frontend/extension code exists yet — `extension/` is greenfield (WXT scaffold needed).

### Integration Points
- NEW `POST /api/products/capture` (and likely the upsert logic) is the contract between extension and backend; mount the route in `backend/index.ts`.
- NEW `extension/` workspace (WXT): `entrypoints/popup`, `entrypoints/background.ts`, `entrypoints/content.ts`, `parsers/shopee.ts` + `parsers/selectors.config.json`.
- Phase 3 (scoring) reads the rows this phase writes — normalized numeric fields (D-09) matter for score quality.

</code_context>

<specifics>
## Specific Ideas

- Popup flow mental model: **click icon → Capture → review form (N/N captured, editable) → Save**; paste-URL and the 0-field case both funnel into the SAME review form so there's one consistent "fill and Save" surface.
- Normalization examples to handle: price range `฿290 - ฿500` → `290`; `12.3k` / `1.2พัน` style abbreviations → integers; strip `฿`, commas.
- Use `ui-ux-pro-max` for the popup so the small surface still looks polished and consistent with the future dashboard.

</specifics>

<deferred>
## Deferred Ideas

- **On-page injected overlay capture button** on Shopee product pages — popup-only chosen for Phase 2; revisit as a UX enhancement in a later phase.
- **Offline capture queue + background retry** (chrome.storage queue, sync state) — rejected for MVP (D-08); revisit if operators frequently capture while the backend is down.
- **Lazada & TikTok parsers** — Phase 8 (reuse the config-driven parser pattern proven here).
- **Server-served / live-editable selector config** — backend-served selectors rejected (D-06); could revisit if selectors need to update without any extension reload.

</deferred>

---

*Phase: 2-Product Capture (Shopee)*
*Context gathered: 2026-06-25*
