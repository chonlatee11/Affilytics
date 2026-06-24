---
phase: 01-backend-foundation
verified: 2026-06-24T14:16:39Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 4/4
  gaps_closed:
    - "bun run dev now boots correctly (package.json dev script fixed to index.ts) — commit 2484314"
    - "In-memory test DB no longer writes file::memory:?cache=shared files to disk (client.ts uses tmpdir+randomUUID); file::memory:* in .gitignore; leaked files removed — commit 1efa43d"
    - "index.ts wraps .listen(3000) in if (import.meta.main); port not bound on test import; WR-01 double-migrate collapsed — commit 2484314"
    - "Facebook OAuth Page-connect flow implemented (GET /authorize + GET /callback); CSRF state; AES-256-GCM encrypt+store; token never returned in plaintext — commits b6f7f51, 85b0388"
    - "CR-02 resolved: exchangeCodeForToken now sends client_secret in POST application/x-www-form-urlencoded body (not GET URL query string), per RFC 6749 §2.3.1 — commit f4b3380. Verified in code: fbService.ts uses method:'POST' with client_secret in body; no client_secret appended to any URL string."
  gaps_remaining: []
  regressions: []
  partially_addressed:
    - "CR-01 (seed.test.ts test isolation): env vars moved to module scope (commit 1f7f872), but the root cause (ESM static-import hoisting evaluates client.ts's `export const db = openDatabase()` singleton BEFORE the module-scope process.env assignments execute) is NOT fully resolved. When seed.test.ts or fbOauth.test.ts is run in ISOLATION (single-file), the singleton opens data/affilytics.db with DATABASE_URL=undefined and the seed test writes a settings row to the real DB. When run via `bun test` (the full suite — the documented dev/CI command), an earlier-loaded test file initializes the singleton with DATABASE_URL=':memory:' first, so the full suite is prod-clean and deterministic (verified across 2 runs: 53/53 pass, data/affilytics.db NOT created). data/ is gitignored, so there is no risk of committing the file. Classified WARNING (not BLOCKER): the standard `bun test` command is clean; the leak only occurs on single-file isolated runs of these two files, and the artifact is gitignored."
overrides: []
gaps: []
deferred: []
human_verification: []
---

# Phase 01: Backend Foundation Verification Report (Re-Verification #2)

**Phase Goal:** Stand up the localhost Bun+Elysia backend with a SQLite database (WAL + busy_timeout), the full schema for every core entity, an encrypted Facebook token column, and a settings flow to connect a Facebook Page.
**Verified:** 2026-06-24T14:16:39Z
**Status:** passed
**Re-verification:** Yes — third pass. Initial 2026-06-24T19:20:00Z (gaps_found 3/4) → re-verify #1 (human_needed 4/4, CR-01/CR-02 pending) → this pass (passed 4/4, CR-02 resolved, CR-01 confirmed WARNING not BLOCKER).

---

## Re-Verification Summary

All 4 phase success criteria are VERIFIED (4/4). The two code-review Critical findings that previously held the status at `human_needed` were re-checked **directly in the source code and at runtime**, not from commit messages:

- **CR-02 (client_secret in URL): RESOLVED.** `fbService.ts` `exchangeCodeForToken` now issues `fetch(url, { method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({...client_secret...}) })`. `grep` confirms `client_secret` appears only in the POST body and code comments — never appended to a URL string. Commit f4b3380 exists and matches the code.
- **CR-01 (seed.test.ts isolation): PARTIALLY ADDRESSED, classified WARNING.** The env vars were moved to module scope (commit 1f7f872, confirmed in code), but a runtime probe proved this does NOT fix the root cause for single-file runs (ESM hoisting opens the singleton before the assignments run). However, the standard `bun test` command is deterministic and prod-clean (verified twice: 53/53 pass, `data/affilytics.db` not created), and `data/` is gitignored. This does not block any success criterion.

Full test suite: **53 pass, 0 fail** (10 files), deterministic across repeated runs.

---

## Gap Closure Status

