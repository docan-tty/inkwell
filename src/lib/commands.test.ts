// 菜单/命令完整性校验:menu-defs 里的每个 command 引用都存在于 COMMANDS,
// 每个 shortcutId 都存在于 SHORTCUT_DEFS;enabled 谓词在无作品/无章节时正确禁用。
import { describe, expect, it } from "vitest";
import { MENU_DEFS } from "./menu-defs";
import { COMMANDS, isCommandEnabled, type CommandContext } from "./commands";
import { SHORTCUT_DEFS } from "./shortcuts";

const NO_PROJECT: CommandContext = { hasProject: false, hasChapter: false, focusMode: false };
const NO_CHAPTER: CommandContext = { hasProject: true, hasChapter: false, focusMode: false };
const FULL: CommandContext = { hasProject: true, hasChapter: true, focusMode: false };

describe("menu definitions", () => {
  it("every command reference in the menus exists in COMMANDS", () => {
    const referenced = MENU_DEFS.flatMap((m) =>
      m.items.filter((i) => i.kind === "command").map((i) => (i as { command: string }).command),
    );
    expect(referenced.length).toBeGreaterThan(0);
    for (const id of referenced) {
      expect(COMMANDS[id], `menu references unknown command "${id}"`).toBeDefined();
    }
  });

  it("default shortcuts do not collide", () => {
    const seen = new Map<string, string>();
    for (const def of SHORTCUT_DEFS) {
      const normalized = def.defaultKeys.toLowerCase();
      const prev = seen.get(normalized);
      expect(prev, `${def.id} collides with ${prev} on ${def.defaultKeys}`).toBeUndefined();
      seen.set(normalized, def.id);
    }
  });
});

describe("command enabled guards", () => {
  it("project-scoped commands are disabled without an open project", () => {
    for (const id of ["save", "project.close", "project.edit", "project.delete", "newChapter", "search", "format.auto", "export.project-md"]) {
      expect(isCommandEnabled(id, NO_PROJECT), id).toBe(false);
    }
  });

  it("chapter-scoped commands are disabled without an open chapter", () => {
    for (const id of ["save", "format.auto", "export.chapter-md"]) {
      expect(isCommandEnabled(id, NO_CHAPTER), id).toBe(false);
    }
    // 项目级动作只要求有作品
    expect(isCommandEnabled("newChapter", NO_CHAPTER)).toBe(true);
    expect(isCommandEnabled("export.project-md", NO_CHAPTER)).toBe(true);
  });

  it("global commands are always enabled", () => {
    for (const id of ["project.open", "project.new", "settings.open", "tools.revealDir"]) {
      expect(isCommandEnabled(id, NO_PROJECT), id).toBe(true);
    }
  });

  it("chapter commands are enabled with project + chapter", () => {
    for (const id of ["save", "format.auto", "export.chapter-md", "search"]) {
      expect(isCommandEnabled(id, FULL), id).toBe(true);
    }
  });
});
