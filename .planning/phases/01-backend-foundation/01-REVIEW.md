---
phase: 01-backend-foundation
reviewed: 2026-06-24T13:51:11Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - backend/index.ts
  - backend/env.ts
  - backend/src/db/client.ts
  - backend/src/routes/fbOauth.ts
  - backend/src/routes/fbOauth.test.ts
  - backend/src/services/fbService.ts
  - backend/src/services/fbService.test.ts
  - backend/src/seed.test.ts
  - backend/src/server.test.ts
findings:
  critical: 2
  warning: 5
  info: 2
  total: 9
status: issues_found
---

# Phase 01: Gap-Closure Code Review Report

**Reviewed:** 2026-06-24T13:51:11Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

This review covers the gap-closure implementation for Phase 01: the revised boot sequence (`index.ts`), fail-fast env validation (`env.ts`), in-memory temp-file DB fix (`client.ts`), the new Facebook OAuth Page-connect flow (`fbOauth.ts` + `fbService.ts`), and their accompanying tests (`fbOauth.test.ts`, `fbService.test.ts`, `seed.test.ts`, `server.test.ts`).

The AES-256-GCM encryption, CSRF state machine, token non-exposure in HTTP responses, `import.meta.main` guard, WAL/PRAGMA ordering, and temp-file cleanup are all correctly implemented. The `pendingStates` replay prevention is correct. The `requireEncryptionKey()` fail-fast and `requireFbOAuthConfig()` lazy-read design are sound.

Two critical findings: `seed.test.ts` sets `DATABASE_URL` inside `beforeAll` but the `db` singleton is already initialized by a static top-level import — the test may silently operate on the real database file. `exchangeCodeForToken` sends `client_secret` in a GET URL query string, violating RFC 6749 §2.3.1 and risking the secret appearing in Facebook's server-side access logs and potentially in Bun's `fetch` error messages that are written to `console.error`.

---

## Critical Issues

### CR-01: `seed.test.ts` — `DATABASE_URL` set in `beforeAll` after static import already initialized the `db` singleton

**File:** `backend/src/seed.test.ts:15`
**Issue:** Line 15 is a static top-level import of `../seed`. Importing `seed.ts` triggers its module-level `import { db } from './src/db/client'` (seed.ts line 11), which evaluates `client.ts` line 126: `export const db = openDatabase()`. At that instant `process.env.DATABASE_URL` has NOT been set — `beforeAll` on line 19 runs only after all module-level code completes. Consequently the DB singleton opens `data/affilytics.db` (the real production database file) instead of the temp path that `:memory:` resolves to. When tests later call `await import('./db/client')` they get the cached singleton pointing at the real file.

Concrete risks:
1. Tests that call `seedDefaultSettings()` twice write rows to the real database.
2. Test assertions see production data contaminating results.
3. Tests are non-deterministic across environments depending on what `data/affilytics.db` contains.

```
// Current broken order (seed.test.ts):
import { seedDefaultSettings } from '../seed'   // ← triggers db open with wrong path
import { settings } from './db/schema'

describe('...', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = ':memory:'   // ← TOO LATE, db already open
  })
```

**Fix:** Move all `process.env` assignments to module level, before any static imports that reach `client.ts`. This is already the pattern used correctly in `fbOauth.test.ts` (lines 26-30):

```typescript
// seed.test.ts — CORRECT ORDER

// 1. Set env vars at module scope BEFORE any db-touching import
process.env.BUN_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DATABASE_URL = ':memory:'

// 2. Now safe to import modules that transitively open the db
import { test, expect, describe } from 'bun:test'
import { seedDefaultSettings } from '../seed'
import { settings } from './db/schema'

// beforeAll is no longer needed for env setup
```

---

### CR-02: `fbService.ts` — `client_secret` sent in GET URL query string (RFC 6749 §2.3.1 violation)

**File:** `backend/src/services/fbService.ts:140-150`
**Issue:** `exchangeCodeForToken` appends `client_secret` to a URL query string and issues a GET request:

