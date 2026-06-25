/**
 * Background service worker entrypoint — saveProduct handler
 *
 * Responsibilities:
 *   - Register onMessage('saveProduct') synchronously at top level (MV3 Pitfall 2:
 *     Chrome only dispatches to listeners registered during synchronous startup).
 *   - Forward confirmed CapturePayload to the backend POST /api/products/capture.
 *   - Own ALL outbound calls to the backend — content scripts on HTTPS Shopee pages
 *     cannot fetch a http:// origin (mixed-content rule, T-02-POPUP-2).
 *
 * Security:
 *   T-02-POPUP-2: Content script never calls backend directly; only the background
 *                 service worker (extension origin) may call http://127.0.0.1:3000.
 *   T-02-POPUP-4: Network errors return { ok:false, error:'backend_offline' } — popup
 *                 shows an offline banner and keeps the form populated (D-08).
 *
 * URL invariant (W2): MUST use http://127.0.0.1:3000 (NOT localhost).
 *   The Phase 1 backend binds 127.0.0.1 explicitly; the hostname 'localhost' may
 *   fail to resolve on some configurations. The literal 127.0.0.1 is mandatory.
 */

import { defineBackground } from 'wxt/utils/define-background'
import { onMessage } from '../lib/messaging'

export default defineBackground(() => {
  // SYNC registration — this MUST be called before any await in this callback.
  // MV3 Pitfall 2: Chrome dispatches events only to listeners registered at
  // module init time. A listener registered after an await will never fire.
  onMessage('saveProduct', async (message) => {
    const data = message.data
    try {
      // W2 invariant: use 127.0.0.1 (never 'localhost').
      // The backend (Phase 1) binds 127.0.0.1:3000 explicitly.
      const res = await fetch('http://127.0.0.1:3000/api/products/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        return {
          ok: false as const,
          error: (body as { message?: string })?.message ?? `HTTP ${res.status}`,
        }
      }
      const json = (await res.json()) as { id: string }
      return { ok: true as const, id: json.id }
    } catch {
      // D-08: network error (backend offline) — return sentinel string so the
      // popup can show the offline banner and keep the form populated.
      return { ok: false as const, error: 'backend_offline' }
    }
  })
})
