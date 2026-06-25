/**
 * Standalone migration runner for the `migrate:run` script.
 *
 * D-07: Tracked generate+migrate pattern — NOT drizzle-kit push.
 * Generated SQL files are committed under backend/drizzle/.
 *
 * Migrations are applied as a side effect of importing `./client` (openDatabase()
 * runs migrate() at module load). This file therefore only needs to import the db
 * singleton — it does NOT call migrate() again, which would be redundant double work.
 *
 * Note: src/index.ts does NOT import this file; it relies on the single migrate path
 * inside client.ts (no double-migrate, WR-01/WR-03 resolved).
 *
 * Usage:
 *   Standalone: bun run src/db/migrate.ts   (or the `migrate:run` package script)
 */

// Importing client runs openDatabase() → migrate(db, { migrationsFolder: './drizzle' }).
import { db } from './client'

// Touch the singleton so the import is not tree-shaken / flagged unused.
void db

console.log('Migrations applied successfully.')
