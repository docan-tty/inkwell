import { create } from "zustand";
import type {
  AppSettings,
  Chapter,
  DictEntry,
  LeftSidebarTab,
  Note,
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
  loadDictFromLocal,
  loadNotesFromLocal,
  loadProjectFromLocal,
  registerChapterOwners,
  renameChapterFile,
  renameProjectFolder,
  saveChapterContentToLocal,
  saveDictToLocal,
  saveNotesToLocal,
  saveProjectToLocal,
  setLocalProjectRegistry,
  unregisterChapterOwners,
  removeChapterContentFromLocal,
  removeProjectFromLocal,
} from "../lib/storage";
import { countWords, generateId } from "../lib/utils";
import { stripHtml } from "../lib/export";
import { replaceAllInHtml, replaceMatchAtOffset, replaceMatchInHtml } from "../lib/replace";
import { clearDraft } from "../lib/draft";
import { createSnapshot, removeSnapshots } from "../lib/snapshots";
import { computeThemeVars, type AccentKey, type PaperKey } from "../lib/theme";
import { clearProjectStats } from "../lib/stats";

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
  editorMaxWidth: 880,
  includePunctuationInWordCount: true,
  defaultChapterTargetWords: 4000,
  leftSidebarWidth: 256,
  firstLineIndent: true,
  themeColor: "brown",
  paperTexture: "plain",
};

// Minimum interval between automatic version snapshots of the same chapter.
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

// Pending editor content that has not yet landed on disk. The workspace
// mirrors every keystroke here (in addition to the localStorage draft
// buffer) so that a window close can synchronously hand the very latest
// content to the flush routine — React state alone can lag one render.
// Each entry carries a monotonically increasing sequence number: a queued
// autosave compares its captured seq against the stored one and drops the
// write if a newer keystroke has since landed (prevents a late timer from
// overwriting fresher content with an older buffer).
export const pendingChapterContent = new Map<string, { content: string; seq: number }>();
let pendingSeq = 0;

export function setPendingChapterContent(chapterId: string, content: string): number {
  const seq = ++pendingSeq;
  pendingChapterContent.set(chapterId, { content, seq });
  return seq;
}

// Writes every pending (not-yet-on-disk) chapter content entry and drops
// the corresponding crash-recovery drafts. Called before chapter switches,
// project close and window close so no timer window can lose content.
export async function flushPendingChapterContents(
  settings: Parameters<typeof saveChapterContentToLocal>[2],
): Promise<void> {
  const chapters = useAppStore.getState().chapters;
  const titleOf = (id: string) => chapters.find((c) => c.id === id)?.title;
  const entries = [...pendingChapterContent.entries()];
  await Promise.all(
    entries.map(async ([chapterId, { content }]) => {
      await saveChapterContentToLocal(chapterId, content, settings, titleOf(chapterId));
      clearDraft(chapterId);
      pendingChapterContent.delete(chapterId);
    }),
  );
}

