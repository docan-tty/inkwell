import { useRef, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Edit3, GripVertical, MoreVertical, Plus, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { useClickOutside } from "../../hooks/useClickOutside";
import { EditableLabel } from "./EditableLabel";

interface VolumeItemProps {
  volume: { id: string; title: string };
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, data: { title: string }) => void;
  onDelete: (id: string) => void;
  onAddChapter: () => void;
  onDropChapter?: (chapterId: string) => void;
  onDragEnter?: () => void;
  /** Volume reordering via drag & drop (only enabled with 2+ volumes). */
  draggable?: boolean;
  onVolumeDragStart?: () => void;
  onVolumeDragEnd?: () => void;
  children: React.ReactNode;
}

export function VolumeItem({
  volume,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
  onAddChapter,
  onDropChapter,
  onDragEnter,
  draggable = false,
  onVolumeDragStart,
  onVolumeDragEnd,
  children,
}: VolumeItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selfDragging, setSelfDragging] = useState(false);
  const dragDepth = useRef(0);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  const canDrop = Boolean(onDropChapter);

  const handleDragEnter = (e: React.DragEvent) => {
    if (!canDrop) return;
    // Ignore volume drags — those reorder volumes, not chapters.
    if (e.dataTransfer.types.includes("inkwell/volume-id")) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    setDragOver(true);
    if (!expanded) {
      onDragEnter?.();
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!canDrop) return;
    if (e.dataTransfer.types.includes("inkwell/volume-id")) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) {
      setDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!canDrop) return;
    if (e.dataTransfer.types.includes("inkwell/volume-id")) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!canDrop || !onDropChapter) return;
    if (e.dataTransfer.types.includes("inkwell/volume-id")) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragOver(false);
    const chapterId = e.dataTransfer.getData("inkwell/chapter-id");
    if (chapterId) {
      onDropChapter(chapterId);
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        "rounded-md border border-transparent transition-all duration-150",
        dragOver && "border-accent/50 bg-accent/10 dark:bg-accent/20",
        selfDragging && "opacity-40",
      )}
    >
      <div className="group flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors hover:bg-warm-gray dark:hover:bg-warm-gray-dark">
        {draggable && (
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("inkwell/volume-id", volume.id);
              e.dataTransfer.effectAllowed = "move";
              setSelfDragging(true);
              onVolumeDragStart?.();
            }}
            onDragEnd={() => {
              setSelfDragging(false);
              onVolumeDragEnd?.();
            }}
            className="flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-ink-muted opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-100 dark:text-ink-muted-dark"
            title="拖拽调整卷顺序"
          >
            <GripVertical size={12} />
          </span>
        )}
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
                  onDelete(volume.id);
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
      {expanded && children}
    </div>
  );
}
