import { describe, expect, it } from "vitest";
import { splitByHeadings, mergeDocuments, previewSplit } from "./docops";

describe("splitByHeadings", () => {
  it("splits at the requested level keeping lower content with its heading", () => {
    const html = "<h2>第一章</h2><p>开头</p><h3>场景1</h3><p>场景一内容</p><h3>场景2</h3><p>场景二内容</p><h2>第二章</h2><p>第二章内容</p>";
    const pieces = splitByHeadings(html, 2);
    expect(pieces.map((p) => p.title)).toEqual(["第一章", "第二章"]);
    expect(pieces[0].html).toContain("场景一内容");
    expect(pieces[0].html).toContain("场景二内容");
    expect(pieces[1].html).toContain("第二章内容");
  });

  it("splits scenes within a chapter at level 3", () => {
    const html = "<h2>第一章</h2><h3>场景1</h3><p>A</p><h3>场景2</h3><p>B</p>";
    const pieces = splitByHeadings(html, 3);
    expect(pieces.map((p) => p.title)).toEqual(["场景1", "场景2"]);
  });

  it("keeps pre-heading content as an unnamed piece", () => {
    const html = "<p>题记</p><h2>第一章</h2><p>内容</p>";
    const pieces = splitByHeadings(html, 2);
    expect(pieces[0].title).toBe("（前言）");
    expect(pieces[1].title).toBe("第一章");
  });

  it("returns empty when no heading at the level exists", () => {
    expect(splitByHeadings("<p>没有标题</p>", 2)).toEqual([]);
  });
});

describe("mergeDocuments / previewSplit", () => {
  it("merges with a blank paragraph separator", () => {
    const merged = mergeDocuments(["<p>A</p>", "<p>B</p>"]);
    expect(merged).toContain("<p>A</p>");
    expect(merged).toContain("<p>B</p>");
    expect(merged.indexOf("<p>A</p>")).toBeLessThan(merged.indexOf("<p>B</p>"));
  });

  it("previews split titles", () => {
    const html = "<h2>第一章</h2><p>x</p><h2>第二章</h2><p>y</p>";
    expect(previewSplit(html, 2).map((p) => p.title)).toEqual(["第一章", "第二章"]);
  });
});
