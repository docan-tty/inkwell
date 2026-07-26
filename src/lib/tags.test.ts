import { describe, expect, it } from "vitest";
import { extractHeadings, htmlToLines, parseDocumentIndex, buildProjectIndex, collectOutline } from "./tags";
import type { Chapter, Volume } from "../types";

const volNovel: Volume = { id: "v1", projectId: "p1", title: "小说", order: 0, createdAt: 1, updatedAt: 1, rootKind: "novel" };
const volChars: Volume = { id: "v2", projectId: "p1", title: "角色", order: 1, createdAt: 1, updatedAt: 1, rootKind: "characters" };

function ch(id: string, parentId: string, title: string, kind?: "novel" | "note"): Chapter {
  return {
    id, projectId: "p1", parentId, title, summary: "", order: 0, status: "draft",
    wordCount: 0, tags: [], notes: "", createdAt: 1, updatedAt: 1, kind,
  };
}

describe("htmlToLines", () => {
  it("splits block tags into lines and strips inline markup", () => {
    const html = "<h2>第一章</h2><p>@pov: <strong>Jane</strong></p><p>正文<strong>粗</strong>体</p>";
    expect(htmlToLines(html)).toEqual(["第一章", "@pov: Jane", "正文粗体"]);
  });
});

describe("extractHeadings", () => {
  it("extracts levels and bang variants", () => {
    const html = "<h1>!</h1><h2>第一章</h2><h3>! 硬场景</h3><p>不是标题</p>";
    expect(extractHeadings(html)).toEqual([
      { level: 1, title: "", bang: true },
      { level: 2, title: "第一章", bang: false },
      { level: 3, title: "硬场景", bang: true },
    ]);
  });
});

describe("parseDocumentIndex", () => {
  it("parses tags, refs and synopsis under headings", () => {
    const html = [
      "<h2>第一章</h2>",
      "<p>@pov: Jane</p>",
      "<h3>场景 1</h3>",
      "<p>@char: John, Sam</p>",
      "<p>@plot: Main</p>",
      "<p>%Synopsis: 开场。</p>",
      "<p>正文。</p>",
    ].join("");
    const idx = parseDocumentIndex("c1", html);
    expect(idx.headings).toHaveLength(2);
    expect(idx.headings[0].refs.pov).toEqual(["Jane"]);
    expect(idx.headings[1].refs.char).toEqual(["John", "Sam"]);
    expect(idx.headings[1].refs.plot).toEqual(["Main"]);
    expect(idx.headings[1].synopsis).toBe("开场。");
  });

  it("parses @tag with optional display name", () => {
    const html = "<h2>Jane Doe</h2><p>@tag: Jane | Jane Doe</p><p>角色卡。</p>";
    const idx = parseDocumentIndex("c2", html);
    expect(idx.headings[0].tag).toBe("Jane");
    expect((idx.headings[0] as { display?: string }).display).toBe("Jane Doe");
  });

  it("keeps metadata under bang headings", () => {
    const html = "<h2>! 第三章</h2><p>@pov: Jane</p><p>%Synopsis: 转折。</p>";
    const idx = parseDocumentIndex("c3", html);
    expect(idx.headings).toHaveLength(1);
    expect(idx.headings[0]).toMatchObject({ level: 2, title: "第三章", bang: true, synopsis: "转折。" });
    expect(idx.headings[0].refs.pov).toEqual(["Jane"]);
  });

  it("does not mistake body text for the next heading with the same text", () => {
    const html = [
      "<h2>第一章</h2>",
      "<p>第二章</p>",
      "<p>@pov: Jane</p>",
      "<h2>第二章</h2>",
      "<p>@pov: John</p>",
    ].join("");
    const idx = parseDocumentIndex("c4", html);
    expect(idx.headings).toHaveLength(2);
    expect(idx.headings[0].refs.pov).toEqual(["Jane"]);
    expect(idx.headings[1].refs.pov).toEqual(["John"]);
  });
});

describe("buildProjectIndex / collectOutline", () => {
  it("indexes tags with their root kind and collects novel outline rows", () => {
    const chapters = [ch("c1", "v1", "第一章", "novel"), ch("c2", "v2", "Jane", "note")];
    const volumes = [volNovel, volChars];
    const idx = buildProjectIndex(
      [
        { chapter: chapters[0], html: "<h2>第一章</h2><p>@pov: jane</p>" },
        { chapter: chapters[1], html: "<h2>Jane</h2><p>@tag: Jane | Jane Doe</p>" },
      ],
      volumes,
    );
    expect(idx.tags.get("jane")).toMatchObject({ tag: "Jane", display: "Jane Doe", rootKind: "characters" });
    const rows = collectOutline(chapters, volumes, idx.docs);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ chapterId: "c1", title: "第一章" });
    expect(rows[0].refs.pov).toEqual(["jane"]);
  });
});
