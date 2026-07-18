import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useAppStore,
  scheduleAutoSave,
  cancelAutoSave,
  pendingChapterContent,
  setPendingChapterContent,
} from "./index";

// Store save-lifecycle tests: the debounce/timer-vs-state-switch races that
// lose writing. Browser mode (no __TAURI_INTERNALS__) — storage backs onto
// localStorage.

describe("store save lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    pendingChapterContent.clear();
    cancelAutoSave();
    useAppStore.setState({
      currentProject: null,
      projects: [],
      volumes: [],
      chapters: [],
      currentChapter: null,
      notes: [],
      dictEntries: [],
      view: "projects",
    });
  });

  afterEach(() => {
    cancelAutoSave();
    vi.useRealTimers();
  });

  it("autosave writes the chapter content after the debounce", async () => {
    await useAppStore.getState().createProject({ name: "A" });
    await useAppStore.getState().openProject(useAppStore.getState().projects[0]);
    const ch = await useAppStore.getState().createChapter(null, "第一章");
    scheduleAutoSave(ch.id, "<p>正文</p>");
    await vi.advanceTimersByTimeAsync(3100);
    expect(localStorage.getItem(`inkwell-chapter-${ch.id}`)).toBe("<p>正文</p>");
    // Landing on disk drops the pending entry.
    expect(pendingChapterContent.has(ch.id)).toBe(false);
  });

  it("a stale autosave timer stands down when a newer keystroke landed (seq guard)", async () => {
    await useAppStore.getState().createProject({ name: "A" });
    await useAppStore.getState().openProject(useAppStore.getState().projects[0]);
    const ch = await useAppStore.getState().createChapter(null, "第一章");
    scheduleAutoSave(ch.id, "<p>old</p>");
    // Newer keystroke arrives before the timer fires — supersedes seq.
    setPendingChapterContent(ch.id, "<p>new</p>");
    await vi.advanceTimersByTimeAsync(3100);
    // The stale timer must NOT have written its older buffer.
    expect(localStorage.getItem(`inkwell-chapter-${ch.id}`)).not.toBe("<p>old</p>");
  });

  it("note edits made within the debounce window survive a project switch (C3)", async () => {
    const pA = await useAppStore.getState().createProject({ name: "A" });
    const pB = await useAppStore.getState().createProject({ name: "B" });
    await useAppStore.getState().openProject(pA);
    useAppStore.getState().addNote();
    const noteId = useAppStore.getState().notes[0].id;
    useAppStore.getState().updateNote(noteId, { content: "关键伏笔" });
    // Switch projects 400ms later — inside the 800ms debounce window.
    await vi.advanceTimersByTimeAsync(400);
    await useAppStore.getState().openProject(pB);
    // openProject flushed A's notes synchronously.
    const rawA = localStorage.getItem(`inkwell-notes-${pA.id}`);
    expect(rawA).not.toBeNull();
    expect(JSON.parse(rawA!)[0].content).toBe("关键伏笔");
    // The scheduled (payload-captured) timer may also fire later — writing
    // to A's key, never B's.
    await vi.advanceTimersByTimeAsync(1000);
    expect(localStorage.getItem(`inkwell-notes-${pB.id}`)).toBeNull();
    expect(JSON.parse(localStorage.getItem(`inkwell-notes-${pA.id}`)!)[0].content).toBe("关键伏笔");
  });

  it("dict edits made within the debounce window survive a project close (C3)", async () => {
    const pA = await useAppStore.getState().createProject({ name: "A" });
    await useAppStore.getState().openProject(pA);
    useAppStore.getState().addDictEntry("人物");
    const entryId = useAppStore.getState().dictEntries[0].id;
    useAppStore.getState().updateDictEntry(entryId, { term: "主角名" });
    await vi.advanceTimersByTimeAsync(400);
    await useAppStore.getState().closeProject();
    const raw = localStorage.getItem(`inkwell-dict-${pA.id}`);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)[0].term).toBe("主角名");
  });

  it("closeProject flushes pending chapter content before clearing state (R3/R4)", async () => {
    const pA = await useAppStore.getState().createProject({ name: "A" });
    await useAppStore.getState().openProject(pA);
    const ch = useAppStore.getState().chapters[0] ?? (await useAppStore.getState().createChapter(null, "第一章"));
    // Simulate typing: schedule (but do not let fire) the autosave.
    scheduleAutoSave(ch.id, "<p>未落盘的段落</p>");
    await useAppStore.getState().closeProject();
    expect(localStorage.getItem(`inkwell-chapter-${ch.id}`)).toBe("<p>未落盘的段落</p>");
    expect(pendingChapterContent.has(ch.id)).toBe(false);
  });

  it("restoreChapterContent bumps contentVersion (R1)", async () => {
    await useAppStore.getState().createProject({ name: "A" });
    await useAppStore.getState().openProject(useAppStore.getState().projects[0]);
    const ch = await useAppStore.getState().createChapter(null, "第一章");
    const before = useAppStore.getState().contentVersion;
    await useAppStore.getState().restoreChapterContent(ch.id, "<p>恢复的内容</p>");
    expect(useAppStore.getState().contentVersion).toBe(before + 1);
    expect(localStorage.getItem(`inkwell-chapter-${ch.id}`)).toBe("<p>恢复的内容</p>");
  });

  it("deleteProject cleans up the project's stats keys", async () => {
    const { addWritingSeconds, getTodayWritingSeconds } = await import("../lib/stats");
    const p = await useAppStore.getState().createProject({ name: "A" });
    addWritingSeconds(p.id, 120);
    expect(getTodayWritingSeconds(p.id)).toBe(120);
    await useAppStore.getState().deleteProject(p.id);
    expect(getTodayWritingSeconds(p.id)).toBe(0);
  });

  it("moveChapter clamps a negative target index (no splice-from-end)", async () => {
    await useAppStore.getState().createProject({ name: "A" });
    await useAppStore.getState().openProject(useAppStore.getState().projects[0]);
    const c1 = await useAppStore.getState().createChapter(null, "一");
    const c2 = await useAppStore.getState().createChapter(null, "二");
    const c3 = await useAppStore.getState().createChapter(null, "三");
    await useAppStore.getState().moveChapter(c3.id, null, -5);
    const titles = useAppStore
      .getState()
      .chapters.filter((c) => c.parentId === null)
      .sort((a, b) => a.order - b.order)
      .map((c) => c.title);
    expect(titles[0]).toBe("三");
    expect(titles).toEqual(["三", "一", "二"]);
    expect([c1, c2]).toHaveLength(2); // sanity
  });
});
