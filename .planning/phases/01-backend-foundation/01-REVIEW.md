---
phase: 01-backend-foundation
reviewed: 2026-06-24T00:00:00Z
depth: standard
files_reviewed: 36
files_reviewed_list:
  - backend/bunfig.toml
  - backend/bun.lock
  - backend/drizzle/0000_lyrical_the_initiative.sql
  - backend/drizzle.config.ts
  - backend/drizzle/meta/0000_snapshot.json
  - backend/drizzle/meta/_journal.json
  - backend/.env.example
  - backend/env.ts
  - backend/.gitignore
  - backend/index.ts
  - backend/package.json
  - backend/README.md
  - backend/scripts/setup.ts
  - backend/seed.ts
  - backend/src/db/client.ts
  - backend/src/db/migrate.ts
  - backend/src/db/pragma.test.ts
  - backend/src/db/schema.test.ts
  - backend/src/db/schema.ts
  - backend/src/index.test.ts
  - backend/src/routes/fbOauth.test.ts
  - backend/src/routes/fbOauth.ts
  - backend/src/routes/health.test.ts
  - backend/src/routes/health.ts
  - backend/src/routes/settings.test.ts
  - backend/src/routes/settings.ts
  - backend/src/seed.test.ts
  - backend/src/server.test.ts
  - backend/src/services/cryptoService.test.ts
  - backend/src/services/cryptoService.ts
  - backend/src/services/fbService.test.ts
  - backend/src/services/fbService.ts
  - backend/test/helpers/fbMock.ts
  - backend/tsconfig.json
findings:
  critical: 1
  warning: 6
  info: 5
  total: 12
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-06-24
**Depth:** standard
**Files Reviewed:** 36
**Status:** issues_found

## Summary

Reviewed the backend foundation: Elysia bootstrap, SQLite/Drizzle client, schema + migration, AES-256-GCM crypto service, Facebook token verify/OAuth flows, settings + health routes, and supporting config. Overall the security-sensitive code (crypto, token redaction, CORS, 127.0.0.1 bind, CSRF state) is implemented carefully and the threat-model annotations are mostly honored.

The most serious defect is that **SQLite foreign-key enforcement is never enabled**, so all the `FOREIGN KEY (...) REFERENCES` constraints declared across six tables are silently inert — orphaned/dangling references can be written, which is a data-integrity (data-corruption) risk for every downstream phase that relies on these relationships. Several warnings concern config/code drift (hardcoded port vs documented `PORT`, `exact = false` contradicting its comment), a CSRF-state memory leak, and a migration-error swallow that can hide real failures in production.

## Critical Issues

### CR-01: Foreign-key constraints are never enforced — `PRAGMA foreign_keys` left OFF

**File:** `backend/src/db/client.ts:62-63`
**Issue:** SQLite ships with `PRAGMA foreign_keys = OFF` by default, and the flag is **per-connection** (like `busy_timeout`). `openDatabase()` sets `journal_mode=WAL` and `busy_timeout=5000` but never sets `PRAGMA foreign_keys = ON`. As a result, every `FOREIGN KEY` clause in the migration (`product_extras.product_id`, `post_drafts.product_id`, `published_posts.draft_id`, `result_entries.product_id`, etc.) is declared but **not enforced**. The application can insert a `post_drafts` row referencing a non-existent product, or delete a product that still has dependent rows, with no error — producing orphaned/dangling references. This is a silent data-integrity defect that will surface as corrupt joins in Phases 3-6. The schema comments and migration imply referential integrity that does not actually exist at runtime.
**Fix:**
```ts
const sqlite = new Database(resolvedPath)

sqlite.exec('PRAGMA journal_mode = WAL')
sqlite.exec('PRAGMA busy_timeout = 5000')
sqlite.exec('PRAGMA foreign_keys = ON')   // per-connection; must be set on every Database()
```
Add a test (mirroring `pragma.test.ts`) asserting `PRAGMA foreign_keys` returns `1`, and a test that inserting a `post_drafts` row with a bogus `product_id` throws.

## Warnings

### WR-01: Hardcoded port 3000 ignores documented `PORT` env var

