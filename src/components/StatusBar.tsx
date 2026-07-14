import { useAppStore } from "../store";
import { formatNumber } from "../lib/utils";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";

export function StatusBar() {
  const { currentProject, chapters, currentChapter, appSettings } = useAppStore();
  const [savedIndicator, setSavedIndicator] = useState(false);

  const totalWords = chapters.reduce((sum, c) => sum + c.wordCount, 0);
  const chapterTarget = currentChapter?.targetWords || appSettings.defaultChapterTargetWords;

  useEffect(() => {
    if (!currentChapter) return;
    setSavedIndicator(true);
    const t = setTimeout(() => setSavedIndicator(false), 2000);
    return () => clearTimeout(t);
  }, [currentChapter?.wordCount, currentChapter?.updatedAt]);

  return (
    <div className="flex h-8 shrink-0 items-center justify-between border-t border-warm-gray bg-paper px-4 text-xs text-ink-muted dark:text-ink-muted-dark dark:border-warm-gray-dark dark:bg-paper-dark">
      <div className="flex items-center gap-4">
        {currentProject && (
          <>
            <span>总字数: {formatNumber(totalWords)}</span>
            {currentChapter && (
              <span>
                本章: {formatNumber(currentChapter.wordCount)} / {formatNumber(chapterTarget)}
              </span>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Save size={12} className={savedIndicator ? "text-accent" : ""} />
        <span>{savedIndicator ? "已保存" : "就绪"}</span>
      </div>
    </div>
  );
}
