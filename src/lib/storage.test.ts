import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setFsBridge, type FsBridge } from "./atomic";
import {
  getLocalProjectRegistry,
  setLocalProjectRegistry,
  loadProjectFromLocal,
  saveProjectToLocal,
  loadChapterContentFromLocal,
  saveChapterContentToLocal,
  loadNotesFromLocal,
  saveNotesToLocal,
  loadDictFromLocal,
  saveDictToLocal,
  projectFolderName,
  assertSafeId,
} from "./storage";
import type { Project, Chapter, Volume } from "../types";

// In-memory Tauri filesystem installed via the atomic.ts bridge. storage.ts
// reads through `bridgeReadTextFile` and writes through `atomicWriteTextFile`,
// so toggling `__TAURI_INTERNALS__` + this bridge exercises the real
// Tauri code paths (the ones that hold the user's novel).
function createMemFs() {
  const files = new Map<string, string>();
  const bridge: FsBridge = {
    async writeText(path, content) {
      files.set(path, content);
    },
    async readText(path) {
      if (!files.has(path)) throw new Error(`读取失败 (${path}): 系统找不到指定的文件。 (os error 2)`);
      return files.get(path)!;
    },
  };
  return { files, bridge };
}

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

function enableTauri() {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
}

function disableTauri() {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
}

