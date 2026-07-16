import type { Chapter, Note, Project, Volume } from "../types";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir, dirname, join } from "@tauri-apps/api/path";

export interface StorageConfig {
  // Custom location for the user's novel content (project files + chapters).
  // When unset, content falls back to the data folder. The data folder
  // itself always holds the project index and settings — independent of
  // this setting.
  projectSaveDirectory?: string;
}

const APP_DATA_KEY = "inkwell-app-data";
const PROJECTS_KEY = "inkwell-projects";
const PROJECT_PREFIX = "inkwell-project-";
const CHAPTER_PREFIX = "inkwell-chapter-";

let tauriPath: typeof import("@tauri-apps/api/path") | null = null;

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

export async function getAppDataDir(): Promise<string> {
  if (!isTauri()) return APP_DATA_KEY;
  const pathMod = await getPath();
  return pathMod ? await pathMod.appDataDir() : APP_DATA_KEY;
}

async function getContentBaseDir(config?: StorageConfig): Promise<string> {
  // Single base directory for the user's novel content (both project files
  // and chapter `.md` files). Falls back to the data folder when the user
  // hasn't set a custom location.
  if (config?.projectSaveDirectory) return config.projectSaveDirectory;
  return getAppDataDir();
}

async function buildPath(parts: string[]): Promise<string> {
  const pathMod = await getPath();
  if (pathMod) {
    return pathMod.join(...parts);
  }
  return parts.filter(Boolean).join("/");
}

export function getProjectStorageKey(projectId: string): string {
  return `${PROJECT_PREFIX}${projectId}`;
}

export function getChapterStorageKey(chapterId: string): string {
  return `${CHAPTER_PREFIX}${chapterId}`;
}

// The project index (registry) is part of the app's data — it always lives
// in the data folder, independent of the user's custom content location.
async function getProjectRegistryPath(): Promise<string> {
  return buildPath([await getAppDataDir(), "registry.json"]);
}

async function getProjectFilePath(projectId: string, config?: StorageConfig): Promise<string> {
  const dir = await getContentBaseDir(config);
  return buildPath([dir, "projects", `${projectId}.json`]);
}

async function getChapterFilePath(chapterId: string, config?: StorageConfig): Promise<string> {
  const dir = await getContentBaseDir(config);
  return buildPath([dir, "chapters", `${chapterId}.md`]);
}

// All disk I/O goes through our own Tauri commands (see src-tauri/src/lib.rs)
// so writes to user-chosen directories are never blocked by a static fs
// scope. The Tauri-side commands auto-create the parent directory for
// writes, so callers don't need a separate mkdir step.

async function readFileOrFallback(path: string, fallback: () => string | null): Promise<string | null> {
  if (!isTauri()) return fallback();
  try {
    return await invoke<string>("read_text_file", { path });
  } catch {
    return fallback();
  }
}

// The project index is part of the app's data and is always stored in the
// data folder — independent of any custom content location. For backward
// compatibility with earlier versions where the index lived next to project
// files under `projectSaveDirectory`, we transparently fall back to reading
// from that legacy location when the new data-folder registry is missing.
export async function getLocalProjectRegistry(
  config?: StorageConfig,
): Promise<Project[]> {
  const localStorageFallback = () => {
    try {
      const raw = localStorage.getItem(PROJECTS_KEY);
      return raw ?? null;
    } catch {
      return null;
    }
  };
  const primary = await readFileOrFallback(await getProjectRegistryPath(), localStorageFallback);
  if (primary) {
    try {
      return JSON.parse(primary);
    } catch {
      return [];
    }
  }
  // Legacy fallback: registry under the custom content directory.
  const legacyDir = config?.projectSaveDirectory;
  if (legacyDir) {
    const legacyPath = await buildPath([legacyDir, "registry.json"]);
    const legacyRaw = await readFileOrFallback(legacyPath, localStorageFallback);
    if (legacyRaw) {
      try {
        return JSON.parse(legacyRaw);
      } catch {
        return [];
      }
    }
  }
  return [];
}

export async function setLocalProjectRegistry(projects: Project[]): Promise<void> {
  const raw = JSON.stringify(projects);
  if (!isTauri()) {
    localStorage.setItem(PROJECTS_KEY, raw);
    return;
  }
  await invoke("write_text_file", {
    path: await getProjectRegistryPath(),
    content: raw,
  });
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
  await invoke("write_text_file", {
    path: await getProjectFilePath(project.id, config),
    content: raw,
  });
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
  await invoke("write_text_file", {
    path: await getChapterFilePath(chapterId, config),
    content,
  });
  localStorage.setItem(getChapterStorageKey(chapterId), content);
}

export async function removeChapterContentFromLocal(chapterId: string, config?: StorageConfig): Promise<void> {
  if (!isTauri()) {
    localStorage.removeItem(getChapterStorageKey(chapterId));
    return;
  }
  try {
    await invoke("remove_file", { path: await getChapterFilePath(chapterId, config) });
  } catch {
    // ignore — file may not exist
  }
  localStorage.removeItem(getChapterStorageKey(chapterId));
}

