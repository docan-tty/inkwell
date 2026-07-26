// Per-chapter draft buffer backed by localStorage.
//
// Purpose: crash / power-loss recovery. Chapter content is written to disk
// every ~1.5s by the auto-save, but between the last successful save and an
// abrupt process exit (kill, crash, power cut) that typing would be lost.
// The draft buffer mirrors content into localStorage so on next launch we
// can detect "draft newer than disk" and offer to restore it.
//
// Performance notes (vs. the original write-on-every-keystroke design):
//  - Writes are DEBOUNCED (1s): a long chapter's full HTML is no longer
//    serialized into localStorage on every keystroke. The in-memory
//    pendingDrafts map always holds the latest bytes; getDraft reads it
//    first, so consumers never see the on-storage lag.
//  - Oversized chapters (> DRAFT_MAX_BYTES) skip the draft entirely —
//    localStorage quotas (5-10MB) would otherwise be consumed by a single
//    chapter; the 1.5s autosave remains the primary safety net there.
//
// Lifecycle:
//  - every Editor onChange  -> saveDraft(chapterId, html, hint?)
//  - successful disk save    -> clearDraft(chapterId) (also drops pending)
//  - window close            -> flushDrafts() (best-effort, synchronous)
//  - chapter open            -> getDraft(chapterId); if it differs from disk
//                               content, surface a recovery prompt.
//  - hint ({projectId, chapterTitle}) rides along in the meta so the launch
//    recovery dialog can name the chapter without scanning every project.

const DRAFT_PREFIX = "inkwell-draft:";
const META_KEY = "inkwell-draft-meta";
const DRAFT_DEBOUNCE_MS = 1000;
// Skip the draft for chapters whose HTML exceeds this (2MB). A draft this
// large would blow the localStorage quota shared with everything else.
const DRAFT_MAX_BYTES = 2 * 1024 * 1024;

export interface DraftHint {
  projectId?: string;
  chapterTitle?: string;
}

export interface DraftMeta extends DraftHint {
  chapterId: string;
  updatedAt: number;
}

function draftKey(chapterId: string): string {
  return `${DRAFT_PREFIX}${chapterId}`;
}

// Latest content waiting for the debounce flush. Read by getDraft FIRST so
// callers (chapter-open draft comparison, recovery scan) always see the
// freshest bytes even inside the debounce window.
const pendingDrafts = new Map<string, { content: string; hint?: DraftHint }>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const oversizedWarned = new Set<string>();

function readMeta(): DraftMeta[] {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as DraftMeta[]) : [];
  } catch {
    return [];
  }
}

function writeMeta(meta: DraftMeta[]) {
  try {
    if (meta.length === 0) {
      localStorage.removeItem(META_KEY);
    } else {
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    }
  } catch {
    // Storage full / unavailable — drafts are best-effort, never throw.
  }
}

function touchMeta(chapterId: string, hint?: DraftHint) {
  const meta = readMeta().filter((m) => m.chapterId !== chapterId);
  meta.push({ chapterId, updatedAt: Date.now(), ...hint });
  writeMeta(meta);
}

function dropMeta(chapterId: string) {
  writeMeta(readMeta().filter((m) => m.chapterId !== chapterId));
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushDrafts();
  }, DRAFT_DEBOUNCE_MS);
}

/** Write every pending draft to localStorage. Called by the debounce timer
 *  and synchronously before window close / project close. */
export function flushDrafts() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  for (const [chapterId, { content, hint }] of pendingDrafts) {
    try {
      localStorage.setItem(draftKey(chapterId), content);
      touchMeta(chapterId, hint);
    } catch {
      // Quota exceeded or storage unavailable — ignore; disk save still works.
    }
  }
  pendingDrafts.clear();
}

/** Mirror the current editor content into the draft buffer (debounced).
 *  Never throws. Oversized chapters skip the draft (autosave covers them). */
export function saveDraft(chapterId: string, content: string, hint?: DraftHint) {
  if (content.length > DRAFT_MAX_BYTES) {
    if (!oversizedWarned.has(chapterId)) {
      oversizedWarned.add(chapterId);
      console.warn(`[inkwell] 章节过大(${Math.round(content.length / 1024)}KB),已跳过崩溃草稿缓冲;自动保存仍是主防线。`);
    }
    return;
  }
  pendingDrafts.set(chapterId, { content, hint });
  scheduleFlush();
}

/** Returns the buffered draft for a chapter (pending map first), or null. */
export function getDraft(chapterId: string): string | null {
  const pending = pendingDrafts.get(chapterId);
  if (pending) return pending.content;
  try {
    return localStorage.getItem(draftKey(chapterId));
  } catch {
    return null;
  }
}

/** Drop the draft once the content has safely landed on disk. Must also
 *  drop the PENDING copy — otherwise the debounce timer would write the
 *  stale bytes back after the disk save, resurrecting a ghost draft. */
export function clearDraft(chapterId: string) {
  pendingDrafts.delete(chapterId);
  try {
    localStorage.removeItem(draftKey(chapterId));
    dropMeta(chapterId);
  } catch {
    // ignore
  }
}

/** Meta entries (with any project/title hints) for the recovery scan. */
export function listDraftMetas(): DraftMeta[] {
  // Flush first so meta reflects drafts still inside the debounce window.
  flushDrafts();
  return readMeta();
}

/**
 * Returns drafts whose buffered content differs from the supplied disk
 * content — i.e. work that would be lost without recovery. `getDiskContent`
 * is called once per pending draft chapter.
 */
export async function findRecoverableDrafts(
  getDiskContent: (chapterId: string) => Promise<string>,
): Promise<{ chapterId: string; draft: string; updatedAt: number }[]> {
  flushDrafts();
  const out: { chapterId: string; draft: string; updatedAt: number }[] = [];
  for (const m of readMeta()) {
    const draft = getDraft(m.chapterId);
    if (draft === null) {
      dropMeta(m.chapterId);
      continue;
    }
    let disk = "";
    try {
      disk = await getDiskContent(m.chapterId);
    } catch {
      // Chapter file unreadable (deleted?) — the draft is the only copy,
      // treat it as recoverable rather than silently dropping it.
      out.push({ chapterId: m.chapterId, draft, updatedAt: m.updatedAt });
      continue;
    }
    if (draft !== disk) {
      out.push({ chapterId: m.chapterId, draft, updatedAt: m.updatedAt });
    } else {
      // Draft matches disk — nothing to recover, clean up.
      clearDraft(m.chapterId);
    }
  }
  return out.sort((a, b) => a.updatedAt - b.updatedAt);
}
