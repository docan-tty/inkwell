import { memo, useEffect, useRef, useState } from "react";
import { ArchiveRestore, Edit3, Eye, EyeOff, FileText, GripVertical, Merge, MoreVertical, Scissors, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { useClickOutside } from "../../hooks/useClickOutside";
import { useAppStore } from "../../store";
import type { Chapter, ChapterStatus } from "../../types";
import { STATUS_LABELS } from "../../types";
import { EditableLabel } from "./EditableLabel";
import { StatusDot } from "./StatusDot";

interface ChapterItemProps {
  chapter: Chapter;
  active: boolean;
  inTrash?: boolean;
  onSelect: () => void;
  onUpdate: (id: string, data: Partial<Chapter>) => void;
  onDelete: (id: string) => void;
  onTrash?: () => void;
  onRestore?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** 外部触发重命名(菜单「重命名项」F2):时间戳变化且本项 active 时进入编辑。 */
  renameSignal?: number;
}

export const ChapterItem = memo(function ChapterItem({
  chapter,
  active,
  inTrash = false,
  onSelect,
  onUpdate,
  onDelete,
  onTrash,
  onRestore,
  onDragStart,
  onDragEnd,
  renameSignal,
}: ChapterItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  // F2 / 菜单「重命名项」:激活项收到信号即进入重命名。
  useEffect(() => {
    if (renameSignal && active) setEditing(true);
  }, [renameSignal, active]);

  const cycleStatus = () => {
    const order: ChapterStatus[] = ["draft", "editing", "review", "done"];
    const next = order[(order.indexOf(chapter.status) + 1) % order.length];
    onUpdate(chapter.id, { status: next });
  };

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative flex items-center gap-2 rounded-md px-2 py-1.5 transition-all duration-150",
        dragging && "opacity-40",
        chapter.inactive && "opacity-60",
        active
          ? "bg-warm-gray text-ink dark:bg-warm-gray-dark dark:text-ink-dark"
          : "hover:bg-warm-gray dark:hover:bg-warm-gray-dark",
      )}
    >
      <span
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("inkwell/chapter-id", chapter.id);
          e.dataTransfer.effectAllowed = "move";
          setDragging(true);
          onDragStart?.();
        }}
        onDragEnd={() => {
          setDragging(false);
          onDragEnd?.();
        }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-ink-muted transition-opacity active:cursor-grabbing dark:text-ink-muted-dark",
          dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        title="拖拽调整顺序"
      >
        <GripVertical size={12} />
      </span>
      <StatusDot status={chapter.status} />
      <FileText size={14} className="shrink-0 text-ink-muted dark:text-ink-muted-dark" />
      <EditableLabel
        value={chapter.title}
        onSave={(title) => onUpdate(chapter.id, { title })}
        editing={editing}
        onEditingChange={setEditing}
        className={cn(
          "flex-1 text-sm",
          active ? "font-medium text-ink dark:text-ink-dark" : "text-ink dark:text-ink-dark",
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
          <div className="absolute right-0 top-7 z-10 w-40 rounded-lg border border-warm-gray bg-paper py-1 shadow-lg dark:border-warm-gray-dark dark:bg-paper-dark">
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
                onUpdate(chapter.id, { inactive: !chapter.inactive });
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark"
            >
              {chapter.inactive ? <Eye size={12} /> : <EyeOff size={12} />}
              {chapter.inactive ? "设为激活" : "设为非激活"}
            </button>
            {!inTrash && (
              <>
                <div className="mx-2 my-1 border-t border-warm-gray dark:border-warm-gray-dark" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    useAppStore.getState().setSplitTarget(chapter);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark"
                >
                  <Scissors size={12} />
                  按标题拆分…
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    useAppStore.getState().setMergeTarget({ parentId: chapter.id, isVolume: false });
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark"
                >
                  <Merge size={12} />
                  合并子文档…
                </button>
              </>
            )}
            {inTrash ? (
              <>
                <div className="mx-2 my-1 border-t border-warm-gray dark:border-warm-gray-dark" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestore?.();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark"
                >
                  <ArchiveRestore size={12} />
                  恢复
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
                  永久删除
                </button>
              </>
            ) : (
              <>
                <div className="mx-2 my-1 border-t border-warm-gray dark:border-warm-gray-dark" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTrash?.();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
                >
                  <Trash2 size={12} />
                  移入回收站
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
