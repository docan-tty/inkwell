import { useState, useCallback, useEffect, useRef } from "react";
import { FilePlus2 } from "lucide-react";
import { useAppStore, scheduleAutoSave } from "../store";
import { ChapterTree } from "./chapter-tree";
import { Editor } from "./Editor";
import { StatusBar } from "./StatusBar";
import { RightPanel } from "./RightPanel";
import { ActivityBar } from "./menu/ActivityBar";
import { NotesView } from "./left-panel/NotesView";
import { DictionaryView } from "./left-panel/DictionaryView";
import { cn, countWords } from "../lib/utils";
import { STATUS_LABELS } from "../types";
import { matchesKeys, shortcutFor } from "../lib/shortcuts";
import { runCommand } from "../lib/commands";
import { registerEditorContext } from "../lib/editor-context";
import { stripHtml, sanitizeHtml } from "../lib/export";
import { formatHtmlTextNodes } from "../lib/format";
import { saveDraft, getDraft } from "../lib/draft";
import { useWritingTime } from "../hooks/useWritingTime";
import { useAutoHideTopBars } from "../hooks/useAutoHideTopBars";

// 这些快捷键在输入框/编辑区内不触发(避免与正常输入冲突)。
const SHORTCUT_BLOCKED_IN_EDITABLE = new Set([
  "openProject", "newChapter", "toggleLeftSidebar", "toggleRightSidebar",
  "focusMode", "saveProject", "closeProject", "projectSettings",
  "projectDetails", "renameItem", "trashItem", "quitApp", "docOpen",
  "docClose", "docView", "docCloseView", "spellToggle", "spellRerun",
  "rebuildIndex", "manuscript", "writingStats",
]);

