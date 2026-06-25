---
phase: 01-backend-foundation
plan: 03
subsystem: backend-boot
tags: [elysia, bun, cors, health-route, settings-route, fb-token-verify, aes-256-gcm, seed, boot-sequence, tdd, wave-2]

# Dependency graph
requires:
  - "01-01 (scaffold + Wave 0 RED tests)"
  - "01-02 (schema + crypto + client + env + migration)"
provides:
  - "backend/index.ts: full boot sequence — requireEncryptionKey→migrate→seed→Elysia(127.0.0.1:3000)+CORS+routes"
  - "backend/src/routes/health.ts: GET /health → 200 + DB connectivity check"
  - "backend/src/routes/settings.ts: POST /api/settings/fb-connect + GET /api/settings (explicit columns, no token)"
  - "backend/src/services/fbService.ts: verifyToken() against Graph API GET /me"
  - "backend/seed.ts: idempotent seedDefaultSettings() via onConflictDoNothing"
  - "backend/scripts/setup.ts: randomBytes(32) key generation into .env (no overwrite)"
  - "backend/README.md: full local run docs + fb-connect step"
  - "All Wave 2 tests GREEN: health.test.ts, settings.test.ts, seed.test.ts, server.test.ts (28/28 full suite)"
affects:
  - "02-extension (backend server available for HTTP roundtrip test)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern: boot sequence requireEncryptionKey→migrate→seed→Elysia at backend/ root (index.ts)"
    - "Pattern: CORS allowlist uses regex /^chrome-extension:\\/\\// for MV3 extension origins (Pitfall 5)"
    - "Pattern: Elysia serve.hostname: '127.0.0.1' explicit (Pitfall 4: default is 0.0.0.0)"
    - "Pattern: GET /api/settings fetches accessTokenEnc ONLY for decrypt probe; never in response object"
    - "Pattern: test isolation via db.delete(pages) in beforeEach when shared in-memory DB accumulates state"
    - "Pattern: seed.ts + index.ts at backend/ root (not src/) matching '../seed' and '../index' import paths in tests"

key-files:
  created:
    - "backend/index.ts — boot entry point; exports app; binds 127.0.0.1:3000"
    - "backend/src/routes/health.ts — GET /health: rawSqlite ping → {status:ok, db:connected}"
    - "backend/src/routes/settings.ts — POST /api/settings/fb-connect + GET /api/settings"
    - "backend/src/services/fbService.ts — verifyToken() fetches graph.facebook.com/v22.0/me"
    - "backend/seed.ts — seedDefaultSettings() with .onConflictDoNothing()"
    - "backend/scripts/setup.ts — randomBytes(32).toString('hex') into .env; no overwrite"
    - "backend/README.md — install→setup→dev→curl sequence + fb-connect docs"
  modified:
    - "backend/src/seed.test.ts — Rule 3: import '../db/client' → './db/client' (path fix)"
    - "backend/src/routes/settings.test.ts — Rule 1: added db.delete(pages) beforeEach for test isolation"

key-decisions:
  - "index.ts + seed.ts at backend/ root: test files import '../index' and '../seed' from src/ — same convention as env.ts"
  - "settings.test.ts cleanup pattern: beforeEach db.delete(pages) in T-1-FBVERIFY and T-1-DISCONNECT describes — shared in-memory DB accumulates state across describe blocks without cleanup"
  - "GET /api/settings fetches accessTokenEnc in SELECT but never returns it — decrypt probe pattern for fbConnected"
  - "CORS uses /^chrome-extension:\\/\\// regex (not string) per Pitfall 5 — chrome-extension:// not a valid origin string in some browsers"

requirements-completed: [FOUND-01, FOUND-03, SET-01]

# Metrics
duration: 10min
completed: 2026-06-24
---

# Phase 01 Plan 03: Boot Sequence + Routes + Setup Summary

**Full Walking Skeleton delivered: FB token verified against Graph API, encrypted AES-256-GCM, stored in SQLite, exposed via /api/settings without ever returning the token; backend binds 127.0.0.1:3000 with CORS allowlist; all 28 tests GREEN**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-06-24T11:47:00Z
- **Completed:** 2026-06-24T11:58:00Z
- **Tasks:** 3 completed
- **Files modified:** 7 created, 2 modified

