---
phase: 02-product-capture-shopee
plan: 03
subsystem: extension
tags: [normalizer, messaging, webext-core, typescript, pure-functions, d-09]

# Dependency graph
requires:
  - phase: 02-product-capture-shopee
    provides: normalizer.test.ts RED tests (plan 02-01) that this plan makes GREEN
provides:
  - extension/lib/normalizer.ts — parsePrice, parseCount, parseDiscount pure functions (D-09)
  - extension/lib/messaging.ts — defineExtensionMessaging ProtocolMap + RawProduct/CapturePayload types
affects:
  - 02-04 (content script uses onMessage readPage)
  - 02-05 (popup uses sendMessage readPage + saveProduct)
  - 02-06 (background uses onMessage saveProduct)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure function normalization: no DOM access; parsePrice/parseCount/parseDiscount are standalone utils"
    - "defineExtensionMessaging<ProtocolMap>() for type-safe content↔background↔popup messaging"
    - "RawProduct has nullable fields (name|null, price|null) — CapturePayload requires name: string for backend"

key-files:
  created:
    - extension/lib/normalizer.ts
    - extension/lib/messaging.ts
  modified: []

key-decisions:
  - "RawProduct.name is string|null (parser may not find it); CapturePayload.name is string (operator must confirm before Save)"
  - "parsePrice splits on '-' after stripping ฿/commas/whitespace — handles both single price and range"
  - "parseCount checks Thai suffixes (ล้าน/แสน/หมื่น/พัน) before English k/m — order prevents partial matches"

patterns-established:
  - "normalizer: strip currency symbols and whitespace before splitting ranges"
  - "messaging: single ProtocolMap shared by all entrypoints; never raw browser.runtime.sendMessage"

requirements-completed: [CAP-01]

# Metrics
duration: 15min
completed: 2026-06-25
---

# Phase 02 Plan 03: Normalizer + Messaging Protocol Summary

**D-09 normalization helpers (parsePrice/parseCount/parseDiscount) passing 19 tests GREEN, plus typed @webext-core/messaging ProtocolMap with RawProduct/CapturePayload contract for popup↔content↔background**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-25T14:24:00Z
- **Completed:** 2026-06-25T14:39:00Z
- **Tasks:** 2 completed
- **Files modified:** 2 created

## Accomplishments

- D-09 normalizer pure functions (parsePrice, parseCount, parseDiscount) fully implemented and 19/19 bun tests GREEN
- Thai abbreviation handling: ล้าน (1M), แสน (100K), หมื่น (10K), พัน (1K) working correctly alongside English k/m
- Price range parsing: "฿290 - ฿500" → 290 (lowest) including reverse order "฿500 - ฿290" → 290
- Typed @webext-core/messaging ProtocolMap defined — eliminates MV3 `return true` footgun for all downstream entrypoints

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement D-09 normalization helpers** - `e5d13b2` (feat)
2. **Task 2: Define the typed messaging protocol and data contract** - `867fe92` (feat)

**Plan metadata:** _(final docs commit below)_

## Files Created/Modified

- `extension/lib/normalizer.ts` — parsePrice (range→lowest, strip ฿/commas), parseCount (Thai ล้าน/แสน/หมื่น/พัน + English k/m), parseDiscount (strip %/minus, abs value)
- `extension/lib/messaging.ts` — RawProduct interface, CapturePayload extends Omit with name: string, ProtocolMap with readPage/saveProduct, exports sendMessage + onMessage

## Decisions Made

- `RawProduct.name` is `string | null` (parser may fail to find the name field); `CapturePayload.name` is `string` (required non-null by backend before Save) — PLAN.md `<interfaces>` block was authoritative over RESEARCH.md Pattern 2 which omitted nullability
- Thai suffix map orders longest first (ล้าน before shorter strings) to avoid partial replacement bugs

## Deviations from Plan

None — plan executed exactly as written. Both files match PATTERNS.md specifications.

## Issues Encountered

`bunx tsc --noEmit` reports pre-existing errors in `bun:test` type declarations (lib/*.test.ts) and one node_modules rollup type — these existed before this plan and originate in test files and `@aklinker1/rollup-plugin-visualizer`. No errors in the two new files created by this plan.

## Known Stubs

None — normalizer and messaging are complete implementations, not stubs.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. normalizer.ts is pure functions (no eval, regex-only per T-02-NORM-1 mitigation).

## Next Phase Readiness

- `extension/lib/normalizer.ts` ready for import in content script (plan 02-04)
- `extension/lib/messaging.ts` ready for import in all three entrypoints (content, background, popup)
- Downstream plans can use `sendMessage('readPage')` and `onMessage('saveProduct', handler)` with full type safety

---
*Phase: 02-product-capture-shopee*
*Completed: 2026-06-25*
