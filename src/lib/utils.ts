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
