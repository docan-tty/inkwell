import { useEffect, useState, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  useAppStore,
  cancelAutoSave,
  flushPendingChapterContents,
  flushPendingMetaSaves,
} from "./store";
import { Workspace } from "./components/Workspace";
import { MenuBar } from "./components/menu/MenuBar";
import { WelcomeDialog } from "./components/WelcomeDialog";
import { AboutDialog } from "./components/AboutDialog";
import { RecoveryDialog } from "./components/RecoveryDialog";
import { SearchPanel } from "./components/SearchPanel";
import { GlobalSettingsModal } from "./components/GlobalSettingsModal";
import { ProjectEditDialog } from "./components/ProjectEditDialog";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { WritingStatsDialog } from "./components/WritingStatsDialog";
import { SplitDialog } from "./components/SplitDialog";
import { MergeDialog } from "./components/MergeDialog";
import { ManuscriptDialog } from "./components/ManuscriptDialog";
import { DocViewer } from "./components/DocViewer";
import { DocDetailsDialog } from "./components/DocDetailsDialog";
import { ProjectWordsDialog } from "./components/ProjectWordsDialog";
import { ProjectDetailsDialog } from "./components/ProjectDetailsDialog";
import { editorContext } from "./lib/editor-context";
import { runCommand } from "./lib/commands";
import { findRecoverableDrafts, clearDraft, flushDrafts, listDraftMetas } from "./lib/draft";
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
  const applyTheme = useAppStore((s) => s.applyTheme);
  const currentProject = useAppStore((s) => s.currentProject);
  const searchOpen = useAppStore((s) => s.searchOpen);
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const settingsOpen = useAppStore((s) => s.settingsOpen);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const projectEditTarget = useAppStore((s) => s.projectEditTarget);
  const setProjectEditTarget = useAppStore((s) => s.setProjectEditTarget);
  const projectDeleteTarget = useAppStore((s) => s.projectDeleteTarget);
  const setProjectDeleteTarget = useAppStore((s) => s.setProjectDeleteTarget);
  const backupConfirmOpen = useAppStore((s) => s.backupConfirm);
  const setBackupConfirm = useAppStore((s) => s.setBackupConfirm);
  const emptyTrashOpen = useAppStore((s) => s.emptyTrashConfirm);
  const setEmptyTrashConfirm = useAppStore((s) => s.setEmptyTrashConfirm);
  const updateProject = useAppStore((s) => s.updateProject);
  const deleteProject = useAppStore((s) => s.deleteProject);
  const [recoveryDrafts, setRecoveryDrafts] = useState<PendingDraft[]>([]);
  const [deleteChapterCount, setDeleteChapterCount] = useState(0);
  // Titles for drafts whose chapter is not in the currently open project —
  // looked up lazily from each project file.
  const [draftTitles, setDraftTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    applyTheme();
  }, [applyTheme]);

  // 启动:加载作品索引;有「最近打开」的作品则自动打开它(失败则停留在
  // 欢迎对话框,用户可另选)。无最近作品时欢迎对话框等待选择。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const store = useAppStore.getState();
      await store.loadProjects();
      if (cancelled) return;
      const { projects, appSettings } = useAppStore.getState();
      const recentId = appSettings.recentProjects[0];
      const recent = recentId ? projects.find((p) => p.id === recentId) : undefined;
      if (recent) {
        try {
          await useAppStore.getState().openProject(recent);
          if (!cancelled) useAppStore.getState().setWelcomeOpen(false);
        } catch {
          // 作品文件损坏等 —— 停留欢迎对话框,错误由 WelcomeDialog 再次
          // 打开时展示;这里不打扰启动流程。
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
  //
  // Only projects that HAVE drafts are opened (to register chapter → project
  // ownership so a restore writes into the right folder, and to resolve
  // titles). The pre-hint fallback scans every project — one-time cost for
  // drafts written before hints existed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = useAppStore.getState().appSettings;
        const metas = listDraftMetas();
        const projectIds = new Set(metas.map((m) => m.projectId).filter(Boolean) as string[]);
        const needsFullScan = metas.some((m) => !m.projectId);
        const titles: Record<string, string> = {};
        if (needsFullScan) {
          const registry = await getLocalProjectRegistry(settings);
          for (const p of registry) projectIds.add(p.id);
        }
        for (const pid of projectIds) {
          const loaded = await loadProjectFromLocal(pid, settings).catch(() => null);
          if (!loaded) continue;
          for (const c of loaded.chapters) {
            titles[c.id] = `${c.title}（${loaded.project.name}）`;
          }
        }
        if (!cancelled) setDraftTitles(titles);

        const drafts = await findRecoverableDrafts((id) =>
          loadChapterContentFromLocal(id, settings),
        );
        if (cancelled || drafts.length === 0) return;
        setRecoveryDrafts(drafts);
        useAppStore.getState().setRecoveryPending(true);
      } catch {
        // Recovery is best-effort; a failed scan must not block the app.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismissRecovery = useCallback(() => {
    setRecoveryDrafts([]);
    useAppStore.getState().setRecoveryPending(false);
  }, []);

  // 删除作品确认打开时预查章节数(供确认文案)。
  useEffect(() => {
    if (!projectDeleteTarget) return;
    setDeleteChapterCount(0);
    loadProjectFromLocal(projectDeleteTarget.id, useAppStore.getState().appSettings)
      .then((loaded) => setDeleteChapterCount(loaded?.chapters.length || 0))
      .catch(() => setDeleteChapterCount(0));
  }, [projectDeleteTarget]);

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
          // 草稿防抖窗口内的最后内容同步落进 localStorage(崩溃恢复兜底)。
          flushDrafts();
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
    setRecoveryDrafts((prev) => {
      const next = prev.filter((d) => d.chapterId !== chapterId);
      if (next.length === 0) useAppStore.getState().setRecoveryPending(false);
      return next;
    });
  }, []);

  const handleDiscard = useCallback((chapterId: string) => {
    clearDraft(chapterId);
    setRecoveryDrafts((prev) => {
      const next = prev.filter((d) => d.chapterId !== chapterId);
      if (next.length === 0) useAppStore.getState().setRecoveryPending(false);
      return next;
    });
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
      <div className="flex h-full w-full flex-col">
        <MenuBar />
        <div className="min-h-0 flex-1">{currentProject ? <Workspace /> : null}</div>
      </div>
      <SearchPanel
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectChapter={(chapter) => void editorContext.selectChapter?.(chapter)}
      />
      <GlobalSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WelcomeDialog />
      <AboutDialog />
      <ProjectEditDialog
        project={projectEditTarget}
        onSave={async (data) => {
          // Await (and let failures propagate into the dialog): renaming a
          // work moves its folder on disk — a failed move must not close the
          // dialog looking like a successful save.
          if (projectEditTarget) await updateProject(projectEditTarget.id, data);
        }}
        onClose={() => setProjectEditTarget(null)}
      />
      <ConfirmDialog
        open={projectDeleteTarget !== null}
        title={`删除作品「${projectDeleteTarget?.name ?? ""}」?`}
        message={
          deleteChapterCount > 0
            ? `将永久删除该作品及其 ${deleteChapterCount} 个章节的全部内容,此操作不可撤销。`
            : "将永久删除该作品,此操作不可撤销。"
        }
        confirmLabel="永久删除"
        onConfirm={() => {
          if (projectDeleteTarget) void deleteProject(projectDeleteTarget.id);
          setProjectDeleteTarget(null);
        }}
        onCancel={() => setProjectDeleteTarget(null)}
      />
      <RecoveryDialog
        drafts={recoveryDrafts}
        chapterTitle={chapterTitle}
        onRestore={handleRestore}
        onDiscard={handleDiscard}
        onDismissAll={dismissRecovery}
      />
      <WritingStatsDialog />
      <SplitDialog />
      <MergeDialog />
      <ManuscriptDialog />
      <DocViewer />
      <DocDetailsDialog />
      <ProjectWordsDialog />
      <ProjectDetailsDialog />
      <ConfirmDialog
        open={backupConfirmOpen}
        title="备份项目?"
        message="将把整个作品文件夹(正文、笔记、词典、快照)复制到 backups 子目录,不改动原数据。"
        confirmLabel="立即备份"
        danger={false}
        onConfirm={() => {
          setBackupConfirm(false);
          void runCommand("tools.backupNow");
        }}
        onCancel={() => setBackupConfirm(false)}
      />
      <ConfirmDialog
        open={emptyTrashOpen}
        title="清空回收站?"
        message="回收站中的全部文档及其正文将被永久删除,此操作不可撤销。"
        confirmLabel="清空回收站"
        onConfirm={() => {
          setEmptyTrashConfirm(false);
          void useAppStore.getState().emptyTrash();
        }}
        onCancel={() => setEmptyTrashConfirm(false)}
      />
    </div>
  );
}

export default App;
