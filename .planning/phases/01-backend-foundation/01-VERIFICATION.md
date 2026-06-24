---
phase: 01-backend-foundation
verified: 2026-06-24T19:20:00Z
status: gaps_found
score: 3/4 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Backend starts on localhost and responds to a health/API request"
    status: partial
    reason: "Runtime curl confirms GET /health returns 200 and the server binds 127.0.0.1:3000 when started directly with 'bun run index.ts'. However, the dev script in package.json points to 'src/index.ts' which does not exist (entry point is at backend/index.ts root). 'bun run dev' exits with 'Module not found src/index.ts' — the developer-facing workflow is broken. SC-1 is partially met (server works) but the published startup command fails."
    artifacts:
      - path: "backend/package.json"
        issue: "dev script reads 'bun run --watch src/index.ts' but the entry point is backend/index.ts (root, not src/)"
      - path: "backend/index.ts"
        issue: "Correct file, wrong path in dev script"
    missing:
      - "Change package.json dev script from 'bun run --watch src/index.ts' to 'bun run --watch index.ts'"

  - truth: "Leaked in-memory test DB files are gitignored"
    status: failed
    reason: "client.ts maps ':memory:' to 'file::memory:?cache=shared' which bun:sqlite treats as a real filename (not a URI), creating backend/file::memory:?cache=shared, backend/file::memory:?cache=shared-shm, and backend/file::memory:?cache=shared-wal. A fourth file also appears at the project root. All four are confirmed untracked by git status. backend/.gitignore covers *.db, *.db-wal, *.db-shm, and data/ — but NOT 'file::memory:*' filenames. Any 'git add .' will commit these files."
    artifacts:
      - path: "backend/src/db/client.ts"
        issue: "Lines 42-43: ':memory:' is mapped to 'file::memory:?cache=shared' and passed to new Database() as a path string, creating real files on disk per bun:sqlite behavior."
      - path: "backend/.gitignore"
        issue: "Missing 'file::memory:*' pattern — leaked test DB files are not excluded from git."
    missing:
      - "Add 'file::memory:*' to backend/.gitignore"
      - "OR fix openDatabase() to use a true temp file path (per CR-01 fix suggestion in 01-REVIEW.md)"

  - truth: "index.ts does not bind port 3000 on every import (import.meta.main guard)"
    status: failed
    reason: "index.ts line 68 calls .listen(3000) unconditionally with no import.meta.main guard. Comment on line 67 claims 'we guard with Bun.main check' but no such guard exists anywhere in the file. Any test file that imports index.ts binds port 3000 at import time. Currently only server.test.ts imports index.ts and it calls app.stop() in afterAll — so the full test suite passes. However, the claim in the comment is factually wrong and any future test import of index.ts alongside server.test.ts in the same worker will attempt to double-bind port 3000."
    artifacts:
      - path: "backend/index.ts"
        issue: "Lines 67-68: misleading comment claims guard exists; .listen(3000) is unconditional"
    missing:
      - "Wrap .listen(3000) in: if (import.meta.main) { app.listen(3000) }"
      - "Remove the incorrect comment on line 67"

  - truth: "Operator can connect a Facebook Page via OAuth (ROADMAP SC-3)"
    status: failed
    reason: "HUMAN DECISION (2026-06-24): operator chose to KEEP SC-3 worded as 'via OAuth' rather than reconcile to D-01's manual-token-paste deferral. The current implementation provides manual token paste (POST /api/settings/fb-connect) only — no OAuth redirect/exchange flow exists. With SC-3 retained as OAuth, the full OAuth connection flow is now an in-scope Phase 1 gap. NOTE: this overrides CONTEXT D-01 (which deferred OAuth to Phase 6) and pulls forward the Meta App Review lead time that the ROADMAP intro pinned to Phase 6 — gap planning should account for that external dependency."
    artifacts:
      - path: "backend/src/routes/settings.ts"
        issue: "Only manual token-paste endpoint (POST /api/settings/fb-connect) exists; no OAuth authorize/callback/token-exchange routes."
    missing:
      - "Implement Facebook OAuth flow (authorize redirect → callback → code-for-token exchange → encrypt → store) for Page connection"
      - "Account for Meta App Review lead time (previously pinned to Phase 6) when scheduling this gap"
deferred: []
human_verification: []
human_decisions:
  - decision: "Keep ROADMAP SC-3 wording as 'via OAuth'; treat the OAuth flow as an in-scope Phase 1 gap (overrides CONTEXT D-01 Phase 6 deferral)."
    decided_by: operator
    decided_at: "2026-06-24"
---

# Phase 01: Backend Foundation Verification Report

