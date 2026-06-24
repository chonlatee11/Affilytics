/**
 * VALIDATION: FOUND-03 — Server binds to 127.0.0.1 only (not 0.0.0.0)
 * Threat: T-1-LAN (backend must be unreachable from LAN)
 *
 * Test approach: import `app` from '../index', call app.listen() manually in beforeAll,
 * and assert that the server's hostname is '127.0.0.1'. The import.meta.main guard in
 * index.ts prevents the port from being bound on import — the test controls the lifecycle.
 *
 * RED state: This test will fail until index.ts is implemented (Plan 02 Wave 1).
 */

import { test, expect, describe, afterAll, beforeAll } from 'bun:test'

describe('Server — localhost-only binding (FOUND-03)', () => {
  beforeAll(async () => {
    // Ensure a valid encryption key is set so the app can be imported
    process.env.BUN_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATABASE_URL = ':memory:'
    // Import and start the server manually (import.meta.main guard prevents auto-listen)
    const { app } = await import('../index')
    app.listen(3000)
  })

  afterAll(async () => {
    // Stop the server after tests
    const { app } = await import('../index')
    await app.stop()
  })

  test('FOUND-03 (T-1-LAN): app server hostname is 127.0.0.1', async () => {
    const { app } = await import('../index')

    // The app must be configured to bind only to loopback
    // Elysia exposes the server config on app.server after .listen() is called
    const hostname = app.server?.hostname

    expect(hostname).toBe('127.0.0.1')
  })

  test('FOUND-03 (T-1-LAN): app server hostname is NOT 0.0.0.0 (LAN-exposed)', async () => {
    const { app } = await import('../index')
    const hostname = app.server?.hostname

    expect(hostname).not.toBe('0.0.0.0')
    expect(hostname).not.toBeUndefined()
  })
})
