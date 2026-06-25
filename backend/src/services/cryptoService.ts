/**
 * AES-256-GCM field-level encryption for sensitive data (FB access tokens).
 * Storage format: base64(iv):base64(authTag):base64(ciphertext)
 *
 * D-04: decrypt() returns null instead of throwing — backend never crashes on key loss.
 * T-1-CRYPTO: GCM auth tag verified on decrypt; new 12-byte IV per encryption prevents replay.
 * T-1-DISCONNECT: Wrong key / tampered ciphertext → null, not exception.
 * Pitfall 6: decipher.final() throws on auth-tag failure; must wrap ENTIRE body in try/catch.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { requireEncryptionKey } from '../../env'

/**
 * encrypt(plaintext) — encrypts using AES-256-GCM with a fresh 12-byte random IV.
 * Key is loaded lazily via requireEncryptionKey() so importing this module without
 * BUN_ENCRYPTION_KEY set does not crash on import (only on first encrypt/decrypt call).
 *
 * @returns "base64(iv):base64(authTag):base64(ciphertext)"
 */
export function encrypt(plaintext: string): string {
  const key = requireEncryptionKey()
  const iv = randomBytes(12)  // 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':')
}

/**
 * decrypt(stored) — decrypts a stored AES-256-GCM triple.
 * Returns the plaintext string on success, or null on ANY error:
 * - wrong key, tampered ciphertext, malformed input, missing env var, etc.
 * NEVER throws — callers check for null to detect the "disconnected" state (D-04).
 */
export function decrypt(stored: string): string | null {
  try {
    const key = requireEncryptionKey()
    const parts = stored.split(':')
    if (parts.length !== 3) return null

    const [ivB64, tagB64, encB64] = parts
    const iv = Buffer.from(ivB64, 'base64')
    const tag = Buffer.from(tagB64, 'base64')
    const encrypted = Buffer.from(encB64, 'base64')

    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  } catch {
    // Wrong key, tampered data, malformed input, missing env var → disconnected state
    return null
  }
}
