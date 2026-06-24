/**
 * Affilytics Backend — Entry Point and Boot Sequence.
 *
 * Boot order (RESEARCH § System Architecture Diagram):
 *   1. requireEncryptionKey() — fail-fast if BUN_ENCRYPTION_KEY missing (D-03, T-1-KEY)
 *   2. import db — opening it sets PRAGMAs (WAL + busy_timeout) before drizzle() wraps
 *      and applies migrations via openDatabase() (single migrate path — no WR-01 double-migrate)
 *   3. seedDefaultSettings() — idempotent default settings row (D-08)
 *   4. Elysia app on 127.0.0.1:3000 — LAN-unreachable (FOUND-03, T-1-LAN)
 *   5. CORS allowlist: localhost dashboard + chrome-extension origin (T-1-CORS)
 *   6. .listen() — only when run as main entry (import.meta.main); importing this module
 *      in tests does NOT bind port 3000.
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
requireEncryptionKey()

// Step 2: Import db singleton (opening it runs PRAGMAs + applies migrations via openDatabase())
// Migrations are applied inside openDatabase() — single source of truth; no second migrate() call here (WR-01 resolved).
import { db } from './src/db/client'

// Step 3: Idempotent default settings seed
import { seedDefaultSettings } from './seed'
await seedDefaultSettings()

// Steps 4-6: Create Elysia app bound to 127.0.0.1 (Pitfall 4: never 0.0.0.0)
import { healthRoutes } from './src/routes/health'
import { settingsRoutes } from './src/routes/settings'
import { fbOauthRoutes } from './src/routes/fbOauth'

// PORT is configurable via the documented PORT env var (.env.example), defaulting to 3000.
// WR-01: resolvePort() validates the value and fails fast on empty-string/NaN/out-of-range,
// rather than silently binding port 0 (random ephemeral) or NaN.
const PORT = resolvePort()

export const app = new Elysia({
  serve: {
    hostname: '127.0.0.1',
    port: PORT,
  },
})
  // CORS allowlist: localhost dashboard + chrome-extension origin
  // Pitfall 5: chrome-extension:// is a special origin — must use regex, not a plain string
  .use(
    cors({
      origin: [
        'http://localhost:3000',
        'http://localhost:5173',
        /^chrome-extension:\/\//,
      ],
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

// Listen only when run as the main entry point (bun run index.ts).
// When imported by tests, this block is skipped — no accidental port 3000 bind.
if (import.meta.main) {
  app.listen(PORT)
  console.log(
    `Listening on http://${app.server?.hostname}:${app.server?.port}`
  )
}
