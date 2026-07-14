import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowLeft, ListTree, Globe } from "lucide-react";
import { useAppStore, scheduleAutoSave } from "../store";
import { ChapterTree } from "./ChapterTree";
import { Editor } from "./Editor";
import { StatusBar } from "./StatusBar";
import { RightPanel } from "./RightPanel";
import { GlobalSettingsModal } from "./GlobalSettingsModal";
import { cn, countWords } from "../lib/utils";

export function Workspace() {
  const {
    currentProject,
    currentChapter,
    setCurrentChapter,
    closeProject,
    getChapterContent,
    updateChapterContent,
    leftSidebarOpen,
    rightSidebarOpen,
    focusMode,
    setRightPanelTab,
    saveCurrentProject,
    appSettings,
    updateAppSettings,
  } = useAppStore();

  const [localContent, setLocalContent] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTopBars, setShowTopBars] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(appSettings.leftSidebarWidth || 256);
  const wordCountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topBarsHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(appSettings.leftSidebarWidth || 256);

  useEffect(() => {
    setSidebarWidth(appSettings.leftSidebarWidth || 256);
  }, [appSettings.leftSidebarWidth]);

  // Load chapter content when switching chapters
  useEffect(() => {
    if (currentChapter) {
      getChapterContent(currentChapter.id).then(setLocalContent);
    } else {
      setLocalContent("");
    }
  }, [currentChapter?.id, getChapterContent]);

  useEffect(() => {
    return () => {
      if (wordCountTimer.current) clearTimeout(wordCountTimer.current);
      if (topBarsHideTimer.current) clearTimeout(topBarsHideTimer.current);
    };
  }, []);

  const updateWordCount = useCallback(
    (chapterId: string, content: string) => {
      const text = content.replace(/<[^>]+>/g, "");
      const includePunctuation = appSettings.includePunctuationInWordCount;
      const wordCount = countWords(text, includePunctuation);
      useAppStore.getState().updateChapter(chapterId, { wordCount });
    },
    [appSettings.includePunctuationInWordCount],
  );

  const handleContentChange = useCallback(
    (content: string) => {
      setLocalContent(content);
      if (currentChapter) {
        scheduleAutoSave(currentChapter.id, content);
        if (wordCountTimer.current) clearTimeout(wordCountTimer.current);
        wordCountTimer.current = setTimeout(() => {
          updateWordCount(currentChapter.id, content);
        }, 200);
      }
    },
    [currentChapter, updateWordCount],
  );

  const handleManualSave = useCallback(() => {
    if (currentChapter) {
      updateChapterContent(currentChapter.id, localContent);
      saveCurrentProject();
    }
  }, [currentChapter, localContent, updateChapterContent, saveCurrentProject]);

  const handleSelectChapter = useCallback(
    (chapter: NonNullable<typeof currentChapter>) => {
      if (currentChapter && currentChapter.id !== chapter.id) {
        updateChapterContent(currentChapter.id, localContent);
        saveCurrentProject();
      }
      setCurrentChapter(chapter);
    },
    [currentChapter, localContent, setCurrentChapter, updateChapterContent, saveCurrentProject],
  );

  if (!currentProject) return null;

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const enterTopBars = useCallback(() => {
    if (topBarsHideTimer.current) {
      clearTimeout(topBarsHideTimer.current);
      topBarsHideTimer.current = null;
    }
    setShowTopBars(true);
  }, []);

  const leaveTopBars = useCallback(() => {
    topBarsHideTimer.current = setTimeout(() => {
      setShowTopBars(false);
    }, 100);
  }, []);

  useEffect(() => {
    if (!focusMode && !isFullscreen) {
      setShowTopBars(false);
    }
  }, [focusMode, isFullscreen]);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const delta = ev.clientX - startX.current;
      const next = Math.min(480, Math.max(160, startWidth.current + delta));
      setSidebarWidth(next);
    };

    const handleUp = () => {
      resizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      updateAppSettings({ leftSidebarWidth: sidebarWidth });
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  return (
    <div className="flex h-full flex-col bg-paper dark:bg-paper-dark">
      {/* Top bar */}
      <div
        className={cn(
          "flex h-12 shrink-0 items-center justify-between border-b border-warm-gray px-4 transition-all dark:border-warm-gray-dark",
          (focusMode || isFullscreen) && !showTopBars && "opacity-0",
        )}
        onMouseEnter={(focusMode || isFullscreen) ? enterTopBars : undefined}
        onMouseLeave={(focusMode || isFullscreen) ? leaveTopBars : undefined}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={closeProject}
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted dark:text-ink-muted-dark hover:bg-warm-gray dark:hover:bg-warm-gray-dark"
            title="返回作品列表"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-sm font-semibold text-ink dark:text-ink-dark">{currentProject.name}</h2>
            <p className="text-xs text-ink-muted dark:text-ink-muted-dark">
              {currentChapter ? currentChapter.title : "未选择章节"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setRightPanelTab(rightSidebarOpen ? "none" : "outline")}
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted dark:text-ink-muted-dark hover:bg-warm-gray dark:hover:bg-warm-gray-dark"
            title="大纲"
          >
            <ListTree size={18} />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted dark:text-ink-muted-dark hover:bg-warm-gray dark:hover:bg-warm-gray-dark"
            title="全局设置"
          >
            <Globe size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {leftSidebarOpen && !focusMode && (
          <>
            <div
              className="shrink-0 border-r border-warm-gray dark:border-warm-gray-dark"
              style={{ width: sidebarWidth }}
            >
              <ChapterTree onSelectChapter={handleSelectChapter} />
            </div>
            <div
              onMouseDown={handleResizeStart}
              className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-accent/30 active:bg-accent/50"
            />
          </>
        )}

        <div className="flex min-w-0 flex-1 flex-col min-h-0">
          {currentChapter ? (
            <Editor
              content={localContent}
              onChange={handleContentChange}
              onSave={handleManualSave}
              isFullscreen={isFullscreen}
              onToggleFullscreen={toggleFullscreen}
              showToolbar={showTopBars}
              onToolbarEnter={enterTopBars}
              onToolbarLeave={leaveTopBars}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center bg-paper dark:bg-paper-dark">
              <div className="text-center">
                <p className="text-ink-muted dark:text-ink-muted-dark">选择或创建一个章节开始写作</p>
              </div>
            </div>
          )}
          <StatusBar />
        </div>

        {rightSidebarOpen && !focusMode && <RightPanel />}
      </div>
      <GlobalSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