```typescript
const params = new URLSearchParams({
  client_id: appId,
  client_secret: appSecret,   // ← FB_APP_SECRET in URL query string
  redirect_uri: redirectUri,
  code,
})
const url = `https://graph.facebook.com/v22.0/oauth/access_token?${params.toString()}`
const response = await fetch(url)   // ← GET with secret in URL
```

RFC 6749 §2.3.1 states: "The authorization server MUST NOT include the client credentials in the request-URI." Beyond the spec violation, the constructed URL containing `FB_APP_SECRET` appears in:

1. **Facebook's own server-side access logs** — all GET URLs are logged at the TLS terminator.
2. **Bun's `fetch` error messages** — some runtimes include the full request URL in network error messages (e.g., `"Failed to connect to graph.facebook.com:443 …?client_secret=SECRET…"`). Line 177 logs `err.message` via `console.error`, so any such error writes the secret to the server's log stream.
3. **Any proxy or CDN** between the backend and Facebook (not applicable in the expected localhost deployment, but it represents a latent risk if deployment topology changes).

The comment on line 142 (`// T-1-SECRET: used in URL but never logged`) is only partially correct: the URL itself is never logged directly, but `err.message` may contain it.

**Fix:** Use POST with `application/x-www-form-urlencoded` body — which Facebook Graph API fully supports for this endpoint:

```typescript
export async function exchangeCodeForToken(code: string): Promise<ExchangeCodeResult> {
  const { appId, appSecret, redirectUri } = requireFbOAuthConfig()

  const url = `https://graph.facebook.com/v22.0/oauth/access_token`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,   // stays in POST body, not URL
        redirect_uri: redirectUri,
        code,
      }).toString(),
    })
    // ... rest unchanged
```

The mock in `fbService.test.ts` matches on `url.includes('oauth/access_token')` and is method-agnostic — no test changes are required.

---

## Warnings

### WR-01: `fbOauth.ts` — FB user-denial OAuth error params are silently ignored; state is consumed regardless

**File:** `backend/src/routes/fbOauth.ts:98-109`
**Issue:** When the operator denies the Facebook permission dialog, Facebook redirects to the callback with `?error=access_denied&error_reason=user_denied&error_description=...&state=<state>` — no `code` parameter. The current handler:

1. Finds the valid state → consumes it (line 104)
2. Checks `!code` → returns `{ error: 'missing_code' }` (line 107-109)

The state is correctly consumed (preventing replay), but `query.error` / `query.error_description` supplied by Facebook are never read. The operator receives a generic `missing_code` response with no indication of whether they were denied, cancelled, or hit a network problem. The state is burned on user-denial, requiring a full restart from `/authorize` with no explanation.

**Fix:** Check the Facebook-supplied error parameters before the code check:

```typescript
// After pendingStates.delete(state) — still inside the callback handler:
const fbOAuthError = query.error as string | undefined
if (fbOAuthError) {
  const detail = (query.error_description as string | undefined) ?? fbOAuthError
  set.status = 400
  return { error: 'fb_oauth_denied', detail }
}

if (!code) {
  set.status = 400
  return { error: 'missing_code' }
}
```

---

### WR-02: `fbOauth.ts` — `pendingStates` Set is unbounded with no TTL or max-size cap

**File:** `backend/src/routes/fbOauth.ts:37`
**Issue:** Every call to `GET /api/settings/fb-oauth/authorize` adds a 32-hex-char state to `pendingStates`. States are removed only on successful callback. Abandoned or incomplete OAuth flows (browser closed, operator navigated away, server restart test, callback returns 4xx) accumulate states indefinitely. The code comment acknowledges the absence of TTL and claims it is correct ("state_mismatch → retry"), but does not address the unbounded growth.

For a single-operator self-hosted tool the practical risk is low. However, states from stale browser sessions or integration test runs can accumulate across the lifetime of the process.

**Fix:** Replace the `Set` with a `Map` keyed by state and valued by expiry timestamp:

```typescript
const pendingStates = new Map<string, number>()  // state → Date.now() expiry
const STATE_TTL_MS = 10 * 60 * 1000             // 10 minutes

// In /authorize:
pendingStates.set(state, Date.now() + STATE_TTL_MS)

