---
phase: 01-backend-foundation
fixed_at: 2026-06-24T00:00:00Z
review_path: .planning/phases/01-backend-foundation/01-REVIEW.md
iteration: 2
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-06-24
**Source review:** .planning/phases/01-backend-foundation/01-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 7 (CR-01, WR-01 through WR-06)
- Fixed: 7
- Skipped: 0
- Test result: `bun test` — 55 pass, 0 fail (103 expect() calls, 10 files)

> Note: This is iteration 2 against a fresh REVIEW.md. The iteration-1 report
> above covered an earlier review with a different finding set (a prior CR-01/CR-02);
> this iteration addresses the current review's CR-01 (foreign keys) and WR-01..WR-06.

## Fixed Issues

### CR-01: Foreign-key constraints are never enforced — `PRAGMA foreign_keys` left OFF

**Files modified:** `backend/src/db/client.ts`, `backend/src/db/pragma.test.ts`
**Commit:** c973f60
**Applied fix:** Added `sqlite.exec('PRAGMA foreign_keys = ON')` alongside the existing WAL/busy_timeout PRAGMAs in `openDatabase()`, so the per-connection flag is set on every `new Database()`. Added two tests to `pragma.test.ts`: one asserting `PRAGMA foreign_keys` returns `1`, and one asserting an `INSERT` into `post_drafts` with a bogus `product_id` throws (FK now enforced).

### WR-01: Hardcoded port 3000 ignores documented `PORT` env var

**Files modified:** `backend/index.ts`
**Commit:** ef4d348
**Applied fix:** Introduced `const PORT = Number(process.env.PORT ?? 3000)` and used it for both `serve.port` and `app.listen()`, restoring the documented `.env` `PORT` contract and removing the duplicated literal.

### WR-02: Migration error-swallow can hide real failures in production

**Files modified:** `backend/src/db/client.ts`
**Commit:** 8cf5997
**Applied fix:** Gated the "migrations not generated yet" swallow behind `if (!isMemory) throw err`. File-based (production) DBs now fail loudly on any migration error; only in-memory/test DBs tolerate the missing-migrations message.

### WR-03: `migrate.ts` runs migrations a second time as an import side effect

**Files modified:** `backend/src/db/migrate.ts`
**Commit:** 3a2e762
**Applied fix:** Removed the redundant explicit `migrate(db, ...)` call (importing `./client` already migrates) and corrected the inaccurate "Imported by src/index.ts at boot" comment. The file now only imports the db singleton for the `migrate:run` script. Verified the standalone runner still applies migrations successfully.

### WR-04: CSRF `pendingStates` set grows unbounded (no TTL / no eviction)

**Files modified:** `backend/src/routes/fbOauth.ts`
**Commit:** c32a317
**Applied fix:** Converted `pendingStates` from `Set<string>` to `Map<string, number>` (state -> issuedAt). Added `STATE_TTL_MS = 10 min` and a `sweepExpiredStates()` helper swept on each `/authorize`. `/callback` now rejects unknown OR expired states as `state_mismatch` while still consuming the state on use (replay protection preserved). All 17 fbOauth tests pass.

### WR-05: `setup.ts` key-detection appends a duplicate key for an empty-value line

**Files modified:** `backend/scripts/setup.ts`
**Commit:** 83b20a5
**Applied fix:** Detection now filters all lines starting with `BUN_ENCRYPTION_KEY=` regardless of value. If any such line exists, the script refuses to append: it reports "already set" when a value is present, or instructs the operator to fill the empty one manually. Eliminates the `undefined > 0` comparison smell. Functionally verified an empty key line produces no duplicate.

### WR-06: GET /api/settings always reports `dataAccessExpiresAt: null` — silent token expiry

**Files modified:** `backend/src/routes/settings.ts`, `backend/src/routes/fbOauth.ts`
**Commit:** 1f809fe
**Applied fix:** Per the review's recommendation, added explicit `TODO(Phase 5)` code comments at all four hardcoded `null` sites (manual paste upsert + return, OAuth upsert insert/update), documenting that the real `data_access_expires_at` (retrievable via `debug_token`) is deferred and referencing CLAUDE.md Known Constraint #3. Actual population is correctly out of scope for Phase 1 (no live FB token plumbing yet); the deferral is now explicitly tracked rather than silent.

---

_Fixed: 2026-06-24_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
