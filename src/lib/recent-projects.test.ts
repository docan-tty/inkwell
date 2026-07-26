import { describe, expect, it } from "vitest";
import { sortProjectsByRecency, sumChapterWords } from "./recent-projects";
import type { Project } from "../types";

function proj(id: string, updatedAt: number): Project {
  return {
    id,
    name: `作品${id}`,
    author: "",
    genre: "",
    description: "",
    targetWords: 4000,
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("sortProjectsByRecency", () => {
  it("orders by recentProjects first, then updatedAt desc for the rest", () => {
    const projects = [proj("a", 100), proj("b", 300), proj("c", 200), proj("d", 50)];
    const sorted = sortProjectsByRecency(projects, ["c", "a"]);
    expect(sorted.map((p) => p.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("ignores recent ids that no longer exist", () => {
    const projects = [proj("a", 100), proj("b", 300)];
    const sorted = sortProjectsByRecency(projects, ["gone", "a"]);
    expect(sorted.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("empty recents falls back to updatedAt desc", () => {
    const projects = [proj("a", 100), proj("b", 300), proj("c", 200)];
    expect(sortProjectsByRecency(projects, []).map((p) => p.id)).toEqual(["b", "c", "a"]);
  });
});

describe("sumChapterWords", () => {
  it("sums chapter word counts", () => {
    expect(sumChapterWords([{ wordCount: 100 }, { wordCount: 0 }, { wordCount: 250 }])).toBe(350);
    expect(sumChapterWords([])).toBe(0);
  });
});
