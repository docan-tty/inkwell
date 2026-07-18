import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatNumber(num: number): string {
  return num.toLocaleString("zh-CN");
}

export function countWords(text: string, includePunctuation = true): number {
  if (!text) return 0;
  if (includePunctuation) {
    const cleaned = text.replace(/\s+/g, "");
    return Array.from(cleaned).length;
  }
  // Count CJK characters and English words separately, excluding punctuation.
  // Match English words on the original text (with whitespace) so that
  // "Hello world" counts as 2 words, not 1 — stripping whitespace first would
  // merge separate words into one token.
  const cjk = (text.match(/[一-鿿]/g) || []).length;
  const words = (text.match(/[a-zA-Z0-9]+/g) || []).length;
  return cjk + words;
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").trim() || "untitled";
}

// 排版替换表：全角空格 → 半角；英文标点（! ? ; : ,）在中文语境转全角
// （数字之前保留半角，如 3.5 / 1,000）；连续英文句点 → 省略号。
// 全角逗号/句号后不吃空格——中文排版里「， 」之间的空格是多余的。
const FORMAT_PAIRS: [RegExp, string][] = [
  [/　/g, " "], // 全角空格
  [/\.{3,}/g, "……"],
  [/!(?!\d)/g, "！"],
  [/\?(?!\d)/g, "？"],
  [/;(?!\d)/g, "；"],
  [/:(?!\d)/g, "："],
  [/,(?!\d) ?/g, "，"],
  [/， +/g, "，"],
  [/。 +/g, "。"],
];

/** 弯/直双引号归一后按出现次序交替为「“”」，奇数个末尾保持直引号。 */
function fixDoubleQuotes(text: string): string {
  let open = true;
  return text.replace(/["“”]/g, () => {
    const out = open ? "“" : "”";
    open = !open;
    return out;
  });
}

/**
 * 自动整理格式：规范一段纯文本的中文排版。
 * 全角空格 → 半角，行内多余空白收敛，英文标点（! ? ; : ,）在中文语境下
 * 转全角（数字之前保留半角，如 3.5 / 1,000），双引号按交替规则转为
 * 「“”」，行首/行尾空白修剪。不改动段落划分。
 */
export function formatPlainText(text: string): string {
  let out = text;
  for (const [re, to] of FORMAT_PAIRS) out = out.replace(re, to);
  out = fixDoubleQuotes(out);
  return out
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n");
}
