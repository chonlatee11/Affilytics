---
phase: 02-product-capture-shopee
plan: "05"
subsystem: ui
tags: [wxt, chrome-extension, vanilla-ts, tailwind, popup, messaging, background-sw]

# Dependency graph
requires:
  - phase: 02-product-capture-shopee
    provides: messaging protocol (sendMessage/onMessage), RawProduct/CapturePayload types (02-03), content script readPage handler (02-04), backend POST /api/products/capture (02-02)
provides:
  - background service worker forwarding saveProduct to 127.0.0.1:3000
  - popup 5-state UI (idle, review, zero-fields, offline, success) per UI-SPEC
  - full capture round-trip wired (popup → content → background → backend)
  - paste-URL fallback with platform auto-detection (CAP-04)
  - zero-fields warning with explicit fieldsRead===0 branch (D-07, B3)
  - backend-offline form preservation (D-08)
affects: [02-round-trip-verification, phase-03-frontend-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "defineBackground with synchronous onMessage registration (MV3 Pitfall 2 prevention)"
    - "Vanilla TS + Tailwind CDN popup (no React, no Vite React plugin in extension)"
    - "Security: element.value / textContent for all DOM-sourced strings — never innerHTML (T-02-POPUP-1)"
    - "127.0.0.1 literal IP for backend fetch from background SW (W2 invariant)"
    - "State machine via app.innerHTML replacement; data populated via element.value post-render"

key-files:
  created:
    - extension/entrypoints/background.ts
    - extension/entrypoints/popup/index.html (replaced stub)
    - extension/entrypoints/popup/main.ts (replaced stub)
  modified: []

key-decisions:
  - "background.ts uses defineBackground from wxt/utils/define-background (matches WXT 0.20.26 import path used by content.ts)"
  - "Popup state machine uses innerHTML for screen skeleton HTML (static labels only) then element.value for all product data (XSS mitigation)"
  - "detectPlatform() reads hostname from URL to auto-detect shopee/lazada/tiktok for CAP-04"
  - "readForm() validates name+price+URL client-side before calling saveProduct; highlights empty required fields amber"
  - "showOffline() inserts banner via createElement/textContent — never innerHTML with server error strings"

patterns-established:
  - "Background SW: register all onMessage handlers synchronously before any await inside defineBackground"
  - "Popup 5-state: innerHTML for structure, element.value for data, textContent for any untrusted string"
  - "Error handling: backend_offline sentinel string flows popup → State 4 (form preserved); other errors show banner"

requirements-completed: [CAP-01, CAP-02, CAP-03, CAP-04]

# Metrics
duration: 25min
completed: 2026-06-25
---

# Phase 2 Plan 05: Background SW + Popup 5-State UI Summary

**WXT background service worker + vanilla-TS popup implementing the full capture round-trip (click → read page → review form with N/8 badge → Save → POST 127.0.0.1:3000) with paste-URL fallback, zero-field warning, and offline form preservation**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-25T14:38:00Z
- **Completed:** 2026-06-25T14:39:56Z
- **Tasks:** 2/3 complete (Task 3 = pending human round-trip checkpoint)
- **Files modified:** 3

## Accomplishments

- Background service worker (`background.ts`) registers `onMessage('saveProduct')` synchronously at top level of `defineBackground` (MV3 Pitfall 2 compliance), fetches exactly `http://127.0.0.1:3000/api/products/capture` (W2 invariant), and returns `{ ok:false, error:'backend_offline' }` on network failure (D-08).
- Popup `index.html` shell: 380px wide, Noto Sans Thai font, Tailwind CDN — per UI-SPEC design tokens.
- Popup `main.ts` (581 lines): 5 states with exact Thai copy, teal+orange palette, and Lucide SVG icons from UI-SPEC. Explicit `fieldsRead === 0` branch routes to State 3 zero-fields warning + empty form (D-07, B3 traceability). Paste-URL `detectPlatform()` auto-detects shopee/lazada/tiktok and opens review form with URL prefilled (CAP-04). D-08: backend offline banner inserted above footer via `createElement`/`textContent` — form values untouched.
- Security: all product values written via `element.value` / `el.textContent` — zero `innerHTML` assignments from parsed page data (T-02-POPUP-1 mitigated).
- `cd extension && bun run build` exits 0; bundle size 67KB total.

## Task Commits

Each task was committed atomically:

1. **Task 1: Background service worker** - `d423c4a` (feat)
2. **Task 2: Popup 5-state UI** - `8d49189` (feat)
3. **Task 3: Manual round-trip verification** - PENDING (human checkpoint, see below)

## Files Created/Modified

- `extension/entrypoints/background.ts` — defineBackground, synchronous onMessage('saveProduct'), fetch 127.0.0.1:3000, backend_offline sentinel
- `extension/entrypoints/popup/index.html` — 380px shell, Noto Sans Thai, Tailwind CDN (replaced Phase 1 stub)
- `extension/entrypoints/popup/main.ts` — 5-state popup, all Thai copy, teal+orange tokens, XSS-safe field population (replaced Phase 1 stub)

## Decisions Made

- `wxt/utils/define-background` import path used (matches `wxt/utils/define-content-script` pattern established in 02-04; avoids `wxt/sandbox` which may differ per WXT version).
- `showOffline()` designed as a DOM mutation (banner insertion) rather than full re-render so the form input values are preserved exactly as the operator typed them (D-08 requirement).
- Server-error branch (non-offline errors from backend) also uses `textContent` to render the error string, preventing XSS from malicious server responses.
- `readForm()` returns `null` if required fields (name/price/URL) are absent; highlights them amber instead of showing a disruptive alert dialog.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- Initial verify check for `! grep -q "localhost:3000"` failed because documentation comments in `background.ts` contained the string "NOT http://localhost:3000". Resolved by rewriting those comment lines to say "NOT localhost" without the `:3000` suffix. No logic changed.

## Pending Human Checkpoint — Task 3

**Task 3 requires manual verification of the full round-trip on a live Shopee page.**

This cannot be automated: live Shopee DOM reads require a real browser session, and the anti-bot measures on shopee.co.th prevent scripted testing.

**Status:** BLOCKED — awaiting human verification (see ## CHECKPOINT REACHED below)

## Known Stubs

None. All popup states are fully wired:
- State 1 (Idle): wired to capture + paste-URL
- State 2 (Review): wired to Save + Cancel
- State 3 (Zero-fields): wired to Retry + Save
- State 4 (Offline): banner insertion, Save re-enabled
- State 5 (Success): auto-reset 3s + manual "จับสินค้าใหม่"

## Threat Flags

No new security surface introduced beyond the plan's threat model:
- `background.ts` makes outbound `fetch` only to `http://127.0.0.1:3000` (hardcoded; no operator-controlled URL)
- Popup receives `RawProduct` from content script and shows it in editable form inputs only
- No new network endpoints, no new auth paths, no new file access, no schema changes

## Self-Check: PASSED

Files created:
- extension/entrypoints/background.ts — FOUND
- extension/entrypoints/popup/index.html — FOUND (modified)
- extension/entrypoints/popup/main.ts — FOUND (modified)

Commits:
- d423c4a (Task 1 background.ts) — FOUND
- 8d49189 (Task 2 popup) — FOUND

Build: exits 0

---
*Phase: 02-product-capture-shopee*
*Completed: 2026-06-25 (Tasks 1–2; Task 3 pending human verification)*
