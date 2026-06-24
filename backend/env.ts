/**
 * Environment variable validation and fail-fast startup.
 * D-03: Backend fails fast at startup if BUN_ENCRYPTION_KEY is missing.
 * T-1-KEY: Encryption key never auto-generated silently inside the running backend.
 * T-1-SECRET: FB_APP_SECRET is read ONLY inside requireFbOAuthConfig(); never logged or returned.
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

/**
 * FB OAuth configuration for the Page-connect flow (Dev Mode).
 *
 * Returns { appId, appSecret, redirectUri } when all three vars are set.
 * Throws a clear Error naming the missing variable(s) when any is absent.
 *
 * T-1-SECRET: appSecret value is NEVER included in any thrown message or log.
 * Call this ONLY inside route/service handlers — never at module import time —
 * so that missing FB_* vars fail at invocation (not at server startup or test import).
 *
 * See .env.example for documentation on how to set these values.
 */
export function requireFbOAuthConfig(): { appId: string; appSecret: string; redirectUri: string } {
  const missing: string[] = []

  const appId = process.env.FB_APP_ID
  if (!appId || appId.length === 0) missing.push('FB_APP_ID')

  // We read FB_APP_SECRET but NEVER include its value in error messages (T-1-SECRET)
  const appSecret = process.env.FB_APP_SECRET
  if (!appSecret || appSecret.length === 0) missing.push('FB_APP_SECRET')

  const redirectUri = process.env.FB_OAUTH_REDIRECT_URI
  if (!redirectUri || redirectUri.length === 0) missing.push('FB_OAUTH_REDIRECT_URI')

  if (missing.length > 0) {
    throw new Error(
      `Facebook OAuth configuration missing — the following environment variable(s) are required: ` +
      `${missing.join(', ')}. ` +
      `Add them to backend/.env (never commit this file). ` +
      `See backend/.env.example for documentation.`,
    )
  }

  return {
    appId: appId!,
    appSecret: appSecret!,  // Never log or return this value (T-1-SECRET)
    redirectUri: redirectUri!,
  }
}