## Accomplishments

- `fbService.ts` verifies pasted FB token via `GET graph.facebook.com/v22.0/me?fields=id,name` — rejects invalid token OR page-id mismatch; never logs raw token (T-1-EXPOSE)
- `seed.ts` inserts default settings row with 5-weight scoreWeights JSON and `.onConflictDoNothing()` — callable infinite times, always exactly 1 'default' row (D-08)
- `health.ts` GET /health pings DB via `rawSqlite().query('SELECT 1')` — returns `{status:ok,db:connected}` on success, 503 on DB failure (D-05)
- `settings.ts` POST /api/settings/fb-connect: TypeBox validation → verifyToken → encrypt → upsert pages row — returns 422 on invalid/mismatched token, never echoes the token
- `settings.ts` GET /api/settings: explicit column select, decrypt probe for fbConnected, `decrypt() === null` → `fbConnected: false` without throwing (D-04, T-1-DISCONNECT)
- `index.ts` boot sequence at exact order: requireEncryptionKey → migrate → seedDefaultSettings → Elysia(127.0.0.1:3000) + CORS + swagger + routes + listen
- `setup.ts` generates `randomBytes(32).toString('hex')` into `.env` without overwriting existing key (D-03)
- Full test suite: 28/28 tests GREEN across all 8 Wave 0+1+2 test files

## Task Commits

1. **Task 1: FB token verification service + idempotent settings seed** — `ca87520` (feat)
2. **Task 2: Health route + settings routes** — `b82140f` (feat)
3. **Task 3: Boot sequence + setup script + README** — `ecc9c04` (feat)

## Files Created/Modified

- `backend/index.ts` — Elysia boot entry; `serve.hostname: '127.0.0.1'`; CORS regex for chrome-extension; exports `app`
- `backend/src/routes/health.ts` — `healthRoutes` Elysia plugin; GET /health rawSqlite ping
- `backend/src/routes/settings.ts` — `settingsRoutes` Elysia plugin; POST /fb-connect (validate→verify→encrypt→upsert); GET '' (decrypt-probe, no token in response)
- `backend/src/services/fbService.ts` — `verifyToken(token, expectedPageId)` → `VerifyTokenResponse`; network failure → `{ok:false}`; token redacted in all logs
- `backend/seed.ts` — `seedDefaultSettings()` inserts `{id:'default',scoreWeights:JSON,draftMode:'template',dailyPostLimit:3,defaultTone:'casual'}` with `.onConflictDoNothing()`
- `backend/scripts/setup.ts` — first-run key generator; reads .env for existing key; exits 0 if found; otherwise writes `BUN_ENCRYPTION_KEY=<64-hex>`
- `backend/README.md` — install/setup/dev/curl sequence; fb-connect curl example; API table; env var table
- `backend/src/seed.test.ts` — Rule 3 fix: corrected import path `'../db/client'` → `'./db/client'`
- `backend/src/routes/settings.test.ts` — Rule 1 fix: added `db.delete(pages)` in `beforeEach` for T-1-FBVERIFY and T-1-DISCONNECT test isolation

## Decisions Made

- **index.ts + seed.ts at backend/ root**: Wave 0 tests import `'../index'` and `'../seed'` from `src/` — same convention established by `env.ts` in Plan 02.
- **beforeEach db.delete(pages) for test isolation**: Shared in-memory DB accumulates page rows across describe blocks. T-1-FBVERIFY and T-1-DISCONNECT tests require empty pages table to assert `fbConnected: false`. Cleanup added to both describe blocks.
- **GET /api/settings decrypt-probe pattern**: `accessTokenEnc` is fetched in SELECT only to call `decrypt()` — the result (`null` or string) drives `fbConnected`; the encrypted value never appears in the response object.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] seed.ts relocated to backend/ root (not src/)**
- **Found during:** Task 1 (test run)
- **Issue:** `src/seed.test.ts` imports `'../seed'` which resolves to `backend/seed.ts`, not `backend/src/seed.ts`. Module-not-found error.
- **Fix:** Created `seed.ts` at `backend/seed.ts`; updated imports to use `'./src/db/client'` and `'./src/db/schema'`
- **Files modified:** backend/seed.ts (location)
- **Commit:** ca87520

