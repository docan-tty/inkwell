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
  const cleaned = text.replace(/\s+/g, "");
  if (includePunctuation) {
    return Array.from(cleaned).length;
  }
  // Count CJK characters and words separately
  const cjk = (cleaned.match(/[一-鿿]/g) || []).length;
  const nonPunctuation = (cleaned.match(/[a-zA-Z0-9]+/g) || []).length;
  return cjk + nonPunctuation;
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").trim() || "untitled";
}

export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let last = 0;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - last >= delay) {
      last = now;
      fn(...args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        last = Date.now();
        timeout = null;
        fn(...args);
      }, delay - (now - last));
    }
  };
}
