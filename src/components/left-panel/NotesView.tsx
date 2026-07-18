import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  GripVertical,
  Pencil,
  Pin,
  Plus,
  Search,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { useAppStore } from "../../store";
import { cn, formatDateTime } from "../../lib/utils";
import type { Note } from "../../types";
import { ConfirmDialog } from "../ConfirmDialog";

const UNFILED = "__unfiled__";
const MIN_LIST_HEIGHT = 96;
const MAX_LIST_HEIGHT = 480;
// dragData 类型标记：区分笔记拖放与其他拖拽（如章节树）。
const NOTE_DRAG_TYPE = "application/x-inkwell-note";

// 写作笔记：左侧栏页签内的独立编辑区。笔记按文件夹分组展示（可折叠，
// 类似章卷的汇聚方式），支持置顶、搜索、改名；列表区高度可通过分隔条
// 拖拽调整；下方是当前笔记的编辑区，输入即防抖自动保存。
export function NotesView() {
  const notes = useAppStore((s) => s.notes);
  const activeNoteId = useAppStore((s) => s.activeNoteId);
  const setActiveNote = useAppStore((s) => s.setActiveNote);
  const addNote = useAppStore((s) => s.addNote);
  const updateNote = useAppStore((s) => s.updateNote);
  const removeNote = useAppStore((s) => s.removeNote);
  const renameNoteFolder = useAppStore((s) => s.renameNoteFolder);
  const dissolveNoteFolder = useAppStore((s) => s.dissolveNoteFolder);
  const appSettings = useAppStore((s) => s.appSettings);
  const updateAppSettings = useAppStore((s) => s.updateAppSettings);
  const active = notes.find((n) => n.id === activeNoteId) || null;
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [dissolvingFolder, setDissolvingFolder] = useState<string | null>(null);
  // 拖动归类：正在拖动的笔记 id + 当前高亮的放置目标（文件夹 key）。
  const [dragNoteId, setDragNoteId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q),
    );
  }, [notes, query]);

  // 分组：文件夹（按名称）在前，未归档在后；每组内置顶优先、再按更新时间。
  // 只改展示顺序，不动存储顺序，避免打字时列表跳动。
  // 依赖 notes/query（filtered 由它们派生），保证引用稳定、不触发 hook-deps 警告。
  const groups = useMemo(() => {
    const sortGroup = (list: Note[]) =>
      [...list].sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
    const byFolder = new Map<string, Note[]>();
    const unfiled: Note[] = [];
    for (const n of filtered) {
      const key = (n.folder ?? "").trim();
      if (!key) {
        unfiled.push(n);
      } else {
        if (!byFolder.has(key)) byFolder.set(key, []);
        byFolder.get(key)!.push(n);
      }
    }
    const result: { key: string; label: string; notes: Note[] }[] = [...byFolder.keys()]
      .sort((a, b) => a.localeCompare(b, "zh-CN"))
      .map((key) => ({ key, label: key, notes: sortGroup(byFolder.get(key)!) }));
    if (unfiled.length > 0 || result.length === 0) {
      result.push({ key: UNFILED, label: "未归档", notes: sortGroup(unfiled) });
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, query]);

  const searching = query.trim().length > 0;
  const listHeight = appSettings.notesListHeight ?? 192;

  // 分隔条拖拽：调整列表区高度，实时写入设置（与侧栏宽度同一套持久化）。
  const listRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const top = listRef.current?.getBoundingClientRect().top ?? 0;
      const h = Math.round(Math.min(MAX_LIST_HEIGHT, Math.max(MIN_LIST_HEIGHT, e.clientY - top)));
      updateAppSettings({ notesListHeight: h });
    };
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, updateAppSettings]);

  const toggleCollapsed = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const createFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    // 文件夹实体由其包含的笔记定义：放入第一条笔记即创建。
    addNote(name);
    setNewFolderName("");
    setNewFolderOpen(false);
  };

  const submitRename = () => {
    if (renamingFolder) renameNoteFolder(renamingFolder, renameDraft);
    setRenamingFolder(null);
  };

  // 拖放入文件夹 / 未归档：把笔记的 folder 字段改为目标分组。
  const dropNoteInto = (noteId: string, targetKey: string) => {
    const targetFolder = targetKey === UNFILED ? undefined : targetKey;
    const note = notes.find((n) => n.id === noteId);
    if (!note || (note.folder ?? "") === (targetFolder ?? "")) return;
    updateNote(noteId, { folder: targetFolder });
  };

  // 拖动期间若目标文件夹处于折叠状态，悬停片刻后自动展开。
  useEffect(() => {
    if (!dropTarget || dropTarget === UNFILED || !collapsed.has(dropTarget)) return;
    const timer = setTimeout(() => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(dropTarget);
        return next;
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [dropTarget, collapsed]);

  return (
    <div className="flex h-full flex-col">
      {/* 工具行：计数 + 搜索/新建文件夹/新建笔记 */}
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
              onClick={() => {
                setNewFolderOpen(!newFolderOpen);
                setNewFolderName("");
              }}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
                newFolderOpen
                  ? "bg-accent/10 text-accent dark:bg-accent/20"
                  : "text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark",
              )}
              title="新建文件夹"
            >
              <FolderPlus size={14} />
            </button>
            <button
              onClick={() => addNote()}
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
        {newFolderOpen && (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createFolder();
                if (e.key === "Escape") setNewFolderOpen(false);
              }}
              placeholder="文件夹名称，回车创建"
              className="min-w-0 flex-1 rounded-md border border-warm-gray bg-paper px-2 py-1 text-xs text-ink outline-none transition-colors placeholder:text-ink-muted/50 focus:border-accent dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark"
            />
            <button
              onClick={createFolder}
              disabled={!newFolderName.trim()}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-accent transition-colors hover:bg-accent/10 disabled:opacity-40"
              title="创建"
            >
              <Check size={13} />
            </button>
          </div>
        )}
      </div>

      {/* 笔记列表：文件夹分组（可折叠），高度可拖拽调整 */}
      <div ref={listRef} className="shrink-0 overflow-y-auto" style={{ height: listHeight }}>
        {groups.every((g) => g.notes.length === 0) ? (
          <div className="px-3 py-4 text-center text-xs text-ink-muted dark:text-ink-muted-dark">
            {notes.length === 0 ? "还没有笔记，点右上角 + 记录第一条" : "没有匹配的笔记"}
          </div>
        ) : (
          groups.map((group) => {
            if (group.notes.length === 0) return null;
            const isCollapsed = !searching && collapsed.has(group.key);
            return (
              <div key={group.key}>
                {/* 分组头：折叠箭头 + 文件夹名（双击改名）+ 文件夹操作。
                    整个分组头都是放置目标：拖到文件夹名上即归入该文件夹。 */}
                <div
                  className={cn(
                    "group/header flex items-center gap-1 rounded px-2 pb-0.5 pt-1.5 text-[10px] text-ink-muted/70 transition-colors dark:text-ink-muted-dark/70",
                    dropTarget === group.key && "bg-accent/15 text-accent ring-1 ring-accent/50 dark:bg-accent/25",
                  )}
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes(NOTE_DRAG_TYPE)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dropTarget !== group.key) setDropTarget(group.key);
                  }}
                  onDragLeave={() => setDropTarget((t) => (t === group.key ? null : t))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const noteId = e.dataTransfer.getData(NOTE_DRAG_TYPE) || dragNoteId;
                    if (noteId) dropNoteInto(noteId, group.key);
                    setDragNoteId(null);
                    setDropTarget(null);
                  }}
                  onDoubleClick={() => {
                    if (group.key === UNFILED) return;
                    setRenamingFolder(group.key);
                    setRenameDraft(group.label);
                  }}
                >
                  <button
                    onClick={() => toggleCollapsed(group.key)}
                    className="flex h-4 w-4 items-center justify-center rounded hover:bg-warm-gray dark:hover:bg-warm-gray-dark"
                    title={isCollapsed ? "展开" : "折叠"}
                  >
                    {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                  </button>
                  {renamingFolder === group.key ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={submitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitRename();
                        if (e.key === "Escape") setRenamingFolder(null);
                      }}
                      className="min-w-0 flex-1 rounded border border-accent/50 bg-paper px-1 py-0 text-[10px] text-ink outline-none dark:bg-paper-dark dark:text-ink-dark"
                    />
                  ) : (
                    <>
                      {group.key !== UNFILED && <Folder size={9} />}
                      <span
                        className={cn("flex-1 truncate", group.key !== UNFILED && "cursor-text")}
                        title={group.key !== UNFILED ? "双击重命名文件夹" : undefined}
                      >
                        {group.label}（{group.notes.length}）
                      </span>
                      {group.key !== UNFILED && (
                        <span className="flex items-center opacity-0 transition-opacity group-hover/header:opacity-100">
                          <button
                            onClick={() => addNote(group.label)}
                            className="flex h-4 w-4 items-center justify-center rounded hover:bg-warm-gray dark:hover:bg-warm-gray-dark"
                            title="在此文件夹新建笔记"
                          >
                            <Plus size={10} />
                          </button>
                          <button
                            onClick={() => {
                              setRenamingFolder(group.key);
                              setRenameDraft(group.label);
                            }}
                            className="flex h-4 w-4 items-center justify-center rounded hover:bg-warm-gray dark:hover:bg-warm-gray-dark"
                            title="重命名文件夹"
                          >
                            <Pencil size={9} />
                          </button>
                          <button
                            onClick={() => setDissolvingFolder(group.key)}
                            className="flex h-4 w-4 items-center justify-center rounded hover:bg-red-500/10 hover:text-red-500"
                            title="解散文件夹（笔记移回未归档）"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      )}
                    </>
                  )}
                </div>
                {!isCollapsed &&
                  group.notes.map((n) => (
                    <NoteRow
                      key={n.id}
                      note={n}
                      active={n.id === activeNoteId}
                      dragging={n.id === dragNoteId}
                      onSelect={() => setActiveNote(n.id)}
                      onTogglePin={() => updateNote(n.id, { pinned: !n.pinned })}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(NOTE_DRAG_TYPE, n.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragNoteId(n.id);
                      }}
                      onDragEnd={() => {
                        setDragNoteId(null);
                        setDropTarget(null);
                      }}
                    />
                  ))}
              </div>
            );
          })
        )}
      </div>

      {/* 分隔条：上下拖拽调整列表区高度 */}
      <div
        onPointerDown={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        className={cn(
          "flex h-2 shrink-0 cursor-row-resize items-center justify-center border-y border-warm-gray transition-colors hover:bg-warm-gray/70 dark:border-warm-gray-dark dark:hover:bg-warm-gray-dark/70",
          dragging && "bg-warm-gray dark:bg-warm-gray-dark",
        )}
        title="拖拽调整列表高度"
      >
        <span className="h-0.5 w-8 rounded-full bg-ink-muted/30 dark:bg-ink-muted-dark/30" />
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
            <FolderPicker note={active} onMove={(folder) => updateNote(active.id, { folder })} />
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
              onClick={() => addNote()}
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
      <ConfirmDialog
        open={dissolvingFolder !== null}
        title={`解散文件夹「${dissolvingFolder ?? ""}」？`}
        message="文件夹中的笔记不会被删除，会移回「未归档」。"
        confirmLabel="解散文件夹"
        danger={false}
        onConfirm={() => {
          if (dissolvingFolder) dissolveNoteFolder(dissolvingFolder);
          setDissolvingFolder(null);
        }}
        onCancel={() => setDissolvingFolder(null)}
      />
    </div>
  );
}

