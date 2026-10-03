import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const people = sqliteTable("people", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  relationship: text("relationship").notNull(),
  birthDate: text("birth_date"),
  bio: text("bio").notNull().default(""),
  avatarBlobKey: text("avatar_blob_key"),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const chapters = sqliteTable("chapters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  personId: integer("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const events = sqliteTable("life_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  personId: integer("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  chapterId: integer("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  dateValue: text("date_value").notNull(),
  dateMode: text("date_mode", { enum: ["exact", "year"] }).notNull().default("exact"),
  location: text("location").notNull().default(""),
  significance: text("significance", { enum: ["美好", "不美好", "里程碑", "转折", "日常"] }).notNull().default("里程碑"),
  body: text("body").notNull().default(""),
  customTags: text("custom_tags").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const eventDateHistory = sqliteTable("event_date_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  previousDateValue: text("previous_date_value").notNull(),
  previousDateMode: text("previous_date_mode", { enum: ["exact", "year"] }).notNull(),
  newDateValue: text("new_date_value").notNull(),
  newDateMode: text("new_date_mode", { enum: ["exact", "year"] }).notNull(),
  changedAt: integer("changed_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const eventPeople = sqliteTable("event_people", {
  eventId: integer("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  personId: integer("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
});

export const attachments = sqliteTable("attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["photo", "audio", "video"] }).notNull(),
  blobKey: text("blob_key").notNull(),
  mimeType: text("mime_type").notNull(),
  fileName: text("file_name").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});
