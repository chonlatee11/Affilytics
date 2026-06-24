CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`fb_page_id` text NOT NULL,
	`page_name` text NOT NULL,
	`access_token_enc` text NOT NULL,
	`data_access_expires_at` integer,
	`connected_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_fb_page_id_unique` ON `pages` (`fb_page_id`);--> statement-breakpoint
CREATE TABLE `post_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`caption_th` text NOT NULL,
	`caption_en` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`scheduled_at` integer,
	`drafted_at` integer DEFAULT (unixepoch()) NOT NULL,
	`approved_at` integer,
	`drafted_by` text DEFAULT 'template' NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `product_extras` (
	`product_id` text PRIMARY KEY NOT NULL,
	`commission_pct` real DEFAULT 0 NOT NULL,
	`affiliate_url` text,
	`campaign_tag` text,
	`score` real,
	`score_breakdown` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`name` text NOT NULL,
	`price` real NOT NULL,
	`discount_pct` real DEFAULT 0 NOT NULL,
	`rating` real,
	`review_count` integer,
	`sales_count` integer,
	`shop` text,
	`product_url` text NOT NULL,
	`captured_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `published_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`fb_post_id` text NOT NULL,
	`published_at` integer DEFAULT (unixepoch()) NOT NULL,
	`published_url` text,
	FOREIGN KEY (`draft_id`) REFERENCES `post_drafts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `result_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text,
	`campaign_tag` text,
	`clicks` integer DEFAULT 0 NOT NULL,
	`orders` integer DEFAULT 0 NOT NULL,
	`commission` real DEFAULT 0 NOT NULL,
	`entered_at` integer DEFAULT (unixepoch()) NOT NULL,
	`notes` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`score_weights` text NOT NULL,
	`draft_mode` text DEFAULT 'template' NOT NULL,
	`daily_post_limit` integer DEFAULT 3 NOT NULL,
	`default_tone` text DEFAULT 'casual' NOT NULL
);
