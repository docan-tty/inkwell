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
  DEFAULT_PROJECT_SETTINGS,
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
} from "../lib/storage";
import { generateId } from "../lib/utils";

const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: "system",
  recentProjects: [],
  editorTypography: DEFAULT_EDITOR_TYPOGRAPHY,
  editorPadding: 64,
  includePunctuationInWordCount: true,
  defaultChapterTargetWords: 4000,
  leftSidebarWidth: 256,
};

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
  createChapter: (volumeId: string | null, title: string) => Promise<Chapter>;
  updateChapter: (chapterId: string, data: Partial<Chapter>) => Promise<void>;
  updateChapterContent: (chapterId: string, content: string) => Promise<void>;
  deleteChapter: (chapterId: string) => Promise<void>;
  setCurrentChapter: (chapter: Chapter | null) => Promise<void>;
  moveChapter: (chapterId: string, targetVolumeId: string | null, targetIndex: number) => Promise<void>;
  getChapterContent: (chapterId: string) => Promise<string>;

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
}

const loadAppSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem("inkwell-settings");
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return {
        ...DEFAULT_APP_SETTINGS,
        ...parsed,
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
    const project: Project = {
      id: generateId(),
      name: data.name || "未命名作品",
      author: data.author || "",
      genre: data.genre || "",
      description: data.description || "",
      targetWords: data.targetWords || DEFAULT_PROJECT_TARGET_WORDS,
      createdAt: now,
      updatedAt: now,
      settings: { ...DEFAULT_PROJECT_SETTINGS, ...(data.settings || {}) },
    };
    const nextProjects = [...get().projects, project];
    set({ projects: nextProjects });
    await setLocalProjectRegistry(nextProjects, get().appSettings);
    await saveProjectToLocal(project, [], [], get().appSettings);
    return project;
  },
  updateProject: async (projectId, data) => {
    const { projects, currentProject } = get();
    const nextProjects = projects.map((p) =>
      p.id === projectId ? { ...p, ...data, updatedAt: Date.now() } : p,
    );
    set({ projects: nextProjects });
    await setLocalProjectRegistry(nextProjects, get().appSettings);
    if (currentProject?.id === projectId) {
      const updated = nextProjects.find((p) => p.id === projectId)!;
      set({ currentProject: updated });
      await get().saveCurrentProject();
    }
  },
  deleteProject: async (projectId) => {
    const nextProjects = get().projects.filter((p) => p.id !== projectId);
    set({ projects: nextProjects });
    await setLocalProjectRegistry(nextProjects, get().appSettings);
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
    await get().saveCurrentProject();
    set({ currentProject: null, volumes: [], chapters: [], currentChapter: null, view: "projects", focusMode: false });
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
    const nextVolumes = get().volumes.filter((v) => v.id !== volumeId);
    const nextChapters = get().chapters
      .filter((c) => c.parentId !== volumeId)
      .map((c, idx) => ({ ...c, order: idx }));
    set({ volumes: nextVolumes, chapters: nextChapters });
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
      contentPath: `chapters/${volumeId || "default"}/${generateId()}.md`,
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
  updateChapterContent: async (chapterId, content) => {
    await saveChapterContentToLocal(chapterId, content, get().appSettings);
    const { appSettings } = get();
    // Update word count
    const includePunctuation = appSettings.includePunctuationInWordCount;
    const text = content.replace(/<[^>]+>/g, "");
    const wordCount = Array.from(text.replace(/\s/g, "")).length;
    const realCount = includePunctuation
      ? wordCount
      : (text.match(/[一-鿿]/g) || []).length + (text.match(/[a-zA-Z0-9]+/g) || []).length;
    await get().updateChapter(chapterId, { wordCount: includePunctuation ? wordCount : realCount });
  },
  deleteChapter: async (chapterId) => {
    const nextChapters = get().chapters.filter((c) => c.id !== chapterId);
    set({ chapters: nextChapters });
    if (get().currentChapter?.id === chapterId) set({ currentChapter: null });
    await removeChapterContentFromLocal(chapterId, get().appSettings);
    await get().saveCurrentProject();
  },
  setCurrentChapter: async (chapter) => {
    // Save previous chapter if any
    const prev = get().currentChapter;
    if (prev && chapter && prev.id !== chapter.id) {
      await get().saveCurrentProject();
    }
    set({ currentChapter: chapter });
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
    const reordered = [...inTarget, ...outsideTarget].map((c, idx) => ({ ...c, order: idx }));
    set({ chapters: reordered });
    await get().saveCurrentProject();
  },
  getChapterContent: async (chapterId) => {
    return loadChapterContentFromLocal(chapterId, get().appSettings);
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

  saveCurrentProject: async () => {
    const { currentProject, volumes, chapters } = get();
    if (currentProject) {
      await saveProjectToLocal(currentProject, chapters, volumes, get().appSettings);
    }
  },
}));

// Auto-save current chapter content on store changes
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleAutoSave(chapterId: string, content: string) {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveChapterContentToLocal(chapterId, content, useAppStore.getState().appSettings).catch(() => {});
    useAppStore.getState().updateChapterContent(chapterId, content).catch(() => {});
  }, 3000);
}
