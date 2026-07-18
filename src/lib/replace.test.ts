import { describe, expect, it } from "vitest";
import { findMatches, replaceAllInHtml, replaceMatchAtOffset, replaceMatchInHtml } from "./replace";

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

  // NC3 regression: the old loop re-scanned from the top after each
  // replacement, so a replacement containing the query re-matched inside its
  // own output forever. The single-pass engine terminates on old coordinates.
  it("terminates when the replacement contains the query", () => {
    const { html, replaced } = replaceAllInHtml("<p>他说他累了</p>", "他", "他们", false);
    expect(html).toBe("<p>他们说他们累了</p>");
    expect(replaced).toBe(2);
  });

  it("replaceAll re-parses the DOM once even with many matches", () => {
    const src = `<p>${"a".repeat(1)}${"x".repeat(200)}</p>`;
    const { replaced } = replaceAllInHtml(src, "x", "yz", false);
    expect(replaced).toBe(200);
  });

  // NC4: offset-targeted replacement validates the text under the offset.
  it("replaceMatchAtOffset replaces exactly at the offset", () => {
    const { html, replaced } = replaceMatchAtOffset(
      "<p>夜阑人静，夜阑更深。</p>",
      "夜阑",
      "夜深",
      5,
      false,
    );
    expect(replaced).toBe(1);
    expect(html).toBe("<p>夜阑人静，夜深更深。</p>");
  });

  it("replaceMatchAtOffset reports stale when the offset no longer holds the query", () => {
    const result = replaceMatchAtOffset("<p>夜阑人静。</p>", "夜阑", "夜深", 3, false);
    expect(result.stale).toBe(true);
    expect(result.replaced).toBe(0);
    expect(result.html).toBe("<p>夜阑人静。</p>");
  });

  it("replaceMatchAtOffset skips matches spanning inline tags", () => {
    const { replaced, skipped } = replaceMatchAtOffset(
      "<p>铁<strong>血</strong>丹心</p>",
      "铁血",
      "铮铮",
      0,
      false,
    );
    expect(replaced).toBe(0);
    expect(skipped).toBe(1);
  });
});
