import { open } from "@tauri-apps/plugin-dialog";
import { cn } from "../../lib/utils";
import { revealInFolder, isTauri } from "../../lib/storage";

export function ThemeButton({
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
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors",
        active
          ? "border-accent bg-accent/10 text-accent dark:bg-accent/20"
          : "border-warm-gray text-ink hover:bg-warm-gray dark:border-warm-gray-dark dark:text-ink-dark dark:hover:bg-warm-gray-dark",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function SettingGroup({
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

export function RangeField({
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

export function PathField({
  label,
  value,
  onChange,
}: {
  label?: string;
  value?: string;
  onChange: (path: string) => void;
}) {
  const tauri = isTauri();
  const pick = async () => {
    try {
      const path = await open({ directory: true, defaultPath: value });
      if (typeof path === "string") onChange(path);
    } catch {
      // ignore
    }
  };
  const clear = () => onChange("");
  const openFolder = async () => {
    if (!value) return;
    const err = await revealInFolder(value);
    if (err) alert(`无法打开文件夹：${err}`);
  };
  return (
    <label className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between text-xs text-ink-muted dark:text-ink-muted-dark">
          <span>{label}</span>
          {value && (
            <button onClick={clear} className="text-accent hover:underline">
              重置
            </button>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={value || ""}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="使用默认位置"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-warm-gray bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark"
        />
        {value && tauri && (
          <button
            onClick={openFolder}
            className="shrink-0 rounded-md border border-warm-gray bg-paper px-3 py-2 text-sm text-ink hover:bg-warm-gray dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark dark:hover:bg-warm-gray-dark"
            title="在文件管理器中打开"
          >
            打开
          </button>
        )}
        {tauri && (
          <button
            onClick={pick}
            className="shrink-0 rounded-md border border-warm-gray bg-paper px-3 py-2 text-sm text-ink hover:bg-warm-gray dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark dark:hover:bg-warm-gray-dark"
          >
            选择
          </button>
        )}
      </div>
    </label>
  );
}

export function ShortcutItem({ label, shortcut }: { label: string; shortcut: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-warm-gray bg-paper px-3 py-2 dark:border-warm-gray-dark dark:bg-paper-dark">
      <span className="text-sm text-ink dark:text-ink-dark">{label}</span>
      <kbd className="rounded bg-warm-gray px-1.5 py-0.5 text-xs font-mono text-ink dark:bg-warm-gray-dark dark:text-ink-dark">
        {shortcut}
      </kbd>
    </div>
  );
}
