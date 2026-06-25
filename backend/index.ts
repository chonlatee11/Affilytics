/**
 * Affilytics Backend — Entry Point and Boot Sequence.
 *
 * Boot order (RESEARCH § System Architecture Diagram):
 *   1. requireEncryptionKey() — fail-fast if BUN_ENCRYPTION_KEY missing (D-03, T-1-KEY)
 *   2. import db (via routes) — opening it sets PRAGMAs (WAL + busy_timeout) before drizzle()
 *      wraps and applies migrations via openDatabase() (single migrate path — no WR-01 double-migrate)
 *   3. Elysia app on 127.0.0.1:PORT — LAN-unreachable (FOUND-03, T-1-LAN)
 *   4. CORS allowlist: localhost dashboard + chrome-extension origin (T-1-CORS)
 *   5. seedDefaultSettings() + .listen() — only when run as main entry (import.meta.main);
 *      importing this module in tests does NOT bind the port and does NOT write the seed row.
 *
 * FOUND-01: GET /health returns 200.
 * FOUND-03: bound to 127.0.0.1 only (not 0.0.0.0).
 * SET-01: /api/settings/fb-connect verifies, encrypts, stores FB token.
 */

import { requireEncryptionKey, resolvePort } from './env'
import { Elysia } from 'elysia'
import cors from '@elysiajs/cors'
import swagger from '@elysiajs/swagger'

// Step 1: Fail fast if BUN_ENCRYPTION_KEY is missing (D-03, T-1-KEY)
// This MUST be the first runtime call — before any DB or crypto operations.
//
// IMPORTANT: the db/seed/route modules below are loaded via dynamic `await import()`, NOT
// static `import`. Static imports are hoisted and evaluated BEFORE this statement runs, so a
// static `import { db } from './src/db/client'` would open the SQLite file and run migrations
// before the key check — defeating the documented "key-first" ordering (T-1-KEY/D-03).
// Deferring those imports until after requireEncryptionKey() preserves the invariant.
requireEncryptionKey()

// Steps 2-4: Create Elysia app bound to 127.0.0.1 (Pitfall 4: never 0.0.0.0).
// Importing the route modules opens the db singleton (after the key check above).
const { healthRoutes } = await import('./src/routes/health')
const { settingsRoutes } = await import('./src/routes/settings')
const { fbOauthRoutes } = await import('./src/routes/fbOauth')
const { productsRoutes } = await import('./src/routes/products')

// PORT is configurable via the documented PORT env var (.env.example), defaulting to 3000.
// WR-01: resolvePort() validates the value and fails fast on empty-string/NaN/out-of-range,
// rather than silently binding port 0 (random ephemeral) or NaN.
const PORT = resolvePort()

// CORS allowlist: dashboard origin(s) + chrome-extension. The dashboard origin is configurable
// via DASHBOARD_ORIGIN (comma-separated) because the backend and a Next.js dev server both
// default to :3000 — the operator may need to run the dashboard on another port, which would
// otherwise be blocked by a hardcoded allowlist.
const dashboardOrigins = (
  process.env.DASHBOARD_ORIGIN ?? 'http://localhost:3000,http://localhost:5173'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

export const app = new Elysia({
  serve: {
    hostname: '127.0.0.1',
    port: PORT,
  },
})
  // Pitfall 5: chrome-extension:// is a special origin — must use regex, not a plain string
  .use(
    cors({
      origin: [...dashboardOrigins, /^chrome-extension:\/\//],
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: false,
    })
  )
  // Dev-time OpenAPI docs (free, does not affect production behavior)
  .use(swagger())
  // Routes
  .use(healthRoutes)
  .use(settingsRoutes)
  .use(fbOauthRoutes)  // SET-01 / Gap 4: OAuth Page-connect flow (Dev Mode)
  .use(productsRoutes)  // CAP-02/03/04: POST /api/products/capture (D-05 upsert on product_url)

// Seed + listen only when run as the main entry point (bun run index.ts).
// When imported by tests, this block is skipped — no port bind AND no settings-row write
// (seedDefaultSettings performs a DB INSERT; running it on every test import is an unwanted
// side effect, so it lives behind the import.meta.main guard alongside .listen()).
if (import.meta.main) {
  const { seedDefaultSettings } = await import('./seed')
  await seedDefaultSettings()
  app.listen(PORT)
  console.log(
    `Listening on http://${app.server?.hostname}:${app.server?.port}`
  )
}
