/**
 * Environment variable validation and fail-fast startup.
 * D-03: Backend fails fast at startup if BUN_ENCRYPTION_KEY is missing.
 * T-1-KEY: Encryption key never auto-generated silently inside the running backend.
 */

/**
 * requireEncryptionKey() — reads BUN_ENCRYPTION_KEY from environment.
 * Validates it is a 64-character hex string (32 bytes).
 * Throws an Error if missing, empty, or malformed.
 * Returns a 32-byte Buffer for use with AES-256-GCM.
 */
export function requireEncryptionKey(): Buffer {
  const hex = process.env.BUN_ENCRYPTION_KEY

  if (!hex || hex.length === 0) {
    throw new Error(
      'BUN_ENCRYPTION_KEY missing — run `bun run setup` to generate a key and add it to .env',
    )
  }

  if (hex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      `BUN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Got length=${hex.length}`,
    )
  }

  const key = Buffer.from(hex, 'hex')
  if (key.length !== 32) {
    throw new Error(
      `BUN_ENCRYPTION_KEY decoded to ${key.length} bytes, expected 32 bytes`,
    )
  }

  return key
}
