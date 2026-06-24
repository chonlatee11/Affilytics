---
phase: 01-backend-foundation
fixed_at: 2026-06-24T14:10:00Z
review_path: .planning/phases/01-backend-foundation/01-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-06-24T14:10:00Z
**Source review:** .planning/phases/01-backend-foundation/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (Critical only, per task scope)
- Fixed: 2
- Skipped: 0

## Fixed Issues

### CR-01: seed.test.ts — DATABASE_URL set in beforeAll after static import already initialized the db singleton

**Files modified:** `backend/src/seed.test.ts`
**Commit:** 1f7f872
**Applied fix:** Moved `process.env.BUN_ENCRYPTION_KEY` and `process.env.DATABASE_URL` assignments from inside `beforeAll()` to module scope, above all static `import` statements. The `beforeAll` hook was removed as it no longer served any purpose. This mirrors the correct pattern in `fbOauth.test.ts` lines 26-30. The db singleton in `client.ts` is now guaranteed to read `:memory:` when `client.ts` module is first evaluated (triggered by the static import of `../seed`).

### CR-02: fbService.ts — client_secret sent in GET URL query string (RFC 6749 §2.3.1 violation)

**Files modified:** `backend/src/services/fbService.ts`
**Commit:** f4b3380
**Applied fix:** Changed `exchangeCodeForToken` from a GET request with `URLSearchParams` appended to the URL to a `POST` request with `Content-Type: application/x-www-form-urlencoded` body. The `client_secret` (FB_APP_SECRET) is now sent in the request body and never appears in the URL. The URL is now the bare endpoint string `'https://graph.facebook.com/v22.0/oauth/access_token'` with no query parameters. Facebook Graph API fully supports POST on this endpoint. The JSDoc comment and file-level endpoint list were updated to reflect POST. All mocks in `fbService.test.ts` and `fbOauth.test.ts` match on URL fragment only (method-agnostic) — no test changes were required.

**Post-fix verification:** `bun test` result: **53 pass, 0 fail** (unchanged from pre-fix baseline).

---

_Fixed: 2026-06-24T14:10:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
