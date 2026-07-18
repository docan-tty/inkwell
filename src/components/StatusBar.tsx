import { useAppStore } from "../store";
import { formatNumber, formatDateTime, formatTime, cn } from "../lib/utils";
import { getTodayGained, formatDuration } from "../lib/stats";
import { Save, AlertCircle, X, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

export function StatusBar({ writingSeconds = 0 }: { writingSeconds?: number }) {
  const {
    currentProject,
    chapters,
    currentChapter,
    appSettings,
    lastSavedAt,
    saveError,
    dismissSaveError,
    updateChapterContent,
    saveCurrentProject,
  } = useAppStore();
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const totalWords = chapters.reduce((sum, c) => sum + c.wordCount, 0);
  // 章节目标字数：0/未设置 = 跟随全局默认；正数为该章自定义目标。
  const chapterTarget =
    currentChapter?.targetWords || appSettings.defaultChapterTargetWords;
  const todayGained = currentProject ? getTodayGained(currentProject.id, totalWords) : 0;
  const projectProgress = currentProject?.targetWords
    ? Math.min(100, Math.round((totalWords / currentProject.targetWords) * 100))
    : 0;

  // Trigger the "已保存" indicator on any save (manual, auto, structural).
  // Watching lastSavedAt is more reliable than wordCount/updatedAt because
  // saving unchanged content (e.g. clicking Save) does not change those.
  useEffect(() => {
    if (lastSavedAt === 0) return;
    setSavedIndicator(true);
    const t = setTimeout(() => setSavedIndicator(false), 2000);
    return () => clearTimeout(t);
  }, [lastSavedAt]);

  const retrySave = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      // Re-run both save paths — the chapter content and the project JSON.
      if (currentChapter) {
        const content = await useAppStore.getState().getChapterContent(currentChapter.id);
        await updateChapterContent(currentChapter.id, content);
      }
      await saveCurrentProject();
    } catch {
      // saveError stays set — the red indicator remains visible.
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="flex h-8 shrink-0 items-center justify-between bg-paper px-4 text-xs text-ink-muted dark:text-ink-muted-dark dark:bg-paper-dark">
      <div className="flex min-w-0 items-center gap-4">
        {currentProject && (
          <>
            <span className="shrink-0">
              总字数 {formatNumber(totalWords)}
              <span className="mx-1.5 text-warm-gray dark:text-warm-gray-dark">·</span>
              <span className="text-[11px]">目标 {projectProgress}%</span>
            </span>
            <span className="hidden h-3 w-px bg-warm-gray dark:bg-warm-gray-dark sm:block" />
            <span className="hidden shrink-0 sm:block">
              今日 +{formatNumber(todayGained)}
            </span>
            <span className="hidden h-3 w-px bg-warm-gray dark:bg-warm-gray-dark md:block" />
            <span className="hidden shrink-0 md:block" title="今日有效写作时长">
              写作 {formatDuration(writingSeconds)}
            </span>
            {currentChapter && (
              <>
                <span className="h-3 w-px bg-warm-gray dark:bg-warm-gray-dark" />
                <span className="shrink-0">
                  本章 {formatNumber(currentChapter.wordCount)} / {formatNumber(chapterTarget)}
                </span>
                <span className="relative hidden h-1 w-16 overflow-hidden rounded-full bg-warm-gray dark:bg-warm-gray-dark lg:block">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-accent transition-all duration-300"
                    style={{ width: `${Math.min(100, (currentChapter.wordCount / chapterTarget) * 100)}%` }}
                  />
                </span>
              </>
            )}
          </>
        )}
      </div>

      {saveError ? (
        <div className="flex shrink-0 items-center gap-1.5 text-red-600 dark:text-red-400" title={saveError}>
          <AlertCircle size={12} />
          <span>保存失败</span>
          <button
            onClick={retrySave}
            className="ml-1 flex items-center gap-0.5 rounded px-1 py-px transition-colors hover:bg-red-500/10"
            title="重试保存"
          >
            <RefreshCw size={11} className={cn(retrying && "animate-spin")} />
            重试
          </button>
          <button
            onClick={dismissSaveError}
            className="flex items-center rounded px-0.5 py-px transition-colors hover:bg-red-500/10"
            title="忽略"
          >
            <X size={11} />
          </button>
        </div>
      ) : (
        <div
          className="flex shrink-0 items-center gap-1"
          title={lastSavedAt ? `上次保存于 ${formatDateTime(lastSavedAt)}` : "尚未保存"}
        >
          <Save size={12} className={savedIndicator ? "text-accent" : ""} />
          <span>{lastSavedAt ? `已保存 · ${formatTime(lastSavedAt)}` : "就绪"}</span>
        </div>
      )}
    </div>
  );
}
