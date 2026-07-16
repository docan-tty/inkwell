import type { StorageConfig } from "./storage";
import {
  exists,
  isTauri,
  listFiles,
  readTextFile,
  removeFile,
  writeTextFile,
  getAppDataDir,
  join,
} from "./storage";

// join() is async under Tauri; this small wrapper keeps call sites tidy.
async function buildFsPath(parts: string[]): Promise<string> {
  return join(...parts);
}

// Per-chapter version snapshots.
//
// Snapshots are full-content HTML copies of a chapter, written alongside the
// chapter file under `chapters/{chapterId}.snapshots/{timestamp}.html`.
// Creation policy (see store): at most one snapshot per chapter every few
// minutes, and only when the content actually changed. Old snapshots are
// pruned to MAX_SNAPSHOTS, newest kept.
//
// In non-Tauri (browser dev) mode they back onto the same namespaced
// localStorage keys as other file operations, so the history panel works
// there too.

const MAX_SNAPSHOTS = 20;

export interface SnapshotInfo {
  /** Snapshot creation time (ms since epoch), parsed from the file name. */
  timestamp: number;
  fileName: string;
}

async function snapshotsDir(chapterId: string, config?: StorageConfig): Promise<string> {
  const base = config?.projectSaveDirectory || (await getAppDataDir());
  return buildFsPath([base, "chapters", `${chapterId}.snapshots`]);
}

async function snapshotPath(dir: string, timestamp: number): Promise<string> {
  return buildFsPath([dir, `${timestamp}.html`]);
}

function parseTimestamp(fileName: string): number | null {
  const m = /^(\d+)\.html$/.exec(fileName);
  return m ? parseInt(m[1], 10) : null;
}

/** Lists snapshots of a chapter, newest first. */
export async function listSnapshots(
  chapterId: string,
  config?: StorageConfig,
): Promise<SnapshotInfo[]> {
  const dir = await snapshotsDir(chapterId, config);
  if (isTauri() && !(await exists(dir))) return [];
  const names = await listFiles(dir);
  return names
    .map((fileName) => ({ fileName, timestamp: parseTimestamp(fileName) }))
    .filter((s): s is SnapshotInfo => s.timestamp !== null)
    .sort((a, b) => b.timestamp - a.timestamp);
}

/** Writes a new snapshot and prunes old ones beyond MAX_SNAPSHOTS. */
export async function createSnapshot(
  chapterId: string,
  content: string,
  config?: StorageConfig,
): Promise<void> {
  const dir = await snapshotsDir(chapterId, config);
  await writeTextFile(await snapshotPath(dir, Date.now()), content);
  try {
    const all = await listSnapshots(chapterId, config);
    for (const old of all.slice(MAX_SNAPSHOTS)) {
      await removeFile(await snapshotPath(dir, old.timestamp)).catch(() => {});
    }
  } catch {
    // pruning is best-effort — a failed prune must never lose the snapshot
  }
}

export async function readSnapshot(
  chapterId: string,
  timestamp: number,
  config?: StorageConfig,
): Promise<string> {
  const dir = await snapshotsDir(chapterId, config);
  return readTextFile(await snapshotPath(dir, timestamp));
}

/** Removes all snapshots of a chapter (called when the chapter is deleted). */
export async function removeSnapshots(
  chapterId: string,
  config?: StorageConfig,
): Promise<void> {
  const dir = await snapshotsDir(chapterId, config);
  try {
    const all = await listSnapshots(chapterId, config);
    await Promise.all(
      all.map(async (s) => removeFile(await snapshotPath(dir, s.timestamp)).catch(() => {})),
    );
  } catch {
    // ignore — snapshots must never block deletion
  }
}
