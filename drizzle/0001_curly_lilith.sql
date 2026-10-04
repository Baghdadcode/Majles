ALTER TABLE `answers` ADD `label` text;--> statement-breakpoint
ALTER TABLE `rankings` ADD `reviewer_label` text DEFAULT '' NOT NULL;