import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { useEffect, useCallback, useRef, useState } from "react";
import { useAppStore } from "../store";
import { Toolbar } from "./Toolbar";
import { cn } from "../lib/utils";

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  showToolbar?: boolean;
  onToolbarEnter?: () => void;
  onToolbarLeave?: () => void;
}

export function Editor({
  content,
  onChange,
  onSave,
  isFullscreen = false,
  onToggleFullscreen,
  showToolbar = false,
  onToolbarEnter,
  onToolbarLeave,
}: EditorProps) {
  const { currentProject, focusMode, updateAppSettings, appSettings } = useAppStore();
  const typography = appSettings.editorTypography;
  // 编辑区最大宽度：设置里可调，默认 880px。宽屏下给足阅读宽度。
  const editorMaxWidth = appSettings.editorMaxWidth || 880;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: "从这里开始你的故事……",
      }),
      Typography,
    ],
    content,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: "prose prose-stone dark:prose-invert max-w-none outline-none",
      },
    },
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  useEffect(() => {
    if (!editor) return;
    const editorEl = editor.view.dom as HTMLElement;
    editorEl.style.setProperty("--inkwell-font-size", `${typography.fontSize}px`);
    editorEl.style.setProperty("--inkwell-line-height", `${typography.lineHeight}`);
    editorEl.style.setProperty("--inkwell-paragraph-spacing", `${typography.paragraphSpacing}em`);
    // 首行缩进开关（默认开）— 中文小说排版惯例两字符缩进。
    editorEl.style.setProperty("--inkwell-indent", appSettings.firstLineIndent === false ? "0" : "2em");
  }, [editor, typography, appSettings.firstLineIndent]);

  // Track the actual editing-pane width so the text column can adapt: use the
  // full configured max width, but never leave absurdly wide empty margins on
  // very wide screens, nor overflow on narrow ones.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen && onToggleFullscreen) {
        e.preventDefault();
        onToggleFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, onToggleFullscreen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        // localContent is already kept in sync by onUpdate -> onChange on every
        // keystroke, so onSave (handleManualSave) reads the latest content.
        onSave?.();
      }
    },
    [onSave],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!editor || !currentProject) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;
        const newSize = Math.min(32, Math.max(12, typography.fontSize + delta));
        if (newSize !== typography.fontSize) {
          updateAppSettings({
            editorTypography: { ...typography, fontSize: newSize },
          });
        }
      }
    },
    [editor, currentProject, typography, updateAppSettings],
  );

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col min-h-0",
        isFullscreen && "fixed inset-0 z-50",
      )}
    >
      {isFullscreen || focusMode ? (
        <div
          className="relative shrink-0"
          onMouseEnter={focusMode ? onToolbarEnter : undefined}
          onMouseLeave={focusMode ? onToolbarLeave : undefined}
        >
          <div
            className={cn(
              "shrink-0 transition-opacity duration-300",
              showToolbar ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <Toolbar
              editor={editor}
              onSave={onSave}
              isFullscreen={isFullscreen}
              onToggleFullscreen={onToggleFullscreen}
            />
          </div>
        </div>
      ) : (
        <div className="shrink-0">
          <Toolbar
            editor={editor}
            onSave={onSave}
            isFullscreen={isFullscreen}
            onToggleFullscreen={onToggleFullscreen}
          />
        </div>
      )}
      <div
        ref={containerRef}
        className={cn(
          "inkwell-editor flex-1 w-full min-h-0 overflow-y-auto bg-paper dark:bg-paper-dark transition-all duration-300",
          focusMode ? "opacity-100" : "",
          isFullscreen && "bg-paper dark:bg-paper-dark",
        )}
        style={{ padding: `0 ${appSettings.editorPadding}px` }}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
      >
        <div
          className="min-h-full py-12"
          style={{
            // Adaptive column width: prefer the configured max width, but on a
            // narrow pane shrink to fit (minus padding), and on a very wide
            // pane cap at the configured width so lines stay readable.
            maxWidth: containerWidth
              ? Math.min(editorMaxWidth, Math.max(420, containerWidth - appSettings.editorPadding * 2))
              : editorMaxWidth,
            margin: "0 auto",
          }}
        >
          <EditorContent editor={editor} className="h-full" />
        </div>
      </div>
    </div>
  );
}
