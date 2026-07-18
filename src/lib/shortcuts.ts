/*
 * 可自定义的应用级快捷键
 * ----------------------
 * AppSettings.shortcuts 保存「动作 → 按键」的覆盖表；缺项回落到下表的
 * 默认值。编辑器内快捷键（加粗/斜体/标题/撤销重做）由 TipTap 处理，
 * 不在自定义范围内。
 *
 * 按键串规范：`Ctrl+Shift+F`（mac 上 Ctrl 即 ⌘），修饰键序固定为
 * Ctrl / Alt / Shift / Meta 前缀 + 主键。主键为单字符时统一小写存储。
 */

export interface ShortcutDef {
  /** 动作 id，即 AppSettings.shortcuts 的键。 */
  id: string;
  label: string;
  /** 默认按键（未自定义时生效）。 */
  defaultKeys: string;
  /** 该动作是否禁止在输入框/编辑区内触发（焦点在输入框时不响应）。 */
  blockedInEditable?: boolean;
  /** 可改键，但要求必须带修饰键（避免与正常打字冲突）。 */
  requireModifier?: boolean;
}

export const SHORTCUT_DEFS: ShortcutDef[] = [
  { id: "save", label: "保存", defaultKeys: "Ctrl+S", requireModifier: true },
  { id: "newChapter", label: "新建章节", defaultKeys: "Ctrl+N", blockedInEditable: true, requireModifier: true },
  { id: "search", label: "全书搜索", defaultKeys: "Ctrl+Shift+F", requireModifier: true },
  { id: "toggleLeftSidebar", label: "目录侧栏", defaultKeys: "Ctrl+B", blockedInEditable: true, requireModifier: true },
  { id: "toggleRightSidebar", label: "大纲面板", defaultKeys: "Ctrl+Alt+O", blockedInEditable: true, requireModifier: true },
  { id: "focusMode", label: "专注模式", defaultKeys: "Ctrl+Shift+D", blockedInEditable: true, requireModifier: true },
];

/** 解析后的按键：主键 + 各修饰键要求。 */
export interface ParsedKeys {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

/** 规范化按键串：分隔修饰键与主键，大小写与顺序归一。 */
export function normalizeKeys(raw: string): ParsedKeys | null {
  const parts = raw.split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const parsed: ParsedKeys = { key: "", ctrl: false, alt: false, shift: false, meta: false };
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "ctrl" || lower === "control") parsed.ctrl = true;
    else if (lower === "alt" || lower === "option") parsed.alt = true;
    else if (lower === "shift") parsed.shift = true;
    else if (lower === "meta" || lower === "cmd" || lower === "command" || lower === "⌘") parsed.meta = true;
    else if (!parsed.key) parsed.key = lower;
    else return null; // 多个主键——非法
  }
  return parsed.key ? parsed : null;
}

/** 键盘事件 → 规范化按键结构（用于「按下以设置」的录入）。 */
export function keysFromEvent(e: KeyboardEvent): ParsedKeys | null {
  const key = e.key.toLowerCase();
  if (key === "control" || key === "alt" || key === "shift" || key === "meta") return null;
  return {
    key,
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    meta: e.metaKey,
  };
}

export function parsedToString(p: ParsedKeys): string {
  const mods: string[] = [];
  if (p.ctrl) mods.push("Ctrl");
  if (p.alt) mods.push("Alt");
  if (p.shift) mods.push("Shift");
  if (p.meta) mods.push("Meta");
  const main = p.key.length === 1 ? p.key.toUpperCase() : p.key;
  return [...mods, main].join("+");
}

/** 事件是否命中按键串（Ctrl 与 Meta 互通——mac 的 ⌘ 对应 Win 的 Ctrl）。 */
export function matchesKeys(e: KeyboardEvent, raw: string): boolean {
  const p = normalizeKeys(raw);
  if (!p) return false;
  if (e.key.toLowerCase() !== p.key) return false;
  // Ctrl/Meta 视为同一修饰位：任一侧勾选即要求 e.ctrlKey || e.metaKey。
  const wantMod = p.ctrl || p.meta;
  const hasMod = e.ctrlKey || e.metaKey;
  if (wantMod !== hasMod) return false;
  if (p.alt !== e.altKey) return false;
  if (p.shift !== e.shiftKey) return false;
  return true;
}

/** 动作当前生效的按键串（自定义覆盖 → 默认）。 */
export function shortcutFor(
  id: string,
  overrides: Record<string, string> | undefined,
): string {
  const def = SHORTCUT_DEFS.find((d) => d.id === id);
  if (!def) return "";
  const custom = overrides?.[id];
  return custom && normalizeKeys(custom) ? custom : def.defaultKeys;
}

/** 展示用按键串：mac 上 Ctrl 显示为 ⌘，主键单字符大写。 */
export function displayKeys(raw: string, isMac: boolean): string {
  const p = normalizeKeys(raw);
  if (!p) return raw;
  const mods: string[] = [];
  if (p.ctrl || p.meta) mods.push(isMac ? "⌘" : "Ctrl");
  if (p.alt) mods.push(isMac ? "⌥" : "Alt");
  if (p.shift) mods.push(isMac ? "⇧" : "Shift");
  const main = p.key.length === 1 ? p.key.toUpperCase() : p.key;
  return [...mods, main].join("+");
}
