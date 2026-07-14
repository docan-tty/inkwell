import { X } from "lucide-react";
import { useAppStore } from "../store";
import { cn } from "../lib/utils";

export function RightPanel() {
  const { rightPanelTab, setRightPanelTab } = useAppStore();

  if (rightPanelTab === "none") return null;

  return (
    <div className="flex h-full w-72 flex-col border-l border-warm-gray bg-paper dark:border-warm-gray-dark dark:bg-paper-dark">
      <div className="flex h-12 items-center justify-between border-b border-warm-gray px-3 dark:border-warm-gray-dark">
        <span className="text-sm font-medium text-ink dark:text-ink-dark">大纲</span>
        <button
          onClick={() => setRightPanelTab("none")}
          className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted dark:text-ink-muted-dark hover:bg-warm-gray dark:hover:bg-warm-gray-dark"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <OutlineView />
      </div>
    </div>
  );
}

function OutlineView() {
  const { chapters, currentChapter, setCurrentChapter } = useAppStore();

  return (
    <div className="space-y-1">
      {chapters.length === 0 && (
        <div className="text-sm text-ink-muted dark:text-ink-muted-dark">暂无章节，请在左侧章节树中创建。</div>
      )}
      {chapters.map((chapter) => (
        <button
          key={chapter.id}
          onClick={() => setCurrentChapter(chapter)}
          className={cn(
            "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
            currentChapter?.id === chapter.id
              ? "bg-accent/10 text-accent dark:bg-accent/20"
              : "text-ink hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark",
          )}
        >
          <div className="font-medium">{chapter.title}</div>
          {chapter.summary && (
            <div className="mt-0.5 truncate text-xs text-ink-muted dark:text-ink-muted-dark">{chapter.summary}</div>
          )}
        </button>
      ))}
    </div>
  );
}
