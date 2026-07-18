import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
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

// 数值输入框：替代滑杆的精确填值方式。本地草稿态允许中间输入（空串、
// 小数点），失焦或回车时按 min/max 收敛提交；外部值变化时回填。
// step 为小数时保留对应精度（如 0.05 → 两位小数）。
export function NumberField({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const decimals = (String(step).split(".")[1] || "").length;
  const format = (v: number) => (decimals > 0 ? v.toFixed(decimals) : String(Math.round(v)));

  const [draft, setDraft] = useState(() => format(value));
  const [focused, setFocused] = useState(false);

  // 未聚焦时跟随外部值（设置可能在别处被改）；聚焦编辑期间以本地草稿为准。
  useEffect(() => {
    if (!focused) setDraft(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);

  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  const commit = () => {
    const parsed = parseFloat(draft);
    const next = Number.isFinite(parsed) ? clamp(parsed) : value;
    setDraft(format(next));
    if (next !== value) onChange(next);
  };

  const stepBy = (dir: 1 | -1) => {
    const next = clamp(parseFloat((value + dir * step).toFixed(Math.max(decimals, 2))));
    if (next !== value) onChange(next);
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <span className="text-sm text-ink dark:text-ink-dark">{label}</span>
        {hint && (
          <span className="ml-2 text-[11px] text-ink-muted/70 dark:text-ink-muted-dark/70">{hint}</span>
        )}
      </div>
      <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-warm-gray transition-colors focus-within:border-accent dark:border-warm-gray-dark">
        <button
          type="button"
          onClick={() => stepBy(-1)}
          className="flex h-7 w-6 items-center justify-center text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
          title={`减少 ${step}${unit}`}
        >
          <Minus size={11} />
        </button>
        <div className="flex h-7 items-center border-x border-warm-gray bg-paper dark:border-warm-gray-dark dark:bg-paper-dark">
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              commit();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commit();
                e.currentTarget.blur();
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                stepBy(1);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                stepBy(-1);
              }
            }}
            onChange={(e) => {
              setDraft(e.target.value);
              const parsed = parseFloat(e.target.value);
              // 合法且完整的输入即时生效（保留拖动滑杆时的实时预览体验）；
              // 越界或中间态（空串、末尾小数点）等失焦再收敛。
              if (
                Number.isFinite(parsed) &&
                parsed >= min &&
                parsed <= max &&
                !/[.\s]$/.test(e.target.value)
              ) {
                onChange(parsed);
              }
            }}
            className="w-14 bg-transparent text-center text-sm tabular-nums text-ink outline-none dark:text-ink-dark"
          />
          {unit && (
            <span className="pr-1.5 text-xs text-ink-muted dark:text-ink-muted-dark">{unit}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => stepBy(1)}
          className="flex h-7 w-6 items-center justify-center text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
          title={`增加 ${step}${unit}`}
        >
          <Plus size={11} />
        </button>
      </div>
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

// 快捷键展示/录入行：默认只读展示按键徽章；customizable 时可点「修改」
// 进入录入态（按下新组合键即生效，Esc 取消），支持单项重置与冲突提示。
export function ShortcutItem({
  label,
  shortcut,
  customizable,
  capturing,
  conflict,
  onCaptureStart,
  onReset,
}: {
  label: string;
  shortcut: string;
  customizable?: boolean;
  capturing?: boolean;
  conflict?: string;
  onCaptureStart?: () => void;
  onReset?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-md border px-3 py-2 transition-colors",
        capturing
          ? "border-accent bg-accent/5 dark:bg-accent/10"
          : "border-warm-gray bg-paper dark:border-warm-gray-dark dark:bg-paper-dark",
      )}
    >
      <span className="text-sm text-ink dark:text-ink-dark">{label}</span>
      <span className="flex items-center gap-1.5">
        {capturing ? (
          <span className="animate-pulse text-xs text-accent">按下新快捷键…（Esc 取消）</span>
        ) : (
          <kbd className="rounded bg-warm-gray px-1.5 py-0.5 text-xs font-mono text-ink dark:bg-warm-gray-dark dark:text-ink-dark">
            {shortcut}
          </kbd>
        )}
        {customizable && !capturing && (
          <>
            <button
              onClick={onCaptureStart}
              className="rounded px-1 py-0.5 text-[11px] text-ink-muted transition-colors hover:bg-warm-gray hover:text-ink dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark dark:hover:text-ink-dark"
              title={conflict ? `与「${conflict}」冲突，点击修改` : "自定义按键"}
            >
              修改
            </button>
            {onReset && (
              <button
                onClick={onReset}
                className="text-[11px] text-ink-muted transition-colors hover:text-accent dark:text-ink-muted-dark"
                title="恢复默认"
              >
                重置
              </button>
            )}
          </>
        )}
      </span>
    </div>
  );
}
