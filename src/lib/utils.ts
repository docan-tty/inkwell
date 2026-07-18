import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Chapter, Volume } from "../types";

/** 卷序 + 卷内章序的目录树排序（未入卷的章节排在最后，与章节树一致）。
 *  搜索面板、大纲视图、全书导出共用同一套顺序，勿再各自实现。 */
export function sortChaptersByTreeOrder(chapters: Chapter[], volumes: Volume[]): Chapter[] {
  const volumeOrder = new Map(volumes.map((v) => [v.id, v.order]));
  return [...chapters].sort((a, b) => {
    const va = volumeOrder.get(a.parentId || "") ?? Number.MAX_SAFE_INTEGER;
    const vb = volumeOrder.get(b.parentId || "") ?? Number.MAX_SAFE_INTEGER;
    if (va !== vb) return va - vb;
    return a.order - b.order;
  });
}

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

/** 整理格式选项：每个开关对应一条可独立启停的规则。 */
export interface FormatOptions {
  /** 清除段落之间的空行（连续空段全部删除）。 */
  removeEmptyLines?: boolean;
  /** 清除行内多余空白（连续空格/制表符合并为单个空格，并修剪行首行尾）。 */
  collapseInlineWhitespace?: boolean;
  /** 英文标点（! ? ; : ,）在中文语境转全角。 */
  punctuationToFullWidth?: boolean;
  /** 双引号按交替规则转为「“”」。 */
  normalizeQuotes?: boolean;
}

const DEFAULT_FORMAT_OPTIONS: Required<FormatOptions> = {
  removeEmptyLines: true,
  collapseInlineWhitespace: true,
  punctuationToFullWidth: true,
  normalizeQuotes: true,
};

/**
 * 自动整理格式：规范一段纯文本的中文排版。
 * 默认规则：全角空格 → 半角，行内多余空白收敛，英文标点（! ? ; : ,）在
 * 中文语境下转全角（数字之前保留半角，如 3.5 / 1,000），双引号按交替
 * 规则转为「“”」，行首/行尾空白修剪，段落之间的空行清除。
 * 调用方可用 options 关闭个别规则（全局设置里用户可改）。
 */
export function formatPlainText(text: string, options?: FormatOptions): string {
  const opts = { ...DEFAULT_FORMAT_OPTIONS, ...options };
  let out = text;
  if (opts.punctuationToFullWidth) {
    for (const [re, to] of FORMAT_PAIRS) out = out.replace(re, to);
  }
  if (opts.normalizeQuotes) out = fixDoubleQuotes(out);
  if (opts.collapseInlineWhitespace) {
    out = out
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .join("\n");
  }
  return out;
}
