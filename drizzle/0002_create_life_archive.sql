PRAGMA foreign_keys = ON;
--> statement-breakpoint
CREATE TABLE people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  birth_date TEXT,
  bio TEXT NOT NULL DEFAULT '',
  avatar_blob_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE life_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  date_value TEXT NOT NULL,
  date_mode TEXT NOT NULL DEFAULT 'exact' CHECK(date_mode IN ('exact','year')),
  location TEXT NOT NULL DEFAULT '',
  significance TEXT NOT NULL DEFAULT '里程碑' CHECK(significance IN ('美好','不美好','里程碑','转折','日常')),
  body TEXT NOT NULL DEFAULT '',
  custom_tags TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE event_people (
  event_id INTEGER NOT NULL REFERENCES life_events(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  PRIMARY KEY(event_id, person_id)
);
--> statement-breakpoint
CREATE TABLE attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES life_events(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('photo','audio')),
  blob_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_chapters_person ON chapters(person_id, sort_order);
--> statement-breakpoint
CREATE INDEX idx_events_person_date ON life_events(person_id, date_value DESC);
--> statement-breakpoint
CREATE INDEX idx_attachments_event ON attachments(event_id);
--> statement-breakpoint
DROP TABLE entries;
