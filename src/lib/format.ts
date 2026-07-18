import { formatPlainText } from "./utils";

/**
 * 自动整理格式（顶栏入口）：把章节 HTML 解析成 DOM，对每个「无行内格式」
 * 的文本块跑 formatPlainText 后序列化回去；同时把 3 个及以上连续的空段落
 * 收敛为 1 个（占位空段）。以块为单位处理（而非逐 textNode）是因为引号
 * 配对常跨格式边界；带加粗/斜体的块跳过以保证无损。
 */
export function formatHtmlTextNodes(html: string): string {
  const dom = new DOMParser().parseFromString(html, "text/html");
  dom.querySelectorAll("p, h1, h2, h3, blockquote, li").forEach((el) => {
    if (el.querySelector("b, strong, i, em, u, s, strike, code, a, span, mark")) return;
    const formatted = formatPlainText(el.textContent || "");
    if (formatted !== (el.textContent || "")) el.textContent = formatted;
  });
  // 连续空段落收敛：>= 3 个空段（无文本或仅 <br>）折叠为 1 个。
  const isEmptyPara = (el: Element) =>
    el.tagName === "P" && !(el.textContent || "").trim() && !el.querySelector("img");
  let run: Element[] = [];
  const flush = () => {
    if (run.length >= 3) run.slice(1).forEach((el) => el.remove());
    run = [];
  };
  [...dom.body.children].forEach((el) => {
    if (isEmptyPara(el)) run.push(el);
    else flush();
  });
  flush();
  return dom.body.innerHTML;
}
