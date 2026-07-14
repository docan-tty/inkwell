import type { Chapter, Project, Volume } from "../types";

export interface StorageConfig {
  projectSaveDirectory?: string;
  chapterCacheDirectory?: string;
}

const APP_DATA_KEY = "inkwell-app-data";
const PROJECTS_KEY = "inkwell-projects";
const PROJECT_PREFIX = "inkwell-project-";
const CHAPTER_PREFIX = "inkwell-chapter-";

let tauriFs: typeof import("@tauri-apps/plugin-fs") | null = null;
let tauriPath: typeof import("@tauri-apps/api/path") | null = null;

async function getFs() {
  if (!tauriFs && "__TAURI_INTERNALS__" in window) {
    try {
      tauriFs = await import("@tauri-apps/plugin-fs");
    } catch {
      tauriFs = null;
    }
  }
  return tauriFs;
}

async function getPath() {
  if (!tauriPath && "__TAURI_INTERNALS__" in window) {
    try {
      tauriPath = await import("@tauri-apps/api/path");
    } catch {
      tauriPath = null;
    }
  }
  return tauriPath;
}

export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

async function getAppDataDir(): Promise<string> {
  if (!isTauri()) return APP_DATA_KEY;
  const pathMod = await getPath();
  return pathMod ? await pathMod.appDataDir() : APP_DATA_KEY;
}

async function getProjectBaseDir(config?: StorageConfig): Promise<string> {
  if (config?.projectSaveDirectory) return config.projectSaveDirectory;
  return getAppDataDir();
}

async function getChapterBaseDir(config?: StorageConfig): Promise<string> {
  if (config?.chapterCacheDirectory) return config.chapterCacheDirectory;
  return getAppDataDir();
}

async function buildPath(parts: string[]): Promise<string> {
  const pathMod = await getPath();
  if (pathMod) {
    return pathMod.join(...parts);
  }
  return parts.filter(Boolean).join("/");
}

export async function ensureDir(path: string): Promise<void> {
  if (!isTauri()) return;
  const fs = await getFs();
  const pathMod = await getPath();
  if (!fs || !pathMod) return;
  try {
    const dir = await pathMod.dirname(path);
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // ignore
  }
}

export function getProjectStorageKey(projectId: string): string {
  return `${PROJECT_PREFIX}${projectId}`;
}

export function getChapterStorageKey(chapterId: string): string {
  return `${CHAPTER_PREFIX}${chapterId}`;
}

async function getProjectRegistryPath(config?: StorageConfig): Promise<string> {
  const dir = await getProjectBaseDir(config);
  return buildPath([dir, "registry.json"]);
}

async function getProjectFilePath(projectId: string, config?: StorageConfig): Promise<string> {
  const dir = await getProjectBaseDir(config);
  return buildPath([dir, "projects", `${projectId}.json`]);
}

async function getChapterFilePath(chapterId: string, config?: StorageConfig): Promise<string> {
  const dir = await getChapterBaseDir(config);
  return buildPath([dir, "chapters", `${chapterId}.md`]);
}

async function readFileOrFallback(path: string, fallback: () => string | null): Promise<string | null> {
  if (!isTauri()) return fallback();
  const fs = await getFs();
  if (!fs) return fallback();
  try {
    return await fs.readTextFile(path);
  } catch {
    return fallback();
  }
}

async function writeFile(path: string, content: string): Promise<void> {
  if (!isTauri()) return;
  const fs = await getFs();
  if (!fs) return;
  await ensureDir(path);
  await fs.writeTextFile(path, content);
}

