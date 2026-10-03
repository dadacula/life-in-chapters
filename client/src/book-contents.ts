export type BookChapter = { id: number; title: string };
export type BookEventRef = { chapterId: number | null };

export type BookContentsEntry = {
  key: string;
  label: string;
  title: string;
  count: number;
  chapterId: number | null;
};

export function bookContentsEntries(chapters: BookChapter[], events: BookEventRef[]): BookContentsEntry[] {
  const entries: BookContentsEntry[] = chapters.map((chapter, index) => ({
    key: `chapter-${chapter.id}`,
    label: String(index + 1).padStart(2, "0"),
    title: chapter.title,
    count: events.filter((event) => event.chapterId === chapter.id).length,
    chapterId: chapter.id,
  }));
  const unfiled = events.filter((event) => event.chapterId === null).length;
  if (unfiled > 0) {
    entries.push({ key: "unfiled", label: "—", title: "未归档", count: unfiled, chapterId: null });
  }
  return entries;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
}

export function bookContentsHtml(chapters: BookChapter[], events: BookEventRef[]): string {
  return bookContentsEntries(chapters, events).map((item) => `<li><span>${escapeHtml(item.label)}</span><b>${escapeHtml(item.title)}</b><i></i><small>${item.count} 篇</small></li>`).join("");
}
