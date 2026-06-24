/**
 * Apply tracked Drizzle SQL migrations to the database.
 *
 * D-07: Tracked generate+migrate pattern — NOT drizzle-kit push.
 * Generated SQL files are committed under backend/drizzle/ and applied synchronously
 * at boot (bun-sqlite migrate() is synchronous — no await needed or appropriate).
 *
 * Usage:
 *   Imported by src/index.ts at boot: migrate(db, { migrationsFolder: './drizzle' })
 *   Standalone:   bun run src/db/migrate.ts
 */

import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { db } from './client'

// Synchronous — bun-sqlite migrations do NOT return a Promise.
// D-07: apply tracked SQL migration files from backend/drizzle/
migrate(db, { migrationsFolder: './drizzle' })

console.log('Migrations applied successfully.')