**Phase Goal:** Stand up the localhost Bun+Elysia backend with a SQLite database (WAL + busy_timeout), the full schema for every core entity, an encrypted Facebook token column, and a settings flow to connect a Facebook Page.
**Verified:** 2026-06-24T19:20:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Backend starts on localhost and responds to a health/API request | PARTIAL | Runtime: `curl http://127.0.0.1:3000/health` → `{"status":"ok","db":"connected"}` when started via `bun run index.ts`. Package.json `dev` script broken: `bun run dev` → `error: Module not found "src/index.ts"`. |
| 2 | SQLite opens in WAL mode with busy_timeout set; 7 tables exist | VERIFIED | client.ts lines 54-55 set `PRAGMA journal_mode = WAL` and `PRAGMA busy_timeout = 5000` on the raw connection before drizzle wraps it. All 7 CREATE TABLE statements in drizzle/0000_lyrical_the_initiative.sql confirmed. `bun test src/db/` → 4/4 pass. |
| 3 | Access token stored encrypted (AES-256-GCM), never returned in plaintext | VERIFIED | cryptoService.ts uses AES-256-GCM with 12-byte IV, iv:tag:ciphertext format. settings.ts GET uses explicit column selection; accessTokenEnc is only read for decrypt probe, never included in response object. 13/13 route tests pass including T-1-EXPOSE, T-1-FBVERIFY, T-1-DISCONNECT. |
| 4 | API reachable only over localhost (127.0.0.1) | VERIFIED | index.ts `serve: { hostname: '127.0.0.1', port: 3000 }` — explicit loopback binding. CORS allowlist: `['http://localhost:3000','http://localhost:5173',/^chrome-extension:\\/\\//]`. server.test.ts asserts `app.server?.hostname === '127.0.0.1'` — passes. |

**Score:** 3/4 truths verified at initial verification. Per operator decision 2026-06-24, SC-3 is retained as "via OAuth" — the OAuth flow is NOT implemented (manual token paste only), so SC-3 is now an OPEN GAP (effective score 2/4: SC-1 partial, SC-3 OAuth failed). Plus 2 non-criterion blockers (leaked in-memory DB files, missing import.meta.main guard).

---

### CR-01 and CR-02 Independent Assessment (per task brief)

#### CR-01: WAL mode genuinely satisfied for production DB

The review's concern was whether WAL test assertions pass only due to leftover on-disk artifacts from the `file::memory:?cache=shared` file. Direct probe confirms:

- `bun:sqlite` treats `'file::memory:?cache=shared'` as a **real filename** (not a URI) — it creates a real file at that path.
- `PRAGMA journal_mode = WAL` on this real file returns `'wal'` from a fresh open (not from leftover state).
- For the **production** (file-based) DB (`data/affilytics.db`), WAL is set correctly: client.ts lines 54-55 run on every `openDatabase()` call, which is the correct per-connection pattern.
- **Conclusion:** SC-2 WAL correctness for the production DB is GENUINE. The CR-01 concern about test contamination is valid as a code quality / git hygiene issue but does NOT undermine production WAL behavior.

The real CR-01 defect is the **three leaked files** (`file::memory:?cache=shared`, `*-shm`, `*-wal`) that are untracked by git and not covered by `.gitignore`. These will be accidentally committed on `git add .`.

#### CR-02: Missing import.meta.main guard CONFIRMED

