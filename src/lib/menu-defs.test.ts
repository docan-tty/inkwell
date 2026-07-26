import { describe, expect, it } from "vitest";
import { MENU_DEFS, type MenuItem } from "./menu-defs";
import { COMMANDS, isCommandEnabled, getCommandContext } from "./commands";
import { SHORTCUT_DEFS } from "./shortcuts";

function collectCommands(items: MenuItem[], out: string[] = []): string[] {
  for (const item of items) {
    if (item.kind === "command") out.push(item.command);
    if (item.kind === "submenu") collectCommands(item.items, out);
  }
  return out;
}

describe("menu ↔ command consistency", () => {
  it("every menu command id is registered", () => {
    const missing = collectCommands(MENU_DEFS.flatMap((m) => m.items)).filter((id) => !COMMANDS[id]);
    expect(missing).toEqual([]);
  });

  it("every command shortcutId resolves to a SHORTCUT_DEF", () => {
    const ids = new Set(SHORTCUT_DEFS.map((d) => d.id));
    const bad = Object.values(COMMANDS).filter((c) => c.shortcutId && !ids.has(c.shortcutId)).map((c) => c.id);
    expect(bad).toEqual([]);
  });
});

describe("command enabled guards", () => {
  it("disables project-scoped commands with no project open", () => {
    // getCommandContext reads the real store (empty in tests) — no project.
    const ctx = getCommandContext();
    expect(ctx.hasProject).toBe(false);
    expect(isCommandEnabled("save", ctx)).toBe(false);
    expect(isCommandEnabled("project.close", ctx)).toBe(false);
    expect(isCommandEnabled("tools.manuscript", ctx)).toBe(false);
    expect(isCommandEnabled("project.new", ctx)).toBe(true);
    expect(isCommandEnabled("settings.open", ctx)).toBe(true);
  });
});
