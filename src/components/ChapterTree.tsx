import { useState, useRef, useEffect } from "react";
import {
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  Plus,
  MoreVertical,
  FileText,
  BookOpen,
  Trash2,
  Edit3,
} from "lucide-react";
import { useAppStore } from "../store";
import type { Chapter, ChapterStatus } from "../types";
import { STATUS_LABELS } from "../types";
import { cn } from "../lib/utils";
import { useClickOutside } from "../hooks/useClickOutside";

interface ChapterTreeProps {
  onSelectChapter: (chapter: Chapter) => void;
}

function StatusDot({ status }: { status: ChapterStatus }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        status === "draft" && "bg-warm-gray dark:bg-warm-gray-dark",
        status === "editing" && "bg-amber-500",
        status === "review" && "bg-blue-500",
        status === "done" && "bg-emerald-500",
      )}
      title={STATUS_LABELS[status]}
    />
  );
}

function EditableLabel({
  value,
  onSave,
  className,
  editing: controlledEditing,
  onEditingChange,
}: {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [internalEditing, setInternalEditing] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const editing = controlledEditing ?? internalEditing;
  const setEditing = (next: boolean) => {
    setInternalEditing(next);
    onEditingChange?.(next);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) setText(value);
  }, [value, editing]);

  const commit = () => {
    onSave(text.trim() || value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setText(value);
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full max-w-full box-border rounded border border-accent bg-paper px-1 py-0.5 text-sm outline-none dark:bg-paper-dark",
          className,
        )}
      />
    );
  }

  return (
    <span
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className={cn("cursor-text truncate", className)}
      title="双击重命名"
    >
      {value}
    </span>
  );
}

