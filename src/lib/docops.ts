// 拆分 / 合并 / 备份 / 统计(novelWriter 式文档操作)
// -------------------------------------------------

import { htmlToLines } from "./tags";

export interface SplitPiece {
  title: string;
  level: number;
  html: string;
}

/** 按标题级别拆分 HTML:返回每个标题(及前置无标题内容)一段。
 *  比拆分级别更高的标题(如按场景拆时的章节标题)归入其后的第一个片段,
 *  不作为「前言」。 */
export function splitByHeadings(html: string, splitLevel: 1 | 2 | 3 | 4): SplitPiece[] {
  const headingRe = new RegExp(`<h([1-${splitLevel}])[^>]*>([\\s\\S]*?)</h\\1>`, "gi");
  const pieces: SplitPiece[] = [];
  let m: RegExpExecArray | null;
  const heads: { index: number; level: number; title: string }[] = [];
  while ((m = headingRe.exec(html))) {
    const level = parseInt(m[1], 10);
    heads.push({ index: m.index, level, title: m[2].replace(/<[^>]+>/g, "").trim() });
  }
  const splits = heads.filter((h) => h.level === splitLevel);
  if (splits.length === 0) return [];
  // 前置内容:只有其中不含任何标题(纯正文)时才作为无名段;含更高级别
  // 标题时,那段内容归到第一个拆分片段里。
  const pre = html.slice(0, splits[0].index);
  const preHasHeading = heads.some((h) => h.index < splits[0].index && h.level < splitLevel);
  if (pre.replace(/<[^>]+>/g, "").trim() && !preHasHeading) {
    pieces.push({ title: "（前言）", level: 0, html: pre });
  }
  const firstStart = preHasHeading ? (heads.find((h) => h.level < splitLevel)?.index ?? splits[0].index) : splits[0].index;
  for (let i = 0; i < splits.length; i++) {
    const start = i === 0 ? firstStart : splits[i].index;
    const end = i + 1 < splits.length ? splits[i + 1].index : html.length;
    pieces.push({
      title: splits[i].title || `片段 ${i + 1}`,
      level: splitLevel,
      html: html.slice(start, end),
    });
  }
  return pieces;
}

/** 合并多个 HTML 文档为一个(顺序拼接,中间空段分隔)。 */
export function mergeDocuments(contents: string[]): string {
  return contents.filter((c) => c.trim()).join("\n<p></p>\n");
}

/** 估算拆分预览:每个片段的标题与字数。 */
export function previewSplit(html: string, level: 1 | 2 | 3 | 4): { title: string; words: number }[] {
  return splitByHeadings(html, level).map((p) => ({
    title: p.title,
    words: htmlToLines(p.html).join(" ").length,
  }));
}
