import { beforeEach, describe, expect, it } from "vitest";
import {
  saveDraft,
  getDraft,
  clearDraft,
  findRecoverableDrafts,
} from "./draft";

describe("draft buffer", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves and reads back a draft", () => {
    saveDraft("c1", "<p>hello</p>");
    expect(getDraft("c1")).toBe("<p>hello</p>");
  });

  it("returns null for unknown chapters", () => {
    expect(getDraft("nope")).toBeNull();
  });

  it("clears a draft and its metadata", async () => {
    saveDraft("c1", "content");
    clearDraft("c1");
    expect(getDraft("c1")).toBeNull();
    const drafts = await findRecoverableDrafts(async () => "other");
    expect(drafts).toHaveLength(0);
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
});
