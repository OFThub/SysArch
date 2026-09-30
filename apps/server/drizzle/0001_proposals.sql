CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source` text NOT NULL,
	`summary` text NOT NULL,
	`ops` text NOT NULL,
	`new_issues` text NOT NULL,
	`base_revision` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `proposals_project_idx` ON `proposals` (`project_id`);