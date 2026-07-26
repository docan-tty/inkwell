import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAppStore } from "../store";
import { previewSplit } from "../lib/docops";
import { formatNumber } from "../lib/utils";

// 拆分文档对话框:选择标题级别,预览将拆出的片段,确认后执行;
// 可选把源文档移入回收站。
export function SplitDialog() {
  const target = useAppStore((s) => s.splitTarget);
  const setSplitTarget = useAppStore((s) => s.setSplitTarget);
  const splitChapter = useAppStore((s) => s.splitChapter);
  const getChapterContent = useAppStore((s) => s.getChapterContent);
  const [level, setLevel] = useState<1 | 2 | 3 | 4>(3);
  const [pieces, setPieces] = useState<{ title: string; words: number }[]>([]);
  const [trashSource, setTrashSource] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) return;
    setLevel(3);
    setTrashSource(true);
    void getChapterContent(target.id).then((html) => {
      setPieces(previewSplit(html, 3));
    });
  }, [target, getChapterContent]);

  useEffect(() => {
    if (!target) return;
    void getChapterContent(target.id).then((html) => {
      setPieces(previewSplit(html, level));
    });
  }, [level, target, getChapterContent]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setSplitTarget(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [target, setSplitTarget]);

  if (!target) return null;

  const run = async () => {
    setBusy(true);
    try {
      const n = await splitChapter(target.id, level, trashSource);
      if (n === 0) alert("该文档在所选级别没有可拆分的标题。");
      setSplitTarget(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 animate-[inkwell-fade-in_0.15s_ease-out]" onClick={() => setSplitTarget(null)}>
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-warm-gray bg-paper shadow-2xl dark:border-warm-gray-dark dark:bg-paper-dark animate-[inkwell-pop-in_0.15s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-warm-gray px-4 dark:border-warm-gray-dark">
          <span className="text-sm font-medium text-ink dark:text-ink-dark">按标题拆分「{target.title}」</span>
          <button onClick={() => setSplitTarget(null)} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark">
            <X size={16} />
          </button>
        </div>
        <div className="shrink-0 border-b border-warm-gray/60 px-4 py-3 dark:border-warm-gray-dark/60">
          <div className="flex items-center gap-2 text-sm text-ink dark:text-ink-dark">
            <span className="text-ink-muted dark:text-ink-muted-dark">拆分级别:</span>
            {([1, 2, 3, 4] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={
                  level === l
                    ? "rounded-md bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent dark:bg-accent/20"
                    : "rounded-md px-2.5 py-1 text-xs text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
                }
              >
                标题 {l}
              </button>
            ))}
          </div>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-ink-muted dark:text-ink-muted-dark">
            <input type="checkbox" checked={trashSource} onChange={(e) => setTrashSource(e.target.checked)} className="accent-[var(--accent)]" />
            拆分后把源文档移入回收站
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {pieces.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted dark:text-ink-muted-dark">该级别下没有可拆分的标题。</p>
          ) : (
            <div className="space-y-1">
              <p className="mb-2 text-xs text-ink-muted dark:text-ink-muted-dark">将拆出 {pieces.length} 个文档:</p>
              {pieces.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border border-warm-gray/60 px-3 py-1.5 text-sm dark:border-warm-gray-dark/60">
                  <span className="truncate text-ink dark:text-ink-dark">{p.title}</span>
                  <span className="ml-3 shrink-0 text-xs tabular-nums text-ink-muted dark:text-ink-muted-dark">{formatNumber(p.words)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-warm-gray px-4 py-3 dark:border-warm-gray-dark">
          <button onClick={() => setSplitTarget(null)} className="rounded-lg px-3.5 py-1.5 text-sm text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark">
            取消
          </button>
          <button
            onClick={() => void run()}
            disabled={busy || pieces.length === 0}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-light disabled:opacity-50"
          >
            {busy ? "拆分中…" : `拆分为 ${pieces.length} 个文档`}
          </button>
        </div>
      </div>
    </div>
  );
}
