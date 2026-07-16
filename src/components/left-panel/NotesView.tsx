import { useState } from "react";
import { Plus, Trash2, NotebookPen } from "lucide-react";
import { useAppStore } from "../../store";
import { cn } from "../../lib/utils";
import { formatDateTime } from "../../lib/utils";
import { ConfirmDialog } from "../ConfirmDialog";

// 写作笔记：左侧栏页签内的独立编辑区。上方是笔记列表（横向页签式），
// 下方是当前笔记的标题 + 正文编辑区，输入即防抖自动保存。
export function NotesView() {
  const { notes, activeNoteId, setActiveNote, addNote, updateNote, removeNote } = useAppStore();
  const active = notes.find((n) => n.id === activeNoteId) || null;
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col">
      {/* 笔记列表：横向可滚动的标题页签 */}
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

      {/* 编辑区 */}
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
          <div className="shrink-0 border-t border-warm-gray px-3 py-1 text-[10px] text-ink-muted dark:border-warm-gray-dark dark:text-ink-muted-dark">
            更新于 {formatDateTime(active.updatedAt)}
          </div>
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
