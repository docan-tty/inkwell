// Per-chapter draft buffer backed by localStorage.
//
// Purpose: crash / power-loss recovery. Chapter content is written to disk
// every 3s by the auto-save, but between the last successful save and an
// abrupt process exit (kill, crash, power cut) up to 3s of typing would be
// lost. The draft buffer mirrors every keystroke into localStorage
// (synchronous, cheap), so on next launch we can detect "draft newer than
// disk" and offer to restore it.
//
// Lifecycle:
//  - every Editor onChange  -> saveDraft(chapterId, html)
//  - successful disk save    -> clearDraft(chapterId)
//  - chapter open            -> getDraft(chapterId); if it differs from disk
//                               content, surface a recovery prompt.

const DRAFT_PREFIX = "inkwell-draft:";
const META_KEY = "inkwell-draft-meta";

export interface DraftMeta {
  chapterId: string;
  updatedAt: number;
}

function draftKey(chapterId: string): string {
  return `${DRAFT_PREFIX}${chapterId}`;
}

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

function touchMeta(chapterId: string) {
  const meta = readMeta().filter((m) => m.chapterId !== chapterId);
  meta.push({ chapterId, updatedAt: Date.now() });
  writeMeta(meta);
}

function dropMeta(chapterId: string) {
  writeMeta(readMeta().filter((m) => m.chapterId !== chapterId));
}

/** Mirror the current editor content into the draft buffer. Never throws. */
export function saveDraft(chapterId: string, content: string) {
  try {
    localStorage.setItem(draftKey(chapterId), content);
    touchMeta(chapterId);
  } catch {
    // Quota exceeded or storage unavailable — ignore; disk save still works.
  }
}

/** Returns the buffered draft for a chapter, or null when none exists. */
export function getDraft(chapterId: string): string | null {
  try {
    return localStorage.getItem(draftKey(chapterId));
  } catch {
    return null;
  }
}

/** Drop the draft once the content has safely landed on disk. */
export function clearDraft(chapterId: string) {
  try {
    localStorage.removeItem(draftKey(chapterId));
    dropMeta(chapterId);
  } catch {
    // ignore
  }
}

/**
 * Returns drafts whose buffered content differs from the supplied disk
 * content — i.e. work that would be lost without recovery. `getDiskContent`
 * is called once per pending draft chapter.
 */
export async function findRecoverableDrafts(
  getDiskContent: (chapterId: string) => Promise<string>,
): Promise<{ chapterId: string; draft: string; updatedAt: number }[]> {
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
