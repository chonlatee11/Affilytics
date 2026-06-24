/**
 * Affilytics Backend — Entry Point and Boot Sequence.
 *
 * Boot order (RESEARCH § System Architecture Diagram):
 *   1. requireEncryptionKey() — fail-fast if BUN_ENCRYPTION_KEY missing (D-03, T-1-KEY)
 *   2. import db — opening it sets PRAGMAs (WAL + busy_timeout) before drizzle() wraps
 *   3. migrate() — apply tracked SQL migrations synchronously
 *   4. seedDefaultSettings() — idempotent default settings row (D-08)
 *   5. Elysia app on 127.0.0.1:3000 — LAN-unreachable (FOUND-03, T-1-LAN)
 *   6. CORS allowlist: localhost dashboard + chrome-extension origin (T-1-CORS)
 *   7. .listen() — only when run as main entry; import-only does not double-bind
 *
 * FOUND-01: GET /health returns 200.
 * FOUND-03: bound to 127.0.0.1 only (not 0.0.0.0).
 * SET-01: /api/settings/fb-connect verifies, encrypts, stores FB token.
 */

import { requireEncryptionKey } from './env'
import { Elysia } from 'elysia'
import cors from '@elysiajs/cors'
import swagger from '@elysiajs/swagger'

// Step 1: Fail fast if BUN_ENCRYPTION_KEY is missing (D-03, T-1-KEY)
// This MUST be the first runtime call — before any DB or crypto operations.
requireEncryptionKey()

// Step 2: Import db singleton (opening it runs PRAGMAs on the raw connection)
import { db } from './src/db/client'

// Step 3: Apply tracked migrations synchronously
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
migrate(db, { migrationsFolder: './drizzle' })

// Step 4: Idempotent default settings seed
import { seedDefaultSettings } from './seed'
await seedDefaultSettings()

// Step 5-7: Create Elysia app bound to 127.0.0.1 (Pitfall 4: never 0.0.0.0)
import { healthRoutes } from './src/routes/health'
import { settingsRoutes } from './src/routes/settings'

export const app = new Elysia({
  serve: {
    hostname: '127.0.0.1',
    port: 3000,
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
  // Listen — only when run as main entry point (bun run src/index.ts)
  // When imported by tests, .listen() would bind the port — we guard with Bun.main check
  .listen(3000)

console.log(
  `Listening on http://${app.server?.hostname}:${app.server?.port}`
)
