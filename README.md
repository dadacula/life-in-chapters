# 一生 · 人生大事记

一个面向中国家庭的人生大事记 Web 应用。用户可以按人物、章节和时间记录重要经历，并为每条记录保存文字、照片、语音和视频；应用也支持搜索、长辈模式、完整 JSON 导出和人生书 HTML 导出。

## 代码结构

- `client/`：React 19 客户端与移动优先界面
- `server/src/actions.ts`：类型安全的服务端动作
- `server/src/schema.ts`：Drizzle 数据模型
- `drizzle/`：SQLite 迁移
- `vendor/hatch-space-sdk`：本地 SQLite、Blob 与动作客户端
- `space.json`：Muse Web Artifact 配置

## 本地运行

安装 Bun 之后：

```bash
git clone https://github.com/dadacula/life-in-chapters.git
cd life-in-chapters
bun install
bun run dev
```

打开终端打印的地址。默认是 http://localhost:3000。`bun run dev` 会先构建页面，再在本机响应 `./actions`。人物和大事记写在 `app.db`，照片和音视频写在 `blobs/`。本机没有图像生成时，「先看看示例人生」会留下完整示例，并用仓库里的占位插画代替生成照片。

也可以在终端写入同一份示例：

```bash
bun run seed
```

类型和打包：

```bash
bun run typecheck
bun run build
```

## 数据边界

仓库不包含 `app.db`、用户记录、照片、录音、视频、运行时 Blob、审计截图或构建产物。示例人生是源码中明确标注的虚构演示内容，可由用户主动加载或清空。`server/src/demo-photos/` 里是随仓库提交的虚构占位插画，只在没有图像生成时使用。

## 给 Codex 的审查重点

请优先检查：

1. 录音与实时语音转文字在 Safari / Chromium 的兼容性与失败恢复。
2. 照片、音频、视频 Blob 的上传、读取、播放与导出链路。
3. 大体积人生书和 JSON 导出时的内存占用与错误处理。
4. 日期更新的并发保护、审计记录与迁移兼容性。
5. 服务端动作的输入校验、数据归属边界和级联删除行为。
6. 手机端、深色模式、无障碍名称与键盘操作。

## 隐私

不要向仓库提交数据库、运行时 Blob、导出的家庭档案或任何真实个人资料。
