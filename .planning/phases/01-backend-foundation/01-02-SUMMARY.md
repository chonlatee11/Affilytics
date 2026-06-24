---
phase: 01-backend-foundation
plan: 02
subsystem: db-crypto-bootstrap
tags: [drizzle-orm, bun-sqlite, aes-256-gcm, migrations, wal, tdd, wave-1]

# Dependency graph
requires:
  - "01-01 (scaffold + Wave 0 RED tests)"
provides:
  - "backend/src/db/schema.ts: all 7 Drizzle sqlite-core table definitions"
  - "backend/src/db/client.ts: openDatabase() with WAL + busy_timeout=5000 set before drizzle(); rawSqlite(db) function for test PRAGMA probes"
  - "backend/src/db/migrate.ts: synchronous migrate(db, { migrationsFolder: './drizzle' })"
  - "backend/env.ts: requireEncryptionKey() fail-fast on missing/malformed BUN_ENCRYPTION_KEY"
  - "backend/src/services/cryptoService.ts: encrypt()/decrypt() AES-256-GCM helpers"
  - "backend/drizzle/: generated SQL migration files (CREATE TABLE × 7 tables, committed)"
  - "All Wave 1 target tests GREEN: schema.test.ts, pragma.test.ts, cryptoService.test.ts, index.test.ts"
affects:
  - 01-03

# Tech tracking
tech-stack:
  added:
    - "drizzle-orm/bun-sqlite/migrator: synchronous migrate() call pattern"
    - "node:crypto AES-256-GCM: createCipheriv/createDecipheriv/randomBytes via bun:sqlite"
    - "file::memory:?cache=shared: in-memory SQLite with WAL support (for tests)"
  patterns:
    - "Pattern: PRAGMA journal_mode=WAL then PRAGMA busy_timeout=5000 on raw Database before drizzle() wraps it"
    - "Pattern: rawSqlite(db) function using WeakMap<AppDatabase, Database> to expose raw handle without global singleton"
    - "Pattern: env.ts at backend/ root (not src/) — import path '../env' from src/ submodule"
    - "Pattern: decrypt() wraps entire body in try/catch, returns null on ANY error (never throws)"
    - "Pattern: openDatabase(':memory:') maps to file::memory:?cache=shared for WAL test support"

key-files:
  created:
    - "backend/src/db/schema.ts — 7 sqliteTable definitions (products, product_extras, post_drafts, published_posts, result_entries, pages, settings)"
    - "backend/env.ts — requireEncryptionKey(): reads BUN_ENCRYPTION_KEY, validates 64 hex chars, returns 32-byte Buffer; throws on missing/malformed"
    - "backend/src/services/cryptoService.ts — encrypt()/decrypt() AES-256-GCM; base64(iv):base64(tag):base64(ciphertext) format; decrypt() returns null on any error"
    - "backend/src/db/client.ts — openDatabase() with PRAGMA ordering; rawSqlite(db) via WeakMap; db singleton; migration-not-found errors caught gracefully"
    - "backend/src/db/migrate.ts — synchronous migrate(db, { migrationsFolder: './drizzle' }); runnable standalone"
    - "backend/drizzle/0000_lyrical_the_initiative.sql — generated migration with CREATE TABLE × 7"
    - "backend/drizzle/meta/_journal.json — drizzle-kit migration journal (committed)"
    - "backend/drizzle/meta/0000_snapshot.json — drizzle-kit schema snapshot (committed)"
  modified:
    - "backend/src/db/pragma.test.ts — Rule 1 fix: PRAGMA busy_timeout returns column 'timeout' not 'busy_timeout'"

key-decisions:
  - "env.ts location at backend/ root (not src/): Wave 0 test src/index.test.ts imports '../env' which resolves to backend/env.ts, not backend/src/env.ts — test file is source of truth"
  - "rawSqlite() is a function not a const: Wave 0 tests call rawSqlite(db) passing db as argument; WeakMap-based lookup chosen over global singleton to support multiple openDatabase() calls in tests"
  - ":memory: mapped to file::memory:?cache=shared: standard :memory: database does not support WAL mode (memory-only); shared-cache URI database does — enables WAL tests to pass without file I/O"
  - "Migration errors caught in openDatabase(): drizzle/ directory may not exist before first drizzle-kit generate; catch allows client.ts to be imported before migrations are generated"

