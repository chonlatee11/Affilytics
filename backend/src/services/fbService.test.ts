/**
 * Tests for fbService OAuth helpers: exchangeCodeForToken + getPageAccessToken
 * (RED phase — will fail until implementation is added to fbService.ts)
 *
 * T-1-SECRET: FB_APP_SECRET must never appear in logs or return values.
 * T-1-EXPOSE: Tokens never logged.
 * All Graph API calls are mocked — no live Facebook network required.
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test'
import { mock } from 'bun:test'

// --- Mock fetch for graph.facebook.com before importing fbService ---

const FB_APP_ID = 'test-app-id'
const FB_APP_SECRET = 'test-app-secret-never-logged'
const FB_REDIRECT_URI = 'http://localhost:3000/api/settings/fb-oauth/callback'

// Set required env vars before importing
process.env.FB_APP_ID = FB_APP_ID
process.env.FB_APP_SECRET = FB_APP_SECRET
process.env.FB_OAUTH_REDIRECT_URI = FB_REDIRECT_URI

// Must set BUN_ENCRYPTION_KEY for requireEncryptionKey calls in other modules
process.env.BUN_ENCRYPTION_KEY = 'a'.repeat(64)

import { exchangeCodeForToken, getPageAccessToken } from '../services/fbService'

const MOCK_USER_TOKEN = 'mock-user-access-token-xyz'
const MOCK_PAGE_TOKEN = 'mock-page-access-token-abc'
const MOCK_PAGE_ID = 'page123'
const MOCK_PAGE_NAME = 'My Test Page'

// Helper: create a mock fetch for a single Graph call
function makeMockFetch(
  responses: Record<string, { body: object; status?: number }>,
) {
  return mock(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input instanceof URL ? input.href : input)
    for (const [urlFragment, resp] of Object.entries(responses)) {
      if (url.includes(urlFragment)) {
        return new Response(JSON.stringify(resp.body), {
          status: resp.status ?? 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    throw new Error(`Unexpected fetch to: ${url}`)
  }) as typeof globalThis.fetch
}

describe('fbService — exchangeCodeForToken', () => {
  afterEach(() => {
    mock.restore()
  })

  test('returns { ok:true, userToken } when Graph returns access_token', async () => {
    globalThis.fetch = makeMockFetch({
      'oauth/access_token': {
        body: { access_token: MOCK_USER_TOKEN, token_type: 'bearer' },
      },
    })

    const result = await exchangeCodeForToken('good-auth-code')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.userToken).toBe(MOCK_USER_TOKEN)
    }
  })

  test('returns { ok:false, error } when Graph returns error body', async () => {
    globalThis.fetch = makeMockFetch({
      'oauth/access_token': {
        body: {
          error: {
            message: 'Invalid verification code format.',
            type: 'OAuthException',
            code: 100,
          },
        },
      },
    })

    const result = await exchangeCodeForToken('bad-code')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Invalid verification code format')
    }
  })

  test('returns { ok:false, error } when Graph response has no access_token', async () => {
    globalThis.fetch = makeMockFetch({
      'oauth/access_token': {
        body: { some_other_field: 'unexpected' },
      },
    })

    const result = await exchangeCodeForToken('weird-code')
    expect(result.ok).toBe(false)
  })

  test('T-1-SECRET: FB_APP_SECRET does not appear in any result value', async () => {
    globalThis.fetch = makeMockFetch({
      'oauth/access_token': {
        body: { access_token: MOCK_USER_TOKEN },
      },
    })

    const result = await exchangeCodeForToken('some-code')
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(FB_APP_SECRET)
  })
})

describe('fbService — getPageAccessToken', () => {
  afterEach(() => {
    mock.restore()
  })

  test('returns { ok:true, pageId, pageName, pageToken } for first page', async () => {
    globalThis.fetch = makeMockFetch({
      'me/accounts': {
        body: {
          data: [
            { id: MOCK_PAGE_ID, name: MOCK_PAGE_NAME, access_token: MOCK_PAGE_TOKEN },
          ],
        },
      },
    })

    const result = await getPageAccessToken(MOCK_USER_TOKEN)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.pageId).toBe(MOCK_PAGE_ID)
      expect(result.pageName).toBe(MOCK_PAGE_NAME)
      expect(result.pageToken).toBe(MOCK_PAGE_TOKEN)
    }
  })

  test('returns { ok:false, error } when data array is empty', async () => {
    globalThis.fetch = makeMockFetch({
      'me/accounts': {
        body: { data: [] },
      },
    })

    const result = await getPageAccessToken(MOCK_USER_TOKEN)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeTruthy()
    }
  })

  test('returns { ok:false, error } when Graph returns error body', async () => {
    globalThis.fetch = makeMockFetch({
      'me/accounts': {
        body: {
          error: {
            message: 'Invalid OAuth access token.',
            type: 'OAuthException',
            code: 190,
          },
        },
      },
    })

    const result = await getPageAccessToken('bad-user-token')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Invalid OAuth access token')
    }
  })

  test('T-1-EXPOSE: user token does not appear in any result value', async () => {
    globalThis.fetch = makeMockFetch({
      'me/accounts': {
        body: {
          data: [{ id: MOCK_PAGE_ID, name: MOCK_PAGE_NAME, access_token: MOCK_PAGE_TOKEN }],
        },
      },
    })

    const result = await getPageAccessToken(MOCK_USER_TOKEN)
    // The result should not expose the user token passed in
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(MOCK_USER_TOKEN)
  })
})
