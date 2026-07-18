import { useEffect, useRef, useState } from "react";
import {
  X,
  Type,
  Target,
  Moon,
  Sun,
  Monitor,
  Palette,
  FolderOpen,
  Keyboard,
  Settings as SettingsIcon,
  ExternalLink,
  Pilcrow,
  AppWindow,
  FolderInput,
  BarChart3,
  SlidersHorizontal,
  Check,
} from "lucide-react";
import { useAppStore } from "../store";
import type { AppSettings, Chapter, EditorTypography } from "../types";
import { PathField, NumberField, ShortcutItem } from "./settings/widgets";
import { revealInFolder, copyDirRecursive, exists, join, isTauri, listFiles, registerContentRoot } from "../lib/storage";
import { ACCENT_ORDER, ACCENTS, PAPER_ORDER, PAPERS, THEME_PRESETS } from "../lib/theme";
import { UI_FONT_PRESETS } from "../lib/fonts";
import { modKey, isMac } from "../lib/platform";
import { SHORTCUT_DEFS, shortcutFor, displayKeys, keysFromEvent, parsedToString, normalizeKeys } from "../lib/shortcuts";
import { cn } from "../lib/utils";

interface GlobalSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type SectionKey = "appearance" | "typography" | "editor" | "writing" | "storage" | "shortcuts";

const SECTIONS: { key: SectionKey; label: string; icon: React.ReactNode }[] = [
  { key: "appearance", label: "外观", icon: <Palette size={14} /> },
  { key: "typography", label: "字体排版", icon: <Type size={14} /> },
  { key: "editor", label: "编辑器", icon: <SlidersHorizontal size={14} /> },
  { key: "writing", label: "章节与统计", icon: <Target size={14} /> },
  { key: "storage", label: "存储位置", icon: <FolderOpen size={14} /> },
  { key: "shortcuts", label: "快捷键", icon: <Keyboard size={14} /> },
];

