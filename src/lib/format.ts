import { formatPlainText, type FormatOptions } from "./utils";

/**
 * 自动整理格式（顶栏入口）：把章节 HTML 解析成 DOM，对每个「无行内格式」
 * 的文本块跑 formatPlainText 后序列化回去；按配置清除段落之间的空行。
 * 以块为单位处理（而非逐 textNode）是因为引号配对常跨格式边界；带
 * 加粗/斜体的块跳过以保证无损。
 */
export function formatHtmlTextNodes(html: string, options?: FormatOptions): string {
  const dom = new DOMParser().parseFromString(html, "text/html");
  dom.querySelectorAll("p, h1, h2, h3, blockquote, li").forEach((el) => {
    if (el.querySelector("b, strong, i, em, u, s, strike, code, a, span, mark")) return;
    const formatted = formatPlainText(el.textContent || "", options);
    if (formatted !== (el.textContent || "")) el.textContent = formatted;
  });
  // 空行清除：无文本或仅 <br> 的空段落全部删除（不是收敛为 1 个——
  // 用户要的是「两段文字之间不留空行」）。
  if (options?.removeEmptyLines !== false) {
    const isEmptyPara = (el: Element) =>
      el.tagName === "P" && !(el.textContent || "").trim() && !el.querySelector("img");
    [...dom.body.children].forEach((el) => {
      if (isEmptyPara(el)) el.remove();
    });
  }
  return dom.body.innerHTML;
}
