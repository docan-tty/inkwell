import { describe, expect, it } from "vitest";
import { formatHtmlTextNodes } from "./format";

describe("formatHtmlTextNodes", () => {
  it("formats plain paragraph text (punctuation, quotes, spaces)", () => {
    const html = `<p>他说"你好!"  转身走了,价格是 3.5, 约 1,000 元...</p>`;
    const out = formatHtmlTextNodes(html);
    expect(out).toBe(`<p>他说“你好！” 转身走了，价格是 3.5，约 1,000 元……</p>`);
  });

  it("formats headings and list items", () => {
    const html = `<h1>标题:第一章</h1><ul><li>项目;第二条</li></ul>`;
    const out = formatHtmlTextNodes(html);
    expect(out).toBe(`<h1>标题：第一章</h1><ul><li>项目；第二条</li></ul>`);
  });

  it("skips blocks that contain inline formatting (lossless guarantee)", () => {
    const html = `<p>他说<strong>"你好!"</strong>转身</p>`;
    expect(formatHtmlTextNodes(html)).toBe(html);
  });

  it("skips code, links and marked spans", () => {
    const html = `<p><code>let a = 1;</code></p><p><a href="https://x.com">link!</a></p>`;
    expect(formatHtmlTextNodes(html)).toBe(html);
  });

  it("collapses runs of 3+ empty paragraphs into one", () => {
    const html = `<p>一</p><p></p><p></p><p></p><p></p><p>二</p>`;
    expect(formatHtmlTextNodes(html)).toBe(`<p>一</p><p></p><p>二</p>`);
  });

  it("keeps runs of 2 empty paragraphs untouched", () => {
    const html = `<p>一</p><p></p><p></p><p>二</p>`;
    expect(formatHtmlTextNodes(html)).toBe(html);
  });

  it("treats br-only paragraphs as empty", () => {
    const html = `<p>一</p><p><br></p><p><br></p><p><br></p><p>二</p>`;
    expect(formatHtmlTextNodes(html)).toBe(`<p>一</p><p><br></p><p>二</p>`);
  });

  it("returns non-matching HTML unchanged", () => {
    const html = `<p>已经整理好的文本。</p>`;
    expect(formatHtmlTextNodes(html)).toBe(html);
  });
});
