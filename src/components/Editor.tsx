import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import { useEffect, useCallback, useRef, useState } from "react";
import { Bold, ClipboardPaste, Copy, Italic, Minus, Redo, Save, Scissors, Undo, Type, WandSparkles } from "lucide-react";
import { useAppStore } from "../store";
import { Toolbar } from "./Toolbar";
import { ContextMenu, type CtxMenuState } from "./ContextMenu";
import { cn } from "../lib/utils";
import { modKey } from "../lib/platform";
import { matchesKeys, shortcutFor } from "../lib/shortcuts";

interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave?: () => void;
  onAutoFormat?: () => void;
  /** 强制同步通道：挂载后可用 canonical HTML 直接重写编辑器内容（跳过比对）。 */
  syncRef?: React.MutableRefObject<((canonical: string) => void) | null>;
  showToolbar?: boolean;
  onToolbarEnter?: () => void;
  onToolbarLeave?: () => void;
}

export function Editor({
  content,
  onChange,
  onSave,
  onAutoFormat,
  syncRef,
  showToolbar = false,
  onToolbarEnter,
  onToolbarLeave,
}: EditorProps) {
  const currentProject = useAppStore((s) => s.currentProject);
  const focusMode = useAppStore((s) => s.focusMode);
  const updateAppSettings = useAppStore((s) => s.updateAppSettings);
  const appSettings = useAppStore((s) => s.appSettings);
  const typography = appSettings.editorTypography;
  const editorFontFamily = appSettings.editorFontFamily || "";
  // 编辑区最大宽度：设置里可调，默认 880px。宽屏下给足阅读宽度。
  const editorMaxWidth = appSettings.editorMaxWidth || 880;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);

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
      // 标记「编辑器自己发出的更新」，同步 effect 据此跳过 canonical 回写。
      applyingExternal.current = true;
      const html = editor.getHTML();
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: "prose prose-stone dark:prose-invert max-w-none outline-none",
      },
    },
  });

  // 外部内容同步：跳过「编辑器自己刚发出的更新」，否则 canonical 化后的
  // 回写会触发第二次 onUpdate，把自动整理这类 DOM 级修改覆盖回去。
  const applyingExternal = useRef(false);
  useEffect(() => {
    // emitUpdate: false — a non-canonical initial document must not produce
    // a phantom "edit" (which would create a draft + autosave for content
    // the user never touched).
    if (editor && !applyingExternal.current && editor.getHTML() !== content) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    applyingExternal.current = false;
  }, [content, editor]);

  // 注册强制同步通道：canonical HTML → setContent（emitUpdate=false）→
  // 直接上报，绕过 onUpdate 比对，保证整理结果不被同步 effect 回滚。
  useEffect(() => {
    if (!editor || !syncRef) return;
    syncRef.current = (canonical: string) => {
      if (editor.isDestroyed) return;
      editor.commands.setContent(canonical, { emitUpdate: false });
      // 灌入后的 getHTML() 即 canonical 形态，直接上报；内容必然与传入
      // content 不同（否则调用方不会走强制通道），无需抑制同步 effect。
      onChange(editor.getHTML());
    };
    return () => {
      syncRef.current = null;
    };
  }, [editor, syncRef, onChange]);

  useEffect(() => {
    if (!editor) return;
    const editorEl = editor.view.dom as HTMLElement;
    editorEl.style.setProperty("--inkwell-font-size", `${typography.fontSize}px`);
    editorEl.style.setProperty("--inkwell-line-height", `${typography.lineHeight}`);
    editorEl.style.setProperty("--inkwell-paragraph-spacing", `${typography.paragraphSpacing}em`);
    // 首行缩进开关（默认开）— 中文小说排版惯例两字符缩进。
    editorEl.style.setProperty("--inkwell-indent", appSettings.firstLineIndent === false ? "0" : "2em");
    // 编辑区字体（设置里可换）；空时移除变量，回落到界面字体。
    if (editorFontFamily) {
      editorEl.style.setProperty("--inkwell-editor-font", editorFontFamily);
    } else {
      editorEl.style.removeProperty("--inkwell-editor-font");
    }
  }, [editor, typography, appSettings.firstLineIndent, editorFontFamily]);

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // 保存键可在设置里自定义；默认 Ctrl/⌘+S。
      if (matchesKeys(e.nativeEvent, shortcutFor("save", appSettings.shortcuts))) {
        e.preventDefault();
        // localContent is already kept in sync by onUpdate -> onChange on every
        // keystroke, so onSave (handleManualSave) reads the latest content.
        onSave?.();
      }
    },
    [onSave, appSettings.shortcuts],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!editor || !currentProject) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;
        const typographyNow = useAppStore.getState().appSettings.editorTypography;
        const newSize = Math.min(32, Math.max(12, typographyNow.fontSize + delta));
        if (newSize === typographyNow.fontSize) return;
        // Live-preview via a transient store write, debounce the persistence
        // (updateAppSettings writes the whole settings blob to localStorage on
        // every call — once per wheel tick would thrash it).
        useAppStore.setState({
          appSettings: {
            ...useAppStore.getState().appSettings,
            editorTypography: { ...typographyNow, fontSize: newSize },
          },
        });
        if (wheelZoomTimer.current) clearTimeout(wheelZoomTimer.current);
        wheelZoomTimer.current = setTimeout(() => {
          const latest = useAppStore.getState().appSettings.editorTypography;
          updateAppSettings({ editorTypography: latest });
        }, 400);
      }
    },
    [editor, currentProject, updateAppSettings],
  );
  const wheelZoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (wheelZoomTimer.current) clearTimeout(wheelZoomTimer.current);
    },
    [],
  );

  // 写作区右键菜单：常用排版与编辑操作，替换 webview 默认菜单。
  // 在 capture 阶段拦截，保证 ProseMirror 内的右键也走这里。
  // 块级格式（正文/标题/引用/列表）以复选框模式显示当前激活态。
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!editor || editor.isDestroyed) return;
      e.preventDefault();
      // 告诉 App 层的全局拦截：这里已经接管，别再 preventDefault 之外的默认行为。
      (e.nativeEvent as unknown as Record<string, unknown>).__inkwellCtxHandled = true;
      const mod = modKey();
      const { from, to, empty } = editor.state.selection;
      const selectedText = empty ? "" : editor.state.doc.textBetween(from, to, " ");
      const hasSelection = selectedText.length > 0;
      const copySelection = async () => {
        try {
          await navigator.clipboard.writeText(selectedText);
        } catch {
          // 剪贴板权限被拒时静默失败（键盘快捷键仍可用）
        }
      };
      const pasteText = async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) editor.chain().focus().insertContent(text).run();
        } catch {
          // 剪贴板权限被拒时静默失败
        }
      };
      const blockChecked = {
        paragraph: editor.isActive("paragraph") && ![1, 2, 3].some((l) => editor.isActive("heading", { level: l })) && !editor.isActive("blockquote") && !editor.isActive("bulletList") && !editor.isActive("orderedList"),
        h1: editor.isActive("heading", { level: 1 }),
        h2: editor.isActive("heading", { level: 2 }),
        h3: editor.isActive("heading", { level: 3 }),
        quote: editor.isActive("blockquote"),
        bullet: editor.isActive("bulletList"),
        ordered: editor.isActive("orderedList"),
      };
      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: "撤销", icon: <Undo size={14} />, shortcut: `${mod}+Z`, disabled: !editor.can().undo(), onClick: () => editor.chain().focus().undo().run() },
          { label: "重做", icon: <Redo size={14} />, shortcut: `${mod}+Y`, disabled: !editor.can().redo(), onClick: () => editor.chain().focus().redo().run() },
          { divider: true, label: "" },
          { label: "剪切", icon: <Scissors size={14} />, shortcut: `${mod}+X`, disabled: !hasSelection, onClick: async () => { await copySelection(); editor.chain().focus().deleteSelection().run(); } },
          { label: "复制", icon: <Copy size={14} />, shortcut: `${mod}+C`, disabled: !hasSelection, onClick: copySelection },
          { label: "粘贴", icon: <ClipboardPaste size={14} />, shortcut: `${mod}+V`, onClick: pasteText },
          { divider: true, label: "" },
          { label: "加粗", icon: <Bold size={14} />, shortcut: `${mod}+B`, onClick: () => editor.chain().focus().toggleBold().run() },
          { label: "斜体", icon: <Italic size={14} />, shortcut: `${mod}+I`, onClick: () => editor.chain().focus().toggleItalic().run() },
          { divider: true, label: "" },
          { label: "正文", checked: blockChecked.paragraph, onClick: () => editor.chain().focus().setParagraph().run() },
          {
            label: "标题",
            icon: <Type size={14} />,
            children: ([1, 2, 3] as const).map((level) => ({
              label: `标题 ${level}`,
              checked: blockChecked[`h${level}` as const],
              shortcut: `${mod}+Alt+${level}`,
              onClick: () => editor.chain().focus().toggleHeading({ level }).run(),
            })),
          },
          { label: "引用", checked: blockChecked.quote, onClick: () => editor.chain().focus().toggleBlockquote().run() },
          { label: "无序列表", checked: blockChecked.bullet, onClick: () => editor.chain().focus().toggleBulletList().run() },
          { label: "有序列表", checked: blockChecked.ordered, onClick: () => editor.chain().focus().toggleOrderedList().run() },
          { divider: true, label: "" },
          {
            label: "自动整理格式",
            icon: <WandSparkles size={14} />,
            onClick: () => onAutoFormat?.(),
          },
          { label: "分隔线", icon: <Minus size={14} />, onClick: () => editor.chain().focus().setHorizontalRule().run() },
          { label: "保存", icon: <Save size={14} />, shortcut: `${mod}+S`, onClick: () => onSave?.() },
        ],
      });
    },
    [editor, onSave, onAutoFormat],
  );

  const toolbar = (
    <Toolbar
      editor={editor}
      onSave={onSave}
      onAutoFormat={onAutoFormat}
    />
  );

  return (
    <div className="flex min-w-0 min-h-0 flex-1 flex-col">
      {focusMode ? (
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
            {toolbar}
          </div>
        </div>
      ) : (
        <div className="shrink-0">{toolbar}</div>
      )}
      <div
        ref={containerRef}
        className="inkwell-editor min-h-0 w-full flex-1 overflow-y-auto bg-paper transition-all duration-300 dark:bg-paper-dark"
        style={{ padding: `0 ${appSettings.editorPadding}px` }}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
        onContextMenuCapture={handleContextMenu}
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
      <ContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} />
    </div>
  );
}
