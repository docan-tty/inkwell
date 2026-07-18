import {
  Undo,
  Redo,
  Moon,
  Sun,
  Check,
  PanelLeft,
  PanelRight,
  Focus,
  Save,
  Download,
  FileText,
  BookOpen,
  FileType,
  FolderOpen,
  WandSparkles,
} from "lucide-react";
import { useAppStore } from "../store";
import { cn } from "../lib/utils";
import type { Editor } from "@tiptap/react";
import { useState, useRef, useEffect } from "react";
import type { Project, Chapter, AppSettings } from "../types";
import { exportChapter, exportProject } from "../lib/export";
import { revealInFolder, dirname } from "../lib/storage";
import { useClickOutside } from "../hooks/useClickOutside";

interface ToolbarProps {
  editor: Editor | null;
  onSave?: () => void;
  onAutoFormat?: () => void;
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
        "flex h-7 w-7 items-center justify-center rounded-full text-sm transition-colors",
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

export function Toolbar({ editor, onSave, onAutoFormat }: ToolbarProps) {
  // Selector subscriptions — see Workspace for why the whole-store
  // destructure is avoided (typing re-renders everything subscribed).
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const leftSidebarOpen = useAppStore((s) => s.leftSidebarOpen);
  const toggleLeftSidebar = useAppStore((s) => s.toggleLeftSidebar);
  const rightSidebarOpen = useAppStore((s) => s.rightSidebarOpen);
  const toggleRightSidebar = useAppStore((s) => s.toggleRightSidebar);
  const focusMode = useAppStore((s) => s.focusMode);
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode);
  const currentProject = useAppStore((s) => s.currentProject);
  const currentChapter = useAppStore((s) => s.currentChapter);
  const appSettings = useAppStore((s) => s.appSettings);
  const lastSavedAt = useAppStore((s) => s.lastSavedAt);

  // Briefly swap the Save icon for a Check whenever a save lands, so the
  // user gets unmissable on-button feedback (the StatusBar text is easy to
  // miss while the user's eyes are on the toolbar).
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (!lastSavedAt) return;
    setJustSaved(true);
    const t = setTimeout(() => setJustSaved(false), 1500);
    return () => clearTimeout(t);
  }, [lastSavedAt]);

  // 整理格式反馈：同 justSaved，按钮短暂变成对勾。
  const [justFormatted, setJustFormatted] = useState(false);
  const formatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (formatTimer.current) clearTimeout(formatTimer.current);
  }, []);
  const handleAutoFormat = () => {
    if (!editor || editor.isDestroyed) return;
    onAutoFormat?.();
    setJustFormatted(true);
    if (formatTimer.current) clearTimeout(formatTimer.current);
    formatTimer.current = setTimeout(() => setJustFormatted(false), 1500);
  };

  if (!editor || editor.isDestroyed) return null;

  const run = (fn: () => boolean) => {
    if (editor.isDestroyed) return false;
    editor.commands.focus();
    return fn();
  };

  return (
    // Compact pill toolbar: hugs its buttons instead of spanning the editor
    // width — a full-width bar above the text reads as a second chrome row.
    // NOTE: no `overflow-x-auto` here (it would force overflow-y:auto and
    // clip the ExportDropdown that extends below the pill).
    <div className="flex shrink-0 justify-center pb-1 pt-2">
      <div className="flex items-center gap-0.5 rounded-full border border-warm-gray/70 bg-paper px-1.5 py-1 shadow-sm dark:border-warm-gray-dark/70 dark:bg-paper-dark">
        <ToolbarButton
          disabled={!editor.can().undo()}
          onClick={() => run(() => editor.chain().undo().run())}
          title="撤销 (Ctrl+Z)"
        >
          <Undo size={15} />
        </ToolbarButton>
        <ToolbarButton
          disabled={!editor.can().redo()}
          onClick={() => run(() => editor.chain().redo().run())}
          title="重做 (Ctrl+Y)"
        >
          <Redo size={15} />
        </ToolbarButton>
        <span className="mx-0.5 h-4 w-px bg-warm-gray/80 dark:bg-warm-gray-dark/80" />
        {currentProject && (
          <ToolbarButton
            onClick={handleAutoFormat}
            title={justFormatted ? "已整理" : "自动整理格式（标点全角化、引号配对、空白与连续空段收敛）"}
            active={justFormatted}
          >
            {justFormatted ? <Check size={15} /> : <WandSparkles size={15} />}
          </ToolbarButton>
        )}
        {currentProject && (
          <ToolbarButton
            onClick={() => onSave?.()}
            title={justSaved ? "已保存" : "保存 (Ctrl+S)"}
            active={justSaved}
          >
            {justSaved ? <Check size={15} /> : <Save size={15} />}
          </ToolbarButton>
        )}
        {currentProject && currentChapter && (
          <ExportDropdown
            project={currentProject}
            chapter={currentChapter}
            appSettings={appSettings}
          />
        )}
        <span className="mx-0.5 h-4 w-px bg-warm-gray/80 dark:bg-warm-gray-dark/80" />
        <ToolbarButton onClick={toggleLeftSidebar} active={leftSidebarOpen} title="左侧栏 (Ctrl+B)">
          <PanelLeft size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={toggleRightSidebar} active={rightSidebarOpen} title="右侧栏 (Ctrl+Alt+O)">
          <PanelRight size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={toggleFocusMode} active={focusMode} title="专注模式 (Ctrl+Shift+D)">
          <Focus size={15} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          title={theme === "light" ? "切换到深色" : "切换到浅色"}
        >
          {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
        </ToolbarButton>
      </div>
    </div>
  );
}

