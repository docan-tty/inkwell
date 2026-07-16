import { create } from "zustand";
import type {
  AppSettings,
  Chapter,
  Project,
  RightPanelTab,
  ViewMode,
  Volume,
} from "../types";
import {
  DEFAULT_EDITOR_TYPOGRAPHY,
  DEFAULT_PROJECT_TARGET_WORDS,
} from "../types";
import {
  getLocalProjectRegistry,
  loadChapterContentFromLocal,
  loadProjectFromLocal,
  saveChapterContentToLocal,
  saveProjectToLocal,
  setLocalProjectRegistry,
  removeChapterContentFromLocal,
  removeProjectFromLocal,
} from "../lib/storage";
import { countWords, generateId } from "../lib/utils";
import { stripHtml } from "../lib/export";
import { clearDraft } from "../lib/draft";
import { createSnapshot, removeSnapshots } from "../lib/snapshots";

export function reorderChaptersByVolume(chapters: Chapter[]): Chapter[] {
  const byVolume = new Map<string, Chapter[]>();
  chapters.forEach((c) => {
    const key = c.parentId ?? "";
    if (!byVolume.has(key)) byVolume.set(key, []);
    byVolume.get(key)!.push(c);
  });

  const reordered = new Map<string, Chapter[]>();
  byVolume.forEach((list, key) => {
    reordered.set(key, list.map((c, idx) => ({ ...c, order: idx })));
  });

  return chapters.map((c) => {
    const key = c.parentId ?? "";
    const list = reordered.get(key)!;
    return list.find((rc) => rc.id === c.id)!;
  });
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: "system",
  recentProjects: [],
  editorTypography: DEFAULT_EDITOR_TYPOGRAPHY,
  editorPadding: 64,
  includePunctuationInWordCount: true,
  defaultChapterTargetWords: 4000,
  leftSidebarWidth: 256,
  firstLineIndent: true,
};

// Minimum interval between automatic version snapshots of the same chapter.
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

// Pending editor content that has not yet landed on disk. The workspace
// mirrors every keystroke here (in addition to the localStorage draft
// buffer) so that a window close can synchronously hand the very latest
// content to the flush routine — React state alone can lag one render.
export const pendingChapterContent = new Map<string, string>();

interface AppState {
  // Navigation
  view: ViewMode;
  setView: (view: ViewMode) => void;

  // Theme
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark" | "system") => void;
  applyTheme: () => void;

  // App settings
  appSettings: AppSettings;
  updateAppSettings: (settings: Partial<AppSettings>) => void;

  // Projects
  projects: Project[];
  loadProjects: () => Promise<void>;
  createProject: (data: Partial<Project>) => Promise<Project>;
  updateProject: (projectId: string, data: Partial<Project>) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  currentProject: Project | null;
  openProject: (project: Project) => Promise<void>;
  closeProject: () => Promise<void>;

  // Volumes & Chapters
  volumes: Volume[];
  chapters: Chapter[];
  currentChapter: Chapter | null;
  createVolume: (title: string) => Promise<Volume>;
  updateVolume: (volumeId: string, data: Partial<Volume>) => Promise<void>;
  deleteVolume: (volumeId: string) => Promise<void>;
  moveVolume: (volumeId: string, targetIndex: number) => Promise<void>;
  createChapter: (volumeId: string | null, title: string) => Promise<Chapter>;
  updateChapter: (chapterId: string, data: Partial<Chapter>) => Promise<void>;
  updateChapterWordCount: (chapterId: string, wordCount: number) => void;
  updateChapterContent: (chapterId: string, content: string) => Promise<void>;
  deleteChapter: (chapterId: string) => Promise<void>;
  setCurrentChapter: (chapter: Chapter | null) => Promise<void>;
  moveChapter: (chapterId: string, targetVolumeId: string | null, targetIndex: number) => Promise<void>;
  getChapterContent: (chapterId: string) => Promise<string>;
  /** Writes `content` to the chapter file — used by crash recovery to
   *  restore a draft over the on-disk version. */
  restoreChapterContent: (chapterId: string, content: string) => Promise<void>;