export async function removeProjectFromLocal(projectId: string, config?: StorageConfig): Promise<void> {
  if (!isTauri()) {
    localStorage.removeItem(getProjectStorageKey(projectId));
    return;
  }
  try {
    await invoke("remove_file", { path: await getProjectFilePath(projectId, config) });
  } catch {
    // ignore — project file may not exist
  }
  localStorage.removeItem(getProjectStorageKey(projectId));
}

export async function getDefaultExportDirectory(config?: StorageConfig): Promise<string> {
  return config?.projectSaveDirectory || (await getAppDataDir());
}

// --- Notes (写作笔记) -----------------------------------------------------
// Per-project scratch notes (人物设定、灵感、伏笔). Live next to the project
// file so they migrate with the rest of the content. Debounced autosave in
// the UI calls saveNotesToLocal; reads fall back to [] when absent.
async function getNotesFilePath(projectId: string, config?: StorageConfig): Promise<string> {
  const dir = await getContentBaseDir(config);
  return buildPath([dir, "notes", `${projectId}.json`]);
}

export async function loadNotesFromLocal(projectId: string, config?: StorageConfig): Promise<Note[]> {
  const fallback = () => localStorage.getItem(`inkwell-notes-${projectId}`);
  const raw = await readFileOrFallback(await getNotesFilePath(projectId, config), fallback);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveNotesToLocal(projectId: string, notes: Note[], config?: StorageConfig): Promise<void> {
  const raw = JSON.stringify(notes);
  if (!isTauri()) {
    localStorage.setItem(`inkwell-notes-${projectId}`, raw);
    return;
  }
  await invoke("write_text_file", {
    path: await getNotesFilePath(projectId, config),
    content: raw,
  });
  localStorage.setItem(`inkwell-notes-${projectId}`, raw);
}

// Opens the given folder in the OS file explorer (Windows Explorer / macOS
// Finder / Linux file manager). Returns the error message on failure (e.g.
// path does not exist) so the UI can surface it; returns null on success.
export async function revealInFolder(path: string): Promise<string | null> {
  if (!isTauri() || !path) return null;
  try {
    await invoke("open_path", { path });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

// General-purpose file operations used by the export flow. In non-Tauri
// (browser/dev) fallback mode these back onto a namespaced localStorage
// entry, so they can never collide with the `inkwell-projects` /
// `inkwell-chapter-*` / `inkwell-settings` keys.
const FS_FALLBACK_PREFIX = "inkwell-fs:";
const fsKey = (path: string) => `${FS_FALLBACK_PREFIX}${path}`;

export async function writeTextFile(path: string, content: string): Promise<void> {
  if (isTauri()) {
    await invoke("write_text_file", { path, content });
    return;
  }
  localStorage.setItem(fsKey(path), content);
}

export async function readTextFile(path: string): Promise<string> {
  if (isTauri()) {
    return await invoke<string>("read_text_file", { path });
  }
  const value = localStorage.getItem(fsKey(path));
  if (value === null) throw new Error(`File not found: ${path}`);
  return value;
}

export async function exists(path: string): Promise<boolean> {
  if (isTauri()) {
    return await invoke<boolean>("file_exists", { path });
  }
  return localStorage.getItem(fsKey(path)) !== null;
}

export async function removeFile(path: string): Promise<void> {
  if (isTauri()) {
    await invoke("remove_file", { path });
    return;
  }
  localStorage.removeItem(fsKey(path));
}

// Lists file names directly inside `dir` (non-recursive). Missing directory
// yields []. In fallback mode, lists namespaced localStorage keys.
export async function listFiles(dir: string): Promise<string[]> {
  if (isTauri()) {
    return await invoke<string[]>("list_files", { dir });
  }
  const prefix = fsKey(dir).replace(/\/+$/, "") + "/";
  const names: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const rest = key.slice(prefix.length);
      if (rest && !rest.includes("/")) names.push(rest);
    }
  }
  return names;
}

// Copies a single file, creating the destination parent directory.
export async function copyFile(src: string, dest: string): Promise<void> {
  if (isTauri()) {
    await invoke("copy_file", { src, dest });
    return;
  }
  const value = localStorage.getItem(fsKey(src));
  if (value !== null) localStorage.setItem(fsKey(dest), value);
}

// Recursively copies a directory tree (used for storage-location migration).
// Returns the number of files copied.
export async function copyDirRecursive(src: string, dest: string): Promise<number> {
  if (isTauri()) {
    return await invoke<number>("copy_dir_recursive", { src, dest });
  }
  const srcPrefix = fsKey(src).replace(/\/+$/, "") + "/";
  const destPrefix = fsKey(dest).replace(/\/+$/, "") + "/";
  const moves: [string, string][] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(srcPrefix)) {
      moves.push([key, destPrefix + key.slice(srcPrefix.length)]);
    }
  }
  for (const [from, to] of moves) {
    const value = localStorage.getItem(from);
    if (value !== null) localStorage.setItem(to, value);
  }
  return moves.length;
}

// Re-export the Tauri path helpers for callers that build paths.
export { appDataDir, dirname, join };