// In /callback validation:
const expiry = pendingStates.get(state ?? '')
if (!state || expiry === undefined || Date.now() > expiry) {
  set.status = 400
  return { error: 'state_mismatch' }
}
pendingStates.delete(state)
```

---

### WR-03: `fbService.ts` — `console.error` in `catch` blocks logs `err.message` which may contain the request URL

**File:** `backend/src/services/fbService.ts:175-178`
**Issue:** The `catch` block for `exchangeCodeForToken` logs the stringified `err.message`:

```typescript
console.error(`fbService.exchangeCodeForToken: network/parse error: ${message}`)
```

When `fetch` fails (DNS, TLS, timeout), some runtimes include the full request URL in the error message text (e.g., `"Failed to fetch: https://graph.facebook.com/…?client_secret=SECRET"`). Since the current implementation (see CR-02) puts `client_secret` in the URL query string, this log line can write `FB_APP_SECRET` to stdout/stderr in plaintext.

**Fix:** This finding is fully mitigated by fixing CR-02 (moving `client_secret` to the POST body removes it from the URL). Once fixed, `err.message` cannot contain the secret. No additional change needed beyond CR-02.

---

### WR-04: `index.ts` — `db` imported only for boot-ordering side-effects with no explicit marker

**File:** `backend/index.ts:30`
**Issue:** `import { db } from './src/db/client'` is the only reference to `db` in `index.ts`. The variable is never used. The import exists to guarantee the singleton is initialized (and migrations are applied) before any route handler could invoke a database operation. This is a valid technique but it is fragile: a future developer running a linter or IDE "remove unused imports" action will delete this line, breaking the boot ordering guarantee silently. The comment on line 29 partially explains the intent but does not prevent the removal.

**Fix:** Change to an explicit side-effect import and add a warning comment:

```typescript
// Side-effect import: ensures DB singleton is opened and migrations applied
// before the first route handler executes. DO NOT remove.
import './src/db/client'
```

This removes the unused named binding while preserving the side-effect.

---

### WR-05: `index.ts` root-level files excluded from `tsconfig.json` — no TypeScript checking

**File:** `backend/tsconfig.json:15` / `backend/index.ts`, `backend/env.ts`, `backend/seed.ts`
**Issue:** `tsconfig.json` `include` is `["src/**/*", "scripts/**/*", "test/**/*"]`. The three root-level files `index.ts`, `env.ts`, and `seed.ts` are not in any of these globs. Running `tsc --noEmit` does not check these files for type errors. These files contain critical logic: the fail-fast key validation (`env.ts`), the application entry point (`index.ts`), and database seeding (`seed.ts`). A type error in any of them (wrong return type on `requireEncryptionKey()`, missing `await` on `seedDefaultSettings()`, etc.) will not be caught by CI type-checking.

**Fix:** Add root-level TypeScript files to the include glob:

```json
"include": ["*.ts", "src/**/*", "scripts/**/*", "test/**/*"]
```

---

## Info

### IN-01: `server.test.ts` — `app.listen(3000)` in `beforeAll` has no guard against already-bound port

**File:** `backend/src/server.test.ts:21`
**Issue:** `beforeAll` calls `app.listen(3000)` unconditionally. If `bun test` runs `server.test.ts` in the same worker process as another test file that already bound port 3000 (possible if test isolation changes or if the module cache contains an already-listening `app` from another file's `beforeAll`), this call will conflict. There is no check for `app.server` being already set before calling `listen`:

```typescript
const { app } = await import('../index')
app.listen(3000)   // ← no guard: what if already listening?
```

**Fix:** Guard the listen call with a check on `app.server`:

```typescript
const { app } = await import('../index')
if (!app.server) {
  app.listen(3000)
}
```

---

### IN-02: `fbOauth.ts` — Scopes include `business_management` which is not needed for Phase 1 Dev-Mode page-connect

**File:** `backend/src/routes/fbOauth.ts:45`
**Issue:** `FB_SCOPES` includes `business_management`. For the Phase 1 Dev-Mode flow the only required scopes are `pages_show_list` (enumerate operator's pages) and `pages_read_engagement` (read metrics). `business_management` is a sensitive scope that requires App Review for broad access and may trigger additional permission dialogs for the operator. Including it unnecessarily increases the permission surface.

**Fix:** Remove `business_management` from the scope string for Phase 1:

```typescript
const FB_SCOPES = 'pages_show_list,pages_read_engagement'
```

Add it back in Phase 5 (Facebook Publishing) when `pages_manage_posts` and related scopes are added.

---

_Reviewed: 2026-06-24T13:51:11Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
