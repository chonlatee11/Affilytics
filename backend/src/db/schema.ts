/**
 * Drizzle sqlite-core schema for all 7 Affilytics entities.
 * D-06: Full schema for every core entity; entity-specific endpoints deferred to later phases.
 * D-09: SQLite (not Postgres).
 * Timestamp defaults use sql`(unixepoch())` — NOT NOW() (SQLite has no NOW()).
 */

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ─── 1. Products ─────────────────────────────────────────────────────────────

export const products = sqliteTable('products', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  platform:     text('platform', { enum: ['shopee', 'lazada', 'tiktok'] }).notNull(),
  name:         text('name').notNull(),
  price:        real('price').notNull(),
  discountPct:  real('discount_pct').notNull().default(0),
  rating:       real('rating'),
  reviewCount:  integer('review_count'),
  salesCount:   integer('sales_count'),
  shop:         text('shop'),
  productUrl:   text('product_url').notNull().unique(),
  capturedAt:   integer('captured_at', { mode: 'timestamp' }).notNull()
                  .default(sql`(unixepoch())`),
})

// ─── 2. ProductExtras ─────────────────────────────────────────────────────────

export const productExtras = sqliteTable('product_extras', {
  productId:      text('product_id').primaryKey().references(() => products.id),
  commissionPct:  real('commission_pct').notNull().default(0),
  affiliateUrl:   text('affiliate_url'),
  campaignTag:    text('campaign_tag'),
  score:          real('score'),
  scoreBreakdown: text('score_breakdown'),  // JSON string
})

// ─── 3. PostDrafts ────────────────────────────────────────────────────────────

export const postDrafts = sqliteTable('post_drafts', {
  id:          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId:   text('product_id').notNull().references(() => products.id),
  captionTh:   text('caption_th').notNull(),
  captionEn:   text('caption_en').notNull(),
  status:      text('status', {
                 enum: ['draft', 'pending_approval', 'approved', 'rejected', 'published'],
               }).notNull().default('draft'),
  scheduledAt:  integer('scheduled_at', { mode: 'timestamp' }),
  draftedAt:    integer('drafted_at', { mode: 'timestamp' }).notNull()
                  .default(sql`(unixepoch())`),
  approvedAt:   integer('approved_at', { mode: 'timestamp' }),
  draftedBy:    text('drafted_by').notNull().default('template'),  // 'ollama' | 'template'
})

// ─── 4. PublishedPosts ────────────────────────────────────────────────────────

export const publishedPosts = sqliteTable('published_posts', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  draftId:      text('draft_id').notNull().references(() => postDrafts.id),
  fbPostId:     text('fb_post_id').notNull(),
  publishedAt:  integer('published_at', { mode: 'timestamp' }).notNull()
                  .default(sql`(unixepoch())`),
  publishedUrl: text('published_url'),
})

// ─── 5. ResultEntries ─────────────────────────────────────────────────────────

export const resultEntries = sqliteTable('result_entries', {
  id:          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId:   text('product_id').references(() => products.id),
  campaignTag: text('campaign_tag'),
  clicks:      integer('clicks').notNull().default(0),
  orders:      integer('orders').notNull().default(0),
  commission:  real('commission').notNull().default(0),
  enteredAt:   integer('entered_at', { mode: 'timestamp' }).notNull()
                 .default(sql`(unixepoch())`),
  notes:       text('notes'),
})

// ─── 6. Pages (operator's connected FB Page — only 1 row) ─────────────────────

export const pages = sqliteTable('pages', {
  id:                  text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  fbPageId:            text('fb_page_id').notNull().unique(),
  pageName:            text('page_name').notNull(),
  accessTokenEnc:      text('access_token_enc').notNull(),  // AES-256-GCM: iv:tag:ciphertext
  dataAccessExpiresAt: integer('data_access_expires_at', { mode: 'timestamp' }),
  connectedAt:         integer('connected_at', { mode: 'timestamp' }).notNull()
                         .default(sql`(unixepoch())`),
})

// ─── 7. Settings (operator's global settings — only 1 row, id='default') ──────

export const settings = sqliteTable('settings', {
  id:             text('id').primaryKey().default('default'),
  scoreWeights:   text('score_weights').notNull(),   // JSON: { commission, popularity, rating, reviews, discount }
  draftMode:      text('draft_mode', { enum: ['ollama', 'template'] }).notNull().default('template'),
  dailyPostLimit: integer('daily_post_limit').notNull().default(3),
  defaultTone:    text('default_tone', { enum: ['casual', 'formal', 'fun'] }).notNull().default('casual'),
})
