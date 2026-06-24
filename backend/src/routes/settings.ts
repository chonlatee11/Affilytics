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

      // Step 3: Upsert the single pages row (single-operator tool — one connected page)
      await db
        .insert(pages)
        .values({
          fbPageId:            result.pageId,
          pageName:            result.pageName,
          accessTokenEnc,
          dataAccessExpiresAt: null,  // /me endpoint does not provide expiry (Phase 6 OAuth does)
        })
        .onConflictDoUpdate({
          target: pages.fbPageId,
          set: {
            pageName:            result.pageName,
            accessTokenEnc,
            dataAccessExpiresAt: null,
          },
        })

      // Step 4: Return confirmation WITHOUT the token (T-1-EXPOSE)
      return {
        ok: true,
        pageName:            result.pageName,
        dataAccessExpiresAt: null,
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
    const pageRows = await db
      .select({
        fbPageId:            pages.fbPageId,
        pageName:            pages.pageName,
        accessTokenEnc:      pages.accessTokenEnc,  // Only for decrypt probe (not returned)
        dataAccessExpiresAt: pages.dataAccessExpiresAt,
      })
      .from(pages)
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
