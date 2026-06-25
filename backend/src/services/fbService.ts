/**
 * Facebook Graph API service.
 *
 * D-02: Verify pasted FB token against the live Graph API before storing.
 * T-1-EXPOSE: Tokens are NEVER logged, and never placed in a request URL — they travel in the
 *             Authorization header so they cannot leak into proxy/access logs or the process list.
 * T-1-SECRET: FB_APP_SECRET is NEVER logged or returned.
 * T-1-FBVERIFY: Invalid or mismatched tokens return { ok: false } without persistence.
 *
 * Endpoints:
 * - GET  /v22.0/me?fields=id,name          (verifyToken — manual paste flow; token in header)
 * - POST /v22.0/oauth/access_token          (exchangeCodeForToken — OAuth flow, secret in body)
 * - GET  /v22.0/me/accounts                 (getPageAccessToken — OAuth flow; token in header)
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

// ─── Shared Graph fetch helper ────────────────────────────────────────────────

type GraphFetchResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string }

/**
 * graphFetchJson(url, init, ctx) — performs a single Graph API request and normalizes the two
 * failure shapes every caller must handle: (1) an HTTP-200 response whose body carries
 * `{ error: { message } }`, and (2) a thrown network/parse error. Centralizing this removes the
 * copy-pasted error-probe + try/catch that previously lived in all three Graph calls, so the
 * redaction discipline (never log tokens/secrets) lives in exactly one place.
 *
 * `ctx` is the calling function name, used only for the redacted log line — never a token.
 */
async function graphFetchJson(
  url: string,
  init: RequestInit | undefined,
  ctx: string,
): Promise<GraphFetchResult> {
  try {
    const response = await fetch(url, init)
    const data = await response.json() as Record<string, unknown>

    // FB Graph API returns HTTP 200 even for invalid tokens; the error is in the body.
    if (data.error && typeof data.error === 'object') {
      const fbError = data.error as { message?: string }
      return { ok: false, error: fbError.message ?? 'Facebook API error' }
    }

    return { ok: true, data }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // T-1-EXPOSE / T-1-SECRET: never include tokens, codes, or secrets in logs.
    console.error(`fbService.${ctx}: network/parse error: ${message}`)
    return { ok: false, error: `Network error: ${message}` }
  }
}

/**
 * verifyToken(token, expectedPageId) — verifies a Facebook Page access token.
 *
 * Calls GET /v22.0/me?fields=id,name with the token in the Authorization header.
 * Returns { ok: true, pageName, pageId } if the token is valid and the returned
 * page ID matches expectedPageId.
 * Returns { ok: false, error } on:
 *   - FB API error response (invalid/expired token)
 *   - Page ID mismatch (operator pasted a token for the wrong page)
 *   - Network failure
 *
 * T-1-EXPOSE: token is sent in the Authorization header (not the URL) and never logged.
 */
export async function verifyToken(
  token: string,
  expectedPageId: string,
): Promise<VerifyTokenResponse> {
  const url = 'https://graph.facebook.com/v22.0/me?fields=id,name'
  const result = await graphFetchJson(
    url,
    { headers: { Authorization: `Bearer ${token}` } },
    'verifyToken',
  )
  if (!result.ok) return { ok: false, error: result.error }
  const data = result.data

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
  const result = await graphFetchJson(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,  // T-1-SECRET: in body, not URL
        redirect_uri: redirectUri,
        code,                       // T-1-EXPOSE: code never logged
      }).toString(),
    },
    'exchangeCodeForToken',
  )
  if (!result.ok) return { ok: false, error: result.error }
  const data = result.data

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
}

/**
 * getPageAccessToken(userToken, expectedPageId?) — resolves the operator's Page access token
 * from /me/accounts.
 *
 * Calls GET https://graph.facebook.com/v22.0/me/accounts with the user token in the
 * Authorization header.
 *
 * Page selection (avoids silently connecting the WRONG page when the operator administers more
 * than one Page — the OAuth callback has no operator-facing page picker):
 *   - If expectedPageId is given, return the page whose id matches it; error if none matches.
 *   - If expectedPageId is omitted and exactly one page is returned, use it.
 *   - If expectedPageId is omitted and MULTIPLE pages are returned, refuse to guess and return
 *     an error listing the page names so the operator can set FB_PAGE_ID and retry.
 *
 * Returns { ok:true, pageId, pageName, pageToken } on success.
 * Returns { ok:false, error } on empty data, ambiguous selection, Graph error, or network
 * failure — never throws.
 *
 * T-1-EXPOSE: userToken and pageToken are NEVER logged; userToken travels in the header.
 */
export async function getPageAccessToken(
  userToken: string,
  expectedPageId?: string,
): Promise<GetPageTokenResult> {
  const url = 'https://graph.facebook.com/v22.0/me/accounts'
  const result = await graphFetchJson(
    url,
    { headers: { Authorization: `Bearer ${userToken}` } },
    'getPageAccessToken',
  )
  if (!result.ok) return { ok: false, error: result.error }
  const data = result.data

  // Validate data array
  if (!Array.isArray(data.data) || data.data.length === 0) {
    return {
      ok: false,
      error: 'No Facebook Pages found for this user token. Ensure the operator has a connected Page.',
    }
  }

  const allPages = data.data as Record<string, unknown>[]

  // Select the intended page rather than blindly taking the first one.
  let selected: Record<string, unknown>
  if (expectedPageId !== undefined) {
    const match = allPages.find((p) => p.id === expectedPageId)
    if (!match) {
      return {
        ok: false,
        error: `Configured FB_PAGE_ID "${expectedPageId}" is not among the Pages this account administers.`,
      }
    }
    selected = match
  } else if (allPages.length > 1) {
    // Ambiguous: refuse to guess which page to connect (avoids silently connecting the wrong one).
    const names = allPages
      .map((p) => (typeof p.name === 'string' ? p.name : '?'))
      .join(', ')
    return {
      ok: false,
      error:
        `This account administers multiple Pages (${names}). ` +
        `Set FB_PAGE_ID in backend/.env to the id of the Page to connect, then retry.`,
    }
  } else {
    selected = allPages[0]
  }

  if (
    typeof selected.id !== 'string' ||
    typeof selected.name !== 'string' ||
    typeof selected.access_token !== 'string'
  ) {
    return {
      ok: false,
      error: 'Unexpected page data format from Facebook me/accounts',
    }
  }

  // T-1-EXPOSE: page token never logged
  return {
    ok: true,
    pageId: selected.id,
    pageName: selected.name,
    pageToken: selected.access_token,
  }
}
