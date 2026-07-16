import { useEffect, useState } from "react";
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
import type { EditorTypography } from "../types";
import { ThemeButton, RangeField, PathField, ShortcutItem } from "./settings/widgets";
import { revealInFolder, copyDirRecursive, exists, join, isTauri } from "../lib/storage";
import { ACCENT_ORDER, ACCENTS, PAPER_ORDER, PAPERS } from "../lib/theme";
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
  const { appSettings, updateAppSettings, setTheme, loadProjects } = useAppStore();
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
  const modifierKey = navigator.platform.includes("Mac") ? "⌘" : "Ctrl";
  const redoShortcut = navigator.platform.includes("Mac") ? "⌘+Shift+Z" : "Ctrl+Y";

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
      for (const sub of ["projects", "chapters"]) {
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
              <div className="space-y-6">
                <Group title="主题模式">
                  <div className="flex gap-2">
                    <ThemeButton
                      active={appSettings.theme === "light"}
                      onClick={() => setTheme("light")}
                      icon={<Sun size={14} />}
                      label="浅色"
                    />
                    <ThemeButton
                      active={appSettings.theme === "dark"}
                      onClick={() => setTheme("dark")}
                      icon={<Moon size={14} />}
                      label="深色"
                    />
                    <ThemeButton
                      active={appSettings.theme === "system"}
                      onClick={() => setTheme("system")}
                      icon={<Monitor size={14} />}
                      label="跟随系统"
                    />
                  </div>
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
              <div className="space-y-5">
                <RangeField
                  label="字号"
                  value={appSettings.editorTypography.fontSize}
                  min={12}
                  max={32}
                  unit="px"
                  onChange={(v) => updateTypography({ fontSize: v })}
                />
                <RangeField
                  label="行高"
                  value={appSettings.editorTypography.lineHeight}
                  min={1.2}
                  max={2.5}
                  step={0.05}
                  onChange={(v) => updateTypography({ lineHeight: v })}
                />
                <RangeField
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
            )}

            {activeSection === "editor" && (
              <div className="space-y-5">
                <RangeField
                  label="编辑区宽度"
                  value={appSettings.editorMaxWidth || 880}
                  min={560}
                  max={1280}
                  step={40}
                  unit="px"
                  onChange={(v) => updateAppSettings({ editorMaxWidth: v })}
                />
                <RangeField
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
            )}

            {activeSection === "writing" && (
              <div className="space-y-5">
                <label className="block space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-muted-dark">
                    <span>默认章节目标字数</span>
                    <span className="text-ink dark:text-ink-dark">
                      {appSettings.defaultChapterTargetWords.toLocaleString("zh-CN")}
                    </span>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={1000000}
                    step={100}
                    value={appSettings.defaultChapterTargetWords}
                    onChange={(e) => {
                      const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                      if (!Number.isNaN(n) && n > 0 && n <= 1000000) {
                        updateAppSettings({ defaultChapterTargetWords: n });
                      }
                    }}
                    className="w-full rounded-lg border border-warm-gray bg-paper px-3 py-1.5 text-sm text-ink outline-none transition-colors focus:border-accent dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark"
                  />
                </label>
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

                {/* 单一自定义字段：项目文件 + 章节内容共用同一个基址 */}
                {(() => {
                  const hasCustom = !!appSettings.projectSaveDirectory;
                  return (
                    <details
                      className="rounded-lg border border-warm-gray dark:border-warm-gray-dark"
                      open={hasCustom}
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs text-ink-muted transition-colors hover:bg-warm-gray/40 dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark/40">
                        <span>作品内容位置（可选）</span>
                        <span className="text-[10px] text-accent">
                          {hasCustom ? "已自定义" : "默认使用数据文件夹"}
                        </span>
                      </summary>
                      <div className="space-y-3 border-t border-warm-gray px-3 py-3 dark:border-warm-gray-dark">
                        <PathField
                          label="作品内容位置"
                          value={appSettings.projectSaveDirectory}
                          onChange={handleContentDirChange}
                        />
                        <p className="text-xs leading-relaxed text-ink-muted dark:text-ink-muted-dark">
                          作品文件（<code className="font-mono">projects/&lt;id&gt;.json</code>）
                          与章节正文（<code className="font-mono">chapters/&lt;id&gt;.md</code>）均保存在此目录下。
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
                    </details>
                  );
                })()}
              </div>
            )}

            {activeSection === "shortcuts" && (
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-muted dark:text-ink-muted-dark">
                    <Type size={12} />
                    编辑器内
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
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-muted dark:text-ink-muted-dark">
                    <AppWindow size={12} />
                    应用
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <ShortcutItem label="保存" shortcut={`${modifierKey}+S`} />
                    <ShortcutItem label="新建章节" shortcut={`${modifierKey}+N`} />
                    <ShortcutItem label="全书搜索" shortcut={`${modifierKey}+Shift+F`} />
                    <ShortcutItem label="目录侧栏" shortcut={`${modifierKey}+B`} />
                    <ShortcutItem label="大纲面板" shortcut={`${modifierKey}+Alt+O`} />
                    <ShortcutItem label="专注模式" shortcut={`${modifierKey}+Shift+D`} />
                    <ShortcutItem label="编辑区全屏" shortcut="工具栏按钮 / Esc" />
                    <ShortcutItem label="窗口全屏" shortcut="F11" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
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
    <div className="space-y-2.5">
      <div className="text-xs font-medium text-ink-muted dark:text-ink-muted-dark">
        {title}
        {hint && <span className="ml-2 font-normal text-ink-muted/60">（{hint}）</span>}
      </div>
      {children}
    </div>
  );
}