export function ChapterTree({ onSelectChapter }: ChapterTreeProps) {
  const {
    volumes,
    chapters,
    currentChapter,
    createVolume,
    createChapter,
    updateVolume,
    updateChapter,
    deleteVolume,
    deleteChapter,
    moveChapter,
  } = useAppStore();
  const [expandedVolumes, setExpandedVolumes] = useState<Set<string>>(
    () => new Set(volumes.map((v) => v.id)),
  );

  const toggleVolume = (id: string) => {
    setExpandedVolumes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allExpanded = volumes.length > 0 && volumes.every((v) => expandedVolumes.has(v.id));

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedVolumes(new Set());
    } else {
      setExpandedVolumes(new Set(volumes.map((v) => v.id)));
    }
  };

  const volumeChapters = (volumeId: string | null) =>
    chapters.filter((c) => c.parentId === volumeId).sort((a, b) => a.order - b.order);

  const orphanedChapters = volumeChapters(null);

  return (
    <div className="flex h-full flex-col bg-paper dark:bg-paper-dark">
      <div className="flex h-12 items-center justify-between border-b border-warm-gray px-3 dark:border-warm-gray-dark">
        <span className="text-sm font-medium text-ink dark:text-ink-dark">目录</span>
        <div className="flex gap-1">
          <button
            onClick={toggleAll}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink/70 hover:bg-warm-gray dark:text-ink-dark/70 dark:hover:bg-warm-gray-dark"
            title={allExpanded ? "折叠全部" : "展开全部"}
          >
            <ChevronsUpDown size={14} />
          </button>
          <button
            onClick={() => createVolume("新卷")}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink/70 hover:bg-warm-gray dark:text-ink-dark/70 dark:hover:bg-warm-gray-dark"
            title="新建卷"
          >
            <BookOpen size={14} />
          </button>
          <button
            onClick={() => createChapter(null, "新章节")}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink/70 hover:bg-warm-gray dark:text-ink-dark/70 dark:hover:bg-warm-gray-dark"
            title="新建章节"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {volumes.length === 0 && orphanedChapters.length === 0 && (
          <div className="mt-8 px-3 text-sm text-ink-muted dark:text-ink-muted-dark">
            还没有章节。
            <br />
            点击上方按钮创建卷或章节。
          </div>
        )}

        {volumes.map((volume) => {
          const expanded = expandedVolumes.has(volume.id);
          const children = volumeChapters(volume.id);
          return (
            <div key={volume.id} className="mb-1">
              <VolumeItem
                volume={volume}
                expanded={expanded}
                onToggle={() => toggleVolume(volume.id)}
                onUpdate={updateVolume}
                onDelete={deleteVolume}
                onAddChapter={() => {
                  setExpandedVolumes((prev) => new Set(prev).add(volume.id));
                  createChapter(volume.id, "新章节");
                }}
                onDropChapter={(chapterId) => moveChapter(chapterId, volume.id, 0)}
              >
                {expanded && (
                  <div className="ml-4 border-l border-warm-gray pl-2 dark:border-warm-gray-dark">
                    {children.map((chapter) => (
                      <ChapterItem
                        key={chapter.id}
                        chapter={chapter}
                        active={currentChapter?.id === chapter.id}
                        onSelect={() => onSelectChapter(chapter)}
                        onUpdate={updateChapter}
                        onDelete={deleteChapter}
                      />
                    ))}
                    {children.length === 0 && (
                      <div className="px-2 py-1 text-xs text-ink-muted dark:text-ink-muted-dark">空卷</div>
                    )}
                  </div>
                )}
              </VolumeItem>
            </div>
          );
        })}

        {orphanedChapters.length > 0 && (
          <div className="mt-2">
            {orphanedChapters.map((chapter) => (
              <ChapterItem
                key={chapter.id}
                chapter={chapter}
                active={currentChapter?.id === chapter.id}
                onSelect={() => onSelectChapter(chapter)}
                onUpdate={updateChapter}
                onDelete={deleteChapter}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function VolumeItem({
  volume,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
  onAddChapter,
  onDropChapter,
  children,
}: {
  volume: { id: string; title: string };
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, data: { title: string }) => void;
  onDelete: (id: string) => void;
  onAddChapter: () => void;
  onDropChapter?: (chapterId: string) => void;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  return (
    <div
      onDragOver={(e) => {
        if (!onDropChapter) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!onDropChapter) return;
        e.preventDefault();
        setDragOver(false);
        const chapterId = e.dataTransfer.getData("inkwell/chapter-id");
        if (chapterId && chapterId !== volume.id) {
          onDropChapter(chapterId);
        }
      }}
      className={cn("rounded-md", dragOver && "bg-accent/10 dark:bg-accent/20")}
    >
      <div className="group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-warm-gray dark:hover:bg-warm-gray-dark">
        <button
          onClick={onToggle}
          className="flex h-5 w-5 shrink-0 items-center justify-center text-ink-muted dark:text-ink-muted-dark"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <BookOpen size={14} className="shrink-0 text-accent" />
        <EditableLabel
          value={volume.title}
          onSave={(title) => onUpdate(volume.id, { title })}
          editing={editing}
          onEditingChange={setEditing}
          className="flex-1 text-sm font-medium text-ink dark:text-ink-dark"
        />
        <button
          onClick={onAddChapter}
          className="invisible flex h-6 w-6 items-center justify-center rounded text-ink-muted dark:text-ink-muted-dark hover:bg-warm-gray dark:hover:bg-warm-gray-dark group-hover:visible"
          title="在此卷下添加章节"
        >
          <Plus size={14} />
        </button>
        <div ref={menuRef} className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className="invisible flex h-6 w-6 items-center justify-center rounded text-ink-muted dark:text-ink-muted-dark hover:bg-warm-gray dark:hover:bg-warm-gray-dark group-hover:visible"
            title="卷操作"
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-10 w-32 rounded-md border border-warm-gray bg-paper py-1 shadow-lg dark:border-warm-gray-dark dark:bg-paper-dark">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark"
              >
                <Edit3 size={12} />
                重命名
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(volume.id);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-warm-gray dark:hover:bg-warm-gray-dark"
              >
                <Trash2 size={12} />
                删除
              </button>
            </div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function ChapterItem({
  chapter,
  active,
  onSelect,
  onUpdate,
  onDelete,
}: {
  chapter: Chapter;
  active: boolean;
  onSelect: () => void;
  onUpdate: (id: string, data: Partial<Chapter>) => void;
  onDelete: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  const cycleStatus = () => {
    const order: ChapterStatus[] = ["draft", "editing", "review", "done"];
    const next = order[(order.indexOf(chapter.status) + 1) % order.length];
    onUpdate(chapter.id, { status: next });
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("inkwell/chapter-id", chapter.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onSelect}
      className={cn(
        "group relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5",
        active
          ? "bg-accent/10 text-accent dark:bg-accent/20"
          : "hover:bg-warm-gray dark:hover:bg-warm-gray-dark",
      )}
    >
      <StatusDot status={chapter.status} />
      <FileText size={14} className="shrink-0 text-ink-muted dark:text-ink-muted-dark" />
      <EditableLabel
        value={chapter.title}
        onSave={(title) => onUpdate(chapter.id, { title })}
        editing={editing}
        onEditingChange={setEditing}
        className={cn(
          "flex-1 text-sm",
          active ? "font-medium text-accent" : "text-ink dark:text-ink-dark",
        )}
      />
      <span className="text-xs text-ink-muted dark:text-ink-muted-dark">{chapter.wordCount}</span>
      <div ref={menuRef} className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          className="invisible flex h-6 w-6 items-center justify-center rounded text-ink-muted dark:text-ink-muted-dark hover:bg-warm-gray dark:hover:bg-warm-gray-dark group-hover:visible"
        >
          <MoreVertical size={14} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-7 z-10 w-32 rounded-md border border-warm-gray bg-paper py-1 shadow-lg dark:border-warm-gray-dark dark:bg-paper-dark">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark"
            >
              <Edit3 size={12} />
              重命名
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                cycleStatus();
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark"
            >
              <StatusDot status={chapter.status} />
              状态: {STATUS_LABELS[chapter.status]}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(chapter.id);
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-warm-gray dark:hover:bg-warm-gray-dark"
            >
              <Trash2 size={12} />
              删除
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
