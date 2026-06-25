/**
 * Typed messaging protocol for the Affilytics extension.
 *
 * Uses @webext-core/messaging defineExtensionMessaging to provide
 * type-safe communication between content script, background, and popup.
 *
 * ProtocolMap:
 *   readPage()       → popup→content: parse current page DOM, return RawProduct
 *   saveProduct(...) → popup→background: send CapturePayload to backend, return result
 */
import { defineExtensionMessaging } from '@webext-core/messaging'

/**
 * Raw product data captured from DOM by the Shopee/Lazada/TikTok parser.
 * Fields may be null if the selector did not match or the value was unparseable.
 * fieldsRead/fieldsTotal power the N/N badge shown in the popup review form (D-03).
 */
export interface RawProduct {
  name: string | null
  price: number | null
  discountPct: number
  rating: number | null
  reviewCount: number | null
  salesCount: number | null
  shop: string | null
  productUrl: string
  platform: 'shopee' | 'lazada' | 'tiktok'
  fieldsRead: number
  fieldsTotal: number
}

/**
 * Payload sent to the backend after operator reviews/edits the form.
 * Extends RawProduct but omits the UI-only fieldsRead/fieldsTotal counters.
 * name is required (non-null) — the operator must confirm a product name before Save.
 */
export interface CapturePayload extends Omit<RawProduct, 'fieldsRead' | 'fieldsTotal'> {
  name: string // required by backend; must be non-null before Save
}

interface ProtocolMap {
  /** popup → content: parse current page, return normalized RawProduct */
  readPage(): RawProduct
  /** popup → background: send confirmed payload to backend, return result */
  saveProduct(data: CapturePayload): { ok: true; id: string } | { ok: false; error: string }
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>()
