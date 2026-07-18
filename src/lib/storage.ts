import type { Chapter, DictEntry, Note, Project, Volume } from "../types";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir, dirname, join } from "@tauri-apps/api/path";
import { atomicWriteTextFile, bridgeReadTextFile, isNotFoundError } from "./atomic";
import { sanitizeFileName } from "./utils";

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

// Project/chapter/note IDs end up inside file paths. They come from
// generateId() today, but the registry JSON is a user-editable file on disk —
// an id like "../../x" would traverse out of the content directory. Reject
// anything but simple slug characters at the storage boundary.
const SAFE_ID = /^[a-z0-9-]+$/i;

export function assertSafeId(id: string, kind: string): void {
  if (!SAFE_ID.test(id)) {
    throw new Error(`${kind} ID 包含非法字符: ${id}`);
  }
}

// A project folder name must never collide with the flat top-level content
// directories (chapters/ notes/ dictionary/ projects/ hold legacy or
// cross-project data). The id suffix usually prevents this, but a work
// literally named "chapters" would still land on "chapters-<id>" — guard
// anyway so the invariant is local and obvious.
const TOP_LEVEL_DIRS = new Set(["projects", "chapters", "notes", "dictionary", "registry.json"]);

export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function getAppDataDir(): Promise<string> {
  if (!isTauri()) return APP_DATA_KEY;
  try {
    return await appDataDir();
  } catch {
    return APP_DATA_KEY;
  }
}

// Register a content root with the Rust-side path whitelist (no-op in
// browser mode and best-effort everywhere — a failed registration must not
// block startup; reads/writes will surface their own error if rejected).
export async function registerContentRoot(path: string): Promise<void> {
  if (!isTauri() || !path) return;
  try {
    await invoke("register_content_root", { path });
  } catch {
    // best-effort
  }
}

// Grants a one-shot write authorization for an exact file the user picked in
// the OS save dialog (export flow). The grant is consumed by the first write
// and never widens into a directory root. No-op outside Tauri.
export async function grantExportPath(path: string): Promise<void> {
  if (!isTauri() || !path) return;
  try {
    await invoke("grant_export_path", { path });
  } catch {
    // best-effort — the subsequent write will surface its own error if rejected
  }
}

async function getContentBaseDir(config?: StorageConfig): Promise<string> {
  // Single base directory for the user's novel content (both project files
  // and chapter `.md` files). Falls back to the data folder when the user
  // hasn't set a custom location. A Windows verbatim prefix (\\?\) picked up
  // from a previous canonicalized write would confuse every downstream path
  // join, so strip it here.
  if (config?.projectSaveDirectory) {
    return config.projectSaveDirectory.replace(/^\\\\\?\\/, "");
  }
  return getAppDataDir();
}

async function buildPath(parts: string[]): Promise<string> {
  if (isTauri()) {
    try {
      return await join(...parts);
    } catch {
      // Tests install a bare __TAURI_INTERNALS__ flag — fall through to
      // plain joining when the real path bridge is unavailable.
    }
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

// --- Per-project folder layout ---------------------------------------------
// Every work lives in its own folder under the content base dir:
//   {base}/{安全作品名}-{id}/project.json      (structure: volumes + chapters)
//   {base}/{安全作品名}-{id}/notes.json        (写作笔记)
//   {base}/{安全作品名}-{id}/dict.json         (设定词典)
//   {base}/{安全作品名}-{id}/chapters/{chapterId}.md
//   {base}/{安全作品名}-{id}/chapters/{chapterId}.snapshots/{ts}.html
// The folder name embeds the work's display name so the user can find their
// novel in the file manager, plus the id so renames and same-name works
// stay unique. Renaming a work moves the folder (see renameProjectFolder).

/** Stable folder name for a work: `{sanitizeFileName(name)}-{id}`. */
export function projectFolderName(name: string, id: string): string {
  assertSafeId(id, "作品");
  let base = sanitizeFileName(name);
  if (TOP_LEVEL_DIRS.has(base.toLowerCase())) base = `work-${base}`;
  return `${base}-${id}`;
}

// Enumerates on-disk project folders ({name}-{id}) under the content base
// dir. Used to find a project's folder when the in-memory name hint is
// unavailable (e.g. notes/dict reads before the project file was parsed).
async function findProjectFolderOnDisk(projectId: string, config?: StorageConfig): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const base = await getContentBaseDir(config);
    const suffix = `-${projectId}`;
    const names = await invoke<string[]>("list_files", { dir: base });
    for (const name of names) {
      if (name.endsWith(suffix) && name.length > suffix.length) {
        return buildPath([base, name]);
      }
    }
  } catch {
    // best-effort
  }
  return null;
}