export function Workspace() {
  // Selector subscriptions, not useAppStore() destructuring: typing bumps
  // chapter word counts every 200ms (new chapters array + new currentChapter
  // identity) — a whole-store subscription would re-render this ~500-line
  // component on every keystroke. Action functions are stable in zustand;
  // state slices are picked one by one.
  const currentProject = useAppStore((s) => s.currentProject);
  const currentChapter = useAppStore((s) => s.currentChapter);
  const setCurrentChapter = useAppStore((s) => s.setCurrentChapter);
  const getChapterContent = useAppStore((s) => s.getChapterContent);
  const updateChapterContent = useAppStore((s) => s.updateChapterContent);
  const leftSidebarOpen = useAppStore((s) => s.leftSidebarOpen);
  const rightSidebarOpen = useAppStore((s) => s.rightSidebarOpen);
  const focusMode = useAppStore((s) => s.focusMode);
  const leftSidebarTab = useAppStore((s) => s.leftSidebarTab);
  const saveCurrentProject = useAppStore((s) => s.saveCurrentProject);
  const appSettings = useAppStore((s) => s.appSettings);
  const updateAppSettings = useAppStore((s) => s.updateAppSettings);
  const createChapter = useAppStore((s) => s.createChapter);
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode);
  const volumes = useAppStore((s) => s.volumes);
  const contentVersion = useAppStore((s) => s.contentVersion);

  const [localContent, setLocalContent] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(appSettings.leftSidebarWidth || 256);
  const [draftNotice, setDraftNotice] = useState<{ draft: string } | null>(null);
  const [chapterLoadError, setChapterLoadError] = useState<string | null>(null);
  const wordCountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(appSettings.leftSidebarWidth || 256);
  // Mirror of localContent for the window-close flush — refs update during
  // render, so this is never a render behind like state can be.
  const localContentRef = useRef("");
  const currentChapterRef = useRef(currentChapter);
  currentChapterRef.current = currentChapter;
  // Latest sidebar width for the drag-end persist — the mouseup handler's
  // closure is created at drag start and would otherwise save the OLD width.
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;
  // 编辑器强制同步通道：Editor 挂载时注册。自动整理等场景需要把 canonical
  // HTML 直接灌进编辑器并跳过同步 effect 的比对覆盖。
  const editorSyncRef = useRef<((canonical: string) => void) | null>(null);

  const { writingSeconds, noteTyping } = useWritingTime(currentProject?.id);
  const { showTopBars, enterTopBars, leaveTopBars } = useAutoHideTopBars(focusMode);

  useEffect(() => {
    setSidebarWidth(appSettings.leftSidebarWidth || 256);
  }, [appSettings.leftSidebarWidth]);

  // Load chapter content when switching chapters (or when a snapshot/draft
  // restore bumps contentVersion). Clears the previous chapter's content
  // first — if the load fails, the editor must NOT keep showing (and later
  // autosave) chapter A's text under chapter B's identity.
  // If a crash-recovery draft exists for this chapter (content that never
  // reached the disk), load the disk version but offer the draft for
  // one-click restore.
  useEffect(() => {
    let cancelled = false;
    setDraftNotice(null);
    setChapterLoadError(null);
    if (currentChapter) {
      setLocalContent("");
      getChapterContent(currentChapter.id)
        .then((diskContent) => {
          if (cancelled) return;
          const draft = getDraft(currentChapter.id);
          setLocalContent(diskContent);
          if (draft !== null && draft !== diskContent) {
            setDraftNotice({ draft });
          }
        })
        .catch((err) => {
          if (cancelled) return;
          setLocalContent("");
          setChapterLoadError(err instanceof Error ? err.message : String(err));
        });
    } else {
      setLocalContent("");
    }
    return () => {
      cancelled = true;
    };
  }, [currentChapter?.id, contentVersion, getChapterContent]);

  useEffect(() => {
    return () => {
      if (wordCountTimer.current) clearTimeout(wordCountTimer.current);
    };
  }, []);

  // Application-level shortcuts (customizable in 设置 → 快捷键; defaults in
  // SHORTCUT_DEFS). Editor shortcuts (bold/italic/headings/undo) are handled
  // by TipTap inside the editing surface; these work anywhere in the workspace.
  // 动作统一走命令层(runCommand),与菜单栏共享 enabled 守卫。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 专注模式下 Esc 直接退出（用户最常期望的退出方式）。
      if (e.key === "Escape" && focusMode) {
        e.preventDefault();
        toggleFocusMode();
        return;
      }
      const overrides = useAppStore.getState().appSettings.shortcuts;
      const keys = (id: string) => shortcutFor(id, overrides);
      const inEditable =
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));

      if (matchesKeys(e, keys("search"))) {
        e.preventDefault();
        runCommand("search");
        return;
      }
      // 需要「不在输入态」的命令统一走命令层;表驱动,命令自带 enabled 守卫。
      const table: [string, string][] = [
        ["openProject", "project.open"],
        ["newChapter", "newChapter"],
        ["toggleLeftSidebar", "toggleLeftSidebar"],
        ["toggleRightSidebar", "toggleRightSidebar"],
        ["focusMode", "focusMode"],
        ["saveProject", "project.save"],
        ["closeProject", "project.close"],
        ["projectSettings", "settings.open"],
        ["projectDetails", "project.details"],
        ["renameItem", "project.rename"],
        ["trashItem", "project.trashItem"],
        ["quitApp", "app.quit"],
        ["docOpen", "doc.open"],
        ["docClose", "doc.close"],
        ["docView", "doc.view"],
        ["docCloseView", "doc.closeView"],
        ["spellToggle", "tools.spellToggle"],
        ["spellRerun", "tools.spellRerun"],
        ["rebuildIndex", "tools.rebuildIndex"],
        ["manuscript", "tools.manuscript"],
        ["writingStats", "tools.stats"],
        ["openSettings", "settings.open"],
        ["findNext", "search.findNext"],
        ["findPrev", "search.findPrev"],
        ["replaceNext", "search.replaceNext"],
        ["selectParagraph", "edit.selectParagraph"],
      ];
      for (const [shortcutId, commandId] of table) {
        if (matchesKeys(e, keys(shortcutId))) {
          if (inEditable && SHORTCUT_BLOCKED_IN_EDITABLE.has(shortcutId)) return;
          e.preventDefault();
          runCommand(commandId);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFocusMode, focusMode]);

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
        // Crash-recovery: mirror every keystroke into the (debounced) draft
        // buffer and the close-flush map. Both are dropped the moment the
        // content lands on disk. (scheduleAutoSave writes the seq-tagged
        // pending entry itself.) The hint lets the launch recovery dialog
        // name the chapter without scanning every project file.
        saveDraft(currentChapter.id, content, {
          projectId: currentProject?.id,
          chapterTitle: currentChapter.title,
        });
        noteTyping();
        scheduleAutoSave(currentChapter.id, content);
        if (wordCountTimer.current) clearTimeout(wordCountTimer.current);
        wordCountTimer.current = setTimeout(() => {
          updateWordCount(currentChapter.id, content);
        }, 200);
      }
    },
    [currentChapter, updateWordCount, noteTyping],
  );

  localContentRef.current = localContent;

  // 自动整理格式入口（顶栏按钮）：整理 → 走强制同步通道 → 立即落盘。
  // 不能用 handleContentChange 里 setLocalContent + onUpdate 比对的路径——
  // DOM 级整理结果序列化后与 setContent 的 canonical HTML 有空白差异，
  // 会被 Editor 的同步 effect 覆盖回去。输出再过一遍 sanitizeHtml，
  // 与快照恢复路径对齐（纵深防御：今天内容来自 TipTap 属惰性，但一旦非
  // TipTap 内容进入——导入、粘贴 bug——不能成为注入放大器）。
  const handleAutoFormat = useCallback(() => {
    const current = localContentRef.current;
    const formatted = sanitizeHtml(formatHtmlTextNodes(current, appSettings.formatOptions));
    if (formatted === current) return;
    if (editorSyncRef.current) {
      editorSyncRef.current(formatted);
    } else {
      handleContentChange(formatted);
    }
    if (currentChapter) {
      updateChapterContent(currentChapter.id, formatted)
        .then(() => saveCurrentProject())
        .catch((err) => {
          alert(`整理后保存失败：${err instanceof Error ? err.message : String(err)}`);
        });
    }
  }, [currentChapter, handleContentChange, updateChapterContent, saveCurrentProject, appSettings.formatOptions]);

  const handleManualSave = useCallback(async () => {
    const chapter = currentChapterRef.current;
    if (chapter) {
      try {
        // Read the latest content via ref — delayed callers (context menu,
        // keyboard) would otherwise write a stale closure value. Await the
        // content save so the word count is updated in memory before
        // saveCurrentProject writes the project JSON.
        await updateChapterContent(chapter.id, localContentRef.current);
        await saveCurrentProject();
      } catch (err) {
        // Surface save failures to the user — silent data loss is worse
        // than a noisy dialog.
        alert(`保存失败：${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }, [updateChapterContent, saveCurrentProject]);

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

  // 把依赖内部 ref 的动作注册进命令层桥接(菜单栏/快捷键共用),卸载时清空。
  useEffect(() => {
    return registerEditorContext({
      save: handleManualSave,
      autoFormat: handleAutoFormat,
      selectChapter: handleSelectChapter,
    });
  }, [handleManualSave, handleAutoFormat, handleSelectChapter]);

  if (!currentProject) return null;

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarWidthRef.current;
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
      // Persist the FINAL width (via ref) — this closure was created at drag
      // start and would otherwise save the pre-drag value.
      updateAppSettings({ leftSidebarWidth: sidebarWidthRef.current });
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  return (
    <div className="flex h-full flex-col bg-paper dark:bg-paper-dark">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ActivityBar />
        {leftSidebarOpen && !focusMode && (
          <>
            {/* 左侧面板:目录 / 笔记 / 词典(页签由图标栏切换) */}
            <div
              className="flex shrink-0 flex-col overflow-hidden border-r border-warm-gray/80 bg-paper dark:border-warm-gray-dark/80 dark:bg-paper-dark"
              style={{ width: sidebarWidth }}
            >
              <div className="min-h-0 flex-1">
                {leftSidebarTab === "chapters" && <ChapterTree onSelectChapter={handleSelectChapter} />}
                {leftSidebarTab === "notes" && <NotesView />}
                {leftSidebarTab === "dictionary" && <DictionaryView />}
              </div>
              {/* 选中文档详情(novelWriter 式树底详情条) */}
              {leftSidebarTab === "chapters" && currentChapter && (
                <div className="shrink-0 border-t border-warm-gray/60 px-3 py-2 text-[11px] leading-relaxed text-ink-muted dark:border-warm-gray-dark/60 dark:text-ink-muted-dark">
                  <div className="font-medium text-ink dark:text-ink-dark">{currentChapter.title}</div>
                  <div className="mt-0.5 flex gap-3">
                    <span>字数 {currentChapter.wordCount}</span>
                    <span>{STATUS_LABELS[currentChapter.status]}</span>
                    {currentChapter.inactive && <span>非激活</span>}
                  </div>
                </div>
              )}
            </div>
            <div
              onMouseDown={handleResizeStart}
              className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-accent/30 active:bg-accent/50"
            />
          </>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {currentChapter ? (
            <>
              {draftNotice && (
                <div className="mx-1.5 mt-1.5 flex shrink-0 items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-200">
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
              {chapterLoadError ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-hidden bg-paper px-8 text-center dark:bg-paper-dark">
                  <p className="text-sm text-red-600 dark:text-red-400">章节内容加载失败</p>
                  <p className="max-w-md break-all text-xs leading-relaxed text-ink-muted dark:text-ink-muted-dark">
                    {chapterLoadError}
                  </p>
                  <p className="text-xs text-ink-muted dark:text-ink-muted-dark">
                    已阻止编辑以避免把其他内容误写入本章文件。请检查磁盘上的章节文件后重试。
                  </p>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-paper transition-all duration-300 dark:bg-paper-dark">
                  <Editor
                    content={localContent}
                    onChange={handleContentChange}
                    onSave={handleManualSave}
                    onAutoFormat={handleAutoFormat}
                    syncRef={editorSyncRef}
                    showToolbar={focusMode ? false : showTopBars}
                    onToolbarEnter={enterTopBars}
                    onToolbarLeave={leaveTopBars}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center overflow-hidden bg-paper dark:bg-paper-dark">
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
        </div>

        {rightSidebarOpen && !focusMode && <RightPanel onSelectChapter={handleSelectChapter} />}
      </div>

      {!focusMode && <StatusBar writingSeconds={writingSeconds} />}

      {/* 专注模式:右下只留一个退出入口,写作数据不再打扰 */}
      {focusMode && currentChapter && (
        <div
          onMouseEnter={enterTopBars}
          className={cn(
            "fixed bottom-4 right-5 z-40 flex items-center gap-2 rounded-full border border-warm-gray/70 bg-paper/85 px-3.5 py-1.5 text-[11px] text-ink-muted shadow-sm backdrop-blur transition-opacity duration-500 dark:border-warm-gray-dark/70 dark:bg-paper-dark/85 dark:text-ink-muted-dark",
            showTopBars ? "opacity-100" : "opacity-0 hover:opacity-100",
          )}
        >
          <button
            onClick={toggleFocusMode}
            className="text-ink-muted transition-colors hover:text-accent dark:text-ink-muted-dark"
            title="退出专注模式 (Esc)"
          >
            退出 <span className="text-[10px] text-ink-muted/70 dark:text-ink-muted-dark/70">Esc</span>
          </button>
        </div>
      )}
    </div>
  );
}
