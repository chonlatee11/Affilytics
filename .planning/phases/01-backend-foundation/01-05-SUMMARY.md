---
phase: 01-backend-foundation
plan: 05
subsystem: backend
tags: [gap-closure, oauth, facebook, csrf, encryption, routes, tdd]
dependency_graph:
  requires: [01-01, 01-02, 01-03, 01-04]
  provides: [SET-01, SC-3]
  affects:
    - backend/src/routes/fbOauth.ts
    - backend/src/routes/fbOauth.test.ts
    - backend/src/services/fbService.ts
    - backend/index.ts
    - backend/env.ts
    - backend/.env.example
    - backend/README.md
tech_stack:
  added: []
  patterns:
    - randomBytes(16).toString('hex') CSRF state in module-level Set (single-use, consumed at callback)
    - requireFbOAuthConfig() fail-fast accessor mirroring requireEncryptionKey pattern
    - Raw fetch to graph.facebook.com for OAuth code exchange (no FB SDK)
    - redirect_uri sourced server-side only (T-1-OPENREDIR mitigation)
    - FB_APP_SECRET read inside service function, never logged or returned
    - In-process pendingStates Set wiped on restart (stateless reconnect: re-open /authorize)
key_files:
  created:
    - backend/src/routes/fbOauth.ts
    - backend/src/routes/fbOauth.test.ts
    - backend/src/services/fbService.test.ts
  modified:
    - backend/src/services/fbService.ts
    - backend/env.ts
    - backend/.env.example
    - backend/index.ts
    - backend/README.md
decisions:
  - "CSRF state stored in module-level Set (no DB column): single-operator tool, restart wipes state which is acceptable — operator re-opens /authorize"
  - "redirect_uri read only from FB_OAUTH_REDIRECT_URI server-side — never from request params (T-1-OPENREDIR)"
  - "Dev-Mode OAuth ships now; Meta App Review for pages_manage_posts stays Phase 5 deliverable"
  - "Manual POST /api/settings/fb-connect kept as fallback (not removed)"
  - "FB_APP_SECRET never appears in thrown messages, logs, or responses — grep gate asserts this"
  - "fbOauth.test.ts mounts local Elysia over fbOauthRoutes only (no index.ts import) — avoids double port 3000 bind"
metrics:
  duration: "~35 minutes"
  completed: "2026-06-24T14:10:00Z"
  tasks: 4
  files_modified: 8
---

# Phase 01 Plan 05: Facebook OAuth Page-Connect (Dev Mode) Summary

**One-liner:** CSRF-protected OAuth Page-connect flow via Facebook Dev Mode — code→user-token→Page-token exchange, AES-256-GCM encrypted at rest, FB_APP_SECRET never leaked.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Operator FB App setup (documented, not blocked on) | — | .env.example, README.md |
| 2 (RED) | Failing tests for exchangeCodeForToken + getPageAccessToken | a7a20d4 | src/services/fbService.test.ts |
| 2 (GREEN) | FB OAuth env validation + Graph token-exchange service helpers | b6f7f51 | env.ts, .env.example, src/services/fbService.ts |
| 3 (RED) | Failing tests for fbOauth routes | 716999e | src/routes/fbOauth.test.ts |
| 3 (GREEN) | OAuth authorize + callback routes wired into boot | 85b0388 | src/routes/fbOauth.ts, index.ts |
| 4 | Document OAuth Dev-Mode flow in README | 62ea0ba | README.md |

## What Was Built

### Task 1 — Operator Facebook App Setup (documented, not blocked)
Per `autonomy_note`, the implementation proceeds autonomously without live credentials. The operator setup steps are documented in `.env.example` and `README.md`. Missing `FB_*` env vars only fail when the OAuth routes are actually invoked (lazy validation in `requireFbOAuthConfig()`), never at import/test time.

### Task 2 — FB OAuth env validation + Graph token-exchange helpers

**`backend/env.ts` — `requireFbOAuthConfig()`:**
- Reads `FB_APP_ID`, `FB_APP_SECRET`, `FB_OAUTH_REDIRECT_URI`
- Throws on missing/empty vars naming the missing variable(s)
- Never includes `FB_APP_SECRET` value in any thrown message (T-1-SECRET)
- Mirrors `requireEncryptionKey()` fail-fast pattern

**`backend/.env.example` — Facebook OAuth section:**
- Documents `FB_APP_ID`, `FB_APP_SECRET`, `FB_OAUTH_REDIRECT_URI`
- Comments explain Dev-Mode context, App Review Phase 5, and never-commit warning

**`backend/src/services/fbService.ts` — two new helpers:**
- `exchangeCodeForToken(code)`: GET `/v22.0/oauth/access_token` with URL-encoded params; handles error-in-body; returns `{ ok:true, userToken }` or `{ ok:false, error }`. Never logs code, secret, or token.
- `getPageAccessToken(userToken)`: GET `/v22.0/me/accounts`; returns first page; handles empty data and error body. Never logs user token or page token.
- Both mirror `verifyToken`'s raw-fetch + error-in-body + try/catch + [REDACTED] discipline.
- `verifyToken` unchanged and still exported.

### Task 3 — OAuth authorize + callback routes

