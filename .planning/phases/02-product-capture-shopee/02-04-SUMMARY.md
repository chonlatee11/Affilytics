---
phase: 02-product-capture-shopee
plan: "04"
subsystem: extension
tags: [parser, content-script, shopee, wxt, mutation-observer, config-driven]
dependency_graph:
  requires: [02-01, 02-03]
  provides: [extension/parsers/shopee.ts, extension/parsers/index.ts, extension/entrypoints/content.ts]
  affects: [02-05]
tech_stack:
  added: []
  patterns:
    - parseShopee(doc, selectors): synchronous parser with MutationObserver waitForElement for SPA DOM
    - getParser(platform) factory dispatching by platform string
    - defineContentScript with runtime.getURL for config-driven selector loading
key_files:
  created:
    - extension/parsers/shopee.ts
    - extension/parsers/index.ts
    - extension/entrypoints/content.ts
  modified: []
decisions:
  - "wxt/utils/define-content-script is the correct WXT 0.20.26 import path; wxt/sandbox does not exist in this version"
  - "priceRange and price are counted as separate fields (2 of 8) to match fixture test expectations; fixture has distinct CSS classes for each"
  - "parseShopee accepts a Document parameter (not global document) for fixture-testability in bun test"
metrics:
  duration: "~20 minutes"
  completed: "2026-06-25"
  tasks: 2
  files_changed: 3
---

# Phase 02 Plan 04: Shopee Parser + Content Script Entrypoint Summary

**One-liner:** Config-driven Shopee DOM parser with MutationObserver SPA wait, graceful null fields (CAP-03), and a WXT content script that loads selectors at runtime via browser.runtime.getURL.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | parseShopee + waitForElement + parser factory | 4815645 | extension/parsers/shopee.ts, extension/parsers/index.ts |
| 2 | Content script entrypoint (runtime selector load + readPage) | b5cf7ed | extension/entrypoints/content.ts |

## What Was Built

### Task 1: parseShopee + waitForElement + getParser

**`extension/parsers/shopee.ts`** exports:

- `waitForElement(selector, timeout=10_000)` — checks `document.querySelector` first; if not found, creates a MutationObserver on `document.body` with `{childList:true,subtree:true}` and a setTimeout that disconnects and resolves null after timeout. Handles Shopee's React SPA async DOM load.

- `parseShopee(doc, selectors)` — accepts a Document argument (fixture-testable). Reads each of 8 fields via `doc.querySelector(selector).textContent` (never innerHTML — T-02-PARSE-1). Normalizes via `parsePrice`/`parseCount`/`parseDiscount` from `lib/normalizer.ts`. Counts non-null parsed fields into `fieldsRead`; `fieldsTotal=8`; `platform='shopee'`; never throws (CAP-03).

**`extension/parsers/index.ts`** exports:

- `getParser(platform)` — dispatches to `parseShopee` for 'shopee'; throws "not implemented in Phase 2" for lazada/tiktok.

**Tests:** 5/5 GREEN — full fixture (fieldsRead=8), partial fixture (fieldsRead=2), price=290 for range `฿290-฿500`, correct rating/reviewCount/salesCount, CAP-03 no-throw on empty document.

### Task 2: Content Script Entrypoint

**`extension/entrypoints/content.ts`** — WXT `defineContentScript` with:
- `matches: ['*://shopee.co.th/*', '*://www.shopee.co.th/*']`
- `runAt: 'document_idle'`
- All runtime code inside `main()` (no top-level DOM access — WXT imports file in Node at build time)
- `onMessage('readPage')` handler that loads `selectors.config.json` via `browser.runtime.getURL('/selectors.config.json')` + `fetch()` at runtime (NOT a static import — keeps config editable without rebuild per CAP-05/D-06)
- Calls `parseShopee(document, config.shopee)` and returns the RawProduct
- No `fetch` to localhost or 127.0.0.1 (T-02-PARSE-3 mixed-content rule honored)

## Verification Results

```
bun test lib/parsers.test.ts → 5 pass, 0 fail
bun run build → Finished in 343ms (content-scripts/content.js 18.06 kB bundled)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] wxt/sandbox import path does not exist in WXT 0.20.26**
- **Found during:** Task 2 — `bun run build` failed with `"./sandbox" is not exported under the conditions ["module", "node", "production", "import"]`
- **Issue:** The PATTERNS.md code example used `import { defineContentScript } from 'wxt/sandbox'` which does not exist in WXT 0.20.26's package exports
- **Fix:** Changed import to `wxt/utils/define-content-script` which is the correct export path in this version (confirmed via `wxt/package.json` exports field)
- **Files modified:** extension/entrypoints/content.ts
- **Commit:** b5cf7ed

**2. [Rule 1 - Bug] priceRange/price field counting**
- **Found during:** Task 1 — first test run showed `fieldsRead === 7` instead of 8
- **Issue:** Initial implementation combined priceRange+price into a single logical field, counting only one. The test fixture has distinct CSS classes for both and expects both to be counted separately (8 fields total: name, price, priceRange, discountBadge, rating, reviewCount, salesCount, shop)
- **Fix:** Count price and priceRange as separate fields; priceRange increments `fieldsRead` when its selector matches regardless of price
- **Files modified:** extension/parsers/shopee.ts
- **Commit:** 4815645

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. Content script additions match the planned trust boundary (Shopee page DOM → ISOLATED world content script; selectors.config.json via web_accessible_resources).

## Known Stubs

None — the parser and content script are fully wired. The content script calls `parseShopee(document, config.shopee)` with the real production selectors from `selectors.config.json`. No mock data or placeholder values.

## Self-Check: PASSED

- [x] extension/parsers/shopee.ts exists
- [x] extension/parsers/index.ts exists
- [x] extension/entrypoints/content.ts exists
- [x] Commit 4815645 exists (parsers)
- [x] Commit b5cf7ed exists (content script)
- [x] `bun test lib/parsers.test.ts` → 5/5 GREEN
- [x] `bun run build` → exits 0
