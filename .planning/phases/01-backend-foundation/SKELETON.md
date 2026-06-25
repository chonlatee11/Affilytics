# Walking Skeleton — Affilytics

**Phase:** 1
**Generated:** 2026-06-23

## Capability Proven End-to-End

The operator runs `bun run setup` then `bun run dev`, the backend boots on `127.0.0.1:3000` with a fully-migrated SQLite database, and the operator connects a Facebook Page by POSTing a Page token + Page ID — the backend verifies it against the live Graph API, stores it AES-256-GCM-encrypted, and `GET /api/settings` confirms `fbConnected: true` with the page name and never exposes the token.

This single flow exercises the full stack: env/key bootstrap → SQLite WAL connection → tracked migration → idempotent seed → Elysia route → external Graph API call → field encryption → localhost-only binding.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Runtime | Bun 1.3.14 | Native `bun:sqlite`, native `fetch`, built-in test runner; locked stack; zero-cost self-hosted (CLAUDE.md) |
| HTTP framework | Elysia 1.4.29 | Bun-native; AOT TypeBox validation; `serve.hostname` for localhost-only binding (FOUND-03) |
| Data layer | SQLite via `bun:sqlite` + Drizzle ORM 0.45.2 (`drizzle-orm/bun-sqlite`) | Embedded single-file DB; D-09 reaffirmed SQLite over Postgres; Drizzle adds type-safety + tracked migrations over raw bun:sqlite |
| Migrations | `drizzle-kit generate` → committed SQL → `migrate()` on boot (synchronous) | D-07: tracked + auditable; avoids `push` column-drop hazard and the WAL-retrofit migration risk |
| DB connection | `PRAGMA journal_mode=WAL` + `PRAGMA busy_timeout=5000` set on the raw `Database` BEFORE `drizzle()` | busy_timeout is per-connection; WAL must precede migrate (RESEARCH Pitfalls 1–2) |
| Secret storage | Node `node:crypto` AES-256-GCM on the single `access_token_enc` column; key from `BUN_ENCRYPTION_KEY` env | No SQLCipher (incompatible with bun:sqlite); field-level GCM gives authenticated encryption; key fail-fast at boot (D-03) |
| Key bootstrap | `bun run setup` generates `randomBytes(32)` hex into gitignored `.env`; backend fails fast if missing | Operator never hand-crafts the key; no silent in-process auto-gen (D-03) |
| FB "connect" (Phase 1) | Manual Page-token paste verified via Graph API `GET /me` (no app secret) | D-01/D-02: proves the encryption flow now; full OAuth + 3-step token exchange deferred to Phase 6 |
| Network exposure | Bind `127.0.0.1` (not 0.0.0.0) + `@elysiajs/cors` allowlist (localhost dashboard + `chrome-extension://` regex) | FOUND-03 localhost-only; supports MV3 background-worker fetch (CONTEXT CORS decision) |
| Directory layout | `backend/src/{db,services,routes}` + `scripts/` + `drizzle/`; tests co-located as `*.test.ts` | RESEARCH § Recommended Project Structure; `bun test` file-pattern discovery |

## Stack Touched in Phase 1

- [x] Project scaffold (Bun project, TS, drizzle-kit, `bun test` runner) — Plan 01
- [x] Routing — real routes `GET /health`, `POST /api/settings/fb-connect`, `GET /api/settings` — Plan 03
- [x] Database — real write (encrypted token + seeded settings) AND real read (settings/health DB ping) — Plans 02–03
- [x] UI / interactive element wired to the API — for Phase 1 the "interactive element" is the settings/FB-connect HTTP endpoint exercised via curl/Graph API Explorer (no dashboard UI yet; Next.js dashboard is Phase 4)
- [x] Deployment — documented local full-stack run command in `backend/README.md` (`bun run setup` → `bun run dev` → `curl /health`)

## Out of Scope (Deferred to Later Slices)

- Full Facebook OAuth redirect flow + 3-step token exchange (short-lived → long-lived → non-expiring Page token) — **Phase 6**
- `data_access_expires_at` / token-expiry warnings (not available from `GET /me`) — **Phase 6**
- Entity-specific endpoints: product capture, scoring, drafts, posts, results — **their own phases** (D-06; schema exists now, endpoints do not — no stub/dead routes)
- Encryption key rotation / recovery tooling beyond disconnect-and-reconnect — deferred
- Ollama / FB reachability checks in the health endpoint — **Phase 5/6** (health is DB-only now, D-05)
- Next.js dashboard UI — **Phase 4**
- The browser extension (WXT/MV3) — **Phase 2**
- PostgreSQL / multi-user — rejected for MVP (would require PROJECT/REQUIREMENTS/ROADMAP changes first)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions (the schema, crypto path, migration model, and localhost binding are contracts):

- **Phase 2:** MV3 extension (WXT) captures a Shopee product → background worker `fetch` → backend capture endpoint writes a `products` row
- **Phase 3:** weighted promote-worthiness scoring + commission/affiliate-link entry (writes `product_extras`, tunable `settings.score_weights`)
- **Phase 4:** Next.js dashboard — ranked/filterable product table + comparison (first real UI on the localhost API)
- **Phase 5:** template/Ollama caption drafting + #ad + approval state machine (`post_drafts`); submit Meta App Review at phase end
- **Phase 6:** Facebook publishing — full OAuth token exchange + Graph API publish/schedule (`published_posts`), retry + rate guard, token-expiry warnings
- **Phase 7:** manual result entry + actual-vs-predicted score chart (`result_entries`)
- **Phase 8:** Lazada then TikTok parsers via the config-driven parser pattern from Phase 2