**File:** `backend/index.ts:44,70`
**Issue:** `.env.example:18` documents `# PORT=3000` as the configurable listen port ("Optional: Port to listen on (default: 3000)"), but `index.ts` hardcodes `3000` twice — in the `serve` config and again in `app.listen(3000)`. Setting `PORT` in `.env` has no effect, so the documented contract is broken. The duplicate `3000` (once in `serve.port`, once in `.listen()`) is also redundant/confusing.
**Fix:**
```ts
const PORT = Number(process.env.PORT ?? 3000)
export const app = new Elysia({ serve: { hostname: '127.0.0.1', port: PORT } })
  // ...
if (import.meta.main) {
  app.listen(PORT)
  console.log(`Listening on http://${app.server?.hostname}:${app.server?.port}`)
}
```

### WR-02: Migration error-swallow can hide real failures in production

**File:** `backend/src/db/client.ts:86-102`
**Issue:** `openDatabase()` wraps `migrate()` in a try/catch that silently swallows errors whose message matches `no such file`, `ENOENT`, `Cannot find module`, or `Can't find meta/_journal.json`. The intent (allow import before migrations are generated) is reasonable for early dev, but the migration files now exist and are committed. String-matching on error messages is brittle: a genuine production failure (e.g., a referenced migration SQL file deleted, or a transient FS error containing "ENOENT") would be silently swallowed, leaving the DB with **no tables** and the server booting "successfully" into a broken state. Boot-time schema failure should be loud.
**Fix:** Now that `drizzle/` is committed, remove the swallow in production paths, or gate it so it only applies in test/`:memory:` contexts:
```ts
try {
  migrate(db, { migrationsFolder: './drizzle' })
} catch (err) {
  // Only tolerate "migrations not generated yet" in test/in-memory contexts.
  if (!isMemory) throw err
  const message = err instanceof Error ? err.message : String(err)
  if (!/no such file|ENOENT|Cannot find module|_journal\.json/.test(message)) throw err
}
```

### WR-03: `migrate.ts` runs migrations a second time as an import side effect

**File:** `backend/src/db/migrate.ts:13-20`
**Issue:** Importing `./client` already runs `openDatabase()` (which calls `migrate()`), and then `migrate.ts` calls `migrate(db, ...)` again at module top level as a side effect. The header comment claims it is "Imported by src/index.ts at boot" but `index.ts` does **not** import it (it relies on the `client.ts` single migrate path, per the WR-01-resolved comment). So this file is effectively dead except as the `migrate:run` script — where it double-migrates (open → migrate, then migrate again). Drizzle's migrator is idempotent so it is not fatal, but it is misleading duplicate work and the comment is inaccurate.
**Fix:** Either delete `migrate.ts` and point the `migrate:run` script at a no-op import of `client.ts`, or remove the redundant explicit `migrate()` call and the inaccurate "Imported by src/index.ts" comment.

### WR-04: CSRF `pendingStates` set grows unbounded (no TTL / no eviction)

**File:** `backend/src/routes/fbOauth.ts:37,63`
**Issue:** Every `GET /authorize` call adds a 16-byte hex state to the in-process `pendingStates` Set, but states are only ever removed when a matching `/callback` consumes them (line 104). Any `/authorize` that is never followed by a successful callback (operator abandons the flow, closes the tab, FB denies) leaves the state in the Set forever. Over time this is unbounded memory growth and, more importantly, never-expiring CSRF tokens remain valid indefinitely, weakening the single-use/replay protection's intent. The code comment explicitly acknowledges "An optional TTL is not implemented."
**Fix:** Store an issue timestamp and reject/evict states older than a short window (e.g., 10 minutes):
```ts
const pendingStates = new Map<string, number>()  // state -> issuedAt ms
const STATE_TTL_MS = 10 * 60 * 1000
// on authorize: pendingStates.set(state, Date.now())
// on callback: const ts = pendingStates.get(state); pendingStates.delete(state)
//   if (!ts || Date.now() - ts > STATE_TTL_MS) -> 400 state_mismatch
```

### WR-05: `setup.ts` key-detection appends a duplicate key for an empty-value line

