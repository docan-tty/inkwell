// 手稿构建管线(novelWriter Manuscript Build)
// -------------------------------------------
// 从项目文档装配一份手稿:文档选择(根文件夹开关 + 非激活过滤 + 显式
// 含/排除)→ 内容过滤(正文/概要/注释/关键字)→ 标题格式化({Title}/
// {Chapter}/{Scene}/{Char:POV}…,静态文本=场景分隔符,「----」=分隔线)
// → 排版(标题样式/首行缩进/字号行距)→ 输出(HTML / Markdown / 纯文本)。

import type { AppSettings, Chapter, RootKind, Volume } from "../types";
import { chapterDocKind, chapterRootKind } from "./docs";
import { extractHeadings, parseDocumentIndex, type ProjectIndex } from "./tags";
import { countWords, sortChaptersByTreeOrder } from "./utils";

export interface BuildSettings {
  /** 各根文件夹是否纳入(未列出的默认:仅 novel)。 */
  includeRoots: Partial<Record<RootKind, boolean>>;
  /** 显式包含的文档 id(覆盖 inactive 过滤)。 */
  includeDocs: string[];
  /** 显式排除的文档 id。 */
  excludeDocs: string[];
  /** 非激活文档是否纳入(默认 false = 排除)。 */
  includeInactive: boolean;
  /** 内容开关。 */
  includeBody: boolean;
  includeSynopsis: boolean;
  includeComments: boolean;
  includeKeywords: boolean;
  /** 标题格式串。 */
  fmtTitle: string;
  fmtPartition: string;
  fmtChapter: string;
  fmtScene: string;
  fmtSection: string;
  /** 标题样式。 */
  centerHeadings: boolean;
  pageBreakBeforeChapter: boolean;
  boldHeadings: boolean;
  upperHeadings: boolean;
  /** 段落。 */
  firstLineIndent: boolean;
  lineHeight: number;
  fontSize: number;
}

export const DEFAULT_BUILD_SETTINGS: BuildSettings = {
  includeRoots: { novel: true },
  includeDocs: [],
  excludeDocs: [],
  includeInactive: false,
  includeBody: true,
  includeSynopsis: false,
  includeComments: false,
  includeKeywords: false,
  fmtTitle: "{Title}",
  fmtPartition: "{Title}",
  fmtChapter: "第{Chapter}章 {Title}",
  fmtScene: "",
  fmtSection: "",
  centerHeadings: false,
  pageBreakBeforeChapter: true,
  boldHeadings: true,
  upperHeadings: false,
  firstLineIndent: true,
  lineHeight: 1.85,
  fontSize: 12,
};

const CHINESE_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
export function chineseNumber(n: number): string {
  if (n < 0) return String(n);
  if (n < 10) return CHINESE_DIGITS[n];
  if (n < 20) return `十${n % 10 === 0 ? "" : CHINESE_DIGITS[n % 10]}`;
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const rest = n % 10;
    return `${CHINESE_DIGITS[tens]}十${rest === 0 ? "" : CHINESE_DIGITS[rest]}`;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    if (rest === 0) return `${CHINESE_DIGITS[h]}百`;
    if (rest < 10) return `${CHINESE_DIGITS[h]}百零${CHINESE_DIGITS[rest]}`;
    // 110-119:中文惯用「一百一十X」而非「一百十X」。
    if (rest < 20) return `${CHINESE_DIGITS[h]}百一十${rest % 10 === 0 ? "" : CHINESE_DIGITS[rest % 10]}`;
    return `${CHINESE_DIGITS[h]}百${chineseNumber(rest)}`;
  }
  return String(n);
}

const ROMAN: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];
export function romanNumber(n: number): string {
  let out = "";
  let v = n;
  for (const [val, sym] of ROMAN) {
    while (v >= val) {
      out += sym;
      v -= val;
    }
  }
  return out || String(n);
}

export interface BuildDoc {
  chapter: Chapter;
  html: string;
}

/** 文档选择:根开关 → 显式排除 → 非激活过滤 → 显式包含覆盖。 */
export function selectBuildDocuments(
  chapters: Chapter[],
  volumes: Volume[],
  settings: BuildSettings,
): Chapter[] {
  const includeSet = new Set(settings.includeDocs);
  const excludeSet = new Set(settings.excludeDocs);
  return sortChaptersByTreeOrder(chapters, volumes).filter((c) => {
    if (excludeSet.has(c.id)) return false;
    if (includeSet.has(c.id)) return true;
    const root = chapterRootKind(c, volumes);
    const rootOn = settings.includeRoots[root] ?? root === "novel";
    if (!rootOn) return false;
    if (c.inactive && !settings.includeInactive) return false;
    return true;
  });
}

interface Ctx {
  chapterNum: number;
  sceneNum: number;
  sceneAbs: number;
  tagsIndex: ProjectIndex;
}

/** 标题格式化:{Title} {Chapter} {Chapter:Word} {Chapter:URoman}
 *  {Chapter:LRoman} {Scene} {Scene:Abs} {Char:POV} {Char:Focus} {BR}。
 *  纯静态文本(无 {Title})视为场景分隔符;「----」为分隔线(调用方处理)。 */