export function GlobalSettingsModal({ open, onClose }: GlobalSettingsModalProps) {
  const appSettings = useAppStore((s) => s.appSettings);
  const updateAppSettings = useAppStore((s) => s.updateAppSettings);
  const setTheme = useAppStore((s) => s.setTheme);
  const loadProjects = useAppStore((s) => s.loadProjects);
  const currentProject = useAppStore((s) => s.currentProject);
  const currentChapter = useAppStore((s) => s.currentChapter);
  const [activeSection, setActiveSection] = useState<SectionKey>("appearance");
  // Resolved absolute path of the data folder, filled in once the modal is
  // opened. Lets us show the user where data actually lives on disk and give
  // a one-click "打开数据文件夹" action.
  const [resolvedAppDir, setResolvedAppDir] = useState<string>("");
  // Storage-migration state: after the user picks a new content location we
  // offer to copy the existing works over instead of stranding them.
  const [pendingMigration, setPendingMigration] = useState<{ from: string; to: string } | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<string | null>(null);
  // 快捷键录入态：正在等待按键的动作 id；按键校验失败（如缺修饰键）的提示。
  const [capturing, setCapturing] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const modifierKey = modKey();
  const redoShortcut = modifierKey === "⌘" ? "⌘+Shift+Z" : "Ctrl+Y";
  const mac = isMac();
  const shortcuts = appSettings.shortcuts;

  // Escape closes the modal — but NOT while a shortcut is being captured:
  // there Esc means "cancel recording". Both listeners sit on window in the
  // capture phase, so stopPropagation alone can't keep the other one from
  // firing; the capture handler owns the Esc while recording.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (capturing) return;
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, capturing]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { getAppDataDir } = await import("../lib/storage");
      const appDir = await getAppDataDir();
      if (cancelled) return;
      setResolvedAppDir(appDir);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // 快捷键录入：等待按键期间捕获下一次组合键。Esc 取消；缺少修饰键的组合
  // （会与正常打字冲突）拒绝录入并提示。相同按键被多个动作占用时以后录的
  // 为准——清除其它动作的同名覆盖，界面冲突徽章即消失。
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(null);
        setCaptureError(null);
        return;
      }
      const parsed = keysFromEvent(e);
      if (!parsed) return; // 只按了修饰键，继续等
      const def = SHORTCUT_DEFS.find((d) => d.id === capturing);
      if (!def) return;
      if (def.requireModifier && !parsed.ctrl && !parsed.meta && !parsed.alt) {
        setCaptureError("该快捷键需要包含 Ctrl / ⌘ 或 Alt，避免与正常输入冲突");
        return;
      }
      const keys = parsedToString(parsed);
      const next = { ...(useAppStore.getState().appSettings.shortcuts || {}) };
      for (const other of SHORTCUT_DEFS) {
        if (other.id !== capturing && normalizeKeys(next[other.id] ?? "")?.key &&
            parsedToString(normalizeKeys(next[other.id])!) === keys) {
          delete next[other.id];
        }
      }
      // 与默认值一致时落默认值（保持覆盖表干净）。
      if (keys === def.defaultKeys) delete next[capturing];
      else next[capturing] = keys;
      updateAppSettings({ shortcuts: next });
      setCapturing(null);
      setCaptureError(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, updateAppSettings]);

  const resetShortcut = (id: string) => {
    const next = { ...(shortcuts || {}) };
    delete next[id];
    updateAppSettings({ shortcuts: next });
  };

  const resetAllShortcuts = () => {
    updateAppSettings({ shortcuts: {} });
    setCapturing(null);
    setCaptureError(null);
  };

  // 冲突检测：两个动作归一化后的按键串相同即视为冲突（展示红色提示）。
  const conflictOf = (id: string): string | undefined => {
    const mine = shortcutFor(id, shortcuts);
    const mineNorm = normalizeKeys(mine);
    if (!mineNorm) return undefined;
    const mineStr = parsedToString(mineNorm);
    const other = SHORTCUT_DEFS.find(
      (d) => d.id !== id && parsedToString(normalizeKeys(shortcutFor(d.id, shortcuts))!) === mineStr,
    );
    return other?.label;
  };

  if (!open) return null;

  const updateTypography = (patch: Partial<EditorTypography>) => {
    updateAppSettings({
      editorTypography: { ...appSettings.editorTypography, ...patch },
    });
  };

  const openDataFolder = async () => {
    if (!resolvedAppDir) return;
    const err = await revealInFolder(resolvedAppDir);
    if (err) alert(`无法打开文件夹：${err}`);
  };

  // The content location changed: apply the setting, then offer to migrate
  // existing content from the previous location so old works don't vanish.
  // A bare reset ("") means "back to the data folder" and is instantaneous —
  // the data folder always remains readable, so no migration is offered.
  const handleContentDirChange = (path: string) => {
    const from = appSettings.projectSaveDirectory || resolvedAppDir;
    updateAppSettings({ projectSaveDirectory: path });
    // Register the new location with the Rust-side path whitelist so file
    // I/O is authorized there immediately (no restart needed).
    registerContentRoot(path || resolvedAppDir);
    setMigrationResult(null);
    const to = path || resolvedAppDir;
    if (path && from && to && from !== to) {
      setPendingMigration({ from, to });
    } else {
      setPendingMigration(null);
    }
  };

  const runMigration = async () => {
    if (!pendingMigration || migrating) return;
    setMigrating(true);
    setMigrationResult(null);
    try {
      let copied = 0;
      // Copy the whole content root: per-project folders ({作品名}-{id}/)
      // plus any legacy flat directories (projects/, chapters/, notes/,
      // dictionary/) that haven't been migrated yet.
      const entries = new Set(["projects", "chapters", "notes", "dictionary"]);
      try {
        for (const name of await listFiles(pendingMigration.from)) entries.add(name);
      } catch {
        // listFiles failing must not block copying the known directories
      }
      for (const sub of entries) {
        const srcDir = await join(pendingMigration.from, sub);
        if (await exists(srcDir)) {
          copied += await copyDirRecursive(srcDir, await join(pendingMigration.to, sub));
        }
      }
      setMigrationResult(`迁移完成，共复制 ${copied} 个文件。原位置文件未删除，确认无误后可手动清理。`);
      setPendingMigration(null);
      // Reload the registry view in case projects appeared at the new location.
      await loadProjects();
    } catch (err) {
      setMigrationResult(`迁移失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-[inkwell-fade-in_0.15s_ease-out]">
      <div className="flex h-[560px] max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-warm-gray bg-paper shadow-xl dark:border-warm-gray-dark dark:bg-paper-dark animate-[inkwell-pop-in_0.15s_ease-out]">
        {/* Header */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-warm-gray px-4 dark:border-warm-gray-dark">
          <div className="flex items-center gap-2">
            <SettingsIcon size={16} className="text-accent" />
            <span className="text-sm font-medium text-ink dark:text-ink-dark">全局设置</span>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* 左侧分类导航 */}
          <nav className="flex w-40 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-warm-gray p-2 dark:border-warm-gray-dark">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  activeSection === s.key
                    ? "bg-accent/10 font-medium text-accent dark:bg-accent/20"
                    : "text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark",
                )}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </nav>

          {/* 右侧内容 */}
          <div className="min-w-0 flex-1 overflow-y-auto p-5">
            {activeSection === "appearance" && (
              <div className="space-y-4">
                <Group title="主题预设">
                  <div className="grid grid-cols-3 gap-2">
                    {THEME_PRESETS.map((preset) => {
                      const active =
                        (appSettings.themeColor || "brown") === preset.accent &&
                        (appSettings.paperTexture || "plain") === preset.paper;
                      return (
                        <button
                          key={preset.id}
                          onClick={() =>
                            updateAppSettings({ themeColor: preset.accent, paperTexture: preset.paper })
                          }
                          className={cn(
                            "flex flex-col overflow-hidden rounded-lg border text-left transition-all",
                            active
                              ? "border-accent ring-1 ring-accent/40"
                              : "border-warm-gray hover:border-accent/50 dark:border-warm-gray-dark",
                          )}
                        >
                          {/* 预览条：纸张底色 + accent 标题/正文示意 */}
                          <div
                            className="flex h-12 flex-col justify-center gap-1 px-2.5"
                            style={{ backgroundColor: preset.preview }}
                          >
                            <span
                              className="h-1.5 w-2/5 rounded-full"
                              style={{ backgroundColor: ACCENTS[preset.accent].light }}
                            />
                            <span className="h-1 w-3/4 rounded-full bg-black/15" />
                            <span className="h-1 w-3/5 rounded-full bg-black/10" />
                          </div>
                          <div className="flex w-full items-center justify-between px-2.5 py-1.5">
                            <span className="text-xs font-medium text-ink dark:text-ink-dark">
                              {preset.label}
                            </span>
                            {active && <Check size={12} className="shrink-0 text-accent" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Group>

                <Group title="主题模式">
                  <SegmentedControl
                    options={[
                      { value: "light", label: "浅色", icon: <Sun size={13} /> },
                      { value: "dark", label: "深色", icon: <Moon size={13} /> },
                      { value: "system", label: "跟随系统", icon: <Monitor size={13} /> },
                    ]}
                    value={appSettings.theme}
                    onChange={(v) => setTheme(v as "light" | "dark" | "system")}
                  />
                </Group>

                <Group title="主题色">
                  <div className="flex flex-wrap gap-2">
                    {ACCENT_ORDER.map((key) => {
                      const a = ACCENTS[key];
                      const active = (appSettings.themeColor || "brown") === key;
                      return (
                        <button
                          key={key}
                          onClick={() => updateAppSettings({ themeColor: key })}
                          title={a.label}
                          className={cn(
                            "flex items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-2.5 text-xs transition-all",
                            active
                              ? "border-accent bg-accent/10 text-ink dark:text-ink-dark"
                              : "border-warm-gray text-ink-muted hover:border-accent/50 dark:border-warm-gray-dark dark:text-ink-muted-dark",
                          )}
                        >
                          <span
                            className="h-4 w-4 rounded-full border border-black/10"
                            style={{ backgroundColor: a.swatch }}
                          />
                          {a.label}
                          {active && <Check size={12} className="text-accent" />}
                        </button>
                      );
                    })}
                  </div>
                </Group>

                <Group title="纸张质感" hint="浅色模式生效">
                  <div className="flex flex-wrap gap-2">
                    {PAPER_ORDER.map((key) => {
                      const p = PAPERS[key];
                      const active = (appSettings.paperTexture || "plain") === key;
                      return (
                        <button
                          key={key}
                          onClick={() => updateAppSettings({ paperTexture: key })}
                          className={cn(
                            "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-all",
                            active
                              ? "border-accent bg-accent/10"
                              : "border-warm-gray hover:border-accent/50 dark:border-warm-gray-dark",
                          )}
                        >
                          <span className="flex items-center gap-1.5 text-xs font-medium text-ink dark:text-ink-dark">
                            <span
                              className="h-3.5 w-3.5 rounded-sm border border-black/10"
                              style={{ backgroundColor: p.base.paper }}
                            />
                            {p.label}
                            {active && <Check size={12} className="text-accent" />}
                          </span>
                          <span className="text-[10px] text-ink-muted dark:text-ink-muted-dark">{p.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                </Group>
              </div>
            )}

            {activeSection === "typography" && (
              <div className="space-y-4">
                <Group title="编辑区字体" hint="正文与标题">
                  <FontPicker
                    value={appSettings.editorFontFamily}
                    onChange={(v) => updateAppSettings({ editorFontFamily: v })}
                  />
                </Group>
                <Group title="界面字体" hint="侧栏、按钮、菜单">
                  <FontPicker
                    value={appSettings.uiFontFamily}
                    onChange={(v) => updateAppSettings({ uiFontFamily: v })}
                  />
                </Group>
                <div className="border-t border-warm-gray/60 pt-4 dark:border-warm-gray-dark/60">
                  <div className="space-y-3">
                    <NumberField
                      label="字号"
                      value={appSettings.editorTypography.fontSize}
                      min={12}
                      max={32}
                      unit="px"
                      onChange={(v) => updateTypography({ fontSize: v })}
                    />
                    <NumberField
                      label="行高"
                      value={appSettings.editorTypography.lineHeight}
                      min={1.2}
                      max={2.5}
                      step={0.05}
                      onChange={(v) => updateTypography({ lineHeight: v })}
                    />
                    <NumberField
                      label="段间距"
                      value={appSettings.editorTypography.paragraphSpacing}
                      min={0}
                      max={2}
                      step={0.1}
                      unit="em"
                      onChange={(v) => updateTypography({ paragraphSpacing: v })}
                    />
                    <label className="flex items-center justify-between text-sm text-ink dark:text-ink-dark">
                      <span className="flex items-center gap-1.5">
                        <Pilcrow size={14} className="text-ink-muted dark:text-ink-muted-dark" />
                        段落首行缩进（两字符）
                      </span>
                      <input
                        type="checkbox"
                        checked={appSettings.firstLineIndent !== false}
                        onChange={(e) => updateAppSettings({ firstLineIndent: e.target.checked })}
                        className="h-4 w-4 accent-accent"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "editor" && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <NumberField
                    label="编辑区宽度"
                    value={appSettings.editorMaxWidth || 880}
                    min={560}
                    max={1280}
                    step={40}
                    unit="px"
                    onChange={(v) => updateAppSettings({ editorMaxWidth: v })}
                  />
                  <NumberField
                    label="编辑区边距"
                    value={appSettings.editorPadding}
                    min={24}
                    max={160}
                    step={8}
                    unit="px"
                    onChange={(v) => updateAppSettings({ editorPadding: v })}
                  />
                  <p className="text-xs leading-relaxed text-ink-muted dark:text-ink-muted-dark">
                    宽度随窗口自适应收缩，不会超过此处设置的最大值；边距是正文与编辑区两侧的空隙。
                  </p>
                </div>
                <div className="border-t border-warm-gray/60 pt-4 dark:border-warm-gray-dark/60">
                  <div className="mb-2.5 text-xs font-medium text-ink-muted dark:text-ink-muted-dark">
                    自动整理格式规则
                  </div>
                  <div className="space-y-2.5">
                    {(
                      [
                        { key: "removeEmptyLines", label: "清除段落之间的空行" },
                        { key: "collapseInlineWhitespace", label: "清除行内多余空白" },
                        { key: "punctuationToFullWidth", label: "英文标点转全角" },
                        { key: "normalizeQuotes", label: "双引号归一为「“”」" },
                      ] as const
                    ).map(({ key, label }) => (
                      <label
                        key={key}
                        className="flex items-center justify-between text-sm text-ink dark:text-ink-dark"
                      >
                        <span>{label}</span>
                        <input
                          type="checkbox"
                          checked={appSettings.formatOptions?.[key] !== false}
                          onChange={(e) =>
                            updateAppSettings({
                              formatOptions: { ...appSettings.formatOptions, [key]: e.target.checked },
                            })
                          }
                          className="h-4 w-4 accent-accent"
                        />
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-ink-muted dark:text-ink-muted-dark">
                    顶栏「自动整理格式」按钮按上述规则处理当前章节；带加粗/斜体等行内格式的段落跳过以保证无损。
                  </p>
                </div>
              </div>
            )}

            {activeSection === "writing" && (
              <div className="space-y-4">
                <ChapterTargetField
                  appSettings={appSettings}
                  updateAppSettings={updateAppSettings}
                  currentChapter={currentProject ? currentChapter : null}
                />
                <label className="flex items-center justify-between text-sm text-ink dark:text-ink-dark">
                  <span className="flex items-center gap-1.5">
                    <BarChart3 size={14} className="text-ink-muted dark:text-ink-muted-dark" />
                    字数统计包含标点
                  </span>
                  <input
                    type="checkbox"
                    checked={appSettings.includePunctuationInWordCount}
                    onChange={(e) =>
                      updateAppSettings({ includePunctuationInWordCount: e.target.checked })
                    }
                    className="h-4 w-4 accent-accent"
                  />
                </label>
              </div>
            )}

            {activeSection === "storage" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warm-gray bg-warm-gray/30 px-3 py-2 text-xs dark:border-warm-gray-dark dark:bg-warm-gray-dark/20">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink dark:text-ink-dark">数据文件夹</div>
                    <div
                      className="mt-0.5 truncate text-ink-muted dark:text-ink-muted-dark"
                      title={resolvedAppDir}
                    >
                      {resolvedAppDir || "加载中…"}
                    </div>
                    <div className="mt-0.5 text-[10px] text-ink-muted dark:text-ink-muted-dark">
                      应用数据：设置与作品索引
                    </div>
                  </div>
                  <button
                    onClick={openDataFolder}
                    disabled={!resolvedAppDir}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-warm-gray bg-paper px-2.5 py-1 text-xs text-ink transition-colors hover:bg-warm-gray disabled:opacity-50 dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark dark:hover:bg-warm-gray-dark"
                  >
                    <ExternalLink size={12} />
                    打开
                  </button>
                </div>

                <p className="text-xs leading-relaxed text-ink-muted dark:text-ink-muted-dark">
                  切换章节或关闭窗口时，此处保存项目元数据（作品索引）。章节正文（自动保存每 3 秒，另有草稿缓冲防意外丢失）写入下方「作品内容位置」。
                </p>

                {/* 单一自定义字段：项目文件 + 章节内容共用同一个基址。
                    直接展示，不折叠——之前藏在 <details> 里导致用户以为不可设置。 */}
                <div className="space-y-3 rounded-lg border border-warm-gray px-3 py-3 dark:border-warm-gray-dark">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-ink dark:text-ink-dark">作品内容位置</span>
                    <span className="text-[10px] text-accent">
                      {appSettings.projectSaveDirectory ? "已自定义" : "默认使用数据文件夹"}
                    </span>
                  </div>
                  <PathField
                    value={appSettings.projectSaveDirectory}
                    onChange={handleContentDirChange}
                  />
                  <p className="text-xs leading-relaxed text-ink-muted dark:text-ink-muted-dark">
                    作品文件（<code className="font-mono">projects/&lt;id&gt;.json</code>）
                    与章节正文（<code className="font-mono">chapters/&lt;id&gt;.md</code>）均保存在此目录下。
                    {!isTauri() && (
                      <span className="mt-1 block text-ink-muted/70 dark:text-ink-muted-dark/70">
                        浏览器预览模式下「选择」「打开」不可用，可直接粘贴路径。
                      </span>
                    )}
                  </p>

                  {pendingMigration && (
                    <div className="rounded-lg border border-accent/40 bg-accent/5 px-3 py-2.5 text-xs dark:bg-accent/10">
                      <div className="flex items-center gap-1.5 font-medium text-ink dark:text-ink-dark">
                        <FolderInput size={13} className="text-accent" />
                        是否迁移现有作品内容？
                      </div>
                      <p className="mt-1 leading-relaxed text-ink-muted dark:text-ink-muted-dark">
                        检测到旧位置已有作品内容。迁移会将 projects/ 与 chapters/ 复制到新位置（不删除旧文件）。
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={runMigration}
                          disabled={migrating || !isTauri()}
                          className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-light disabled:opacity-50"
                        >
                          {migrating ? "迁移中…" : "立即迁移"}
                        </button>
                        <button
                          onClick={() => setPendingMigration(null)}
                          className="rounded-md px-2.5 py-1 text-xs text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
                        >
                          不迁移
                        </button>
                      </div>
                    </div>
                  )}
                  {migrationResult && (
                    <p className="rounded-lg bg-warm-gray/50 px-3 py-2 text-xs leading-relaxed text-ink-muted dark:bg-warm-gray-dark/30 dark:text-ink-muted-dark">
                      {migrationResult}
                    </p>
                  )}
                </div>
              </div>
            )}

            {activeSection === "shortcuts" && (
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-ink-muted dark:text-ink-muted-dark">
                      <Type size={12} />
                      编辑器内（由编辑器接管，不可自定义）
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <ShortcutItem label="加粗" shortcut={`${modifierKey}+B`} />
                    <ShortcutItem label="斜体" shortcut={`${modifierKey}+I`} />
                    <ShortcutItem label="标题 1" shortcut={`${modifierKey}+Alt+1`} />
                    <ShortcutItem label="标题 2" shortcut={`${modifierKey}+Alt+2`} />
                    <ShortcutItem label="标题 3" shortcut={`${modifierKey}+Alt+3`} />
                    <ShortcutItem label="撤销" shortcut={`${modifierKey}+Z`} />
                    <ShortcutItem label="重做" shortcut={redoShortcut} />
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-ink-muted dark:text-ink-muted-dark">
                      <AppWindow size={12} />
                      应用（点击「修改」后按下新组合键）
                    </div>
                    <button
                      onClick={resetAllShortcuts}
                      className="rounded px-1.5 py-0.5 text-[11px] text-ink-muted transition-colors hover:bg-warm-gray hover:text-ink dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark dark:hover:text-ink-dark"
                    >
                      全部恢复默认
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {SHORTCUT_DEFS.map((def) => (
                      <ShortcutItem
                        key={def.id}
                        label={def.label}
                        shortcut={displayKeys(shortcutFor(def.id, shortcuts), mac)}
                        customizable
                        capturing={capturing === def.id}
                        conflict={conflictOf(def.id)}
                        onCaptureStart={() => {
                          setCapturing(capturing === def.id ? null : def.id);
                          setCaptureError(null);
                        }}
                        onReset={shortcuts?.[def.id] ? () => resetShortcut(def.id) : undefined}
                      />
                    ))}
                    <ShortcutItem label="窗口全屏" shortcut="F11" />
                    <ShortcutItem label="退出专注模式" shortcut="Esc" />
                  </div>
                  {captureError && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">{captureError}</p>
                  )}
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-muted/80 dark:text-ink-muted-dark/80">
                    自定义快捷键需包含 Ctrl / ⌘ 或 Alt；与其它动作重复时会自动解除另一方的自定义。
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 默认章节目标字数：数值输入。输入即时改本地预览（编辑器状态栏即时跟随），
// 停顿 400ms 后才真正写入设置并同步所有「跟随默认」的章节——连续修改时不会
// 一路触发写入与章节同步。
function ChapterTargetField({
  appSettings,
  updateAppSettings,
  currentChapter,
}: {
  appSettings: AppSettings;
  updateAppSettings: (s: Partial<AppSettings>) => void;
  currentChapter: Chapter | null;
}) {
  const { applyChapterTargetWords } = useAppStore.getState();
  const saved = appSettings.defaultChapterTargetWords;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const commit = (v: number) => {
    // previousDefault 必须是「本次输入开始前的旧默认值」，而不是当前章节
    // 的 targetWords——预览阶段可能已经把 currentChapter.targetWords 改掉。
    updateAppSettings({ defaultChapterTargetWords: v });
    applyChapterTargetWords(v, saved);
  };

  const onInput = (v: number) => {
    // 预览只动当前章节（且它正跟随默认时），状态栏立刻反映新目标。
    // 跟随默认的章节统一存 0，不写成具体数值——以后默认值再变也能跟走。
    if (currentChapter && (!currentChapter.targetWords || currentChapter.targetWords === saved)) {
      useAppStore.setState({ currentChapter: { ...currentChapter, targetWords: 0 } });
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(v), 400);
  };

  return (
    <NumberField
      label="默认章节目标字数"
      hint="新章节默认采用"
      value={saved}
      min={2000}
      max={20000}
      step={500}
      unit="字"
      onChange={onInput}
    />
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5 rounded-lg border border-warm-gray/70 px-3.5 py-3 dark:border-warm-gray-dark/70">
      <div className="text-xs font-medium text-ink-muted dark:text-ink-muted-dark">
        {title}
        {hint && <span className="ml-2 font-normal text-ink-muted/60">（{hint}）</span>}
      </div>
      {children}
    </section>
  );
}

// 分段选择器：比一排独立按钮更紧凑，选项间共享边框。
function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: React.ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-warm-gray dark:border-warm-gray-dark">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors first:rounded-l-[7px] last:rounded-r-[7px]",
            value === opt.value
              ? "bg-accent/10 font-medium text-accent dark:bg-accent/20"
              : "text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark",
          )}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// 字体选择卡片：每个预设渲染自身字体样字，所见即所得。
// value 为 undefined 时「默认」高亮（即「思源宋体」预设，与 App.css 回落栈一致）。
function FontPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (fontFamily: string) => void;
}) {
  const active = value ?? UI_FONT_PRESETS[0].value;
  return (
    <div className="grid grid-cols-3 gap-2">
      {UI_FONT_PRESETS.map((preset) => {
        const selected = active === preset.value;
        return (
          <button
            key={preset.id}
            onClick={() => onChange(preset.value)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 transition-all",
              selected
                ? "border-accent bg-accent/10 dark:bg-accent/20"
                : "border-warm-gray hover:border-accent/50 dark:border-warm-gray-dark",
            )}
          >
            <span
              className="text-base leading-tight text-ink dark:text-ink-dark"
              style={{ fontFamily: preset.value }}
            >
              {preset.preview}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-ink-muted dark:text-ink-muted-dark">
              {preset.label}
              {selected && <Check size={10} className="text-accent" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
