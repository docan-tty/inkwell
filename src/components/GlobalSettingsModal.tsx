import { X, Type, Target, Moon, Sun, Monitor, Layout, Palette, FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../store";
import type { EditorTypography } from "../types";

interface GlobalSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function GlobalSettingsModal({ open, onClose }: GlobalSettingsModalProps) {
  const { appSettings, updateAppSettings, setTheme } = useAppStore();

  if (!open) return null;

  const updateTypography = (patch: Partial<EditorTypography>) => {
    updateAppSettings({
      editorTypography: { ...appSettings.editorTypography, ...patch },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-lg border border-warm-gray bg-paper shadow-xl dark:border-warm-gray-dark dark:bg-paper-dark">
        <div className="flex h-12 items-center justify-between border-b border-warm-gray px-4 dark:border-warm-gray-dark">
          <h2 className="text-sm font-medium text-ink dark:text-ink-dark">全局设置</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted dark:text-ink-muted-dark hover:bg-warm-gray dark:hover:bg-warm-gray-dark"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-5">
            <SettingGroup icon={<Monitor size={16} />} title="外观">
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
            </SettingGroup>

            <SettingGroup icon={<Type size={16} />} title="字体排版">
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
            </SettingGroup>

            <SettingGroup icon={<Target size={16} />} title="新建章节">
              <label className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-muted-dark">
                  <span>默认章节目标字数</span>
                  <span>{appSettings.defaultChapterTargetWords.toLocaleString("zh-CN")} 字</span>
                </div>
                <input
                  type="number"
                  min={1}
                  step={100}
                  value={appSettings.defaultChapterTargetWords}
                  onChange={(e) => {
                    const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                    if (!Number.isNaN(n) && n > 0) {
                      updateAppSettings({ defaultChapterTargetWords: n });
                    }
                  }}
                  className="w-full rounded-md border border-warm-gray bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark"
                />
              </label>
            </SettingGroup>

            <SettingGroup icon={<Layout size={16} />} title="页面">
              <RangeField
                label="编辑区边距"
                value={appSettings.editorPadding}
                min={24}
                max={160}
                step={8}
                unit="px"
                onChange={(v) => updateAppSettings({ editorPadding: v })}
              />
            </SettingGroup>

            <SettingGroup icon={<Palette size={16} />} title="统计">
              <label className="flex items-center justify-between text-sm text-ink dark:text-ink-dark">
                <span>统计包含标点</span>
                <input
                  type="checkbox"
                  checked={appSettings.includePunctuationInWordCount}
                  onChange={(e) => updateAppSettings({ includePunctuationInWordCount: e.target.checked })}
                  className="h-4 w-4 accent-accent"
                />
              </label>
            </SettingGroup>

            <SettingGroup icon={<FolderOpen size={16} />} title="存储位置">
              <div className="space-y-5">
                <PathField
                  label="作品保存位置"
                  value={appSettings.projectSaveDirectory}
                  onChange={(path) => updateAppSettings({ projectSaveDirectory: path })}
                />
                <PathField
                  label="文件缓存位置"
                  value={appSettings.chapterCacheDirectory}
                  onChange={(path) => updateAppSettings({ chapterCacheDirectory: path })}
                />
              </div>
            </SettingGroup>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors ${
        active
          ? "border-accent bg-accent/10 text-accent dark:bg-accent/20"
          : "border-warm-gray text-ink hover:bg-warm-gray dark:border-warm-gray-dark dark:text-ink-dark dark:hover:bg-warm-gray-dark"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SettingGroup({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-ink dark:text-ink-dark">
        {icon}
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-muted-dark">
        <span>{label}</span>
        <span>
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-warm-gray accent-accent dark:bg-warm-gray-dark"
      />
    </div>
  );
}

function PathField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (path: string) => void;
}) {
  const pick = async () => {
    try {
      const path = await open({ directory: true, defaultPath: value });
      if (typeof path === "string") onChange(path);
    } catch {
      // ignore
    }
  };
  const clear = () => onChange("");
  return (
    <label className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-muted-dark">
        <span>{label}</span>
        {value && (
          <button onClick={clear} className="text-accent hover:underline">
            重置
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <input
          readOnly
          value={value || ""}
          placeholder="使用默认位置"
          className="min-w-0 flex-1 rounded-md border border-warm-gray bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark"
        />
        <button
          onClick={pick}
          className="shrink-0 rounded-md border border-warm-gray bg-paper px-3 py-2 text-sm text-ink hover:bg-warm-gray dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark dark:hover:bg-warm-gray-dark"
        >
          选择
        </button>
      </div>
    </label>
  );
}