// Synchronously persists the notes + dictionary payloads of the project
// being left. Must run BEFORE openProject/closeProject swaps the in-memory
// notes/dictEntries — the debounced timers would otherwise fire after the
// swap and silently lose the last <800ms of edits.
export async function flushPendingMetaSaves(): Promise<void> {
  const { currentProject, notes, dictEntries, appSettings } = useAppStore.getState();
  if (!currentProject) return;
  await Promise.all([
    saveNotesToLocal(currentProject.id, notes, appSettings).catch(() => {}),
    saveDictToLocal(currentProject.id, dictEntries, appSettings).catch(() => {}),
  ]);
}

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
  /** 把「跟随默认」的章节目标字数重置为 0（随新默认值自动生效）。 */
  applyChapterTargetWords: (targetWords: number, previousDefault: number) => void;
  updateChapterContent: (chapterId: string, content: string) => Promise<void>;
  deleteChapter: (chapterId: string) => Promise<void>;
  setCurrentChapter: (chapter: Chapter | null) => Promise<void>;
  moveChapter: (chapterId: string, targetVolumeId: string | null, targetIndex: number) => Promise<void>;
  getChapterContent: (chapterId: string) => Promise<string>;
  /** Writes `content` to the chapter file — used by crash recovery to
   *  restore a draft over the on-disk version. */
  restoreChapterContent: (chapterId: string, content: string) => Promise<void>;
  /** Find-and-replace inside one chapter's content (HTML). The `mode`
   *  selects the Nth match (legacy ordinal), the match at an exact plain-text
   *  offset (validated against the query — preferred, immune to result-list
   *  drift), or every replaceable match (replace-all). Matches spanning tag
   *  boundaries are reported as skipped, never half-replaced. */
  replaceInChapter: (
    chapterId: string,
    query: string,
    replacement: string,
    caseSensitive: boolean,
    mode: { type: "one"; ordinal: number } | { type: "at"; offset: number } | { type: "all" },
  ) => Promise<{ replaced: number; skipped: number; stale?: boolean }>;
  /** Monotonic counter bumped whenever chapter content is restored from a
   *  snapshot/draft. The Workspace load effect depends on it so a restore
   *  actually refreshes the open editor (and can't be re-overwritten by the
   *  stale buffer afterwards). */
  contentVersion: number;

  // UI
  rightPanelTab: RightPanelTab;
  setRightPanelTab: (tab: RightPanelTab) => void;
  /** 左侧栏当前页签（目录 / 笔记 / 词典）。 */
  leftSidebarTab: LeftSidebarTab;
  setLeftSidebarTab: (tab: LeftSidebarTab) => void;
  leftSidebarOpen: boolean;
  toggleLeftSidebar: () => void;
  rightSidebarOpen: boolean;
  toggleRightSidebar: () => void;
  focusMode: boolean;
  toggleFocusMode: () => void;

  // Notes (写作笔记) — per-project scratch notes, debounced autosave.
  notes: Note[];
  activeNoteId: string | null;
  setActiveNote: (id: string | null) => void;
  addNote: (folder?: string) => void;
  updateNote: (id: string, data: Partial<Note>) => void;
  removeNote: (id: string) => void;
  /** 重命名笔记文件夹：批量改写该文件夹下所有笔记的 folder 字段。 */
  renameNoteFolder: (oldName: string, newName: string) => void;
  /** 删除笔记文件夹：其中笔记移回未归档（folder 置空）。 */
  dissolveNoteFolder: (name: string) => void;

  // Dictionary (设定词典) — per-project worldbuilding entries, debounced autosave.
  dictEntries: DictEntry[];
  activeDictId: string | null;
  setActiveDict: (id: string | null) => void;
  addDictEntry: (category?: string) => void;
  updateDictEntry: (id: string, data: Partial<DictEntry>) => void;
  removeDictEntry: (id: string) => void;

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
  try {
    localStorage.setItem("inkwell-settings", JSON.stringify(settings));
  } catch {
    // Settings persistence is best-effort (quota / private-mode failures must
    // not crash the app) — the in-memory state keeps working this session.
  }
};

// Timestamp of the latest snapshot per chapter — module-level so it survives
// store re-creation (HMR) and is shared by the snapshot policy.
const lastSnapshotAt = new Map<string, number>();

// Layout snapshot taken when entering focus mode, restored on exit.
let preFocusLayout: { left: boolean; right: boolean; tab: RightPanelTab } | null = null;

