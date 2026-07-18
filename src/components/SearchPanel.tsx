import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, FileText, ChevronRight, ChevronDown, Replace, ReplaceAll, CaseSensitive } from "lucide-react";
import { useAppStore } from "../store";
import { stripHtml } from "../lib/export";
import { cn } from "../lib/utils";

interface SearchResult {
  chapterId: string;
  chapterTitle: string;
  volumeId: string | null;
  /** Where the match was found: the chapter title or the body text. */
  inTitle: boolean;
  /** Body excerpt with the match highlighted, only for body matches. */
  before?: string;
  match?: string;
  after?: string;
}

const MAX_RESULTS = 200;
const CONTEXT_CHARS = 24;

/** Builds an excerpt around the match at `idx`, with before/match/after parts. */
function excerpt(text: string, idx: number, matchLength: number) {
  return {
    before: text.slice(Math.max(0, idx - CONTEXT_CHARS), idx),
    match: text.slice(idx, idx + matchLength),
    after: text.slice(idx + matchLength, idx + matchLength + CONTEXT_CHARS),
  };
}

/**
 * Project-wide full-text search & replace (Ctrl+Shift+F). Searches every
 * chapter's title and body (HTML stripped to plain text), groups hits by
 * volume order like the chapter tree, and jumps to the chapter on click.
 * The replace row rewrites chapter HTML through lib/replace (text-node
 * level — tags are never touched), then reloads the open editor.
 */
