/**
 * Pages service — the single owner of the "one connected page" persistence rule.
 *
 * Both connect paths (manual paste in settings.ts and the OAuth callback in fbOauth.ts) need
 * the same replace-on-connect write. Keeping it here means the WR-02 single-row invariant and
 * the WR-06 expiry TODO live in exactly one place instead of two copy-pasted blocks that can
 * drift.
 */

import { db } from '../db/client'
import { pages } from '../db/schema'

export interface ConnectPageInput {
  fbPageId: string
  pageName: string
  /** AES-256-GCM blob (iv:tag:ciphertext) — already encrypted by the caller. */
  accessTokenEnc: string
  /**
   * Token data-access expiry, when known. The /me paste flow has no expiry; the OAuth flow can
   * fetch it via debug_token (WR-06, Phase 5). Stored null until then.
   */
  dataAccessExpiresAt?: Date | null
}

/**
 * connectPage(input) — atomically replaces the single pages row.
 *
 * WR-02: a bare onConflictDoUpdate(target: fbPageId) only updates when the SAME page reconnects;
 * connecting a DIFFERENT page would INSERT a second row and break the single-row invariant that
 * GET /api/settings relies on. Delete-then-insert guarantees exactly one row regardless of which
 * page is connected (single-operator local tool).
 *
 * The delete + insert run in one transaction so a failure between them can never leave the pages
 * table empty — the operator is never silently disconnected with no recovery. bun:sqlite's
 * transaction callback is synchronous.
 */
export function connectPage(input: ConnectPageInput): void {
  db.transaction((tx) => {
    tx.delete(pages).run()
    tx.insert(pages).values({
      fbPageId:            input.fbPageId,
      pageName:            input.pageName,
      accessTokenEnc:      input.accessTokenEnc,
      dataAccessExpiresAt: input.dataAccessExpiresAt ?? null,
    }).run()
  })
}
