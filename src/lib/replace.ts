// 全文替换引擎：把「在纯文本里找到第 N 个匹配」映射回 HTML 源码并替换。
//
// 章节的持久化形态是 HTML（TipTap 序列化）。直接在 HTML 字符串上做
// indexOf 替换会命中标签/属性；先把每个文本节点在「拼接纯文本」中的区间
// 算出来（与 stripHtml 同一套 DOM 遍历，块级元素之间计入换行），再按匹配
// 所在的文本节点改写 nodeValue —— 标签结构零改动，匹配也不可能落在
// 标签内部（DOM 文本节点不含标签）。
//
// 限制：跨文本节点的匹配（例如命中被 <strong> 截断的词，或跨越段落的
// 换行）不做替换，按「跳过」处理并回报给调用方。

export interface ReplaceSummary {
  /** 实际完成替换的处数。 */
  replaced: number;
  /** 纯文本中存在但无法安全替换（跨标签/跨段落）的匹配数。 */
  skipped: number;
}

interface TextNodeSpan {
  node: Text;
  /** 该节点文本在拼接纯文本中的起始偏移。 */
  start: number;
  end: number;
}

// 与 export.ts 的 BLOCK_TAGS 保持一致：这些元素在 stripHtml 后会贡献一个
// 换行，纯文本偏移必须同样计入，定位才不会漂移。
const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "canvas", "dd", "div", "dl",
  "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2",
  "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "noscript",
  "ol", "p", "pre", "section", "table", "tfoot", "ul", "video",
]);

// 收集 body 下所有文本节点及其在拼接纯文本中的区间（镜像 stripHtml 的
// 遍历顺序：<br> 与块级元素各贡献一个 "\n"）。
function collectTextNodeSpans(doc: Document): { spans: TextNodeSpan[]; text: string } {
  const spans: TextNodeSpan[] = [];
  let text = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent || "";
      spans.push({ node: node as Text, start: text.length, end: text.length + value.length });
      text += value;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") {
      text += "\n";
      return;
    }
    Array.from(el.childNodes).forEach(walk);
    if (BLOCK_TAGS.has(tag)) text += "\n";
  };
  walk(doc.body);
  return { spans, text };
}

export interface MatchHit {
  index: number;
  length: number;
}

/** 在纯文本中查找所有匹配（支持大小写敏感开关）。 */
export function findMatches(text: string, query: string, caseSensitive: boolean): MatchHit[] {
  if (!query) return [];
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const hits: MatchHit[] = [];
  let idx = 0;
  while (idx <= haystack.length - needle.length) {
    const hit = haystack.indexOf(needle, idx);
    if (hit === -1) break;
    hits.push({ index: hit, length: needle.length });
    idx = hit + Math.max(1, needle.length);
  }
  return hits;
}

/**
 * 替换 HTML 内容中纯文本第 `targetOrdinal` 个匹配（0 起）。
 * 返回新的 HTML 与该次替换的摘要；未找到对应匹配时 replaced 为 0。
 */
export function replaceMatchInHtml(
  html: string,
  query: string,
  replacement: string,
  targetOrdinal: number,
  caseSensitive: boolean,
): { html: string } & ReplaceSummary {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const { spans, text } = collectTextNodeSpans(doc);
  const hits = findMatches(text, query, caseSensitive);
  const hit = hits[targetOrdinal];
  if (!hit) return { html, replaced: 0, skipped: 0 };

  const hitEnd = hit.index + hit.length;
  const involved = spans.filter((s) => s.end > hit.index && s.start < hitEnd);
  if (involved.length !== 1) {
    // 跨越多个文本节点（标签边界或换行）——跳过，不冒损坏结构的风险。
    return { html, replaced: 0, skipped: 1 };
  }
  const span = involved[0];
  const localStart = hit.index - span.start;
  const value = span.node.nodeValue ?? "";
  span.node.nodeValue = value.slice(0, localStart) + replacement + value.slice(localStart + hit.length);

  const wrapper = doc.createElement("div");
  Array.from(doc.body.childNodes).forEach((child) => wrapper.appendChild(child));
  return { html: wrapper.innerHTML, replaced: 1, skipped: 0 };
}

/**
 * 替换 HTML 内容中的全部可替换匹配。
 * 逐次「替换当前第一个匹配」直到没有可替换的匹配为止；不可替换的匹配
 * （跨标签）会计入 skipped 并在统计时跳过，不会死循环。
 */
export function replaceAllInHtml(
  html: string,
  query: string,
  replacement: string,
  caseSensitive: boolean,
): { html: string } & ReplaceSummary {
  let current = html;
  let replaced = 0;
  let skipped = 0;
  // 每轮都从头找第一个「可替换」的匹配：跨节点的匹配被跳过并计数，
  // 但跳过是纯文本视角的跳过——为避免死循环，统计每轮的总匹配数，
  // 当一轮里 replaced === 0 时说明剩余匹配全部不可替换，结束。
  for (;;) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(current, "text/html");
    const { spans, text } = collectTextNodeSpans(doc);
    const hits = findMatches(text, query, caseSensitive);
    if (hits.length === 0) break;
    let didReplace = false;
    for (const hit of hits) {
      const hitEnd = hit.index + hit.length;
      const involved = spans.filter((s) => s.end > hit.index && s.start < hitEnd);
      if (involved.length !== 1) {
        skipped += 1;
        continue;
      }
      const span = involved[0];
      const localStart = hit.index - span.start;
      const value = span.node.nodeValue ?? "";
      span.node.nodeValue = value.slice(0, localStart) + replacement + value.slice(localStart + hit.length);
      replaced += 1;
      didReplace = true;
      break; // 文本已变，重新解析下一轮
    }
    if (!didReplace) break;
    const wrapper = doc.createElement("div");
    Array.from(doc.body.childNodes).forEach((child) => wrapper.appendChild(child));
    current = wrapper.innerHTML;
  }
  return { html: current, replaced, skipped };
}
