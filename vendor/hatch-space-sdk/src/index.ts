import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { z } from "zod";

export { z };

export interface BlobStore {
  getUrl(key: string, options?: { expiresInSeconds?: number }): Promise<string>;
  put(key: string, data: Uint8Array | ArrayBuffer, options?: { contentType?: string }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ActionContext {
  db<TSchema extends Record<string, unknown>>(): BunSQLiteDatabase<TSchema>;
  blobs: BlobStore;
  tool: {
    generate_media(prompt: string, options?: { orientation?: string }): Promise<{ blobKey: string; contentType: string }>;
  };
  invalidateQueries(): void;
}

export interface ActionDefinition<TReq = unknown, TRes = unknown> {
  request: z.ZodType<TReq>;
  response: z.ZodType<TRes>;
  handler: (ctx: ActionContext, args: TReq) => Promise<TRes>;
}

/** Accepts any concrete action. `args: never` keeps handlers assignable under strict function types. */
export type ActionsModule = Record<string, {
  request: z.ZodType;
  response: z.ZodType;
  handler: (ctx: ActionContext, args: never) => Promise<unknown>;
}>;

export function defineAction<TReq, TRes>(definition: ActionDefinition<TReq, TRes>): ActionDefinition<TReq, TRes> {
  return definition;
}

const generatedMediaError = "示例照片需要 Hatch 的 generate_media。这个环境没有图像生成。";

function blobFile(root: string, key: string): string {
  const parts = key.replaceAll("\\", "/").split("/").filter((part) => part.length > 0);
  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw new Error("媒体路径无效");
  }
  return join(root, ...parts);
}

function applyMigrations(sqlite: Database, migrationsDir: string): void {
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
  if (files.length === 0) throw new Error("找不到数据库迁移，无法在本地打开档案。");
  sqlite.exec("CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)");
  const applied = new Set(sqlite.query("SELECT name FROM _local_migrations").all().map((row) => {
    const name = (row as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }));
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const statements = sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter((statement) => statement.length > 0);
    const run = sqlite.transaction(() => {
      for (const statement of statements) sqlite.exec(statement);
      sqlite.query("INSERT INTO _local_migrations (name) VALUES (?)").run(file);
    });
    run();
  }
}

export interface LocalContextOptions {
  databasePath?: string;
  blobDir?: string;
  migrationsDir?: string;
}

/** Opens this repo's SQLite archive and a local blob directory. Image generation stays a Hatch-only call. */
export function createLocalContext(options: LocalContextOptions = {}): ActionContext {
  const databasePath = resolve(options.databasePath ?? "app.db");
  const blobDir = resolve(options.blobDir ?? "blobs");
  const migrationsDir = resolve(options.migrationsDir ?? "drizzle");
  mkdirSync(dirname(databasePath), { recursive: true });
  mkdirSync(blobDir, { recursive: true });
  const sqlite = new Database(databasePath, { create: true });
  sqlite.exec("PRAGMA foreign_keys = ON");
  applyMigrations(sqlite, migrationsDir);
  const database = drizzle(sqlite);

  return {
    db: <TSchema extends Record<string, unknown>>() => database as unknown as BunSQLiteDatabase<TSchema>,
    blobs: {
      async getUrl(key) {
        const path = blobFile(blobDir, key);
        const bytes = readFileSync(path);
        const metaPath = `${path}.meta.json`;
        let contentType = "application/octet-stream";
        try {
          const parsed: unknown = JSON.parse(readFileSync(metaPath, "utf8"));
          if (parsed && typeof parsed === "object" && "contentType" in parsed && typeof parsed.contentType === "string") {
            contentType = parsed.contentType;
          }
        } catch { /* The bytes are still readable without a stored type. */ }
        return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
      },
      async put(key, data, options) {
        const path = blobFile(blobDir, key);
        mkdirSync(dirname(path), { recursive: true });
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
        writeFileSync(path, bytes);
        writeFileSync(`${path}.meta.json`, JSON.stringify({ contentType: options?.contentType ?? "application/octet-stream" }));
      },
      async delete(key) {
        const path = blobFile(blobDir, key);
        rmSync(path, { force: true });
        rmSync(`${path}.meta.json`, { force: true });
      },
    },
    tool: {
      async generate_media() {
        throw new Error(generatedMediaError);
      },
    },
    invalidateQueries() {},
  };
}
