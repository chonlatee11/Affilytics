/**
 * VALIDATION: SET-01 — Settings route security behaviors
 *
 * Three security threat assertions:
 *
 * (a) T-1-EXPOSE: GET /api/settings MUST NOT contain accessTokenEnc or raw token
 * (b) T-1-FBVERIFY: POST /api/settings/fb-connect rejects invalid FB tokens (422)
 * (c) T-1-DISCONNECT: GET /api/settings with undecryptable token returns fbConnected:false (no crash)
 *
 * FB Graph API mocked via test/helpers/fbMock.ts — no live network calls.
 *
 * RED state: This test will fail until settings.ts is implemented (Plan 03 Wave 2).
 */

import { test, expect, describe, beforeEach, afterEach, beforeAll } from 'bun:test'
import { settingsRoutes } from '../routes/settings'
import { installFbMock, restoreFetch } from '../../test/helpers/fbMock'

const VALID_TOKEN = 'EAABsbCS1iHgBO_valid_test_page_token'
const VALID_PAGE_ID = '123456789'
const VALID_PAGE_NAME = 'My Test Page'

describe('Settings routes — security assertions (SET-01)', () => {
  beforeAll(() => {
    process.env.BUN_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATABASE_URL = ':memory:'
  })

  afterEach(() => {
    restoreFetch()
  })

  // --------------------------------------------------------------------------
  // (a) T-1-EXPOSE: token must never appear in GET /api/settings response
  // --------------------------------------------------------------------------
  describe('T-1-EXPOSE: GET /api/settings must not expose accessTokenEnc', () => {
    beforeEach(() => {
      // Mock FB to return success (simulates a previously connected page)
      installFbMock({
        success: true,
        pageId: VALID_PAGE_ID,
        pageName: VALID_PAGE_NAME,
      })
    })

    test('T-1-EXPOSE: GET /api/settings response JSON does NOT contain accessTokenEnc key', async () => {
      const response = await settingsRoutes.handle(
        new Request('http://localhost/api/settings', { method: 'GET' })
      )
      const text = await response.text()

      // The raw serialized response string must not contain the encrypted token column name
      expect(text).not.toContain('accessTokenEnc')
      expect(text).not.toContain('access_token_enc')
    })

    test('T-1-EXPOSE: GET /api/settings response JSON does NOT contain the raw FB token plaintext', async () => {
      // First, connect a page (POST fb-connect) to store a token
      const connectResponse = await settingsRoutes.handle(
        new Request('http://localhost/api/settings/fb-connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageId: VALID_PAGE_ID, accessToken: VALID_TOKEN }),
        })
      )
      expect(connectResponse.status).toBe(200)

      // Now GET settings — the raw token must not appear in the response
      const getResponse = await settingsRoutes.handle(
        new Request('http://localhost/api/settings', { method: 'GET' })
      )
      const text = await getResponse.text()

      expect(text).not.toContain(VALID_TOKEN)
      expect(text).not.toContain('accessTokenEnc')
    })
  })

  // --------------------------------------------------------------------------
  // (b) T-1-FBVERIFY: invalid FB token rejected at POST fb-connect (422)
  // --------------------------------------------------------------------------
  describe('T-1-FBVERIFY: POST /api/settings/fb-connect rejects invalid token', () => {
    beforeEach(async () => {
      installFbMock({
        success: false,
        errorMessage: 'Invalid OAuth access token.',
        errorCode: 190,
      })
      // Clear pages table before each test to ensure isolated state.
      // T-1-EXPOSE may have inserted a valid page in the shared in-memory DB;
      // this test must start with no connected pages to assert fbConnected: false.
      const { db } = await import('../db/client')
      const { pages } = await import('../db/schema')
      await db.delete(pages)
    })

    test('T-1-FBVERIFY: invalid token returns 422 status', async () => {
      const response = await settingsRoutes.handle(
        new Request('http://localhost/api/settings/fb-connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageId: VALID_PAGE_ID, accessToken: 'invalid_token_here' }),
        })
      )
      // Must reject with 4xx (422 Unprocessable Entity)
      expect(response.status).toBe(422)
    })

    test('T-1-FBVERIFY: invalid token POST does NOT persist any token to DB', async () => {
      // Attempt to connect with invalid token
      await settingsRoutes.handle(
        new Request('http://localhost/api/settings/fb-connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageId: VALID_PAGE_ID, accessToken: 'invalid_token_here' }),
        })
      )

      // GET settings should still show disconnected
      const getResponse = await settingsRoutes.handle(
        new Request('http://localhost/api/settings', { method: 'GET' })
      )
      const body = await getResponse.json() as { fbConnected: boolean }
      expect(body.fbConnected).toBe(false)
    })
  })

  // --------------------------------------------------------------------------
  // WR-02: single-row invariant — connecting a DIFFERENT page must not leave 2 rows
  // --------------------------------------------------------------------------
  describe('WR-02: connecting a different page keeps exactly one pages row', () => {
    beforeEach(async () => {
      const { db } = await import('../db/client')
      const { pages } = await import('../db/schema')
      await db.delete(pages)
    })

    test('WR-02: switching pages does not create a second row; latest page wins', async () => {
      // Connect page A
      installFbMock({ success: true, pageId: 'page-A', pageName: 'Page A' })
      const respA = await settingsRoutes.handle(
        new Request('http://localhost/api/settings/fb-connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageId: 'page-A', accessToken: VALID_TOKEN }),
        })
      )
      expect(respA.status).toBe(200)
      restoreFetch()

      // Connect a DIFFERENT page B (different fbPageId)
      installFbMock({ success: true, pageId: 'page-B', pageName: 'Page B' })
      const respB = await settingsRoutes.handle(
        new Request('http://localhost/api/settings/fb-connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageId: 'page-B', accessToken: VALID_TOKEN }),
        })
      )
      expect(respB.status).toBe(200)

      // The pages table must hold exactly ONE row (the single-operator invariant)
      const { db } = await import('../db/client')
      const { pages } = await import('../db/schema')
      const rows = await db.select({ fbPageId: pages.fbPageId }).from(pages)
      expect(rows.length).toBe(1)
      expect(rows[0].fbPageId).toBe('page-B')

      // GET /api/settings must surface the most recently connected page
      const getResp = await settingsRoutes.handle(
        new Request('http://localhost/api/settings', { method: 'GET' })
      )
      const body = await getResp.json() as { fbConnected: boolean; pageName: string | null }
      expect(body.fbConnected).toBe(true)
      expect(body.pageName).toBe('Page B')
    })
  })

  // --------------------------------------------------------------------------
  // (c) T-1-DISCONNECT: undecryptable stored token → fbConnected: false, no crash
  // --------------------------------------------------------------------------
  describe('T-1-DISCONNECT: undecryptable token returns disconnected state without crash', () => {
    test('T-1-DISCONNECT: GET /api/settings with undecryptable token returns fbConnected: false', async () => {
      // Inject a page row with a value that cannot be decrypted by the current key
      // This simulates a key rotation scenario (D-04)
      // The test inserts a corrupted/wrong-key token directly via DB, then calls GET settings

      // We import the db to insert a bad token directly
      const { db } = await import('../db/client')
      const { pages } = await import('../db/schema')

      // Clear any valid pages from earlier tests (test isolation — shared in-memory DB)
      await db.delete(pages)

      // Insert a page row with a token encrypted under a DIFFERENT key
      // (simulates key rotation / key loss scenario)
      const badToken = 'aaaa:bbbb:cccc'  // Not a valid AES-GCM encrypted blob
      await db.insert(pages).values({
        fbPageId: 'page_with_bad_token',
        pageName: 'Bad Token Page',
        accessTokenEnc: badToken,
      }).onConflictDoNothing()

      // GET settings must NOT throw, must return fbConnected: false
      let threw = false
      let response: Response
      try {
        response = await settingsRoutes.handle(
          new Request('http://localhost/api/settings', { method: 'GET' })
        )
      } catch {
        threw = true
        response = new Response('error', { status: 500 })
      }

      expect(threw).toBe(false)  // Backend must NOT crash (D-04)
      expect(response!.status).not.toBe(500)

      const body = await response!.json() as { fbConnected: boolean }
      expect(body.fbConnected).toBe(false)  // Must surface disconnected state
    })
  })
})
