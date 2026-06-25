---
phase: 1
slug: backend-foundation
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-23
validated: 2026-06-24
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun test` (built-in — no Jest/Vitest) |
| **Config file** | none — `bun test` uses file-pattern discovery (`src/**/*.test.ts`) |
| **Quick run command** | `bun test src/` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~5 seconds (no live network — FB Graph API mocked via `bun:test` `mock`) |

---

## Sampling Rate

- **After every task commit:** Run `bun test src/`
- **After every plan wave:** Run `bun test` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

> Task IDs are assigned during planning (Wave 0 stands up all test files first; later waves implement against them). The Requirement → Test mapping below is the binding contract — every requirement has at least one automated verification.

| Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| db | 1 | FOUND-02 | T-1-LAN | SQLite opens in WAL mode; all 7 tables exist after migrate | integration | `bun test src/db/schema.test.ts` | ✅ | ✅ green |
| db | 1 | FOUND-02 | — | `PRAGMA busy_timeout` = 5000 active on connection | unit | `bun test src/db/pragma.test.ts` | ✅ | ✅ green |
| crypto | 1 | SET-01 | T-1-CRYPTO | AES-256-GCM encrypt/decrypt round-trip works | unit | `bun test src/services/cryptoService.test.ts` | ✅ | ✅ green |
| crypto | 1 | SET-01 | T-1-DISCONNECT | Wrong key → `decrypt()` returns null (not throw) | unit | `bun test src/services/cryptoService.test.ts` | ✅ | ✅ green |
| server | 1 | FOUND-03 | T-1-LAN | Server binds to `127.0.0.1` only (not 0.0.0.0) | integration (smoke) | `bun test src/server.test.ts` | ✅ | ✅ green |
| startup | 1 | D-03 | T-1-KEY | Backend fails fast at startup if `BUN_ENCRYPTION_KEY` missing | unit | `bun test src/index.test.ts` | ✅ | ✅ green |
| health | 2 | FOUND-01 | — | `GET /health` returns 200 + DB connectivity OK | integration | `bun test src/routes/health.test.ts` | ✅ | ✅ green |
| settings | 2 | SET-01 | T-1-EXPOSE | Encrypted token never returned in `GET /api/settings` response | integration | `bun test src/routes/settings.test.ts` | ✅ | ✅ green |
| settings | 2 | SET-01 | T-1-FBVERIFY | FB-connect rejects invalid token (Graph API error) | integration (mocked) | `bun test src/routes/settings.test.ts` | ✅ | ✅ green |
| settings | 2 | SET-01 | T-1-DISCONNECT | Backend stays up + surfaces "disconnected" when stored token undecryptable | integration | `bun test src/routes/settings.test.ts` | ✅ | ✅ green |
| seed | 2 | SET-01 | — | `seedDefaultSettings()` idempotent (no duplicate rows) | unit | `bun test src/seed.test.ts` | ✅ | ✅ green |
| fbService | 3 | SET-01 / SC-3 | T-1-SECRET | `exchangeCodeForToken` / `getPageAccessToken` Graph helpers; secret + tokens never in result values | unit (mocked fetch) | `bun test src/services/fbService.test.ts` | ✅ | ✅ green |
| fbOauth | 3 | SET-01 / SC-3 | T-1-CSRF | OAuth authorize 302 with single-use CSRF state; callback rejects missing/wrong/replayed state (400) | integration (mocked) | `bun test src/routes/fbOauth.test.ts` | ✅ | ✅ green |
| fbOauth | 3 | SET-01 / SC-3 | T-1-EXPOSE | Callback encrypts Page token at rest (AES-256-GCM); token never in response body | integration (mocked) | `bun test src/routes/fbOauth.test.ts` | ✅ | ✅ green |
| fbOauth | 3 | SET-01 / SC-3 | T-1-OPENREDIR | `redirect_uri` sourced server-side only; `FB_APP_SECRET` never in authorize URL | integration (mocked) | `bun test src/routes/fbOauth.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Plan 05 (Facebook OAuth Page-connect, Dev Mode) added the `fbService` + `fbOauth` rows above — these post-date the original Wave 0/2 plan and cover SET-01 / SC-3 via 25 mocked tests.*

---

## Wave 0 Requirements

All test files are created in Wave 0 (no test infrastructure exists yet — greenfield):

- [x] `backend/src/db/schema.test.ts` — WAL mode + all 7 tables exist after migration
- [x] `backend/src/db/pragma.test.ts` — probes `PRAGMA journal_mode` and `PRAGMA busy_timeout` values
- [x] `backend/src/services/cryptoService.test.ts` — encrypt/decrypt round-trip + wrong-key null return + plaintext never present in stored string
- [x] `backend/src/routes/health.test.ts` — HTTP 200 + `{ status: 'ok' }` with DB check
- [x] `backend/src/routes/settings.test.ts` — GET/POST settings: no token in response, disconnected state on bad decrypt, reject invalid FB token (mocked `fetch`)
- [x] `backend/src/seed.test.ts` — default Setting row seeded once; second call is a no-op
- [x] `backend/src/index.test.ts` — fail-fast when `BUN_ENCRYPTION_KEY` env var is missing
- [x] `backend/src/server.test.ts` — server bound to `127.0.0.1`
- [x] `backend/src/services/fbService.test.ts` — Graph token-exchange helpers (mocked); secret/tokens never in result (Plan 05)
- [x] `backend/src/routes/fbOauth.test.ts` — OAuth authorize/callback: CSRF state, encrypted token at rest, no token/secret in response (Plan 05)

**Note:** Mock `fetch` at the test boundary via `mock` from `bun:test` for FB Graph API calls. No live API calls in tests.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real FB Page token paste verifies against live Graph API | SET-01 / D-02 | Requires a real Page access token + live `graph.facebook.com` round-trip; cannot be in CI | Generate a Page token via Graph API Explorer → `POST /api/settings/facebook` with token + page ID → expect page name returned, token stored encrypted, `GET /api/settings` shows connected without plaintext token |
| `bun run setup` generates a real key into `.env` | D-03 | Mutates the operator's `.env` on the real filesystem | Run `bun run setup` on a fresh checkout → confirm `BUN_ENCRYPTION_KEY=<32-byte base64>` written to `.env`, `.env` is gitignored |

---

## Validation Sign-Off

- [x] All requirements have an `<automated>` verify or a Wave 0 test dependency
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING (❌ W0) references
- [x] No watch-mode flags in commands
- [x] Feedback latency < 5s (full suite ~0.3s)
- [x] `nyquist_compliant: true` set in frontmatter (after planner aligns task IDs)

**Approval:** validated 2026-06-24 — 53/53 tests green, all requirements COVERED.

---

## Validation Audit 2026-06-24

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

**Method:** Audited the existing (State A) draft VALIDATION.md against the implemented codebase. All 10 mapped test files exist; full suite `bun test` → **53 pass, 0 fail** (10 files, ~0.3s). Test titles confirm each mapped "Secure Behavior" is asserted (not file-presence only). Requirements FOUND-01, FOUND-02, FOUND-03, SET-01, D-03 all **COVERED**. Added `fbService` + `fbOauth` rows (Plan 05, SET-01/SC-3, 25 mocked tests) that post-dated the original map. Updated frontmatter (`status: draft → validated`, `wave_0_complete: true`). No new tests generated, no gaps to escalate. CR-01 single-file test-isolation note (see 01-VERIFICATION.md) is a non-blocking hygiene WARNING — `bun test` is deterministic and prod-clean.
