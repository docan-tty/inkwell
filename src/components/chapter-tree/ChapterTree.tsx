import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronsUpDown, Plus } from "lucide-react";
import { useAppStore } from "../../store";
import type { Chapter, Volume } from "../../types";
import { ChapterItem } from "./ChapterItem";
import { VolumeItem } from "./VolumeItem";
import { DropTarget } from "./DropTarget";
import { ConfirmDialog } from "../ConfirmDialog";
import { cn } from "../../lib/utils";

interface ChapterTreeProps {
  onSelectChapter: (chapter: Chapter) => void;
}

type DropPosition = {
  volumeId: string | null;
  index: number;
} | null;

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
    moveVolume,
  } = useAppStore();
  const [expandedVolumes, setExpandedVolumes] = useState<Set<string>>(
    () => new Set(volumes.map((v) => v.id)),
  );
  const [activeDrop, setActiveDrop] = useState<DropPosition>(null);
  const [draggingChapterId, setDraggingChapterId] = useState<string | null>(null);
  const [volumeDropIndex, setVolumeDropIndex] = useState<number | null>(null);
  const [draggingVolumeId, setDraggingVolumeId] = useState<string | null>(null);
  const [deletingChapter, setDeletingChapter] = useState<Chapter | null>(null);
  const [deletingVolume, setDeletingVolume] = useState<Volume | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sortedVolumes = [...volumes].sort((a, b) => a.order - b.order);

  // Keep the selected chapter visible: scroll it into view and make sure its
  // parent volume is expanded (C4 — opening a project jumps to the most
  // recently edited chapter, which may live in a collapsed volume).
  useEffect(() => {
    if (!currentChapter) return;
    if (currentChapter.parentId) {
      setExpandedVolumes((prev) => {
        if (prev.has(currentChapter.parentId!)) return prev;
        return new Set(prev).add(currentChapter.parentId!);
      });
    }
    const t = setTimeout(() => {
      scrollRef.current
        ?.querySelector(`[data-chapter-id="${currentChapter.id}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }, 50);
    return () => clearTimeout(t);
  }, [currentChapter?.id]);

  const toggleVolume = (id: string) => {
    setExpandedVolumes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandVolume = (id: string) => {
    setExpandedVolumes((prev) => new Set(prev).add(id));
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

  const handleDragStart = (chapterId: string) => {
    setDraggingChapterId(chapterId);
  };

  const handleDragEnd = () => {
    setDraggingChapterId(null);
    setActiveDrop(null);
  };

  const handleDrop = (volumeId: string | null, index: number) => {
    if (draggingChapterId) {
      moveChapter(draggingChapterId, volumeId, index);
    }
    setDraggingChapterId(null);
    setActiveDrop(null);
  };

  const handleVolumeDrop = (index: number) => {
    if (draggingVolumeId) {
      moveVolume(draggingVolumeId, index);
    }
    setDraggingVolumeId(null);
    setVolumeDropIndex(null);
  };

  const renderChapterList = (volumeId: string | null) => {
    const children = volumeChapters(volumeId);
    const isExpanded = volumeId === null || expandedVolumes.has(volumeId);
    if (!isExpanded) return null;

    return (
      <div className="ml-4 border-l border-warm-gray pl-2 dark:border-warm-gray-dark">
        {children.length === 0 ? (
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              setActiveDrop({ volumeId, index: 0 });
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setActiveDrop(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("inkwell/chapter-id");
              if (id) moveChapter(id, volumeId, 0);
              setActiveDrop(null);
              setDraggingChapterId(null);
            }}
            className={cn(
              "rounded-md px-2 py-3 text-center text-xs text-ink-muted transition-colors dark:text-ink-muted-dark",
              activeDrop?.volumeId === volumeId && activeDrop?.index === 0
                ? "bg-accent/10 text-accent dark:bg-accent/20"
                : "",
            )}
          >
            拖拽章节到此处
          </div>
        ) : (
          <>
            <DropTarget
              active={activeDrop?.volumeId === volumeId && activeDrop?.index === 0}
              onDrop={() => handleDrop(volumeId, 0)}
              onDragOver={(active) => setActiveDrop(active ? { volumeId, index: 0 } : null)}
            />
            {children.map((chapter, idx) => (
              <div key={chapter.id} data-chapter-id={chapter.id}>
                <ChapterItem
                  chapter={chapter}
                  active={currentChapter?.id === chapter.id}
                  onSelect={() => onSelectChapter(chapter)}
                  onUpdate={updateChapter}
                  onDelete={() => setDeletingChapter(chapter)}
                  onDragStart={() => handleDragStart(chapter.id)}
                  onDragEnd={handleDragEnd}
                />
                <DropTarget
                  active={activeDrop?.volumeId === volumeId && activeDrop?.index === idx + 1}
                  onDrop={() => handleDrop(volumeId, idx + 1)}
                  onDragOver={(active) =>
                    setActiveDrop(active ? { volumeId, index: idx + 1 } : null)
                  }
                />
              </div>
            ))}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-paper dark:bg-paper-dark">
      <div className="flex h-12 items-center justify-between border-b border-warm-gray px-3 dark:border-warm-gray-dark">
        <span className="text-sm font-medium text-ink dark:text-ink-dark">目录</span>
        <div className="flex gap-1">
          <button
            onClick={toggleAll}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink/70 transition-colors hover:bg-warm-gray dark:text-ink-dark/70 dark:hover:bg-warm-gray-dark"
            title={allExpanded ? "折叠全部" : "展开全部"}
          >
            <ChevronsUpDown size={14} />
          </button>
          <button
            onClick={() => createVolume("")}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink/70 transition-colors hover:bg-warm-gray dark:text-ink-dark/70 dark:hover:bg-warm-gray-dark"
            title="新建卷"
          >
            <BookOpen size={14} />
          </button>
          <button
            onClick={() => createChapter(null, "")}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink/70 transition-colors hover:bg-warm-gray dark:text-ink-dark/70 dark:hover:bg-warm-gray-dark"
            title="新建章节 (Ctrl+N)"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2">
        {volumes.length === 0 && orphanedChapters.length === 0 && (
          <div className="mt-8 px-3 text-sm leading-relaxed text-ink-muted dark:text-ink-muted-dark">
            还没有章节。
            <br />
            点击上方按钮创建卷或章节。
          </div>
        )}

        {/* Volume-level drop indicator before the first volume */}
        {sortedVolumes.length > 1 && (
          <DropTarget
            active={volumeDropIndex === 0}
            onDrop={() => handleVolumeDrop(0)}
            onDragOver={(active) => setVolumeDropIndex(active ? 0 : null)}
            accepts="inkwell/volume-id"
          />
        )}

        {sortedVolumes.map((volume, idx) => (
          <div key={volume.id} className="mb-1">
            <VolumeItem
              volume={volume}
              expanded={expandedVolumes.has(volume.id)}
              onToggle={() => toggleVolume(volume.id)}
              onUpdate={updateVolume}
              onDelete={() => setDeletingVolume(volume)}
              onAddChapter={() => {
                expandVolume(volume.id);
                createChapter(volume.id, "");
              }}
              onDropChapter={(chapterId) => {
                expandVolume(volume.id);
                moveChapter(chapterId, volume.id, 0);
              }}
              onDragEnter={() => expandVolume(volume.id)}
              draggable={sortedVolumes.length > 1}
              onVolumeDragStart={() => setDraggingVolumeId(volume.id)}
              onVolumeDragEnd={() => {
                setDraggingVolumeId(null);
                setVolumeDropIndex(null);
              }}
            >
              {renderChapterList(volume.id)}
            </VolumeItem>
            {sortedVolumes.length > 1 && (
              <DropTarget
                active={volumeDropIndex === idx + 1}
                onDrop={() => handleVolumeDrop(idx + 1)}
                onDragOver={(active) => setVolumeDropIndex(active ? idx + 1 : null)}
                accepts="inkwell/volume-id"
              />
            )}
          </div>
        ))}

        {orphanedChapters.length > 0 && (
          <div className="mt-2">
            <div className="px-2 py-1 text-xs font-medium text-ink-muted dark:text-ink-muted-dark">
              未分类章节
            </div>
            {renderChapterList(null)}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deletingChapter !== null}
        title={`删除章节「${deletingChapter?.title ?? ""}」？`}
        message="章节正文将被永久删除，此操作不可撤销。"
        confirmLabel="永久删除"
        onConfirm={() => {
          if (deletingChapter) deleteChapter(deletingChapter.id);
          setDeletingChapter(null);
        }}
        onCancel={() => setDeletingChapter(null)}
      />
      <ConfirmDialog
        open={deletingVolume !== null}
        title={`删除卷「${deletingVolume?.title ?? ""}」？`}
        message={(() => {
          const count = deletingVolume
            ? chapters.filter((c) => c.parentId === deletingVolume.id).length
            : 0;
          return count > 0
            ? `将同时删除该卷下的 ${count} 个章节及其全部正文，此操作不可撤销。`
            : "此操作不可撤销。";
        })()}
        confirmLabel="永久删除"
        onConfirm={() => {
          if (deletingVolume) deleteVolume(deletingVolume.id);
          setDeletingVolume(null);
        }}
        onCancel={() => setDeletingVolume(null)}
      />
    </div>
  );
}
