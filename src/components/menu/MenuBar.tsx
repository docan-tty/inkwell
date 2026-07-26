import { useEffect, useRef, useState } from "react";
import { Check, Feather } from "lucide-react";
import { useAppStore } from "../../store";
import { MENU_DEFS, THEME_OPTIONS, type MenuDef, type MenuItem } from "../../lib/menu-defs";
import { COMMANDS, getCommandContext, isCommandEnabled, openRecentProject, runCommand } from "../../lib/commands";
import { displayKeys, shortcutFor } from "../../lib/shortcuts";
import { useClickOutside } from "../../hooks/useClickOutside";
import { cn } from "../../lib/utils";

// 顶部菜单栏(novelWriter 风格):click 打开,已开时 hover 切换,Esc /
// 点击外部关闭。菜单项动作全部走命令层,快捷键显示解析用户自定义按键。
export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentProject = useAppStore((s) => s.currentProject);
  const focusMode = useAppStore((s) => s.focusMode);
  // 订阅会影响菜单项 enabled/checked 的状态片段,打开菜单时重渲染。
  const currentChapterId = useAppStore((s) => s.currentChapter?.id);
  const themeSetting = useAppStore((s) => s.appSettings.theme);
  const shortcuts = useAppStore((s) => s.appSettings.shortcuts);
  // 模态打开期间菜单不响应 Esc(模态优先)。
  const anyModalOpen = useAppStore(
    (s) => s.searchOpen || s.settingsOpen || s.welcomeOpen || s.aboutOpen || s.projectEditTarget !== null || s.projectDeleteTarget !== null,
  );
  useClickOutside(rootRef, () => setOpenMenu(null), openMenu !== null);

  useEffect(() => {
    if (!openMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpenMenu(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [openMenu]);

  // 模态打开时收起菜单(避免叠加)。
  useEffect(() => {
    if (anyModalOpen) setOpenMenu(null);
  }, [anyModalOpen]);

  if (focusMode) return null;

  const ctx = getCommandContext();

  return (
    <div
      ref={rootRef}
      className="relative z-50 flex h-9 shrink-0 select-none items-center gap-0.5 border-b border-warm-gray/80 bg-paper px-2 dark:border-warm-gray-dark/80 dark:bg-paper-dark"
    >
      <div className="mr-2 flex items-center gap-1.5 text-accent">
        <Feather size={14} />
        <span className="text-xs font-semibold tracking-wide">墨池</span>
      </div>
      {MENU_DEFS.map((menu) => (
        <MenuButton
          key={menu.id}
          menu={menu}
          open={openMenu === menu.id}
          onOpen={() => setOpenMenu(menu.id)}
          onHover={() => {
            if (openMenu && openMenu !== menu.id) setOpenMenu(menu.id);
          }}
          onClose={() => setOpenMenu(null)}
          ctx={ctx}
          shortcuts={shortcuts}
        />
      ))}
      {currentProject && (
        <div className="ml-auto truncate pl-4 text-xs text-ink-muted dark:text-ink-muted-dark" title={currentProject.name}>
          {currentProject.name}
        </div>
      )}
      {/* themeSetting / currentChapterId 仅用于触发重算,不直接渲染 */}
      <span className="hidden">{themeSetting}{currentChapterId}</span>
    </div>
  );
}

function MenuButton({
  menu,
  open,
  onOpen,
  onHover,
  onClose,
  ctx,
  shortcuts,
}: {
  menu: MenuDef;
  open: boolean;
  onOpen: () => void;
  onHover: () => void;
  onClose: () => void;
  ctx: ReturnType<typeof getCommandContext>;
  shortcuts: Record<string, string> | undefined;
}) {
  return (
    <div className="relative">
      <button
        onClick={() => (open ? onClose() : onOpen())}
        onMouseEnter={onHover}
        className={cn(
          "rounded-md px-2.5 py-1 text-[13px] transition-colors",
          open
            ? "bg-warm-gray text-ink dark:bg-warm-gray-dark dark:text-ink-dark"
            : "text-ink hover:bg-warm-gray/70 dark:text-ink-dark dark:hover:bg-warm-gray-dark/70",
        )}
      >
        {menu.label}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-0.5 w-60 rounded-lg border border-warm-gray bg-paper py-1 shadow-lg dark:border-warm-gray-dark dark:bg-paper-dark">
          {menu.items.map((item, idx) => (
            <MenuItemRow key={idx} item={item} ctx={ctx} shortcuts={shortcuts} onPicked={onClose} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubMenu({
  label,
  items,
  ctx,
  shortcuts,
  onPicked,
}: {
  label: string;
  items: MenuItem[];
  ctx: ReturnType<typeof getCommandContext>;
  shortcuts: Record<string, string> | undefined;
  onPicked: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark"
      >
        <span>{label}</span>
        <span className="text-ink-muted dark:text-ink-muted-dark">▸</span>
      </button>
      {open && (
        <div className="absolute left-full top-0 z-50 -ml-1 w-52 rounded-lg border border-warm-gray bg-paper py-1 shadow-lg dark:border-warm-gray-dark dark:bg-paper-dark">
          {items.map((child, idx) => (
            <MenuItemRow key={idx} item={child} ctx={ctx} shortcuts={shortcuts} onPicked={onPicked} />
          ))}
        </div>
      )}
    </div>
  );
}

function MenuItemRow({
  item,
  ctx,
  shortcuts,
  onPicked,
}: {
  item: MenuItem;
  ctx: ReturnType<typeof getCommandContext>;
  shortcuts: Record<string, string> | undefined;
  onPicked: () => void;
}) {
  const projects = useAppStore((s) => s.projects);
  const recentIds = useAppStore((s) => s.appSettings.recentProjects);
  const themeSetting = useAppStore((s) => s.appSettings.theme);
  const spellCheck = useAppStore((s) => s.appSettings.spellCheck);
  const setTheme = useAppStore((s) => s.setTheme);

  if (item.kind === "separator") {
    return <div className="mx-2 my-1 border-t border-warm-gray dark:border-warm-gray-dark" />;
  }

  if (item.kind === "recent") {
    const recent = recentIds
      .map((id) => projects.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .slice(0, 5);
    if (recent.length === 0) {
      return <div className="px-3 py-1.5 text-[13px] text-ink-muted/60 dark:text-ink-muted-dark/60">最近打开(空)</div>;
    }
    return (
      <>
        <div className="px-3 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark">
          最近打开
        </div>
        {recent.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              onPicked();
              void openRecentProject(p.id);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark"
          >
            <span className="truncate">{p.name}</span>
          </button>
        ))}
      </>
    );
  }

  if (item.kind === "theme") {
    return (
      <>
        <div className="px-3 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark">
          外观
        </div>
        {THEME_OPTIONS.map((opt) => (
          <button
            key={opt.mode}
            onClick={() => {
              onPicked();
              setTheme(opt.mode);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark"
          >
            <span className="flex w-4 justify-center">{themeSetting === opt.mode && <Check size={13} className="text-accent" />}</span>
            {opt.label}
          </button>
        ))}
      </>
    );
  }

  if (item.kind === "label") {
    return (
      <button
        disabled={item.disabled}
        onClick={() => {
          onPicked();
          item.run();
        }}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors",
          item.disabled
            ? "text-ink-muted/50 dark:text-ink-muted-dark/50"
            : "text-ink hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark",
        )}
      >
        <span className="flex w-4 justify-center">{item.checked && <Check size={13} className="text-accent" />}</span>
        {item.label}
      </button>
    );
  }

  if (item.kind === "submenu") {
    return (
      <SubMenu label={item.label} items={item.items} ctx={ctx} shortcuts={shortcuts} onPicked={onPicked} />
    );
  }

  const cmd = COMMANDS[item.command];
  if (!cmd) return null;
  const enabled = isCommandEnabled(item.command, ctx);
  const keys = cmd.shortcutId ? shortcutFor(cmd.shortcutId, shortcuts) : "";
  // 拼写检查项显示勾选态。
  const spellChecked = item.command === "tools.spellToggle" ? spellCheck : undefined;
  return (
    <button
      disabled={!enabled}
      onClick={() => {
        onPicked();
        runCommand(item.command);
      }}
      className={cn(
        "flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-[13px] transition-colors",
        enabled
          ? "text-ink hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark"
          : "text-ink-muted/50 dark:text-ink-muted-dark/50",
      )}
    >
      <span className="flex items-center gap-2">
        {spellChecked !== undefined && (
          <span className={cn("w-4 text-accent", !spellChecked && "opacity-0")}>
            <Check size={13} />
          </span>
        )}
        {item.label ?? cmd.label}
      </span>
      {keys && (
        <span className="shrink-0 text-[11px] text-ink-muted dark:text-ink-muted-dark">
          {displayKeys(keys, false)}
        </span>
      )}
    </button>
  );
}
