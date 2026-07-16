import { useState, useCallback, useEffect, useRef } from "react";
import { ArrowLeft, ListTree, Globe, Search, History, FilePlus2 } from "lucide-react";
import { useAppStore, scheduleAutoSave, pendingChapterContent } from "../store";
import { ChapterTree } from "./chapter-tree";
import { Editor } from "./Editor";
import { StatusBar } from "./StatusBar";
import { RightPanel } from "./RightPanel";
import { GlobalSettingsModal } from "./GlobalSettingsModal";
import { SearchPanel } from "./SearchPanel";
import { cn, countWords } from "../lib/utils";
import { stripHtml } from "../lib/export";
import { saveDraft, getDraft } from "../lib/draft";
import { addWritingSeconds, getTodayWritingSeconds } from "../lib/stats";

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
    createChapter,
    toggleLeftSidebar,
    toggleRightSidebar,
    toggleFocusMode,
    volumes,
  } = useAppStore();

  const [localContent, setLocalContent] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTopBars, setShowTopBars] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(appSettings.leftSidebarWidth || 256);
  const [draftNotice, setDraftNotice] = useState<{ draft: string } | null>(null);
  const [writingSeconds, setWritingSeconds] = useState(0);
  const wordCountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topBarsHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypeAt = useRef(0);
  const resizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(appSettings.leftSidebarWidth || 256);
  // Mirror of localContent for the window-close flush — refs update during
  // render, so this is never a render behind like state can be.
  const localContentRef = useRef("");
  const currentChapterRef = useRef(currentChapter);
  currentChapterRef.current = currentChapter;

  useEffect(() => {
    setSidebarWidth(appSettings.leftSidebarWidth || 256);
  }, [appSettings.leftSidebarWidth]);

  // Load chapter content when switching chapters. If a crash-recovery draft
  // exists for this chapter (content that never reached the disk), load the
  // disk version but offer the draft for one-click restore.
  useEffect(() => {
    let cancelled = false;
    setDraftNotice(null);
    if (currentChapter) {
      getChapterContent(currentChapter.id).then((diskContent) => {
        if (cancelled) return;
        const draft = getDraft(currentChapter.id);
        setLocalContent(diskContent);
        if (draft !== null && draft !== diskContent) {
          setDraftNotice({ draft });
        }
      });
    } else {
      setLocalContent("");
    }
    return () => {
      cancelled = true;
    };
  }, [currentChapter?.id, getChapterContent]);

  useEffect(() => {
    return () => {
      if (wordCountTimer.current) clearTimeout(wordCountTimer.current);
      if (topBarsHideTimer.current) clearTimeout(topBarsHideTimer.current);
    };
  }, []);

  // Writing-time tracker: while the user keeps typing, accumulate active
  // seconds once a minute (idle stretches longer than 30s don't count).
  // The counter ticks the StatusBar display even between bursts.
  useEffect(() => {
    if (!currentProject) return;
    setWritingSeconds(getTodayWritingSeconds(currentProject.id));
    const timer = setInterval(() => {
      const typingRecently = Date.now() - lastTypeAt.current < 30_000;
      if (typingRecently) {
        setWritingSeconds(addWritingSeconds(currentProject.id, 60));
      } else {
        setWritingSeconds(getTodayWritingSeconds(currentProject.id));
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [currentProject?.id]);

  // Application-level shortcuts. Editor shortcuts (bold/italic/headings/
  // undo) are handled by TipTap inside the editing surface; these work
  // anywhere in the workspace.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const inEditable =
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      const key = e.key.toLowerCase();

      if (e.shiftKey && key === "f") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (!e.shiftKey && !e.altKey && key === "n") {
        // Ctrl+N — new chapter. Blocked while renaming / filling a field so
        // the browser-style "new window" muscle memory doesn't fire mid-edit.
        if (inEditable) return;
        e.preventDefault();
        const targetVolume = currentChapterRef.current?.parentId ?? (volumes[0]?.id || null);
        createChapter(targetVolume, "");
      } else if (!e.shiftKey && !e.altKey && key === "b") {
        if (inEditable) return;
        e.preventDefault();
        toggleLeftSidebar();
      } else if (e.altKey && !e.shiftKey && key === "o") {
        if (inEditable) return;
        e.preventDefault();
        toggleRightSidebar();
      } else if (e.shiftKey && key === "d") {
        if (inEditable) return;
        e.preventDefault();
        toggleFocusMode();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createChapter, toggleLeftSidebar, toggleRightSidebar, toggleFocusMode, volumes]);

  const updateWordCount = useCallback(
    (chapterId: string, content: string) => {
      const text = stripHtml(content);
      const wordCount = countWords(text, appSettings.includePunctuationInWordCount);
      // Memory-only update — does not trigger a project save on every keystroke.
      useAppStore.getState().updateChapterWordCount(chapterId, wordCount);
    },
    [appSettings.includePunctuationInWordCount],
  );

  const handleContentChange = useCallback(
    (content: string) => {
      setLocalContent(content);
      if (currentChapter) {
        // Crash-recovery: mirror every keystroke into the synchronous draft
        // buffer and the close-flush map. Both are dropped the moment the
        // content lands on disk.
        saveDraft(currentChapter.id, content);
        pendingChapterContent.set(currentChapter.id, content);
        lastTypeAt.current = Date.now();
        scheduleAutoSave(currentChapter.id, content);
        if (wordCountTimer.current) clearTimeout(wordCountTimer.current);
        wordCountTimer.current = setTimeout(() => {
          updateWordCount(currentChapter.id, content);
        }, 200);
      }
    },
    [currentChapter, updateWordCount],
  );

  localContentRef.current = localContent;

  const handleManualSave = useCallback(async () => {
    if (currentChapter) {
      try {
        // Await content save so the word count is updated in memory before
        // saveCurrentProject writes the project JSON.
        await updateChapterContent(currentChapter.id, localContent);
        await saveCurrentProject();
      } catch (err) {
        // Surface save failures to the user — silent data loss is worse
        // than a noisy dialog.
        alert(`保存失败：${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }, [currentChapter, localContent, updateChapterContent, saveCurrentProject]);

  const handleSelectChapter = useCallback(
    async (chapter: NonNullable<typeof currentChapter>) => {
      // Await the previous chapter's content save so its word count is updated
      // in memory before setCurrentChapter persists the project JSON — this
      // avoids saving a stale word count and avoids a duplicate project save.
      if (currentChapter && currentChapter.id !== chapter.id) {
        try {
          await updateChapterContent(currentChapter.id, localContentRef.current);
        } catch (err) {
          alert(
            `保存章节「${currentChapter.title}」失败：${err instanceof Error ? err.message : String(err)}\n已切换到新章节，但旧章节的内容可能未写入磁盘。`,
          );
        }
      }
      setCurrentChapter(chapter);
    },
    [currentChapter, setCurrentChapter, updateChapterContent],
  );

  const restoreDraft = useCallback(async () => {
    if (!currentChapter || !draftNotice) return;
    const draft = draftNotice.draft;
    setLocalContent(draft);
    setDraftNotice(null);
    try {
      await updateChapterContent(currentChapter.id, draft);
    } catch (err) {
      alert(`恢复草稿失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }, [currentChapter, draftNotice, updateChapterContent]);

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

  if (!currentProject) return null;

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
          "flex h-12 shrink-0 items-center justify-between border-b border-warm-gray px-4 transition-opacity duration-300 dark:border-warm-gray-dark",
          (focusMode || isFullscreen) && !showTopBars && "pointer-events-none opacity-0",
        )}
        onMouseEnter={(focusMode || isFullscreen) ? enterTopBars : undefined}
        onMouseLeave={(focusMode || isFullscreen) ? leaveTopBars : undefined}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={closeProject}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
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
            onClick={() => setSearchOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
            title="全书搜索 (Ctrl+Shift+F)"
          >
            <Search size={17} />
          </button>
          <button
            onClick={() => setRightPanelTab(rightSidebarOpen ? "none" : "outline")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
            title="大纲 (Ctrl+Alt+O)"
          >
            <ListTree size={18} />
          </button>
          <button
            onClick={() => setRightPanelTab("history")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
            title="历史版本"
          >
            <History size={17} />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
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
              className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-accent/30 active:bg-accent/50"
            />
          </>
        )}

        <div className="flex min-w-0 flex-1 flex-col min-h-0">
          {currentChapter ? (
            <>
              {draftNotice && (
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-200">
                  <span>检测到本章有未保存的草稿（可能因意外关闭未写入磁盘）。</span>
                  <span className="flex shrink-0 gap-2">
                    <button
                      onClick={() => setDraftNotice(null)}
                      className="rounded-md px-2 py-0.5 transition-colors hover:bg-amber-500/20"
                    >
                      保留当前内容
                    </button>
                    <button
                      onClick={restoreDraft}
                      className="rounded-md bg-amber-600 px-2 py-0.5 font-medium text-white transition-colors hover:bg-amber-500"
                    >
                      恢复草稿
                    </button>
                  </span>
                </div>
              )}
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
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center bg-paper dark:bg-paper-dark">
              <div className="text-center">
                <p className="mb-4 text-ink-muted dark:text-ink-muted-dark">选择或创建一个章节开始写作</p>
                <button
                  onClick={() => createChapter(volumes[0]?.id || null, "")}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-accent-light hover:shadow"
                >
                  <FilePlus2 size={16} />
                  新建章节
                </button>
              </div>
            </div>
          )}
          <StatusBar writingSeconds={writingSeconds} />
        </div>

        {rightSidebarOpen && !focusMode && <RightPanel />}
      </div>
      <GlobalSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SearchPanel open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