| Gap (from prior verifications) | Status | Evidence / Commit |
|-------------------------------|--------|-------------------|
| `bun run dev` fails — dev script pointed at `src/index.ts` | CLOSED | `"dev": "bun run --watch index.ts"` — 2484314 |
| `file::memory:?cache=shared` files leaked, not gitignored | CLOSED | `client.ts` tmpdir+randomUUID; `.gitignore` `file::memory:*`; `git status` clean — 1efa43d |
| `index.ts` no `import.meta.main` guard | CLOSED | Line 69 `if (import.meta.main)` — 2484314 |
| Facebook OAuth Page-connect flow absent (SET-01 / SC-3) | CLOSED | `fbOauth.ts` /authorize + /callback wired; 27 new tests — b6f7f51, 85b0388 |
| CR-02: client_secret in GET URL (security) | CLOSED | POST body, RFC 6749 compliant — f4b3380 |
| CR-01: seed.test.ts test isolation | WARNING (partial) | env vars at module scope (1f7f872); root cause persists for single-file runs only; `bun test` clean; `data/` gitignored |

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Backend starts on localhost and responds to a health/API request | VERIFIED | `package.json` `dev` = `bun run --watch index.ts`. `index.ts` root entry; `if (import.meta.main) app.listen(3000)` line 69. GET /health → `{"status":"ok","db":"connected"}`. |
| 2 | SQLite opens in WAL mode with busy_timeout set, and 7 tables exist | VERIFIED | `client.ts` lines 62-63: `PRAGMA journal_mode = WAL` + `PRAGMA busy_timeout = 5000` before drizzle(). Migration SQL creates products, product_extras, post_drafts, published_posts, result_entries, pages, settings. `bun test src/db/` → 4/4 pass. |
| 3 | Operator can connect a Facebook Page via OAuth; token stored encrypted (AES-256-GCM), never returned in plaintext | VERIFIED | `fbOauth.ts` /authorize → 302 + CSRF state; /callback validates state, `exchangeCodeForToken` (now POST body, CR-02 fixed) + `getPageAccessToken`, `encrypt(pageToken)` AES-256-GCM, upsert `pages.accessTokenEnc`, returns `{ok,pageName}` only. 17 fbOauth + 10 settings tests GREEN. T-1-SECRET now structurally enforced (secret in POST body). |
| 4 | API reachable only over localhost | VERIFIED | `serve: { hostname: '127.0.0.1', port: 3000 }`. CORS allowlist localhost + chrome-extension. `server.test.ts` asserts hostname `127.0.0.1`. |

**Score: 4/4 truths verified**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/package.json` | dev = `bun run --watch index.ts` | VERIFIED | grep → 1 |
| `backend/index.ts` | import.meta.main guard; no double-migrate; exports app; fbOauthRoutes wired | VERIFIED | Line 69 guard; `grep -c 'migrate(db'` → 0; `.use(fbOauthRoutes)` line 65 |
| `backend/src/db/client.ts` | tmpdir+randomUUID in-memory path | VERIFIED | Lines 50-51; `file::memory` only in comments |
| `backend/.gitignore` | `file::memory:*` + `data/` | VERIFIED | Both present |
| `backend/src/routes/fbOauth.ts` | /authorize + /callback; encrypt before store; no token in response | VERIFIED | All present |
| `backend/src/services/fbService.ts` | exchangeCodeForToken (POST body), getPageAccessToken | VERIFIED | CR-02 fixed: POST + form-urlencoded body; client_secret never in URL |
| `backend/env.ts` | requireFbOAuthConfig() fail-fast, never exposes secret value | VERIFIED | Throws var names only |
| `backend/src/seed.test.ts` | env vars at module scope | VERIFIED (code) / WARNING (effect) | Moved above imports, but ESM hoisting limits effect on single-file runs (see CR-01 note) |
| `backend/src/routes/fbOauth.test.ts` | 17 tests GREEN; no index.ts import | VERIFIED | 17/17 pass; grep → 0 |
| `backend/src/services/fbService.test.ts` | 8 tests GREEN | VERIFIED | 8/8 pass |
| `backend/README.md` | OAuth Dev-Mode, App Review = Phase 5 | VERIFIED | All grep checks match |

---

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `index.ts` | `fbOauth.ts` | `.use(fbOauthRoutes)` | VERIFIED |
| `fbOauth.ts` | `fbService.ts` | exchangeCodeForToken, getPageAccessToken | VERIFIED |
| `fbOauth.ts` | `cryptoService.ts` | encrypt(pageToken) | VERIFIED |
| `fbOauth.ts` | `schema.ts (pages)` | insert/onConflictDoUpdate | VERIFIED |
| `env.ts` | `fbOauth.ts` + `fbService.ts` | requireFbOAuthConfig() | VERIFIED |
| `fbService.ts` | Graph oauth/access_token | POST form-urlencoded (CR-02) | VERIFIED |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite GREEN (run 1) | `bun test` | 53 pass, 0 fail | PASS |
| Full test suite GREEN (run 2, determinism) | `bun test` | 53 pass, 0 fail | PASS |
| `bun test` does NOT touch production DB | `ls data/affilytics.db` after `bun test` (x2) | absent both runs | PASS |
| CR-02: no client_secret in any URL | `grep client_secret fbService.ts` | only POST body + comments | PASS |
| CR-02: exchange uses POST | code: `method: 'POST'` form-urlencoded | confirmed | PASS |
| CR-01: env vars at module scope | code: lines 19-20 above imports | confirmed (code) | PASS |
| CR-01: singleton path under single-file run | runtime probe: `bun test src/seed.test.ts` | resolvedPath=data/affilytics.db, DATABASE_URL=undefined | WARNING |
| Commits f4b3380, 1f7f872 exist | `git log` | both present | PASS |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status |
|-------------|-------------|-------------|--------|
| FOUND-01 | 01-01, 01-03, 01-04 | Backend on localhost, REST API | VERIFIED |
| FOUND-02 | 01-02 | SQLite WAL + busy_timeout + 7-entity schema | VERIFIED |
| FOUND-03 | 01-03 | localhost-only (127.0.0.1) | VERIFIED |
| SET-01 | 01-02, 01-03, 01-05 | FB Page connect via OAuth; encrypted at rest; never plaintext | VERIFIED |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/seed.test.ts` / `backend/src/db/client.ts` | seed.test 19-20 / client.ts 126 | Module-scope `process.env` assignment cannot precede the singleton open because ESM hoists static imports; `export const db = openDatabase()` at client.ts:126 runs first | WARNING (CR-01, partial) | Single-file isolated runs of seed.test.ts / fbOauth.test.ts open and write to data/affilytics.db. `bun test` (full suite) is clean and deterministic. data/ gitignored → no commit risk. Recommended future fix: lazy/getter singleton, or a dedicated test-DB env loaded via bunfig preload, or never import the module-level singleton in tests that set DATABASE_URL. |
| `backend/src/routes/fbOauth.ts` | 45 | `FB_SCOPES` includes `business_management` | INFO (IN-02) | Extra scope for Phase 1; harmless, revisit Phase 5 |
| `backend/src/routes/fbOauth.ts` | 37 | `pendingStates` Set unbounded, no TTL | INFO (WR-02) | Low risk for single-operator tool |

