/**
 * SQLite database client with PRAGMA setup (WAL + busy_timeout).
 *
 * CRITICAL ORDERING (Pitfall 2):
 *   new Database(path) → exec PRAGMA journal_mode=WAL → exec PRAGMA busy_timeout=5000
 *   → drizzle(sqlite, { schema }) → migrate(db, ...)
 *
 * busy_timeout is per-connection and resets to 0 on every new Database().
 * journal_mode=WAL persists in the file header once set.
 *
 * FOUND-02: WAL mode + busy_timeout=5000 on every connection.
 * D-09: SQLite only.
 */

import { Database } from 'bun:sqlite'
import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { mkdirSync, unlinkSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

// Absolute path to the committed migrations folder (backend/drizzle), derived from this
// module's location (backend/src/db) so migrate() never depends on process.cwd(). Launching
// the server from any directory other than backend/ previously made migrate() fail to find
// drizzle/meta/_journal.json and crash at boot.
const MIGRATIONS_FOLDER = join(import.meta.dir, '..', '..', 'drizzle')

export type AppDatabase = BunSQLiteDatabase<typeof schema>

// Internal WeakMap to store the raw bun:sqlite handle for each Drizzle instance.
// This allows tests (and migrate.ts) to probe PRAGMA values and sqlite_master
// without exposing raw Database handles in the public API as a non-function.
const rawHandles = new WeakMap<AppDatabase, Database>()

/**
 * openDatabase(path?) — opens the SQLite database, sets WAL + busy_timeout PRAGMAs
 * on the raw connection BEFORE wrapping with Drizzle, then runs migrations.
 *
 * Pass ':memory:' for in-process tests. A unique temp file under the OS temp dir
 * is used instead of ':memory:' or 'file::memory:?cache=shared' — this preserves
 * WAL support (WAL requires a real file) while keeping the file OUT of the repo tree.
 * The temp file is cleaned up best-effort when the database handle is closed.
 *
 * Defaults to process.env.DATABASE_URL ?? 'data/affilytics.db'
 */
export function openDatabase(path?: string): AppDatabase {
  const dbPath = path ?? process.env.DATABASE_URL ?? 'data/affilytics.db'

  // WAL mode is not supported on standard ':memory:' databases (SQLite stores WAL on disk).
  // Use a unique per-process temp file under the OS temp dir instead of the
  // 'file::memory:?cache=shared' literal that wrote untracked files into the repo tree (CR-01).
  const isMemory = dbPath === ':memory:'
  let resolvedPath: string
  if (isMemory) {
    resolvedPath = `${tmpdir()}/affilytics-test-${randomUUID()}.db`
  } else {
    resolvedPath = dbPath
    // Ensure parent directory exists for file-based databases
    mkdirSync(dirname(resolvedPath), { recursive: true })
  }

  const sqlite = new Database(resolvedPath)

  // PRAGMAs MUST be set on the raw Database object BEFORE drizzle() wraps it.
  // (Pitfall 2: migrate() must run in WAL mode; Pitfall 1: busy_timeout is per-connection)
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA busy_timeout = 5000')
  // foreign_keys is OFF by default and per-connection (like busy_timeout) — it must be
  // set on every new Database(). Without it the FOREIGN KEY clauses in the migration are
  // declared but silently inert, allowing orphaned/dangling references (CR-01).
  sqlite.exec('PRAGMA foreign_keys = ON')

  const db = drizzle(sqlite, { schema }) as AppDatabase

  // Store the raw handle for rawSqlite() lookups
  rawHandles.set(db, sqlite)

  // For temp-file in-memory DBs, wrap close() to clean up the temp file and its WAL/SHM siblings.
  if (isMemory) {
    const originalClose = sqlite.close.bind(sqlite)
    sqlite.close = (throwOnError?: boolean) => {
      originalClose(throwOnError)
      // Best-effort cleanup of the temp file and WAL/SHM siblings; ignore unlink errors.
      for (const suffix of ['', '-wal', '-shm']) {
        try { unlinkSync(resolvedPath + suffix) } catch { /* ignore */ }
      }
    }
  }

  // Apply tracked SQL migrations synchronously (bun-sqlite migrator is NOT async).
  // D-07: generate+migrate, never drizzle-kit push.
  //
  // Detect migration availability STRUCTURALLY (is the journal file present?) instead of
  // calling migrate() and string-matching the thrown error to decide whether it was a real
  // failure. String-matching (WR-02) silently swallowed any error whose message happened to
  // contain "no such file"/"ENOENT", and a Drizzle/Bun version that reworded its "missing
  // migrations" error would re-break the test path with no signal. With the journal check,
  // migrate() errors always propagate loudly.
  const journalPath = join(MIGRATIONS_FOLDER, 'meta', '_journal.json')
  if (existsSync(journalPath)) {
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })  // any failure here is loud
  } else if (!isMemory) {
    // A real file-based boot with no generated migrations is a genuine error — never boot
    // into a tableless, broken state.
    throw new Error(
      `Migrations journal not found at ${journalPath}. ` +
      `Run \`bunx drizzle-kit generate\` to create migrations before starting the server.`,
    )
  }
  // else: in-memory/test DB imported before migrations were generated — nothing to apply yet.

  return db
}

/**
 * rawSqlite(db) — returns the underlying bun:sqlite Database handle for a given
 * Drizzle instance created by openDatabase(). Used by tests to probe PRAGMA values
 * and sqlite_master directly.
 *
 * Note: Tests call rawSqlite(db) as a function, passing the db returned by openDatabase().
 */
export function rawSqlite(db: AppDatabase): Database {
  const raw = rawHandles.get(db)
  if (!raw) {
    throw new Error('rawSqlite: no raw handle found — db was not created by openDatabase()')
  }
  return raw
}

/**
 * Shared db singleton for use in routes, services, and seed.ts.
 * Only created once; lazy-evaluated at module load.
 */
export const db = openDatabase()
