export async function buildClient(): Promise<void> {
  const result = await Bun.build({
    entrypoints: ["./client/index.html"],
    outdir: "./client/dist",
    target: "browser",
    minify: true,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  if (!result.success) {
    const detail = result.logs.map((log) => log.message).filter((message) => message.length > 0).join("\n");
    throw new Error(detail || "客户端构建失败");
  }
}