export function formatHeading(
  format: string,
  title: string,
  ctx: Ctx,
  refs?: { pov?: string[]; focus?: string[] },
): string {
  let out = format;
  out = out.replace(/\{BR\}/g, "\n");
  out = out.replace(/\{Title\}/g, title);
  out = out.replace(/\{Chapter:Word\}/g, chineseNumber(ctx.chapterNum));
  out = out.replace(/\{Chapter:URoman\}/g, romanNumber(ctx.chapterNum));
  out = out.replace(/\{Chapter:LRoman\}/g, romanNumber(ctx.chapterNum).toLowerCase());
  out = out.replace(/\{Chapter\}/g, String(ctx.chapterNum));
  out = out.replace(/\{Scene:Abs\}/g, String(ctx.sceneAbs));
  out = out.replace(/\{Scene\}/g, String(ctx.sceneNum));
  const povName = refs?.pov?.[0];
  const focusName = refs?.focus?.[0];
  const povEntry = povName ? ctx.tagsIndex.tags.get(povName.toLowerCase()) : undefined;
  const focusEntry = focusName ? ctx.tagsIndex.tags.get(focusName.toLowerCase()) : undefined;
  out = out.replace(/\{Char:POV\}/g, povEntry?.display ?? povName ?? "");
  out = out.replace(/\{Char:Focus\}/g, focusEntry?.display ?? focusName ?? "");
  return out;
}

export interface BuiltBlock {
  kind: "title" | "partition" | "chapter" | "scene" | "section" | "separator" | "hr" | "text" | "synopsis" | "comment" | "keyword";
  text: string;
  /** 该块前是否分页(章节标题常用)。 */
  pageBreak?: boolean;
}

/** 把手稿内容解析为排版块(预览与输出共用)。 */
export function buildBlocks(
  docs: BuildDoc[],
  volumes: Volume[],
  settings: BuildSettings,
  tagsIndex: ProjectIndex,
): BuiltBlock[] {
  const blocks: BuiltBlock[] = [];
  const ctx: Ctx = { chapterNum: 0, sceneNum: 0, sceneAbs: 0, tagsIndex };
  let pendingSeparator: string | null = null;

  for (const { chapter, html } of docs) {
    // 场景级文档可以不含 h2 章标题。相对场景编号和静态分隔符
    // 应以文档为边界复位,绝对场景编号仍跨整份手稿递增。
    ctx.sceneNum = 0;
    pendingSeparator = null;
    const idx = parseDocumentIndex(chapter.id, html);
    const headings = extractHeadings(html);
    // 以行为单位走一遍,按标题切分正文块。
    const segments = splitByHeadingElements(html);
    let headingCursor = 0;
    for (const seg of segments) {
      if (seg.kind === "heading") {
        const meta = headings[headingCursor++];
        const h = idx.headings.find((x) => x.title === meta.title && x.level === meta.level);
        const refs = h ? { pov: h.refs.pov, focus: h.refs.focus } : undefined;
        const isNovel = chapterDocKind(chapter, volumes) === "novel";
        if (meta.level === 1 && meta.bang) {
          blocks.push({ kind: "title", text: formatHeading(settings.fmtTitle, meta.title, ctx, refs) });
        } else if (meta.level === 1) {
          blocks.push({ kind: "partition", text: formatHeading(settings.fmtPartition, meta.title, ctx, refs) });
        } else if (meta.level === 2) {
          if (!meta.bang) ctx.chapterNum++;
          ctx.sceneNum = 0;
          blocks.push({
            kind: "chapter",
            text: formatHeading(settings.fmtChapter, meta.title, ctx, refs),
            pageBreak: settings.pageBreakBeforeChapter && isNovel,
          });
          pendingSeparator = null;
        } else if (meta.level === 3) {
          ctx.sceneNum++;
          ctx.sceneAbs++;
          const fmt = meta.bang ? settings.fmtScene : settings.fmtScene;
          // 静态分隔符只落在「章内非首个场景」之前(场景 1 前不插)。
          const isFirstInChapter = ctx.sceneNum === 1;
          if (fmt.trim() === "") {
            pendingSeparator = null; // 空格式=空段分隔,无需额外块
          } else if (fmt === "----") {
            pendingSeparator = isFirstInChapter ? null : "hr";
          } else if (!fmt.includes("{Title}") && !fmt.includes("{Scene") && !fmt.includes("{Chapter")) {
            pendingSeparator = isFirstInChapter ? null : fmt;
          } else {
            blocks.push({ kind: "scene", text: formatHeading(fmt, meta.title, ctx, refs) });
          }
        } else {
          blocks.push({ kind: "section", text: formatHeading(settings.fmtSection, meta.title, ctx, refs) });
        }
        // 标题级元数据(关键字/概要)按开关输出。
        if (h) {
          if (settings.includeSynopsis && h.synopsis) {
            blocks.push({ kind: "synopsis", text: h.synopsis });
          }
          if (settings.includeKeywords) {
            const kw = Object.entries(h.refs)
              .map(([k, v]) => `@${k}: ${(v as string[]).join(", ")}`)
              .join("\n");
            if (kw) blocks.push({ kind: "keyword", text: kw });
          }
        }
      } else {
        if (!settings.includeBody) continue;
        const text = seg.html;
        if (!text.replace(/<[^>]+>/g, "").trim()) continue;
        if (pendingSeparator) {
          blocks.push({ kind: pendingSeparator === "hr" ? "hr" : "separator", text: pendingSeparator === "hr" ? "" : pendingSeparator });
          pendingSeparator = null;
        }
        blocks.push({ kind: "text", text });
      }
    }
  }
  return blocks;
}

