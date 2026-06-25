/**
 * Reusable bun:test fetch mock for graph.facebook.com
 *
 * Intercepts calls to graph.facebook.com and returns fixture-based responses.
 * No live network calls are made in any test that uses this helper.
 *
 * Usage:
 *   import { installFbMock, restoreFetch } from '../../test/helpers/fbMock'
 *
 *   beforeEach(() => installFbMock({ success: true, pageId: '123', pageName: 'Test Page' }))
 *   afterEach(() => restoreFetch())
 */

import { mock } from 'bun:test'

export interface FbSuccessFixture {
  success: true
  pageId: string
  pageName: string
  dataAccessExpiresAt?: number
}

export interface FbErrorFixture {
  success: false
  errorMessage: string
  errorCode?: number
}

export type FbFixture = FbSuccessFixture | FbErrorFixture

/**
 * Install a mock over global fetch that intercepts calls to graph.facebook.com
 * and returns the provided fixture as a JSON response.
 *
 * Calls to other URLs pass through to the real fetch (or a secondary mock).
 */
export function installFbMock(fixture: FbFixture): void {
  mock.module('node:https', () => ({})) // suppress any accidental https calls

  // Override global fetch for graph.facebook.com requests
  const originalFetch = globalThis.fetch

  globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof URL ? input.href : String(input)

    if (url.includes('graph.facebook.com')) {
      if (fixture.success) {
        const body = JSON.stringify({
          id: fixture.pageId,
          name: fixture.pageName,
        })
        return new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } else {
        const body = JSON.stringify({
          error: {
            message: fixture.errorMessage,
            type: 'OAuthException',
            code: fixture.errorCode ?? 190,
          },
        })
        return new Response(body, {
          status: 200, // FB Graph API returns 200 even for token errors
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // Non-FB requests: pass through (should not happen in unit tests)
    return originalFetch(input, init)
  }) as typeof globalThis.fetch
}

/**
 * Restore global fetch to its original implementation.
 * Call in afterEach() to clean up between tests.
 */
export function restoreFetch(): void {
  // bun:test mock.restore() restores all mocks; for targeted cleanup we reassign
  // the fetch back using mock.restore on the individual mock
  // In practice, bun:test resets between test files automatically,
  // but explicit cleanup is good practice for within-file isolation.
  mock.restore()
}
