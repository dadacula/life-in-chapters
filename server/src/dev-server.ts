import { existsSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { createLocalContext, type ActionContext } from "@hatch/space-sdk";
import { Actions } from "./actions";

export interface LocalServerOptions {
  /** First port to try. `0` asks the operating system for a free port. */
  port?: number;
  databasePath?: string;
  blobDir?: string;
  migrationsDir?: string;
  clientDir?: string;
}

export interface RunningServer {
  port: number;
  stop(): void;
}

function text(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function isAddrInUse(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EADDRINUSE";
}

function clientFile(clientDir: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const root = resolve(clientDir);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  if (relative.length === 0) return null;
  const file = resolve(root, relative);
  if (file !== root && !file.startsWith(`${root}${sep}`)) return null;
  return file;
}

function serveClient(clientDir: string, pathname: string): Response {
  const file = clientFile(clientDir, pathname);
  if (!file || !existsSync(file)) return text("找不到这个页面。", 404);
  let info: ReturnType<typeof statSync>;
  try {
    info = statSync(file);
  } catch {
    return text("找不到这个页面。", 404);
  }
  if (!info.isFile()) return text("找不到这个页面。", 404);
  return new Response(Bun.file(file), { headers: { "cache-control": "no-cache" } });
}

async function serveAction(ctx: ActionContext, request: Request): Promise<Response> {
  if (request.method !== "POST") return text("请使用 POST。", 405);
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return text("请求不是有效的 JSON。", 400);
  }
  if (payload === null || typeof payload !== "object") return text("请求格式不正确。", 400);
  const action = "action" in payload ? payload.action : undefined;
  const args = "args" in payload ? payload.args : {};
  if (typeof action !== "string" || !Object.hasOwn(Actions, action)) return text("未知动作。", 404);
  const definition = Actions[action as keyof typeof Actions];
  const parsed = definition.request.safeParse(args ?? {});
  if (!parsed.success) return text("输入不正确。", 400);
  try {
    const result = await definition.handler(ctx, parsed.data as never);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error && error.message.length > 0 ? error.message : "动作没有完成";
    return text(message, 400);
  }
}

type ListenOptions = {
  fetch: (request: Request) => Response | Promise<Response>;
  idleTimeout: number;
  maxRequestBodySize: number;
};

function bind(hostname: string, port: number, options: ListenOptions): ReturnType<typeof Bun.serve> {
  return Bun.serve({ ...options, hostname, port });
}

function boundPort(server: ReturnType<typeof Bun.serve>): number {
  const port = server.port;
  if (port === undefined) throw new Error("本地端口没有打开。");
  return port;
}

function listen(options: ListenOptions, port: number): { port: number; handles: Array<ReturnType<typeof Bun.serve>> } {
  if (port === 0) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const v4 = bind("127.0.0.1", 0, options);
      const chosen = boundPort(v4);
      try {
        const v6 = bind("::1", chosen, options);
        return { port: chosen, handles: [v4, v6] };
      } catch (error) {
        v4.stop(true);
        if (!isAddrInUse(error)) {
          return { port: chosen, handles: [bind("127.0.0.1", chosen, options)] };
        }
      }
    }
    throw new Error("没有空闲端口。");
  }

  const last = port + 99;
  for (let candidate = port; candidate <= last; candidate += 1) {
    let v4: ReturnType<typeof Bun.serve>;
    try {
      v4 = bind("127.0.0.1", candidate, options);
    } catch (error) {
      if (isAddrInUse(error)) continue;
      throw error;
    }
    try {
      const v6 = bind("::1", candidate, options);
      return { port: candidate, handles: [v4, v6] };
    } catch (error) {
      if (isAddrInUse(error)) {
        v4.stop(true);
        continue;
      }
      return { port: candidate, handles: [v4] };
    }
  }
  throw new Error(`从 ${port} 到 ${last} 都没有空闲端口。`);
}

/** Serves the built client and `POST /actions` against a local SQLite archive. */
export function startLocalServer(options: LocalServerOptions = {}): RunningServer {
  const ctx = createLocalContext({
    databasePath: options.databasePath,
    blobDir: options.blobDir,
    migrationsDir: options.migrationsDir,
  });
  const clientDir = resolve(options.clientDir ?? "client/dist");
  let queue: Promise<void> = Promise.resolve();
  const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
    const run = queue.then(work, work);
    queue = run.then(() => undefined, () => undefined);
    return run;
  };
  const fetch = (request: Request): Response | Promise<Response> => {
    const { pathname } = new URL(request.url);
    if (pathname === "/actions") return enqueue(() => serveAction(ctx, request));
    if (request.method !== "GET" && request.method !== "HEAD") return text("找不到这个页面。", 404);
    return serveClient(clientDir, pathname);
  };
  const servers = listen({
    fetch,
    idleTimeout: 120,
    maxRequestBodySize: 160 * 1024 * 1024,
  }, options.port ?? 3000);
  return {
    port: servers.port,
    stop() {
      for (const server of servers.handles) server.stop(true);
    },
  };
}
