/**
 * VALIDATION: D-03 — Backend fails fast at startup if BUN_ENCRYPTION_KEY is missing
 * Threat: T-1-KEY (encryption key never auto-generated silently inside running backend)
 *
 * Test approach: call requireEncryptionKey() directly in a try/catch asserting it throws
 * when BUN_ENCRYPTION_KEY is unset. This is the unit form (preferred over child-process spawn).
 *
 * RED state: This test will fail until env.ts is implemented (Plan 02 Wave 1).
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { requireEncryptionKey } from '../env'

describe('env — fail-fast when BUN_ENCRYPTION_KEY is missing', () => {
  let savedKey: string | undefined

  beforeEach(() => {
    // Save and delete the encryption key for each test
    savedKey = process.env.BUN_ENCRYPTION_KEY
    delete process.env.BUN_ENCRYPTION_KEY
  })

  afterEach(() => {
    // Restore the key after each test
    if (savedKey !== undefined) {
      process.env.BUN_ENCRYPTION_KEY = savedKey
    } else {
      delete process.env.BUN_ENCRYPTION_KEY
    }
  })

  test('D-03 (T-1-KEY): requireEncryptionKey() throws when BUN_ENCRYPTION_KEY is not set', () => {
    // Backend must fail fast at startup — never silently generate a key inside the running server
    expect(() => requireEncryptionKey()).toThrow()
  })

  test('D-03 (T-1-KEY): requireEncryptionKey() throws when BUN_ENCRYPTION_KEY is empty string', () => {
    process.env.BUN_ENCRYPTION_KEY = ''
    expect(() => requireEncryptionKey()).toThrow()
  })

  test('D-03: requireEncryptionKey() returns a Buffer when key is valid 64-char hex', () => {
    process.env.BUN_ENCRYPTION_KEY = 'a'.repeat(64)
    const key = requireEncryptionKey()
    // Should return a 32-byte Buffer
    expect(key).toBeInstanceOf(Buffer)
    expect(key.length).toBe(32)
  })
})