// Resolves the project folder for reads: name hint when known, otherwise a
// disk scan for the "*-{id}" folder.
async function resolveProjectDirForRead(projectId: string, config?: StorageConfig): Promise<string> {
  const hint = projectNameMap.get(projectId);
  if (hint) return getProjectDir(projectId, hint, config);
  return (await findProjectFolderOnDisk(projectId, config)) ?? (await getProjectDir(projectId, undefined, config));
}

async function getProjectDir(projectId: string, nameHint: string | undefined, config?: StorageConfig): Promise<string> {
  assertSafeId(projectId, "作品");
  const base = await getContentBaseDir(config);
  return buildPath([base, projectFolderName(nameHint || "work", projectId)]);
}

// Chapter/snapshot paths only know the chapter id — not the owning project.
// The store tracks the chapter→project mapping of the open project and
// registers it here at module scope (storage must stay decoupled from the
// store to avoid an import cycle). Entries for deleted chapters are kept in
// a short grace window so delete-time cleanup (snapshot removal) still
// resolves the right project folder.
const chapterOwnerMap = new Map<string, { projectId: string; volumeSeq: number }>();
const projectNameMap = new Map<string, string>();
const orphanChapterOwners = new Map<string, { projectId: string; volumeSeq: number; at: number }>();
const ORPHAN_GRACE_MS = 60_000;

// 1-based position of a chapter's volume within the project (volumes sorted
// by `order`); 0 = unfiled (no parent volume). Drives the "{卷序号}-" prefix
// of on-disk chapter file names.
function computeVolumeSeqs(
  chapters: { id: string; parentId: string | null }[],
  volumes: { id: string; order: number }[],
): Map<string, number> {
  const seqByVolumeId = new Map<string, number>();
  [...volumes]
    .sort((a, b) => a.order - b.order)
    .forEach((v, idx) => seqByVolumeId.set(v.id, idx + 1));
  const out = new Map<string, number>();
  for (const c of chapters) {
    out.set(c.id, c.parentId ? (seqByVolumeId.get(c.parentId) ?? 0) : 0);
  }
  return out;
}

/** Called by the store whenever the open project's data changes. Accepts the
 *  chapters + volumes so each chapter's volume sequence (file-name prefix)
 *  can be derived. */
export function registerChapterOwners(
  chapters: { id: string; parentId: string | null }[],
  volumes: { id: string; order: number }[],
  projectId: string,
  projectName?: string,
): void {
  const seqs = computeVolumeSeqs(chapters, volumes);
  for (const c of chapters) {
    chapterOwnerMap.set(c.id, { projectId, volumeSeq: seqs.get(c.id) ?? 0 });
    orphanChapterOwners.delete(c.id);
  }
  if (projectName) projectNameMap.set(projectId, projectName);
}

/** Called by the store when chapters are deleted. */
export function unregisterChapterOwners(chapterIds: string[]): void {
  const now = Date.now();
  for (const id of chapterIds) {
    const owner = chapterOwnerMap.get(id);
    chapterOwnerMap.delete(id);
    if (owner) orphanChapterOwners.set(id, { ...owner, at: now });
  }
}

/** Look up a project name hint for folder naming (undefined → "work"). */
export function getProjectNameHint(projectId: string): string | undefined {
  return projectNameMap.get(projectId);
}

/** Resolves the owning project of a chapter (live registry first, then the
 *  post-delete grace window). Used by chapter content and snapshot paths. */
export function resolveChapterOwner(
  chapterId: string,
): { projectId: string; projectName?: string; volumeSeq: number } | null {
  const live = chapterOwnerMap.get(chapterId);
  if (live) {
    return { projectId: live.projectId, projectName: projectNameMap.get(live.projectId), volumeSeq: live.volumeSeq };
  }
  // Sweep expired grace entries on read so the map can't grow unbounded.
  const now = Date.now();
  for (const [id, orphan] of orphanChapterOwners) {
    if (now - orphan.at >= ORPHAN_GRACE_MS) orphanChapterOwners.delete(id);
  }
  const orphan = orphanChapterOwners.get(chapterId);
  if (orphan) {
    return {
      projectId: orphan.projectId,
      projectName: projectNameMap.get(orphan.projectId),
      volumeSeq: orphan.volumeSeq,
    };
  }
  return null;
}

