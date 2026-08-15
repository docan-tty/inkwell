import { useEffect } from "react";
import { X } from "lucide-react";
import { useAppStore } from "../store";
import { STATUS_LABELS } from "../types";
import { formatDateTime, formatNumber } from "../lib/utils";
import { chapterRootKind, chapterDocKind, chapterTarget } from "../lib/docs";
import { ROOT_DEFS } from "../types";

// 文档详情(novelWriter「显示文件详情」):路径、所属根、类型、状态、
// 字数、创建/更新时间、目标字数、标签。
export function DocDetailsDialog() {
  const open = useAppStore((s) => s.docDetailsOpen);
  const setOpen = useAppStore((s) => s.setDocDetailsOpen);
  const chapter = useAppStore((s) => s.currentChapter);
  const volumes = useAppStore((s) => s.volumes);
  const appSettings = useAppStore((s) => s.appSettings);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, setOpen]);

  if (!open || !chapter) return null;

  const root = chapterRootKind(chapter, volumes);
  const kind = chapterDocKind(chapter, volumes);
  const target = chapterTarget(chapter, appSettings.defaultChapterTargetWords);
  const volume = volumes.find((v) => v.id === chapter.parentId);

  const rows: [string, string][] = [
    ["标题", chapter.title],
    ["所属根", ROOT_DEFS[root].label + (volume && volume.title !== ROOT_DEFS[root].label ? ` / ${volume.title}` : "")],
    ["文档类型", kind === "novel" ? "小说文档" : "项目笔记"],
    ["状态", STATUS_LABELS[chapter.status]],
    ["激活", chapter.inactive ? "非激活(不入手稿)" : "激活"],
    ["字数", `${formatNumber(chapter.wordCount)} / 目标 ${formatNumber(target)}`],
    ["创建", formatDateTime(chapter.createdAt)],
    ["更新", formatDateTime(chapter.updatedAt)],
  ];
  if (chapter.tags.length > 0) rows.push(["标签", chapter.tags.join(", ")]);
  if (chapter.summary) rows.push(["摘要", chapter.summary]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 animate-[inkwell-fade-in_0.15s_ease-out]" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-warm-gray bg-paper shadow-2xl dark:border-warm-gray-dark dark:bg-paper-dark animate-[inkwell-pop-in_0.15s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-11 items-center justify-between border-b border-warm-gray px-4 dark:border-warm-gray-dark">
          <span className="text-sm font-medium text-ink dark:text-ink-dark">文件详情</span>
          <button onClick={() => setOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          <dl className="space-y-2">
            {rows.map(([k, v]) => (
              <div key={k} className="flex gap-3 text-sm">
                <dt className="w-20 shrink-0 text-ink-muted dark:text-ink-muted-dark">{k}</dt>
                <dd className="min-w-0 flex-1 break-words text-ink dark:text-ink-dark">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
