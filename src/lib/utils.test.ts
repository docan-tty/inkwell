import { describe, expect, it } from "vitest";
import { countWords, sanitizeFileName } from "./utils";

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
