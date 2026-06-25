---
phase: 01-backend-foundation
plan: 04
subsystem: backend
tags: [gap-closure, db, boot, gitignore, import.meta.main, WAL]
dependency_graph:
  requires: [01-03]
  provides: [FOUND-01, FOUND-02, FOUND-03]
  affects: [backend/index.ts, backend/src/db/client.ts, backend/package.json, backend/.gitignore]
tech_stack:
  added: []
  patterns:
    - import.meta.main guard prevents port bind on module import
    - Per-process temp file replaces shared-cache URI for in-memory test DB (WAL preserved)
    - Single migrate path via openDatabase() (WR-01 resolved)
key_files:
  created: []
  modified:
    - backend/package.json
    - backend/index.ts
    - backend/src/db/client.ts
    - backend/.gitignore
    - backend/src/server.test.ts
    - backend/src/seed.test.ts
decisions:
  - "Use OS tmpdir + randomUUID for in-memory test DB path instead of file::memory:?cache=shared — preserves WAL support without writing to repo tree"
  - "import.meta.main guard in index.ts — safe module import in tests without double port bind"
  - "Single migrate path in openDatabase() — WR-01 double-migrate resolved by removing redundant call from index.ts"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-24T13:30:00Z"
  tasks: 2
  files_modified: 6
---

# Phase 01 Plan 04: Mechanical Gap Closure (dev script, in-memory DB leak, import.meta.main) Summary

**One-liner:** Fixed 3 mechanical Phase 1 blockers — dev script wrong entry point, `file::memory:?cache=shared` files leaking to repo tree, and unconditional `.listen(3000)` binding port on test import.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Fix dev script + guard listen + collapse double-migrate | 2484314 | backend/package.json, backend/index.ts, backend/src/server.test.ts |
| 2 | Stop in-memory DB disk leakage; gitignore + remove leaked files | 1efa43d | backend/src/db/client.ts, backend/.gitignore, backend/src/seed.test.ts |

## What Was Built

### Gap 1 — Dev script entry point (SC-1 partial, BLOCKER)
`backend/package.json` `dev` script pointed at `src/index.ts` (non-existent). Fixed to `index.ts` (real root entry point). `bun run dev` now boots the backend correctly.

### Gap 2 — In-memory DB file leakage (BLOCKER)
`client.ts` mapped `':memory:'` → `'file::memory:?cache=shared'` which bun:sqlite writes as a real file to the working directory. Fixed by using `tmpdir()` + `randomUUID()` for a unique per-process temp file in the OS temp directory. WAL mode is preserved (WAL requires a real file; temp file satisfies this without polluting the repo tree). Best-effort `close()` wrapper deletes temp file and WAL/SHM siblings on cleanup.

4 leaked files removed from working tree: `backend/file::memory:?cache=shared`, `backend/file::memory:?cache=shared-shm`, `backend/file::memory:?cache=shared-wal`, and `./file::memory:?cache=shared` (project root).

`file::memory:*` added to `backend/.gitignore` as defense-in-depth.

### Gap 3 — Unconditional .listen() (BLOCKER + WR-01)
`index.ts` called `.listen(3000)` unconditionally with a comment falsely claiming a guard existed. Wrapped in `if (import.meta.main)` so importing `index.ts` in tests does not bind port 3000. Also removed the redundant `migrate()` call from index.ts (WR-01 double-migrate) — `openDatabase()` in client.ts is the single migration path. The orphaned `import { migrate } from 'drizzle-orm/bun-sqlite/migrator'` was also removed from index.ts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed server.test.ts to start server manually in beforeAll**
- **Found during:** Task 1
- **Issue:** `server.test.ts` expected `.listen()` to be called at import time. After adding `import.meta.main` guard, the test's `app.server?.hostname` was undefined and `app.stop()` threw "Elysia isn't running".
- **Fix:** Added `app.listen(3000)` call in `beforeAll()` of server.test.ts so the test controls server lifecycle.
- **Files modified:** `backend/src/server.test.ts`
- **Commit:** 2484314

**2. [Rule 1 - Bug] Fixed seed.test.ts D-08 isolation bug surfaced by unique temp paths**
- **Found during:** Task 2
- **Issue:** `seed.test.ts` test `D-08: calling seedDefaultSettings() twice results in exactly one settings row` created a local `openDatabase(':memory:')` (a unique temp file) then called `seedDefaultSettings()` which uses the module-level singleton `db` (a different connection). The assertion queried the local temp DB which had no seed data — length 0 instead of 1. This bug was pre-existing but hidden when both used the same `file::memory:?cache=shared` file (shared-cache behavior). After unique temp paths, the two DBs are truly isolated, exposing the test isolation bug.
- **Fix:** Removed the local `openDatabase(':memory:')` call from the test; changed to query via the same singleton `db` that `seedDefaultSettings()` writes to.
- **Files modified:** `backend/src/seed.test.ts`
- **Commit:** 1efa43d

## Verification Results

- `grep -c '"dev": "bun run --watch index.ts"' backend/package.json` → 1 ✓
- `grep -c 'import.meta.main' backend/index.ts` → 2 (if block + comment) ✓
- `grep -c 'migrate(db' backend/index.ts` → 0 (WR-01 resolved) ✓
- `grep 'bun-sqlite/migrator' backend/index.ts` → no match (orphaned import removed) ✓
- `grep -c 'file::memory' backend/.gitignore` → 2 (pattern + comment) ✓
- `grep -c 'tmpdir\|randomUUID' backend/src/db/client.ts` → 3 (import + usage) ✓
- `git status --porcelain | grep 'file::memory'` → no output (no leaked files) ✓
- Full `bun test`: 28 pass, 0 fail ✓

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced.

## Self-Check: PASSED

- backend/package.json: dev script = "bun run --watch index.ts" ✓
- backend/index.ts: import.meta.main guard present ✓
- backend/src/db/client.ts: tmpdir/randomUUID present, no file::memory literal in code ✓
- backend/.gitignore: file::memory:* pattern present ✓
- Commits 2484314 and 1efa43d exist ✓
- Full test suite: 28 pass, 0 fail ✓