describe("storage fallback (browser mode)", () => {
  beforeEach(() => {
    disableTauri();
    setFsBridge(null);
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

describe("storage Tauri branch", () => {
  let mem: ReturnType<typeof createMemFs>;

  beforeEach(() => {
    localStorage.clear();
    mem = createMemFs();
    setFsBridge(mem.bridge);
    enableTauri();
  });

  afterEach(() => {
    disableTauri();
    setFsBridge(null);
  });

  it("round-trips the project registry through the fs bridge", async () => {
    await setLocalProjectRegistry([project]);
    // Both the disk file and the mirror were written.
    expect([...mem.files.keys()].some((k) => k.endsWith("registry.json"))).toBe(true);
    expect(localStorage.getItem("inkwell-projects")).not.toBeNull();
    const loaded = await getLocalProjectRegistry({});
    expect(loaded[0]?.id).toBe("p1");
  });

  it("throws (not empty list) when the registry file is corrupt", async () => {
    await setLocalProjectRegistry([project]);
    const registryPath = [...mem.files.keys()].find((k) => k.endsWith("registry.json"))!;
    mem.files.set(registryPath, "{corrupt!!");
    localStorage.clear(); // no mirror to rescue it
    await expect(getLocalProjectRegistry({})).rejects.toThrow(/损坏/);
  });

  it("round-trips a project file and its chapters", async () => {
    await saveProjectToLocal(project, [chapter], [volume], {});
    const loaded = await loadProjectFromLocal("p1", {});
    expect(loaded?.chapters[0]?.id).toBe("c1");
  });

  it("returns null for a genuinely missing project (treated as new)", async () => {
    expect(await loadProjectFromLocal("ghost", {})).toBeNull();
  });

  it("throws for a corrupt project file instead of showing a blank novel", async () => {
    await saveProjectToLocal(project, [chapter], [volume], {});
    const path = [...mem.files.keys()].find((k) => k.includes("p1"))!;
    mem.files.set(path, "not json at all");
    localStorage.clear();
    await expect(loadProjectFromLocal("p1", {})).rejects.toThrow(/损坏/);
  });

  it("recovers a corrupt project file from the interrupted-write .tmp sibling", async () => {
    await saveProjectToLocal(project, [chapter], [volume], {});
    const path = [...mem.files.keys()].find((k) => k.includes("p1"))!;
    mem.files.set(`${path}.tmp`, mem.files.get(path)!);
    mem.files.set(path, "truncated{");
    localStorage.clear();
    const loaded = await loadProjectFromLocal("p1", {});
    expect(loaded?.project.id).toBe("p1");
  });

  it("chapter reads fall back to the mirror only when the file is missing", async () => {
    // Disk write throws a non-NotFound error (drive unplugged) → must NOT
    // silently serve the stale mirror.
    localStorage.setItem("inkwell-chapter-c1", "stale mirror");
    mem.bridge.readText = async () => {
      throw new Error("读取失败 (x): 拒绝访问 (os error 5)");
    };
    await expect(loadChapterContentFromLocal("c1", {})).rejects.toThrow(/拒绝访问/);
  });

  it("chapter reads serve the mirror when the file is NotFound", async () => {
    localStorage.setItem("inkwell-chapter-c1", "mirror copy");
    const content = await loadChapterContentFromLocal("c1", {});
    expect(content).toBe("mirror copy");
  });

  it("a mirror quota failure does not fail an otherwise-successful save", async () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      // The mirror write happens after the disk write — make only it throw.
      if (key.startsWith("inkwell-chapter-")) throw new DOMException("full", "QuotaExceededError");
      original.call(this, key, value);
    };
    try {
      await expect(saveChapterContentToLocal("c1", "content", {})).resolves.toBeUndefined();
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it("rejects ids that would traverse out of the content directory", () => {
    expect(() => assertSafeId("../../etc/passwd", "章节")).toThrow(/非法字符/);
    expect(() => assertSafeId("a/b", "章节")).toThrow(/非法字符/);
    expect(() => assertSafeId("ok-id_123".replace("_", "-"), "章节")).not.toThrow();
  });

  it("names project folders after the work with an id suffix", () => {
    expect(projectFolderName("我的小说", "p1")).toBe("我的小说-p1");
    // Path-hostile characters are sanitized, ids are validated.
    expect(projectFolderName('a<b>:"/\\|?*c', "p1")).toBe("a_b________c-p1");
    expect(() => projectFolderName("x", "../evil")).toThrow(/非法字符/);
    // A work literally named like a top-level dir must not collide with it.
    expect(projectFolderName("chapters", "p1")).toBe("work-chapters-p1");
  });

  it("writes project/chapter/notes/dict into one per-project folder", async () => {
    await saveProjectToLocal(project, [chapter], [volume], {});
    await saveChapterContentToLocal("c1", "chapter body", {});
    await saveNotesToLocal("p1", [{ id: "n1", title: "t", content: "c", updatedAt: 1 }], {});
    await saveDictToLocal("p1", [{ id: "d1", term: "x", aliases: [], category: "人物", content: "", updatedAt: 1 }], {});
    const keys = [...mem.files.keys()];
    const dir = keys.find((k) => k.endsWith("project.json"))!.replace(/project\.json$/, "");
    expect(dir).toContain("Test-p1");
    expect(keys.some((k) => k === `${dir}chapters/c1.md`)).toBe(true);
    expect(keys.some((k) => k === `${dir}notes.json`)).toBe(true);
    expect(keys.some((k) => k === `${dir}dict.json`)).toBe(true);
    // …and everything reads back from the same folder.
    expect((await loadProjectFromLocal("p1", {}))?.project.id).toBe("p1");
    expect(await loadChapterContentFromLocal("c1", {})).toBe("chapter body");
    expect((await loadNotesFromLocal("p1", {}))[0]?.id).toBe("n1");
    expect((await loadDictFromLocal("p1", {}))[0]?.id).toBe("d1");
  });

  it("reads legacy flat-layout files when the project folder does not exist yet", async () => {
    // Simulate a pre-restructure install: flat files, no project folder.
    mem.files.set("inkwell-app-data/projects/p1.json", JSON.stringify({ project, chapters: [chapter], volumes: [volume] }));
    mem.files.set("inkwell-app-data/chapters/c1.md", "legacy body");
    mem.files.set("inkwell-app-data/notes/p1.json", JSON.stringify([{ id: "n1", title: "t", content: "c", updatedAt: 1 }]));
    mem.files.set("inkwell-app-data/dictionary/p1.json", JSON.stringify([{ id: "d1", term: "x", aliases: [], category: "人物", content: "", updatedAt: 1 }]));
    const loaded = await loadProjectFromLocal("p1", {});
    expect(loaded?.project.id).toBe("p1");
    expect(await loadChapterContentFromLocal("c1", {})).toBe("legacy body");
    expect((await loadNotesFromLocal("p1", {}))[0]?.id).toBe("n1");
    expect((await loadDictFromLocal("p1", {}))[0]?.id).toBe("d1");
  });
});
