import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createLocalContext, type ActionContext } from "@hatch/space-sdk";
import { Actions } from "./actions";
import { placeholderPhoto, type DemoArt } from "./demo-photos";

const migrationsDir = resolve(import.meta.dir, "../../drizzle");

function localContext(root: string): ActionContext {
  return createLocalContext({
    databasePath: join(root, "app.db"),
    blobDir: join(root, "blobs"),
    migrationsDir,
  });
}

describe("示例照片", () => {
  test("placeholder drawings are valid captioned images", () => {
    const captions: Record<DemoArt, string> = {
      "qingdao-sea": "青岛",
      "xiamen-proposal": "厦门",
      "xian-wall": "西安",
    };
    for (const art of Object.keys(captions) as DemoArt[]) {
      const photo = placeholderPhoto(art);
      const svg = new TextDecoder("utf-8", { fatal: true }).decode(photo.bytes);
      expect(photo.contentType).toBe("image/svg+xml");
      expect(svg).toContain(`data-scene="${art}"`);
      expect(svg).toContain(captions[art]);
      expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    }
  });

  test("uses generate_media when image generation is available", async () => {
    const root = mkdtempSync(join(tmpdir(), "life-generated-"));
    const ctx = localContext(root);
    try {
      await Actions.seedMockData.handler(ctx, {});
      const calls: string[] = [];
      const generating: ActionContext = {
        ...ctx,
        tool: {
          async generate_media(prompt) {
            calls.push(prompt);
            const blobKey = `generated/demo-${calls.length}.jpg`;
            await ctx.blobs.put(blobKey, Buffer.from(`jpeg-${calls.length}`), { contentType: "image/jpeg" });
            return { blobKey, contentType: "image/jpeg" };
          },
        },
      };
      const media = await Actions.ensureDemoMedia.handler(generating, {});
      expect(media.added).toBe(3);
      expect(calls).toHaveLength(3);
      expect(calls[0]).toContain("青岛");

      const archive = await Actions.getArchive.handler(ctx, {});
      const photo = archive.events.find((event) => event.title === "带父亲第一次看海")?.attachments[0];
      expect(photo?.mimeType).toBe("image/jpeg");
      expect(photo?.fileName).toBe("带父亲第一次看海-示例插图.jpg");
      expect(photo?.url).toBe(`data:image/jpeg;base64,${Buffer.from("jpeg-1").toString("base64")}`);
      const names = readdirSync(join(root, "blobs"), { recursive: true }).map(String);
      expect(names.some((name) => name.endsWith(".svg"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("does not hide a real image-generation failure behind placeholders", async () => {
    const root = mkdtempSync(join(tmpdir(), "life-generated-fail-"));
    const ctx = localContext(root);
    try {
      await Actions.seedMockData.handler(ctx, {});
      const failing: ActionContext = {
        ...ctx,
        tool: {
          async generate_media() {
            throw new Error("图像生成配额已用完");
          },
        },
      };
      await expect(Actions.ensureDemoMedia.handler(failing, {})).rejects.toThrow("示例照片没有生成，请重试。");
      const archive = await Actions.getArchive.handler(ctx, {});
      expect(archive.people.map((person) => person.name).sort()).toEqual(["林建国", "林默"]);
      expect(archive.events.every((event) => event.attachments.length === 0)).toBe(true);
      const names = readdirSync(join(root, "blobs"), { recursive: true }).map(String);
      expect(names.some((name) => name.endsWith(".svg") || name.endsWith(".jpg") || name.endsWith(".png"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