**File:** `backend/scripts/setup.ts:23-25,38-41`
**Issue:** The "already set" check requires both `startsWith(\`${KEY_NAME}=\`)` AND a non-empty trimmed value. If `.env` contains `BUN_ENCRYPTION_KEY=` with an empty value (e.g., copied verbatim from `.env.example:12`, which ships exactly that line), `hasKey` is `false`, so `appendFileSync` adds a **second** `BUN_ENCRYPTION_KEY=<generated>` line. The file now has two `BUN_ENCRYPTION_KEY` entries; which one `process.env` exposes depends on dotenv/Bun load order, so the operator can silently end up encrypting with one key and (after an edit) decrypting with another — corrupting stored tokens. Also, `.split('=')[1]?.trim().length > 0` evaluates `undefined > 0` for value-less lines, which is a latent strict-mode comparison smell.
**Fix:** Detect any existing `BUN_ENCRYPTION_KEY=` line regardless of value; refuse to append a duplicate, and instruct the operator to fill an empty one manually:
```ts
const keyLines = contents.split('\n').filter(l => l.startsWith(`${KEY_NAME}=`))
if (keyLines.length > 0) {
  const hasValue = keyLines.some(l => (l.split('=')[1] ?? '').trim().length > 0)
  console.log(hasValue
    ? `${KEY_NAME} is already set — nothing to do.`
    : `${KEY_NAME} exists but is empty — fill it in manually (do not append a second key).`)
  process.exit(0)
}
```

### WR-06: GET /api/settings always reports `dataAccessExpiresAt: null` — silent token expiry

**File:** `backend/src/routes/settings.ts:48,63` and `backend/src/routes/fbOauth.ts:138,145`
**Issue:** Both the manual paste flow and the OAuth flow hardcode `dataAccessExpiresAt: null` when storing the page. The OAuth callback already obtains a real user/page token whose expiry is retrievable via Graph (`debug_token` / `fields=data_access_expires_at`), but it is discarded. Storing `null` unconditionally means the operator gets **no warning before a token silently expires** (CLAUDE.md "Known Constraints #3: FB token expires every ~60 days"). The schema column exists specifically to support this, so the always-null behavior defeats its purpose: the dashboard reads "connected" right up until publishing fails. Acceptable only if the deferral is explicitly tracked.
**Fix:** Add a code TODO referencing the phase that will populate it; ideally fetch `data_access_expires_at` during `getPageAccessToken` and persist it so the dashboard can warn ahead of expiry.

## Info

### IN-01: `bunfig.toml` `exact = false` contradicts its own comment

**File:** `backend/bunfig.toml:2-3`
**Issue:** The comment reads `# Use exact versions from package.json` but the setting is `exact = false`, which is the opposite (allows range resolution). The Technology Stack guide pins exact versions; this drift could let `bun install` resolve non-pinned versions for transitive ranges.
**Fix:** Set `exact = true` to match the comment and the pinned-version intent, or fix the comment to say ranges are allowed.

### IN-02: Unused `dataAccessExpiresAt: undefined` field on `VerifyTokenResult`

**File:** `backend/src/services/fbService.ts:21,111`
**Issue:** `VerifyTokenResult.dataAccessExpiresAt` is typed as `undefined` and always set to `undefined`. It carries no information and is never read by `settings.ts` (which hardcodes `null`). Dead field.
**Fix:** Remove the field from the interface and the return, or make it a real `number | null` once WR-06 is addressed.

### IN-03: Redundant duplicate import in `health.ts`

**File:** `backend/src/routes/health.ts:10-11`
**Issue:** `db` and `rawSqlite` are imported from `../db/client` in two separate `import` statements. Cosmetic.
**Fix:**
```ts
import { db, rawSqlite } from '../db/client'
```

### IN-04: `JSON.parse(settingsRow.scoreWeights)` is unguarded

**File:** `backend/src/routes/settings.ts:118-120`
**Issue:** `scoreWeights` is stored as a JSON string; `GET /api/settings` calls `JSON.parse` on it directly. If the column is ever manually edited or corrupted to invalid JSON, this throws and returns a 500 for the entire settings endpoint. Low likelihood in Phase 1 (only the seed writes it), hence Info.
**Fix:** Wrap in try/catch returning `null` on parse failure, consistent with the resilient "never crash" posture used in `decrypt()`.

### IN-05: `tsconfig.json` does not include the root boot files

**File:** `backend/tsconfig.json:15-16`
**Issue:** `include` lists `src/**/*`, `scripts/**/*`, `test/**/*` but not the root-level `index.ts`, `seed.ts`, `env.ts`, or `drizzle.config.ts`. Bun runs them regardless, but `tsc --noEmit` type-checking (if added to CI) would not cover the entry point or env-validation module — the two most boot-critical files.
**Fix:** Add `index.ts`, `seed.ts`, `env.ts` to `include` (or include `*.ts`) so type-checking covers the boot path.

---

_Reviewed: 2026-06-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
