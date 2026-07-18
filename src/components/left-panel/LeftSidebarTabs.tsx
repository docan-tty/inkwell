import { BookMarked, ListTree, NotebookPen } from "lucide-react";
import { useAppStore } from "../../store";
import { cn } from "../../lib/utils";
import type { LeftSidebarTab } from "../../types";

// 左侧栏页签头：目录 / 笔记 / 词典。点击已激活页签时折叠左栏。
export function LeftSidebarTabs() {
  const { leftSidebarTab, setLeftSidebarTab, leftSidebarOpen, toggleLeftSidebar } = useAppStore();

  const handleClick = (tab: LeftSidebarTab) => {
    if (leftSidebarOpen && leftSidebarTab === tab) {
      toggleLeftSidebar();
    } else {
      setLeftSidebarTab(tab);
    }
  };

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-warm-gray/60 px-2 dark:border-warm-gray-dark/60">
      <Tab
        active={leftSidebarTab === "chapters"}
        onClick={() => handleClick("chapters")}
        icon={<ListTree size={14} />}
        label="目录"
      />
      <Tab
        active={leftSidebarTab === "notes"}
        onClick={() => handleClick("notes")}
        icon={<NotebookPen size={14} />}
        label="笔记"
      />
      <Tab
        active={leftSidebarTab === "dictionary"}
        onClick={() => handleClick("dictionary")}
        icon={<BookMarked size={14} />}
        label="词典"
      />
    </div>
  );
}

function Tab({
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
        "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs transition-colors",
        active
          ? "bg-accent/10 font-medium text-accent dark:bg-accent/20"
          : "text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
