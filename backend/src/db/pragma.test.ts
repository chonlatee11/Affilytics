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
    // Note: SQLite's PRAGMA busy_timeout returns a column named 'timeout' (not 'busy_timeout')
    const result = raw.query('PRAGMA busy_timeout').get() as { timeout: number }
    expect(result.timeout).toBe(5000)
  })

  test('FOUND-02: journal_mode is wal (set before busy_timeout, persists in file header)', () => {
    const raw = rawSqlite(db)
    const result = raw.query('PRAGMA journal_mode').get() as { journal_mode: string }
    expect(result.journal_mode).toBe('wal')
  })

  test('CR-01: foreign_keys is ON (1) on the connection opened by openDatabase()', () => {
    const raw = rawSqlite(db)
    // foreign_keys is per-connection and defaults to OFF; it must be enabled in
    // openDatabase() so the declared FOREIGN KEY constraints are actually enforced.
    const result = raw.query('PRAGMA foreign_keys').get() as { foreign_keys: number }
    expect(result.foreign_keys).toBe(1)
  })

  test('CR-01: inserting a post_drafts row with a bogus product_id throws (FK enforced)', () => {
    const raw = rawSqlite(db)
    // post_drafts.product_id is NOT NULL REFERENCES products(id). With foreign_keys ON,
    // referencing a non-existent product must raise a constraint error rather than
    // silently writing a dangling reference.
    expect(() => {
      raw.run(
        `INSERT INTO post_drafts (id, product_id, caption_th, caption_en)
         VALUES ('draft-fk-test', 'nonexistent-product-id', 'th', 'en')`
      )
    }).toThrow()
  })
})
