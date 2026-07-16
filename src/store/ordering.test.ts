import { describe, expect, it } from "vitest";
import { reorderChaptersByVolume } from "../store";
import type { Chapter } from "../types";

function makeChapter(id: string, parentId: string | null, order: number): Chapter {
  return {
    id,
    projectId: "p1",
    parentId,
    title: id,
    summary: "",
    order,
    status: "draft",
    wordCount: 0,
    tags: [],
    notes: "",
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("reorderChaptersByVolume", () => {
  it("recomputes order within each volume independently", () => {
    const chapters = [
      makeChapter("c1", "v1", 5),
      makeChapter("c2", "v1", 3),
      makeChapter("c3", "v2", 2),
      makeChapter("c4", "v2", 8),
    ];
    const result = reorderChaptersByVolume(chapters);
    expect(result.find((c) => c.id === "c1")?.order).toBe(0);
    expect(result.find((c) => c.id === "c2")?.order).toBe(1);
    expect(result.find((c) => c.id === "c3")?.order).toBe(0);
    expect(result.find((c) => c.id === "c4")?.order).toBe(1);
  });

  it("keeps global array order unchanged", () => {
    const chapters = [
      makeChapter("c1", "v1", 1),
      makeChapter("c2", "v2", 0),
      makeChapter("c3", "v1", 0),
    ];
    const result = reorderChaptersByVolume(chapters);
    expect(result.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("handles orphaned chapters with null parentId", () => {
    const chapters = [
      makeChapter("c1", null, 1),
      makeChapter("c2", null, 0),
      makeChapter("c3", "v1", 0),
    ];
    const result = reorderChaptersByVolume(chapters);
    expect(result.find((c) => c.id === "c1")?.order).toBe(0);
    expect(result.find((c) => c.id === "c2")?.order).toBe(1);
    expect(result.find((c) => c.id === "c3")?.order).toBe(0);
  });
});

describe("chapter ordering semantics", () => {
  it("deleting a chapter leaves other volumes untouched", () => {
    const chapters = [
      makeChapter("c1", "v1", 0),
      makeChapter("c2", "v1", 1),
      makeChapter("c3", "v2", 0),
    ];
    const afterDelete = reorderChaptersByVolume(chapters.filter((c) => c.id !== "c2"));
    expect(afterDelete.find((c) => c.id === "c1")?.order).toBe(0);
    expect(afterDelete.find((c) => c.id === "c3")?.order).toBe(0);
  });

  it("moving a chapter between volumes updates orders in both volumes", () => {
    const chapters = [
      makeChapter("c1", "v1", 0),
      makeChapter("c2", "v1", 1),
      makeChapter("c3", "v2", 0),
    ];
    const moved = chapters.map((c) => (c.id === "c2" ? { ...c, parentId: "v2" as const } : c));
    const result = reorderChaptersByVolume(moved);
    expect(result.find((c) => c.id === "c1")?.order).toBe(0);
    expect(result.find((c) => c.id === "c2")?.order).toBe(0);
    expect(result.find((c) => c.id === "c3")?.order).toBe(1);
  });
});