// 单条笔记行：标题 + 内容摘要，悬停出现置顶按钮；置顶项常驻图钉。
// 行可拖拽：拖到某个文件夹分组（或未归档区）即完成归类。
function NoteRow({
  note,
  active,
  dragging,
  onSelect,
  onTogglePin,
  onDragStart,
  onDragEnd,
}: {
  note: Note;
  active: boolean;
  dragging: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const preview = note.content.replace(/\s+/g, " ").trim();
  return (
    <div
      onClick={onSelect}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative flex cursor-pointer items-center gap-2 px-3 py-1.5 pl-6 transition-colors",
        active
          ? "bg-accent/10 dark:bg-accent/20"
          : "hover:bg-warm-gray dark:hover:bg-warm-gray-dark",
        dragging && "opacity-40",
      )}
    >
      {active && <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent" />}
      <GripVertical
        size={11}
        className="-ml-3 shrink-0 cursor-grab text-ink-muted/40 opacity-0 transition-opacity group-hover:opacity-100 dark:text-ink-muted-dark/40"
      />
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

// 笔记归属文件夹选择：当前笔记移到任意已有文件夹、新建文件夹或回到未归档。
function FolderPicker({ note, onMove }: { note: Note; onMove: (folder?: string) => void }) {
  const notes = useAppStore((s) => s.notes);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) {
      const f = (n.folder ?? "").trim();
      if (f) set.add(f);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [notes]);

  const current = (note.folder ?? "").trim();

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
          current
            ? "text-accent"
            : "text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark",
        )}
        title={current ? `移动到文件夹（当前：${current}）` : "移动到文件夹"}
      >
        <Folder size={13} className={cn(current && "fill-current")} />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 w-40 rounded-lg border border-warm-gray bg-paper py-1 shadow-lg dark:border-warm-gray-dark dark:bg-paper-dark">
          {folders.map((f) => (
            <button
              key={f}
              onClick={() => {
                onMove(f);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink transition-colors hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark"
            >
              <Folder size={11} className="shrink-0 text-ink-muted dark:text-ink-muted-dark" />
              <span className="flex-1 truncate">{f}</span>
              {current === f && <Check size={11} className="shrink-0 text-accent" />}
            </button>
          ))}
          {creating ? (
            <div className="flex items-center gap-1 px-2 py-1">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && draft.trim()) {
                    onMove(draft.trim());
                    setOpen(false);
                    setCreating(false);
                    setDraft("");
                  }
                  if (e.key === "Escape") setCreating(false);
                }}
                placeholder="新文件夹名称"
                className="min-w-0 flex-1 rounded border border-warm-gray bg-paper px-1.5 py-0.5 text-xs text-ink outline-none focus:border-accent dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark"
              />
            </div>
          ) : (
            <button
              onClick={() => {
                setCreating(true);
                setDraft("");
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
            >
              <FolderPlus size={11} />
              新建文件夹…
            </button>
          )}
          {current && (
            <>
              <div className="mx-2 my-1 border-t border-warm-gray dark:border-warm-gray-dark" />
              <button
                onClick={() => {
                  onMove(undefined);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
              >
                <X size={11} />
                移出文件夹（未归档）
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
