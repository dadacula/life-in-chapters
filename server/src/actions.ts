import { defineAction, z, type ActionsModule } from "@hatch/space-sdk";
import { asc, desc, eq, inArray } from "drizzle-orm";
import * as schema from "./schema";

const significance = z.enum(["美好", "不美好", "里程碑", "转折", "日常"]);
const upload = z.object({
  kind: z.enum(["photo", "audio", "video"]),
  dataBase64: z.string().min(1).max(50_000_000),
  mimeType: z.string().min(1).max(100),
  fileName: z.string().max(200).default(""),
});
const personShape = z.object({ id: z.number(), name: z.string(), relationship: z.string(), birthDate: z.string().nullable(), bio: z.string(), isDemo: z.boolean(), eventCount: z.number() });
const chapterShape = z.object({ id: z.number(), personId: z.number(), title: z.string(), sortOrder: z.number() });
const attachmentShape = z.object({ id: z.number(), eventId: z.number(), kind: z.enum(["photo", "audio", "video"]), mimeType: z.string(), fileName: z.string(), url: z.string() });
const playbackResponse = z.object({ url: z.string(), mimeType: z.string(), kind: z.enum(["photo", "audio", "video"]) });
const preparedDownloadResponse = z.object({ url: z.string(), size: z.number().int().nonnegative() });
const eventShape = z.object({
  id: z.number(), personId: z.number(), chapterId: z.number().nullable(), title: z.string(), dateValue: z.string(), dateMode: z.enum(["exact", "year"]),
  location: z.string(), significance, body: z.string(), customTags: z.array(z.string()), relatedPersonIds: z.array(z.number()), attachments: z.array(attachmentShape), createdAt: z.string(), updatedAt: z.string(),
});
const archiveResponse = z.object({ people: z.array(personShape), chapters: z.array(chapterShape), events: z.array(eventShape) });
const demoSeedResponse = z.object({ ok: z.literal(true), added: z.boolean(), peopleAdded: z.number(), eventsAdded: z.number() });
const demoClearResponse = z.object({ ok: z.literal(true), peopleRemoved: z.number(), eventsRemoved: z.number() });
const demoMediaResponse = z.object({ ok: z.literal(true), added: z.number(), skipped: z.number() });

type DemoEvent = {
  person: "self" | "father";
  chapter: string;
  title: string;
  dateValue: string;
  dateMode: "exact" | "year";
  location: string;
  significance: "美好" | "不美好" | "里程碑" | "转折" | "日常";
  body: string;
  customTags: string[];
  relatedTo?: "self" | "father";
};

function parseTags(value: string): string[] {
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
}

function canonicalMimeType(item: z.infer<typeof upload>): string {
  const base = item.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (item.kind === "photo") return ["image/jpeg", "image/png", "image/webp"].includes(base) ? base : "image/jpeg";
  if (item.kind === "video") {
    if (base === "video/quicktime") return "video/quicktime";
    if (base === "video/webm") return "video/webm";
    return "video/mp4";
  }
  if (base === "audio/mpeg" || base === "audio/ogg" || base === "audio/wav" || base === "audio/webm") return base;
  return "audio/mp4";
}

function uploadExtension(item: z.infer<typeof upload>): string {
  const mimeType = canonicalMimeType(item);
  if (item.kind === "photo") return mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  if (item.kind === "video") return mimeType === "video/quicktime" ? "mov" : mimeType === "video/webm" ? "webm" : "mp4";
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "audio/wav") return "wav";
  if (mimeType === "audio/webm") return "webm";
  return "m4a";
}

