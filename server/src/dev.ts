import { resolve } from "node:path";
import { buildClient } from "@hatch/space-sdk/build";
import { startLocalServer } from "./dev-server";

const root = resolve(import.meta.dir, "../..");
process.chdir(root);

console.log("正在构建客户端…");
await buildClient();

const preferredPort = 3000;
const server = startLocalServer({
  port: preferredPort,
  clientDir: resolve(root, "client/dist"),
  databasePath: resolve(root, "app.db"),
  blobDir: resolve(root, "blobs"),
  migrationsDir: resolve(root, "drizzle"),
});

const url = `http://localhost:${server.port}`;
if (server.port !== preferredPort) {
  console.log(`${preferredPort} 已被占用，已改用下一个空闲端口。`);
}
console.log(`\n${url}\n`);
