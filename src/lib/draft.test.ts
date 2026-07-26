import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  saveDraft,
  getDraft,
  clearDraft,
  flushDrafts,
  findRecoverableDrafts,
  listDraftMetas,
} from "./draft";

describe("draft buffer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    flushDrafts(); // reset module-level pending state between tests
    localStorage.clear();
  });

  afterEach(() => {
    flushDrafts();
    vi.useRealTimers();
  });

  it("saves and reads back a draft (pending map serves before flush)", () => {
    saveDraft("c1", "<p>hello</p>");
    expect(getDraft("c1")).toBe("<p>hello</p>");
  });

  it("debounces writes: localStorage is only written after the flush", () => {
    saveDraft("c1", "v1");
    expect(localStorage.getItem("inkwell-draft:c1")).toBeNull();
    vi.advanceTimersByTime(1100);
    expect(localStorage.getItem("inkwell-draft:c1")).toBe("v1");
  });

  it("coalesces rapid keystrokes into a single write of the latest content", () => {
    saveDraft("c1", "v1");
    saveDraft("c1", "v12");
    saveDraft("c1", "v123");
    vi.advanceTimersByTime(1100);
    expect(localStorage.getItem("inkwell-draft:c1")).toBe("v123");
    expect(getDraft("c1")).toBe("v123");
  });

  it("flushDrafts writes synchronously (window-close path)", () => {
    saveDraft("c1", "before-close");
    flushDrafts();
    expect(localStorage.getItem("inkwell-draft:c1")).toBe("before-close");
  });

  it("clearDraft also drops the pending copy (no ghost resurrection)", () => {
    saveDraft("c1", "typed");
    clearDraft("c1");
    vi.advanceTimersByTime(2000);
    expect(getDraft("c1")).toBeNull();
    expect(localStorage.getItem("inkwell-draft:c1")).toBeNull();
  });

  it("returns null for unknown chapters", () => {
    expect(getDraft("nope")).toBeNull();
  });

  it("skips oversized chapters (autosave is the safety net there)", () => {
    const big = "x".repeat(2 * 1024 * 1024 + 1);
    saveDraft("c-big", big);
    vi.advanceTimersByTime(1100);
    expect(getDraft("c-big")).toBeNull();
  });

  it("records the project/title hint in the meta", () => {
    saveDraft("c1", "content", { projectId: "p1", chapterTitle: "第一章" });
    const metas = listDraftMetas();
    expect(metas).toHaveLength(1);
    expect(metas[0]).toMatchObject({ chapterId: "c1", projectId: "p1", chapterTitle: "第一章" });
  });

  it("reports drafts that differ from disk as recoverable", async () => {
    saveDraft("c1", "typed-but-never-saved");
    const drafts = await findRecoverableDrafts(async () => "older-disk-version");
    expect(drafts).toHaveLength(1);
    expect(drafts[0].chapterId).toBe("c1");
    expect(drafts[0].draft).toBe("typed-but-never-saved");
  });

  it("drops drafts identical to disk (nothing to recover)", async () => {
    saveDraft("c1", "same-content");
    const drafts = await findRecoverableDrafts(async () => "same-content");
    expect(drafts).toHaveLength(0);
    expect(getDraft("c1")).toBeNull();
  });

  it("keeps drafts whose disk file is unreadable", async () => {
    saveDraft("c1", "only-copy-left");
    const drafts = await findRecoverableDrafts(async () => {
      throw new Error("file gone");
    });
    expect(drafts).toHaveLength(1);
  });

  it("findRecoverableDrafts sees drafts still inside the debounce window", async () => {
    saveDraft("c1", "just-typed");
    // No timer advance — the scan must flush pending first.
    const drafts = await findRecoverableDrafts(async () => "disk");
    expect(drafts).toHaveLength(1);
    expect(drafts[0].draft).toBe("just-typed");
  });
});