  // UI
  rightPanelTab: RightPanelTab;
  setRightPanelTab: (tab: RightPanelTab) => void;
  leftSidebarOpen: boolean;
  toggleLeftSidebar: () => void;
  rightSidebarOpen: boolean;
  toggleRightSidebar: () => void;
  focusMode: boolean;
  toggleFocusMode: () => void;

  // Persistence
  saveCurrentProject: () => Promise<void>;

  // Transient timestamp of the last successful save (manual, auto, or
  // structural). Used by StatusBar to show the "已保存" indicator reliably —
  // any save bumps it, even when content/word count did not change.
  lastSavedAt: number;

  // Set when an automatic (background) save fails — manual saves alert
  // directly, but autosave must not fail silently. StatusBar surfaces this
  // in red; cleared by the next successful save or explicit dismissal.
  saveError: string | null;
  dismissSaveError: () => void;
}

const loadAppSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem("inkwell-settings");
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings> & {
        // Legacy field from before the single content-location refactor.
        chapterCacheDirectory?: string;
      };
      // Migration: if the user had set the legacy chapter cache directory but
      // not the unified project save directory, promote it so their custom
      // content location is preserved.
      const projectSaveDirectory =
        parsed.projectSaveDirectory || parsed.chapterCacheDirectory || undefined;
      return {
        ...DEFAULT_APP_SETTINGS,
        ...parsed,
        projectSaveDirectory,
        editorTypography: {
          ...DEFAULT_APP_SETTINGS.editorTypography,
          ...(parsed.editorTypography || {}),
        },
      };
    }
  } catch {
    // ignore
  }
  return DEFAULT_APP_SETTINGS;
};

const persistAppSettings = (settings: AppSettings) => {
  localStorage.setItem("inkwell-settings", JSON.stringify(settings));
};

// Timestamp of the latest snapshot per chapter — module-level so it survives
// store re-creation (HMR) and is shared by the snapshot policy.
const lastSnapshotAt = new Map<string, number>();

