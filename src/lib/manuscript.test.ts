import { describe, expect, it } from "vitest";
import {
  buildBlocks,
  chineseNumber,
  formatHeading,
  renderMarkdown,
  romanNumber,
  selectBuildDocuments,
  DEFAULT_BUILD_SETTINGS,
} from "./manuscript";
import type { ProjectIndex } from "./tags";
import type { Chapter, Volume } from "../types";

const vol: Volume = { id: "v1", projectId: "p1", title: "小说", order: 0, createdAt: 1, updatedAt: 1, rootKind: "novel" };
const emptyIndex: ProjectIndex = { tags: new Map(), docs: new Map() };

function ch(id: string, title: string, opts?: Partial<Chapter>): Chapter {
  return {
    id, projectId: "p1", parentId: "v1", title, summary: "", order: 0, status: "draft",
    wordCount: 0, tags: [], notes: "", createdAt: 1, updatedAt: 1, kind: "novel", ...opts,
  };
}

describe("chineseNumber / romanNumber", () => {
  it("formats Chinese numerals", () => {
    expect(chineseNumber(1)).toBe("一");
    expect(chineseNumber(10)).toBe("十");
    expect(chineseNumber(11)).toBe("十一");
    expect(chineseNumber(23)).toBe("二十三");
    expect(chineseNumber(105)).toBe("一百零五");
    expect(chineseNumber(312)).toBe("三百一十二");
  });
  it("formats Roman numerals", () => {
    expect(romanNumber(4)).toBe("IV");
    expect(romanNumber(9)).toBe("IX");
    expect(romanNumber(2026)).toBe("MMXXVI");
  });
});

describe("formatHeading", () => {
  const ctx = { chapterNum: 3, sceneNum: 2, sceneAbs: 7, tagsIndex: emptyIndex };
  it("replaces title and number codes", () => {
    expect(formatHeading("第{Chapter}章 {Title}", "雨夜", ctx)).toBe("第3章 雨夜");
    expect(formatHeading("第{Chapter:Word}章", "", ctx)).toBe("第三章");
    expect(formatHeading("{Chapter}.{Scene} {Title}", "告别", ctx)).toBe("3.2 告别");
    expect(formatHeading("场景 {Scene:Abs}", "", ctx)).toBe("场景 7");
  });
});

describe("selectBuildDocuments", () => {
  it("excludes inactive by default and honours explicit include", () => {
    const chapters = [ch("a", "A"), ch("b", "B", { inactive: true }), ch("c", "C")];
    const sel = selectBuildDocuments(chapters, [vol], DEFAULT_BUILD_SETTINGS);
    expect(sel.map((c) => c.id)).toEqual(["a", "c"]);
    const sel2 = selectBuildDocuments(chapters, [vol], { ...DEFAULT_BUILD_SETTINGS, includeDocs: ["b"] });
    expect(sel2.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
  it("honours explicit exclude and root switches", () => {
    const chapters = [ch("a", "A"), ch("b", "B")];
    const sel = selectBuildDocuments(chapters, [vol], { ...DEFAULT_BUILD_SETTINGS, excludeDocs: ["a"] });
    expect(sel.map((c) => c.id)).toEqual(["b"]);
    const none = selectBuildDocuments(chapters, [vol], { ...DEFAULT_BUILD_SETTINGS, includeRoots: { novel: false } });
    expect(none).toEqual([]);
  });
});

describe("buildBlocks", () => {
  it("numbers chapters, resets scenes per chapter, and formats static separators", () => {
    const docs = [
      { chapter: ch("a", "A"), html: "<h2>第一章</h2><p>甲</p><h3>场景一</h3><p>A1</p><h3>场景二</h3><p>A2</p>" },
      { chapter: ch("b", "B"), html: "<h2>第二章</h2><h3>场景一</h3><p>B1</p>" },
    ];
    const settings = { ...DEFAULT_BUILD_SETTINGS, fmtChapter: "第{Chapter}章 {Title}", fmtScene: "{Chapter}.{Scene}" };
    const blocks = buildBlocks(docs, [vol], settings, emptyIndex);
    const heads = blocks.filter((b) => b.kind === "chapter" || b.kind === "scene").map((b) => b.text);
    expect(heads).toEqual(["第1章 第一章", "1.1", "1.2", "第2章 第二章", "2.1"]);
  });
  it("emits static separator only between scenes", () => {
    const docs = [
      { chapter: ch("a", "A"), html: "<h2>第一章</h2><h3>一</h3><p>A1</p><h3>二</h3><p>A2</p>" },
    ];
    const settings = { ...DEFAULT_BUILD_SETTINGS, fmtScene: "* * *" };
    const blocks = buildBlocks(docs, [vol], settings, emptyIndex);
    const seps = blocks.filter((b) => b.kind === "separator");
    expect(seps).toHaveLength(1);
    expect(seps[0].text).toBe("* * *");
  });
  it("resets scene numbering and suppresses leading separators per document", () => {
    const docs = [
      { chapter: ch("a", "A"), html: "<h3>一</h3><p>A1</p><h3>二</h3><p>A2</p>" },
      { chapter: ch("b", "B"), html: "<h3>一</h3><p>B1</p>" },
    ];
    const numbered = buildBlocks(docs, [vol], { ...DEFAULT_BUILD_SETTINGS, fmtScene: "场景{Scene}" }, emptyIndex);
    expect(numbered.filter((b) => b.kind === "scene").map((b) => b.text)).toEqual(["场景1", "场景2", "场景1"]);

    const separated = buildBlocks(docs, [vol], { ...DEFAULT_BUILD_SETTINGS, fmtScene: "* * *" }, emptyIndex);
    expect(separated.filter((b) => b.kind === "separator")).toHaveLength(1);
  });
  it("renders markdown with promoted headings", () => {
    const docs = [{ chapter: ch("a", "A"), html: "<h2>第一章</h2><p>正文</p>" }];
    const blocks = buildBlocks(docs, [vol], DEFAULT_BUILD_SETTINGS, emptyIndex);
    const md = renderMarkdown(blocks);
    expect(md).toContain("## 第1章 第一章");
    expect(md).toContain("正文");
  });
});
