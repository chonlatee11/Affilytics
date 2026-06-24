/**
 * Health check route for the Affilytics backend.
 *
 * FOUND-01: GET /health returns 200 + DB connectivity check.
 * D-05: Health endpoint returns 200 OK + trivial DB connectivity check.
 *       No FB/Ollama checks — only verifies SQLite is reachable.
 */

import { Elysia } from 'elysia'
import { db } from '../db/client'
import { rawSqlite } from '../db/client'

export const healthRoutes = new Elysia()
  .get('/health', () => {
    // Trivial DB ping — run a SELECT 1 on the raw sqlite handle
    try {
      rawSqlite(db).query('SELECT 1').get()
      return {
        status: 'ok',
        db: 'connected',
      }
    } catch {
      // DB is unreachable — return 503
      return new Response(
        JSON.stringify({ status: 'error', db: 'disconnected' }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  })
