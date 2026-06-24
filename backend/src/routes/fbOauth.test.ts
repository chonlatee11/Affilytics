/**
 * Tests for FB OAuth routes: GET /api/settings/fb-oauth/authorize + /callback
 * (RED phase — will fail until fbOauth.ts is created)
 *
 * This test file mounts ONLY fbOauthRoutes on a local Elysia instance.
 * It does NOT import from index.ts to avoid accidental port 3000 binding.
 *
 * T-1-CSRF: CSRF state validated at callback; mismatch → 4xx, nothing stored
 * T-1-SECRET: FB_APP_SECRET never in any response body
 * T-1-EXPOSE: page token never returned in plaintext
 * T-1-OPENREDIR: redirect_uri comes only from server-side FB_OAUTH_REDIRECT_URI
 *
 * All Graph API calls are mocked — no live Facebook network required.
 */

import { test, expect, describe, beforeAll, afterEach } from 'bun:test'
import { mock } from 'bun:test'
import { Elysia } from 'elysia'

// Env setup must happen BEFORE importing fbOauthRoutes (which imports env.ts)
const FB_APP_ID = 'test-app-id-12345'
const FB_APP_SECRET = 'test-app-secret-must-never-appear-in-responses'
const FB_REDIRECT_URI = 'http://localhost:3000/api/settings/fb-oauth/callback'
const BUN_KEY = 'a'.repeat(64)

process.env.BUN_ENCRYPTION_KEY = BUN_KEY
process.env.FB_APP_ID = FB_APP_ID
process.env.FB_APP_SECRET = FB_APP_SECRET
process.env.FB_OAUTH_REDIRECT_URI = FB_REDIRECT_URI
process.env.DATABASE_URL = ':memory:'

// Import route module AFTER env is set
import { fbOauthRoutes } from '../routes/fbOauth'
import { db } from '../db/client'
import { pages } from '../db/schema'
import { decrypt } from '../services/cryptoService'

const MOCK_CODE = 'mock-auth-code-from-facebook'
const MOCK_USER_TOKEN = 'mock-user-access-token-xyz'
const MOCK_PAGE_TOKEN = 'mock-page-access-token-abc123'
const MOCK_PAGE_ID = 'page-id-456'
const MOCK_PAGE_NAME = 'My Affiliate Page'

// Build a local Elysia that mounts ONLY fbOauthRoutes (no port bind)
const testApp = new Elysia().use(fbOauthRoutes)

