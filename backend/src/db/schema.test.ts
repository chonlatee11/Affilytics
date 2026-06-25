/**
 * VALIDATION: FOUND-02 — SQLite opens in WAL mode; all 7 tables exist after migrate
 * Threat: T-1-LAN context (WAL mode prevents file-level contention when multiple
 * connections are used during local development)
 *
 * RED state: This test file exists before client.ts and schema.ts are implemented.
 * It will fail with import errors until Plan 02 (Wave 1) lands.
 */

import { test, expect, describe, afterAll } from 'bun:test'
import { openDatabase, rawSqlite } from '../db/client'

describe('Schema — WAL mode + all 7 tables exist after migrate', () => {
  // Use in-memory DB for tests (openDatabase(':memory:') or a temp path)
  const db = openDatabase(':memory:')

  afterAll(() => {
    // Clean up the raw sqlite handle
    rawSqlite(db).close()
  })

  test('FOUND-02: journal_mode is WAL', () => {
    const raw = rawSqlite(db)
    const result = raw.query('PRAGMA journal_mode').get() as { journal_mode: string }
    // WAL mode: once set on any connection, persists in the file header
    expect(result.journal_mode).toBe('wal')
  })

  test('FOUND-02: all 7 required tables exist in sqlite_master', () => {
    const raw = rawSqlite(db)
    // Query sqlite_master for all user-created tables
    const rows = raw
      .query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[]

    const tableNames = rows.map((r) => r.name)

    const REQUIRED_TABLES = [
      'products',
      'product_extras',
      'post_drafts',
      'published_posts',
      'result_entries',
      'pages',
      'settings',
    ]

    for (const table of REQUIRED_TABLES) {
      expect(tableNames).toContain(table)
    }

    // No extra system tables (sqlite_sequence etc.) should cause the test to fail —
    // we only assert the 7 required tables are present
    expect(tableNames.length).toBeGreaterThanOrEqual(REQUIRED_TABLES.length)
  })
})
