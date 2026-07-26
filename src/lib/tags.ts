// 标签与引用系统(novelWriter 式)
// --------------------------------
// 文档正文(HTML)中以「@keyword: 值」行声明标签与引用。标题(h1-h4)携带
// 元数据:每个标题可有一个 @tag,和任意多个引用(@pov/@char/@plot…)。
// 根文件夹类型决定 tag 的类别(角色根下的 tag 是角色,情节根下是情节)。
// 解析在纯文本层进行:HTML → 行数组 → 逐行匹配,与 novelWriter 的纯文本
// 格式语义一致(我们的编辑器是富文本,但「@行独占一段」的约定相同)。
//
// 索引(tagsIndex)由 store 在打开作品/保存文档时重建,大纲视图与补全读取。

import type { Chapter, RootKind, Volume } from "../types";
import { chapterDocKind, chapterRootKind } from "./docs";
import { sortChaptersByTreeOrder } from "./utils";

/** 引用关键字 → 目标根文件夹类型(校验引用目标是否合法)。 */
export const REF_KEYWORDS = [
  "pov",
  "focus",
  "char",
  "plot",
  "time",
  "location",
  "object",
  "entity",
  "custom",
  "mention",
  "story",
] as const;
export type RefKeyword = (typeof REF_KEYWORDS)[number];

export const REF_LABELS: Record<RefKeyword, string> = {
  pov: "视角",
  focus: "焦点",
  char: "角色",
  plot: "情节",
  time: "时间线",
  location: "位置",
  object: "物品",
  entity: "势力",
  custom: "自定义",
  mention: "提及",
  story: "故事",
};

/** 引用关键字 → 期望的根文件夹类型(mention 任意;story 指向小说文档)。 */
export const REF_TARGET_ROOT: Record<RefKeyword, RootKind | "any" | "noveldoc"> = {
  pov: "characters",
  focus: "characters",
  char: "characters",
  plot: "plot",
  time: "timeline",
  location: "locations",
  object: "objects",
  entity: "entities",
  custom: "custom",
  mention: "any",
  story: "noveldoc",
};

export interface HeadingInfo {
  level: number; // 1-4
  title: string;
  /** 标题是否为「!」变体(#! 书名 / ##! 未编号章 / ###! 硬场景)。 */
  bang: boolean;
  /** 标题后声明的 tag(唯一)。 */
  tag?: string;
  /** 引用:关键字 → 值列表。 */
  refs: Partial<Record<RefKeyword, string[]>>;
  /** 该标题下第一个 %Synopsis: 注释。 */
  synopsis?: string;
}

export interface DocIndex {
  chapterId: string;
  headings: HeadingInfo[];
}

export interface TagEntry {
  tag: string;
  display: string;
  chapterId: string;
  chapterTitle: string;
  rootKind: RootKind;
}

const REF_SET = new Set<string>(REF_KEYWORDS);

interface ParsedLine {
  text: string;
  heading?: { level: number; title: string; bang: boolean };
}

function decodeInlineText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function normalizeHeading(raw: string, level: number): ParsedLine {
  const bang = raw.startsWith("!");
  const title = bang ? raw.slice(1).trim() : raw;
  return { text: raw, heading: { level, title, bang } };
}