// Reads a JSON-or-text file without assuming its location: tries each
// candidate path in order; only a NotFound advances to the next candidate
// (other errors propagate). Returns { raw, path } of the first hit.
async function readFirstExisting(
  paths: string[],
  lenient: boolean,
): Promise<{ raw: string; path: string } | null> {
  for (const path of paths) {
    try {
      return { raw: await bridgeReadTextFile(path), path };
    } catch (err) {
      if (isNotFoundError(err)) continue;
      if (lenient) return null;
      throw err;
    }
  }
  return null;
}

async function getLegacyProjectFilePath(projectId: string, config?: StorageConfig): Promise<string> {
  assertSafeId(projectId, "作品");
  const dir = await getContentBaseDir(config);
  return buildPath([dir, "projects", `${projectId}.json`]);
}

async function getLegacyChapterFilePath(chapterId: string, config?: StorageConfig): Promise<string> {
  assertSafeId(chapterId, "章节");
  const dir = await getContentBaseDir(config);
  return buildPath([dir, "chapters", `${chapterId}.md`]);
}

async function getLegacyNotesFilePath(projectId: string, config?: StorageConfig): Promise<string> {
  assertSafeId(projectId, "作品");
  const dir = await getContentBaseDir(config);
  return buildPath([dir, "notes", `${projectId}.json`]);
}

async function getLegacyDictFilePath(projectId: string, config?: StorageConfig): Promise<string> {
  assertSafeId(projectId, "作品");
  const dir = await getContentBaseDir(config);
  return buildPath([dir, "dictionary", `${projectId}.json`]);
}

// Moves a file to a new location via rename (same-volume move), falling back
// to copy+delete only when rename is unavailable. Best-effort callers use the
// void return; critical paths (lazy project-file migration) await it so a
// save can never race a stale copy over the migrated bytes.
async function moveFile(src: string, dest: string): Promise<void> {
  if (!isTauri() || src === dest) return;
  try {
    await invoke("move_path", { src, dest });
  } catch {
    // Rename failed (cross-volume, or dest exists) — fall back to copy+delete.
    try {
      const content = await bridgeReadTextFile(src);
      await atomicWriteTextFile(dest, content);
      await invoke("remove_file", { path: src }).catch(() => {});
    } catch {
      // best-effort — legacy path remains as fallback
    }
  }
}

/** Renames (moves) a project's folder. The in-memory name hint is updated
 *  only AFTER the move succeeds — updating it first would send chapter reads
 *  to a folder that doesn't exist yet (and make the old folder unreachable).
 *  Returns the new folder path on success; throws when the folder exists but
 *  could not be moved so callers can roll back and surface the failure. */
export async function renameProjectFolder(
  oldName: string,
  projectId: string,
  newName: string,
  config?: StorageConfig,
): Promise<string | null> {
  const oldDir = await getProjectDir(projectId, oldName, config);
  const newDir = await getProjectDir(projectId, newName, config);
  if (oldDir === newDir) {
    projectNameMap.set(projectId, newName);
    return null;
  }
  if (!isTauri()) {
    projectNameMap.set(projectId, newName);
    return null;
  }
  if (!(await invoke<boolean>("file_exists", { path: oldDir }).catch(() => false))) {
    // No folder on disk yet (fresh/legacy-layout project) — nothing to move;
    // the next save creates the layout under the new name.
    projectNameMap.set(projectId, newName);
    return null;
  }
  await invoke("move_path", { src: oldDir, dest: newDir });
  projectNameMap.set(projectId, newName);
  return newDir;
}

/** Deletes a project's whole folder (project.json + chapters + notes + dict
 *  + snapshots) in one step. */
export async function removeProjectFolder(projectId: string, nameHint: string | undefined, config?: StorageConfig): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("remove_project_dir", { path: await getProjectDir(projectId, nameHint, config) });
  } catch {
    // ignore — folder may not exist (legacy layout / browser-only project)
  }
}

// The localStorage mirror is a *secondary* copy kept for crash tolerance and
// browser dev mode. Its writes are best-effort: a QuotaExceededError here
// must never bubble up as a save failure when the disk write already
// succeeded (the data is safe).
function writeMirror(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // mirror is best-effort
  }
}