// Monotonic token guarding openProject: a slower async load must never win
// over a newer open (double-clicking two projects interleaves their loads;
// without the token the FIRST project's chapters/notes could overwrite the
// SECOND project's state).
let openProjectSeq = 0;

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

    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");

    // Write the full palette as CSS variables; Tailwind utilities read these.
    const vars = computeThemeVars(
      appSettings.theme,
      (appSettings.themeColor as AccentKey) || "brown",
      (appSettings.paperTexture as PaperKey) || "plain",
      prefersDark,
    );
    for (const [k, v] of Object.entries(vars)) {
      root.style.setProperty(`--${k}`, v);
    }

    // 界面字体：设置项为空时移除变量，回落到 App.css 里的默认栈。
    if (appSettings.uiFontFamily) {
      root.style.setProperty("--inkwell-ui-font", appSettings.uiFontFamily);
    } else {
      root.style.removeProperty("--inkwell-ui-font");
    }
  },

  appSettings: loadAppSettings(),
  updateAppSettings: (settings) => {
    const next = { ...get().appSettings, ...settings };
    set({ appSettings: next });
    persistAppSettings(next);
    if (settings.theme || settings.themeColor || settings.paperTexture || settings.uiFontFamily !== undefined)
      get().applyTheme();
  },

  projects: [],
  loadProjects: async () => {
    try {
      set({ projects: await getLocalProjectRegistry(get().appSettings) });
    } catch (err) {
      // A corrupt registry must not white-screen the library — show the
      // error and keep the previous list.
      console.error("加载作品索引失败", err);
      set({ saveError: err instanceof Error ? err.message : String(err) });
    }
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
    const oldName = projects.find((p) => p.id === projectId)?.name;
    // Renaming a work moves its folder ({旧名}-{id} → {新名}-{id}) BEFORE the
    // registry/state update: if the move fails we throw here and nothing
    // changes — the alternative (registry updated, folder stuck at the old
    // name) splits the work across two folders and strands its chapters.
    if (data.name && oldName && data.name !== oldName) {
      await renameProjectFolder(oldName, projectId, data.name, get().appSettings);
    }
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
    // project folder itself, so deletion does not leak orphaned files on disk.
    const projectChapters = chapters.filter((c) => c.projectId === projectId);
    await Promise.all(
      projectChapters.map(async (c) => {
        pendingChapterContent.delete(c.id);
        clearDraft(c.id);
        await removeSnapshots(c.id, appSettings);
        await removeChapterContentFromLocal(c.id, appSettings, c.title);
      }),
    );
    unregisterChapterOwners(projectChapters.map((c) => c.id));
    await removeProjectFromLocal(projectId, appSettings);
    clearProjectStats(projectId);
    const nextProjects = get().projects.filter((p) => p.id !== projectId);
    set({ projects: nextProjects });
    await setLocalProjectRegistry(nextProjects);
    if (get().currentProject?.id === projectId) await get().closeProject();
  },
  currentProject: null,
  openProject: async (project) => {
    const seq = ++openProjectSeq;
    const stale = () => seq !== openProjectSeq;
    // Flush the outgoing project's notes/dict BEFORE swapping state — the
    // debounced meta-save timers would otherwise fire after the swap and
    // lose the last <800ms of edits (they read the NEW project's data).
    await flushPendingMetaSaves();
    cancelAutoSave();
    const loaded = await loadProjectFromLocal(project.id, get().appSettings);
    if (stale()) return; // a newer openProject won the race — discard
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
    // Register chapter → project ownership so content/snapshot paths resolve
    // into this project's folder ({作品名}-{id}/chapters/…).
    const opened = get().currentProject;
    if (opened) registerChapterOwners(chapters, get().volumes, opened.id, opened.name);
    // Load this project's writing notes alongside its chapters.
    const notes = await loadNotesFromLocal(project.id, appSettings).catch(() => []);
    const dictEntries = await loadDictFromLocal(project.id, appSettings).catch(() => []);
    if (stale()) return;
    set({ notes, activeNoteId: notes[0]?.id ?? null, dictEntries, activeDictId: dictEntries[0]?.id ?? null });
  },
  closeProject: async () => {
    // Invalidate any in-flight openProject so its late resolutions can't
    // resurrect state after this close.
    openProjectSeq++;
    // Capture references first, flush everything to disk, and only then
    // clear state. Relying on get() inside saveCurrentProject happening
    // before set() is evaluation-order luck — and any pending chapter
    // content/notes inside a debounce window would be lost.
    const project = get().currentProject;
    const appSettings = get().appSettings;
    cancelAutoSave();
    try {
      await flushPendingChapterContents(appSettings);
      await flushPendingMetaSaves();
      if (project) {
        await saveProjectToLocal(project, get().chapters, get().volumes, appSettings);
        set({ lastSavedAt: Date.now(), saveError: null });
      }
    } finally {
      set({
        currentProject: null,
        volumes: [],
        chapters: [],
        currentChapter: null,
        view: "projects",
        focusMode: false,
        notes: [],
        activeNoteId: null,
        dictEntries: [],
        activeDictId: null,
      });
    }
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
        await removeChapterContentFromLocal(c.id, appSettings, c.title);
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
  // 章节目标字数：0/未设置 = 跟随全局默认；正数为该章自定义目标。
  // 老数据的章节目标是具体数值，改默认值时若本章目标恰好等于旧默认值，
  // 视为「跟随默认」一并更新——否则用户改了设置却看不到当前章节变化。
  applyChapterTargetWords: (_targetWords, previousDefault) => {
    const follows = (c: Chapter) =>
      !c.targetWords || c.targetWords === previousDefault;
    const chapters = get().chapters.map((c) =>
      follows(c) ? { ...c, targetWords: 0 } : c,
    );
    const current = get().currentChapter;
    set({
      chapters,
      currentChapter:
        current && follows(current) ? { ...current, targetWords: 0 } : current,
    });
  },

  createChapter: async (volumeId, title) => {
    const { currentProject, chapters } = get();
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
      targetWords: 0,
      tags: [],
      notes: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const nextChapters = [...chapters, chapter];
    set({ chapters: nextChapters, currentChapter: chapter });
    registerChapterOwners(nextChapters, get().volumes, currentProject.id, currentProject.name);
    await saveChapterContentToLocal(chapter.id, "", get().appSettings, chapter.title);
    await get().saveCurrentProject();
    return chapter;
  },
  updateChapter: async (chapterId, data) => {
    const oldChapter = get().chapters.find((c) => c.id === chapterId);
    const nextChapters = get().chapters.map((c) =>
      c.id === chapterId ? { ...c, ...data, updatedAt: Date.now() } : c,
    );
    set({ chapters: nextChapters });
    if (get().currentChapter?.id === chapterId) {
      set({ currentChapter: nextChapters.find((c) => c.id === chapterId)! });
    }
    // 章节改名 → 同步移动磁盘上的章节文件（标题即文件名）。
    if (data.title && oldChapter && oldChapter.title !== data.title) {
      await renameChapterFile(chapterId, oldChapter.title, data.title, get().appSettings);
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
    const { appSettings, chapters } = get();
    const title = chapters.find((c) => c.id === chapterId)?.title;
    await saveChapterContentToLocal(chapterId, content, appSettings, title);
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
    const title = chapters.find((c) => c.id === chapterId)?.title;
    await removeChapterContentFromLocal(chapterId, appSettings, title);
    await get().saveCurrentProject();
  },
  setCurrentChapter: async (chapter) => {
    const prev = get().currentChapter;
    set({ currentChapter: chapter });
    if (prev && chapter && prev.id !== chapter.id) {
      // Flush the previous chapter's pending content + cancel its queued
      // autosave before persisting the project JSON — a late timer writing
      // an older buffer over fresher content is the classic lost-work race.
      cancelAutoSave();
      await flushPendingChapterContents(get().appSettings).catch(() => {});
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
    // Clamp both ends: a negative index would trigger splice's
    // count-from-the-end semantics (moveVolume already clamps both).
    inTarget.splice(Math.max(0, Math.min(targetIndex, inTarget.length)), 0, moved);
    const nextChapters = reorderChaptersByVolume([...inTarget, ...outsideTarget]);
    set({ chapters: nextChapters });
    await get().saveCurrentProject();
  },
  getChapterContent: async (chapterId) => {
    const title = get().chapters.find((c) => c.id === chapterId)?.title;
    return loadChapterContentFromLocal(chapterId, get().appSettings, title);
  },
  replaceInChapter: async (chapterId, query, replacement, caseSensitive, mode) => {
    if (!query) return { replaced: 0, skipped: 0 };
    // Flush first so we replace on top of the freshest bytes — otherwise a
    // pending keystroke buffer would be written back over the replacement.
    cancelAutoSave();
    await flushPendingChapterContents(get().appSettings).catch(() => {});
    const title = get().chapters.find((c) => c.id === chapterId)?.title;
    const html = await loadChapterContentFromLocal(chapterId, get().appSettings, title);
    const result =
      mode.type === "one"
        ? replaceMatchInHtml(html, query, replacement, mode.ordinal, caseSensitive)
        : mode.type === "at"
          ? replaceMatchAtOffset(html, query, replacement, mode.offset, caseSensitive)
          : replaceAllInHtml(html, query, replacement, caseSensitive);
    // Stale offset: the chapter changed since the search result was produced.
    // Report it (no write) so the caller can re-search instead of silently
    // replacing a different match.
    if ("stale" in result && result.stale) {
      return { replaced: 0, skipped: 0, stale: true };
    }
    if (result.replaced === 0) return { replaced: 0, skipped: result.skipped };
    const { appSettings } = get();
    await saveChapterContentToLocal(chapterId, result.html, appSettings, title);
    clearDraft(chapterId);
    pendingChapterContent.delete(chapterId);
    const wordCount = countWords(stripHtml(result.html), appSettings.includePunctuationInWordCount);
    get().updateChapterWordCount(chapterId, wordCount);
    set({ lastSavedAt: Date.now(), saveError: null });
    await get().saveCurrentProject();
    // Bumping contentVersion reloads the open editor with the replaced bytes.
    set((s) => ({ contentVersion: s.contentVersion + 1 }));
    return { replaced: result.replaced, skipped: result.skipped };
  },
  contentVersion: 0,
  restoreChapterContent: async (chapterId, content) => {
    // Same persistence path as a normal save, minus the snapshot policy —
    // restoring a recovery draft should not itself create a snapshot.
    // contentVersion bumps AFTER the write so the Workspace reload effect
    // re-reads the restored bytes (and can't re-overwrite them with the
    // stale in-memory buffer).
    const { appSettings } = get();
    const title = get().chapters.find((c) => c.id === chapterId)?.title;
    await saveChapterContentToLocal(chapterId, content, appSettings, title);
    clearDraft(chapterId);
    pendingChapterContent.delete(chapterId);
    const text = stripHtml(content);
    const wordCount = countWords(text, appSettings.includePunctuationInWordCount);
    get().updateChapterWordCount(chapterId, wordCount);
    set({ lastSavedAt: Date.now(), saveError: null });
    await get().saveCurrentProject();
    set((s) => ({ contentVersion: s.contentVersion + 1 }));
  },

  rightPanelTab: "none",
  setRightPanelTab: (tab) => set({ rightPanelTab: tab, rightSidebarOpen: tab !== "none" }),
  leftSidebarTab: "chapters",
  setLeftSidebarTab: (tab) => set({ leftSidebarTab: tab, leftSidebarOpen: true }),
  leftSidebarOpen: true,
  toggleLeftSidebar: () => set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),
  rightSidebarOpen: false,
  toggleRightSidebar: () =>
    set((s) => ({
      rightSidebarOpen: !s.rightSidebarOpen,
      rightPanelTab: s.rightSidebarOpen ? "none" : "outline",
    })),
  focusMode: false,
  toggleFocusMode: () =>
    set((s) => {
      if (s.focusMode) {
        // Leaving focus mode: restore the layout from before we entered it.
        const saved = preFocusLayout;
        preFocusLayout = null;
        return {
          focusMode: false,
          leftSidebarOpen: saved?.left ?? s.leftSidebarOpen,
          rightSidebarOpen: saved?.right ?? false,
          rightPanelTab: saved?.right ? (saved.tab === "none" ? "outline" : saved.tab) : "none",
        };
      }
      // Entering focus mode: remember the layout, then hide both sidebars.
      preFocusLayout = {
        left: s.leftSidebarOpen,
        right: s.rightSidebarOpen,
        tab: s.rightPanelTab,
      };
      return { focusMode: true, leftSidebarOpen: false, rightSidebarOpen: false, rightPanelTab: "none" };
    }),

  lastSavedAt: 0,
  saveError: null,
  dismissSaveError: () => set({ saveError: null }),

  // --- Notes --------------------------------------------------------------
  notes: [],
  activeNoteId: null,
  setActiveNote: (id) => set({ activeNoteId: id }),
  addNote: (folder) => {
    const note: Note = {
      id: generateId(),
      title: `笔记 ${get().notes.length + 1}`,
      content: "",
      folder: folder || undefined,
      updatedAt: Date.now(),
    };
    set((s) => ({ notes: [note, ...s.notes], activeNoteId: note.id }));
    scheduleNoteSave(get().currentProject?.id ?? null, get().notes);
  },
  updateNote: (id, data) => {
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, ...data, updatedAt: Date.now() } : n)),
    }));
    scheduleNoteSave(get().currentProject?.id ?? null, get().notes);
  },
  removeNote: (id) => {
    set((s) => {
      const next = s.notes.filter((n) => n.id !== id);
      return {
        notes: next,
        activeNoteId: s.activeNoteId === id ? (next[0]?.id ?? null) : s.activeNoteId,
      };
    });
    scheduleNoteSave(get().currentProject?.id ?? null, get().notes);
  },
  renameNoteFolder: (oldName, newName) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    set((s) => ({
      notes: s.notes.map((n) => ((n.folder ?? "") === oldName ? { ...n, folder: trimmed } : n)),
    }));
    scheduleNoteSave(get().currentProject?.id ?? null, get().notes);
  },
  dissolveNoteFolder: (name) => {
    set((s) => ({
      notes: s.notes.map((n) => ((n.folder ?? "") === name ? { ...n, folder: undefined } : n)),
    }));
    scheduleNoteSave(get().currentProject?.id ?? null, get().notes);
  },

  // --- Dictionary -----------------------------------------------------------
  dictEntries: [],
  activeDictId: null,
  setActiveDict: (id) => set({ activeDictId: id }),
  addDictEntry: (category) => {
    const entry: DictEntry = {
      id: generateId(),
      term: "",
      aliases: [],
      category: category || "人物",
      content: "",
      updatedAt: Date.now(),
    };
    set((s) => ({ dictEntries: [entry, ...s.dictEntries], activeDictId: entry.id }));
    scheduleDictSave(get().currentProject?.id ?? null, get().dictEntries);
  },
  updateDictEntry: (id, data) => {
    set((s) => ({
      dictEntries: s.dictEntries.map((e) => (e.id === id ? { ...e, ...data, updatedAt: Date.now() } : e)),
    }));
    scheduleDictSave(get().currentProject?.id ?? null, get().dictEntries);
  },
  removeDictEntry: (id) => {
    set((s) => {
      const next = s.dictEntries.filter((e) => e.id !== id);
      return {
        dictEntries: next,
        activeDictId: s.activeDictId === id ? (next[0]?.id ?? null) : s.activeDictId,
      };
    });
    scheduleDictSave(get().currentProject?.id ?? null, get().dictEntries);
  },

  saveCurrentProject: async () => {
    const { currentProject, volumes, chapters } = get();
    if (currentProject) {
      await saveProjectToLocal(currentProject, chapters, volumes, get().appSettings);
      set({ lastSavedAt: Date.now(), saveError: null });
    }
  },
}));

