/**
 * Parser factory — dispatch by platform string.
 *
 * Phase 2: Shopee only.
 * Lazada and TikTok parsers are deferred to Phase 8.
 */

import { parseShopee } from './shopee'
import type { ShopeeSelectors } from './shopee'
import type { RawProduct } from '../lib/messaging'

type ParseFn = (doc: Document, selectors: ShopeeSelectors) => RawProduct

/**
 * Return the parser function for the given platform.
 * @throws {Error} if the platform is not implemented in this phase.
 */
export function getParser(platform: string): ParseFn {
  switch (platform) {
    case 'shopee':
      return parseShopee
    case 'lazada':
      throw new Error('Lazada parser not implemented in Phase 2')
    case 'tiktok':
      throw new Error('TikTok parser not implemented in Phase 2')
    default:
      throw new Error(`Unknown platform: ${platform}`)
  }
}
