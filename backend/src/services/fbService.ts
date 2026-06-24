/**
 * Facebook Graph API service.
 *
 * D-02: Verify pasted FB token against the live Graph API before storing.
 * T-1-EXPOSE: Tokens are NEVER logged — redacted before any log output.
 * T-1-SECRET: FB_APP_SECRET is NEVER logged or returned.
 * T-1-FBVERIFY: Invalid or mismatched tokens return { ok: false } without persistence.
 *
 * Endpoints:
 * - GET /v22.0/me?fields=id,name&access_token=<token>  (verifyToken — manual paste flow)
 * - POST /v22.0/oauth/access_token  (exchangeCodeForToken — OAuth flow, body not URL)
 * - GET /v22.0/me/accounts  (getPageAccessToken — OAuth flow)
 */

import { requireFbOAuthConfig } from '../../env'

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

// ─── OAuth helpers result types ───────────────────────────────────────────────

export interface ExchangeCodeSuccess {
  ok: true
  userToken: string
}

export interface ExchangeCodeError {
  ok: false
  error: string
}

export type ExchangeCodeResult = ExchangeCodeSuccess | ExchangeCodeError

export interface GetPageTokenSuccess {
  ok: true
  pageId: string
  pageName: string
  pageToken: string
}

export interface GetPageTokenError {
  ok: false
  error: string
}

export type GetPageTokenResult = GetPageTokenSuccess | GetPageTokenError

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

/**
 * exchangeCodeForToken(code) — exchanges an OAuth authorization code for a user access token.
 *
 * Calls POST https://graph.facebook.com/v22.0/oauth/access_token with
 * application/x-www-form-urlencoded body containing client_id, client_secret,
 * redirect_uri, and code. Using POST keeps client_secret out of the URL so it
 * never appears in server-side access logs or in fetch error messages
 * (RFC 6749 §2.3.1). Facebook Graph API fully supports POST on this endpoint.
 *
 * Returns { ok:true, userToken } on success.
 * Returns { ok:false, error } on Graph error or missing access_token — never throws.
 *
 * T-1-SECRET: FB_APP_SECRET is in the POST body, NEVER in the URL, NEVER logged or returned.
 * T-1-EXPOSE: The authorization code and user token are NEVER logged.
 */
export async function exchangeCodeForToken(code: string): Promise<ExchangeCodeResult> {
  const { appId, appSecret, redirectUri } = requireFbOAuthConfig()

  // T-1-SECRET: client_secret goes into the POST body, NOT the URL query string.
  // RFC 6749 §2.3.1 forbids credentials in the request-URI.
  const url = 'https://graph.facebook.com/v22.0/oauth/access_token'

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,  // T-1-SECRET: in body, not URL
        redirect_uri: redirectUri,
        code,                       // T-1-EXPOSE: code never logged
      }).toString(),
    })
    const data = await response.json() as Record<string, unknown>

    // FB Graph API returns error in body (with HTTP 200 or 4xx)
    if (data.error && typeof data.error === 'object') {
      const fbError = data.error as { message?: string }
      return {
        ok: false,
        error: fbError.message ?? 'Facebook OAuth exchange error',
      }
    }

    if (typeof data.access_token !== 'string' || data.access_token.length === 0) {
      return {
        ok: false,
        error: 'Missing access_token in Graph API response',
      }
    }

    // T-1-EXPOSE: never log the token or code
    return {
      ok: true,
      userToken: data.access_token,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // T-1-SECRET + T-1-EXPOSE: do NOT include appSecret, code, or token in error messages
    console.error(`fbService.exchangeCodeForToken: network/parse error: ${message}`)
    return {
      ok: false,
      error: `Network error: ${message}`,
    }
  }
}

/**
 * getPageAccessToken(userToken) — resolves the operator's Page access token from /me/accounts.
 *
 * Calls GET https://graph.facebook.com/v22.0/me/accounts?access_token=<userToken>
 * Returns the first Page in the response (single-operator tool).
 *
 * Returns { ok:true, pageId, pageName, pageToken } on success.
 * Returns { ok:false, error } on empty data, Graph error, or network failure — never throws.
 *
 * T-1-EXPOSE: userToken and pageToken are NEVER logged.
 */
export async function getPageAccessToken(userToken: string): Promise<GetPageTokenResult> {
  // T-1-EXPOSE: user token encoded in URL params but never logged
  const params = new URLSearchParams({ access_token: userToken })
  const url = `https://graph.facebook.com/v22.0/me/accounts?${params.toString()}`

  try {
    const response = await fetch(url)
    const data = await response.json() as Record<string, unknown>

    // Graph API error in body
    if (data.error && typeof data.error === 'object') {
      const fbError = data.error as { message?: string }
      return {
        ok: false,
        error: fbError.message ?? 'Facebook me/accounts error',
      }
    }

    // Validate data array
    if (!Array.isArray(data.data) || data.data.length === 0) {
      return {
        ok: false,
        error: 'No Facebook Pages found for this user token. Ensure the operator has a connected Page.',
      }
    }

    const firstPage = data.data[0] as Record<string, unknown>

    if (
      typeof firstPage.id !== 'string' ||
      typeof firstPage.name !== 'string' ||
      typeof firstPage.access_token !== 'string'
    ) {
      return {
        ok: false,
        error: 'Unexpected page data format from Facebook me/accounts',
      }
    }

    // T-1-EXPOSE: page token never logged
    return {
      ok: true,
      pageId: firstPage.id,
      pageName: firstPage.name,
      pageToken: firstPage.access_token,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // T-1-EXPOSE: do NOT include userToken in error messages
    console.error(`fbService.getPageAccessToken: network/parse error: ${message}`)
    return {
      ok: false,
      error: `Network error: ${message}`,
    }
  }
}
