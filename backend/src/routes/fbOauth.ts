/**
 * Facebook OAuth Page-connect routes (Dev Mode).
 *
 * Gap 4 (SET-01 / ROADMAP SC-3): Operator connects a Facebook Page via OAuth.
 *
 * Two endpoints under /api/settings/fb-oauth:
 *   GET /authorize — builds Facebook authorize URL with CSRF state, 302-redirects to Facebook.
 *   GET /callback  — validates CSRF state, exchanges code for user token, resolves Page token,
 *                    encrypts and stores it; never leaks the token in any response.
 *
 * Security invariants:
 *   T-1-CSRF:     CSRF `state` issued at /authorize, validated + single-use consumed at /callback.
 *   T-1-SECRET:   FB_APP_SECRET sourced from env only; never logged or returned.
 *   T-1-EXPOSE:   Page token / user token never returned or logged.
 *   T-1-OPENREDIR: redirect_uri comes only from FB_OAUTH_REDIRECT_URI (server-side); never from a
 *                  request parameter — no open-redirect possible.
 *   T-1-REPLAY:   State deleted on first use; replayed state fails validation.
 *
 * The manual POST /api/settings/fb-connect paste endpoint (settings.ts) is KEPT as a fallback.
 */

import { Elysia } from 'elysia'
import { randomBytes } from 'node:crypto'
import { requireFbOAuthConfig } from '../../env'
import { exchangeCodeForToken, getPageAccessToken } from '../services/fbService'
import { encrypt } from '../services/cryptoService'
import { db } from '../db/client'
import { pages } from '../db/schema'

/**
 * In-process store of pending CSRF states → issued-at timestamp (ms).
 * Single-operator tool — no DB column needed.
 * NOTE: This store is wiped on server restart. If /callback is called after a restart
 * (mid-flow), the state mismatch returns 400 and the operator simply re-opens /authorize.
 *
 * WR-04: A TTL bounds memory growth and limits the replay window. Abandoned flows
 * (operator closes the tab, FB denies) previously left states in the Set forever.
 * States older than STATE_TTL_MS are rejected at /callback and evicted; stale entries
 * are also swept on each /authorize.
 */
const pendingStates = new Map<string, number>()  // state -> issuedAt ms
const STATE_TTL_MS = 10 * 60 * 1000  // 10 minutes

/** Evict any states that have outlived STATE_TTL_MS. */
function sweepExpiredStates(now: number): void {
  for (const [state, issuedAt] of pendingStates) {
    if (now - issuedAt > STATE_TTL_MS) {
      pendingStates.delete(state)
    }
  }
}

/**
 * Page-connect scopes for Dev Mode (no App Review required when operator is app admin):
 * - pages_show_list: enumerate pages the user administers
 * - pages_read_engagement: read page engagement metrics
 * - business_management: required for some page management operations
 */
const FB_SCOPES = 'pages_show_list,pages_read_engagement,business_management'

