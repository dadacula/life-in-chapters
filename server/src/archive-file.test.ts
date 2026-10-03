import { describe, expect, test } from "bun:test";
import { archiveFileSchema, archiveLinkError, peopleIdsToReplace, resolveSavedDate } from "./archive-file";

const exportedAt = "2026-10-03T00:00:00.000Z";

function exportShapedArchive() {
  return {
    version: 1 as const,
    exportedAt,
    people: [
      { id: 1, name: "林默", relationship: "自己", birthDate: "1989-06-18", bio: "虚构", isDemo: false, eventCount: 2 },
      { id: 2, name: "林建国", relationship: "父亲", birthDate: null, bio: "", isDemo: true, eventCount: 0 },
    ],
    chapters: [
      { id: 10, personId: 1, title: "成家", sortOrder: 0 },
    ],
    events: [
      {
        id: 100,
        personId: 1,
        chapterId: 10,
        title: "婚礼那天",
        dateValue: "2015-10-10",
        dateMode: "exact" as const,
        location: "苏州",
        significance: "美好" as const,
        body: "好好过日子。",
        customTags: ["婚礼"],
        relatedPersonIds: [2],
        attachments: [{ kind: "photo" as const, mimeType: "image/jpeg", fileName: "婚礼.jpg", dataBase64: "aGVsbG8=" }],
        createdAt: exportedAt,
        updatedAt: exportedAt,
      },
      {
        id: 101,
        personId: 1,
        chapterId: null,
        title: "没有归进章节的一天",
        dateValue: "2024",
        dateMode: "year" as const,
        location: "",
        significance: "日常" as const,
        body: "",
        customTags: [],
        relatedPersonIds: [],
        attachments: [{ kind: "audio" as const, mimeType: "audio/mp4", fileName: "语音.m4a", dataBase64: "aGVsbG8=" }],
        createdAt: exportedAt,
        updatedAt: exportedAt,
      },
    ],
  };
}

describe("archive export shape", () => {
  test("parses the JSON this app writes, including extra archive fields", () => {
    const parsed = archiveFileSchema.safeParse(exportShapedArchive());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.events[1]?.chapterId).toBeNull();
    expect(parsed.data.events[0]?.relatedPersonIds).toEqual([2]);
    expect(parsed.data.events[0]?.attachments[0]?.mimeType).toBe("image/jpeg");
    expect(archiveLinkError(parsed.data)).toBeNull();
  });

  test("rejects a file that is not this export", () => {
    expect(archiveFileSchema.safeParse({ version: 2, people: [], chapters: [], events: [] }).success).toBe(false);
    expect(archiveFileSchema.safeParse({ hello: "world" }).success).toBe(false);
  });

  test("reports a related person that the file does not contain", () => {
    const parsed = archiveFileSchema.parse(exportShapedArchive());
    const event = parsed.events[0];
    if (!event) throw new Error("missing event");
    event.relatedPersonIds = [99];
    expect(archiveLinkError(parsed)).toBe("导入文件里有相关人物无法对应。");
  });
});

describe("saved dates", () => {
  test("persists a confirmed date change", () => {
    const resolved = resolveSavedDate({
      existing: { dateValue: "2021-03-12", dateMode: "exact" },
      dateValue: "2021-04-02",
      dateMode: "exact",
      dateChangeConfirmed: true,
    });
    expect(resolved).toEqual({ ok: true, dateValue: "2021-04-02", dateMode: "exact" });
  });

  test("returns an error instead of success when a date change is not confirmed", () => {
    const resolved = resolveSavedDate({
      existing: { dateValue: "2021-03-12", dateMode: "exact" },
      dateValue: "2021-04-02",
      dateMode: "exact",
      dateChangeConfirmed: false,
    });
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.error).toContain("日期没有保存");
  });

  test("keeps an unchanged date without requiring confirmation", () => {
    expect(resolveSavedDate({
      existing: { dateValue: "1968", dateMode: "year" },
      dateValue: "1968",
      dateMode: "year",
      dateChangeConfirmed: false,
    })).toEqual({ ok: true, dateValue: "1968", dateMode: "year" });
  });

  test("rejects an impossible calendar day", () => {
    const resolved = resolveSavedDate({ existing: null, dateValue: "2021-02-31", dateMode: "exact", dateChangeConfirmed: true });
    expect(resolved.ok).toBe(false);
  });
});

describe("replace selection", () => {
  const people = [
    { id: 1, isDemo: false },
    { id: 2, isDemo: true },
    { id: 3, isDemo: false },
  ];

  test("does not select anyone when replace is not requested", () => {
    expect(peopleIdsToReplace(people, false, [])).toEqual([]);
  });

  test("selects only existing non-demo people that were not just imported", () => {
    expect(peopleIdsToReplace(people, true, [3])).toEqual([1]);
  });
});
