ALTER TABLE people ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX idx_people_is_demo ON people(is_demo);
