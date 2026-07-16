import { useCallback, useEffect, useState } from "react";
import { X, ListTree, History, RotateCcw, Eye, FileClock, NotebookPen, Plus, Trash2 } from "lucide-react";
import { useAppStore } from "../store";
import { listSnapshots, readSnapshot, type SnapshotInfo } from "../lib/snapshots";
import { stripHtml, sanitizeHtml } from "../lib/export";
import { formatDateTime, cn } from "../lib/utils";
import { ConfirmDialog } from "./ConfirmDialog";

export function RightPanel() {
  const { rightPanelTab, setRightPanelTab } = useAppStore();

  if (rightPanelTab === "none") return null;

  return (
    <div className="flex h-full w-72 flex-col border-l border-warm-gray bg-paper dark:border-warm-gray-dark dark:bg-paper-dark animate-[inkwell-slide-in-right_0.15s_ease-out]">
      <div className="flex h-12 items-center justify-between border-b border-warm-gray px-3 dark:border-warm-gray-dark">
        <div className="flex items-center gap-1">
          <PanelTab
            active={rightPanelTab === "outline"}
            onClick={() => setRightPanelTab("outline")}
            icon={<ListTree size={14} />}
            label="大纲"
          />
          <PanelTab
            active={rightPanelTab === "history"}
            onClick={() => setRightPanelTab("history")}
            icon={<History size={14} />}
            label="历史"
          />
          <PanelTab
            active={rightPanelTab === "notes"}
            onClick={() => setRightPanelTab("notes")}
            icon={<NotebookPen size={14} />}
            label="笔记"
          />
        </div>
        <button
          onClick={() => setRightPanelTab("none")}
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {rightPanelTab === "outline" && (
          <div className="h-full overflow-y-auto p-4">
            <OutlineView />
          </div>
        )}
        {rightPanelTab === "history" && (
          <div className="h-full overflow-y-auto p-4">
            <HistoryView />
          </div>
        )}
        {rightPanelTab === "notes" && <NotesView />}
      </div>
    </div>
  );
}

function PanelTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors",
        active
          ? "bg-accent/10 font-medium text-accent dark:bg-accent/20"
          : "text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function OutlineView() {
  const { chapters, volumes, currentChapter, setCurrentChapter } = useAppStore();

  // Display chapters grouped by volume order, then chapter order — matching
  // the left-hand chapter tree instead of the raw insertion order.
  const volumeOrder = new Map(volumes.map((v) => [v.id, v.order]));
  const sorted = [...chapters].sort((a, b) => {
    const va = volumeOrder.get(a.parentId || "") ?? -1;
    const vb = volumeOrder.get(b.parentId || "") ?? -1;
    if (va !== vb) return va - vb;
    return a.order - b.order;
  });

  return (
    <div className="space-y-1">
      {sorted.length === 0 && (
        <div className="text-sm text-ink-muted dark:text-ink-muted-dark">暂无章节，请在左侧章节树中创建。</div>
      )}
      {sorted.map((chapter) => (
        <button
          key={chapter.id}
          onClick={() => setCurrentChapter(chapter)}
          className={cn(
            "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
            currentChapter?.id === chapter.id
              ? "bg-accent/10 text-accent dark:bg-accent/20"
              : "text-ink hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark",
          )}
        >
          <div className="font-medium">{chapter.title}</div>
          {chapter.summary && (
            <div className="mt-0.5 truncate text-xs text-ink-muted dark:text-ink-muted-dark">{chapter.summary}</div>
          )}
        </button>
      ))}
    </div>
  );
}