function isValidEventDate(value: string, mode: "exact" | "year"): boolean {
  if (mode === "year") return /^\d{4}$/.test(value) && Number(value) >= 1000 && Number(value) <= 9999;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return year >= 1000 && year <= 9999 && parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export const Actions = {
  getArchive: defineAction({
    request: z.object({}), response: archiveResponse,
    async handler(ctx): Promise<z.infer<typeof archiveResponse>> {
      const db = ctx.db<typeof schema>();
      const [peopleRows, chapterRows, eventRows, relationRows, attachmentRows] = await Promise.all([
        db.select().from(schema.people).orderBy(asc(schema.people.createdAt)),
        db.select().from(schema.chapters).orderBy(asc(schema.chapters.sortOrder), asc(schema.chapters.id)),
        db.select().from(schema.events).orderBy(desc(schema.events.dateValue), desc(schema.events.id)),
        db.select().from(schema.eventPeople),
        db.select().from(schema.attachments).orderBy(asc(schema.attachments.id)),
      ]);
      const attachmentsWithUrls = await Promise.all(attachmentRows.map(async (item) => ({
        id: item.id, eventId: item.eventId, kind: item.kind, mimeType: item.mimeType, fileName: item.fileName,
        url: await ctx.blobs.getUrl(item.blobKey, { expiresInSeconds: 3600 }),
      })));
      return {
        people: peopleRows.map((person) => ({ ...person, eventCount: eventRows.filter((event) => event.personId === person.id).length })),
        chapters: chapterRows.map((chapter) => ({ id: chapter.id, personId: chapter.personId, title: chapter.title, sortOrder: chapter.sortOrder })),
        events: eventRows.map((event) => ({
          id: event.id, personId: event.personId, chapterId: event.chapterId, title: event.title, dateValue: event.dateValue, dateMode: event.dateMode,
          location: event.location, significance: event.significance, body: event.body, customTags: parseTags(event.customTags),
          relatedPersonIds: relationRows.filter((row) => row.eventId === event.id).map((row) => row.personId),
          attachments: attachmentsWithUrls.filter((item) => item.eventId === event.id),
          createdAt: event.createdAt.toISOString(), updatedAt: event.updatedAt.toISOString(),
        })),
      };
    },
  }),

  getAttachmentPlayback: defineAction({
    request: z.object({ id: z.number().int().positive() }), response: playbackResponse,
    async handler(ctx, args): Promise<z.infer<typeof playbackResponse>> {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.attachments).where(eq(schema.attachments.id, args.id)).limit(1);
      const item = rows[0];
      if (!item) throw new Error("这段媒体已经不存在");
      const fallback = item.kind === "photo" ? "image/jpeg" : item.kind === "audio" ? "audio/mp4" : "video/mp4";
      return { url: await ctx.blobs.getUrl(item.blobKey, { expiresInSeconds: 900 }), mimeType: item.mimeType.split(";")[0]?.trim() || fallback, kind: item.kind };
    },
  }),

  prepareDownload: defineAction({
    request: z.object({ kind: z.enum(["archive", "book"]), personId: z.number().int().positive().optional(), dataBase64: z.string().min(1).max(90_000_000) }),
    response: preparedDownloadResponse,
    async handler(ctx, args): Promise<z.infer<typeof preparedDownloadResponse>> {
      const db = ctx.db<typeof schema>();
      if (args.kind === "book") {
        if (!args.personId) throw new Error("请选择要导出的人物");
        const peopleRows = await db.select({ id: schema.people.id }).from(schema.people).where(eq(schema.people.id, args.personId)).limit(1);
        if (!peopleRows[0]) throw new Error("这位人物已经不存在");
      }
      const bytes = Buffer.from(args.dataBase64, "base64");
      if (bytes.byteLength === 0 || bytes.byteLength > 67_000_000) throw new Error("导出文件过大，请先减少单条视频数量");
      const extension = args.kind === "book" ? "html" : "json";
      const contentType = args.kind === "book" ? "text/html; charset=utf-8" : "application/json; charset=utf-8";
      const key = args.kind === "book" ? `exports/book-${args.personId}.${extension}` : `exports/archive.${extension}`;
      await ctx.blobs.put(key, bytes, { contentType });
      return { url: await ctx.blobs.getUrl(key, { expiresInSeconds: 1800 }), size: bytes.byteLength };
    },
  }),

  seedMockData: defineAction({
    request: z.object({}), response: demoSeedResponse,
    async handler(ctx): Promise<z.infer<typeof demoSeedResponse>> {
      const db = ctx.db<typeof schema>();
      const existing = await db.select({ id: schema.people.id }).from(schema.people).where(eq(schema.people.isDemo, true)).limit(1);
      if (existing.length > 0) return { ok: true, added: false, peopleAdded: 0, eventsAdded: 0 };

      const now = new Date();
      const selfRows = await db.insert(schema.people).values({
        name: "林默", relationship: "自己", birthDate: "1989-06-18", bio: "虚构示例人物 · 喜欢把重要的日子写下来。", isDemo: true, updatedAt: now,
      }).returning({ id: schema.people.id });
      const fatherRows = await db.insert(schema.people).values({
        name: "林建国", relationship: "父亲", birthDate: "1961-02-03", bio: "虚构示例人物 · 木匠退休后开始四处旅行。", isDemo: true, updatedAt: now,
      }).returning({ id: schema.people.id });
      const self = selfRows[0]; const father = fatherRows[0];
      if (!self || !father) throw new Error("示例人物未能创建，请重试");

      const chapterTitles = {
        self: ["童年", "求学", "启程", "成家", "成为父亲"],
        father: ["少年", "求学", "立业", "家庭", "远方"],
      } as const;
      const chapterRows = await db.insert(schema.chapters).values([
        ...chapterTitles.self.map((title, sortOrder) => ({ personId: self.id, title, sortOrder })),
        ...chapterTitles.father.map((title, sortOrder) => ({ personId: father.id, title, sortOrder })),
      ]).returning({ id: schema.chapters.id, personId: schema.chapters.personId, title: schema.chapters.title });
      const chapterId = (personId: number, title: string) => chapterRows.find((row) => row.personId === personId && row.title === title)?.id ?? null;

      const demoEvents: DemoEvent[] = [
        { person:"self", chapter:"童年", title:"背着新书包上学", dateValue:"1995-09-01", dateMode:"exact", location:"苏州", significance:"美好", body:"校门口很吵，我却一直记得父亲蹲下来替我系紧鞋带。那天的新书包有一股淡淡的帆布味。", customTags:["第一次","童年"] },
        { person:"self", chapter:"求学", title:"离家去读大学", dateValue:"2007-09-03", dateMode:"exact", location:"南京", significance:"转折", body:"火车开动后才意识到，熟悉的生活真的留在站台上了。害怕和兴奋一起涌上来。", customTags:["离家","大学"] },
        { person:"self", chapter:"启程", title:"第一次独自租下房间", dateValue:"2011-07-15", dateMode:"exact", location:"上海", significance:"里程碑", body:"房间很小，窗外是晾衣杆和梧桐树。拿到钥匙的那一刻，我第一次觉得生活完全交到了自己手里。", customTags:["独立","上海"] },
        { person:"self", chapter:"成家", title:"在海边求婚", dateValue:"2014-05-24", dateMode:"exact", location:"厦门", significance:"美好", body:"没有准备长篇台词，只在退潮后的沙滩上问了一句。她笑着点头，海风把回答吹得很远。", customTags:["爱情","海边"] },
        { person:"self", chapter:"成家", title:"婚礼那天", dateValue:"2015-10-10", dateMode:"exact", location:"苏州", significance:"美好", body:"仪式结束后，父亲悄悄把我叫到一边，只说：好好过日子。那句话比所有祝福都更重。", customTags:["婚礼","家人"], relatedTo:"father" },
        { person:"self", chapter:"成为父亲", title:"女儿出生", dateValue:"2018-09-28", dateMode:"exact", location:"上海", significance:"里程碑", body:"凌晨听见第一声啼哭，我突然明白了什么叫责任，也第一次真正理解父母。", customTags:["新生命","成为父亲"], relatedTo:"father" },
        { person:"self", chapter:"成为父亲", title:"手术后的那个春天", dateValue:"2021-03-12", dateMode:"exact", location:"上海", significance:"不美好", body:"一次并不顺利的住院让我慢了下来。恢复期很长，但也让我学会把健康和陪伴放在工作前面。", customTags:["生病","重新开始"] },
        { person:"self", chapter:"成为父亲", title:"带父亲第一次看海", dateValue:"2024-08-19", dateMode:"exact", location:"青岛", significance:"美好", body:"父亲站在岸边看了很久，说海比电视里大得多。我们没有赶景点，只沿着海边慢慢走。", customTags:["旅行","父子","看海"], relatedTo:"father" },
        { person:"father", chapter:"少年", title:"第一次进城", dateValue:"1968", dateMode:"year", location:"苏州", significance:"日常", body:"跟着祖父坐了很久的车，第一次看到三层高的楼。回家后讲了好几天。", customTags:["童年","第一次"] },
        { person:"father", chapter:"求学", title:"拿到录取通知书", dateValue:"1979-07-08", dateMode:"exact", location:"苏州", significance:"转折", body:"薄薄一张纸，让整个夏天都不一样了。家里把通知书压在玻璃板下保存了很多年。", customTags:["求学","改变"] },
        { person:"father", chapter:"家庭", title:"第一次成为父亲", dateValue:"1989-06-18", dateMode:"exact", location:"苏州", significance:"里程碑", body:"护士把孩子抱出来时，只敢远远看着。后来他说，那一刻手心全是汗。", customTags:["家人","新生命"], relatedTo:"self" },
        { person:"father", chapter:"远方", title:"退休后的第一趟远行", dateValue:"2019-10-02", dateMode:"exact", location:"西安", significance:"美好", body:"终于不用赶着回去上班。清晨一个人沿着城墙走了半圈，拍下许多不太清楚的照片。", customTags:["退休","旅行"] },
      ];

      for (const event of demoEvents) {
        const personId = event.person === "self" ? self.id : father.id;
        const inserted = await db.insert(schema.events).values({
          personId, chapterId: chapterId(personId, event.chapter), title: event.title, dateValue: event.dateValue, dateMode: event.dateMode,
          location: event.location, significance: event.significance, body: event.body, customTags: JSON.stringify(event.customTags), createdAt: now, updatedAt: now,
        }).returning({ id: schema.events.id });
        const row = inserted[0];
        if (row && event.relatedTo) {
          await db.insert(schema.eventPeople).values({ eventId: row.id, personId: event.relatedTo === "self" ? self.id : father.id });
        }
      }
      ctx.invalidateQueries();
      return { ok: true, added: true, peopleAdded: 2, eventsAdded: demoEvents.length };
    },
  }),

  ensureDemoMedia: defineAction({
    request: z.object({}), response: demoMediaResponse,
    async handler(ctx): Promise<z.infer<typeof demoMediaResponse>> {
      const db = ctx.db<typeof schema>();
      const demoPeople = await db.select({ id: schema.people.id }).from(schema.people).where(eq(schema.people.isDemo, true));
      const personIds = demoPeople.map((person) => person.id);
      if (personIds.length === 0) return { ok: true, added: 0, skipped: 0 };
      const demoEvents = await db.select({ id: schema.events.id, title: schema.events.title }).from(schema.events).where(inArray(schema.events.personId, personIds));
      const existing = await db.select({ eventId: schema.attachments.eventId }).from(schema.attachments);
      const eventIdsWithMedia = new Set(existing.map((item) => item.eventId));
      const mediaPlans = [
        { title: "带父亲第一次看海", prompt: "一幅高分辨率写实插画，虚构的成年中国父子背影在青岛海边缓慢散步，初秋傍晚，克制温暖的胶片色调，人物不看镜头，无文字、无标志，横向构图" },
        { title: "在海边求婚", prompt: "一幅高分辨率写实插画，虚构情侣在厦门退潮后的沙滩上求婚，海风和暮色，含蓄温柔的胶片色调，人物不看镜头，无文字、无标志，横向构图" },
        { title: "退休后的第一趟远行", prompt: "一幅高分辨率写实插画，虚构的中国退休木匠清晨独自走在西安古城墙上，秋日薄雾，安静克制的纪实胶片色调，人物不看镜头，无文字、无标志，横向构图" },
      ];
      let added = 0; let skipped = 0;
      for (const plan of mediaPlans) {
        const event = demoEvents.find((item) => item.title === plan.title);
        if (!event || eventIdsWithMedia.has(event.id)) { skipped += 1; continue; }
        const media = await ctx.tool.generate_media(plan.prompt, { orientation: "landscape" });
        await db.insert(schema.attachments).values({ eventId: event.id, kind: "photo", blobKey: media.blobKey, mimeType: media.contentType, fileName: `${plan.title}-示例插图.jpg` });
        eventIdsWithMedia.add(event.id); added += 1;
      }
      ctx.invalidateQueries();
      return { ok: true, added, skipped };
    },
  }),

  clearMockData: defineAction({
    request: z.object({}), response: demoClearResponse,
    async handler(ctx): Promise<z.infer<typeof demoClearResponse>> {
      const db = ctx.db<typeof schema>();
      const demoPeople = await db.select({ id: schema.people.id }).from(schema.people).where(eq(schema.people.isDemo, true));
      const personIds = demoPeople.map((person) => person.id);
      if (personIds.length === 0) return { ok: true, peopleRemoved: 0, eventsRemoved: 0 };
      const demoEvents = await db.select({ id: schema.events.id }).from(schema.events).where(inArray(schema.events.personId, personIds));
      const eventIds = demoEvents.map((event) => event.id);
      if (eventIds.length > 0) {
        const media = await db.select({ blobKey: schema.attachments.blobKey }).from(schema.attachments).where(inArray(schema.attachments.eventId, eventIds));
        await Promise.all(media.map((item) => ctx.blobs.delete(item.blobKey)));
      }
      await db.delete(schema.people).where(inArray(schema.people.id, personIds));
      ctx.invalidateQueries();
      return { ok: true, peopleRemoved: personIds.length, eventsRemoved: eventIds.length };
    },
  }),

  createPerson: defineAction({
    request: z.object({ name: z.string().trim().min(1).max(80), relationship: z.string().trim().min(1).max(40), birthDate: z.string().max(10).nullable(), bio: z.string().max(1000).default("") }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const created = await db.insert(schema.people).values({ ...args, updatedAt: new Date() }).returning({ id: schema.people.id });
      const person = created[0]; if (!person) throw new Error("人物未能保存，请重试");
      const defaults = ["童年", "求学", "立业", "成家", "传承"];
      await db.insert(schema.chapters).values(defaults.map((title, index) => ({ personId: person.id, title, sortOrder: index })));
      ctx.invalidateQueries(); return { id: person.id };
    },
  }),

  updatePerson: defineAction({
    request: z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(80), relationship: z.string().trim().min(1).max(40), birthDate: z.string().max(10).nullable(), bio: z.string().max(1000).default("") }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> { const db = ctx.db<typeof schema>(); await db.update(schema.people).set({ name: args.name, relationship: args.relationship, birthDate: args.birthDate, bio: args.bio, updatedAt: new Date() }).where(eq(schema.people.id, args.id)); ctx.invalidateQueries(); return { ok: true }; },
  }),

  deletePerson: defineAction({
    request: z.object({ id: z.number().int().positive() }), response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>(); const events = await db.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.personId, args.id));
      const allAttachments = await db.select().from(schema.attachments); const doomed = new Set(events.map((event) => event.id));
      await db.delete(schema.people).where(eq(schema.people.id, args.id));
      await Promise.all(allAttachments.filter((item) => doomed.has(item.eventId)).map((item) => ctx.blobs.delete(item.blobKey)));
      ctx.invalidateQueries(); return { ok: true };
    },
  }),

  createChapter: defineAction({
    request: z.object({ personId: z.number().int().positive(), title: z.string().trim().min(1).max(60) }), response: z.object({ id: z.number() }),
    async handler(ctx, args) { const db = ctx.db<typeof schema>(); const existing = await db.select().from(schema.chapters).where(eq(schema.chapters.personId, args.personId)); const result = await db.insert(schema.chapters).values({ ...args, sortOrder: existing.length }).returning({ id: schema.chapters.id }); const row = result[0]; if (!row) throw new Error("章节未能保存，请重试"); ctx.invalidateQueries(); return { id: row.id }; },
  }),

  updateChapter: defineAction({
    request: z.object({ id: z.number().int().positive(), title: z.string().trim().min(1).max(60) }), response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> { const db = ctx.db<typeof schema>(); await db.update(schema.chapters).set({ title: args.title }).where(eq(schema.chapters.id, args.id)); ctx.invalidateQueries(); return { ok: true }; },
  }),

  deleteChapter: defineAction({
    request: z.object({ id: z.number().int().positive() }), response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> { const db = ctx.db<typeof schema>(); await db.delete(schema.chapters).where(eq(schema.chapters.id, args.id)); ctx.invalidateQueries(); return { ok: true }; },
  }),

  reorderChapters: defineAction({
    request: z.object({ orderedIds: z.array(z.number().int().positive()).min(1).max(50) }), response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> { const db = ctx.db<typeof schema>(); for (let index = 0; index < args.orderedIds.length; index += 1) { const id = args.orderedIds[index]; if (id !== undefined) await db.update(schema.chapters).set({ sortOrder: index }).where(eq(schema.chapters.id, id)); } ctx.invalidateQueries(); return { ok: true }; },
  }),

  saveEvent: defineAction({
    request: z.object({
      id: z.number().int().positive().optional(), personId: z.number().int().positive(), chapterId: z.number().int().positive().nullable(), title: z.string().trim().min(1).max(160),
      dateValue: z.string().min(4).max(10), dateMode: z.enum(["exact", "year"]), dateChangeConfirmed: z.boolean().default(false), expectedUpdatedAt: z.string().datetime().optional(), location: z.string().max(160).default(""), significance,
      body: z.string().max(20000).default(""), customTags: z.array(z.string().trim().min(1).max(30)).max(20).default([]), relatedPersonIds: z.array(z.number().int().positive()).max(30).default([]), uploads: z.array(upload).max(12).default([]),
    }), response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>(); const now = new Date(); let eventId = args.id;
      if (!isValidEventDate(args.dateValue, args.dateMode)) throw new Error("日期格式不正确，请重新选择");
      let protectedDateValue = args.dateValue;
      let protectedDateMode = args.dateMode;
      if (eventId) {
        const existingRows = await db.select().from(schema.events).where(eq(schema.events.id, eventId)).limit(1);
        const existing = existingRows[0];
        if (!existing || existing.personId !== args.personId) throw new Error("这段回忆已经不存在");
        if (args.expectedUpdatedAt && existing.updatedAt.toISOString() !== args.expectedUpdatedAt) throw new Error("这段回忆刚刚在别处更新过，请重新打开后再修改");
        const dateChanged = existing.dateValue !== args.dateValue || existing.dateMode !== args.dateMode;
        if (dateChanged && !args.dateChangeConfirmed) {
          protectedDateValue = existing.dateValue;
          protectedDateMode = existing.dateMode;
        }
      }
      const values = { personId: args.personId, chapterId: args.chapterId, title: args.title, dateValue: protectedDateValue, dateMode: protectedDateMode, location: args.location, significance: args.significance, body: args.body, customTags: JSON.stringify(args.customTags), updatedAt: now };
      if (eventId) { await db.update(schema.events).set(values).where(eq(schema.events.id, eventId)); await db.delete(schema.eventPeople).where(eq(schema.eventPeople.eventId, eventId)); }
      else { const inserted = await db.insert(schema.events).values({ ...values, createdAt: now }).returning({ id: schema.events.id }); const row = inserted[0]; if (!row) throw new Error("大事记未能保存，请重试"); eventId = row.id; }
      if (args.relatedPersonIds.length) await db.insert(schema.eventPeople).values(args.relatedPersonIds.map((personId) => ({ eventId, personId })));
      for (const item of args.uploads) {
        const extension = uploadExtension(item);
        const key = `events/${eventId}/${crypto.randomUUID()}.${extension}`;
        const mimeType = canonicalMimeType(item);
        await ctx.blobs.put(key, Buffer.from(item.dataBase64, "base64"), { contentType: mimeType });
        await db.insert(schema.attachments).values({ eventId, kind: item.kind, blobKey: key, mimeType, fileName: item.fileName });
      }
      ctx.invalidateQueries(); return { id: eventId };
    },
  }),

  deleteAttachment: defineAction({
    request: z.object({ id: z.number().int().positive() }), response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> { const db = ctx.db<typeof schema>(); const rows = await db.select().from(schema.attachments).where(eq(schema.attachments.id, args.id)); const row = rows[0]; if (row) { await db.delete(schema.attachments).where(eq(schema.attachments.id, args.id)); await ctx.blobs.delete(row.blobKey); } ctx.invalidateQueries(); return { ok: true }; },
  }),

  deleteEvent: defineAction({
    request: z.object({ id: z.number().int().positive() }), response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> { const db = ctx.db<typeof schema>(); const rows = await db.select().from(schema.attachments).where(eq(schema.attachments.eventId, args.id)); await db.delete(schema.events).where(eq(schema.events.id, args.id)); await Promise.all(rows.map((item) => ctx.blobs.delete(item.blobKey))); ctx.invalidateQueries(); return { ok: true }; },
  }),

  quickCapture: defineAction({
    request: z.object({ personId: z.number().int().positive(), title: z.string().min(1).max(80), dateValue: z.string().min(10).max(10), body: z.string().max(20000).default(""), upload: upload.optional() }), response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      if (!isValidEventDate(args.dateValue, "exact")) throw new Error("日期格式不正确，请重新选择");
      const db = ctx.db<typeof schema>(); const chapters = await db.select().from(schema.chapters).where(eq(schema.chapters.personId, args.personId)).orderBy(asc(schema.chapters.sortOrder)).limit(1);
      const inserted = await db.insert(schema.events).values({ personId: args.personId, chapterId: chapters[0]?.id ?? null, title: args.title, dateValue: args.dateValue, dateMode: "exact", significance: "日常", body: args.body, customTags: "[]", updatedAt: new Date() }).returning({ id: schema.events.id });
      const event = inserted[0]; if (!event) throw new Error("记录未能保存，请重试");
      if (args.upload) {
        const extension = uploadExtension(args.upload); const key = `events/${event.id}/${crypto.randomUUID()}.${extension}`;
        const mimeType = canonicalMimeType(args.upload);
        await ctx.blobs.put(key, Buffer.from(args.upload.dataBase64, "base64"), { contentType: mimeType });
        await db.insert(schema.attachments).values({ eventId: event.id, kind: args.upload.kind, blobKey: key, mimeType, fileName: args.upload.fileName });
      }
      ctx.invalidateQueries(); return { id: event.id };
    },
  }),
} satisfies ActionsModule;

export type Actions = typeof Actions;