export function SearchPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    chapters,
    volumes,
    setCurrentChapter,
    getChapterContent,
    replaceInChapter,
  } = useAppStore();
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [replaceNotice, setReplaceNotice] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchToken = useRef(0);

  // Stable structural signature of the chapter list. Typing in the editor
  // bumps chapter word counts (new chapters array) every 200ms — depending
  // on the array itself would re-read every chapter file and re-run the
  // search on each keystroke. Body content is intentionally NOT part of the
  // signature: searches run against the on-disk content anyway, and a query
  // typed while editing re-runs on its own debounce.
  const structureSig = useMemo(
    () =>
      volumes.map((v) => `${v.id}:${v.order}:${v.title}`).join("|") +
      "#" +
      chapters.map((c) => `${c.id}:${c.parentId}:${c.order}:${c.title}`).join("|"),
    [volumes, chapters],
  );
  // Latest chapter metadata for the search body + jump — read at fire time,
  // not subscribed (see structureSig above).
  const chaptersRef = useRef(chapters);
  chaptersRef.current = chapters;
  const volumesRef = useRef(volumes);
  volumesRef.current = volumes;

  useEffect(() => {
    if (open) {
      setQuery("");
      setReplacement("");
      setResults([]);
      setActiveIndex(0);
      setReplaceNotice(null);
      // Focus after mount.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced full-project search. Reads every chapter's content via the
  // store accessor (disk with localStorage fallback), strips tags, and
  // collects matches in tree order (volume order, then chapter order).
  // Depends on the structural signature, not the live arrays — typing in the
  // editor must not re-trigger a whole-book search.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const token = ++searchToken.current;
    const timer = setTimeout(async () => {
      const volumesNow = volumesRef.current;
      const chaptersNow = chaptersRef.current;
      const volumeOrder = new Map(volumesNow.map((v) => [v.id, v.order]));
      const sorted = [...chaptersNow].sort((a, b) => {
        const va = volumeOrder.get(a.parentId || "") ?? Number.MAX_SAFE_INTEGER;
        const vb = volumeOrder.get(b.parentId || "") ?? Number.MAX_SAFE_INTEGER;
        if (va !== vb) return va - vb;
        return a.order - b.order;
      });
      const needle = caseSensitive ? q : q.toLowerCase();
      const found: SearchResult[] = [];
      for (const chapter of sorted) {
        if (found.length >= MAX_RESULTS) break;
        const titleHay = caseSensitive ? chapter.title : chapter.title.toLowerCase();
        if (titleHay.includes(needle)) {
          found.push({
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            volumeId: chapter.parentId,
            inTitle: true,
          });
        }
        let text = "";
        try {
          text = stripHtml(await getChapterContent(chapter.id));
        } catch {
          continue;
        }
        const bodyHay = caseSensitive ? text : text.toLowerCase();
        let idx = 0;
        while (found.length < MAX_RESULTS) {
          const hit = bodyHay.indexOf(needle, idx);
          if (hit === -1) break;
          found.push({
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            volumeId: chapter.parentId,
            inTitle: false,
            ...excerpt(text, hit, q.length),
          });
          idx = hit + q.length;
        }
      }
      if (searchToken.current === token) {
        setResults(found);
        setActiveIndex(0);
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, structureSig, caseSensitive, getChapterContent]);

  const grouped = useMemo(() => {
    const volumeTitle = new Map(volumes.map((v) => [v.id, v.title]));
    const groups: { key: string; label: string; items: SearchResult[] }[] = [];
    const byKey = new Map<string, SearchResult[]>();
    for (const r of results) {
      const key = r.volumeId || "";
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(r);
    }
    for (const [key, items] of byKey) {
      groups.push({
        key,
        label: key ? volumeTitle.get(key) || "未命名卷" : "未分类章节",
        items,
      });
    }
    return groups;
  }, [results, volumes]);

  const jump = (result: SearchResult) => {
    const chapter = chaptersRef.current.find((c) => c.id === result.chapterId);
    if (chapter) {
      setCurrentChapter(chapter);
    }
    onClose();
  };

  // Body matches per chapter, in document order — the ordinal of a result
  // within its chapter is what replaceInChapter("one") targets.
  const bodyResults = useMemo(() => results.filter((r) => !r.inTitle), [results]);

  const replaceOne = async (result: SearchResult) => {
    if (replacing || result.inTitle) return;
    setReplacing(true);
    setReplaceNotice(null);
    try {
      const perChapter = bodyResults.filter((r) => r.chapterId === result.chapterId);
      const ordinalInChapter = perChapter.findIndex((r) => r === result);
      const { replaced, skipped } = await replaceInChapter(
        result.chapterId,
        query.trim(),
        replacement,
        caseSensitive,
        { type: "one", ordinal: ordinalInChapter },
      );
      if (replaced === 0 && skipped > 0) {
        setReplaceNotice("该匹配跨越格式标签，无法安全替换，已跳过");
      }
      // 本地移除该条结果；其余匹配在磁盘上已位移，但序号是随搜随算的，
      // 下一次替换会重新从磁盘取内容计算，不受影响。
      setResults((prev) => prev.filter((r) => r !== result));
      setActiveIndex((i) => Math.max(0, Math.min(i, results.length - 2)));
    } finally {
      setReplacing(false);
    }
  };

  const replaceAll = async () => {
    if (replacing || bodyResults.length === 0) return;
    if (!window.confirm(`将全书 ${bodyResults.length} 处正文匹配替换为「${replacement}」？\n（跨越格式标签的匹配会自动跳过，章节标题不受影响）`)) {
      return;
    }
    setReplacing(true);
    setReplaceNotice(null);
    try {
      const chapterIds = [...new Set(bodyResults.map((r) => r.chapterId))];
      let total = 0;
      let skipped = 0;
      for (const id of chapterIds) {
        const r = await replaceInChapter(id, query.trim(), replacement, caseSensitive, { type: "all" });
        total += r.replaced;
        skipped += r.skipped;
      }
      setReplaceNotice(
        skipped > 0
          ? `已替换 ${total} 处；${skipped} 处因跨越格式标签被跳过`
          : `已替换 ${total} 处`,
      );
      setResults([]);
    } finally {
      setReplacing(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[activeIndex];
      if (r) jump(r);
    }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  let flatIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[12vh] animate-[inkwell-fade-in_0.15s_ease-out]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-warm-gray bg-paper shadow-2xl dark:border-warm-gray-dark dark:bg-paper-dark animate-[inkwell-pop-in_0.15s_ease-out]">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-warm-gray px-4 dark:border-warm-gray-dark">
          <button
            onClick={() => setReplaceOpen((v) => !v)}
            className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
            title={replaceOpen ? "收起替换" : "展开替换"}
          >
            {replaceOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <Search size={16} className="shrink-0 text-ink-muted dark:text-ink-muted-dark" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="在全部章节中搜索…（↑↓ 选择，Enter 跳转）"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted/60 dark:text-ink-dark dark:placeholder:text-ink-muted-dark/60"
          />
          <button
            onClick={() => setCaseSensitive((v) => !v)}
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
              caseSensitive
                ? "bg-accent/10 text-accent dark:bg-accent/20"
                : "text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark",
            )}
            title="区分大小写"
          >
            <CaseSensitive size={15} />
          </button>
          <button
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
            title="关闭 (Esc)"
          >
            <X size={15} />
          </button>
        </div>

        {replaceOpen && (
          <div className="flex shrink-0 items-center gap-2 border-b border-warm-gray px-4 py-2 dark:border-warm-gray-dark">
            <span className="w-5 shrink-0" />
            <Replace size={15} className="shrink-0 text-ink-muted dark:text-ink-muted-dark" />
            <input
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              placeholder="替换为…"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted/60 dark:text-ink-dark dark:placeholder:text-ink-muted-dark/60"
            />
            <button
              onClick={replaceAll}
              disabled={replacing || bodyResults.length === 0 || !query.trim()}
              className="flex shrink-0 items-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-40 dark:bg-accent/20"
              title="替换全部章节的正文匹配（标题不受影响）"
            >
              <ReplaceAll size={13} />
              全部替换{bodyResults.length > 0 ? `（${bodyResults.length}）` : ""}
            </button>
          </div>
        )}
        {replaceNotice && (
          <div className="shrink-0 border-b border-warm-gray bg-accent/5 px-4 py-1.5 text-xs text-ink-muted dark:border-warm-gray-dark dark:text-ink-muted-dark">
            {replaceNotice}
          </div>
        )}

        <div ref={listRef} className="flex-1 overflow-y-auto p-2">
          {query.trim() && !searching && results.length === 0 && (
            <div className="py-10 text-center text-sm text-ink-muted dark:text-ink-muted-dark">
              没有找到与「{query.trim()}」相关的内容
            </div>
          )}
          {!query.trim() && (
            <div className="py-10 text-center text-sm text-ink-muted dark:text-ink-muted-dark">
              输入关键词，搜索本书全部章节的标题与正文
            </div>
          )}
          {grouped.map((group) => (
            <div key={group.key || "orphan"} className="mb-1">
              <div className="px-2 pb-1 pt-2 text-xs font-medium text-ink-muted dark:text-ink-muted-dark">
                {group.label}
              </div>
              {group.items.map((r) => {
                flatIndex += 1;
                const idx = flatIndex;
                return (
                  <button
                    key={`${r.chapterId}-${idx}`}
                    data-index={idx}
                    onClick={() => jump(r)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                      idx === activeIndex
                        ? "bg-accent/10 dark:bg-accent/20"
                        : "hover:bg-warm-gray dark:hover:bg-warm-gray-dark",
                    )}
                  >
                    <FileText size={14} className="mt-0.5 shrink-0 text-ink-muted dark:text-ink-muted-dark" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-medium text-ink dark:text-ink-dark">
                        <span className="truncate">{r.chapterTitle}</span>
                        {r.inTitle && (
                          <span className="shrink-0 rounded bg-accent/10 px-1 py-px text-[10px] text-accent dark:bg-accent/20">
                            标题匹配
                          </span>
                        )}
                      </div>
                      {!r.inTitle && (
                        <div className="mt-0.5 truncate text-xs text-ink-muted dark:text-ink-muted-dark">
                          {r.before}
                          <mark className="bg-accent/25 text-ink dark:bg-accent/40 dark:text-ink-dark">
                            {r.match}
                          </mark>
                          {r.after}
                        </div>
                      )}
                    </div>
                    {replaceOpen && !r.inTitle && (
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          replaceOne(r);
                        }}
                        className={cn(
                          "mt-0.5 flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-accent transition-colors hover:bg-accent/10 dark:hover:bg-accent/20",
                          replacing && "pointer-events-none opacity-40",
                        )}
                        title={`替换为「${replacement}」`}
                      >
                        <Replace size={11} />
                        替换
                      </span>
                    )}
                    <ChevronRight size={14} className="mt-1 shrink-0 text-ink-muted/50 dark:text-ink-muted-dark/50" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {results.length >= MAX_RESULTS && (
          <div className="shrink-0 border-t border-warm-gray px-4 py-1.5 text-center text-[11px] text-ink-muted dark:border-warm-gray-dark dark:text-ink-muted-dark">
            结果过多，仅显示前 {MAX_RESULTS} 条，请细化关键词
          </div>
        )}
      </div>
    </div>
  );
}