function readMirror(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// All disk I/O goes through our own Tauri commands (see src-tauri/src/lib.rs)
// so writes to user-chosen directories are never blocked by a static fs
// scope. The Tauri-side commands auto-create the parent directory for
// writes, so callers don't need a separate mkdir step.

// The project index is part of the app's data and is always stored in the
// data folder — independent of any custom content location. For backward
// compatibility with earlier versions where the index lived next to project
// files under `projectSaveDirectory`, we transparently fall back to reading
// from that legacy location when the new data-folder registry is missing.
//
// A corrupt registry is NOT hidden as an empty list: we throw so the caller
// can surface it instead of the user seeing all their works "disappear".
export async function getLocalProjectRegistry(
  config?: StorageConfig,
): Promise<Project[]> {
  const localStorageFallback = () => readMirror(PROJECTS_KEY);
  const parseRegistry = (raw: string, hint: string): Project[] => {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`作品索引文件损坏，无法读取。请检查${hint}（可尝试用 registry.json.tmp 恢复）。`);
    }
  };
  // Strict read, mirroring chapter reads: only a genuinely missing registry
  // falls back to the localStorage mirror. Any other failure (locked file,
  // permissions, corrupt JSON) must surface — silently serving the stale
  // mirror would let the next registry write atomically clobber the real
  // index with an outdated project list (works vanish from the library while
  // their folders remain on disk).
  let primary: string | null = null;
  if (isTauri()) {
    try {
      primary = await bridgeReadTextFile(await getProjectRegistryPath());
    } catch (err) {
      if (!isNotFoundError(err)) throw err;
      primary = localStorageFallback();
    }
  } else {
    primary = localStorageFallback();
  }
  if (primary) {
    const projects = parseRegistry(primary, "数据文件夹中的 registry.json");
    for (const p of projects) projectNameMap.set(p.id, p.name);
    return projects;
  }
  // Legacy fallback: registry under the custom content directory.
  const legacyDir = config?.projectSaveDirectory;
  if (legacyDir) {
    const legacyPath = await buildPath([legacyDir, "registry.json"]);
    let legacyRaw: string | null = null;
    if (isTauri()) {
      try {
        legacyRaw = await bridgeReadTextFile(legacyPath);
      } catch (err) {
        if (!isNotFoundError(err)) throw err;
        legacyRaw = localStorageFallback();
      }
    } else {
      legacyRaw = localStorageFallback();
    }
    if (legacyRaw) {
      const projects = parseRegistry(legacyRaw, "作品内容位置中的 registry.json");
      for (const p of projects) projectNameMap.set(p.id, p.name);
      return projects;
    }
  }
  return [];
}

export async function setLocalProjectRegistry(projects: Project[]): Promise<void> {
  const raw = JSON.stringify(projects);
  if (!isTauri()) {
    writeMirror(PROJECTS_KEY, raw);
    return;
  }
  await atomicWriteTextFile(await getProjectRegistryPath(), raw);
  writeMirror(PROJECTS_KEY, raw);
}

// Possible states of a project's on-disk file, so the UI can tell a missing
// project (safe to treat as new) from a corrupt one (must never be silently
// replaced — the chapter .md files are still on disk).
export type ProjectFileState =
  | { kind: "ok"; project: Project; chapters: Chapter[]; volumes: Volume[] }
  | { kind: "missing" }
  | { kind: "corrupt"; error: string };

function parseProjectFile(raw: string): { project: Project; chapters: Chapter[]; volumes: Volume[] } | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.project) return null;
    return { project: parsed.project, chapters: parsed.chapters || [], volumes: parsed.volumes || [] };
  } catch {
    return null;
  }
}

// Reads the project file from the per-project folder, falling back to the
// legacy flat location (projects/{id}.json) and then the localStorage mirror.
// On a legacy hit the file is migrated into the project folder.
async function readProjectFileRaw(
  projectId: string,
  config?: StorageConfig,
): Promise<{ raw: string; projectName: string | undefined } | null> {
  const dir = await resolveProjectDirForRead(projectId, config);
  const candidates = [
    await buildPath([dir, "project.json"]),
    await getLegacyProjectFilePath(projectId, config),
  ];
  const hit = await readFirstExisting(candidates, false);
  const nameHint = projectNameMap.get(projectId);
  if (hit) {
    if (hit.path === candidates[1]) {
      // Legacy location — adopt the name from the payload and migrate.
      // AWAIT the move: firing it off un-awaited let a concurrent save race
      // stale migration bytes over the fresher project.json.
      const parsed = parseProjectFile(hit.raw);
      if (parsed) {
        const target = await buildPath([await getProjectDir(projectId, parsed.project.name, config), "project.json"]);
        await moveFile(hit.path, target);
      }
    }
    return { raw: hit.raw, projectName: parseProjectFile(hit.raw)?.project.name ?? nameHint };
  }
  const mirror = readMirror(getProjectStorageKey(projectId));
  if (!mirror) return null;
  return { raw: mirror, projectName: nameHint };
}

