import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { useEffect, useCallback, useState } from "react";
import { useAppStore } from "../store";
import { Toolbar } from "./Toolbar";
import { cn } from "../lib/utils";

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave?: () => void;
}

export function Editor({ content, onChange, onSave }: EditorProps) {
  const { currentProject, focusMode, updateAppSettings, appSettings } = useAppStore();
  const typography = appSettings.editorTypography;
  const [isFullscreen, setIsFullscreen] = useState(false);

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
  }, [editor, typography]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        e.preventDefault();
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        const html = editor?.getHTML() || "";
        onChange(html);
      }
    },
    [editor, onChange],
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
        (isFullscreen || focusMode) && "group",
      )}
    >
      <div
        className={cn(
          "shrink-0 transition-opacity duration-300",
          isFullscreen || focusMode
            ? "pointer-events-none opacity-0 group-hover:opacity-100 group-hover:pointer-events-auto"
            : "opacity-100",
        )}
      >
        <Toolbar
          editor={editor}
          onSave={onSave}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      </div>
      <div
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
            maxWidth: "720px",
            margin: "0 auto",
          }}
        >
          <EditorContent editor={editor} className="h-full" />
        </div>
      </div>
    </div>
  );
}
