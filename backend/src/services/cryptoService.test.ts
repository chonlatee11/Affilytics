/**
 * VALIDATION: SET-01 — AES-256-GCM encrypt/decrypt round-trip
 * Threat: T-1-CRYPTO (auth-tag integrity), T-1-DISCONNECT (wrong key returns null)
 *
 * Storage format: base64(iv):base64(authTag):base64(ciphertext) — colon-joined triple.
 *
 * RED state: This test will fail until cryptoService.ts is implemented (Plan 02 Wave 1).
 */

import { test, expect, describe, beforeEach } from 'bun:test'
import { encrypt, decrypt } from '../services/cryptoService'

// Fixed 64-char hex test key (32 bytes) — only used in test environment
const TEST_KEY = 'a'.repeat(64)  // 32 bytes of 0xAA — deterministic for tests
const ALT_KEY  = 'b'.repeat(64)  // Different 32-byte key for wrong-key test

describe('cryptoService — AES-256-GCM field encryption', () => {
  beforeEach(() => {
    // Set the encryption key env var for each test
    // cryptoService reads from BUN_ENCRYPTION_KEY at call time (not at module import time)
    process.env.BUN_ENCRYPTION_KEY = TEST_KEY
  })

  test('SET-01 (T-1-CRYPTO): encrypt→decrypt round-trip returns original plaintext', () => {
    const plaintext = 'EAABsbCS1iHgBOtest_fb_page_token_12345'
    const stored = encrypt(plaintext)
    const recovered = decrypt(stored)
    expect(recovered).toBe(plaintext)
  })

  test('SET-01 (T-1-CRYPTO): stored ciphertext does NOT contain the plaintext substring', () => {
    const plaintext = 'sensitive_access_token_value'
    const stored = encrypt(plaintext)
    // The stored string must never contain the raw plaintext
    expect(stored).not.toContain(plaintext)
  })

  test('SET-01 (T-1-CRYPTO): stored format is colon-joined triple (iv:authTag:ciphertext)', () => {
    const stored = encrypt('test_value')
    const parts = stored.split(':')
    // Must have exactly 3 parts: base64(iv), base64(authTag), base64(ciphertext)
    expect(parts).toHaveLength(3)
    // Each part must be non-empty base64
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0)
    }
  })

  test('SET-01 (T-1-DISCONNECT): decrypt() with wrong key returns null, does NOT throw', () => {
    // Encrypt with TEST_KEY
    const plaintext = 'token_encrypted_with_key_a'
    const stored = encrypt(plaintext)

    // Switch to a different key — simulates key rotation or key loss
    process.env.BUN_ENCRYPTION_KEY = ALT_KEY

    // Must return null (not throw) — enables disconnected-state detection (D-04)
    let result: string | null = undefined as any
    let threw = false
    try {
      result = decrypt(stored)
    } catch {
      threw = true
    }

    expect(threw).toBe(false)   // Must NOT throw (Pitfall 6)
    expect(result).toBeNull()   // Must return null on wrong-key failure
  })

  test('SET-01: decrypt() of garbage/malformed input returns null, does NOT throw', () => {
    // Malformed stored value (not a valid iv:tag:ciphertext triple)
    let result: string | null = undefined as any
    let threw = false
    try {
      result = decrypt('not-a-valid-stored-value')
    } catch {
      threw = true
    }

    expect(threw).toBe(false)
    expect(result).toBeNull()
  })
})
