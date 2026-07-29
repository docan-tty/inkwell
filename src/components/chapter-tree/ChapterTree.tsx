import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BookMarked,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  FolderPlus,
  Globe,
  Layers,
  MapPin,
  Package,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { useAppStore } from "../../store";
import type { Chapter, RootKind, Volume } from "../../types";
import { ROOT_DEFS, ROOT_KIND_ORDER } from "../../types";
import { chapterRootKind } from "../../lib/docs";
import { ChapterItem } from "./ChapterItem";
import { DropTarget } from "./DropTarget";
import { ConfirmDialog } from "../ConfirmDialog";
import { EditableLabel } from "./EditableLabel";
import { cn } from "../../lib/utils";

interface ChapterTreeProps {
  onSelectChapter: (chapter: Chapter) => void;
}

type DropPosition = {
  volumeId: string | null;
  index: number;
} | null;

const ROOT_ICONS: Record<RootKind, React.ReactNode> = {
  novel: <BookOpen size={14} />,
  plot: <Sparkles size={14} />,
  characters: <Users size={14} />,
  locations: <MapPin size={14} />,
  timeline: <Clock size={14} />,
  objects: <Package size={14} />,
  entities: <Globe size={14} />,
  custom: <BookMarked size={14} />,
  templates: <Layers size={14} />,
  archive: <Archive size={14} />,
  trash: <Trash2 size={14} />,
};

/** 项目内容树(novelWriter 式):按根文件夹(小说/情节/角色/位置/归档/回收站…)
 *  分组。每个根下是「卷(子文件夹) + 文档」的层级:卷可新建/重命名/收拢/删除,
 *  章可新建在卷内或直接挂在根下,文档显示字数与状态点,支持拖拽排序、
 *  拖入回收站、新建根文件夹/卷/文档。 */