interface Segment {
  kind: "heading" | "content";
  html: string;
}

/** 把 HTML 按 h1-h4 元素切成「标题/内容」段。 */
function splitByHeadingElements(html: string): Segment[] {
  const re = /<h[1-4][^>]*>[\s\S]*?<\/h[1-4]>/gi;
  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m.index > last) out.push({ kind: "content", html: html.slice(last, m.index) });
    out.push({ kind: "heading", html: m[0] });
    last = m.index + m[0].length;
  }
  if (last < html.length) out.push({ kind: "content", html: html.slice(last) });
  return out;
}

/** 输出:HTML(带内联样式,供预览与导出)。 */
export function renderHtml(blocks: BuiltBlock[], settings: BuildSettings, title: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const parts: string[] = [];
  for (const b of blocks) {
    const align = settings.centerHeadings && b.kind !== "text" ? "text-align:center;" : "";
    const weight = settings.boldHeadings && b.kind !== "text" ? "font-weight:700;" : "";
    const upper = settings.upperHeadings && b.kind !== "text" ? "text-transform:uppercase;" : "";
    const brk = b.pageBreak ? "page-break-before:always;" : "";
    switch (b.kind) {
      case "title":
        parts.push(`<div style="font-size:1.8em;${align}${weight}${upper}${brk}margin:1em 0;">${esc(b.text)}</div>`);
        break;
      case "partition":
        parts.push(`<div style="font-size:1.5em;${align}${weight}${upper}${brk}margin:1em 0;">${esc(b.text)}</div>`);
        break;
      case "chapter":
        parts.push(`<h1 style="${align}${weight}${upper}${brk}">${esc(b.text)}</h1>`);
        break;
      case "scene":
        parts.push(`<h2 style="${align}${weight}${upper}">${esc(b.text)}</h2>`);
        break;
      case "section":
        parts.push(`<h3 style="${align}${weight}${upper}">${esc(b.text)}</h3>`);
        break;
      case "separator":
        parts.push(`<p style="text-align:center;">${esc(b.text)}</p>`);
        break;
      case "hr":
        parts.push(`<hr style="width:50%;margin:1.5em auto;"/>`);
        break;
      case "synopsis":
        parts.push(`<p style="color:#888;font-style:italic;">概要:${esc(b.text)}</p>`);
        break;
      case "keyword":
        parts.push(`<p style="color:#888;">${esc(b.text).replace(/\n/g, "<br/>")}</p>`);
        break;
      case "comment":
        parts.push(`<p style="color:#999;">${esc(b.text)}</p>`);
        break;
      default:
        parts.push(b.text);
    }
  }
  const indent = settings.firstLineIndent ? "p{text-indent:2em;} h1,h2,h3{text-indent:0;}" : "";
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(title)}</title>
<style>body{font-size:${settings.fontSize}pt;line-height:${settings.lineHeight};max-width:40em;margin:2em auto;font-family:serif;}${indent}</style>
</head><body>${parts.join("\n")}</body></html>`;
}

/** 输出:Markdown。 */
export function renderMarkdown(blocks: BuiltBlock[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.kind) {
      case "title": out.push(`# ${b.text}`); break;
      case "partition": out.push(`# ${b.text}`); break;
      case "chapter": out.push(`## ${b.text}`); break;
      case "scene": out.push(`### ${b.text}`); break;
      case "section": out.push(`#### ${b.text}`); break;
      case "separator": out.push(b.text); break;
      case "hr": out.push("----"); break;
      case "synopsis": out.push(`> 概要:${b.text}`); break;
      case "keyword": out.push(b.text); break;
      default:
        out.push(b.text.replace(/<\/p>\s*<p[^>]*>/g, "\n\n").replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, ""));
    }
  }
  return out.filter((s) => s.trim()).join("\n\n");
}

/** 输出:纯文本。 */
export function renderPlainText(blocks: BuiltBlock[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind === "hr") {
      out.push("* * *");
    } else {
      out.push(b.text.replace(/<\/p>\s*<p[^>]*>/g, "\n\n").replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, ""));
    }
  }
  return out.filter((s) => s.trim()).join("\n\n");
}

/** 构建统计(预览底部展示):基于排版后文本的字数/字符数。 */
export function buildStats(blocks: BuiltBlock[], settings: AppSettings): { words: number; chars: number } {
  const text = blocks
    .map((b) => b.text.replace(/<[^>]+>/g, ""))
    .join("\n");
  return {
    words: countWords(text, settings.includePunctuationInWordCount),
    chars: text.replace(/\s/g, "").length,
  };
}
