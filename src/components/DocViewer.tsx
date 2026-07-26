import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAppStore } from "../store";
import { sanitizeHtml } from "../lib/export";

// 文档查看器(novelWriter Ctrl+R):只读渲染当前章节正文,与编辑器并存。
// 供对照参考/检查格式;内容与编辑器共享同一份磁盘数据,随 contentVersion 刷新。
export function DocViewer() {
  const open = useAppStore((s) => s.viewerOpen);
  const setViewerOpen = useAppStore((s) => s.setViewerOpen);
  const currentChapter = useAppStore((s) => s.currentChapter);
  const contentVersion = useAppStore((s) => s.contentVersion);
  const getChapterContent = useAppStore((s) => s.getChapterContent);
  const [html, setHtml] = useState("");

  useEffect(() => {
    if (!open || !currentChapter) return;
    void getChapterContent(currentChapter.id).then((c) => setHtml(sanitizeHtml(c))).catch(() => setHtml(""));
  }, [open, currentChapter?.id, contentVersion, getChapterContent]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setViewerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, setViewerOpen]);

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-[55] flex w-[46%] min-w-96 flex-col border-l border-warm-gray bg-paper shadow-2xl dark:border-warm-gray-dark dark:bg-paper-dark animate-[inkwell-slide-in-right_0.15s_ease-out]">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-warm-gray px-4 dark:border-warm-gray-dark">
        <span className="truncate text-sm font-medium text-ink dark:text-ink-dark">
          {currentChapter?.title ?? "文档查看"} <span className="ml-1 text-xs font-normal text-ink-muted dark:text-ink-muted-dark">只读</span>
        </span>
        <button onClick={() => setViewerOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark" title="关闭 (Ctrl+Shift+R)">
          <X size={16} />
        </button>
      </div>
      <div className="inkwell-editor min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {html ? (
          <div className="prose prose-stone dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p className="text-sm text-ink-muted dark:text-ink-muted-dark">（空文档）</p>
        )}
      </div>
    </div>
  );
}
