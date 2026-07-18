import { useEffect, useState, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  useAppStore,
  cancelAutoSave,
  flushPendingChapterContents,
  flushPendingMetaSaves,
} from "./store";
import { ProjectList } from "./components/ProjectList";
import { Workspace } from "./components/Workspace";
import { RecoveryDialog } from "./components/RecoveryDialog";
import { findRecoverableDrafts, clearDraft } from "./lib/draft";
import {
  getLocalProjectRegistry,
  loadChapterContentFromLocal,
  loadProjectFromLocal,
  saveChapterContentToLocal,
  registerContentRoot,
  getAppDataDir,
  isTauri,
} from "./lib/storage";

interface PendingDraft {
  chapterId: string;
  draft: string;
  updatedAt: number;
}

function App() {
  const { view, applyTheme } = useAppStore();
  const [recoveryDrafts, setRecoveryDrafts] = useState<PendingDraft[]>([]);
  // Titles for drafts whose chapter is not in the currently open project —
  // looked up lazily from each project file.
  const [draftTitles, setDraftTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    applyTheme();
  }, [applyTheme]);

  // Register the writable content roots with the Rust-side path whitelist:
  // the app data dir (default location) plus the user's custom content
  // directory (restored from settings on every launch).
  useEffect(() => {
    if (!isTauri()) return;
    (async () => {
      const appDir = await getAppDataDir();
      await registerContentRoot(appDir);
      const custom = useAppStore.getState().appSettings.projectSaveDirectory;
      if (custom) await registerContentRoot(custom);
    })();
  }, []);

  // 屏蔽 webview 默认右键菜单（Copy / Inspect Element 等）。
  // 写作区自行提供编辑菜单（Editor 的 onContextMenuCapture 在 capture
  // 阶段先跑并 setData，这里检查标记跳过），输入框与 contenteditable
  // 表面保留默认的剪贴板菜单。
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      if ((e as unknown as Record<string, unknown>).__inkwellCtxHandled) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", onCtx);
    return () => document.removeEventListener("contextmenu", onCtx);
  }, []);

  // Crash recovery scan: compare every buffered draft against the on-disk
  // chapter file. Anything newer than disk is offered for restore. Runs once
  // on launch, after the project registry is available.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = useAppStore.getState().appSettings;
        const drafts = await findRecoverableDrafts((id) =>
          loadChapterContentFromLocal(id, settings),
        );
        if (cancelled || drafts.length === 0) return;
        setRecoveryDrafts(drafts);
        // Resolve chapter titles for display. Chapters are only identifiable
        // via their project file, so scan all projects once.
        const registry = await getLocalProjectRegistry(settings);
        const titles: Record<string, string> = {};
        for (const p of registry) {
          const loaded = await loadProjectFromLocal(p.id, settings);
          for (const c of loaded?.chapters || []) {
            titles[c.id] = `${c.title}（${p.name}）`;
          }
        }
        if (!cancelled) setDraftTitles(titles);
      } catch {
        // Recovery is best-effort; a failed scan must not block the app.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Flush any pending (not-yet-on-disk) chapter content before the window
  // closes. Rust owns the close itself (on_window_event in lib.rs) and emits
  // "inkwell:closing" first; we do a best-effort, fire-and-forget flush here.
  // The handler NEVER blocks the close — the localStorage draft buffer
  // (written on every keystroke) is the real safety net for anything not yet
  // on disk, so the X button can never be frozen by a stuck invoke.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const win = getCurrentWindow();
        unlisten = await win.listen("inkwell:closing", () => {
          const settings = useAppStore.getState().appSettings;
          cancelAutoSave();
          void (async () => {
            try {
              await flushPendingChapterContents(settings);
            } catch {
              // Keep the drafts — next launch's recovery scan will offer them.
            }
            await flushPendingMetaSaves().catch(() => {});
            await useAppStore.getState().saveCurrentProject().catch(() => {});
          })();
        });
      } catch {
        // Non-windowed environment — nothing to hook.
      }
    })();
    return () => unlisten?.();
  }, []);

  const chapterTitle = useCallback(
    (chapterId: string) => {
      const inStore = useAppStore.getState().chapters.find((c) => c.id === chapterId);
      return inStore?.title || draftTitles[chapterId] || "未知章节";
    },
    [draftTitles],
  );

  const handleRestore = useCallback(async (chapterId: string, draft: string) => {
    const state = useAppStore.getState();
    // The chapter may belong to a project that is not currently open — in
    // that case write the file + drop the draft directly instead of going
    // through the store (which would touch the wrong chapter list).
    const isOpen = state.chapters.some((c) => c.id === chapterId);
    try {
      if (isOpen) {
        // restoreChapterContent bumps contentVersion, which makes the open
        // editor reload the restored bytes — no manual nudge needed.
        await state.restoreChapterContent(chapterId, draft);
      } else {
        await saveChapterContentToLocal(chapterId, draft, state.appSettings);
        clearDraft(chapterId);
      }
    } catch {
      // Keep the draft so recovery can be retried next launch.
      return;
    }
    setRecoveryDrafts((prev) => prev.filter((d) => d.chapterId !== chapterId));
  }, []);

  const handleDiscard = useCallback((chapterId: string) => {
    clearDraft(chapterId);
    setRecoveryDrafts((prev) => prev.filter((d) => d.chapterId !== chapterId));
  }, []);

  // Global F11 → toggle the native Tauri window fullscreen. Registered at the
  // top level so it works in every view (project list, editor, settings).
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (e.key !== "F11") return;
      // Ignore key events that originate from an editable element holding a
      // modifier — TipTap and form inputs handle their own combos.
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      e.preventDefault();
      try {
        const win = getCurrentWindow();
        const isFs = await win.isFullscreen();
        await win.setFullscreen(!isFs);
      } catch {
        // Non-Tauri (vite dev / web): F11 toggles the browser's fullscreen.
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          await document.documentElement.requestFullscreen().catch(() => {});
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="h-full w-full bg-paper text-ink dark:bg-paper-dark dark:text-ink-dark">
      {/* key 让两个视图各自重新挂载，触发 inkwell-view-enter 进场动效 */}
      <div key={view} className="inkwell-view-enter h-full w-full">
        {view === "projects" ? <ProjectList /> : <Workspace />}
      </div>
      <RecoveryDialog
        drafts={recoveryDrafts}
        chapterTitle={chapterTitle}
        onRestore={handleRestore}
        onDiscard={handleDiscard}
        onDismissAll={() => setRecoveryDrafts([])}
      />
    </div>
  );
}

export default App;
