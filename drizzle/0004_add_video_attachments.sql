CREATE TABLE attachments_with_video (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES life_events(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('photo','audio','video')),
  blob_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO attachments_with_video (id, event_id, kind, blob_key, mime_type, file_name, created_at)
SELECT id, event_id, kind, blob_key, mime_type, file_name, created_at FROM attachments;
--> statement-breakpoint
DROP TABLE attachments;
--> statement-breakpoint
ALTER TABLE attachments_with_video RENAME TO attachments;
--> statement-breakpoint
CREATE INDEX idx_attachments_event ON attachments(event_id);
