import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile, isTauri, getDefaultExportDirectory } from "./storage";
import { sanitizeFileName } from "./utils";
import type { AppSettings, Chapter, Project, Volume } from "../types";

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "canvas",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "noscript",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tfoot",
  "ul",
  "video",
]);

const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strike",
  "strong",
  "u",
  "ul",
]);

const REMOVE_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "textarea",
  "button",
  "select",
  "option",
]);

// Attribute blocklist applied to every allowed tag. INVARIANT: adding a tag
// to ALLOWED_TAGS re-exposes its URL-bearing attributes (href/src/action/…)
// to isSafeUrl below — audit that function before extending either list.
const BLOCKED_ATTRS = new Set(["style"]);

// URL schemes allowed to survive sanitization. The exported HTML leaves the
// app's CSP sandbox and opens in the user's real browser, so anything
// scriptable (javascript:, data:text/html, vbscript:…) must be dropped.
// Parsing with new URL() (after stripping whitespace/control chars, which
// browsers silently ignore inside schemes) catches the classic bypasses:
// "java\tscript:", " java script :", HTML-entity-encoded variants.
const ALLOWED_SCHEMES = new Set(["http:", "https:", "mailto:"]);

function isSafeUrl(value: string): boolean {
  // Strip whitespace AND control chars — browsers ignore them inside
  // schemes ("java\tscript:" executes), so the check must too.
  const stripped = value.replace(/[\s\-]+/g, "");
  try {
    const url = new URL(stripped, "https://invalid.invalid/");
    return ALLOWED_SCHEMES.has(url.protocol);
  } catch {
    return false;
  }
}

export function sanitizeHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  function clean(node: Node): Node | null {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.cloneNode();
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (REMOVE_TAGS.has(tag)) {
      return null;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      const fragment = doc.createDocumentFragment();
      Array.from(el.childNodes).forEach((child) => {
        const cleaned = clean(child);
        if (cleaned) fragment.appendChild(cleaned);
      });
      return fragment;
    }

    const newEl = doc.createElement(tag);
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value;

      if (BLOCKED_ATTRS.has(name)) return;
      if (name.startsWith("on")) return;
      if ((name === "href" || name === "src") && !isSafeUrl(value)) return;

      newEl.setAttribute(name, value);
    });

    Array.from(el.childNodes).forEach((child) => {
      const cleaned = clean(child);
      if (cleaned) newEl.appendChild(cleaned);
    });

    return newEl;
  }

  const fragment = doc.createDocumentFragment();
  Array.from(doc.body.childNodes).forEach((child) => {
    const cleaned = clean(child);
    if (cleaned) fragment.appendChild(cleaned);
  });

  const wrapper = doc.createElement("div");
  wrapper.appendChild(fragment);
  return wrapper.innerHTML;
}

async function getExportDefaultPath(defaultName: string, config: AppSettings): Promise<string> {
  const dir = await getDefaultExportDirectory(config);
  return `${dir.replace(/\/+$/, "").replace(/\\+$/, "")}/${defaultName}`;
}

async function pickSavePath(
  defaultName: string,
  filters: { name: string; extensions: string[] }[],
  config: AppSettings,
) {
  if (!isTauri()) {
    return { canceled: false as const, path: defaultName, fallback: true as const };
  }
  const defaultPath = await getExportDefaultPath(defaultName, config);
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

export function stripHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || "";
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === "br") {
      return "\n";
    }

    let text = "";
    Array.from(el.childNodes).forEach((child) => {
      text += walk(child);
    });

    if (BLOCK_TAGS.has(tag)) {
      text += "\n";
    }

    return text;
  }

  return walk(doc.body)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeMarkdown(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/#/g, "\\#")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function exportChapter(
  project: Project,
  chapter: Chapter,
  getChapterContent: (id: string) => Promise<string>,
  format: "md" | "txt",
  config: AppSettings,
) {
  const defaultName = `${sanitizeFileName(project.name)}-${sanitizeFileName(chapter.title)}.${format}`;
  const { canceled, path, fallback } = await pickSavePath(
    defaultName,
    [{ name: format === "md" ? "Markdown" : "Text", extensions: [format] }],
    config,
  );
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
  config: AppSettings,
  format: "html" | "txt" | "md" = "html",
) {
  const defaultName = `${sanitizeFileName(project.name)}.${format}`;
  const filterName = format === "html" ? "HTML" : format === "md" ? "Markdown" : "Text";
  const { canceled, path, fallback } = await pickSavePath(
    defaultName,
    [{ name: filterName, extensions: [format] }],
    config,
  );
  if (canceled || !path) return { canceled: true };

  let content: string;
  if (format === "html") {
    content = await buildProjectHtml(project, volumes, chapters, getChapterContent);
  } else {
    content = await buildProjectPlain(project, volumes, chapters, getChapterContent, format);
  }

  if (fallback) {
    const mime = format === "html" ? "text/html" : format === "md" ? "text/markdown" : "text/plain";
    downloadFile(defaultName, content, mime);
    return { canceled: false, path: defaultName };
  }

  await writeTextFile(path, content);
  return { canceled: false, path };
}

