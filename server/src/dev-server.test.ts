import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startLocalServer, type RunningServer } from "./dev-server";

const migrationsDir = resolve(import.meta.dir, "../../drizzle");

function isAddrInUse(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EADDRINUSE";
}

async function post(base: string, action: string, args: unknown): Promise<Response> {
  return fetch(`${base}actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, args }),
  });
}

describe("本地档案服务", () => {
  test("creates a person and an event, then reads them back from SQLite and blobs", async () => {
    const root = mkdtempSync(join(tmpdir(), "life-local-"));
    const clientDir = join(root, "client");
    const blobDir = join(root, "blobs");
    mkdirSync(clientDir);
    writeFileSync(join(clientDir, "index.html"), "<!doctype html><title>一生 · 人生大事记</title>");
    const server = startLocalServer({
      port: 0,
      databasePath: join(root, "app.db"),
      blobDir,
      migrationsDir,
      clientDir,
    });
    const base = `http://127.0.0.1:${server.port}/`;
    try {
      const page = await fetch(base);
      expect(page.status).toBe(200);
      expect(page.headers.get("content-type") ?? "").toContain("text/html");
      expect(await page.text()).toContain("一生 · 人生大事记");

      const escaped = await fetch(`${base}..%2f..%2fpackage.json`);
      expect(escaped.status).toBe(404);

      const created = await post(base, "createPerson", {
        name: "周晚",
        relationship: "自己",
        birthDate: null,
        bio: "本地试写",
      });
      expect(created.status).toBe(200);
      const person = await created.json() as { id: number };
      expect(person.id).toBeGreaterThan(0);

      const saved = await post(base, "saveEvent", {
        personId: person.id,
        chapterId: null,
        title: "第一次在本机记下",
        dateValue: "2024-05-01",
        dateMode: "exact",
        dateChangeConfirmed: true,
        location: "家里",
        significance: "日常",
        body: "这句话要能再读出来。",
        customTags: ["本地"],
        relatedPersonIds: [],
        uploads: [{ kind: "photo", dataBase64: "aGVsbG8=", mimeType: "image/jpeg", fileName: "note.jpg" }],
        removeAttachmentIds: [],
      });
      expect(saved.status).toBe(200);
      const event = await saved.json() as { id: number };
      expect(event.id).toBeGreaterThan(0);

      const archiveResponse = await post(base, "getArchive", {});
      expect(archiveResponse.status).toBe(200);
      const archive = await archiveResponse.json() as {
        people: Array<{ id: number; name: string; relationship: string }>;
        events: Array<{ id: number; personId: number; title: string; body: string; location: string; attachments: Array<{ url: string; fileName: string }> }>;
      };
      expect(archive.people.map((item) => item.name)).toContain("周晚");
      const stored = archive.events.find((item) => item.id === event.id);
      expect(stored?.personId).toBe(person.id);
      expect(stored?.title).toBe("第一次在本机记下");
      expect(stored?.body).toBe("这句话要能再读出来。");
      expect(stored?.location).toBe("家里");
      expect(stored?.attachments[0]?.fileName).toBe("note.jpg");
      expect(stored?.attachments[0]?.url).toBe("data:image/jpeg;base64,aGVsbG8=");
      expect(statSync(join(root, "app.db")).isFile()).toBe(true);
      const blobNames = readdirSync(blobDir, { recursive: true }).map(String);
      expect(blobNames.some((name) => name.endsWith(".jpg"))).toBe(true);
      expect(blobNames.some((name) => name.endsWith(".meta.json"))).toBe(true);
    } finally {
      server.stop();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("keeps image generation as a Hatch error", async () => {
    const root = mkdtempSync(join(tmpdir(), "life-demo-"));
    const server = startLocalServer({
      port: 0,
      databasePath: join(root, "app.db"),
      blobDir: join(root, "blobs"),
      migrationsDir,
      clientDir: join(root, "missing-client"),
    });
    const base = `http://127.0.0.1:${server.port}/`;
    try {
      const seeded = await post(base, "seedMockData", {});
      expect(seeded.status).toBe(200);
      const media = await post(base, "ensureDemoMedia", {});
      expect(media.ok).toBe(false);
      expect(await media.text()).toBe("示例照片需要 Hatch 的 generate_media。这个环境没有图像生成。");
      const names = readdirSync(join(root, "blobs"), { recursive: true }).map(String);
      expect(names.some((name) => name.endsWith(".jpg") || name.endsWith(".png"))).toBe(false);
    } finally {
      server.stop();
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("uses the next free port when the preferred port is taken", async () => {
    let blocker: ReturnType<typeof Bun.serve> | null = null;
    let preferred = 0;
    for (let port = 39100; port < 39200; port += 1) {
      try {
        blocker = Bun.serve({
          hostname: "127.0.0.1",
          port,
          fetch() {
            return new Response("busy");
          },
        });
        preferred = port;
        break;
      } catch (error) {
        if (!isAddrInUse(error)) throw error;
      }
    }
    expect(blocker).not.toBeNull();
    const root = mkdtempSync(join(tmpdir(), "life-port-"));
    let server: RunningServer | null = null;
    try {
      server = startLocalServer({
        port: preferred,
        databasePath: join(root, "app.db"),
        blobDir: join(root, "blobs"),
        migrationsDir,
        clientDir: join(root, "client"),
      });
      expect(server.port).toBeGreaterThan(preferred);
      const response = await fetch(`http://127.0.0.1:${server.port}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "getArchive", args: {} }),
      });
      expect(response.status).toBe(200);
      const archive = await response.json() as { people: unknown[] };
      expect(archive.people).toEqual([]);
    } finally {
      server?.stop();
      blocker?.stop(true);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