export function ChapterTree({ onSelectChapter }: ChapterTreeProps) {
  const volumes = useAppStore((s) => s.volumes);
  const chapters = useAppStore((s) => s.chapters);
  const currentChapterId = useAppStore((s) => s.currentChapter?.id);
  const ensureRootVolume = useAppStore((s) => s.ensureRootVolume);
  const createVolume = useAppStore((s) => s.createVolume);
  const updateVolume = useAppStore((s) => s.updateVolume);
  const createChapter = useAppStore((s) => s.createChapter);
  const updateChapter = useAppStore((s) => s.updateChapter);
  const deleteVolume = useAppStore((s) => s.deleteVolume);
  const trashChapter = useAppStore((s) => s.trashChapter);
  const restoreChapter = useAppStore((s) => s.restoreChapter);
  const emptyTrash = useAppStore((s) => s.emptyTrash);
  const renameRequest = useAppStore((s) => s.renameRequest);
  const moveChapter = useAppStore((s) => s.moveChapter);
  const moveVolume = useAppStore((s) => s.moveVolume);
  const [expandedVolumes, setExpandedVolumes] = useState<Set<string>>(
    () => new Set(volumes.map((v) => v.id)),
  );
  const [activeDrop, setActiveDrop] = useState<DropPosition>(null);
  const [draggingChapterId, setDraggingChapterId] = useState<string | null>(null);
  const [volumeDropIndex, setVolumeDropIndex] = useState<number | null>(null);
  const [draggingVolumeId, setDraggingVolumeId] = useState<string | null>(null);
  const [deletingChapter, setDeletingChapter] = useState<Chapter | null>(null);
  const [deletingVolume, setDeletingVolume] = useState<Volume | null>(null);
  const [addRootOpen, setAddRootOpen] = useState(false);
  const [emptyTrashConfirm, setEmptyTrashConfirm] = useState(false);
  const addRootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 顶层根文件夹,按 ROOT_KIND_ORDER 稳定排序(novel 总在最前,trash 最后),
  // 同类多个(如两部小说)按 order。
  const roots = useMemo(() => {
    const top = volumes.filter((v) => !v.parentId);
    const kindRank = (v: Volume) => ROOT_KIND_ORDER.indexOf(v.rootKind ?? "novel");
    return top.sort((a, b) => kindRank(a) - kindRank(b) || a.order - b.order);
  }, [volumes]);

  const trashRoot = roots.find((v) => (v.rootKind ?? "novel") === "trash");
  const trashCount = trashRoot ? chapters.filter((c) => c.parentId === trashRoot.id).length : 0;

  // Keep the selected chapter visible: scroll it into view and expand every
  // collapsed ancestor. 卷可嵌套、文档下可挂子文档,所以要从当前章一路向上
  // 收集所有卷 id(父级是文档时继续沿文档的 parentId 上溯),否则收拢的卷里
  // 的选中章会不可见。
  useEffect(() => {
    if (!currentChapterId) return;
    const { chapters: allChapters, volumes: allVolumes } = useAppStore.getState();
    const currentChapter = allChapters.find((c) => c.id === currentChapterId);
    if (!currentChapter) return;
    const chapterById = new Map(allChapters.map((c) => [c.id, c]));
    const volumeById = new Map(allVolumes.map((v) => [v.id, v]));
    const ancestorVolumeIds: string[] = [];
    let pid = currentChapter.parentId;
    let guard = 0;
    while (pid && guard++ < 100) {
      if (volumeById.has(pid)) {
        ancestorVolumeIds.push(pid);
        pid = volumeById.get(pid)!.parentId ?? null;
      } else if (chapterById.has(pid)) {
        pid = chapterById.get(pid)!.parentId;
      } else {
        break;
      }
    }
    if (ancestorVolumeIds.length > 0) {
      setExpandedVolumes((prev) => {
        if (ancestorVolumeIds.every((id) => prev.has(id))) return prev;
        const next = new Set(prev);
        for (const id of ancestorVolumeIds) next.add(id);
        return next;
      });
    }
    const t = setTimeout(() => {
      scrollRef.current
        ?.querySelector(`[data-chapter-id="${currentChapter.id}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }, 50);
    return () => clearTimeout(t);
  }, [currentChapterId]);

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
    if (allExpanded) setExpandedVolumes(new Set());
    else setExpandedVolumes(new Set(volumes.map((v) => v.id)));
  };

  const chaptersByParent = useMemo(() => {
    const map = new Map<string, Chapter[]>();
    for (const c of chapters) {
      const key = c.parentId ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order);
    return map;
  }, [chapters]);

  const childrenOf = (parentId: string) => chaptersByParent.get(parentId) ?? [];

  const subVolumesByParent = useMemo(() => {
    const map = new Map<string, Volume[]>();
    for (const v of volumes) {
      if (!v.parentId) continue;
      if (!map.has(v.parentId)) map.set(v.parentId, []);
      map.get(v.parentId)!.push(v);
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order);
    return map;
  }, [volumes]);

  const subVolumesOf = (parentId: string) => subVolumesByParent.get(parentId) ?? [];

  const handleListDragOver = (e: React.DragEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 48;
    const speed = 12;
    if (e.clientY < rect.top + margin) el.scrollTop -= speed;
    else if (e.clientY > rect.bottom - margin) el.scrollTop += speed;
  };

  const handleDrop = (volumeId: string | null, index: number) => {
    if (draggingChapterId) moveChapter(draggingChapterId, volumeId, index);
    setDraggingChapterId(null);
    setActiveDrop(null);
  };

  const handleVolumeDrop = (index: number) => {
    if (draggingVolumeId) moveVolume(draggingVolumeId, index);
    setDraggingVolumeId(null);
    setVolumeDropIndex(null);
  };

  /** 某父级(根或卷)下的空态:既是提示,也是拖入空卷/空根的放置目标。 */
  const renderEmptyDrop = (parentId: string) => (
    <div
      className="ml-4 border-l border-warm-gray pl-2 dark:border-warm-gray-dark"
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        setActiveDrop({ volumeId: parentId, index: 0 });
      }}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("inkwell/chapter-id");
        if (id) moveChapter(id, parentId, 0);
        setActiveDrop(null);
        setDraggingChapterId(null);
      }}
    >
      <div
        className={cn(
          "rounded-md px-2 py-2 text-center text-xs text-ink-muted transition-colors dark:text-ink-muted-dark",
          activeDrop?.volumeId === parentId ? "bg-warm-gray text-ink dark:bg-warm-gray-dark dark:text-ink-dark" : "",
        )}
      >
        拖拽文档到此处
      </div>
    </div>
  );

  /** 渲染一个卷(子文件夹)行,及其收拢后的递归内容。 */
  const renderVolumeNode = (volume: Volume, depth: number): React.ReactNode => {
    const kind = volume.rootKind ?? "novel";
    const expanded = expandedVolumes.has(volume.id);
    const childChapters = childrenOf(volume.id);
    const childVolumes = subVolumesOf(volume.id);
    const isEmpty = childChapters.length === 0 && childVolumes.length === 0;
    return (
      <div key={`vol-${volume.id}`}>
        <div
          className={cn(
            "group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-ink transition-colors dark:text-ink-dark",
            "hover:bg-warm-gray dark:hover:bg-warm-gray-dark",
          )}
          onDragEnter={(e) => {
            if (e.dataTransfer.types.includes("inkwell/volume-id")) return;
            e.preventDefault();
            expandVolume(volume.id);
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("inkwell/volume-id")) return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            if (e.dataTransfer.types.includes("inkwell/volume-id")) return;
            e.preventDefault();
            expandVolume(volume.id);
            const chapterId = e.dataTransfer.getData("inkwell/chapter-id");
            if (chapterId) moveChapter(chapterId, volume.id, 0);
          }}
        >
          <button
            onClick={() => toggleVolume(volume.id)}
            className="flex h-5 w-5 shrink-0 items-center justify-center text-ink-muted dark:text-ink-muted-dark"
            title={expanded ? "折叠" : "展开"}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <span className="shrink-0 text-ink-muted dark:text-ink-muted-dark">{ROOT_ICONS[kind]}</span>
          <EditableLabel
            value={volume.title}
            onSave={(title) => void updateVolume(volume.id, { title })}
            className="min-w-0 flex-1 truncate font-medium"
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              expandVolume(volume.id);
              void createChapter(volume.id, "", { kind: "novel" });
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-muted opacity-0 transition-opacity hover:bg-warm-gray group-hover:opacity-100 dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
            title="在此卷下新建章"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeletingVolume(volume);
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-muted opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-600 group-hover:opacity-100 dark:text-ink-muted-dark dark:hover:text-red-400"
            title="删除卷"
          >
            <Trash2 size={13} />
          </button>
        </div>
        {expanded &&
          (isEmpty ? (
            renderEmptyDrop(volume.id)
          ) : (
            <div className="ml-4 border-l border-warm-gray pl-2 dark:border-warm-gray-dark">
              {childVolumes.map((sv) => renderVolumeNode(sv, depth + 1))}
              {renderChapterList(volume.id, depth + 1)}
            </div>
          ))}
      </div>
    );
  };

  /** 渲染某父级(卷或文档)下的文档列表,递归处理文档的子文档。 */
  const renderChapterList = (parentId: string, depth: number) => {
    const children = childrenOf(parentId);
    if (children.length === 0) {
      return null; // 空态由调用方(renderVolumeNode / 根)统一渲染,避免重复
    }
    return (
      <div className={cn(depth >= 0 && "ml-4 border-l border-warm-gray pl-2 dark:border-warm-gray-dark")}>
        <DropTarget
          active={activeDrop?.volumeId === parentId && activeDrop?.index === 0}
          onDrop={() => handleDrop(parentId, 0)}
          onDragOver={(active) => setActiveDrop(active ? { volumeId: parentId, index: 0 } : null)}
        />
        {children.map((chapter, idx) => {
          const kids = childrenOf(chapter.id);
          return (
            <div key={chapter.id} data-chapter-id={chapter.id}>
              <ChapterItem
                chapter={chapter}
                active={currentChapterId === chapter.id}
                inTrash={chapterRootKind(chapter, volumes) === "trash"}
                onSelect={() => onSelectChapter(chapter)}
                onUpdate={updateChapter}
                onDelete={() => setDeletingChapter(chapter)}
                onTrash={() => void trashChapter(chapter.id)}
                onRestore={() => void restoreChapter(chapter.id)}
                renameSignal={renameRequest}
                onDragStart={() => setDraggingChapterId(chapter.id)}
                onDragEnd={() => {
                  setDraggingChapterId(null);
                  setActiveDrop(null);
                }}
              />
              {kids.length > 0 && renderChapterList(chapter.id, depth + 1)}
              <DropTarget
                active={activeDrop?.volumeId === parentId && activeDrop?.index === idx + 1}
                onDrop={() => handleDrop(parentId, idx + 1)}
                onDragOver={(active) =>
                  setActiveDrop(active ? { volumeId: parentId, index: idx + 1 } : null)
                }
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-paper dark:bg-paper-dark">
      <div className="flex h-11 items-center justify-between border-b border-warm-gray px-3 dark:border-warm-gray-dark">
        <span className="text-sm font-medium text-ink dark:text-ink-dark">项目内容</span>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleAll}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink/70 transition-colors hover:bg-warm-gray dark:text-ink-dark/70 dark:hover:bg-warm-gray-dark"
            title={allExpanded ? "折叠全部" : "展开全部"}
          >
            <ChevronsUpDown size={14} />
          </button>
          <div ref={addRootRef} className="relative">
            <button
              onClick={() => setAddRootOpen(!addRootOpen)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink/70 transition-colors hover:bg-warm-gray dark:text-ink-dark/70 dark:hover:bg-warm-gray-dark"
              title="添加根文件夹"
            >
              <FolderPlus size={14} />
            </button>
            {addRootOpen && (
              <AddRootMenu
                existing={new Set(roots.map((v) => v.rootKind ?? "novel"))}
                onPick={(kind, alreadyExists) => {
                  setAddRootOpen(false);
                  if (alreadyExists) {
                    const count = roots.filter((v) => (v.rootKind ?? "novel") === kind).length;
                    void createVolume(`${ROOT_DEFS[kind].label} ${count + 1}`, kind, null);
                  } else {
                    void ensureRootVolume(kind);
                  }
                }}
                onClose={() => setAddRootOpen(false)}
              />
            )}
          </div>
          <button
            onClick={() => {
              const novelRoot = roots.find((v) => (v.rootKind ?? "novel") === "novel");
              if (novelRoot) void createChapter(novelRoot.id, "");
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink/70 transition-colors hover:bg-warm-gray dark:text-ink-dark/70 dark:hover:bg-warm-gray-dark"
            title="新建文档 (Ctrl+N)"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} onDragOver={handleListDragOver} className="flex-1 overflow-y-auto p-2">
        {roots.length === 0 && (
          <div className="mt-8 px-3 text-sm leading-relaxed text-ink-muted dark:text-ink-muted-dark">
            还没有内容。
            <br />
            点击上方 FolderPlus 添加根文件夹。
          </div>
        )}

        {roots.map((volume, idx) => {
          const kind = volume.rootKind ?? "novel";
          const isTrash = kind === "trash";
          const rootChapters = childrenOf(volume.id);
          const rootSubVolumes = subVolumesOf(volume.id);
          const rootEmpty = rootChapters.length === 0 && rootSubVolumes.length === 0;
          return (
            <div key={volume.id} className="mb-1">
              {roots.length > 1 && idx === 0 && (
                <DropTarget
                  active={volumeDropIndex === 0}
                  onDrop={() => handleVolumeDrop(0)}
                  onDragOver={(active) => setVolumeDropIndex(active ? 0 : null)}
                  accepts="inkwell/volume-id"
                />
              )}
              <div
                className={cn(
                  "group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-ink transition-colors dark:text-ink-dark",
                  "hover:bg-warm-gray dark:hover:bg-warm-gray-dark",
                )}
                draggable={roots.filter((v) => (v.rootKind ?? "novel") === kind).length > 1}
                onDragStart={(e) => {
                  e.dataTransfer.setData("inkwell/volume-id", volume.id);
                  e.dataTransfer.effectAllowed = "move";
                  setDraggingVolumeId(volume.id);
                }}
                onDragEnd={() => {
                  setDraggingVolumeId(null);
                  setVolumeDropIndex(null);
                }}
                onDragEnter={(e) => {
                  if (e.dataTransfer.types.includes("inkwell/volume-id")) return;
                  e.preventDefault();
                  expandVolume(volume.id);
                }}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes("inkwell/volume-id")) return;
                  e.preventDefault();
                  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  if (e.dataTransfer.types.includes("inkwell/volume-id")) return;
                  e.preventDefault();
                  expandVolume(volume.id);
                  const chapterId = e.dataTransfer.getData("inkwell/chapter-id");
                  if (chapterId) moveChapter(chapterId, volume.id, 0);
                }}
              >
                <button
                  onClick={() => toggleVolume(volume.id)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center text-ink-muted dark:text-ink-muted-dark"
                  title={expandedVolumes.has(volume.id) ? "折叠" : "展开"}
                >
                  {expandedVolumes.has(volume.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <span className="shrink-0 text-ink-muted dark:text-ink-muted-dark">{ROOT_ICONS[kind]}</span>
                <span className="min-w-0 flex-1 truncate">{volume.title}</span>
                {isTrash && trashCount > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEmptyTrashConfirm(true);
                    }}
                    className="rounded px-1 py-0.5 text-[10px] text-red-600/80 transition-colors hover:bg-red-500/10 dark:text-red-400/80"
                    title="清空回收站"
                  >
                    清空
                  </button>
                )}
                {!isTrash && kind === "novel" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      expandVolume(volume.id);
                      void createVolume(`第 ${subVolumesOf(volume.id).length + 1} 卷`, "novel", volume.id);
                    }}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-muted opacity-0 transition-opacity hover:bg-warm-gray group-hover:opacity-100 dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
                    title="新建卷"
                  >
                    <BookOpen size={13} />
                  </button>
                )}
                {!isTrash && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      expandVolume(volume.id);
                      void createChapter(volume.id, "", { kind: ROOT_DEFS[kind].docKind === "note" ? "note" : "novel" });
                    }}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-muted opacity-0 transition-opacity hover:bg-warm-gray group-hover:opacity-100 dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
                    title="在此处新建文档"
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
              {expandedVolumes.has(volume.id) &&
                (rootEmpty ? (
                  renderEmptyDrop(volume.id)
                ) : (
                  <>
                    {rootSubVolumes.map((sv) => renderVolumeNode(sv, 0))}
                    {renderChapterList(volume.id, -1)}
                  </>
                ))}
              {roots.length > 1 && (
                <DropTarget
                  active={volumeDropIndex === idx + 1}
                  onDrop={() => handleVolumeDrop(idx + 1)}
                  onDragOver={(active) => setVolumeDropIndex(active ? idx + 1 : null)}
                  accepts="inkwell/volume-id"
                />
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={deletingChapter !== null}
        title={`永久删除「${deletingChapter?.title ?? ""}」?`}
        message="文档正文将被永久删除,此操作不可撤销。若只想移除,可改为移入回收站。"
        confirmLabel="永久删除"
        onConfirm={() => {
          if (deletingChapter) {
            void useAppStore.getState().deleteChapter(deletingChapter.id);
          }
          setDeletingChapter(null);
        }}
        onCancel={() => setDeletingChapter(null)}
      />
      <ConfirmDialog
        open={deletingVolume !== null}
        title={`删除卷「${deletingVolume?.title ?? ""}」?`}
        message={(() => {
          const count = deletingVolume
            ? chapters.filter((c) => c.parentId === deletingVolume.id).length
            : 0;
          return count > 0
            ? `将同时删除其中的 ${count} 个文档及其全部正文,此操作不可撤销。`
            : "此操作不可撤销。";
        })()}
        confirmLabel="永久删除"
        onConfirm={() => {
          if (deletingVolume) void deleteVolume(deletingVolume.id);
          setDeletingVolume(null);
        }}
        onCancel={() => setDeletingVolume(null)}
      />
      <ConfirmDialog
        open={emptyTrashConfirm}
        title="清空回收站?"
        message={`回收站中的 ${trashCount} 个文档及其正文将被永久删除,此操作不可撤销。`}
        confirmLabel="清空回收站"
        onConfirm={() => {
          void emptyTrash();
          setEmptyTrashConfirm(false);
        }}
        onCancel={() => setEmptyTrashConfirm(false)}
      />
    </div>
  );
}

/** 添加根文件夹的下拉:列出尚未存在的根类型(小说/自定义可多个,其余唯一)。 */
function AddRootMenu({
  existing,
  onPick,
  onClose,
}: {
  existing: Set<RootKind>;
  onPick: (kind: RootKind, alreadyExists: boolean) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);
  // 每种根类型都可以有多个(novelWriter 允许多个小说根),唯独回收站唯一。
  const candidates = ROOT_KIND_ORDER.filter((k) => k !== "trash" || !existing.has("trash"));
  return (
    <div
      ref={ref}
      className="absolute right-0 top-8 z-20 w-36 rounded-lg border border-warm-gray bg-paper py-1 shadow-lg dark:border-warm-gray-dark dark:bg-paper-dark"
    >
      {candidates.map((kind) => (
        <button
          key={kind}
          onClick={() => onPick(kind, existing.has(kind))}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark"
        >
          {ROOT_ICONS[kind]}
          {ROOT_DEFS[kind].label}
          {existing.has(kind) && kind !== "trash" && (
            <span className="ml-auto text-[10px] text-ink-muted dark:text-ink-muted-dark">再建一个</span>
          )}
        </button>
      ))}
    </div>
  );
}