export const useAppStore = create<AppState>((set, get) => ({
  view: "projects",
  setView: (view) => set({ view }),

  theme: "light",
  setTheme: (theme) => {
    get().updateAppSettings({ theme });
    get().applyTheme();
  },
  applyTheme: () => {
    const { appSettings } = get();
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = appSettings.theme === "system" ? (prefersDark ? "dark" : "light") : appSettings.theme;
    set({ theme });
    document.documentElement.classList.toggle("dark", theme === "dark");
  },

  appSettings: loadAppSettings(),
  updateAppSettings: (settings) => {
    const next = { ...get().appSettings, ...settings };
    set({ appSettings: next });
    persistAppSettings(next);
    if (settings.theme) get().applyTheme();
  },

  projects: [],
  loadProjects: async () => {
    set({ projects: await getLocalProjectRegistry(get().appSettings) });
  },
  createProject: async (data) => {
    const now = Date.now();
    const name = data.name?.trim() || "未命名作品";
    if (get().projects.some((p) => p.name === name)) {
      throw new Error(`已存在名为「${name}」的作品，请换一个名称`);
    }
    const project: Project = {
      id: generateId(),
      name,
      author: data.author || "",
      genre: data.genre || "",
      description: data.description || "",
      targetWords: data.targetWords || DEFAULT_PROJECT_TARGET_WORDS,
      createdAt: now,
      updatedAt: now,
    };
    const nextProjects = [...get().projects, project];
    set({ projects: nextProjects });
    await setLocalProjectRegistry(nextProjects);
    await saveProjectToLocal(project, [], [], get().appSettings);
    set({ lastSavedAt: Date.now(), saveError: null });
    return project;
  },
  updateProject: async (projectId, data) => {
    const { projects, currentProject } = get();
    const nextProjects = projects.map((p) =>
      p.id === projectId ? { ...p, ...data, updatedAt: Date.now() } : p,
    );
    set({ projects: nextProjects });
    await setLocalProjectRegistry(nextProjects);
    if (currentProject?.id === projectId) {
      const updated = nextProjects.find((p) => p.id === projectId)!;
      set({ currentProject: updated });
      await get().saveCurrentProject();
    }
  },
  deleteProject: async (projectId) => {
    const { chapters, appSettings } = get();
    // Clean up all chapter content files belonging to this project, then the
    // project file itself, so deletion does not leak orphaned files on disk.
    const projectChapters = chapters.filter((c) => c.projectId === projectId);
    await Promise.all(
      projectChapters.map(async (c) => {
        pendingChapterContent.delete(c.id);
        clearDraft(c.id);
        await removeSnapshots(c.id, appSettings);
        await removeChapterContentFromLocal(c.id, appSettings);
      }),
    );
    await removeProjectFromLocal(projectId, appSettings);
    const nextProjects = get().projects.filter((p) => p.id !== projectId);
    set({ projects: nextProjects });
    await setLocalProjectRegistry(nextProjects);
    if (get().currentProject?.id === projectId) await get().closeProject();
  },
  currentProject: null,
  openProject: async (project) => {
    const loaded = await loadProjectFromLocal(project.id, get().appSettings);
    const chapters = loaded ? loaded.chapters || [] : [];
    const currentChapter =
      chapters.length > 0
        ? [...chapters].sort((a, b) => b.updatedAt - a.updatedAt)[0]
        : null;
    if (loaded) {
      set({
        currentProject: loaded.project,
        volumes: loaded.volumes || [],
        chapters,
        currentChapter,
        view: "editor",
        focusMode: false,
      });
    } else {
      set({
        currentProject: project,
        volumes: [],
        chapters: [],
        currentChapter: null,
        view: "editor",
        focusMode: false,
      });
    }
    const { appSettings } = get();
    const recent = [project.id, ...appSettings.recentProjects.filter((id) => id !== project.id)].slice(0, 10);
    get().updateAppSettings({ recentProjects: recent });
    get().applyTheme();
  },
  closeProject: async () => {
    const savePromise = get().saveCurrentProject();
    set({ currentProject: null, volumes: [], chapters: [], currentChapter: null, view: "projects", focusMode: false });
    await savePromise;
  },

  volumes: [],
  chapters: [],
  currentChapter: null,
  createVolume: async (title) => {
    const { currentProject, volumes } = get();
    if (!currentProject) throw new Error("No project open");
    const volume: Volume = {
      id: generateId(),
      projectId: currentProject.id,
      title: title || `第 ${volumes.length + 1} 卷`,
      order: volumes.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const nextVolumes = [...volumes, volume];
    set({ volumes: nextVolumes });
    await get().saveCurrentProject();
    return volume;
  },
  updateVolume: async (volumeId, data) => {
    const nextVolumes = get().volumes.map((v) =>
      v.id === volumeId ? { ...v, ...data, updatedAt: Date.now() } : v,
    );
    set({ volumes: nextVolumes });
    await get().saveCurrentProject();
  },
  deleteVolume: async (volumeId) => {
    const { volumes, chapters, appSettings } = get();
    const nextVolumes = volumes
      .filter((v) => v.id !== volumeId)
      .map((v, idx) => ({ ...v, order: idx }));
    const doomedChapters = chapters.filter((c) => c.parentId === volumeId);
    await Promise.all(
      doomedChapters.map(async (c) => {
        pendingChapterContent.delete(c.id);
        clearDraft(c.id);
        await removeSnapshots(c.id, appSettings);
        await removeChapterContentFromLocal(c.id, appSettings);
      }),
    );
    const nextChapters = reorderChaptersByVolume(chapters.filter((c) => c.parentId !== volumeId));
    set({ volumes: nextVolumes, chapters: nextChapters });
    if (doomedChapters.some((c) => c.id === get().currentChapter?.id)) {
      set({ currentChapter: null });
    }
    await get().saveCurrentProject();
  },
  moveVolume: async (volumeId, targetIndex) => {
    const { volumes } = get();
    const volume = volumes.find((v) => v.id === volumeId);
    if (!volume) return;
    const others = volumes.filter((v) => v.id !== volumeId);
    others.splice(Math.max(0, Math.min(targetIndex, others.length)), 0, volume);
    set({ volumes: others.map((v, idx) => ({ ...v, order: idx })) });
    await get().saveCurrentProject();
  },
  createChapter: async (volumeId, title) => {
    const { currentProject, chapters, appSettings } = get();
    if (!currentProject) throw new Error("No project open");
    const volumeChapters = chapters.filter((c) => c.parentId === volumeId);
    const chapter: Chapter = {
      id: generateId(),
      projectId: currentProject.id,
      parentId: volumeId,
      title: title || `第 ${volumeChapters.length + 1} 章`,
      summary: "",
      order: volumeChapters.length,
      status: "draft",
      wordCount: 0,
      targetWords: appSettings.defaultChapterTargetWords,
      tags: [],
      notes: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const nextChapters = [...chapters, chapter];
    set({ chapters: nextChapters, currentChapter: chapter });
    await saveChapterContentToLocal(chapter.id, "", get().appSettings);
    await get().saveCurrentProject();
    return chapter;
  },
  updateChapter: async (chapterId, data) => {
    const nextChapters = get().chapters.map((c) =>
      c.id === chapterId ? { ...c, ...data, updatedAt: Date.now() } : c,
    );
    set({ chapters: nextChapters });
    if (get().currentChapter?.id === chapterId) {
      set({ currentChapter: nextChapters.find((c) => c.id === chapterId)! });
    }
    await get().saveCurrentProject();
  },
  // Updates the derived word count in memory only. Word count is recomputed
  // from content, so it does not need to persist on every keystroke — it is
  // written to the project JSON on chapter switch / close / manual save /
  // structural changes via saveCurrentProject. This avoids rewriting the full
  // project JSON on every keystroke.
  updateChapterWordCount: (chapterId, wordCount) => {
    const nextChapters = get().chapters.map((c) =>
      c.id === chapterId ? { ...c, wordCount } : c,
    );
    set({ chapters: nextChapters });
    if (get().currentChapter?.id === chapterId) {
      set({ currentChapter: nextChapters.find((c) => c.id === chapterId)! });
    }
  },
  updateChapterContent: async (chapterId, content) => {
    // Persist chapter content (.md) and recompute the word count in memory.
    // Deliberately does NOT call saveCurrentProject — that is the
    // responsibility of chapter switch / close / manual save, so typing does
    // not rewrite the whole project JSON.
    const { appSettings } = get();
    await saveChapterContentToLocal(chapterId, content, appSettings);
    // The content is safe on disk now: drop the crash-recovery draft and the
    // pending-close copy so they can never overwrite it with stale data.
    clearDraft(chapterId);
    pendingChapterContent.delete(chapterId);
    const text = stripHtml(content);
    const wordCount = countWords(text, appSettings.includePunctuationInWordCount);
    get().updateChapterWordCount(chapterId, wordCount);
    set({ lastSavedAt: Date.now(), saveError: null });

    // Version snapshots: at most one per SNAPSHOT_INTERVAL_MS per chapter,
    // only when the content actually changed since the last snapshot.
    const now = Date.now();
    const lastAt = lastSnapshotAt.get(chapterId) ?? 0;
    if (content && now - lastAt >= SNAPSHOT_INTERVAL_MS) {
      lastSnapshotAt.set(chapterId, now);
      createSnapshot(chapterId, content, appSettings).catch(() => {
        // Snapshot failure must never surface as a save failure — roll back
        // the timestamp so the next save retries.
        lastSnapshotAt.set(chapterId, lastAt);
      });
    }
  },
  deleteChapter: async (chapterId) => {
    const { chapters, appSettings } = get();
    const nextChapters = reorderChaptersByVolume(chapters.filter((c) => c.id !== chapterId));
    set({ chapters: nextChapters });
    if (get().currentChapter?.id === chapterId) set({ currentChapter: null });
    pendingChapterContent.delete(chapterId);
    clearDraft(chapterId);
    await removeSnapshots(chapterId, appSettings);
    await removeChapterContentFromLocal(chapterId, appSettings);
    await get().saveCurrentProject();
  },
  setCurrentChapter: async (chapter) => {
    const prev = get().currentChapter;
    set({ currentChapter: chapter });
    if (prev && chapter && prev.id !== chapter.id) {
      await get().saveCurrentProject();
    }
  },
  moveChapter: async (chapterId, targetVolumeId, targetIndex) => {
    const { chapters } = get();
    const chapter = chapters.find((c) => c.id === chapterId);
    if (!chapter) return;
    const others = chapters.filter((c) => c.id !== chapterId);
    const inTarget = others.filter((c) => c.parentId === targetVolumeId);
    const outsideTarget = others.filter((c) => c.parentId !== targetVolumeId);
    const moved = { ...chapter, parentId: targetVolumeId };
    inTarget.splice(Math.min(targetIndex, inTarget.length), 0, moved);
    const nextChapters = reorderChaptersByVolume([...inTarget, ...outsideTarget]);
    set({ chapters: nextChapters });
    await get().saveCurrentProject();
  },
  getChapterContent: async (chapterId) => {
    return loadChapterContentFromLocal(chapterId, get().appSettings);
  },
  restoreChapterContent: async (chapterId, content) => {
    // Same persistence path as a normal save, minus the snapshot policy —
    // restoring a recovery draft should not itself create a snapshot.
    const { appSettings } = get();
    await saveChapterContentToLocal(chapterId, content, appSettings);
    clearDraft(chapterId);
    pendingChapterContent.delete(chapterId);
    const text = stripHtml(content);
    const wordCount = countWords(text, appSettings.includePunctuationInWordCount);
    get().updateChapterWordCount(chapterId, wordCount);
    set({ lastSavedAt: Date.now(), saveError: null });
    await get().saveCurrentProject();
  },

  rightPanelTab: "none",
  setRightPanelTab: (tab) => set({ rightPanelTab: tab, rightSidebarOpen: tab !== "none" }),
  leftSidebarOpen: true,
  toggleLeftSidebar: () => set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),
  rightSidebarOpen: false,
  toggleRightSidebar: () =>
    set((s) => ({
      rightSidebarOpen: !s.rightSidebarOpen,
      rightPanelTab: s.rightSidebarOpen ? "none" : "outline",
    })),
  focusMode: false,
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),

  lastSavedAt: 0,
  saveError: null,
  dismissSaveError: () => set({ saveError: null }),

  saveCurrentProject: async () => {
    const { currentProject, volumes, chapters } = get();
    if (currentProject) {
      await saveProjectToLocal(currentProject, chapters, volumes, get().appSettings);
      set({ lastSavedAt: Date.now(), saveError: null });
    }
  },
}));

// Auto-save current chapter content on store changes
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleAutoSave(chapterId: string, content: string) {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    useAppStore
      .getState()
      .updateChapterContent(chapterId, content)
      .catch((err) => {
        // Autosave runs in the background — there is no user gesture to
        // alert on, so record the failure for the StatusBar instead of
        // swallowing it silently.
        useAppStore.setState({
          saveError: err instanceof Error ? err.message : String(err),
        });
      });
  }, 3000);
}
