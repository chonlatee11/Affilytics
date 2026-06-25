# Phase 2: Product Capture (Shopee) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-25
**Phase:** 2-Product Capture (Shopee)
**Areas discussed:** Capture trigger, Capture flow, Paste-URL fallback, Duplicate handling, Selector config, Zero-field handling, Backend-offline handling, Data normalization, Frontend design tooling

---

## Capture trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Popup only | Toolbar icon → popup with Capture button + result. Simplest, no Shopee DOM injection, matches "click the extension". | ✓ |
| On-page overlay | Inject a capture button on the Shopee page. Heavier — inject CSS/DOM, risk layout collision. | |
| Both | Overlay for speed + popup for review. Most work. | |

**User's choice:** Popup only
**Notes:** Minimal surface, lowest risk; on-page overlay deferred.

---

## Capture flow (review vs fire-and-forget)

| Option | Description | Selected |
|--------|-------------|----------|
| Review before send | Popup shows parsed fields; operator inspects/edits (incl. unreadable fields, CAP-03) then Save. Data checked before DB. | ✓ |
| Fire then show result | Capture → send immediately → popup shows "N/N captured"; fix later in dashboard. | |

**User's choice:** Review before send
**Notes:** Operator controls data quality before it lands in DB; keeps the "N/N fields captured" summary in the review form.

---

## Paste-URL fallback (CAP-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Empty record, fill manually | Auto-detect platform from URL domain → open empty review form pre-filled with URL → operator fills + Save. | ✓ |
| Ask platform explicitly | Operator picks platform from a dropdown instead of auto-detect. | |

**User's choice:** Empty record, auto-detect platform, fill manually
**Notes:** Same review-form surface as on-page capture; platform inferred from domain.

---

## Duplicate handling

| Option | Description | Selected |
|--------|-------------|----------|
| Update existing | Use productUrl as key → update existing row (refresh price/rating/sales), no duplicate. Needs UNIQUE on product_url. | ✓ |
| New record each time | Keep every capture as a snapshot (price-over-time) — but dashboard gets duplicates. | |
| Warn then ask | Detect duplicate URL → popup warns → operator chooses update or skip. | |

**User's choice:** Update existing (upsert on product_url)
**Notes:** Dashboard stays clean. Requires a Drizzle migration adding UNIQUE on products.product_url.

---

## Selector config (CAP-05)

| Option | Description | Selected |
|--------|-------------|----------|
| JSON bundled in extension | selectors.config.json separate from parser logic; edit + reload extension (Alt+R), no core rebuild. Matches CLAUDE.md convention. | ✓ |
| Backend-served config | Backend serves config, extension fetches it; edit server-side, no extension reload — but needs backend online + an endpoint. | |

**User's choice:** JSON bundled in extension
**Notes:** Keeps capture independent of backend availability for selector lookup.

---

## Zero-field handling

| Option | Description | Selected |
|--------|-------------|----------|
| Warn + try again / fill manually | Popup warns "couldn't read data — page may not be loaded", offers Try again, opens empty review form. | ✓ |
| Silent, require Save | Block auto-saving an empty record but no warning — operator just edits selectors. | |

**User's choice:** Warn + try again / fill manually
**Notes:** Funnels into the same review form as paste-URL fallback.

---

## Backend-offline on Save

| Option | Description | Selected |
|--------|-------------|----------|
| Keep form + show error | Popup stays open with input intact, error: "can't reach backend — start bun dev then Save again." No storage. | ✓ |
| Queue in extension + auto-retry | Persist to chrome.storage, background retries when backend returns. More complexity (queue, sync state). | |

**User's choice:** Keep form + show error to retry
**Notes:** No offline queue in MVP — too much sync complexity.

---

## Data normalization

| Option | Description | Selected |
|--------|-------------|----------|
| System normalizes | Extension converts: price range → lowest number, "12.3k" → 12300; operator can correct in review form. Numeric fields stay clean. | ✓ |
| Store raw, operator types numbers | Keep strings as-is; operator enters numbers manually. But schema price/salesCount are numeric — would break. | |

**User's choice:** System normalizes
**Notes:** Keeps price (real) and salesCount/reviewCount (integer) clean for Phase 3 scoring; operator can override in the review form.

---

## Frontend design tooling

**User's free-text request:** "อยากให้ใช้ ui-ux-pro-max ในการทำงานเกี่ยวกับดีไซน์ของฟร้อนเอน" — use the `ui-ux-pro-max` skill for all frontend/UI design work. Captured as D-02 in CONTEXT.md and saved to memory for the whole project (extension popup now, dashboard in Phase 4).

---

## Claude's Discretion

- MV3 plumbing details (mixed-content routing, synchronous onMessage, MutationObserver + timeout, host_permissions) — locked by ROADMAP pitfalls; planner/researcher own them.
- Validating live Shopee selectors at plan/research time (ROADMAP research flag).

## Deferred Ideas

- On-page injected overlay capture button — later UX enhancement.
- Offline capture queue + background retry — revisit if backend-down captures become common.
- Lazada & TikTok parsers — Phase 8.
- Server-served / live-editable selector config — revisit if no-reload updates are needed.
