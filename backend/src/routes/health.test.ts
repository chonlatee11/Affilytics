/**
 * VALIDATION: FOUND-01 — GET /health returns 200 + DB connectivity OK
 * Decision: D-05 — Health endpoint returns 200 OK + trivial DB connectivity check.
 *           No FB/Ollama checks — only verifies SQLite is reachable.
 *
 * Test approach: use Elysia's in-process .handle(new Request(...)) to exercise
 * the route without binding a socket (no port conflicts in test environment).
 *
 * RED state: This test will fail until health.ts is implemented (Plan 03 Wave 2).
 */

import { test, expect, describe, beforeAll } from 'bun:test'
import { healthRoutes } from '../routes/health'

describe('GET /health — backend health + DB connectivity (FOUND-01)', () => {
  beforeAll(() => {
    // Set up valid env for route import
    process.env.BUN_ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.DATABASE_URL = ':memory:'
  })

  test('FOUND-01 (D-05): GET /health returns HTTP 200', async () => {
    const response = await healthRoutes.handle(
      new Request('http://localhost/health', { method: 'GET' })
    )
    expect(response.status).toBe(200)
  })

  test('FOUND-01 (D-05): GET /health response body has status: ok', async () => {
    const response = await healthRoutes.handle(
      new Request('http://localhost/health', { method: 'GET' })
    )
    const body = await response.json() as { status: string; db?: string }
    expect(body.status).toBe('ok')
  })

  test('FOUND-01 (D-05): GET /health response body includes db connectivity indicator', async () => {
    const response = await healthRoutes.handle(
      new Request('http://localhost/health', { method: 'GET' })
    )
    const body = await response.json() as { status: string; db?: string }
    // DB field must exist and indicate connection is up
    expect(body).toHaveProperty('db')
    expect(body.db).toBe('connected')
  })
})
