CREATE TABLE `advisors` (
	`id` text NOT NULL,
	`version` integer NOT NULL,
	`name` text NOT NULL,
	`method` text NOT NULL,
	`always_asks` text NOT NULL,
	`may_ignore` text NOT NULL,
	`sections` text NOT NULL,
	`model` text NOT NULL,
	`effort` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`id`, `version`)
);
--> statement-breakpoint
CREATE TABLE `answers` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`advisor_id` text NOT NULL,
	`advisor_version` integer NOT NULL,
	`text` text,
	`status` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`content` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `council_seats` (
	`council_id` text NOT NULL,
	`advisor_id` text NOT NULL,
	`advisor_version` integer NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`council_id`, `advisor_id`)
);
--> statement-breakpoint
CREATE TABLE `councils` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rankings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`reviewer_advisor_id` text NOT NULL,
	`answer_id` text NOT NULL,
	`label` text NOT NULL,
	`rank` integer NOT NULL,
	`points` integer NOT NULL,
	`correctness` integer NOT NULL,
	`reasoning_quality` integer NOT NULL,
	`usefulness` integer NOT NULL,
	`risks_covered` integer NOT NULL,
	`reasoning` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`question` text NOT NULL,
	`council_id` text NOT NULL,
	`brief_id` text,
	`brief_content` text,
	`brief_updated_at` integer,
	`mode` text NOT NULL,
	`effective_mode` text NOT NULL,
	`state` text NOT NULL,
	`error` text,
	`winner_answer_id` text,
	`margin_fraction` real,
	`close_race` integer,
	`total_cost_usd` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` text NOT NULL,
	`stage` text NOT NULL,
	`advisor_id` text,
	`model` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cache_read_tokens` integer NOT NULL,
	`cache_write_tokens` integer NOT NULL,
	`cost_usd` real NOT NULL,
	`stop_reason` text,
	`fell_back` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verdicts` (
	`session_id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`chairman_advisor_id` text NOT NULL,
	`mode` text NOT NULL
);