export async function inspectProjectFile(
  projectId: string,
  config?: StorageConfig,
): Promise<ProjectFileState> {
  let result: { raw: string; projectName: string | undefined } | null;
  if (isTauri()) {
    try {
      result = await readProjectFileRaw(projectId, config);
    } catch (err) {
      return { kind: "corrupt", error: String(err) };
    }
  } else {
    const mirror = readMirror(getProjectStorageKey(projectId));
    result = mirror ? { raw: mirror, projectName: undefined } : null;
  }
  if (!result) return { kind: "missing" };

  const parsed = parseProjectFile(result.raw);
  if (parsed) {
    // Register chapter → project ownership so chapter/snapshot paths resolve
    // into this project's folder.
    registerChapterOwners(parsed.chapters, parsed.volumes, parsed.project.id, parsed.project.name);
    return { kind: "ok", ...parsed };
  }

  // Last resort before declaring corruption: the .tmp sibling left behind
  // by an interrupted atomic write may hold the complete previous content.
  if (isTauri()) {
    const dir = await getProjectDir(projectId, result.projectName, config);
    const tmpCandidates = [
      `${await buildPath([dir, "project.json"])}.tmp`,
      `${await getLegacyProjectFilePath(projectId, config)}.tmp`,
    ];
    const tmpHit = await readFirstExisting(tmpCandidates, false).catch(() => null);
    const tmpParsed = tmpHit ? parseProjectFile(tmpHit.raw) : null;
    if (tmpParsed) {
      registerChapterOwners(tmpParsed.chapters, tmpParsed.volumes, tmpParsed.project.id, tmpParsed.project.name);
      return { kind: "ok", ...tmpParsed };
    }
  }
  return {
    kind: "corrupt",
    error: `作品文件损坏（${projectFolderName(result.projectName || "work", projectId)}/project.json）。章节正文仍保存在该文件夹的 chapters/ 目录中，请勿删除该文件夹，可先备份后尝试修复。`,
  };
}

export async function loadProjectFromLocal(
  projectId: string,
  config?: StorageConfig,
): Promise<{ project: Project; chapters: Chapter[]; volumes: Volume[] } | null> {
  const state = await inspectProjectFile(projectId, config);
  if (state.kind === "ok") {
    return { project: state.project, chapters: state.chapters, volumes: state.volumes };
  }
  if (state.kind === "corrupt") {
    throw new Error(state.error);
  }
  return null;
}

export async function saveProjectToLocal(
  project: Project,
  chapters: Chapter[],
  volumes: Volume[],
  config?: StorageConfig,
): Promise<void> {
  const raw = JSON.stringify({ project, chapters, volumes });
  registerChapterOwners(chapters, volumes, project.id, project.name);
  if (!isTauri()) {
    writeMirror(getProjectStorageKey(project.id), raw);
    return;
  }
  const dir = await getProjectDir(project.id, project.name, config);
  await atomicWriteTextFile(await buildPath([dir, "project.json"]), raw);
  writeMirror(getProjectStorageKey(project.id), raw);
}

// Resolves the chapter file path: inside the owning project's folder when
// the owner is known, plus the legacy flat path as read fallback.
// Chapter files are named "{卷序号}-{章节名}.md" (volumeSeq from the owner
// map; 0 = unfiled) so the user can find "1-第 1 章.md" in the file manager.
// The chapter id is no longer embedded; same-name chapters are disambiguated
// by a numeric suffix (see resolveChapterFileName).
function chapterFileBase(volumeSeq: number, title: string): string {
  const base = sanitizeFileName(title) || "chapter";
  return `${volumeSeq}-${base}`;
}

function chapterFileName(volumeSeq: number, title: string): string {
  return `${chapterFileBase(volumeSeq, title)}.md`;
}