type ExportFormat = "chapter-md" | "chapter-txt" | "project-html" | "project-md" | "project-txt";

function ExportDropdown({
  project,
  chapter,
  appSettings,
}: {
  project: Project;
  chapter: Chapter;
  appSettings: AppSettings;
}) {
  const [open, setOpen] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const volumes = useAppStore((s) => s.volumes);
  const chapters = useAppStore((s) => s.chapters);
  const getChapterContent = useAppStore((s) => s.getChapterContent);
  useClickOutside(dropdownRef, () => setOpen(false), open);

  // Export feedback: a small toast under the toolbar naming the destination,
  // with a one-click "open containing folder". Auto-dismisses after 6s.
  useEffect(() => {
    if (!exported) return;
    const t = setTimeout(() => setExported(null), 6000);
    return () => clearTimeout(t);
  }, [exported]);

  const handleExport = async (format: ExportFormat) => {
    setOpen(false);
    try {
      let result: { canceled: boolean; path?: string };
      if (format === "project-html" || format === "project-md" || format === "project-txt") {
        const projectFormat = format === "project-html" ? "html" : format === "project-md" ? "md" : "txt";
        result = await exportProject(project, volumes, chapters, getChapterContent, appSettings, projectFormat);
      } else {
        result = await exportChapter(
          project,
          chapter,
          getChapterContent,
          format === "chapter-md" ? "md" : "txt",
          appSettings,
        );
      }
      if (!result.canceled && result.path) {
        setExported(result.path);
      }
    } catch (err) {
      console.error("Export failed", err);
      alert(`导出失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const openExportedFolder = async () => {
    if (!exported) return;
    try {
      const dir = await dirname(exported);
      const err = await revealInFolder(dir);
      if (err) alert(`无法打开文件夹：${err}`);
    } catch {
      // Browser fallback export (a download) — no folder to open.
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      <ToolbarButton onClick={() => setOpen(!open)} title="导出">
        <Download size={15} />
      </ToolbarButton>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-48 rounded-lg border border-warm-gray bg-paper py-1 shadow-lg dark:border-warm-gray-dark dark:bg-paper-dark">
          <div className="px-3 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark">
            本章
          </div>
          <ExportItem onClick={() => handleExport("chapter-md")} icon={<FileText size={14} />} label="导出为 Markdown" />
          <ExportItem onClick={() => handleExport("chapter-txt")} icon={<FileText size={14} />} label="导出为纯文本" />
          <div className="mx-2 my-1 border-t border-warm-gray dark:border-warm-gray-dark" />
          <div className="px-3 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-ink-muted dark:text-ink-muted-dark">
            整本作品
          </div>
          <ExportItem onClick={() => handleExport("project-html")} icon={<BookOpen size={14} />} label="导出为 HTML" />
          <ExportItem onClick={() => handleExport("project-md")} icon={<FileType size={14} />} label="导出为 Markdown" />
          <ExportItem onClick={() => handleExport("project-txt")} icon={<FileType size={14} />} label="导出为纯文本" />
        </div>
      )}
      {exported && (
        <div className="absolute right-0 top-9 z-20 w-64 rounded-lg border border-warm-gray bg-paper p-3 shadow-lg dark:border-warm-gray-dark dark:bg-paper-dark animate-[inkwell-pop-in_0.15s_ease-out]">
          <div className="flex items-start gap-2">
            <Check size={14} className="mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-ink dark:text-ink-dark">导出成功</div>
              <div className="mt-0.5 break-all text-[11px] leading-relaxed text-ink-muted dark:text-ink-muted-dark">
                {exported}
              </div>
              <button
                onClick={openExportedFolder}
                className="mt-1.5 flex items-center gap-1 text-[11px] text-accent transition-colors hover:underline"
              >
                <FolderOpen size={11} />
                打开所在文件夹
              </button>
            </div>
            <button
              onClick={() => setExported(null)}
              className="shrink-0 text-ink-muted transition-colors hover:text-ink dark:text-ink-muted-dark dark:hover:text-ink-dark"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExportItem({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark"
    >
      {icon}
      {label}
    </button>
  );
}
