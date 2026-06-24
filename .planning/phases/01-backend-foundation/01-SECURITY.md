---
phase: 01
slug: backend-foundation
status: verified
threats_open: 0
asvs_level: 2
created: 2026-06-24
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| operator filesystem → repo (git) | Secrets must never cross into version control | `.env` BUN_ENCRYPTION_KEY, SQLite DB file |
| process env → crypto key | `BUN_ENCRYPTION_KEY` bootstraps all token encryption | 32-byte AES key (64-char hex) |
| stored ciphertext → application | Tampered / key-mismatched ciphertext must degrade safely | AES-256-GCM ciphertext (FB token) |
| extension/dashboard (browser) → backend HTTP | Cross-origin requests; only allowlisted origins permitted | JSON request/response |
| LAN → backend socket | Must be unreachable — bind 127.0.0.1 only | TCP socket |
| operator browser → backend OAuth callback | Inbound `code` + `state` from redirect; untrusted until validated | OAuth authorization code, CSRF state |
| backend → Meta Graph API | Outbound token verification + OAuth exchange; secrets must not leak | FB_APP_SECRET, code, page/user tokens |
| backend → SQLite (pages.accessTokenEnc) | Page token at rest — must be encrypted | AES-256-GCM ciphertext |
| test harness → external (Meta Graph API) | Tests must never make live calls to graph.facebook.com | (mocked) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-1-KEY | Information Disclosure / Spoofing | `.env` BUN_ENCRYPTION_KEY + key bootstrap | mitigate | `.gitignore:7` (.env ignored); `.env.example:12` placeholder only; `env.ts:14-37` `requireEncryptionKey()` validates 64-char hex, fails fast; `scripts/setup.ts:35` `randomBytes(32)`, never overwrites | closed |
| T-1-EXPOSE | Information Disclosure | settings GET response + token at rest/responses + logs | mitigate | `settings.ts:114-124` returned object excludes `accessTokenEnc`; `fbOauth.ts:149-154` callback returns `{ ok, pageName }` only; `fbService.ts:117,184,252` `[REDACTED]` in error log paths | closed |
| T-1-FBVERIFY | Spoofing | pasted FB token | mitigate | `fbService.ts:72-123` `verifyToken()` checks error body + page-ID mismatch; `settings.ts:29-35` 422 on `!result.ok`, no persistence | closed |
| T-1-DISCONNECT | Denial of Service | undecryptable stored token | mitigate | `cryptoService.ts:40-58` `decrypt()` body in try/catch → returns `null`; `settings.ts:101-106` `null` → `fbConnected:false`, no crash | closed |
| T-1-CRYPTO | Tampering | AES-256-GCM auth tag | mitigate | `cryptoService.ts:23-24` fresh `randomBytes(12)` IV; `cryptoService.ts:51-52` `setAuthTag()` before `final()`; wrong-key failure caught → `null` | closed |
| T-1-LAN | Elevation of Privilege / Information Disclosure | Elysia socket binding + SQLite WAL/busy_timeout | mitigate | `index.ts:43` `hostname:'127.0.0.1'`; `client.ts:62-63` PRAGMAs before `drizzle()`; `server.test.ts:37` asserts hostname | closed |
| T-1-MIGRATE | Tampering | schema drift via push | mitigate | `migrate.ts:18` tracked migrate; `drizzle/0000_*.sql` 7 CREATE TABLE; no `drizzle-kit push` in `package.json` | closed |
| T-1-CORS | Spoofing | cross-origin requests | mitigate | `index.ts:50-58` `@elysiajs/cors` allowlist: `localhost:3000`, `localhost:5173`, `/^chrome-extension:\/\//` regex | closed |
| T-1-CSRF | Spoofing / Tampering | `/fb-oauth/callback` | mitigate | `fbOauth.ts:62-63` `randomBytes(16)` state in `pendingStates`; `fbOauth.ts:98-112` `has()` → `delete()` → token exchange; mismatch → 400, nothing stored | closed |
| T-1-SECRET | Information Disclosure | FB_APP_SECRET in logs/responses | mitigate | `env.ts:64-70` thrown message lists var names not values; `fbService.ts:148-156` `client_secret` in POST body not URL; zero `console.*appSecret` lines | closed |
| T-1-OPENREDIR | Tampering | redirect_uri in authorize/exchange | mitigate | `fbOauth.ts:59,68` `redirect_uri` from `requireFbOAuthConfig()` server-side only; no request param accepted | closed |
| T-1-REPLAY | Tampering | reused authorization code / state | mitigate | `fbOauth.ts:104` `pendingStates.delete(state)` before async; `fbOauth.test.ts:299-327` replayed state → 400 | closed |
| T-1-SC | Tampering | npm package supply chain | accept | Phase 1 packages pre-approved in RESEARCH § Package Legitimacy Audit; no postinstall scripts; no new packages — see Accepted Risks Log | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-1-SC | T-1-SC | All Phase 1 npm packages pre-approved in RESEARCH § Package Legitimacy Audit (high downloads, no postinstall scripts). No new packages installed in this phase. Supply-chain risk accepted at zero-cost, self-hosted scope. | operator (chonlatee22) | 2026-06-24 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-24 | 13 | 13 | 0 | gsd-security-auditor (sonnet) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-24