/** Sorts chapters the same way the tree and HTML export do: volume order,
 *  then chapter order within each volume. */
function sortChaptersForExport(
  volumes: Volume[],
  chapters: Chapter[],
): { sorted: Chapter[]; volumeMap: Map<string, Volume> } {
  const volumeMap = new Map(volumes.map((v) => [v.id, v]));
  const sorted = [...chapters].sort((a, b) => {
    // Chapters without a volume sort AFTER all volumes, matching the
    // chapter tree's "未分类章节" section at the bottom.
    const va = volumeMap.get(a.parentId || "")?.order ?? Number.MAX_SAFE_INTEGER;
    const vb = volumeMap.get(b.parentId || "")?.order ?? Number.MAX_SAFE_INTEGER;
    if (va !== vb) return va - vb;
    return a.order - b.order;
  });
  return { sorted, volumeMap };
}

// Whole-book plain-text / Markdown export. Chapters are grouped under their
// volume headings (Markdown only — TXT uses a simple separator line), with
// the same ordering as the HTML export.
async function buildProjectPlain(
  project: Project,
  volumes: Volume[],
  chapters: Chapter[],
  getChapterContent: (id: string) => Promise<string>,
  format: "txt" | "md",
): Promise<string> {
  const { sorted, volumeMap } = sortChaptersForExport(volumes, chapters);

  const header: string[] = [];
  if (format === "md") {
    header.push(`# ${escapeMarkdown(project.name)}`);
    if (project.author) header.push(`\n> 作者：${escapeMarkdown(project.author)}`);
  } else {
    header.push(project.name);
    if (project.author) header.push(`作者：${project.author}`);
  }

  const parts: string[] = [];
  let lastVolumeId: string | null | undefined = undefined;
  for (const chapter of sorted) {
    const volumeId = chapter.parentId ?? null;
    if (volumeId !== lastVolumeId) {
      lastVolumeId = volumeId;
      const volume = volumeId ? volumeMap.get(volumeId) : null;
      if (volume) {
        parts.push(format === "md" ? `\n## ${escapeMarkdown(volume.title)}\n` : `\n【${volume.title}】\n`);
      }
    }
    const text = stripHtml(await getChapterContent(chapter.id));
    if (format === "md") {
      parts.push(`\n### ${escapeMarkdown(chapter.title)}\n\n${text}\n`);
    } else {
      parts.push(`\n${chapter.title}\n\n${text}\n`);
    }
  }

  return header.join("\n") + "\n" + parts.join("\n");
}

function buildChapterMarkdown(chapter: Chapter, html: string): string {
  const text = stripHtml(html);
  return `# ${escapeMarkdown(chapter.title)}\n\n${text}\n`;
}

async function buildProjectHtml(
  project: Project,
  volumes: Volume[],
  chapters: Chapter[],
  getChapterContent: (id: string) => Promise<string>,
): Promise<string> {
  const { sorted: sortedChapters, volumeMap } = sortChaptersForExport(volumes, chapters);

  const chapterContents = await Promise.all(
    sortedChapters.map(async (c) => {
      const volume = c.parentId ? volumeMap.get(c.parentId) : null;
      const html = sanitizeHtml(await getChapterContent(c.id));
      return `
        <section class="chapter">
          <h2>${escapeHtml(c.title)}</h2>
          ${volume ? `<p class="volume">${escapeHtml(volume.title)}</p>` : ""}
          ${html}
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
