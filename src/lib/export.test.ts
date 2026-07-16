import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { sanitizeHtml, stripHtml, exportProject } from "./export";
import type { Chapter, Project, Volume } from "../types";

describe("sanitizeHtml", () => {
  it("removes script tags", () => {
    const input = `<p>Hello</p><script>alert('xss')</script><p>World</p>`;
    expect(sanitizeHtml(input)).not.toContain("<script");
    expect(sanitizeHtml(input)).toContain("Hello");
    expect(sanitizeHtml(input)).toContain("World");
  });

  it("removes event handlers", () => {
    const input = `<p onclick="alert('xss')">Hello</p>`;
    expect(sanitizeHtml(input)).not.toContain("onclick");
  });

  it("removes javascript: links", () => {
    const input = `<a href="javascript:alert('xss')">link</a>`;
    const out = sanitizeHtml(input);
    expect(out).toContain("<a>link</a>");
  });

  it("keeps safe formatting tags", () => {
    const input = `<h1>Title</h1><p><strong>Bold</strong> and <em>italic</em></p>`;
    const out = sanitizeHtml(input);
    expect(out).toContain("<h1>Title</h1>");
    expect(out).toContain("<strong>Bold</strong>");
    expect(out).toContain("<em>italic</em>");
  });
});

describe("stripHtml", () => {
  it("converts paragraphs to line breaks", () => {
    expect(stripHtml("<p>First</p><p>Second</p>")).toBe("First\nSecond");
  });

  it("converts headings and list items to line breaks", () => {
    expect(stripHtml("<h1>Title</h1><p>Text</p>")).toBe("Title\nText");
  });

  it("decodes html entities", () => {
    expect(stripHtml("<p>Hello&amp;World</p>")).toContain("Hello&World");
  });

  it("returns empty string for empty input", () => {
    expect(stripHtml("")).toBe("");
  });
});

describe("exportProject (txt/md, browser fallback)", () => {
  const project: Project = {
    id: "p1",
    name: "测试作品",
    author: "作者甲",
    genre: "",
    description: "",
    targetWords: 4000,
    createdAt: 1,
    updatedAt: 1,
  };
  const volumes: Volume[] = [
    { id: "v1", projectId: "p1", title: "第一卷", order: 0, createdAt: 1, updatedAt: 1 },
  ];
  const chapters: Chapter[] = [
    {
      id: "c2",
      projectId: "p1",
      parentId: "v1",
      title: "第二章",
      summary: "",
      order: 1,
      status: "draft",
      wordCount: 0,
      tags: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "c1",
      projectId: "p1",
      parentId: "v1",
      title: "第一章",
      summary: "",
      order: 0,
      status: "draft",
      wordCount: 0,
      tags: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  const contents: Record<string, string> = {
    c1: "<p>第一章正文。</p>",
    c2: "<p>第二章正文。</p>",
  };
  const getChapterContent = async (id: string) => contents[id] ?? "";

  const settings = {
    theme: "light" as const,
    recentProjects: [],
    editorTypography: { fontSize: 18, lineHeight: 1.85, paragraphSpacing: 0.8 },
    editorPadding: 64,
    includePunctuationInWordCount: true,
    defaultChapterTargetWords: 4000,
  };

  // Browser-fallback exports are delivered as a Blob download. Intercept
  // createObjectURL to capture the exported content for assertions.
  let captured = "";
  const flush = () => new Promise((r) => setTimeout(r, 0));
  beforeEach(() => {
    captured = "";
    localStorage.clear();
    vi.spyOn(URL, "createObjectURL").mockImplementation((obj: Blob | MediaSource) => {
      void (obj as Blob).text().then((t) => {
        captured = t;
      });
      return "blob:mock";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports the whole book as ordered plain text", async () => {
    const result = await exportProject(project, volumes, chapters, getChapterContent, settings, "txt");
    expect(result.canceled).toBe(false);
    await flush();
    // Volume heading present, chapters in tree order (c1 before c2).
    expect(captured).toContain("【第一卷】");
    expect(captured.indexOf("第一章正文")).toBeLessThan(captured.indexOf("第二章正文"));
    // No HTML tags leak into the plain-text export.
    expect(captured).not.toContain("<p>");
  });

  it("exports the whole book as Markdown with headings", async () => {
    const result = await exportProject(project, volumes, chapters, getChapterContent, settings, "md");
    expect(result.canceled).toBe(false);
    await flush();
    expect(captured).toContain("# 测试作品");
    expect(captured).toContain("## 第一卷");
    expect(captured).toContain("### 第一章");
    expect(captured).toContain("作者：作者甲");
  });
});
