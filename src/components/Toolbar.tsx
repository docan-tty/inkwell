import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  Undo,
  Redo,
  Moon,
  Sun,
  PanelLeft,
  PanelRight,
  Focus,
  Expand,
  Shrink,
  Save,
  Download,
  FileText,
  BookOpen,
} from "lucide-react";
import { useAppStore } from "../store";
import { cn } from "../lib/utils";
import type { Editor } from "@tiptap/react";
import { useState, useRef } from "react";
import type { Project, Chapter } from "../types";
import { exportChapter, exportProject } from "../lib/export";
import { useClickOutside } from "../hooks/useClickOutside";

interface ToolbarProps {
  editor: Editor | null;
  onSave?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

function ToolbarButton({
  active,
  disabled,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors",
        active
          ? "bg-accent/10 text-accent dark:bg-accent/20"
          : "text-ink/70 hover:bg-warm-gray dark:text-ink-dark/70 dark:hover:bg-warm-gray-dark",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      {children}
    </button>
  );
}

export function Toolbar({ editor, onSave, isFullscreen, onToggleFullscreen }: ToolbarProps) {
  const {
    theme,
    setTheme,
    leftSidebarOpen,
    toggleLeftSidebar,
    rightSidebarOpen,
    toggleRightSidebar,
    focusMode,
    toggleFocusMode,
    currentProject,
    currentChapter,
  } = useAppStore();

  if (!editor || editor.isDestroyed) return null;

  const run = (fn: () => boolean) => {
    if (editor.isDestroyed) return false;
    editor.commands.focus();
    return fn();
  };

  return (
    <div className="flex h-12 shrink-0 items-center justify-between overflow-x-auto min-w-0 border-b border-warm-gray bg-paper px-3 scrollbar-hide dark:border-warm-gray-dark dark:bg-paper-dark">
      <div className="flex items-center gap-1">
        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => run(() => editor.chain().toggleBold().run())}
          title="加粗"
        >
          <Bold size={16} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => run(() => editor.chain().toggleItalic().run())}
          title="斜体"
        >
          <Italic size={16} />
        </ToolbarButton>
        <div className="mx-2 h-5 w-px bg-warm-gray dark:bg-warm-gray-dark" />
        <ToolbarButton
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => run(() => editor.chain().toggleHeading({ level: 1 }).run())}
          title="标题 1"
        >
          <Heading1 size={16} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => run(() => editor.chain().toggleHeading({ level: 2 }).run())}
          title="标题 2"
        >
          <Heading2 size={16} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => run(() => editor.chain().toggleHeading({ level: 3 }).run())}
          title="标题 3"
        >
          <Heading3 size={16} />
        </ToolbarButton>
        <div className="mx-2 h-5 w-px bg-warm-gray dark:bg-warm-gray-dark" />
        <ToolbarButton
          disabled={!editor.can().undo()}
          onClick={() => run(() => editor.chain().undo().run())}
          title="撤销 (Ctrl+Z)"
        >
          <Undo size={16} />
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor.can().redo()}
          onClick={() => run(() => editor.chain().redo().run())}
          title="重做 (Ctrl+Y)"
        >
          <Redo size={16} />
        </ToolbarButton>
      </div>

      <div className="flex items-center gap-1">
        {currentProject && (
          <ToolbarButton onClick={onSave || (() => {})} title="保存 (Ctrl+S)">
            <Save size={16} />
          </ToolbarButton>
        )}
        {currentProject && currentChapter && (
          <ExportDropdown
            project={currentProject}
            chapter={currentChapter}
            onExported={(path) => {
              // Optional: show a toast or log the path
              console.log("Exported to", path);
            }}
          />
        )}
        <ToolbarButton onClick={toggleLeftSidebar} active={leftSidebarOpen} title="左侧栏">
          <PanelLeft size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={toggleRightSidebar} active={rightSidebarOpen} title="右侧栏">
          <PanelRight size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={toggleFocusMode} active={focusMode} title="专注模式">
          <Focus size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={onToggleFullscreen || (() => {})}
          active={isFullscreen}
          title={isFullscreen ? "退出全屏 (Esc)" : "全屏编辑"}
        >
          {isFullscreen ? <Shrink size={16} /> : <Expand size={16} />}
        </ToolbarButton>
        <ToolbarButton
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          title={theme === "light" ? "切换到深色" : "切换到浅色"}
        >
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
        </ToolbarButton>
      </div>
    </div>
  );
}

function ExportDropdown({
  project,
  chapter,
  onExported,
}: {
  project: Project;
  chapter: Chapter;
  onExported?: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { volumes, chapters, getChapterContent } = useAppStore();
  useClickOutside(dropdownRef, () => setOpen(false), open);

  const handleExport = async (format: "chapter-md" | "chapter-txt" | "project-html") => {
    setOpen(false);
    try {
      let result: { canceled: boolean; path?: string };
      if (format === "project-html") {
        result = await exportProject(project, volumes, chapters, getChapterContent);
      } else {
        result = await exportChapter(project, chapter, getChapterContent, format === "chapter-md" ? "md" : "txt");
      }
      if (!result.canceled && result.path) {
        onExported?.(result.path);
      }
    } catch (err) {
      console.error("Export failed", err);
      alert(`导出失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      <ToolbarButton onClick={() => setOpen(!open)} title="导出">
        <Download size={16} />
      </ToolbarButton>
      {open && (
        <div className="absolute right-0 top-10 z-20 w-44 rounded-md border border-warm-gray bg-paper py-1 shadow-lg dark:border-warm-gray-dark dark:bg-paper-dark">
          <button
            onClick={() => handleExport("chapter-md")}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark"
          >
            <FileText size={14} />
            导出本章为 Markdown
          </button>
          <button
            onClick={() => handleExport("chapter-txt")}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark"
          >
            <FileText size={14} />
            导出本章为纯文本
          </button>
          <button
            onClick={() => handleExport("project-html")}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark"
          >
            <BookOpen size={14} />
            导出作品为 HTML
          </button>
        </div>
      )}
    </div>
  );
}