**2. [Rule 3 - Blocking] seed.test.ts import path for db/client**
- **Found during:** Task 1 (test run after seed.ts relocation)
- **Issue:** Wave 0 test `src/seed.test.ts` line 16 imports `'../db/client'` which resolves to non-existent `backend/db/client`. Line 42 correctly uses `'./db/client'` (dynamic import) — inconsistency within the same file.
- **Fix:** Changed static import on line 16 from `'../db/client'` to `'./db/client'`
- **Files modified:** backend/src/seed.test.ts
- **Commit:** ca87520

**3. [Rule 1 - Bug] settings.test.ts test isolation — shared DB contamination**
- **Found during:** Task 2 (settings.test.ts run)
- **Issue:** T-1-FBVERIFY test "invalid token does NOT persist" expected `fbConnected:false` but received `true` — because T-1-EXPOSE had already inserted a valid page row into the shared in-memory DB. T-1-DISCONNECT same problem.
- **Fix:** Added `await db.delete(pages)` in `beforeEach` for T-1-FBVERIFY describe block, and a one-time `await db.delete(pages)` at the start of T-1-DISCONNECT test.
- **Files modified:** backend/src/routes/settings.test.ts
- **Commit:** b82140f

**4. [Rule 3 - Blocking] index.ts located at backend/ root**
- **Found during:** Task 3 (design — following established convention)
- **Issue:** `src/server.test.ts` imports `'../index'` (dynamic) which resolves to `backend/index.ts`. Pattern established by env.ts and seed.ts.
- **Fix:** Created `index.ts` at `backend/index.ts` with correct relative imports `'./src/...'`
- **Files modified:** backend/index.ts (location decision)
- **Commit:** ecc9c04

---

**Total deviations:** 4 auto-fixed (2 Rule 3 blocking, 1 Rule 1 bug, 1 Rule 3 design convention)
**Impact on plan:** All necessary for test pass. No scope creep.

## Threat Surface Scan

All STRIDE mitigations from the plan's threat register implemented:

| Threat ID | Status | Mitigation |
|-----------|--------|-----------|
| T-1-LAN | Mitigated | `serve.hostname: '127.0.0.1'` in Elysia; server.test.ts asserts it |
| T-1-EXPOSE | Mitigated | accessTokenEnc never in response object; token not logged in fbService |
| T-1-FBVERIFY | Mitigated | verifyToken() against Graph API; 422 on invalid/mismatch; 5 tests assert it |
| T-1-DISCONNECT | Mitigated | decrypt() null → fbConnected:false; no throw; test asserts no 500 |
| T-1-KEY | Mitigated | setup.ts: randomBytes(32) into gitignored .env; never auto-generates silently |
| T-1-CORS | Mitigated | @elysiajs/cors allowlist: localhost + /^chrome-extension:\\/\\// regex |
| T-1-SC | Accepted | No new packages installed — all Phase 1 deps pre-approved in RESEARCH |

No new threat surface introduced.

## Known Stubs

None — all Phase 1 features are wired end-to-end:
- FB token verified against real API (mocked in tests, real in prod)
- Token encrypted at rest (AES-256-GCM)
- Settings returned with actual DB data (seeded on first boot)
- DB connected check via rawSqlite ping

## Self-Check

Files created:
- backend/index.ts: FOUND
- backend/src/routes/health.ts: FOUND
- backend/src/routes/settings.ts: FOUND
- backend/src/services/fbService.ts: FOUND
- backend/seed.ts: FOUND
- backend/scripts/setup.ts: FOUND
- backend/README.md: FOUND

Commits verified:
- ca87520: feat(01-03) Task 1 — FOUND
- b82140f: feat(01-03) Task 2 — FOUND
- ecc9c04: feat(01-03) Task 3 — FOUND

## Self-Check: PASSED
