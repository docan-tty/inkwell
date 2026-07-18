import { describe, expect, it } from "vitest";
import { findMatches, replaceAllInHtml, replaceMatchInHtml } from "./replace";

describe("replace engine", () => {
  it("finds matches case-insensitively by default", () => {
    const hits = findMatches("Alpha alpha ALPHA", "alpha", false);
    expect(hits).toHaveLength(3);
    expect(hits[0]).toEqual({ index: 0, length: 5 });
  });

  it("respects case-sensitive search", () => {
    expect(findMatches("Alpha alpha", "alpha", true)).toHaveLength(1);
    expect(findMatches("Alpha alpha", "alpha", true)[0].index).toBe(6);
  });

  it("replaces the targeted match inside a text node", () => {
    const { html, replaced, skipped } = replaceMatchInHtml(
      "<p>夜阑卧听风吹雨，铁马冰河入梦来。夜阑人静。</p>",
      "夜阑",
      "夜深",
      1,
      false,
    );
    expect(replaced).toBe(1);
    expect(skipped).toBe(0);
    expect(html).toBe("<p>夜阑卧听风吹雨，铁马冰河入梦来。夜深人静。</p>");
  });

  it("never replaces inside tags or attributes", () => {
    const { html, replaced } = replaceAllInHtml(
      '<p class="alpha">alpha</p>',
      "alpha",
      "beta",
      false,
    );
    expect(replaced).toBe(1);
    expect(html).toBe('<p class="alpha">beta</p>');
  });

  it("skips matches that span across inline tags", () => {
    // 「铁血」被 <strong> 截断：纯文本里能搜到，但无法安全替换。
    const { html, replaced, skipped } = replaceAllInHtml(
      "<p>铁<strong>血</strong>丹心</p>",
      "铁血",
      "铮铮",
      false,
    );
    expect(replaced).toBe(0);
    expect(skipped).toBe(1);
    expect(html).toBe("<p>铁<strong>血</strong>丹心</p>");
  });

  it("replaces across paragraphs one by one (ordinal targeting)", () => {
    const src = "<p>第一章风起</p><p>第二章风停</p>";
    const first = replaceMatchInHtml(src, "风", "云", 0, false);
    expect(first.html).toBe("<p>第一章云起</p><p>第二章风停</p>");
    const second = replaceMatchInHtml(src, "风", "云", 1, false);
    expect(second.html).toBe("<p>第一章风起</p><p>第二章云停</p>");
  });

  it("replaceAll replaces every replaceable match and stops", () => {
    const { html, replaced, skipped } = replaceAllInHtml(
      "<p>aaaa</p><p>aa</p>",
      "aa",
      "b",
      false,
    );
    expect(html).toBe("<p>bb</p><p>b</p>");
    expect(replaced).toBe(3);
    expect(skipped).toBe(0);
  });

  it("handles empty content and empty query safely", () => {
    expect(replaceAllInHtml("", "x", "y", false).replaced).toBe(0);
    expect(findMatches("abc", "", false)).toHaveLength(0);
  });

  it("replacement may be longer/shorter than the match", () => {
    const { html } = replaceAllInHtml("<p>小猫钓鱼</p>", "猫", "咪和狗", false);
    expect(html).toBe("<p>小咪和狗钓鱼</p>");
  });
});
