import { beforeEach, describe, expect, it } from "vitest";
import {
  getLocalProjectRegistry,
  setLocalProjectRegistry,
  loadProjectFromLocal,
  saveProjectToLocal,
  loadChapterContentFromLocal,
  saveChapterContentToLocal,
} from "./storage";
import type { Project, Chapter, Volume } from "../types";

const project: Project = {
  id: "p1",
  name: "Test",
  author: "",
  genre: "",
  description: "",
  targetWords: 4000,
  createdAt: 1,
  updatedAt: 1,
};

const volume: Volume = {
  id: "v1",
  projectId: "p1",
  title: "Volume 1",
  order: 0,
  createdAt: 1,
  updatedAt: 1,
};

const chapter: Chapter = {
  id: "c1",
  projectId: "p1",
  parentId: "v1",
  title: "Chapter 1",
  summary: "",
  order: 0,
  status: "draft",
  wordCount: 0,
  tags: [],
  notes: "",
  createdAt: 1,
  updatedAt: 1,
};

describe("storage fallback", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("serializes and deserializes project registry", async () => {
    await setLocalProjectRegistry([project]);
    const loaded = await getLocalProjectRegistry({});
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("p1");
  });

  it("serializes and deserializes project data", async () => {
    await saveProjectToLocal(project, [chapter], [volume], {});
    const loaded = await loadProjectFromLocal("p1", {});
    expect(loaded).not.toBeNull();
    expect(loaded?.project.id).toBe("p1");
    expect(loaded?.chapters[0].id).toBe("c1");
    expect(loaded?.volumes[0].id).toBe("v1");
  });

  it("reads and writes chapter content", async () => {
    await saveChapterContentToLocal("c1", "hello world", {});
    const content = await loadChapterContentFromLocal("c1", {});
    expect(content).toBe("hello world");
  });
});
