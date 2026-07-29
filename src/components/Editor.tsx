import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import Highlight from "@tiptap/extension-highlight";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import TextAlign from "@tiptap/extension-text-align";
import { useEffect, useCallback, useRef, useState } from "react";
import { Bold, ClipboardPaste, Copy, Italic, Minus, Redo, Save, Scissors, Undo, Type, WandSparkles } from "lucide-react";
import { useAppStore } from "../store";
import { Toolbar } from "./Toolbar";
import { ContextMenu, type CtxMenuState } from "./ContextMenu";
import { EditorSearchBar } from "./EditorSearchBar";
import { cn } from "../lib/utils";
import { modKey } from "../lib/platform";
import { matchesKeys, shortcutFor } from "../lib/shortcuts";
import { registerEditorContext } from "../lib/editor-context";

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

/** 切换当前段落行首前缀(注释「% 」/忽略「%~ 」)。 */
function toggleLinePrefix(editor: NonNullable<ReturnType<typeof useEditor>>, prefix: string) {
  const { state, view } = editor;
  const { $from } = state.selection;
  const start = $from.start($from.depth);
  const lineText = $from.parent.textContent;
  const has = lineText.startsWith(prefix.trimEnd()) && (lineText === prefix.trimEnd() || lineText.startsWith(prefix));
  const tr = has
    ? state.tr.delete(start, start + prefix.length)
    : state.tr.insertText(prefix, start);
  view.dispatch(tr);
}

/** 用成对符号环绕选区(无选区时环绕光标所在单词)。 */
function wrapSelection(editor: NonNullable<ReturnType<typeof useEditor>>, pair: [string, string]) {
  const { state, view } = editor;
  let { from, to } = state.selection;
  if (from === to) {
    // 光标在单词中间:扩展到单词边界。
    const $from = state.doc.resolve(from);
    const text = $from.parent.textContent;
    const offset = from - $from.start();
    let s = offset, e = offset;
    while (s > 0 && /\S/.test(text[s - 1])) s--;
    while (e < text.length && /\S/.test(text[e])) e++;
    from = $from.start() + s;
    to = $from.start() + e;
  }
  const tr = state.tr.insertText(pair[1], to).insertText(pair[0], from);
  view.dispatch(tr);
}

type TEditor = NonNullable<ReturnType<typeof useEditor>>;

/** 从 .txt/.md 文件读入文本并插入当前光标处。 */
async function importTextIntoEditor(editor: TEditor) {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("../lib/storage");
    const path = await open({ filters: [{ name: "文本", extensions: ["txt", "md"] }], multiple: false });
    if (!path || typeof path !== "string") return;
    const text = await readTextFile(path);
    if (text) editor.chain().focus().insertContent(text.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br/>")).run();
  } catch (err) {
    alert(`导入失败:${err instanceof Error ? err.message : String(err)}`);
  }
}

/** 把选中文本移动到一个新文档(在同父级创建,正文搬过去,原处删除)。 */
async function moveSelectionToNewDoc(editor: TEditor) {
  const { state } = editor;
  const { from, to, empty } = state.selection;
  if (empty) {
    alert("请先选中要移动的文本。");
    return;
  }
  const selected = state.doc.textBetween(from, to, "\n");
  const store = useAppStore.getState();
  const parent = store.currentChapter?.parentId ?? null;
  const title = selected.slice(0, 12).replace(/\n.*/s, "") || "新文档";
  const created = await store.createChapter(parent, title, { parentDocId: parent ?? undefined });
  await store.updateChapterContent(created.id, `<p>${selected.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br/>")}</p>`);
  editor.chain().focus().deleteSelection().run();
}

