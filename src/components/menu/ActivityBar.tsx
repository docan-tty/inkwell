import { BookMarked, History, ListTree, NotebookPen, Search, Settings, ListOrdered } from "lucide-react";
import { useAppStore } from "../../store";
import { runCommand } from "../../lib/commands";
import { cn } from "../../lib/utils";
import type { LeftSidebarTab } from "../../types";

// 左侧窄竖向图标栏(novelWriter 风格):上部为面板页签(目录/笔记/词典,
// 点击已激活页签折叠面板),下部为全局动作(大纲/历史/搜索/设置)。
// 专注模式下隐藏。
export function ActivityBar() {
  const leftSidebarTab = useAppStore((s) => s.leftSidebarTab);
  const leftSidebarOpen = useAppStore((s) => s.leftSidebarOpen);
  const setLeftSidebarTab = useAppStore((s) => s.setLeftSidebarTab);
  const toggleLeftSidebar = useAppStore((s) => s.toggleLeftSidebar);
  const rightSidebarOpen = useAppStore((s) => s.rightSidebarOpen);
  const rightPanelTab = useAppStore((s) => s.rightPanelTab);
  const focusMode = useAppStore((s) => s.focusMode);

  if (focusMode) return null;

  const handleTab = (tab: LeftSidebarTab) => {
    if (leftSidebarOpen && leftSidebarTab === tab) toggleLeftSidebar();
    else setLeftSidebarTab(tab);
  };

  return (
    <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-warm-gray/80 bg-paper py-2 dark:border-warm-gray-dark/80 dark:bg-paper-dark">
      <BarIcon
        icon={<ListTree size={17} />}
        title="目录"
        active={leftSidebarOpen && leftSidebarTab === "chapters"}
        onClick={() => handleTab("chapters")}
      />
      <BarIcon
        icon={<NotebookPen size={17} />}
        title="写作笔记"
        active={leftSidebarOpen && leftSidebarTab === "notes"}
        onClick={() => handleTab("notes")}
      />
      <BarIcon
        icon={<BookMarked size={17} />}
        title="设定词典"
        active={leftSidebarOpen && leftSidebarTab === "dictionary"}
        onClick={() => handleTab("dictionary")}
      />
      <div className="mt-auto flex flex-col items-center gap-1">
        <BarIcon
          icon={<ListOrdered size={17} />}
          title="大纲"
          active={rightSidebarOpen && rightPanelTab === "outline"}
          onClick={() => runCommand("toggleRightSidebar")}
        />
        <BarIcon
          icon={<History size={17} />}
          title="历史版本"
          active={rightSidebarOpen && rightPanelTab === "history"}
          onClick={() => runCommand("view.history")}
        />
        <BarIcon icon={<Search size={17} />} title="全书搜索 (Ctrl+Shift+F)" onClick={() => runCommand("search")} />
        <BarIcon icon={<Settings size={17} />} title="全局设置" onClick={() => runCommand("settings.open")} />
      </div>
    </div>
  );
}

function BarIcon({
  icon,
  title,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
        active
          ? "bg-accent/10 text-accent dark:bg-accent/20"
          : "text-ink-muted hover:bg-warm-gray hover:text-ink dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark dark:hover:text-ink-dark",
      )}
    >
      {icon}
    </button>
  );
}
