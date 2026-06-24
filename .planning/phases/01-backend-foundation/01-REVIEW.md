---
phase: 01-backend-foundation
reviewed: 2026-06-24T12:30:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - backend/env.ts
  - backend/index.ts
  - backend/seed.ts
  - backend/scripts/setup.ts
  - backend/src/db/client.ts
  - backend/src/db/migrate.ts
  - backend/src/db/schema.ts
  - backend/src/routes/health.ts
  - backend/src/routes/settings.ts
  - backend/src/services/cryptoService.ts
  - backend/src/services/fbService.ts
  - backend/test/helpers/fbMock.ts
  - backend/drizzle.config.ts
  - backend/.env.example
  - backend/.gitignore
findings:
  critical: 2
  warning: 5
  info: 4
  total: 11
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-06-24T12:30:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Phase 01 delivers the backend foundation: SQLite schema + migrations, AES-256-GCM token encryption, Facebook token verification, settings routes, health check, and the boot sequence. The cryptographic implementation and token-non-exposure controls are solid. The `.gitignore` correctly excludes `.env` and `data/`. The server is bound to `127.0.0.1` and the CORS allowlist is appropriately restricted.

Two blockers were found. The most severe: tests using `':memory:'` cause `bun:sqlite` to materialise three un-gitignored files in the repository root (`file::memory:?cache=shared`, `file::memory:?cache=shared-shm`, `file::memory:?cache=shared-wal`). These files are currently untracked by git and will be committed if anyone runs `git add .`. The second blocker: `index.ts` calls `.listen(3000)` unconditionally — there is no `import.meta.main` guard despite the comment claiming one exists. Importing `index.ts` from any test file binds port 3000 at import time.

Five warnings cover: a redundant double-call to `migrate()`, an overly-permissive FB token `minLength` constraint, leaking the raw FB page ID in a 422 error detail, Swagger UI enabled unconditionally in production, and a `mock.restore()` in `fbMock.ts` that tears down all bun:test mocks indiscriminately.

---

## Critical Issues

### CR-01: In-memory DB URI creates un-gitignored files in repository root

**File:** `backend/src/db/client.ts:43`
**Issue:** `openDatabase(':memory:')` maps the path to the literal string `'file::memory:?cache=shared'` and passes it to `new Database(resolvedPath)`. SQLite interprets this as a filename — not a special URI — because `bun:sqlite` does not enable the URI filename feature by default. The result is three files created at the working directory of the process (the `backend/` root when running `bun test`):

```
backend/file::memory:?cache=shared
backend/file::memory:?cache=shared-shm
backend/file::memory:?cache=shared-wal
```

These files are confirmed present on disk and tracked by `git status` as untracked. The `.gitignore` patterns (`*.db`, `*.db-wal`, `*.db-shm`, `data/`) do not match these filenames because they have no `.db` extension and are not under `data/`. Any `git add .` will commit them, potentially alongside accumulated test data (the WAL file is 420 KB).

Additionally, WAL mode is not supported on in-memory SQLite databases. SQLite silently ignores `PRAGMA journal_mode=WAL` on in-memory connections and returns `'memory'` instead of `'wal'`. This means the test assertions `expect(result.journal_mode).toBe('wal')` in `schema.test.ts:26` and `pragma.test.ts:34` are asserting a property that does not hold for the test database — they pass only if the files on disk happen to have WAL set from a previous run, which is an accidental dependency.

**Fix:** Use the Bun-specific in-memory URI that is handled before filesystem resolution, or use a unique temp file path per test run and clean it up. The simplest correct approach for bun:sqlite is to use a random temp file:

```typescript
// In openDatabase(), replace the ':memory:' mapping entirely:
const isMemory = dbPath === ':memory:'
if (isMemory) {
  // bun:sqlite does not support the URI filename format for true in-memory DBs.
  // Use a temp file per test process to avoid leaking files in the repo root.
  const tmpPath = `/tmp/affilytics-test-${crypto.randomUUID()}.db`
  const sqlite = new Database(tmpPath)
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA busy_timeout = 5000')
  const db = drizzle(sqlite, { schema }) as AppDatabase
  rawHandles.set(db, sqlite)
  // Register cleanup so the temp file is removed when the handle is closed
  const originalClose = sqlite.close.bind(sqlite)
  sqlite.close = () => {
    originalClose()
    try { unlinkSync(tmpPath) } catch {}
    try { unlinkSync(tmpPath + '-wal') } catch {}
    try { unlinkSync(tmpPath + '-shm') } catch {}
  }
  try { migrate(db, { migrationsFolder: './drizzle' }) } catch (err) { /* same guard */ }
  return db
}
```

Alternatively, add the leaked files to `.gitignore` immediately as a stopgap:
```
# Leaked in-memory test DB files (bun:sqlite URI workaround)
file::memory:*
```

---

### CR-02: Missing `import.meta.main` guard — `index.ts` binds port 3000 on every import