requirements-completed: [FOUND-02, SET-01]

# Metrics
duration: 18min
completed: 2026-06-24
---

# Phase 01 Plan 02: DB Schema + Crypto + Migration Summary

**Full 7-entity Drizzle schema, SQLite client with PRAGMA-before-drizzle ordering, AES-256-GCM field encryption, fail-fast key loading, and tracked generate+migrate SQL — all Wave 1 tests GREEN**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-24T11:45:00Z
- **Completed:** 2026-06-24T12:03:00Z
- **Tasks:** 3 completed
- **Files modified:** 8 created, 1 modified

## Accomplishments

- Full 7-entity schema defined with Drizzle sqlite-core (`sqliteTable` × 7): products, product_extras, post_drafts, published_posts, result_entries, pages, settings — all timestamp defaults use `sql\`(unixepoch())\`` not NOW()
- `env.ts` at `backend/` root provides `requireEncryptionKey()` fail-fast that validates 64-char hex BUN_ENCRYPTION_KEY → 32-byte Buffer; throws on missing, empty, or malformed key (D-03, T-1-KEY)
- `cryptoService.ts` AES-256-GCM with format `base64(iv):base64(tag):base64(ciphertext)`; `decrypt()` wraps entire body in try/catch and returns `null` on any error — never throws (D-04, T-1-DISCONNECT, Pitfall 6)
- `client.ts` `openDatabase()` sets PRAGMA journal_mode=WAL then PRAGMA busy_timeout=5000 on raw bun:sqlite `Database` object BEFORE `drizzle()` wraps it (Pitfall 2 ordering); `rawSqlite(db)` function via WeakMap for test PRAGMA probes
- `drizzle-kit generate` produced tracked SQL with CREATE TABLE × 7; `migrate.ts` applies synchronously (no await); drizzle/ files committed per D-07
- All 12 Wave 1 target tests GREEN: schema (WAL + 7 tables), pragma (busy_timeout + WAL), cryptoService (round-trip + wrong-key null), index (fail-fast throws)

## Task Commits

Each task was committed atomically:

1. **Task 1: Define full 7-entity Drizzle schema** — `bb20e71` (feat)
2. **Task 2: DB client + env fail-fast + AES-256-GCM crypto** — `ad0c346` (feat)
3. **Task 3: Generate tracked migration SQL + apply on boot** — `c2c26ad` (feat)

## Files Created/Modified

- `backend/src/db/schema.ts` — 7 `sqliteTable` definitions; `pages.fb_page_id` unique; `settings.id` default 'default'; all timestamps via `sql\`(unixepoch())\``
- `backend/env.ts` — `requireEncryptionKey()`: validates 64-char hex → 32-byte Buffer; throws on missing/empty/malformed
- `backend/src/services/cryptoService.ts` — `encrypt()`/`decrypt()` AES-256-GCM; lazy key resolution; `decrypt()` returns null on any error
- `backend/src/db/client.ts` — `openDatabase()` with PRAGMA ordering; `:memory:` → `file::memory:?cache=shared`; `rawSqlite(db)` WeakMap lookup; `db` singleton
- `backend/src/db/migrate.ts` — synchronous `migrate(db, { migrationsFolder: './drizzle' })`; standalone runnable
- `backend/drizzle/0000_lyrical_the_initiative.sql` — generated SQL migration (CREATE TABLE × 7)
- `backend/drizzle/meta/_journal.json` — migration journal (committed)
- `backend/drizzle/meta/0000_snapshot.json` — schema snapshot (committed)
- `backend/src/db/pragma.test.ts` — Rule 1 fix: column name `timeout` not `busy_timeout`

## Decisions Made

