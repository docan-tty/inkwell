import { useEffect } from "react";
import { X } from "lucide-react";
import { useAppStore } from "../store";
import { formatDateTime, formatNumber } from "../lib/utils";
import { chapterDocKind } from "../lib/docs";

// 小说细节(novelWriter Shift+F6):整个作品的统计概览——正文/笔记文档数、
// 总字数、卷数、目标进度、创建/更新时间。
export function ProjectDetailsDialog() {
  const open = useAppStore((s) => s.projectDetailsOpen);
  const setOpen = useAppStore((s) => s.setProjectDetailsOpen);
  const project = useAppStore((s) => s.currentProject);
  const chapters = useAppStore((s) => s.chapters);
  const volumes = useAppStore((s) => s.volumes);

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

  if (!open || !project) return null;

  const novelDocs = chapters.filter((c) => chapterDocKind(c, volumes) === "novel");
  const noteDocs = chapters.filter((c) => chapterDocKind(c, volumes) === "note");
  const novelWords = novelDocs.reduce((s, c) => s + c.wordCount, 0);
  const noteWords = noteDocs.reduce((s, c) => s + c.wordCount, 0);
  const total = novelWords + noteWords;
  const progress = project.targetWords ? Math.min(100, Math.round((novelWords / project.targetWords) * 100)) : 0;
  const doneCount = chapters.filter((c) => c.status === "done").length;

  const rows: [string, string][] = [
    ["作品", project.name],
    ["作者", project.author || "未署名"],
    ["类型", project.genre || "—"],
    ["正文章节", `${novelDocs.length} 篇 · ${formatNumber(novelWords)} 字`],
    ["笔记文档", `${noteDocs.length} 篇 · ${formatNumber(noteWords)} 字`],
    ["总字数", formatNumber(total)],
    ["目标进度", `${formatNumber(novelWords)} / ${formatNumber(project.targetWords)}(${progress}%)`],
    ["卷/文件夹", String(volumes.length)],
    ["已完成", `${doneCount} / ${chapters.length} 篇`],
    ["创建", formatDateTime(project.createdAt)],
    ["更新", formatDateTime(project.updatedAt)],
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 animate-[inkwell-fade-in_0.15s_ease-out]" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-warm-gray bg-paper shadow-2xl dark:border-warm-gray-dark dark:bg-paper-dark animate-[inkwell-pop-in_0.15s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-11 items-center justify-between border-b border-warm-gray px-4 dark:border-warm-gray-dark">
          <span className="text-sm font-medium text-ink dark:text-ink-dark">小说细节</span>
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
          {project.description && (
            <p className="mt-3 border-t border-warm-gray/60 pt-3 text-sm leading-relaxed text-ink-muted dark:border-warm-gray-dark/60 dark:text-ink-muted-dark">
              {project.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
