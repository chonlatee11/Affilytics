/**
 * VALIDATION: FOUND-02 — PRAGMA busy_timeout = 5000 is active on the connection
 *
 * CRITICAL NOTE (Pitfall 1): busy_timeout is a PER-CONNECTION setting in SQLite.
 * It resets to 0 on every new Database() instantiation — unlike journal_mode=WAL
 * which is persistent in the file header once set. This means busy_timeout MUST
 * be set on every new connection opened, not just once at app startup.
 *
 * RED state: This test will fail until client.ts is implemented (Plan 02 Wave 1).
 */

import { test, expect, describe, afterAll } from 'bun:test'
import { openDatabase, rawSqlite } from '../db/client'

describe('PRAGMAs — per-connection settings on the live connection', () => {
  const db = openDatabase(':memory:')

  afterAll(() => {
    rawSqlite(db).close()
  })

  test('FOUND-02: busy_timeout is 5000 on the connection opened by openDatabase()', () => {
    const raw = rawSqlite(db)
    // busy_timeout is per-connection and must be set in openDatabase() immediately
    // after new Database(). A value of 0 means SQLite fails immediately on lock contention.
    const result = raw.query('PRAGMA busy_timeout').get() as { busy_timeout: number }
    expect(result.busy_timeout).toBe(5000)
  })

  test('FOUND-02: journal_mode is wal (set before busy_timeout, persists in file header)', () => {
    const raw = rawSqlite(db)
    const result = raw.query('PRAGMA journal_mode').get() as { journal_mode: string }
    expect(result.journal_mode).toBe('wal')
  })
})