// Auto-save current chapter content on store changes. The callback compares
// the seq captured at schedule time against the pending map's current seq:
// if a newer keystroke landed (or a flush already wrote the content), this
// stale timer silently stands down instead of overwriting with older bytes.
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

export function cancelAutoSave() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
}

export function scheduleAutoSave(chapterId: string, content: string) {
  const seq = setPendingChapterContent(chapterId, content);
  cancelAutoSave();
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    const pending = pendingChapterContent.get(chapterId);
    if (!pending || pending.seq !== seq) return;
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

// Debounced persistence for the notes list of the open project. The payload
// (project id + note snapshot) is captured AT SCHEDULE TIME — reading it
// from the store at fire time would lose the last edits whenever the user
// switches/closes the project inside the debounce window.
let noteSaveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleNoteSave(projectId: string | null, notes: Note[]) {
  if (noteSaveTimer) clearTimeout(noteSaveTimer);
  if (!projectId) return;
  noteSaveTimer = setTimeout(() => {
    const { appSettings } = useAppStore.getState();
    saveNotesToLocal(projectId, notes, appSettings).catch(() => {});
  }, 800);
}

// Debounced persistence for the dictionary of the open project — same
// capture-at-schedule discipline as the notes timer.
let dictSaveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleDictSave(projectId: string | null, entries: DictEntry[]) {
  if (dictSaveTimer) clearTimeout(dictSaveTimer);
  if (!projectId) return;
  dictSaveTimer = setTimeout(() => {
    const { appSettings } = useAppStore.getState();
    saveDictToLocal(projectId, entries, appSettings).catch(() => {});
  }, 800);
}
