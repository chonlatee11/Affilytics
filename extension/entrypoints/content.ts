/**
 * Content script entrypoint — CAP-01, CAP-03, CAP-05
 *
 * Injected into Shopee product pages.
 * Listens for 'readPage' message from the popup and returns a parsed RawProduct.
 *
 * Security:
 *   T-02-PARSE-1: Values read from DOM via .textContent only (parseShopee enforces this).
 *   T-02-PARSE-2: Runs in ISOLATED world (WXT default) — page cannot modify extension globals.
 *   T-02-PARSE-3: selectors.config.json loaded via browser.runtime.getURL (scoped to
 *                 web_accessible_resources); no localhost fetch from content script (mixed-content rule).
 *
 * IMPORTANT: All runtime code must be inside main() — WXT imports this file in Node at build
 * time for manifest generation, so top-level DOM access would crash the build.
 */

import { defineContentScript } from 'wxt/utils/define-content-script'
import { onMessage } from '../lib/messaging'
import { parseShopee } from '../parsers/shopee'

export default defineContentScript({
  matches: ['*://shopee.co.th/*', '*://www.shopee.co.th/*'],
  runAt: 'document_idle',

  main() {
    // Register onMessage inside main() where runtime is available.
    // @webext-core/messaging handles the async channel correctly (no `return true` footgun).
    onMessage('readPage', async () => {
      // Load selector config at runtime via extension URL — NOT a static import.
      // Static import would bundle the JSON and defeat CAP-05/D-06 (editable without rebuild).
      const configUrl = browser.runtime.getURL('/selectors.config.json')
      const config = await fetch(configUrl).then((r) => r.json())

      // Pass the shopee selectors sub-object to the parser.
      return parseShopee(document, config.shopee)
    })
  },
})
