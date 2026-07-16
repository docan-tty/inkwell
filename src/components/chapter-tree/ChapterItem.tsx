import { useRef, useState } from "react";
import { Edit3, FileText, GripVertical, MoreVertical, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { useClickOutside } from "../../hooks/useClickOutside";
import type { Chapter, ChapterStatus } from "../../types";
import { STATUS_LABELS } from "../../types";
import { EditableLabel } from "./EditableLabel";
import { StatusDot } from "./StatusDot";

interface ChapterItemProps {
  chapter: Chapter;
  active: boolean;
  onSelect: () => void;
  onUpdate: (id: string, data: Partial<Chapter>) => void;
  onDelete: (id: string) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function ChapterItem({ chapter, active, onSelect, onUpdate, onDelete, onDragStart, onDragEnd }: ChapterItemProps) {
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
        onDragStart?.();
      }}
      onDragEnd={() => {
        onDragEnd?.();
      }}
      onClick={onSelect}
      className={cn(
        "group relative flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-150 active:cursor-grabbing",
        active
          ? "bg-accent/10 text-accent dark:bg-accent/20"
          : "hover:bg-warm-gray dark:hover:bg-warm-gray-dark",
      )}
    >
      <StatusDot status={chapter.status} />
      <GripVertical
        size={12}
        className="shrink-0 cursor-grab text-ink-muted opacity-0 transition-opacity group-hover:opacity-100 dark:text-ink-muted-dark"
        aria-hidden
      />
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
      <span className="shrink-0 text-xs tabular-nums text-ink-muted dark:text-ink-muted-dark">
        {chapter.wordCount}
      </span>
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
          <div className="absolute right-0 top-7 z-10 w-32 rounded-lg border border-warm-gray bg-paper py-1 shadow-lg dark:border-warm-gray-dark dark:bg-paper-dark">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark"
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
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark"
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
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
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