// Version history of the current chapter: automatic snapshots taken while
// saving (one every few minutes when content changed). Preview shows the
// snapshot's plain text; restore overwrites the chapter file with it.
function HistoryView() {
  const { currentChapter, appSettings, restoreChapterContent, setCurrentChapter } = useAppStore();
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ timestamp: number; text: string } | null>(null);
  const [restoring, setRestoring] = useState<SnapshotInfo | null>(null);

  const refresh = useCallback(async () => {
    if (!currentChapter) {
      setSnapshots([]);
      return;
    }
    setLoading(true);
    try {
      setSnapshots(await listSnapshots(currentChapter.id, appSettings));
    } finally {
      setLoading(false);
    }
  }, [currentChapter?.id, appSettings]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setPreview(null);
  }, [currentChapter?.id]);

  if (!currentChapter) {
    return (
      <div className="text-sm text-ink-muted dark:text-ink-muted-dark">
        选择一个章节后，这里会显示它的历史版本。
      </div>
    );
  }

  const showPreview = async (snap: SnapshotInfo) => {
    try {
      const html = await readSnapshot(currentChapter.id, snap.timestamp, appSettings);
      setPreview({ timestamp: snap.timestamp, text: stripHtml(html) });
    } catch {
      setPreview({ timestamp: snap.timestamp, text: "（读取快照失败）" });
    }
  };

  const confirmRestore = async () => {
    if (!restoring || !currentChapter) return;
    const snap = restoring;
    setRestoring(null);
    try {
      const html = await readSnapshot(currentChapter.id, snap.timestamp, appSettings);
      // Sanitize before writing back — snapshots are our own files, but they
      // go straight into the editor's HTML pipeline.
      await restoreChapterContent(currentChapter.id, sanitizeHtml(html));
      // Nudge the workspace to reload the editor content.
      setCurrentChapter({ ...currentChapter });
    } catch (err) {
      alert(`恢复失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs leading-relaxed text-ink-muted dark:text-ink-muted-dark">
        写作过程中每 5 分钟自动保留一个快照（有实质改动时），最多保留最近 20 个。
      </p>
      {loading && snapshots.length === 0 && (
        <div className="py-6 text-center text-xs text-ink-muted dark:text-ink-muted-dark">加载中…</div>
      )}
      {!loading && snapshots.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <FileClock size={24} className="text-ink-muted/50 dark:text-ink-muted-dark/50" />
          <div className="text-xs text-ink-muted dark:text-ink-muted-dark">
            本章还没有历史版本。
            <br />
            继续写作，快照会自动生成。
          </div>
        </div>
      )}
      {snapshots.map((snap) => (
        <div
          key={snap.timestamp}
          className="rounded-lg border border-warm-gray px-3 py-2 dark:border-warm-gray-dark"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink dark:text-ink-dark">
              {formatDateTime(snap.timestamp)}
            </span>
            <span className="flex gap-1">
              <button
                onClick={() =>
                  preview?.timestamp === snap.timestamp ? setPreview(null) : showPreview(snap)
                }
                className="flex h-6 w-6 items-center justify-center rounded text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
                title="预览"
              >
                <Eye size={13} />
              </button>
              <button
                onClick={() => setRestoring(snap)}
                className="flex h-6 w-6 items-center justify-center rounded text-ink-muted transition-colors hover:bg-warm-gray hover:text-accent dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
                title="恢复到此版本"
              >
                <RotateCcw size={13} />
              </button>
            </span>
          </div>
          {preview?.timestamp === snap.timestamp && (
            <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-warm-gray/50 p-2 text-xs leading-relaxed text-ink-muted dark:bg-warm-gray-dark/40 dark:text-ink-muted-dark">
              {preview.text || "（空）"}
            </div>
          )}
        </div>
      ))}
      <ConfirmDialog
        open={restoring !== null}
        title="恢复历史版本？"
        message={`当前内容将被 ${restoring ? formatDateTime(restoring.timestamp) : ""} 的版本覆盖。\n建议先手动保存一次当前内容（会自动生成新快照）。`}
        confirmLabel="恢复"
        danger={false}
        onConfirm={confirmRestore}
        onCancel={() => setRestoring(null)}
      />
    </div>
  );
}

// --- Notes (写作笔记) -------------------------------------------------------
// Per-project scratch notes: 人物设定、灵感、伏笔. Two-pane — a compact note
// list on top, the active note's editor filling the rest. Content autosaves
// (debounced in the store) as you type.
function NotesView() {
  const { notes, activeNoteId, setActiveNote, addNote, updateNote, removeNote } = useAppStore();
  const active = notes.find((n) => n.id === activeNoteId) || null;
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col">
      {/* Note list */}
      <div className="shrink-0 border-b border-warm-gray dark:border-warm-gray-dark">
        <div className="flex items-center justify-between px-3 pb-1 pt-2">
          <span className="text-xs text-ink-muted dark:text-ink-muted-dark">
            {notes.length > 0 ? `${notes.length} 条笔记` : "随手记：人物 / 灵感 / 伏笔"}
          </span>
          <button
            onClick={addNote}
            className="flex h-6 w-6 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warm-gray hover:text-accent dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
            title="新建笔记"
          >
            <Plus size={15} />
          </button>
        </div>
        {notes.length > 0 && (
          <div className="flex gap-1 overflow-x-auto px-3 pb-2 scrollbar-hide">
            {notes.map((n) => (
              <button
                key={n.id}
                onClick={() => setActiveNote(n.id)}
                className={cn(
                  "shrink-0 rounded-md px-2 py-1 text-xs transition-colors",
                  n.id === activeNoteId
                    ? "bg-accent/15 font-medium text-accent"
                    : "text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark",
                )}
              >
                {n.title || "未命名"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Editor */}
      {active ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 px-3 pt-2">
            <input
              value={active.title}
              onChange={(e) => updateNote(active.id, { title: e.target.value })}
              placeholder="笔记标题"
              className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 text-sm font-medium text-ink outline-none placeholder:text-ink-muted/50 dark:text-ink-dark"
            />
            <button
              onClick={() => setConfirmingDelete(active.id)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-ink-muted-dark"
              title="删除笔记"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <textarea
            value={active.content}
            onChange={(e) => updateNote(active.id, { content: e.target.value })}
            placeholder="写点什么……（自动保存）"
            className="min-h-0 flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-muted/50 dark:text-ink-dark"
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <NotebookPen size={26} className="text-ink-muted/40 dark:text-ink-muted-dark/40" />
          <p className="text-xs leading-relaxed text-ink-muted dark:text-ink-muted-dark">
            还没有笔记。
            <br />
            记录人物设定、灵感片段、伏笔线索。
          </p>
          <button
            onClick={addNote}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-light"
          >
            <Plus size={14} />
            新建笔记
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmingDelete !== null}
        title="删除笔记？"
        message="这条笔记将被删除，且无法恢复。"
        confirmLabel="删除"
        danger
        onConfirm={() => {
          if (confirmingDelete) removeNote(confirmingDelete);
          setConfirmingDelete(null);
        }}
        onCancel={() => setConfirmingDelete(null)}
      />
    </div>
  );
}