**`backend/src/routes/fbOauth.ts`:**
- `GET /api/settings/fb-oauth/authorize`: generates `randomBytes(16).toString('hex')` CSRF state, stores in `pendingStates` Set, builds Facebook authorize URL with `client_id`, `redirect_uri` (server-side only), `state`, `scope`, `response_type=code`. Returns 302 with Location header.
- `GET /api/settings/fb-oauth/callback`: validates + consumes state (400 on mismatch or absent); exchanges code via `exchangeCodeForToken`; resolves Page token via `getPageAccessToken`; `encrypt(pageToken)` AES-256-GCM; upserts `pages` row; returns `{ ok:true, pageName }` — never the token.
- `redirect_uri` sourced only from `FB_OAUTH_REDIRECT_URI` server-side (T-1-OPENREDIR).

**`backend/index.ts`:**
- Added `import { fbOauthRoutes }` and `.use(fbOauthRoutes)` to the Elysia chain.
- Manual `settingsRoutes` (POST /fb-connect fallback) preserved.

### Task 4 — README documentation
Added "Connect a Facebook Page (OAuth, Dev Mode)" section covering prerequisites, step-by-step flow, App Review note (Phase 5), CSRF state restart behavior, fallback endpoint note, and FB_APP_SECRET security warning. API Endpoints and Environment Variables tables updated.

## Test Coverage

| Test File | Tests | Status |
|-----------|-------|--------|
| src/services/fbService.test.ts | 8 | GREEN |
| src/routes/fbOauth.test.ts | 17 | GREEN |
| src/routes/settings.test.ts | 10 | GREEN (unchanged) |
| All other existing tests | 18 | GREEN (unchanged) |
| **Total** | **53** | **ALL PASS** |

## Security Invariants Verified

| Threat ID | Status | Evidence |
|-----------|--------|---------|
| T-1-CSRF | SATISFIED | state validated + consumed at callback; mismatch → 400, nothing stored |
| T-1-SECRET | SATISFIED | grep shows 0 console lines referencing FB_APP_SECRET/appSecret; secret only in URL params (not logged) |
| T-1-EXPOSE | SATISFIED | page token never in response body; test asserts token absence in serialized response |
| T-1-OPENREDIR | SATISFIED | redirect_uri from server-side env only; no request param accepted |
| T-1-REPLAY | SATISFIED | pendingStates.delete(state) before any async call; second callback with same state → 400 |
| T-1-SC | N/A | No new packages installed (node:crypto + existing Elysia/Drizzle) |

## Deviations from Plan

### Task 1 treated as documentation task (not blocking checkpoint)
Per `autonomy_note` in the plan, Task 1 (operator Facebook App setup) is a `checkpoint:human-action` in the plan YAML, but the note explicitly instructs: "implement the code + mocked tests, document the Dev-Mode setup in README and .env.example, and record in SUMMARY.md that the operator must supply real FB_* env vars before using the flow live." This was followed — the implementation is complete with mocked tests; the operator must set `FB_APP_ID`, `FB_APP_SECRET`, and `FB_OAUTH_REDIRECT_URI` in `backend/.env` before using the live OAuth flow.

### No other deviations — plan executed as written.

## Known Stubs

None. The OAuth code path is fully wired end-to-end. The `pendingStates` store is intentionally in-process (no DB persistence) — this is a documented architectural decision, not a stub.

## Operator Action Required (Before Using Live OAuth Flow)

The automated tests use mocked Graph calls. To use the real OAuth flow:
1. Create a Facebook App in Development Mode at https://developers.facebook.com/apps
2. Add Facebook Login product; register `http://localhost:3000/api/settings/fb-oauth/callback` under Valid OAuth Redirect URIs
3. Add `FB_APP_ID`, `FB_APP_SECRET`, `FB_OAUTH_REDIRECT_URI` to `backend/.env` (never commit)
4. Run `bun run dev` and open `http://127.0.0.1:3000/api/settings/fb-oauth/authorize`

Meta App Review for `pages_manage_posts` remains a **Phase 5 deliverable**.

## Threat Flags

None — the two new endpoints are documented in the plan's threat model (T-1-CSRF, T-1-SECRET, T-1-EXPOSE, T-1-OPENREDIR, T-1-REPLAY) and all mitigations are implemented.

## Self-Check: PASSED

- backend/src/routes/fbOauth.ts: exists ✓
- backend/src/routes/fbOauth.test.ts: exists ✓
- backend/src/services/fbService.test.ts: exists ✓
- backend/env.ts: requireFbOAuthConfig present ✓
- backend/.env.example: FB_APP_ID/FB_APP_SECRET/FB_OAUTH_REDIRECT_URI present ✓
- backend/index.ts: fbOauthRoutes wired ✓
- backend/README.md: fb-oauth/authorize, Development Mode, App Review documented ✓
- Commits a7a20d4, b6f7f51, 716999e, 85b0388, 62ea0ba exist ✓
- Full test suite: 53 pass, 0 fail ✓
- grep FB_APP_SECRET/appSecret in console lines: 0 ✓
- fbOauth.test.ts does not import from index.ts: confirmed (0 matches) ✓