**File:** `backend/index.ts:68`
**Issue:** The comment on line 67 states "we guard with Bun.main check" but no such guard exists anywhere in the file. The `.listen(3000)` call executes unconditionally at module load. Any test file that does `import { app } from '../index'` will bind port 3000 in that test process. In `server.test.ts` this is intentional and `app.stop()` is called in `afterAll`. However, if any future test file imports `index.ts` alongside `server.test.ts` in the same bun:test worker process (or if test isolation changes), the second import will attempt to bind an already-occupied port and throw, crashing the test run.

More critically, the claim in the code comment is simply wrong — a developer reading this will believe the guard is in place when it is not.

**Fix:** Add the `import.meta.main` guard:

```typescript
// At the bottom of index.ts, replace the bare .listen(3000):

if (import.meta.main) {
  app.listen(3000)
  console.log(
    `Listening on http://${app.server?.hostname}:${app.server?.port}`
  )
}
```

Export `app` without calling `.listen()` so tests can import and use `.handle()` or call `.listen()` themselves in a controlled way.

---

## Warnings

### WR-01: `migrate()` called twice on the same database instance at boot

**File:** `backend/index.ts:32`, `backend/src/db/client.ts:67`
**Issue:** The `db` singleton is created by `openDatabase()` at `client.ts:106`, which already calls `migrate(db, { migrationsFolder: './drizzle' })` internally at line 67. Then `index.ts` line 28 imports `db` (triggering `openDatabase()` and its internal migration), and then calls `migrate(db, ...)` a second time on line 32.

Drizzle's migrator is idempotent (it tracks applied migrations via a `__drizzle_migrations` table and skips already-applied ones), so no migration is applied twice. But the redundant call adds unnecessary startup overhead (file reads, SQL queries) and, more importantly, is a source of confusion: `migrate.ts` is a standalone script for manual runs; `openDatabase()` is the correct place for boot-time migrations; `index.ts` should not duplicate this. A future developer may remove the `client.ts` internal call assuming `index.ts` handles it (or vice versa), creating a regression.

**Fix:** Remove the explicit `migrate()` call from `index.ts`. Rely on `openDatabase()` to apply migrations as it already does. Delete the `import { migrate }` line from `index.ts` as well.

```typescript
// index.ts: remove lines 31-32 entirely
// import { migrate } from 'drizzle-orm/bun-sqlite/migrator'   ← DELETE
// migrate(db, { migrationsFolder: './drizzle' })              ← DELETE
```

---

### WR-02: FB token `minLength: 10` is excessively permissive

**File:** `backend/src/routes/settings.ts:69`
**Issue:** The TypeBox validator allows any string of 10 or more characters as a Facebook access token. Real Facebook Page access tokens are between 150 and 300+ characters. A 10-character "token" will pass validation, reach `verifyToken()`, make a live call to the Facebook Graph API, and receive a 4xx / error-in-body response — using a network round-trip to enforce what the input layer should have already rejected.

There is also no `maxLength` on either `pageId` or `accessToken`, so arbitrarily large payloads can be submitted. For a self-hosted tool this is a lower-severity concern, but the absence of an upper bound is still a quality gap.

**Fix:** Tighten to a realistic lower bound and add an upper bound:
```typescript
body: t.Object({
  pageId:      t.String({ minLength: 5,  maxLength: 64  }),
  accessToken: t.String({ minLength: 50, maxLength: 512 }),
}),
```

---

### WR-03: Facebook page ID disclosed in 422 error detail returned to client

**File:** `backend/src/services/fbService.ts:72`, `backend/src/routes/settings.ts:34`
**Issue:** When the token belongs to a different Facebook page than the one the operator entered, `verifyToken` returns:
```
error: `Page ID mismatch: token belongs to page ${data.id}, expected ${expectedPageId}`
```
This string is passed through to the HTTP 422 response body as `detail` (settings.ts line 34). For a single-operator self-hosted tool this is low-risk, but `data.id` is a Facebook Page ID retrieved from the live Graph API in response to the submitted token — it is information the operator may not have intentionally shared via the `pageId` form field, and leaking it in the 422 body is not useful for diagnosing the problem.

**Fix:** Remove the actual `data.id` from the error message. The operator knows what `expectedPageId` they entered; confirming the discrepancy is sufficient:
```typescript
// fbService.ts:72
error: `Token belongs to a different Facebook page than the one entered. Re-check your page ID.`,
```

---

### WR-04: Swagger UI enabled unconditionally with no environment guard

**File:** `backend/index.ts:62`
**Issue:** `swagger()` is registered unconditionally, meaning the OpenAPI documentation endpoint (`/swagger`) is always active, including in production deployments. The documentation exposes the full API surface, request/response schemas, and any internal type information visible to the OpenAPI generator. While the server is bound to `127.0.0.1`, the risk of exposure is low in normal operation; however, the comment in the code ("does not affect production behavior") is incorrect — it does affect the server's API surface and resource consumption.

**Fix:** Gate swagger behind a development-only flag:
```typescript
// index.ts
const isDev = process.env.NODE_ENV !== 'production'
const builder = new Elysia({ serve: { hostname: '127.0.0.1', port: 3000 } })
  .use(cors({ /* ... */ }))
