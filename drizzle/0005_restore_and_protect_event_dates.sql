CREATE TABLE `event_date_history` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `event_id` integer NOT NULL,
  `previous_date_value` text NOT NULL,
  `previous_date_mode` text NOT NULL,
  `new_date_value` text NOT NULL,
  `new_date_mode` text NOT NULL,
  `changed_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (`event_id`) REFERENCES `life_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TRIGGER `life_events_date_history`
AFTER UPDATE OF `date_value`, `date_mode` ON `life_events`
WHEN OLD.`date_value` <> NEW.`date_value` OR OLD.`date_mode` <> NEW.`date_mode`
BEGIN
  INSERT INTO `event_date_history` (`event_id`, `previous_date_value`, `previous_date_mode`, `new_date_value`, `new_date_mode`, `changed_at`)
  VALUES (OLD.`id`, OLD.`date_value`, OLD.`date_mode`, NEW.`date_value`, NEW.`date_mode`, unixepoch() * 1000);
END;
--> statement-breakpoint
UPDATE `life_events`
SET `date_value` = '2021-03-12', `date_mode` = 'exact', `updated_at` = unixepoch() * 1000
WHERE `title` = '手术后的那个春天'
  AND `date_value` = '2021-01-01'
  AND `person_id` IN (SELECT `id` FROM `people` WHERE `is_demo` = 1);