`grep -n "import.meta.main\|Bun.main" backend/index.ts` returns no match. `.listen(3000)` on line 68 is unconditional. The comment on line 67 ("we guard with Bun.main check") is factually wrong. This is a code correctness and maintainability issue. Current tests still pass because module caching prevents double-bind in the existing test layout, but the risk exists for future test additions.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/package.json` | Bun project manifest with scripts + Phase 1 deps | PARTIAL | All deps correct; no forbidden deps. `dev` script points to non-existent `src/index.ts` |
| `backend/drizzle.config.ts` | dialect sqlite, schema path, out ./drizzle | VERIFIED | `dialect: 'sqlite'`, `schema: './src/db/schema.ts'`, `out: './drizzle'` |
| `backend/src/db/schema.ts` | All 7 Drizzle sqlite-core table definitions | VERIFIED | 7 `sqliteTable()` calls, all correct entities with proper columns |
| `backend/src/db/client.ts` | openDatabase() with WAL + busy_timeout PRAGMAs | VERIFIED | PRAGMAs set lines 54-55 before drizzle(); rawSqlite() exported. `file::memory:?cache=shared` mapping is a test-contamination issue (see CR-01). |
| `backend/src/db/migrate.ts` | migrate(db, { migrationsFolder: './drizzle' }) | VERIFIED | Present, synchronous, no await |
| `backend/src/services/cryptoService.ts` | encrypt()/decrypt() AES-256-GCM | VERIFIED | Full implementation; decrypt() returns null on any error (no throw path) |
| `backend/env.ts` | requireEncryptionKey() fail-fast | VERIFIED | Throws on missing/empty/malformed key; returns 32-byte Buffer |
| `backend/drizzle/` | Generated tracked migration SQL | VERIFIED | `0000_lyrical_the_initiative.sql` has 7 CREATE TABLE statements |
| `backend/index.ts` | Boot sequence; exports app; binds 127.0.0.1 | PARTIAL | Hostname binding correct; boot order correct; missing `import.meta.main` guard (CR-02) |
| `backend/src/routes/health.ts` | GET /health with DB ping | VERIFIED | rawSqlite ping, returns `{status:ok,db:connected}`, 503 on failure |
| `backend/src/routes/settings.ts` | POST /api/settings/fb-connect + GET /api/settings | VERIFIED | Verifies token, encrypts, stores; GET never returns token; fbConnected from decrypt probe |
| `backend/src/services/fbService.ts` | verifyToken() against Graph API GET /me | VERIFIED | Fetches `graph.facebook.com/v22.0/me?fields=id,name`, handles error body + page-id mismatch |
| `backend/seed.ts` | idempotent seedDefaultSettings() | VERIFIED | `.onConflictDoNothing()` used; 5 weight keys; default tone/mode/limit |
| `backend/scripts/setup.ts` | randomBytes(32) key generation into .env | VERIFIED | `randomBytes(32).toString('hex')`; no-overwrite guard present |
| `backend/.gitignore` | Ignores .env, data/, *.db, node_modules | PARTIAL | Covers all listed patterns. Missing `file::memory:*` for leaked test DB files (CR-01). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `backend/src/db/client.ts` | `backend/src/db/schema.ts` | `drizzle(sqlite, { schema })` | VERIFIED | Line 57: `drizzle(sqlite, { schema }) as AppDatabase` |
| `backend/src/db/migrate.ts` | `backend/drizzle/*.sql` | `migrationsFolder: './drizzle'` | VERIFIED | Line 19: `migrate(db, { migrationsFolder: './drizzle' })` |
| `backend/src/services/cryptoService.ts` | `backend/env.ts` | `requireEncryptionKey()` | VERIFIED | Line 11: `import { requireEncryptionKey } from '../../env'`; called lazily in encrypt/decrypt |
| `backend/index.ts` | `backend/seed.ts` | boot calls `seedDefaultSettings` | VERIFIED | Line 36: `await seedDefaultSettings()` |
| `backend/src/routes/settings.ts` | `backend/src/services/fbService.ts` + `cryptoService.ts` | verifyToken then encrypt before store | VERIFIED | Lines 29-39 in settings.ts |
| `backend/src/routes/settings.ts` | `backend/src/db/schema.ts (pages, settings)` | explicit-column select excluding accessTokenEnc | VERIFIED | GET handler fetches accessTokenEnc only for decrypt probe; never in return object |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `settings.ts GET /api/settings` | `fbConnected`, `pageName`, `scoreWeights` | `db.select().from(pages)` + `db.select().from(settings)` | Yes — real DB queries (not static) | FLOWING |
| `settings.ts POST /api/settings/fb-connect` | `accessTokenEnc` stored to pages | `encrypt(accessToken)` → `db.insert(pages)` | Yes — AES-GCM encryption + real DB insert | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| GET /health returns 200 + ok | `curl -s http://127.0.0.1:3000/health` (server running) | `{"status":"ok","db":"connected"}` | PASS |
| bun run dev fails | `bun run dev` from backend/ | `error: Module not found "src/index.ts"` | FAIL |
| Full test suite | `BUN_ENCRYPTION_KEY=$(repeat 64 a) bun test` | 28 pass, 0 fail | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| FOUND-01 | 01-03-PLAN.md | Backend runs on localhost, exposes REST API | PARTIAL | Server responds correctly when started directly; dev script broken |
| FOUND-02 | 01-02-PLAN.md | SQLite WAL + busy_timeout + full 7-entity schema | VERIFIED | PRAGMAs set correctly; all 7 tables in migration SQL; tests pass |
| FOUND-03 | 01-03-PLAN.md | localhost-only (127.0.0.1), no LAN exposure | VERIFIED | `serve.hostname: '127.0.0.1'`; CORS allowlist; server.test.ts passes |
| SET-01 | 01-02/03-PLAN.md | FB Page connect; token encrypted at rest; never plaintext | PARTIALLY — connection mechanism deferred | Token encryption (AES-256-GCM), non-exposure, and disconnect handling all verified. Full OAuth deferred to Phase 6 per CONTEXT D-01. ROADMAP SC-3 wording says "via OAuth" — mismatch with implementation. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/index.ts` | 67-68 | Comment claims `import.meta.main` guard exists; none found; `.listen(3000)` is unconditional | WARNING | Port 3000 binds on every import of index.ts. Currently safe because only server.test.ts imports it and calls `app.stop()`. Risk increases if additional test files import index.ts. |
| `backend/index.ts` | 31-32 | `migrate()` called twice: once inside `openDatabase()` (client.ts line 67) and again explicitly in index.ts | WARNING (WR-01) | Redundant DB reads at boot. Idempotent but misleading — future devs may remove one half incorrectly. |
| `backend/src/db/client.ts` | 42-43 | `':memory:'` mapped to `'file::memory:?cache=shared'` — creates real files on disk | BLOCKER | Leaked files `file::memory:?cache=shared{,-shm,-wal}` confirmed present in `backend/` and project root. Not in `.gitignore`. `git add .` will commit test DB data. |
| `backend/.gitignore` | — | Missing `file::memory:*` pattern | BLOCKER | Leaked test DB files will be committed on next `git add .`. WAL file is 420KB. |
| `backend/package.json` | scripts.dev | `bun run --watch src/index.ts` — file does not exist | BLOCKER | Developer workflow entry point is broken. `bun run dev` exits code 1. |
| `backend/src/routes/settings.ts` | 69 | `accessToken: t.String({ minLength: 10 })` — too permissive (WR-02) | WARNING | A 10-char string passes validation, wastes a Graph API round-trip on an obviously invalid token. |
| `backend/src/services/fbService.ts` | 70-73 | Error message includes `data.id` in page-mismatch string (WR-03) | INFO | Leaks the Graph API-returned page ID in a 422 response. Low risk for single-operator local tool. |

---

### Human Verification Required

#### 1. OAuth vs. Manual Token Paste — ROADMAP SC-3 Wording

**Test:** Review ROADMAP SC-3 ("Operator can connect a Facebook Page via OAuth...") against CONTEXT D-01 ("Connect Facebook Page in Phase 1 = manual token paste, NOT a full OAuth redirect flow").
**Expected:** Decide whether: (a) Phase 1 sign-off requires updating ROADMAP SC-3 to reflect the manual-paste implementation, or (b) D-01 is sufficient justification to mark Phase 1 complete on SET-01 with a note that full OAuth lands in Phase 6.
**Why human:** This is a requirements management decision. The encryption, non-exposure, and disconnect-handling behaviors are all fully implemented and tested. The open question is purely whether the ROADMAP wording was an error (it should say "manual token paste") or whether full OAuth is truly required for Phase 1.

---

## Gaps Summary

Three blockers prevent clean phase sign-off:

1. **Broken dev script** (`backend/package.json`): The `dev` script points to `src/index.ts` which was never created — the actual entry point is `backend/index.ts` (root). This makes `bun run dev` fail at the first step in the README's run sequence. Fix: change `"dev"` to `"bun run --watch index.ts"`.

2. **Leaked test DB files not gitignored** (`backend/.gitignore`): `client.ts` maps `':memory:'` to `'file::memory:?cache=shared'` which bun:sqlite writes to disk as a real file. Three files (`file::memory:?cache=shared`, `*-shm`, `*-wal`) are confirmed present and untracked by git. A fourth appears at the project root. Adding `file::memory:*` to `.gitignore` is the minimum fix; the proper fix is using a temp file path in `openDatabase()` as described in the CR-01 review.

3. **No `import.meta.main` guard in index.ts** (`backend/index.ts`): `.listen(3000)` fires on every import. A misleading comment on line 67 claims a guard exists when none does. Currently harmless (only one test file imports index.ts and stops the server), but the incorrect comment is a reliability risk.

One warning (not a blocker): `migrate()` is called twice at boot — once inside `openDatabase()` in client.ts and again explicitly in index.ts line 32. Drizzle's migrator is idempotent so no migration runs twice, but the redundancy is confusing.

Root cause: Blockers 1 and 2 stem from late-stage reorganization in Plan 03 (index.ts moved from `src/` to root) that was not fully propagated back to the package.json dev script, and the in-memory workaround in client.ts that was not covered by the existing `.gitignore` patterns.

---

_Verified: 2026-06-24T19:20:00Z_
_Verifier: Claude (gsd-verifier)_