/** 菜单/命令层通用编辑器动作:格式切换与文本插入。 */
function execEditorAction(editor: TEditor, action: string, arg?: string) {
  if (editor.isDestroyed) return;
  const chain = () => editor.chain().focus();
  switch (action) {
    case "bold": chain().toggleBold().run(); break;
    case "italic": chain().toggleItalic().run(); break;
    case "strike": chain().toggleStrike().run(); break;
    case "underline": chain().toggleUnderline().run(); break;
    case "highlight": chain().toggleHighlight().run(); break;
    case "superscript": chain().toggleSuperscript().run(); break;
    case "subscript": chain().toggleSubscript().run(); break;
    case "h1": case "h2": case "h3": case "h4":
      chain().toggleHeading({ level: parseInt(action[1], 10) as 1 | 2 | 3 | 4 }).run(); break;
    case "paragraph": chain().setParagraph().run(); break;
    case "blockquote": chain().toggleBlockquote().run(); break;
    case "bulletList": chain().toggleBulletList().run(); break;
    case "orderedList": chain().toggleOrderedList().run(); break;
    case "alignLeft": chain().setTextAlign("left").run(); break;
    case "alignCenter": chain().setTextAlign("center").run(); break;
    case "alignRight": chain().setTextAlign("right").run(); break;
    case "clearFormat": chain().setParagraph().unsetAllMarks().setTextAlign("left").run(); break;
    case "hr": chain().setHorizontalRule().run(); break;
    case "wrapDoubleQuote": wrapSelection(editor, ["“", "”"]); break;
    case "wrapSingleQuote": wrapSelection(editor, ["‘", "’"]); break;
    case "toggleComment": toggleLinePrefix(editor, "% "); break;
    case "toggleIgnore": toggleLinePrefix(editor, "%~ "); break;
    case "insertText":
      if (arg) chain().insertContent(arg).run();
      break;
    case "insertKeyword":
      if (arg) chain().insertContent(`@${arg}: `).run();
      break;
    case "insertComment":
      if (arg) chain().insertContent(`%${arg}: `).run();
      break;
    case "insertField":
      if (arg) chain().insertContent(`[field:${arg}]`).run();
      break;
    case "insertFootnote": {
      const key = `fn${Date.now().toString(36)}`;
      chain().insertContent(`[footnote:${key}]`).insertContent(`\n%Footnote.${key}: `).run();
      break;
    }
    case "insertVspace": chain().insertContent(arg ? `[vspace:${arg}]` : "[vspace]").run(); break;
    case "insertNewPage": chain().insertContent("[new page]").run(); break;
  }
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
  const [searchBar, setSearchBar] = useState<{ open: boolean; mode: "find" | "replace" }>({ open: false, mode: "find" });
  const searchRef = useRef<{ next: () => void; prev: () => void; replaceNext: () => void } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Placeholder.configure({
        placeholder: "从这里开始你的故事……",
      }),
      Typography,
      Highlight,
      Superscript,
      Subscript,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
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
        // 拼写检查:浏览器原生(contenteditable spellcheck),由设置开关。
        spellcheck: appSettings.spellCheck ? "true" : "false",
        lang: appSettings.spellCheckLang || "zh-CN",
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

  // 撤销/重做桥接给命令层(菜单栏「编辑」菜单);编辑器卸载后菜单项自然禁用。
  useEffect(() => {
    if (!editor) return;
    return registerEditorContext({
      undo: () => editor.chain().focus().undo().run(),
      redo: () => editor.chain().focus().redo().run(),
      canUndo: () => !editor.isDestroyed && editor.can().undo(),
      canRedo: () => !editor.isDestroyed && editor.can().redo(),
      exec: (action, arg) => {
        if (action === "searchOpen") {
          setSearchBar({ open: true, mode: arg === "replace" ? "replace" : "find" });
        } else if (action === "searchNext") searchRef.current?.next();
        else if (action === "searchPrev") searchRef.current?.prev();
        else if (action === "searchReplaceNext") searchRef.current?.replaceNext();
        else if (action === "selectAll") editor.chain().focus().selectAll().run();
        else if (action === "selectParagraph") {
          const { $from } = editor.state.selection;
          editor.chain().focus().setTextSelection({ from: $from.start(), to: $from.end() }).run();
        } else if (action === "bangHeading" && arg) {
          // ! 变体标题:切到对应级别并在文本前加「! 」标记(解析层识别)。
          const level = parseInt(arg, 10) as 1 | 2 | 3;
          editor.chain().focus().setHeading({ level }).run();
          const { $from } = editor.state.selection;
          if (!$from.parent.textContent.startsWith("!")) {
            editor.view.dispatch(editor.state.tr.insertText("! ", $from.start()));
          }
        } else if (action === "importText") {
          void importTextIntoEditor(editor);
        } else if (action === "moveToNew") {
          void moveSelectionToNewDoc(editor);
        } else if (action === "spellRerun") {
          // 翻转 spellcheck 强制浏览器重跑。
          const el = editor.view.dom as HTMLElement;
          const cur = el.getAttribute("spellcheck") === "true";
          el.setAttribute("spellcheck", "false");
          void Promise.resolve().then(() => el.setAttribute("spellcheck", cur ? "true" : "false"));
        } else execEditorAction(editor, action, arg);
      },
    });
  }, [editor]);

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

  // 拼写检查开关/语言变化时同步到 DOM(spellcheck 属性只在挂载时写入,
  //  原生检查器需要重新挂载或手动翻转才能重跑)。
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const el = editor.view.dom as HTMLElement;
    el.setAttribute("spellcheck", appSettings.spellCheck ? "true" : "false");
    el.setAttribute("lang", appSettings.spellCheckLang || "zh-CN");
    // 翻转一次强制浏览器重跑检查。
    el.blur();
    el.focus();
  }, [editor, appSettings.spellCheck, appSettings.spellCheckLang]);

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
        return;
      }
      if (matchesKeys(e.nativeEvent, shortcutFor("findInDoc", appSettings.shortcuts))) {
        e.preventDefault();
        setSearchBar({ open: true, mode: "find" });
        return;
      }
      if (matchesKeys(e.nativeEvent, shortcutFor("replaceInDoc", appSettings.shortcuts))) {
        e.preventDefault();
        setSearchBar({ open: true, mode: "replace" });
        return;
      }
      if (e.nativeEvent.key === "F3" && searchBar.open) {
        e.preventDefault();
        if (e.nativeEvent.shiftKey) searchRef.current?.prev();
        else searchRef.current?.next();
        return;
      }
      if (!editor || editor.isDestroyed) return;
      const ev = e.nativeEvent;
      const mod = ev.ctrlKey || ev.metaKey;
      if (!mod) return;
      // novelWriter 格式快捷键:Ctrl+1-4 标题、Ctrl+5-7 对齐、Ctrl+8/9 缩进、
      // Ctrl+0 移除块格式、Ctrl+B/I/D/M 行内格式、Ctrl+"/' 引号环绕、
      // Ctrl+/ 切换注释、Ctrl+Shift+D 切换忽略文本。
      const chain = () => editor.chain().focus();
      if (/^[1-4]$/.test(ev.key)) {
        e.preventDefault();
        chain().toggleHeading({ level: parseInt(ev.key, 10) as 1 | 2 | 3 | 4 }).run();
      } else if (ev.key === "5") {
        e.preventDefault();
        chain().setTextAlign("left").run();
      } else if (ev.key === "6") {
        e.preventDefault();
        chain().setTextAlign("center").run();
      } else if (ev.key === "7") {
        e.preventDefault();
        chain().setTextAlign("right").run();
      } else if (ev.key === "0") {
        e.preventDefault();
        chain().setParagraph().unsetAllMarks().setTextAlign("left").run();
      } else if (ev.key.toLowerCase() === "d" && ev.shiftKey) {
        e.preventDefault();
        toggleLinePrefix(editor, "%~ ");
      } else if (ev.key.toLowerCase() === "d") {
        e.preventDefault();
        chain().toggleStrike().run();
      } else if (ev.key.toLowerCase() === "m") {
        e.preventDefault();
        chain().toggleHighlight().run();
      } else if (ev.key === "/") {
        e.preventDefault();
        toggleLinePrefix(editor, "% ");
      } else if (ev.key === '"' || ev.key === "'") {
        e.preventDefault();
        wrapSelection(editor, ev.key === '"' ? ["“", "”"] : ["‘", "’"]);
      }
    },
    [onSave, appSettings.shortcuts, editor, searchBar.open],
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
              shortcut: `${mod}+${level}`,
              onClick: () => editor.chain().focus().toggleHeading({ level }).run(),
            })),
          },
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
        className="inkwell-editor relative min-h-0 w-full flex-1 overflow-y-auto bg-paper transition-all duration-300 dark:bg-paper-dark"
        style={{ padding: `0 ${appSettings.editorPadding}px` }}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
        onContextMenuCapture={handleContextMenu}
      >
        <EditorSearchBar
          editor={editor}
          open={searchBar.open}
          mode={searchBar.mode}
          onClose={() => setSearchBar({ open: false, mode: "find" })}
          navRef={searchRef}
        />
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
