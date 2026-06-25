/**
 * Idempotent default settings seed.
 *
 * D-08: seedDefaultSettings() inserts exactly ONE 'default' row into the settings table.
 * Called at every boot — must be safe to call repeatedly (no duplicate rows).
 * Uses .onConflictDoNothing() so a second call is a no-op.
 *
 * Default scoreWeights reflect a balanced starting point; operator can tune via settings UI.
 */

import { db } from './src/db/client'
import { settings } from './src/db/schema'

const DEFAULT_SCORE_WEIGHTS = {
  commission:  0.35,
  popularity:  0.25,
  rating:      0.20,
  reviews:     0.10,
  discount:    0.10,
}

/**
 * seedDefaultSettings() — inserts the 'default' settings row if it does not exist.
 * Safe to call multiple times — second call is a no-op (onConflictDoNothing).
 */
export async function seedDefaultSettings(): Promise<void> {
  await db
    .insert(settings)
    .values({
      id:             'default',
      scoreWeights:   JSON.stringify(DEFAULT_SCORE_WEIGHTS),
      draftMode:      'template',
      dailyPostLimit: 3,
      defaultTone:    'casual',
    })
    .onConflictDoNothing()
}
