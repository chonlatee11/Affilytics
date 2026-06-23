---
phase: 1
slug: backend-foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-23
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
| db | 1 | FOUND-02 | T-1-LAN | SQLite opens in WAL mode; all 7 tables exist after migrate | integration | `bun test src/db/schema.test.ts` | ❌ W0 | ⬜ pending |
| db | 1 | FOUND-02 | — | `PRAGMA busy_timeout` = 5000 active on connection | unit | `bun test src/db/pragma.test.ts` | ❌ W0 | ⬜ pending |
| crypto | 1 | SET-01 | T-1-CRYPTO | AES-256-GCM encrypt/decrypt round-trip works | unit | `bun test src/services/cryptoService.test.ts` | ❌ W0 | ⬜ pending |
| crypto | 1 | SET-01 | T-1-DISCONNECT | Wrong key → `decrypt()` returns null (not throw) | unit | `bun test src/services/cryptoService.test.ts` | ❌ W0 | ⬜ pending |
| server | 1 | FOUND-03 | T-1-LAN | Server binds to `127.0.0.1` only (not 0.0.0.0) | integration (smoke) | `bun test src/server.test.ts` | ❌ W0 | ⬜ pending |
| startup | 1 | D-03 | T-1-KEY | Backend fails fast at startup if `BUN_ENCRYPTION_KEY` missing | unit | `bun test src/index.test.ts` | ❌ W0 | ⬜ pending |
| health | 2 | FOUND-01 | — | `GET /health` returns 200 + DB connectivity OK | integration | `bun test src/routes/health.test.ts` | ❌ W0 | ⬜ pending |
| settings | 2 | SET-01 | T-1-EXPOSE | Encrypted token never returned in `GET /api/settings` response | integration | `bun test src/routes/settings.test.ts` | ❌ W0 | ⬜ pending |
| settings | 2 | SET-01 | T-1-FBVERIFY | FB-connect rejects invalid token (Graph API error) | integration (mocked) | `bun test src/routes/settings.test.ts` | ❌ W0 | ⬜ pending |
| settings | 2 | SET-01 | T-1-DISCONNECT | Backend stays up + surfaces "disconnected" when stored token undecryptable | integration | `bun test src/routes/settings.test.ts` | ❌ W0 | ⬜ pending |
| seed | 2 | SET-01 | — | `seedDefaultSettings()` idempotent (no duplicate rows) | unit | `bun test src/seed.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All test files are created in Wave 0 (no test infrastructure exists yet — greenfield):

- [ ] `backend/src/db/schema.test.ts` — WAL mode + all 7 tables exist after migration
- [ ] `backend/src/db/pragma.test.ts` — probes `PRAGMA journal_mode` and `PRAGMA busy_timeout` values
- [ ] `backend/src/services/cryptoService.test.ts` — encrypt/decrypt round-trip + wrong-key null return + plaintext never present in stored string
- [ ] `backend/src/routes/health.test.ts` — HTTP 200 + `{ status: 'ok' }` with DB check
- [ ] `backend/src/routes/settings.test.ts` — GET/POST settings: no token in response, disconnected state on bad decrypt, reject invalid FB token (mocked `fetch`)
- [ ] `backend/src/seed.test.ts` — default Setting row seeded once; second call is a no-op
- [ ] `backend/src/index.test.ts` — fail-fast when `BUN_ENCRYPTION_KEY` env var is missing
- [ ] `backend/src/server.test.ts` — server bound to `127.0.0.1`

**Note:** Mock `fetch` at the test boundary via `mock` from `bun:test` for FB Graph API calls. No live API calls in tests.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real FB Page token paste verifies against live Graph API | SET-01 / D-02 | Requires a real Page access token + live `graph.facebook.com` round-trip; cannot be in CI | Generate a Page token via Graph API Explorer → `POST /api/settings/facebook` with token + page ID → expect page name returned, token stored encrypted, `GET /api/settings` shows connected without plaintext token |
| `bun run setup` generates a real key into `.env` | D-03 | Mutates the operator's `.env` on the real filesystem | Run `bun run setup` on a fresh checkout → confirm `BUN_ENCRYPTION_KEY=<32-byte base64>` written to `.env`, `.env` is gitignored |

---

## Validation Sign-Off

- [ ] All requirements have an `<automated>` verify or a Wave 0 test dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING (❌ W0) references
- [ ] No watch-mode flags in commands
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter (after planner aligns task IDs)

**Approval:** pending
