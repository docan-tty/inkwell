import type { StorageConfig } from "./storage";
import {
  assertSafeId,
  exists,
  getAppDataDir,
  getProjectNameHint,
  isTauri,
  join,
  listFiles,
  projectFolderName,
  readTextFile,
  registerContentRoot,
  removeFile,
  resolveChapterOwner,
  writeTextFile,
} from "./storage";

// Per-chapter version snapshots.
//
// Snapshots are full-content HTML copies of a chapter, written inside the
// owning project's folder at `chapters/{chapterId}.snapshots/{ts}.html`.
// Creation policy (see store): at most one snapshot per chapter every few
// minutes, and only when the content actually changed. Old snapshots are
// pruned to MAX_SNAPSHOTS, newest kept.
//
// The owning project is resolved through storage's chapter→owner registry
// (populated by the store, with a delete-time grace window so cleanup after
// removal still finds the right folder). When the owner is unknown the
// legacy flat location under the content root is used, so old snapshots
// stay reachable; reads also migrate legacy snapshots into the project
// folder on first access.
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

async function buildPath(parts: string[]): Promise<string> {
  if (isTauri()) {
    try {
      return await join(...parts);
    } catch {
      // fall through — test environments flag Tauri without the real bridge
    }
  }
  return parts.filter(Boolean).join("/");
}

async function contentBase(config?: StorageConfig): Promise<string> {
  return config?.projectSaveDirectory || (await getAppDataDir());
}

// Primary dir: inside the owning project's folder. Falls back to the legacy
// flat location when the owner is unknown.
async function snapshotsDirs(
  chapterId: string,
  config?: StorageConfig,
): Promise<{ primary: string; legacy: string }> {
  assertSafeId(chapterId, "章节");
  const base = await contentBase(config);
  // The snapshots dirs live under the content root — register it with the
  // Rust-side path whitelist before any I/O.
  await registerContentRoot(base);
  const legacy = await buildPath([base, "chapters", `${chapterId}.snapshots`]);
  const owner = resolveChapterOwner(chapterId);
  if (!owner) return { primary: legacy, legacy };
  const dir = await buildPath([
    base,
    projectFolderName(owner.projectName || getProjectNameHint(owner.projectId) || "work", owner.projectId),
    "chapters",
    `${chapterId}.snapshots`,
  ]);
  return { primary: dir, legacy };
}

async function snapshotPath(dir: string, timestamp: number): Promise<string> {
  return buildPath([dir, `${timestamp}.html`]);
}

function parseTimestamp(fileName: string): number | null {
  const m = /^(\d+)\.html$/.exec(fileName);
  return m ? parseInt(m[1], 10) : null;
}

async function listIn(dir: string): Promise<SnapshotInfo[]> {
  if (isTauri() && !(await exists(dir))) return [];
  const names = await listFiles(dir);
  return names
    .map((fileName) => ({ fileName, timestamp: parseTimestamp(fileName) }))
    .filter((s): s is SnapshotInfo => s.timestamp !== null)
    .sort((a, b) => b.timestamp - a.timestamp);
}

/** Lists snapshots of a chapter, newest first. */
export async function listSnapshots(
  chapterId: string,
  config?: StorageConfig,
): Promise<SnapshotInfo[]> {
  const { primary, legacy } = await snapshotsDirs(chapterId, config);
  const [main, old] = await Promise.all([listIn(primary), legacy !== primary ? listIn(legacy) : []]);
  return [...main, ...old].sort((a, b) => b.timestamp - a.timestamp);
}

/** Writes a new snapshot and prunes old ones beyond MAX_SNAPSHOTS. */
export async function createSnapshot(
  chapterId: string,
  content: string,
  config?: StorageConfig,
): Promise<void> {
  const { primary } = await snapshotsDirs(chapterId, config);
  await writeTextFile(await snapshotPath(primary, Date.now()), content);
  try {
    const all = await listSnapshots(chapterId, config);
    const { legacy } = await snapshotsDirs(chapterId, config);
    for (const old of all.slice(MAX_SNAPSHOTS)) {
      // Prune from whichever location holds the snapshot.
      await removeFile(await snapshotPath(primary, old.timestamp)).catch(async () =>
        removeFile(await snapshotPath(legacy, old.timestamp)).catch(() => {}),
      );
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
  const { primary, legacy } = await snapshotsDirs(chapterId, config);
  try {
    return await readTextFile(await snapshotPath(primary, timestamp));
  } catch (err) {
    if (legacy === primary) throw err;
    // Fall back to the legacy flat location and migrate the file over.
    const raw = await readTextFile(await snapshotPath(legacy, timestamp));
    try {
      await writeTextFile(await snapshotPath(primary, timestamp), raw);
      await removeFile(await snapshotPath(legacy, timestamp));
    } catch {
      // migration is best-effort
    }
    return raw;
  }
}

/** Removes all snapshots of a chapter (called when the chapter is deleted). */
export async function removeSnapshots(
  chapterId: string,
  config?: StorageConfig,
): Promise<void> {
  const { primary, legacy } = await snapshotsDirs(chapterId, config);
  try {
    const all = await listSnapshots(chapterId, config);
    await Promise.all(
      all.map(async (s) => {
        await removeFile(await snapshotPath(primary, s.timestamp)).catch(() => {});
        if (legacy !== primary) {
          await removeFile(await snapshotPath(legacy, s.timestamp)).catch(() => {});
        }
      }),
    );
  } catch {
    // ignore — snapshots must never block deletion
  }
}