function htmlToParsedLines(html: string): ParsedLine[] {
  const blockRe = /<(p|h[1-4]|div|li|blockquote)[^>]*>([\s\S]*?)<\/\1>|<(br|hr)[^>]*>/gi;
  const lines: ParsedLine[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const pushText = (text: string) => {
    for (const part of text.split("\n")) {
      const line = decodeInlineText(part);
      if (line) lines.push({ text: line });
    }
  };
  while ((m = blockRe.exec(html))) {
    if (m.index > last) pushText(html.slice(last, m.index));
    const tag = (m[1] ?? m[3] ?? "").toLowerCase();
    if (tag === "br" || tag === "hr") {
      last = m.index + m[0].length;
      continue;
    }
    const text = decodeInlineText(m[2] ?? "");
    if (text) {
      const level = /^h[1-4]$/.test(tag) ? Number(tag.slice(1)) : 0;
      lines.push(level ? normalizeHeading(text, level) : { text });
    }
    last = m.index + m[0].length;
  }
  if (last < html.length) pushText(html.slice(last));
  return lines;
}

/** HTML → 行数组:块级标签(p/h1-h4/div/li/blockquote)换行,其余剥掉。 */
export function htmlToLines(html: string): string[] {
  return htmlToParsedLines(html).map((line) => line.text);
}

/** 从 HTML 提取标题(含级别与 ! 变体)。 */
export function extractHeadings(html: string): { level: number; title: string; bang: boolean }[] {
  return htmlToParsedLines(html).flatMap((line) => (line.heading ? [line.heading] : []));
}

const TAG_RE = /^@tag\s*:\s*(.+)$/i;
const REF_RE = /^@(\w+)\s*:\s*(.+)$/;
const SYNOPSIS_RE = /^%(?:Synopsis|Short)\s*:\s*(.+)$/i;

/** 解析一个文档的全部标题及其标签/引用/简介。 */
export function parseDocumentIndex(chapterId: string, html: string): DocIndex {
  const lines = htmlToParsedLines(html);
  const headings: HeadingInfo[] = [];
  let current: HeadingInfo | null = null;

  for (const lineInfo of lines) {
    const line = lineInfo.text;
    if (lineInfo.heading) {
      current = { level: lineInfo.heading.level, title: lineInfo.heading.title, bang: lineInfo.heading.bang, refs: {} };
      headings.push(current);
      continue;
    }
    const tagM = TAG_RE.exec(line);
    if (tagM && current && !current.tag) {
      const [tag, display] = splitTag(tagM[1]);
      current.tag = tag;
      if (display) current.refs = { ...current.refs };
      (current as HeadingInfo & { display?: string }).display = display;
      continue;
    }
    const synM = SYNOPSIS_RE.exec(line);
    if (synM && current && !current.synopsis) {
      current.synopsis = synM[1].trim();
      continue;
    }
    const refM = REF_RE.exec(line);
    if (refM && current && REF_SET.has(refM[1].toLowerCase())) {
      const kw = refM[1].toLowerCase() as RefKeyword;
      const values = refM[2].split(",").map((v) => v.trim()).filter(Boolean);
      current.refs[kw] = [...(current.refs[kw] ?? []), ...values];
    }
  }
  return { chapterId, headings };
}

/** "@tag: Jane | Jane Doe" → ["Jane", "Jane Doe"]。 */
function splitTag(raw: string): [string, string | undefined] {
  const parts = raw.split("|").map((p) => p.trim());
  return [parts[0], parts[1] || undefined];
}

export interface ProjectIndex {
  /** tag(小写)→ 条目。 */
  tags: Map<string, TagEntry>;
  /** 文档级解析结果。 */
  docs: Map<string, DocIndex>;
}

/** 汇总整个作品的标签索引(在大纲/补全/校验用)。 */
export function buildProjectIndex(
  docs: { chapter: Chapter; html: string }[],
  volumes: Volume[],
): ProjectIndex {
  const tags = new Map<string, TagEntry>();
  const docIndexes = new Map<string, DocIndex>();
  for (const { chapter, html } of docs) {
    const idx = parseDocumentIndex(chapter.id, html);
    docIndexes.set(chapter.id, idx);
    const rootKind = chapterRootKind(chapter, volumes);
    for (const h of idx.headings) {
      if (!h.tag) continue;
      const display = (h as HeadingInfo & { display?: string }).display;
      tags.set(h.tag.toLowerCase(), {
        tag: h.tag,
        display: display || h.tag,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        rootKind,
      });
    }
  }
  return { tags, docs: docIndexes };
}

/** 大纲行(表格视图):每个标题一行。 */
export interface OutlineRow {
  chapterId: string;
  chapterTitle: string;
  level: number;
  title: string;
  bang: boolean;
  synopsis?: string;
  refs: Partial<Record<RefKeyword, string[]>>;
  words?: number;
}

export function collectOutline(chapters: Chapter[], volumes: Volume[], docs: Map<string, DocIndex>): OutlineRow[] {
  const sorted = sortChaptersByTreeOrder(chapters, volumes).filter(
    (c) => chapterDocKind(c, volumes) === "novel" && !c.inactive,
  );
  const rows: OutlineRow[] = [];
  for (const c of sorted) {
    const idx = docs.get(c.id);
    if (!idx) continue;
    for (const h of idx.headings) {
      rows.push({
        chapterId: c.id,
        chapterTitle: c.title,
        level: h.level,
        title: h.title,
        bang: h.bang,
        synopsis: h.synopsis,
        refs: h.refs,
      });
    }
  }
  return rows;
}
