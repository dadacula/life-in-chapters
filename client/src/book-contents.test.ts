import { describe, expect, test } from "bun:test";
import { bookContentsEntries, bookContentsHtml } from "./book-contents";

const chapters = [
  { id: 1, title: "童年" },
  { id: 2, title: "成家" },
];

describe("人生书目录", () => {
  test("includes 未归档 when the preview would show those events", () => {
    const events = [
      { chapterId: 2 },
      { chapterId: 2 },
      { chapterId: null },
    ];
    const entries = bookContentsEntries(chapters, events);
    expect(entries.map((entry) => entry.title)).toEqual(["童年", "成家", "未归档"]);
    expect(entries.find((entry) => entry.chapterId === null)?.count).toBe(1);
    expect(entries.find((entry) => entry.chapterId === 2)?.count).toBe(2);
    const html = bookContentsHtml(chapters, events);
    expect(html).toContain("未归档");
    expect(html).toContain(">1 篇<");
  });

  test("omits 未归档 when every event belongs to a chapter", () => {
    const entries = bookContentsEntries(chapters, [{ chapterId: 1 }]);
    expect(entries.some((entry) => entry.title === "未归档")).toBe(false);
    expect(bookContentsHtml(chapters, [{ chapterId: 1 }])).not.toContain("未归档");
  });

  test("escapes chapter titles in the exported markup", () => {
    const html = bookContentsHtml([{ id: 1, title: "A<B>&" }], []);
    expect(html).toContain("A&lt;B&gt;&amp;");
    expect(html).not.toContain("<b>A<B>");
  });
});