---

### Code Review Critical Findings — Final Assessment

#### CR-02: client_secret in GET URL — RESOLVED (verified in code)

`exchangeCodeForToken` (fbService.ts) was changed to `POST` with `application/x-www-form-urlencoded` body. `client_secret` is now in the request body, never in the URL query string — RFC 6749 §2.3.1 compliant. This also closes WR-03 (the catch-block `console.error(err.message)` can no longer leak the secret, since the URL no longer contains it). Verified by direct grep: `client_secret` appears only in the POST body construction and explanatory comments; no URL string concatenation includes it. Commit f4b3380 confirmed.

#### CR-01: seed.test.ts test isolation — WARNING (root cause persists, but not a SC blocker)

The fix (commit 1f7f872) moved `process.env.BUN_ENCRYPTION_KEY` and `process.env.DATABASE_URL = ':memory:'` to module scope above the static imports, mirroring fbOauth.test.ts. **This is necessary but not sufficient.** A runtime probe (temporary `console.error` of `resolvedPath` in `openDatabase`, removed after testing) proved:

- Single-file run `bun test src/seed.test.ts`: `openDatabase` resolves `data/affilytics.db` with `DATABASE_URL=undefined` — the singleton (`export const db = openDatabase()` at client.ts:126) is evaluated during static-import hoisting, BEFORE the module-scope `process.env` assignments execute. Inspecting `data/affilytics.db` afterward showed a real `settings` row was written.
- The same is true for `bun test src/routes/fbOauth.test.ts` in isolation.
- Full-suite run `bun test`: an earlier-loaded test file (schema/pragma, which call `openDatabase(':memory:')` explicitly, or another file whose module-scope env set wins the race) initializes the singleton with `DATABASE_URL=':memory:'`, so the singleton resolves a tmpdir path and the full suite never touches `data/affilytics.db` (verified absent across 2 consecutive `bun test` runs).

**Why this is WARNING, not BLOCKER:**
1. The documented and CI command is `bun test` (package.json `"test": "bun test"`), which is deterministic and prod-clean.
2. `data/` is gitignored, so an isolated-run-created `data/affilytics.db` cannot be accidentally committed.
3. No success criterion (SC-1..SC-4) depends on single-file test isolation; SC-2 (WAL/schema) is proven by schema.test.ts / pragma.test.ts using explicit `openDatabase(':memory:')` arguments, which are unaffected.

A clean fix (lazy singleton getter, or a bunfig `preload` that sets the test DB path globally) is recommended as follow-up hygiene but is not required for Phase 1 sign-off.

---

## Gaps Summary

No blocking gaps. All 4 success criteria VERIFIED (4/4). CR-02 resolved and verified in code. CR-01 is a residual test-hygiene WARNING that does not affect the standard `bun test` workflow (deterministic, prod-clean) and carries no commit risk (gitignored). Phase goal achieved: localhost Bun+Elysia backend with WAL+busy_timeout SQLite, full 7-entity schema, AES-256-GCM encrypted Facebook token column, and an OAuth Page-connect settings flow that never returns the token in plaintext.

**Recommended follow-up (non-blocking):** Convert the `db` export in `client.ts` to a lazy getter, or add a bunfig `preload` that sets `DATABASE_URL` before any module evaluates, so single-file test runs are also isolated from `data/affilytics.db`.

---

_Verified: 2026-06-24T14:16:39Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification: Yes (pass #3 — CR-02 resolved, CR-01 downgraded to WARNING after runtime probe; 4/4 truths, 53/53 tests green, deterministic)_
