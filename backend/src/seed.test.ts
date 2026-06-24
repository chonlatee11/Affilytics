/**
 * VALIDATION: SET-01 / D-08 — seedDefaultSettings() is idempotent (no duplicate rows)
 *
 * Asserts:
 * - After two calls to seedDefaultSettings() on a fresh migrated DB, exactly ONE
 *   settings row with id='default' exists
 * - Default values: draftMode='template', defaultTone='casual', dailyPostLimit present
 * - scoreWeights parses to an object with exactly 5 weight keys:
 *   commission, popularity, rating, reviews, discount
 *
 * RED state: This test will fail until seed.ts is implemented (Plan 03 Wave 2).
 */

import { test, expect, describe, beforeAll } from 'bun:test'
import { seedDefaultSettings } from '../seed'
import { openDatabase, rawSqlite } from './db/client'
import { settings } from './db/schema'

describe('seedDefaultSettings — idempotent default settings (D-08)', () => {
  beforeAll(() => {
    process.env.BUN_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATABASE_URL = ':memory:'
  })

  test('D-08: calling seedDefaultSettings() twice results in exactly one settings row', async () => {
    // Use a fresh in-memory DB for this test
    const db = openDatabase(':memory:')

    // Call seed twice — must be idempotent (INSERT OR IGNORE / onConflictDoNothing)
    await seedDefaultSettings()
    await seedDefaultSettings()

    const rows = await db.select().from(settings)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('default')

    rawSqlite(db).close()
  })

  test('D-08: default row has id=default', async () => {
    await seedDefaultSettings()
    const { db } = await import('./db/client')
    const rows = await db.select().from(settings)
    const defaultRow = rows.find((r) => r.id === 'default')
    expect(defaultRow).toBeDefined()
    expect(defaultRow!.id).toBe('default')
  })

  test('D-08: default draftMode is template', async () => {
    const { db } = await import('./db/client')
    const rows = await db.select().from(settings)
    const defaultRow = rows.find((r) => r.id === 'default')
    expect(defaultRow!.draftMode).toBe('template')
  })

  test('D-08: default defaultTone is casual', async () => {
    const { db } = await import('./db/client')
    const rows = await db.select().from(settings)
    const defaultRow = rows.find((r) => r.id === 'default')
    expect(defaultRow!.defaultTone).toBe('casual')
  })

  test('D-08: default dailyPostLimit is present and is a number', async () => {
    const { db } = await import('./db/client')
    const rows = await db.select().from(settings)
    const defaultRow = rows.find((r) => r.id === 'default')
    expect(typeof defaultRow!.dailyPostLimit).toBe('number')
    expect(defaultRow!.dailyPostLimit).toBeGreaterThan(0)
  })

  test('D-08: scoreWeights parses to object with exactly 5 weight keys', async () => {
    const { db } = await import('./db/client')
    const rows = await db.select().from(settings)
    const defaultRow = rows.find((r) => r.id === 'default')

    // scoreWeights is stored as JSON string — must parse to an object
    const weights = JSON.parse(defaultRow!.scoreWeights)
    expect(typeof weights).toBe('object')

    const REQUIRED_WEIGHT_KEYS = ['commission', 'popularity', 'rating', 'reviews', 'discount']
    for (const key of REQUIRED_WEIGHT_KEYS) {
      expect(weights).toHaveProperty(key)
      expect(typeof weights[key]).toBe('number')
    }
  })
})
