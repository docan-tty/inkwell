import { useEffect } from "react";
import { X } from "lucide-react";
import { formatDateTime } from "../lib/utils";

interface DraftRecovery {
  chapterId: string;
  draft: string;
  updatedAt: number;
}

interface RecoveryDialogProps {
  drafts: DraftRecovery[];
  chapterTitle: (chapterId: string) => string;
  onRestore: (chapterId: string, draft: string) => void;
  onDiscard: (chapterId: string) => void;
  onDismissAll: () => void;
}

/**
 * Shown on launch when the draft buffer holds content that never reached the
 * disk (crash / power loss). Each draft can be restored (written to the
 * chapter file) or discarded (buffer cleared, disk version kept).
 */
export function RecoveryDialog({
  drafts,
  chapterTitle,
  onRestore,
  onDiscard,
  onDismissAll,
}: RecoveryDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismissAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismissAll]);

  if (drafts.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/40 p-4 animate-[inkwell-fade-in_0.15s_ease-out]">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-warm-gray bg-paper shadow-2xl dark:border-warm-gray-dark dark:bg-paper-dark animate-[inkwell-pop-in_0.15s_ease-out]">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-warm-gray px-4 dark:border-warm-gray-dark">
          <span className="text-sm font-medium text-ink dark:text-ink-dark">恢复未保存的内容</span>
          <button
            onClick={onDismissAll}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
            title="稍后处理"
          >
            <X size={16} />
          </button>
        </div>
        <p className="shrink-0 px-4 pt-3 text-xs leading-relaxed text-ink-muted dark:text-ink-muted-dark">
          检测到 {drafts.length} 个章节存在未写入磁盘的内容（可能因意外关闭导致）。恢复草稿会覆盖磁盘上的章节文件。
        </p>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {drafts.map((d) => (
            <div
              key={d.chapterId}
              className="flex items-center justify-between gap-3 rounded-lg border border-warm-gray px-3 py-2.5 dark:border-warm-gray-dark"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink dark:text-ink-dark">
                  {chapterTitle(d.chapterId)}
                </div>
                <div className="text-xs text-ink-muted dark:text-ink-muted-dark">
                  草稿时间 {formatDateTime(d.updatedAt)}
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => onDiscard(d.chapterId)}
                  className="rounded-md px-2.5 py-1 text-xs text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
                >
                  丢弃
                </button>
                <button
                  onClick={() => onRestore(d.chapterId, d.draft)}
                  className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-light"
                >
                  恢复
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
