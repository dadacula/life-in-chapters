import { resolve } from "node:path";
import { createLocalContext } from "@hatch/space-sdk";
import { Actions } from "./actions";

const root = resolve(import.meta.dir, "../..");
const ctx = createLocalContext({
  databasePath: resolve(root, "app.db"),
  blobDir: resolve(root, "blobs"),
  migrationsDir: resolve(root, "drizzle"),
});

const seeded = await Actions.seedMockData.handler(ctx, {});
const media = await Actions.ensureDemoMedia.handler(ctx, {});
if (!seeded.added && media.added === 0) {
  console.log("示例人生已经在 app.db 里。");
} else {
  console.log(`示例人生已写入 app.db（人物 ${seeded.peopleAdded}，大事 ${seeded.eventsAdded}，照片 ${media.added}）。`);
}
