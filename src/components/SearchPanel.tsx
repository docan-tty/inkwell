import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, FileText, ChevronRight } from "lucide-react";
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
 * Project-wide full-text search (Ctrl+Shift+F). Searches every chapter's
 * title and body (HTML stripped to plain text), groups hits by volume order
 * like the chapter tree, and jumps to the chapter on click.
 */
export function SearchPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    chapters,
    volumes,
    setCurrentChapter,
    getChapterContent,
  } = useAppStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchToken = useRef(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
      // Focus after mount.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced full-project search. Reads every chapter's content via the
  // store accessor (disk with localStorage fallback), strips tags, and
  // collects matches in tree order (volume order, then chapter order).
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
      const volumeOrder = new Map(volumes.map((v) => [v.id, v.order]));
      const sorted = [...chapters].sort((a, b) => {
        const va = volumeOrder.get(a.parentId || "") ?? -1;
        const vb = volumeOrder.get(b.parentId || "") ?? -1;
        if (va !== vb) return va - vb;
        return a.order - b.order;
      });
      const lowerQ = q.toLowerCase();
      const found: SearchResult[] = [];
      for (const chapter of sorted) {
        if (found.length >= MAX_RESULTS) break;
        if (chapter.title.toLowerCase().includes(lowerQ)) {
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
        const lowerText = text.toLowerCase();
        let idx = 0;
        while (found.length < MAX_RESULTS) {
          const hit = lowerText.indexOf(lowerQ, idx);
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
  }, [query, open, chapters, volumes, getChapterContent]);

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
    const chapter = chapters.find((c) => c.id === result.chapterId);
    if (chapter) {
      setCurrentChapter(chapter);
    }
    onClose();
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
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
            title="关闭 (Esc)"
          >
            <X size={15} />
          </button>
        </div>

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
