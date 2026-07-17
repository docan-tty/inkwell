import { useMemo, useState } from "react";
import { Pin, Plus, Search, StickyNote, Trash2 } from "lucide-react";
import { useAppStore } from "../../store";
import { cn } from "../../lib/utils";
import { formatDateTime } from "../../lib/utils";
import type { Note } from "../../types";
import { ConfirmDialog } from "../ConfirmDialog";

// 写作笔记：左侧栏页签内的独立编辑区。笔记以纵向列表管理（与目录类似），
// 支持置顶（置顶区固定在最前）、搜索标题/内容；下方是当前笔记的编辑区，
// 输入即防抖自动保存。
export function NotesView() {
  const { notes, activeNoteId, setActiveNote, addNote, updateNote, removeNote } = useAppStore();
  const active = notes.find((n) => n.id === activeNoteId) || null;
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q),
    );
  }, [notes, query]);

  // 排序：置顶在前（按更新时间），其余按更新时间。列表顺序即展示顺序，
  // 不改动存储顺序，避免「写一个字导致笔记在列表里跳动」。
  // 依赖用 notes/query（filtered 由它们派生），保证引用稳定、不触发
  // React 的 hook-deps 警告。
  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes, query],
  );
  const pinnedCount = useMemo(() => sorted.filter((n) => n.pinned).length, [sorted]);

  return (
    <div className="flex h-full flex-col">
      {/* 工具行：计数 + 新建；有搜索时下面出现搜索框 */}
      <div className="shrink-0 space-y-1.5 border-b border-warm-gray px-3 pb-2 pt-2 dark:border-warm-gray-dark">
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-muted dark:text-ink-muted-dark">
            {notes.length > 0 ? `${notes.length} 条笔记` : "随手记：人物 / 灵感 / 伏笔"}
          </span>
          <div className="flex items-center gap-1">
            {notes.length > 0 && (
              <button
                onClick={() => {
                  if (searchOpen) setQuery("");
                  setSearchOpen(!searchOpen);
                }}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
                  searchOpen
                    ? "bg-accent/10 text-accent dark:bg-accent/20"
                    : "text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark",
                )}
                title="搜索笔记"
              >
                <Search size={13} />
              </button>
            )}
            <button
              onClick={addNote}
              className="flex h-6 w-6 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warm-gray hover:text-accent dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
              title="新建笔记"
            >
              <Plus size={15} />
            </button>
          </div>
        </div>
        {searchOpen && (
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索笔记标题 / 内容"
            className="w-full rounded-md border border-warm-gray bg-paper px-2 py-1 text-xs text-ink outline-none transition-colors placeholder:text-ink-muted/50 focus:border-accent dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark"
          />
        )}
      </div>

      {/* 笔记列表：章卷式纵向列表，置顶分组 */}
      <div className="max-h-48 shrink-0 overflow-y-auto border-b border-warm-gray dark:border-warm-gray-dark">
        {sorted.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-ink-muted dark:text-ink-muted-dark">
            {notes.length === 0 ? "还没有笔记，点右上角 + 记录第一条" : "没有匹配的笔记"}
          </div>
        ) : (
          sorted.map((n, idx) => (
            <div key={n.id}>
              {n.pinned && idx === 0 && (
                <div className="flex items-center gap-1 px-3 pb-0.5 pt-1.5 text-[10px] text-ink-muted/70 dark:text-ink-muted-dark/70">
                  <Pin size={9} />
                  置顶
                </div>
              )}
              {!n.pinned && idx === pinnedCount && pinnedCount > 0 && (
                <div className="px-3 pb-0.5 pt-1.5 text-[10px] text-ink-muted/70 dark:text-ink-muted-dark/70">
                  全部笔记
                </div>
              )}
              <NoteRow
                note={n}
                active={n.id === activeNoteId}
                onSelect={() => setActiveNote(n.id)}
                onTogglePin={() => updateNote(n.id, { pinned: !n.pinned })}
              />
            </div>
          ))
        )}
      </div>

      {/* 编辑区 */}
      {active ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-1 px-3 pt-2">
            <input
              value={active.title}
              onChange={(e) => updateNote(active.id, { title: e.target.value })}
              placeholder="笔记标题"
              className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 text-sm font-medium text-ink outline-none placeholder:text-ink-muted/50 dark:text-ink-dark"
            />
            <button
              onClick={() => updateNote(active.id, { pinned: !active.pinned })}
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors",
                active.pinned
                  ? "text-accent"
                  : "text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark",
              )}
              title={active.pinned ? "取消置顶" : "置顶这条笔记"}
            >
              <Pin size={13} className={cn(active.pinned && "fill-current")} />
            </button>
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
          <StickyNote size={26} className="text-ink-muted/40 dark:text-ink-muted-dark/40" />
          <p className="text-xs leading-relaxed text-ink-muted dark:text-ink-muted-dark">
            {notes.length === 0 ? (
              <>
                还没有笔记。
                <br />
                记录人物设定、灵感片段、伏笔线索。
              </>
            ) : (
              "从上方列表选择一条笔记开始编辑"
            )}
          </p>
          {notes.length === 0 && (
            <button
              onClick={addNote}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-light"
            >
              <Plus size={14} />
              新建笔记
            </button>
          )}
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

// 单条笔记行：标题 + 内容摘要，悬停出现置顶按钮；置顶项常驻图钉。
function NoteRow({
  note,
  active,
  onSelect,
  onTogglePin,
}: {
  note: Note;
  active: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
}) {
  const preview = note.content.replace(/\s+/g, " ").trim();
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative flex cursor-pointer items-center gap-2 px-3 py-1.5 transition-colors",
        active
          ? "bg-accent/10 dark:bg-accent/20"
          : "hover:bg-warm-gray dark:hover:bg-warm-gray-dark",
      )}
    >
      {active && <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent" />}
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-sm",
            active ? "font-medium text-accent" : "text-ink dark:text-ink-dark",
          )}
        >
          {note.title || "未命名"}
        </div>
        {preview && (
          <div className="truncate text-[11px] text-ink-muted dark:text-ink-muted-dark">
            {preview}
          </div>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors",
          note.pinned
            ? "text-accent"
            : "text-ink-muted opacity-0 hover:bg-warm-gray group-hover:opacity-100 dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark",
        )}
        title={note.pinned ? "取消置顶" : "置顶"}
      >
        <Pin size={11} className={cn(note.pinned && "fill-current")} />
      </button>
    </div>
  );
}
