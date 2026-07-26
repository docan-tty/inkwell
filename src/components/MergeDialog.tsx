import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useAppStore } from "../store";
import type { Chapter } from "../types";
import { formatNumber, cn } from "../lib/utils";

// 合并文档对话框:列出目标(父文档或文件夹)下的子文档,可勾选排除、
// 上下调序,确认后合并为一个新文档,源文档移入回收站。
export function MergeDialog() {
  const target = useAppStore((s) => s.mergeTarget);
  const setMergeTarget = useAppStore((s) => s.setMergeTarget);
  const mergeChapters = useAppStore((s) => s.mergeChapters);
  const chaptersAll = useAppStore((s) => s.chapters);
  const volumes = useAppStore((s) => s.volumes);
  const [selected, setSelected] = useState<string[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const children = useMemo(() => {
    if (!target) return [];
    return chaptersAll
      .filter((c) => c.parentId === target.parentId)
      .sort((a, b) => a.order - b.order);
  }, [target, chaptersAll]);

  useEffect(() => {
    if (!target) return;
    setSelected(children.map((c) => c.id));
    const parentName = target.isVolume
      ? (volumes.find((v) => v.id === target.parentId)?.title ?? "合并文档")
      : (chaptersAll.find((c) => c.id === target.parentId)?.title ?? "合并文档");
    setNewTitle(`${parentName}(合并)`);
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setMergeTarget(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [target, setMergeTarget]);

  if (!target) return null;

  const move = (id: string, dir: -1 | 1) => {
    setSelected((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  };

  const run = async () => {
    if (selected.length < 2) return;
    setBusy(true);
    try {
      await mergeChapters(selected, target.parentId, newTitle.trim() || "合并文档");
      setMergeTarget(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 animate-[inkwell-fade-in_0.15s_ease-out]" onClick={() => setMergeTarget(null)}>
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-warm-gray bg-paper shadow-2xl dark:border-warm-gray-dark dark:bg-paper-dark animate-[inkwell-pop-in_0.15s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-warm-gray px-4 dark:border-warm-gray-dark">
          <span className="text-sm font-medium text-ink dark:text-ink-dark">合并文档</span>
          <button onClick={() => setMergeTarget(null)} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark">
            <X size={16} />
          </button>
        </div>
        <div className="shrink-0 border-b border-warm-gray/60 px-4 py-3 dark:border-warm-gray-dark/60">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="新文档标题"
            className="w-full rounded-lg border border-warm-gray bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark"
          />
          <p className="mt-1.5 text-xs text-ink-muted dark:text-ink-muted-dark">
            选中的 {selected.length} 个文档将按顺序合并为一个新文档,源文档移入回收站。
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {children.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted dark:text-ink-muted-dark">该位置下没有可合并的文档。</p>
          ) : (
            <div className="space-y-1">
              {children.map((c: Chapter) => {
                const idx = selected.indexOf(c.id);
                const included = idx >= 0;
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
                      included ? "border-accent/40 bg-accent/5 dark:bg-accent/10" : "border-warm-gray/60 opacity-60 dark:border-warm-gray-dark/60",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={included}
                      onChange={() =>
                        setSelected((prev) => (included ? prev.filter((x) => x !== c.id) : [...prev, c.id]))
                      }
                      className="accent-[var(--accent)]"
                    />
                    <span className="min-w-0 flex-1 truncate text-ink dark:text-ink-dark">{c.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-ink-muted dark:text-ink-muted-dark">
                      {formatNumber(c.wordCount)}
                    </span>
                    {included && (
                      <span className="flex shrink-0">
                        <button onClick={() => move(c.id, -1)} className="flex h-5 w-5 items-center justify-center rounded text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark" title="上移">
                          <ArrowUp size={12} />
                        </button>
                        <button onClick={() => move(c.id, 1)} className="flex h-5 w-5 items-center justify-center rounded text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark" title="下移">
                          <ArrowDown size={12} />
                        </button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-warm-gray px-4 py-3 dark:border-warm-gray-dark">
          <button onClick={() => setMergeTarget(null)} className="rounded-lg px-3.5 py-1.5 text-sm text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark">
            取消
          </button>
          <button
            onClick={() => void run()}
            disabled={busy || selected.length < 2}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-light disabled:opacity-50"
          >
            {busy ? "合并中…" : `合并 ${selected.length} 个文档`}
          </button>
        </div>
      </div>
    </div>
  );
}
