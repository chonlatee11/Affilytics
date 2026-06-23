# Phase 1: Backend Foundation - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Stand up the localhost Bun + Elysia backend with a SQLite database (WAL + busy_timeout), the full schema for every core entity (Product, ProductExtra, PostDraft, PublishedPost, ResultEntry, Page, Setting), an encrypted Facebook token column (AES-256-GCM), and a settings flow to connect a Facebook Page. localhost-only access.

This is a foundation phase. It builds the schema, encryption, and FB-settings base that every later phase writes to — it does NOT build entity-specific endpoints (capture, scoring, drafting, publishing), which land in their own phases.

</domain>

<decisions>
## Implementation Decisions

### Facebook Page Connect
- **D-01:** "Connect Facebook Page" in Phase 1 = **manual token paste**, NOT a full OAuth redirect flow. Operator generates a Page access token (e.g. via Graph API Explorer) and pastes it (+ Page ID) into a settings endpoint; backend encrypts and stores it. Rationale: Meta App Review is deferred to end of Phase 5, and real publishing is Phase 6 — token paste proves the encryption flow now without blocking on App Review. The full OAuth redirect + 3-step token exchange is built in Phase 6.
- **D-02:** On token paste, **verify against the Graph API before storing** — call `GET /me` (or `/{page_id}`) to confirm the token is valid, fetch page name and `data_access_expiration_time` to store alongside. Reject invalid tokens at entry rather than failing later.

### Encryption Key Bootstrap
- **D-03:** Encryption key comes from `BUN_ENCRYPTION_KEY` env var; backend fails fast at startup if missing (locked by ROADMAP). The key is generated for the operator the first time via a **setup script** (e.g. `bun run setup`) that generates a secure key and writes it into `.env` automatically — do NOT make the operator hand-craft the key, and do NOT auto-generate silently inside the running backend (keep the fail-fast contract).
- **D-04:** If a stored token cannot be decrypted (key lost/changed), **detect it and surface a "disconnected" state** that prompts the operator to re-connect (paste a new token). Do NOT crash the backend at startup over an undecryptable token. Key rotation/recovery beyond this is deferred.

### Health Endpoint
- **D-05:** Health/status endpoint returns **200 OK + a DB connectivity check** (run a trivial query to confirm SQLite is reachable). Do not over-build: no FB/Ollama checks here — Ollama isn't used until Phase 5.

### API Scope (Phase 1)
- **D-06:** Build **only foundation endpoints**: health + settings/FB-connect. Create the **full SQLite schema for all core entities**, but entity-specific endpoints (capture, products, drafts, posts, results) are built in their own phases per the vertical-slice roadmap. No stub/dead routes.

### Schema Migrations
- **D-07:** Use **`drizzle-kit generate` + `migrate`** — tracked SQL migration files committed to git, applied on boot. Chosen over `drizzle-kit push` so schema changes in later phases are safe and auditable (ROADMAP notes the WAL retrofit migration concern).

### Default Settings Seeding
- **D-08:** On first boot, **seed a default Setting row if none exists**: balanced default `scoreWeights`, `draftMode = "template"`, a default `dailyPostLimit`, `defaultTone = "casual"`. Idempotent — only insert when missing.

### Database (confirmed, not changed)
- **D-09:** **SQLite stays** — explicitly reaffirmed after the operator floated switching to PostgreSQL. Kept per the locked self-hosted / zero-config / single-file / `bun:sqlite` rationale and requirement FOUND-02 which names SQLite + WAL. Postgres would require a separate server (against the embedded philosophy) and project-level doc changes; not justified for a single-user MVP. See Deferred Ideas if revisited for multi-user scale.

### Claude's Discretion
- **CORS / localhost binding:** Operator deferred this decision. Locked approach: **bind the server to `127.0.0.1`** (not `0.0.0.0`, so it's unreachable from the LAN) and use **`@elysiajs/cors` with an allowlist** — allow only the extension origin (`chrome-extension://<id>`) and the localhost dashboard (`localhost:3000`). This satisfies FOUND-03 (localhost-only) and supports the MV3 architecture where the background service worker issues the `fetch` to the backend.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition & requirements
- `.planning/ROADMAP.md` § "Phase 1: Backend Foundation" — goal, success criteria, and locked notes (WAL + busy_timeout=5000, key from `BUN_ENCRYPTION_KEY` fail-fast, Drizzle on `drizzle-orm/bun-sqlite`)
- `.planning/REQUIREMENTS.md` — FOUND-01, FOUND-02, FOUND-03, SET-01
- `.planning/PROJECT.md` — core value, constraints (zero-cost, localhost-only, encrypted token at rest)

### Tech stack (locked)
- `CLAUDE.md` § "Technology Stack" / "GSD Managed Sections" — Bun 1.3.14, Elysia 1.4.29, Drizzle ORM 0.45.2 (`drizzle-orm/bun-sqlite`), drizzle-kit 0.31.10, `@elysiajs/cors` 1.4.2, Node `crypto` AES-256-GCM for `accessTokenEnc`
- `CLAUDE.md` § "Core Domain Model" — entity field shapes for Product, ProductExtra, PostDraft, PublishedPost, ResultEntry, PageSettings (Setting/Page)

No external ADRs/specs beyond the planning docs above — requirements fully captured in decisions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield. Repo currently contains only planning docs (CLAUDE.md, requirements, .planning/). No backend/extension/frontend code exists yet.

### Established Patterns
- Stack patterns are pre-specified in `CLAUDE.md` (GSD Managed Sections § "Stack Patterns by Layer"): single `src/index.ts` entry, Elysia plugins for CORS/Swagger, schema in `db/schema.ts` via Drizzle SQLite column builders, end-to-end typed route handlers via TypeBox `t.Object()`.

### Integration Points
- This phase produces the schema + settings/FB-connect + health API that Phase 2 (capture endpoint) and all later phases build on.

</code_context>

<specifics>
## Specific Ideas

- Token paste flow should mirror a real-world "paste a Page token from Graph API Explorer" UX, with a verify-on-save round-trip so the operator gets immediate feedback if the token is bad.
- Setup script (`bun run setup` or similar) is the canonical first-run experience for generating `BUN_ENCRYPTION_KEY`.

</specifics>

<deferred>
## Deferred Ideas

- **Full Facebook OAuth redirect flow + 3-step token exchange** (short-lived → long-lived → non-expiring Page token) — belongs in Phase 6 (Facebook Publishing).
- **Encryption key rotation / recovery tooling** beyond the disconnect-and-reconnect fallback — future enhancement, not MVP.
- **PostgreSQL / multi-user database** — operator raised switching from SQLite to Postgres; rejected for this MVP (single-user, embedded philosophy). Revisit only if multi-user/scale becomes a goal, which would require updating PROJECT.md / REQUIREMENTS.md (FOUND-02) / ROADMAP.md and the tech stack first.
- **Ollama / FB reachability checks in health endpoint** — only relevant once Ollama (Phase 5) and publishing (Phase 6) exist.

</deferred>

---

*Phase: 1-Backend Foundation*
*Context gathered: 2026-06-23*
