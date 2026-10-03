import { z } from "zod";

const significance = z.enum(["美好", "不美好", "里程碑", "转折", "日常"]);
const dateMode = z.enum(["exact", "year"]);

export const archiveFileSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().max(40).optional(),
  people: z.array(z.object({
    id: z.number().int().positive(),
    name: z.string().trim().min(1).max(80),
    relationship: z.string().trim().min(1).max(40),
    birthDate: z.string().max(10).nullable(),
    bio: z.string().max(1000),
    isDemo: z.boolean(),
    eventCount: z.number().int().nonnegative().optional(),
  })).max(500),
  chapters: z.array(z.object({
    id: z.number().int().positive(),
    personId: z.number().int().positive(),
    title: z.string().trim().min(1).max(60),
    sortOrder: z.number().int().nonnegative().max(10_000),
  })).max(2000),
  events: z.array(z.object({
    id: z.number().int().positive(),
    personId: z.number().int().positive(),
    chapterId: z.number().int().positive().nullable(),
    title: z.string().trim().min(1).max(160),
    dateValue: z.string().min(4).max(10),
    dateMode,
    location: z.string().max(160),
    significance,
    body: z.string().max(20000),
    customTags: z.array(z.string().max(30)).max(40).transform((tags) => tags.map((tag) => tag.trim()).filter(Boolean)),
    relatedPersonIds: z.array(z.number().int().positive()).max(100),
    attachments: z.array(z.object({
      kind: z.enum(["photo", "audio", "video"]),
      mimeType: z.string().min(1).max(100),
      fileName: z.string().max(200),
      dataBase64: z.string().min(1).max(50_000_000),
    })).max(100),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })).max(5000),
});

export type ArchiveFile = z.infer<typeof archiveFileSchema>;

export function isValidEventDate(value: string, mode: "exact" | "year"): boolean {
  if (mode === "year") return /^\d{4}$/.test(value) && Number(value) >= 1000 && Number(value) <= 9999;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return year >= 1000 && year <= 9999 && parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function resolveSavedDate(input: {
  existing: { dateValue: string; dateMode: "exact" | "year" } | null;
  dateValue: string;
  dateMode: "exact" | "year";
  dateChangeConfirmed: boolean;
}): { ok: true; dateValue: string; dateMode: "exact" | "year" } | { ok: false; error: string } {
  if (!isValidEventDate(input.dateValue, input.dateMode)) return { ok: false, error: "日期格式不正确，请重新选择" };
  if (input.existing) {
    const changed = input.existing.dateValue !== input.dateValue || input.existing.dateMode !== input.dateMode;
    if (changed && !input.dateChangeConfirmed) return { ok: false, error: "日期没有保存。请确认新的日期后再试一次。" };
  }
  return { ok: true, dateValue: input.dateValue, dateMode: input.dateMode };
}

export function archiveLinkError(file: ArchiveFile): string | null {
  const people = new Set<number>();
  for (const person of file.people) {
    if (people.has(person.id)) return "导入文件里有重复的人物。";
    people.add(person.id);
  }
  const chapters = new Map<number, number>();
  for (const chapter of file.chapters) {
    if (chapters.has(chapter.id)) return "导入文件里有重复的章节。";
    if (!people.has(chapter.personId)) return "导入文件里有章节找不到对应人物。";
    chapters.set(chapter.id, chapter.personId);
  }
  const events = new Set<number>();
  for (const event of file.events) {
    if (events.has(event.id)) return "导入文件里有重复的大事记。";
    events.add(event.id);
    if (!isValidEventDate(event.dateValue, event.dateMode)) return "导入文件里有无法识别的日期。";
    if (!people.has(event.personId)) return "导入文件里有大事记找不到对应人物。";
    if (event.chapterId != null) {
      const owner = chapters.get(event.chapterId);
      if (owner == null) return "导入文件里有大事记找不到对应章节。";
      if (owner !== event.personId) return "导入文件里有大事记的章节不属于这位人物。";
    }
    for (const relatedId of event.relatedPersonIds) {
      if (relatedId === event.personId) continue;
      if (!people.has(relatedId)) return "导入文件里有相关人物无法对应。";
    }
  }
  return null;
}

export function peopleIdsToReplace(people: { id: number; isDemo: boolean }[], replaceExisting: boolean, importedIds: readonly number[]): number[] {
  if (!replaceExisting) return [];
  const imported = new Set(importedIds);
  return people.filter((person) => !person.isDemo && !imported.has(person.id)).map((person) => person.id);
}
