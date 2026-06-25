# Phase 1: Backend Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-23
**Phase:** 1-Backend Foundation
**Areas discussed:** Facebook Page connect, Encryption key bootstrap, Health endpoint, API scope, Schema migration, Default settings seeding, CORS/localhost binding

---

## Facebook Page Connect

| Option | Description | Selected |
|--------|-------------|----------|
| Token paste (manual) | Operator pastes a Page access token; backend encrypts and stores. No App Review needed; proves encryption flow in Phase 1. | ✓ |
| Full OAuth redirect flow | Build OAuth login + token exchange in Phase 1. Blocked by App Review; belongs in Phase 6. | |
| Token paste + OAuth stub | Token paste now + settings schema/endpoint shaped for OAuth. | |

**User's choice:** Token paste (manual)

### Token verify (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Verify before storing | Call Graph API (`GET /me` / `/{page_id}`) to confirm validity + fetch page name / data_access_expiration. | ✓ |
| Store without verify | Store as-is, no network dependency in Phase 1. | |
| Toggle to verify | Format-check only; live verify optional ("test connection"). | |

**User's choice:** Verify before storing
**Notes:** Reject invalid tokens at entry rather than failing in Phase 6.

---

## Encryption Key Bootstrap

| Option | Description | Selected |
|--------|-------------|----------|
| Setup script generates | `bun run setup` generates a secure key into `.env` automatically. | ✓ |
| Document in README | Document an `openssl rand` recipe for the operator to run manually. | |
| Backend auto-gen if missing | Generate at startup if absent (conflicts with fail-fast). | |

**User's choice:** Setup script generates

### Key recovery (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Detect + re-connect | On decrypt failure, show "disconnected" state and prompt operator to re-paste token. | ✓ |
| Fail-fast at startup | Hard error on undecryptable token. | |
| Defer entirely | Leave key rotation/recovery to a later phase. | |

**User's choice:** Detect + re-connect

---

## Health Endpoint

| Option | Description | Selected |
|--------|-------------|----------|
| 200 OK + DB check | Status ok + confirm SQLite reachable via trivial query. | ✓ |
| 200 OK only | Bare status, no dependency checks. | |
| Full health (DB+FB+Ollama) | Check DB + FB token + Ollama in one endpoint. | |

**User's choice:** 200 OK + DB check
**Notes:** Ollama isn't used until Phase 5 — avoid over-building.

---

## API Scope (Phase 1)

| Option | Description | Selected |
|--------|-------------|----------|
| Foundation only | Build health + settings/FB-connect; full schema but no entity endpoints yet. | ✓ |
| Stub all entity routes | Scaffold CRUD routes (no logic) for every entity. | |
| Foundation + capture endpoint | Also build POST /api/products/capture ahead for Phase 2. | |

**User's choice:** Foundation only
**Notes:** Matches the vertical-slice roadmap; avoids dead code.

---

## Schema Migration

| Option | Description | Selected |
|--------|-------------|----------|
| generate+migrate | Tracked SQL migration files committed to git, applied on boot. | ✓ |
| drizzle-kit push | Push schema code → DB, no migration files. | |
| push in dev + generate at ship | Hybrid. | |

**User's choice:** generate+migrate
**Notes:** Safer for schema changes across later phases (ROADMAP WAL-retrofit note).

---

## Default Settings Seeding

| Option | Description | Selected |
|--------|-------------|----------|
| Seed defaults | Insert a default Setting row if missing (scoreWeights, draftMode='template', dailyPostLimit, defaultTone='casual'). | ✓ |
| No seed | Settings start null until set in the settings phase. | |

**User's choice:** Seed defaults

---

## CORS / localhost binding

| Option | Description | Selected |
|--------|-------------|----------|
| 127.0.0.1 + CORS allowlist | Bind 127.0.0.1; allow only extension origin + localhost dashboard. | |
| 127.0.0.1 + open CORS | Bind localhost; allow any origin. | |
| You decide | Defer to Claude's best practice. | ✓ |

**User's choice:** You decide → Claude locked **127.0.0.1 + CORS allowlist** (extension origin `chrome-extension://<id>` + `localhost:3000`), matching FOUND-03 and MV3 background-fetch architecture.

---

## Database — SQLite vs PostgreSQL (raised mid-discussion)

The operator floated switching from SQLite to PostgreSQL. Flagged as a project-level tech-stack change (not a Phase 1 gray area) that conflicts with locked decisions (FOUND-02 names SQLite + WAL; embedded/zero-config/`bun:sqlite` rationale). After reviewing tradeoffs (Postgres needs a separate server, not justified for a single-user MVP, would require updating PROJECT.md/REQUIREMENTS.md/ROADMAP.md), the operator chose to **keep SQLite**.

---

## Claude's Discretion

- **CORS / localhost binding** — operator deferred; locked to 127.0.0.1 bind + `@elysiajs/cors` allowlist (extension origin + localhost dashboard).

## Deferred Ideas

- Full Facebook OAuth redirect flow + 3-step token exchange → Phase 6.
- Encryption key rotation/recovery beyond disconnect-and-reconnect → future enhancement.
- PostgreSQL / multi-user database → out of scope for MVP; revisit only for multi-user scale (requires project-doc updates first).
- Ollama / FB reachability checks in health endpoint → relevant from Phase 5/6 onward.
