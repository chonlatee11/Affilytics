/**
 * Settings routes for the Affilytics backend.
 *
 * SET-01: Operator connects an FB Page; token verified, encrypted at rest, never returned in plaintext.
 * T-1-EXPOSE: accessTokenEnc is NEVER included in GET /api/settings response.
 * T-1-FBVERIFY: POST /api/settings/fb-connect verifies token against Graph API before storing.
 * T-1-DISCONNECT: GET /api/settings with undecryptable token returns fbConnected:false, no crash (D-04).
 * D-01: Manual token paste, not full OAuth redirect (OAuth deferred to Phase 6).
 */

import { Elysia, t } from 'elysia'
import { desc } from 'drizzle-orm'
import { db } from '../db/client'
import { pages, settings } from '../db/schema'
import { verifyToken } from '../services/fbService'
import { encrypt, decrypt } from '../services/cryptoService'

export const settingsRoutes = new Elysia({ prefix: '/api/settings' })

  // ---------------------------------------------------------------------------
  // POST /api/settings/fb-connect
  // Verify → Encrypt → Upsert
  // ---------------------------------------------------------------------------
  .post(
    '/fb-connect',
    async ({ body, set }) => {
      const { pageId, accessToken } = body

      // Step 1: Verify token against Facebook Graph API
      const result = await verifyToken(accessToken, pageId)
      if (!result.ok) {
        set.status = 422
        return {
          error: 'invalid_token',
          detail: result.error,
        }
      }

      // Step 2: Encrypt the token using AES-256-GCM (T-1-EXPOSE)
      const accessTokenEnc = encrypt(accessToken)

      // Step 3: Replace the single pages row (single-operator tool — one connected page).
      // WR-02: A bare onConflictDoUpdate(target: fbPageId) only updates when the SAME page
      // reconnects; connecting a DIFFERENT page (new fbPageId, fresh UUID id) would INSERT a
      // second row and break the single-row invariant GET /api/settings relies on. Deleting
      // first guarantees exactly one row regardless of which page is connected.
      //
      // WR-06 / TODO(Phase 5 FB Publishing): populate dataAccessExpiresAt so the dashboard
      // can warn the operator before the token silently expires (CLAUDE.md Known Constraint #3:
      // FB tokens expire ~60 days). The manual /me paste flow does not expose expiry; this
      // requires fetching `data_access_expires_at` via debug_token. Stored null until then.
      await db.delete(pages)
      await db.insert(pages).values({
        fbPageId:            result.pageId,
        pageName:            result.pageName,
        accessTokenEnc,
        dataAccessExpiresAt: null,  // TODO(Phase 5): /me paste flow has no expiry; debug_token needed (WR-06)
      })

      // Step 4: Return confirmation WITHOUT the token (T-1-EXPOSE)
      return {
        ok: true,
        pageName:            result.pageName,
        dataAccessExpiresAt: null,  // TODO(Phase 5): populate real expiry once debug_token wired (WR-06)
      }
    },
    {
      body: t.Object({
        pageId:      t.String({ minLength: 1 }),
        accessToken: t.String({ minLength: 10 }),
      }),
    }
  )

  // ---------------------------------------------------------------------------
  // GET /api/settings
  // Return settings + FB connection state — never return accessTokenEnc (T-1-EXPOSE)
  // ---------------------------------------------------------------------------
  .get('', async () => {
    // Fetch the single page row with EXPLICIT column selection.
    // accessTokenEnc is fetched ONLY to probe decryptability — it is NEVER in the response.
    // WR-02: connect flows now enforce a single pages row (delete-then-insert), so this read
    // should only ever see one row. The deterministic `ORDER BY connected_at DESC` is a
    // defensive measure: if a stray second row ever existed, the most recently connected page
    // wins instead of relying on SQLite's unspecified row order with a bare `.limit(1)`.
    const pageRows = await db
      .select({
        fbPageId:            pages.fbPageId,
        pageName:            pages.pageName,
        accessTokenEnc:      pages.accessTokenEnc,  // Only for decrypt probe (not returned)
        dataAccessExpiresAt: pages.dataAccessExpiresAt,
      })
      .from(pages)
      .orderBy(desc(pages.connectedAt))
      .limit(1)

    const page = pageRows[0] ?? null

    // Determine FB connection state: try to decrypt the stored token.
    // decrypt() returns null on any error (wrong key, tampered data, key loss, etc.)
    // A null result surfaces the "disconnected" state (D-04, T-1-DISCONNECT) — never throws.
    let fbConnected = false
    let pageName: string | null = null
    let dataAccessExpiresAt: number | Date | null = null

    if (page) {
      const decrypted = decrypt(page.accessTokenEnc)
      fbConnected = decrypted !== null
      if (fbConnected) {
        pageName = page.pageName
        dataAccessExpiresAt = page.dataAccessExpiresAt ?? null
      }
    }

    // Fetch the default settings row (no sensitive data)
    const settingsRows = await db.select().from(settings).limit(1)
    const settingsRow = settingsRows[0] ?? null

    // Return response — accessTokenEnc is NEVER included here (T-1-EXPOSE, Pitfall 3)
    return {
      fbConnected,
      pageName,
      dataAccessExpiresAt,
      scoreWeights:   settingsRow?.scoreWeights
                        ? JSON.parse(settingsRow.scoreWeights)
                        : null,
      draftMode:      settingsRow?.draftMode      ?? null,
      dailyPostLimit: settingsRow?.dailyPostLimit ?? null,
      defaultTone:    settingsRow?.defaultTone    ?? null,
    }
  })