// Mock factory: different Graph endpoints return different responses
function mockGraphOAuth(overrides?: {
  accessToken?: { error?: object; body?: object }
  accounts?: { error?: object; data?: object[] }
}) {
  const originalFetch = globalThis.fetch

  globalThis.fetch = mock(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input instanceof URL ? input.href : input)

    if (url.includes('oauth/access_token')) {
      if (overrides?.accessToken?.error) {
        return new Response(JSON.stringify({ error: overrides.accessToken.error }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const body = overrides?.accessToken?.body ?? {
        access_token: MOCK_USER_TOKEN,
        token_type: 'bearer',
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (url.includes('me/accounts')) {
      if (overrides?.accounts?.error) {
        return new Response(JSON.stringify({ error: overrides.accounts.error }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const data = overrides?.accounts?.data ?? [
        { id: MOCK_PAGE_ID, name: MOCK_PAGE_NAME, access_token: MOCK_PAGE_TOKEN },
      ]
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return originalFetch(input, _init)
  }) as typeof globalThis.fetch
}

describe('fbOauth routes — GET /api/settings/fb-oauth/authorize', () => {
  afterEach(() => {
    mock.restore()
  })

  test('returns 302 redirect to Facebook authorize URL', async () => {
    const response = await testApp.handle(
      new Request('http://localhost/api/settings/fb-oauth/authorize')
    )
    expect(response.status).toBe(302)
  })

  test('Location header contains FB_APP_ID as client_id', async () => {
    const response = await testApp.handle(
      new Request('http://localhost/api/settings/fb-oauth/authorize')
    )
    const location = response.headers.get('location') ?? ''
    expect(location).toContain(`client_id=${FB_APP_ID}`)
  })

  test('Location header contains the server-side redirect_uri (T-1-OPENREDIR)', async () => {
    const response = await testApp.handle(
      new Request('http://localhost/api/settings/fb-oauth/authorize')
    )
    const location = response.headers.get('location') ?? ''
    expect(location).toContain(encodeURIComponent(FB_REDIRECT_URI))
  })

  test('Location header contains a non-empty state param (CSRF)', async () => {
    const response = await testApp.handle(
      new Request('http://localhost/api/settings/fb-oauth/authorize')
    )
    const location = response.headers.get('location') ?? ''
    const url = new URL(location)
    const state = url.searchParams.get('state')
    expect(state).toBeTruthy()
    expect(state!.length).toBeGreaterThan(0)
  })

  test('Location header contains page-connect scopes', async () => {
    const response = await testApp.handle(
      new Request('http://localhost/api/settings/fb-oauth/authorize')
    )
    const location = response.headers.get('location') ?? ''
    // scopes may be URL-encoded
    expect(location).toContain('pages_show_list')
  })

  test('T-1-SECRET: FB_APP_SECRET does not appear in Location header', async () => {
    const response = await testApp.handle(
      new Request('http://localhost/api/settings/fb-oauth/authorize')
    )
    const location = response.headers.get('location') ?? ''
    expect(location).not.toContain(FB_APP_SECRET)
  })
})

describe('fbOauth routes — GET /api/settings/fb-oauth/callback (happy path)', () => {
  afterEach(async () => {
    mock.restore()
    // Clean up pages table between tests
    await db.delete(pages)
  })

  test('happy path: validates state, stores encrypted token, returns { ok:true, pageName }', async () => {
    // Step 1: Get a valid state from /authorize
    const authorizeResp = await testApp.handle(
      new Request('http://localhost/api/settings/fb-oauth/authorize')
    )
    const location = authorizeResp.headers.get('location') ?? ''
    const authorizeUrl = new URL(location)
    const issuedState = authorizeUrl.searchParams.get('state')!

    // Step 2: Mock Graph calls
    mockGraphOAuth()

    // Step 3: Call /callback with the valid state
    const callbackResp = await testApp.handle(
      new Request(
        `http://localhost/api/settings/fb-oauth/callback?code=${MOCK_CODE}&state=${issuedState}`
      )
    )
    expect(callbackResp.status).toBe(200)

    const body = await callbackResp.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.pageName).toBe(MOCK_PAGE_NAME)
  })

  test('happy path: page token is encrypted at rest (decrypt proves round-trip)', async () => {
    // Get valid state
    const authorizeResp = await testApp.handle(
      new Request('http://localhost/api/settings/fb-oauth/authorize')
    )
    const location = authorizeResp.headers.get('location') ?? ''
    const issuedState = new URL(location).searchParams.get('state')!

    mockGraphOAuth()

    await testApp.handle(
      new Request(
        `http://localhost/api/settings/fb-oauth/callback?code=${MOCK_CODE}&state=${issuedState}`
      )
    )

    // Query DB and verify the stored token decrypts to the mock page token
    const rows = await db.select({
      fbPageId: pages.fbPageId,
      accessTokenEnc: pages.accessTokenEnc,
    }).from(pages).limit(1)

    expect(rows.length).toBe(1)
    const stored = rows[0].accessTokenEnc
    const decrypted = decrypt(stored)
    expect(decrypted).toBe(MOCK_PAGE_TOKEN)
  })

  test('T-1-EXPOSE: callback response body does NOT contain the page token', async () => {
    // Get valid state
    const authorizeResp = await testApp.handle(
      new Request('http://localhost/api/settings/fb-oauth/authorize')
    )
    const location = authorizeResp.headers.get('location') ?? ''
    const issuedState = new URL(location).searchParams.get('state')!

    mockGraphOAuth()

    const callbackResp = await testApp.handle(
      new Request(
        `http://localhost/api/settings/fb-oauth/callback?code=${MOCK_CODE}&state=${issuedState}`
      )
    )

    const text = await callbackResp.text()
    expect(text).not.toContain(MOCK_PAGE_TOKEN)
    expect(text).not.toContain(MOCK_USER_TOKEN)
  })

  test('T-1-SECRET: callback response body does NOT contain FB_APP_SECRET', async () => {
    const authorizeResp = await testApp.handle(
      new Request('http://localhost/api/settings/fb-oauth/authorize')
    )
    const location = authorizeResp.headers.get('location') ?? ''
    const issuedState = new URL(location).searchParams.get('state')!

    mockGraphOAuth()

    const callbackResp = await testApp.handle(
      new Request(
        `http://localhost/api/settings/fb-oauth/callback?code=${MOCK_CODE}&state=${issuedState}`
      )
    )

    const text = await callbackResp.text()
    expect(text).not.toContain(FB_APP_SECRET)
  })
})

describe('fbOauth routes — WR-02 single-row invariant', () => {
  afterEach(async () => {
    mock.restore()
    await db.delete(pages)
  })

  test('WR-02: connecting a DIFFERENT page replaces the row instead of inserting a second', async () => {
    // --- Connect page A ---
    const authA = await testApp.handle(
      new Request('http://localhost/api/settings/fb-oauth/authorize')
    )
    const stateA = new URL(authA.headers.get('location') ?? '').searchParams.get('state')!
    mockGraphOAuth({
      accounts: { data: [{ id: 'page-A', name: 'Page A', access_token: 'token-A' }] },
    })
    const cbA = await testApp.handle(
      new Request(`http://localhost/api/settings/fb-oauth/callback?code=${MOCK_CODE}&state=${stateA}`)
    )
    expect(cbA.status).toBe(200)
    mock.restore()

    // --- Connect a DIFFERENT page B (new state, different fbPageId) ---
    const authB = await testApp.handle(
      new Request('http://localhost/api/settings/fb-oauth/authorize')
    )
    const stateB = new URL(authB.headers.get('location') ?? '').searchParams.get('state')!
    mockGraphOAuth({
      accounts: { data: [{ id: 'page-B', name: 'Page B', access_token: 'token-B' }] },
    })
    const cbB = await testApp.handle(
      new Request(`http://localhost/api/settings/fb-oauth/callback?code=${MOCK_CODE}&state=${stateB}`)
    )
    expect(cbB.status).toBe(200)

    // The pages table must hold exactly ONE row — the most recently connected page.
    const rows = await db.select({ fbPageId: pages.fbPageId }).from(pages)
    expect(rows.length).toBe(1)
    expect(rows[0].fbPageId).toBe('page-B')
  })
})

describe('fbOauth routes — GET /api/settings/fb-oauth/callback (state mismatch)', () => {
  afterEach(async () => {
    mock.restore()
    await db.delete(pages)
  })

  test('T-1-CSRF: missing state → 400', async () => {
    mockGraphOAuth()
    const response = await testApp.handle(
      new Request(`http://localhost/api/settings/fb-oauth/callback?code=${MOCK_CODE}`)
    )
    expect(response.status).toBe(400)
  })

  test('T-1-CSRF: wrong state → 400', async () => {
    mockGraphOAuth()
    const response = await testApp.handle(
      new Request(
        `http://localhost/api/settings/fb-oauth/callback?code=${MOCK_CODE}&state=wrong-state-value`
      )
    )
    expect(response.status).toBe(400)
  })

  test('T-1-CSRF: state mismatch → error body contains state_mismatch', async () => {
    mockGraphOAuth()
    const response = await testApp.handle(
      new Request(
        `http://localhost/api/settings/fb-oauth/callback?code=${MOCK_CODE}&state=bad-state`
      )
    )
    const body = await response.json() as Record<string, unknown>
    expect(body.error).toBe('state_mismatch')
  })

  test('T-1-CSRF: state mismatch → nothing stored in pages table', async () => {
    mockGraphOAuth()
    await testApp.handle(
      new Request(
        `http://localhost/api/settings/fb-oauth/callback?code=${MOCK_CODE}&state=bad-state`
      )
    )

    const rows = await db.select().from(pages).limit(1)
    expect(rows.length).toBe(0)
  })

  test('T-1-REPLAY: state is single-use; second callback with same state → 400', async () => {
    // Get valid state
    const authorizeResp = await testApp.handle(
      new Request('http://localhost/api/settings/fb-oauth/authorize')
    )
    const location = authorizeResp.headers.get('location') ?? ''
    const issuedState = new URL(location).searchParams.get('state')!

    mockGraphOAuth()

    // First callback — should succeed
    const firstResp = await testApp.handle(
      new Request(
        `http://localhost/api/settings/fb-oauth/callback?code=${MOCK_CODE}&state=${issuedState}`
      )
    )
    expect(firstResp.status).toBe(200)

    mock.restore()
    mockGraphOAuth()

    // Second callback with same state — must fail (state consumed)
    const secondResp = await testApp.handle(
      new Request(
        `http://localhost/api/settings/fb-oauth/callback?code=${MOCK_CODE}&state=${issuedState}`
      )
    )
    expect(secondResp.status).toBe(400)
  })
})

describe('fbOauth routes — callback Graph error handling', () => {
  afterEach(async () => {
    mock.restore()
    await db.delete(pages)
  })

  test('Graph token exchange error → 422', async () => {
    const authorizeResp = await testApp.handle(
      new Request('http://localhost/api/settings/fb-oauth/authorize')
    )
    const location = authorizeResp.headers.get('location') ?? ''
    const issuedState = new URL(location).searchParams.get('state')!

    mockGraphOAuth({
      accessToken: {
        error: { message: 'Invalid code', type: 'OAuthException', code: 100 },
      },
    })

    const response = await testApp.handle(
      new Request(
        `http://localhost/api/settings/fb-oauth/callback?code=bad-code&state=${issuedState}`
      )
    )
    expect(response.status).toBe(422)
    const body = await response.json() as Record<string, unknown>
    expect(body.error).toBe('oauth_exchange_failed')
  })

  test('Graph me/accounts error → 422', async () => {
    const authorizeResp = await testApp.handle(
      new Request('http://localhost/api/settings/fb-oauth/authorize')
    )
    const location = authorizeResp.headers.get('location') ?? ''
    const issuedState = new URL(location).searchParams.get('state')!

    mockGraphOAuth({
      accounts: {
        error: { message: 'Invalid OAuth access token.', type: 'OAuthException', code: 190 },
      },
    })

    const response = await testApp.handle(
      new Request(
        `http://localhost/api/settings/fb-oauth/callback?code=${MOCK_CODE}&state=${issuedState}`
      )
    )
    expect(response.status).toBe(422)
    const body = await response.json() as Record<string, unknown>
    expect(body.error).toBe('page_token_failed')
  })
})