if (isDev) builder.use(swagger())
builder
  .use(healthRoutes)
  .use(settingsRoutes)
  .listen(3000)
export const app = builder
```

---

### WR-05: `restoreFetch()` calls `mock.restore()` which tears down ALL bun:test mocks globally

**File:** `backend/test/helpers/fbMock.ts:85`
**Issue:** `mock.restore()` is a global operation in bun:test — it restores all mocks registered in the current test file, not just the `globalThis.fetch` mock installed by `installFbMock`. If any other mock (e.g., a module mock) is installed alongside the FB mock in the same test file, calling `restoreFetch()` in `afterEach` will remove those unrelated mocks too, potentially causing test failures that are hard to diagnose. The comment in the file acknowledges the problem but does not fix it.

Furthermore, the `originalFetch` reference captured in `installFbMock` is never reassigned back to `globalThis.fetch` in `restoreFetch()`. The cleanup relies entirely on `mock.restore()` doing the right thing; if bun:test's `mock.restore()` does not reset `globalThis.fetch` (it may only restore module mocks, not property mocks on `globalThis`), the override persists between tests.

**Fix:** Restore `globalThis.fetch` explicitly using the captured reference, and remove the `mock.restore()` call:

```typescript
// Store original fetch at module level for reuse across installFbMock calls
let _originalFetch: typeof globalThis.fetch | null = null

export function installFbMock(fixture: FbFixture): void {
  if (!_originalFetch) _originalFetch = globalThis.fetch
  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    // ... existing mock body ...
  }) as typeof globalThis.fetch
}

export function restoreFetch(): void {
  if (_originalFetch) {
    globalThis.fetch = _originalFetch
    _originalFetch = null
  }
}
```

---

## Info

### IN-01: `src/db/migrate.ts` is a dead standalone script with no `import.meta.main` guard

**File:** `backend/src/db/migrate.ts:18-20`
**Issue:** `migrate.ts` is intended as a `bun run src/db/migrate.ts` standalone CLI script, but it has no `import.meta.main` guard. If any code ever imports from this module (even accidentally via a glob import or test runner), `migrate()` and `console.log('Migrations applied successfully.')` will execute as a side effect. The `console.log` is also an inappropriate output for a library module.

**Fix:**
```typescript
// migrate.ts
if (import.meta.main) {
  migrate(db, { migrationsFolder: './drizzle' })
  console.log('Migrations applied successfully.')
}
```

---

### IN-02: `index.ts` boot sequence comment claims a guard that does not exist

**File:** `backend/index.ts:67`
**Issue:** The comment reads "When imported by tests, `.listen()` would bind the port — we guard with Bun.main check". This comment is factually incorrect (see CR-02). The misleading comment increases cognitive overhead: a developer fixing an unrelated issue will read the comment and assume port isolation is handled, missing the real risk.

**Fix:** Remove the incorrect comment when implementing the `import.meta.main` guard in CR-02.

---

### IN-03: `health.ts` returns `new Response(...)` from an Elysia handler instead of using `set.status`

**File:** `backend/src/routes/health.ts:24-31`
**Issue:** The error branch returns `new Response(JSON.stringify(...), { status: 503 })` directly. Elysia handlers are designed to return plain objects; Elysia serializes them and applies the status code from `set.status`. Returning a raw `Response` object bypasses Elysia's response pipeline (after-hooks, serializers, type inference). For the current simple case this works, but it is inconsistent with the rest of the codebase and will break if response interceptors are added later.

**Fix:** Use Elysia's `set` context parameter:
```typescript
.get('/health', ({ set }) => {
  try {
    rawSqlite(db).query('SELECT 1').get()
    return { status: 'ok', db: 'connected' }
  } catch {
    set.status = 503
    return { status: 'error', db: 'disconnected' }
  }
})
```

---

### IN-04: `.env.example` documents a `PORT` variable that `index.ts` ignores

**File:** `backend/.env.example:17-18`, `backend/index.ts:44-46`
**Issue:** `.env.example` contains a commented-out `PORT=3000` entry with the implication that the port is configurable. However, `index.ts` hardcodes port `3000` in both `serve: { port: 3000 }` and `.listen(3000)` — `process.env.PORT` is never read. An operator who sets `PORT=4000` in `.env` expecting the server to move will be surprised to find it still bound to 3000.

**Fix:** Either remove the `PORT` comment from `.env.example` to avoid confusion, or honour the variable:
```typescript
const port = parseInt(process.env.PORT ?? '3000', 10)
export const app = new Elysia({ serve: { hostname: '127.0.0.1', port } })
  // ...
  .listen(port)
```

---

_Reviewed: 2026-06-24T12:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