export const fbOauthRoutes = new Elysia({ prefix: '/api/settings/fb-oauth' })

  // ---------------------------------------------------------------------------
  // GET /api/settings/fb-oauth/authorize
  //
  // Builds the Facebook OAuth authorize URL and 302-redirects the operator.
  // Generates a CSRF state (randomBytes(16) hex) and stores it in pendingStates.
  //
  // T-1-OPENREDIR: redirect_uri is read ONLY from FB_OAUTH_REDIRECT_URI server-side.
  // T-1-SECRET:    FB_APP_SECRET is NOT read here (only appId + redirectUri needed).
  // ---------------------------------------------------------------------------
  .get('/authorize', ({ set }) => {
    const { appId, redirectUri } = requireFbOAuthConfig()

    // Generate a CSRF state token, recording its issue time for TTL enforcement (WR-04).
    const now = Date.now()
    sweepExpiredStates(now)  // bound memory: drop abandoned-flow states
    const state = randomBytes(16).toString('hex')
    pendingStates.set(state, now)

    // Build the Facebook authorize URL
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,  // T-1-OPENREDIR: server-side only, never from request
      state,
      scope: FB_SCOPES,
      response_type: 'code',
    })

    const authorizeUrl = `https://www.facebook.com/v22.0/dialog/oauth?${params.toString()}`

    // 302 redirect to Facebook login
    set.status = 302
    set.headers['location'] = authorizeUrl
    return null
  })

  // ---------------------------------------------------------------------------
  // GET /api/settings/fb-oauth/callback?code=<code>&state=<state>
  //
  // 1. Validate CSRF state (T-1-CSRF, T-1-REPLAY)
  // 2. Exchange code for user access token (T-1-SECRET: appSecret never logged)
  // 3. Resolve Page access token from me/accounts
  // 4. Encrypt (AES-256-GCM) and upsert pages row (T-1-EXPOSE: token never returned)
  // 5. Return { ok: true, pageName } — no token in response
  //
  // T-1-OPENREDIR: redirect_uri in token exchange is read from server-side env only.
  // ---------------------------------------------------------------------------
  .get('/callback', async ({ query, set }) => {
    const code = query.code as string | undefined
    const state = query.state as string | undefined

    // --- Step 1: Validate CSRF state (T-1-CSRF, T-1-REPLAY, WR-04 TTL) ---
    const issuedAt = state ? pendingStates.get(state) : undefined
    // Consume the state immediately (if present) to prevent replay (T-1-REPLAY).
    if (state) pendingStates.delete(state)

    // Reject unknown OR expired states. An expired state (older than STATE_TTL_MS)
    // is treated the same as a mismatch — operator simply re-opens /authorize.
    if (issuedAt === undefined || Date.now() - issuedAt > STATE_TTL_MS) {
      set.status = 400
      return { error: 'state_mismatch' }
    }

    if (!code) {
      set.status = 400
      return { error: 'missing_code' }
    }

    // --- Step 2: Exchange code for user access token (T-1-SECRET: appSecret used inside, not logged) ---
    const exchangeResult = await exchangeCodeForToken(code)
    if (!exchangeResult.ok) {
      set.status = 422
      return { error: 'oauth_exchange_failed' }
    }

    const { userToken } = exchangeResult  // T-1-EXPOSE: never log or return this

    // --- Step 3: Resolve Page access token ---
    const pageResult = await getPageAccessToken(userToken)
    if (!pageResult.ok) {
      set.status = 422
      return { error: 'page_token_failed' }
    }

    const { pageId, pageName, pageToken } = pageResult  // T-1-EXPOSE: pageToken never returned

    // --- Step 4: Encrypt and store (T-1-EXPOSE: pageToken encrypted before persistence) ---
    const accessTokenEnc = encrypt(pageToken)  // AES-256-GCM

    // WR-06 / TODO(Phase 5 FB Publishing): the OAuth flow already obtains a real page/user
    // token whose `data_access_expires_at` is retrievable via Graph (debug_token /
    // fields=data_access_expires_at). It is currently discarded, so the dashboard cannot
    // warn before the token silently expires (CLAUDE.md Known Constraint #3). Persist the
    // real expiry here once getPageAccessToken surfaces it.
    await db
      .insert(pages)
      .values({
        fbPageId: pageId,
        pageName,
        accessTokenEnc,
        dataAccessExpiresAt: null,  // TODO(Phase 5): persist real expiry from debug_token (WR-06)
      })
      .onConflictDoUpdate({
        target: pages.fbPageId,
        set: {
          pageName,
          accessTokenEnc,
          dataAccessExpiresAt: null,  // TODO(Phase 5): see above (WR-06)
        },
      })

    // --- Step 5: Return confirmation WITHOUT the token (T-1-EXPOSE) ---
    return {
      ok: true,
      pageName,  // Safe to return — not a secret
      // pageToken is intentionally NOT returned here
    }
  })