- **env.ts at backend/ root**: Wave 0 test `src/index.test.ts` imports `'../env'` resolving to `backend/env.ts`, not `backend/src/env.ts`. Test path is source of truth.
- **rawSqlite as function not const**: Tests call `rawSqlite(db)` passing the drizzle db instance; WeakMap stores raw handle per db, enabling multiple test databases without globals.
- **:memory: → file::memory:?cache=shared**: Standard `:memory:` rejects WAL pragma (returns `memory`); shared-cache URI supports WAL — required for schema/pragma tests that call `openDatabase(':memory:')` and assert WAL mode.
- **Migration error catch in openDatabase()**: `drizzle/meta/_journal.json` doesn't exist before first `drizzle-kit generate`; catching `"Can't find meta/_journal.json"` allows client.ts import before migrations exist.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] env.ts relocated to backend/ root**
- **Found during:** Task 2 (test run)
- **Issue:** Plan specified `backend/src/env.ts` but Wave 0 `src/index.test.ts` imports `'../env'` which resolves to `backend/env.ts` (not `backend/src/env.ts`). Module not found error.
- **Fix:** Created env.ts at `backend/env.ts`; updated cryptoService.ts import from `'../env'` to `'../../env'`
- **Files modified:** backend/env.ts (location), backend/src/services/cryptoService.ts (import path)
- **Commit:** ad0c346

**2. [Rule 1 - Bug] pragma.test.ts wrong column name for PRAGMA busy_timeout**
- **Found during:** Task 2 (test run)
- **Issue:** Wave 0 test cast `PRAGMA busy_timeout` result as `{ busy_timeout: number }` but SQLite returns column named `timeout` (not `busy_timeout`). Test assertion got `undefined`, expected `5000`.
- **Fix:** Changed cast to `{ timeout: number }` and assertion to `result.timeout`
- **Files modified:** backend/src/db/pragma.test.ts
- **Commit:** ad0c346

**3. [Rule 3 - Blocking] :memory: does not support WAL mode**
- **Found during:** Task 2 (test run)
- **Issue:** `openDatabase(':memory:')` always returns `journal_mode=memory` — standard in-memory SQLite ignores WAL pragma. Tests assert `journal_mode=wal`.
- **Fix:** Map `:memory:` → `file::memory:?cache=shared` in `openDatabase()`. Shared-cache URI databases support WAL mode.
- **Files modified:** backend/src/db/client.ts
- **Commit:** ad0c346

---

**Total deviations:** 3 auto-fixed (1 Rule 1 bug, 2 Rule 3 blocking)
**Impact on plan:** All necessary for correctness. No scope creep.

## Issues Encountered

None beyond the deviations above.

## Threat Surface Scan

No new network endpoints introduced. Security mitigations implemented per threat register:
- T-1-KEY: requireEncryptionKey() validates and throws on missing/malformed key
- T-1-CRYPTO: AES-256-GCM auth tag verified on decrypt; new 12-byte IV per encryption
- T-1-DISCONNECT: decrypt() returns null instead of throwing — no crash on key loss
- T-1-LAN: PRAGMAs set before drizzle; WAL mode enforced from first connection
- T-1-MIGRATE: tracked generate+migrate; no drizzle-kit push anywhere in codebase

No threat flags — all mitigations implemented as planned.

## Known Stubs

None — all implementations are complete and functional. No placeholder data or hardcoded mock values.

## Next Phase Readiness

- Plan 03 (01-03) can begin: schema, client, crypto, and env are all complete and tested
- Plan 03 implements: `src/routes/health.ts`, `src/routes/settings.ts`, `src/seed.ts`, `src/index.ts`
- Wave 2 tests that will turn GREEN in Plan 03: server.test.ts, health.test.ts, settings.test.ts, seed.test.ts

---
*Phase: 01-backend-foundation*
*Completed: 2026-06-24*

## Self-Check: PASSED

All created files verified:
- backend/src/db/schema.ts: FOUND
- backend/env.ts: FOUND
- backend/src/services/cryptoService.ts: FOUND
- backend/src/db/client.ts: FOUND
- backend/src/db/migrate.ts: FOUND
- backend/drizzle/0000_lyrical_the_initiative.sql: FOUND
- .planning/phases/01-backend-foundation/01-02-SUMMARY.md: FOUND

All commits verified:
- bb20e71: feat(01-02) Task 1 - FOUND
- ad0c346: feat(01-02) Task 2 - FOUND
- c2c26ad: feat(01-02) Task 3 - FOUND
