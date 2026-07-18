import { describe, expect, it } from "vitest";
import { countWords, formatPlainText, sanitizeFileName } from "./utils";

describe("countWords", () => {
  it("counts Chinese characters including punctuation by default", () => {
    expect(countWords("你好，世界！")).toBe(6);
  });

  it("excludes punctuation when configured", () => {
    expect(countWords("你好，世界！", false)).toBe(4);
  });

  it("counts English characters in punctuation mode", () => {
    expect(countWords("Hello world")).toBe(10);
  });

  it("counts English words in non-punctuation mode", () => {
    expect(countWords("Hello world", false)).toBe(2);
    expect(countWords("Hello世界", false)).toBe(3);
  });

  it("counts mixed CJK and English correctly without punctuation", () => {
    expect(countWords("你好 Hello 世界 world", false)).toBe(6);
    expect(countWords("Hello, world! 你好。", false)).toBe(4);
  });

  it("returns 0 for empty string", () => {
    expect(countWords("")).toBe(0);
  });
});

describe("sanitizeFileName", () => {
  it("replaces illegal filename characters with underscores", () => {
    expect(sanitizeFileName('a<b>c:d/e\\f|g?h*i"')).toBe("a_b_c_d_e_f_g_h_i_");
  });

  it("falls back to untitled for empty result", () => {
    expect(sanitizeFileName("   ")).toBe("untitled");
  });
});

describe("formatPlainText", () => {
  it("converts full-width spaces to regular and collapses runs of blanks", () => {
    expect(formatPlainText("你好　世界  你好")).toBe("你好 世界 你好");
  });

  it("converts English punctuation to full-width in Chinese context", () => {
    expect(formatPlainText("什么!真的?对;好:走,")).toBe("什么！真的？对；好：走，");
  });

  it("keeps half-width punctuation between digits", () => {
    expect(formatPlainText("价格是 3.5, 约 1,000 元")).toBe("价格是 3.5，约 1,000 元");
  });

  it("alternates straight double quotes into curly pairs", () => {
    expect(formatPlainText('他说"你好"转身走了')).toBe("他说“你好”转身走了");
    expect(formatPlainText('"a"和"b"')).toBe("“a”和“b”");
  });

  it("normalizes curly quotes back to proper pairs", () => {
    expect(formatPlainText("“你好”")).toBe("“你好”");
  });

  it("converts three dots to ellipsis", () => {
    expect(formatPlainText("等等...")).toBe("等等……");
  });

  it("trims line edges without merging lines", () => {
    expect(formatPlainText("  第一行  \n\t第二行\t")).toBe("第一行\n第二行");
  });
});