export async function getLocalProjectRegistry(config?: StorageConfig): Promise<Project[]> {
  const fallback = () => {
    try {
      const raw = localStorage.getItem(PROJECTS_KEY);
      return raw ?? null;
    } catch {
      return null;
    }
  };
  const raw = await readFileOrFallback(await getProjectRegistryPath(config), fallback);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function setLocalProjectRegistry(projects: Project[], config?: StorageConfig): Promise<void> {
  const raw = JSON.stringify(projects);
  if (!isTauri()) {
    localStorage.setItem(PROJECTS_KEY, raw);
    return;
  }
  const path = await getProjectRegistryPath(config);
  await writeFile(path, raw);
  localStorage.setItem(PROJECTS_KEY, raw);
}

export async function loadProjectFromLocal(
  projectId: string,
  config?: StorageConfig,
): Promise<{ project: Project; chapters: Chapter[]; volumes: Volume[] } | null> {
  const fallback = () => localStorage.getItem(getProjectStorageKey(projectId));
  const raw = await readFileOrFallback(await getProjectFilePath(projectId, config), fallback);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveProjectToLocal(
  project: Project,
  chapters: Chapter[],
  volumes: Volume[],
  config?: StorageConfig,
): Promise<void> {
  const raw = JSON.stringify({ project, chapters, volumes });
  if (!isTauri()) {
    localStorage.setItem(getProjectStorageKey(project.id), raw);
    return;
  }
  const path = await getProjectFilePath(project.id, config);
  await writeFile(path, raw);
  localStorage.setItem(getProjectStorageKey(project.id), raw);
}

export async function loadChapterContentFromLocal(chapterId: string, config?: StorageConfig): Promise<string> {
  const fallback = () => localStorage.getItem(getChapterStorageKey(chapterId));
  const raw = await readFileOrFallback(await getChapterFilePath(chapterId, config), fallback);
  return raw ?? "";
}

export async function saveChapterContentToLocal(chapterId: string, content: string, config?: StorageConfig): Promise<void> {
  if (!isTauri()) {
    localStorage.setItem(getChapterStorageKey(chapterId), content);
    return;
  }
  const path = await getChapterFilePath(chapterId, config);
  await writeFile(path, content);
  localStorage.setItem(getChapterStorageKey(chapterId), content);
}

export async function removeChapterContentFromLocal(chapterId: string, config?: StorageConfig): Promise<void> {
  if (!isTauri()) {
    localStorage.removeItem(getChapterStorageKey(chapterId));
    return;
  }
  const fs = await getFs();
  if (fs) {
    try {
      await fs.remove(await getChapterFilePath(chapterId, config));
    } catch {
      // ignore
    }
  }
  localStorage.removeItem(getChapterStorageKey(chapterId));
}

export async function getDefaultExportDirectory(config?: StorageConfig): Promise<string> {
  return config?.projectSaveDirectory || (await getAppDataDir());
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  if (isTauri()) {
    const fs = await getFs();
    if (fs) {
      await fs.writeTextFile(path, content);
      return;
    }
  }
  localStorage.setItem(path, content);
}

export async function readTextFile(path: string): Promise<string> {
  if (isTauri()) {
    const fs = await getFs();
    if (fs) {
      return await fs.readTextFile(path);
    }
  }
  const value = localStorage.getItem(path);
  if (value === null) throw new Error(`File not found: ${path}`);
  return value;
}

export async function exists(path: string): Promise<boolean> {
  if (isTauri()) {
    const fs = await getFs();
    if (fs) {
      try {
        await fs.stat(path);
        return true;
      } catch {
        return false;
      }
    }
  }
  return localStorage.getItem(path) !== null;
}

export async function removeFile(path: string): Promise<void> {
  if (isTauri()) {
    const fs = await getFs();
    if (fs) {
      await fs.remove(path);
      return;
    }
  }
  localStorage.removeItem(path);
}

export async function readDir(path: string): Promise<string[]> {
  if (isTauri()) {
    const fs = await getFs();
    if (fs) {
      const entries = await fs.readDir(path);
      return entries.map((e) => e.name);
    }
  }
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(path)) keys.push(key);
  }
  return keys;
}

export { getAppDataDir };
