/**
 * Facebook Graph API token verification service.
 *
 * D-02: Verify pasted FB token against the live Graph API before storing.
 * T-1-EXPOSE: Token is NEVER logged — redacted before any log output.
 * T-1-FBVERIFY: Invalid or mismatched tokens return { ok: false } without persistence.
 *
 * Endpoint: GET https://graph.facebook.com/v22.0/me?fields=id,name&access_token=<token>
 * - Returns { id, name } on success
 * - Returns { error: { message, type, code } } on failure (with HTTP 200)
 * - data_access_expires_at is NOT available via /me (only via long-lived token exchange in Phase 6)
 */

export interface VerifyTokenResult {
  ok: true
  pageName: string
  pageId: string
  dataAccessExpiresAt: undefined
}

export interface VerifyTokenError {
  ok: false
  error: string
}

export type VerifyTokenResponse = VerifyTokenResult | VerifyTokenError

/**
 * verifyToken(token, expectedPageId) — verifies a Facebook Page access token.
 *
 * Calls GET /v22.0/me?fields=id,name&access_token=<token>.
 * Returns { ok: true, pageName, pageId } if the token is valid and the returned
 * page ID matches expectedPageId.
 * Returns { ok: false, error } on:
 *   - FB API error response (invalid/expired token)
 *   - Page ID mismatch (operator pasted a token for the wrong page)
 *   - Network failure
 *
 * NEVER logs the raw token — only logs [REDACTED] as a placeholder.
 */
export async function verifyToken(
  token: string,
  expectedPageId: string,
): Promise<VerifyTokenResponse> {
  const url = `https://graph.facebook.com/v22.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`

  try {
    const response = await fetch(url)
    const data = await response.json() as Record<string, unknown>

    // FB Graph API returns HTTP 200 even for invalid tokens; error is in body
    if (data.error && typeof data.error === 'object') {
      const fbError = data.error as { message?: string }
      return {
        ok: false,
        error: fbError.message ?? 'Facebook API error',
      }
    }

    // Validate response shape
    if (typeof data.id !== 'string' || typeof data.name !== 'string') {
      return {
        ok: false,
        error: 'Unexpected response format from Facebook API',
      }
    }

    // Enforce page ID match (operator may paste a token for the wrong page)
    if (data.id !== expectedPageId) {
      return {
        ok: false,
        error: `Page ID mismatch: token belongs to page ${data.id}, expected ${expectedPageId}`,
      }
    }

    return {
      ok: true,
      pageName: data.name,
      pageId: data.id,
      dataAccessExpiresAt: undefined,  // /me endpoint does not provide expiry (Phase 6 OAuth does)
    }
  } catch (err) {
    // Network failure or JSON parse error
    const message = err instanceof Error ? err.message : String(err)
    // Do NOT include the token in logs — T-1-EXPOSE
    console.error(`fbService.verifyToken: network/parse error for token [REDACTED]: ${message}`)
    return {
      ok: false,
      error: `Network error: ${message}`,
    }
  }
}