// Picks a collision-free file name inside the project's chapters/ dir. When
// "{seq}-{title}.md" is already taken (by another chapter — e.g. two chapters
// both titled 第 1 章 in the same volume), appends -2, -3, … Best-effort:
// a directory-listing failure yields the base name (the write then just
// overwrites, same as the pre-disambiguation behavior).
async function resolveChapterFileName(
  chaptersDir: string,
  volumeSeq: number,
  title: string,
): Promise<string> {
  const base = chapterFileBase(volumeSeq, title);
  const primary = `${base}.md`;
  if (!isTauri()) return primary;
  let existing: Set<string>;
  try {
    existing = new Set(await invoke<string[]>("list_files", { dir: chaptersDir }));
  } catch {
    return primary;
  }
  if (!existing.has(primary)) return primary;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}.md`;
    if (!existing.has(candidate)) return candidate;
  }
}

async function chapterPathCandidates(
  chapterId: string,
  config?: StorageConfig,
  title?: string,
): Promise<{ primary: string; legacy: string; legacyNamed: string }> {
  assertSafeId(chapterId, "章节");
  const owner = resolveChapterOwner(chapterId);
  const legacy = await getLegacyChapterFilePath(chapterId, config);
  if (!owner) return { primary: legacy, legacy, legacyNamed: legacy };
  const dir = await getProjectDir(owner.projectId, owner.projectName ?? projectNameMap.get(owner.projectId), config);
  const chaptersDir = await buildPath([dir, "chapters"]);
  const name = chapterFileName(owner.volumeSeq, title || "chapter");
  // Pre-restructure files were named "{title}-{id}.md"; keep that as a read
  // fallback + lazy-migration source so upgrading doesn't orphan existing
  // chapters.
  const legacyNamed = await buildPath([chaptersDir, `${sanitizeFileName(title || "chapter") || "chapter"}-${chapterId}.md`]);
  return { primary: await buildPath([chaptersDir, name]), legacy, legacyNamed };
}

export async function loadChapterContentFromLocal(
  chapterId: string,
  config?: StorageConfig,
  title?: string,
): Promise<string> {
  // Strict read: only a genuinely missing file falls back to the mirror.
  // A transient read failure must propagate — silently serving an old mirror
  // here would later be saved back over the real (newer) file.
  if (!isTauri()) {
    return readMirror(getChapterStorageKey(chapterId)) ?? "";
  }
  const { primary, legacy, legacyNamed } = await chapterPathCandidates(chapterId, config, title);
  const hit = await readFirstExisting([primary, legacyNamed, legacy], false);
  if (hit) {
    if (hit.path !== primary) {
      moveFile(hit.path, primary).catch(() => {});
    }
    return hit.raw;
  }
  // Cross-volume moves change the "{卷序号}-" prefix, but the on-disk file is
  // only renamed on the next title edit — until then it sits under the OLD
  // volume's prefix. Scan the chapters dir for any same-title file with a
  // different sequence prefix so the content stays reachable after a move.
  const owner = resolveChapterOwner(chapterId);
  if (owner && title) {
    const dir = await getProjectDir(owner.projectId, owner.projectName ?? projectNameMap.get(owner.projectId), config);
    const chaptersDir = await buildPath([dir, "chapters"]);
    const titlePart = sanitizeFileName(title) || "chapter";
    try {
      const names = await invoke<string[]>("list_files", { dir: chaptersDir });
      const moved = names.find(
        (n) => n.endsWith(`-${titlePart}.md`) || n === `${titlePart}.md`,
      );
      if (moved) {
        const movedPath = await buildPath([chaptersDir, moved]);
        const raw = await bridgeReadTextFile(movedPath);
        moveFile(movedPath, primary).catch(() => {});
        return raw;
      }
    } catch {
      // fall through to the mirror
    }
  }
  return readMirror(getChapterStorageKey(chapterId)) ?? "";
}

export async function saveChapterContentToLocal(
  chapterId: string,
  content: string,
  config?: StorageConfig,
  title?: string,
): Promise<void> {
  if (!isTauri()) {
    writeMirror(getChapterStorageKey(chapterId), content);
    return;
  }
  const owner = resolveChapterOwner(chapterId);
  const dir = owner
    ? await getProjectDir(owner.projectId, owner.projectName ?? projectNameMap.get(owner.projectId), config)
    : await getContentBaseDir(config);
  const chaptersDir = await buildPath([dir, "chapters"]);
  const name = await resolveChapterFileName(chaptersDir, owner?.volumeSeq ?? 0, title || "chapter");
  await atomicWriteTextFile(await buildPath([chaptersDir, name]), content);
  writeMirror(getChapterStorageKey(chapterId), content);
}

/** Renames (moves) a chapter's content file. The file name embeds the volume
 *  sequence + chapter title so the user can find it in the file manager;
 *  renaming a chapter moves the file to match. Returns the new path on
 *  success; throws when the file exists but could not be moved so callers can
 *  roll back and surface the failure. */
export async function renameChapterFile(
  chapterId: string,
  oldTitle: string,
  newTitle: string,
  config?: StorageConfig,
): Promise<string | null> {
  if (!isTauri() || oldTitle === newTitle) return null;
  const owner = resolveChapterOwner(chapterId);
  if (!owner) return null;
  const dir = await getProjectDir(owner.projectId, owner.projectName ?? projectNameMap.get(owner.projectId), config);
  const chaptersDir = await buildPath([dir, "chapters"]);
  // Locate the existing file under any of the historical names, then move it
  // to the new (disambiguated) name.
  const oldCandidates = [
    await buildPath([chaptersDir, chapterFileName(owner.volumeSeq, oldTitle)]),
    await buildPath([chaptersDir, `${sanitizeFileName(oldTitle) || "chapter"}-${chapterId}.md`]),
  ];
  let oldPath: string | null = null;
  for (const candidate of oldCandidates) {
    if (await invoke<boolean>("file_exists", { path: candidate }).catch(() => false)) {
      oldPath = candidate;
      break;
    }
  }
  if (!oldPath) {
    // No file on disk yet (fresh/legacy-layout chapter) — nothing to move;
    // the next save creates the layout under the new name.
    return null;
  }
  const newName = await resolveChapterFileName(chaptersDir, owner.volumeSeq, newTitle);
  const newPath = await buildPath([chaptersDir, newName]);
  if (oldPath === newPath) return null;
  await invoke("move_path", { src: oldPath, dest: newPath });
  return newPath;
}

export async function removeChapterContentFromLocal(
  chapterId: string,
  config?: StorageConfig,
  title?: string,
): Promise<void> {
  const { primary, legacy, legacyNamed } = isTauri()
    ? await chapterPathCandidates(chapterId, config, title)
    : { primary: "", legacy: "", legacyNamed: "" };
  unregisterChapterOwners([chapterId]);
  if (isTauri()) {
    for (const path of new Set([primary, legacy, legacyNamed])) {
      try {
        await invoke("remove_file", { path });
      } catch {
        // ignore — file may not exist
      }
    }
  }
  try {
    localStorage.removeItem(getChapterStorageKey(chapterId));
  } catch {
    // ignore
  }
}

export async function removeProjectFromLocal(projectId: string, config?: StorageConfig): Promise<void> {
  if (isTauri()) {
    // Whole-folder delete covers the new layout; also clean any stragglers
    // left in the legacy flat locations. The folder is located by name hint
    // or by scanning for the "*-{id}" directory.
    await removeProjectFolder(projectId, projectNameMap.get(projectId), config);
    if (!projectNameMap.get(projectId)) {
      const found = await findProjectFolderOnDisk(projectId, config);
      if (found) {
        try {
          await invoke("remove_project_dir", { path: found });
        } catch {
          // ignore
        }
      }
    }
    for (const path of [
      await getLegacyProjectFilePath(projectId, config),
      await getLegacyNotesFilePath(projectId, config),
      await getLegacyDictFilePath(projectId, config),
    ]) {
      try {
        await invoke("remove_file", { path });
      } catch {
        // ignore — file may not exist
      }
    }
  }
  try {
    localStorage.removeItem(getProjectStorageKey(projectId));
  } catch {
    // ignore
  }
}

export async function getDefaultExportDirectory(config?: StorageConfig): Promise<string> {
  return config?.projectSaveDirectory || (await getAppDataDir());
}

// --- Notes (写作笔记) -----------------------------------------------------
// Per-project scratch notes (人物设定、灵感、伏笔). Live inside the project
// folder under 笔记/notes.json so they travel with the work; legacy
// notes/{id}.json files are migrated on first read. Debounced autosave in the
// UI calls saveNotesToLocal; reads fall back to [] when absent.
export async function loadNotesFromLocal(projectId: string, config?: StorageConfig): Promise<Note[]> {
  const mirrorKey = `inkwell-notes-${projectId}`;
  let raw: string | null;
  if (!isTauri()) {
    raw = readMirror(mirrorKey);
  } else {
    const dir = await resolveProjectDirForRead(projectId, config);
    const primary = await buildPath([dir, "笔记", "notes.json"]);
    const legacy = await getLegacyNotesFilePath(projectId, config);
    const hit = await readFirstExisting([primary, legacy], true);
    if (hit) {
      if (hit.path === legacy) moveFile(legacy, primary).catch(() => {});
      raw = hit.raw;
    } else {
      raw = readMirror(mirrorKey);
    }
  }
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
    writeMirror(`inkwell-notes-${projectId}`, raw);
    return;
  }
  const dir = await getProjectDir(projectId, projectNameMap.get(projectId), config);
  await atomicWriteTextFile(await buildPath([dir, "笔记", "notes.json"]), raw);
  writeMirror(`inkwell-notes-${projectId}`, raw);
}

// --- Dictionary (设定词典) -------------------------------------------------
// Per-project worldbuilding entries (人物卡 / 地点 / 势力 …). Same storage
// pattern as notes: 词典/dict.json inside the project folder, legacy
// dictionary/<id>.json migrated on first read, localStorage mirror for the
// browser dev mode.
export async function loadDictFromLocal(projectId: string, config?: StorageConfig): Promise<DictEntry[]> {
  const mirrorKey = `inkwell-dict-${projectId}`;
  let raw: string | null;
  if (!isTauri()) {
    raw = readMirror(mirrorKey);
  } else {
    const dir = await resolveProjectDirForRead(projectId, config);
    const primary = await buildPath([dir, "词典", "dict.json"]);
    const legacy = await getLegacyDictFilePath(projectId, config);
    const hit = await readFirstExisting([primary, legacy], true);
    if (hit) {
      if (hit.path === legacy) moveFile(legacy, primary).catch(() => {});
      raw = hit.raw;
    } else {
      raw = readMirror(mirrorKey);
    }
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveDictToLocal(projectId: string, entries: DictEntry[], config?: StorageConfig): Promise<void> {
  const raw = JSON.stringify(entries);
  if (!isTauri()) {
    writeMirror(`inkwell-dict-${projectId}`, raw);
    return;
  }
  const dir = await getProjectDir(projectId, projectNameMap.get(projectId), config);
  await atomicWriteTextFile(await buildPath([dir, "词典", "dict.json"]), raw);
  writeMirror(`inkwell-dict-${projectId}`, raw);
}

// Opens the given folder in the OS file explorer (Windows Explorer / macOS
// Finder / Linux file manager). Returns the error message on failure (e.g.
// path does not exist) so the UI can surface it; returns null on success.
// 浏览器预览模式下无法调起系统文件管理器，返回一条可读提示而不是静默失败。
export async function revealInFolder(path: string): Promise<string | null> {
  if (!path) return "路径为空";
  if (!isTauri()) return "浏览器预览模式无法打开系统文件夹，请在桌面应用中使用此功能";
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
  writeMirror(fsKey(path), content);
}

export async function readTextFile(path: string): Promise<string> {
  if (isTauri()) {
    return await invoke<string>("read_text_file", { path });
  }
  const value = readMirror(fsKey(path));
  if (value === null) throw new Error(`File not found: ${path}`);
  return value;
}

export async function exists(path: string): Promise<boolean> {
  if (isTauri()) {
    return await invoke<boolean>("file_exists", { path });
  }
  return readMirror(fsKey(path)) !== null;
}

export async function removeFile(path: string): Promise<void> {
  if (isTauri()) {
    await invoke("remove_file", { path });
    return;
  }
  try {
    localStorage.removeItem(fsKey(path));
  } catch {
    // ignore
  }
}

// Lists file names directly inside `dir` (non-recursive). Missing directory
// yields []. In fallback mode, lists namespaced localStorage keys.
export async function listFiles(dir: string): Promise<string[]> {
  if (isTauri()) {
    return await invoke<string[]>("list_files", { dir });
  }
  const prefix = fsKey(dir).replace(/\/+$/, "") + "/";
  const names: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        if (rest && !rest.includes("/")) names.push(rest);
      }
    }
  } catch {
    // ignore
  }
  return names;
}

// Copies a single file, creating the destination parent directory.
export async function copyFile(src: string, dest: string): Promise<void> {
  if (isTauri()) {
    await invoke("copy_file", { src, dest });
    return;
  }
  const value = readMirror(fsKey(src));
  if (value !== null) writeMirror(fsKey(dest), value);
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
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(srcPrefix)) {
        moves.push([key, destPrefix + key.slice(srcPrefix.length)]);
      }
    }
  } catch {
    // ignore
  }
  for (const [from, to] of moves) {
    const value = readMirror(from);
    if (value !== null) writeMirror(to, value);
  }
  return moves.length;
}

// Re-export the Tauri path helpers for callers that build paths.
export { appDataDir, dirname, join };
