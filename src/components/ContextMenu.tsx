import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";

export interface CtxItem {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** 渲染一条分组分隔线（其余字段忽略）。 */
  divider?: boolean;
}

export interface CtxMenuState {
  x: number;
  y: number;
  items: CtxItem[];
}

/*
 * 自定义右键菜单：替换 webview 默认的 Copy / Inspect Element 菜单。
 * 打开时按视口边界自动翻转，滚轮 / Esc / 点击外部 / 窗口失焦即关闭。
 */
export function ContextMenu({
  menu,
  onClose,
}: {
  menu: CtxMenuState | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!menu) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8)),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    window.addEventListener("wheel", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("wheel", onScroll, true);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return (
    <div
      className="fixed inset-0 z-[60]"
      onMouseDown={onClose}
      onContextMenu={(e) => {
        // 菜单打开时在其遮罩上右键：阻止默认并把菜单移到新位置。
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        ref={ref}
        onMouseDown={(e) => e.stopPropagation()}
        className="fixed min-w-44 rounded-lg border border-warm-gray bg-paper py-1 shadow-xl dark:border-warm-gray-dark dark:bg-paper-dark animate-[inkwell-pop-in_0.12s_ease-out]"
        style={pos ? { left: pos.left, top: pos.top } : { left: menu.x, top: menu.y, visibility: "hidden" }}
      >
        {menu.items.map((item, i) =>
          item.divider ? (
            <div key={i} className="mx-2 my-1 border-t border-warm-gray dark:border-warm-gray-dark" />
          ) : (
            <button
              key={i}
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.onClick?.();
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
                item.danger
                  ? "text-red-600 hover:bg-red-500/10 dark:text-red-400"
                  : "text-ink hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark",
                item.disabled && "pointer-events-none opacity-40",
              )}
            >
              {item.icon && <span className="shrink-0 text-ink-muted dark:text-ink-muted-dark">{item.icon}</span>}
              <span className="flex-1">{item.label}</span>
              {item.shortcut && (
                <span className="ml-4 text-[10px] text-ink-muted dark:text-ink-muted-dark">{item.shortcut}</span>
              )}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
