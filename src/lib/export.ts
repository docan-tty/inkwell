import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile, isTauri, getDefaultExportDirectory } from "./storage";
import { useAppStore } from "../store";
import type { Chapter, Project, Volume } from "../types";

async function getExportDefaultPath(defaultName: string): Promise<string> {
  const dir = await getDefaultExportDirectory(useAppStore.getState().appSettings);
  return `${dir.replace(/\/+$/, "").replace(/\\+$/, "")}/${defaultName}`;
}

async function pickSavePath(defaultName: string, filters: { name: string; extensions: string[] }[]) {
  if (!isTauri()) {
    return { canceled: false as const, path: defaultName, fallback: true as const };
  }
  const defaultPath = await getExportDefaultPath(defaultName);
  const path = await save({ defaultPath, filters });
  if (!path) return { canceled: true as const, path: undefined, fallback: false as const };
  return { canceled: false as const, path, fallback: false as const };
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

export type ExportFormat = "chapter-md" | "chapter-txt" | "project-html";

export interface ExportPayload {
  project: Project;
  volumes: Volume[];
  chapters: Chapter[];
  getChapterContent: (chapterId: string) => Promise<string>;
}

export async function exportDocument(payload: ExportPayload, format: ExportFormat) {
  const { project, volumes, chapters, getChapterContent } = payload;

  const defaultName =
    format === "project-html"
      ? `${sanitize(project.name)}.html`
      : `${sanitize(project.name)}-章节.md`;

  const filters =
    format === "project-html"
      ? [{ name: "HTML", extensions: ["html"] }]
      : format === "chapter-txt"
        ? [{ name: "Text", extensions: ["txt"] }]
        : [{ name: "Markdown", extensions: ["md"] }];

  const defaultPath = await getExportDefaultPath(defaultName);
  const path = await save({
    defaultPath,
    filters,
  });

  if (!path) return { canceled: true };

  let content = "";

  if (format === "chapter-md") {
    const chapter = chapters.find((c) => c.wordCount >= 0); // placeholder; caller passes selected chapter
    if (!chapter) throw new Error("No chapter to export");
    content = buildChapterMarkdown(chapter, await getChapterContent(chapter.id));
  } else if (format === "chapter-txt") {
    const chapter = chapters.find((c) => c.wordCount >= 0);
    if (!chapter) throw new Error("No chapter to export");
    content = stripHtml(await getChapterContent(chapter.id));
  } else {
    content = await buildProjectHtml(project, volumes, chapters, getChapterContent);
  }

  await writeTextFile(path, content);
  return { canceled: false, path };
}

export async function exportChapter(
  project: Project,
  chapter: Chapter,
  getChapterContent: (id: string) => Promise<string>,
  format: "md" | "txt",
) {
  const defaultName = `${sanitize(project.name)}-${sanitize(chapter.title)}.${format}`;
  const { canceled, path, fallback } = await pickSavePath(defaultName, [
    { name: format === "md" ? "Markdown" : "Text", extensions: [format] },
  ]);
  if (canceled || !path) return { canceled: true };

  const content =
    format === "md"
      ? buildChapterMarkdown(chapter, await getChapterContent(chapter.id))
      : stripHtml(await getChapterContent(chapter.id));

  if (fallback) {
    downloadFile(defaultName, content, format === "md" ? "text/markdown" : "text/plain");
    return { canceled: false, path: defaultName };
  }

  await writeTextFile(path, content);
  return { canceled: false, path };
}

export async function exportProject(
  project: Project,
  volumes: Volume[],
  chapters: Chapter[],
  getChapterContent: (id: string) => Promise<string>,
) {
  const defaultName = `${sanitize(project.name)}.html`;
  const { canceled, path, fallback } = await pickSavePath(defaultName, [{ name: "HTML", extensions: ["html"] }]);
  if (canceled || !path) return { canceled: true };

  const content = await buildProjectHtml(project, volumes, chapters, getChapterContent);

  if (fallback) {
    downloadFile(defaultName, content, "text/html");
    return { canceled: false, path: defaultName };
  }

  await writeTextFile(path, content);
  return { canceled: false, path };
}

function buildChapterMarkdown(chapter: Chapter, html: string): string {
  const text = stripHtml(html);
  return `# ${chapter.title}\n\n${text}\n`;
}

async function buildProjectHtml(
  project: Project,
  volumes: Volume[],
  chapters: Chapter[],
  getChapterContent: (id: string) => Promise<string>,
): Promise<string> {
  const volumeMap = new Map(volumes.map((v) => [v.id, v]));
  const sortedChapters = [...chapters].sort((a, b) => {
    const va = volumeMap.get(a.parentId || "")?.order ?? -1;
    const vb = volumeMap.get(b.parentId || "")?.order ?? -1;
    if (va !== vb) return va - vb;
    return a.order - b.order;
  });

  const chapterContents = await Promise.all(
    sortedChapters.map(async (c) => {
      const volume = c.parentId ? volumeMap.get(c.parentId) : null;
      return `
        <section class="chapter">
          <h2>${escapeHtml(c.title)}</h2>
          ${volume ? `<p class="volume">${escapeHtml(volume.title)}</p>` : ""}
          ${await getChapterContent(c.id)}
        </section>
      `;
    }),
  );

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(project.name)}</title>
  <style>
    body { font-family: "Noto Serif SC", serif; max-width: 720px; margin: 0 auto; padding: 40px 20px; line-height: 1.8; color: #1a1a1a; }
    h1 { text-align: center; }
    h2 { margin-top: 2em; border-bottom: 1px solid #e8e4de; padding-bottom: 0.3em; }
    .volume { color: #6b6b6b; font-size: 0.9em; margin-top: -0.8em; }
    p { margin: 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(project.name)}</h1>
  ${project.author ? `<p style="text-align:center;text-indent:0;color:#6b6b6b">作者：${escapeHtml(project.author)}</p>` : ""}
  ${chapterContents.join("\n")}
</body>
</html>`;
}

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").trim() || "untitled";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
