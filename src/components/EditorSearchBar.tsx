import { useCallback, useEffect, useRef, useState } from "react";
import { CaseSensitive, ChevronDown, ChevronUp, Regex, Replace, ReplaceAll, WholeWord, X } from "lucide-react";
import { cn } from "../lib/utils";
import type { Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";

// 文档内查找替换栏(novelWriter 式):Ctrl+F 查找 / Ctrl+H 替换,
// Enter / Shift+Enter(或 F3 / Shift+F3)前后导航,替换下一个 Enter,
// 支持大小写 / 全词 / 正则 / 循环。直接在 ProseMirror 文档上操作。

interface Props {
  editor: Editor | null;
  open: boolean;
  mode: "find" | "replace";
  onClose: () => void;
  /** 暴露 next/prev/replaceNext 给父级(命令层快捷键)。 */
  navRef?: React.MutableRefObject<{ next: () => void; prev: () => void; replaceNext: () => void } | null>;
}

interface Match {
  from: number;
  to: number;
}

function buildRegex(query: string, caseSensitive: boolean, wholeWord: boolean, useRegex: boolean): RegExp | null {
  if (!query) return null;
  let src = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (wholeWord) src = `\\b(?:${src})\\b`;
  try {
    return new RegExp(src, caseSensitive ? "g" : "gi");
  } catch {
    return null;
  }
}

function findMatches(editor: Editor, re: RegExp): Match[] {
  const out: Match[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(node.text))) {
      out.push({ from: pos + m.index, to: pos + m.index + m[0].length });
      if (m[0].length === 0) re.lastIndex++;
    }
  });
  return out;
}

export function EditorSearchBar({ editor, open, mode, onClose, navRef }: Props) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const matchesRef = useRef<Match[]>([]);

  useEffect(() => {
    if (open) {
      // 预填选中文本作为查找词。
      if (editor && !editor.isDestroyed) {
        const { from, to, empty } = editor.state.selection;
        if (!empty) {
          const text = editor.state.doc.textBetween(from, to, " ").trim();
          if (text && text.length < 80) setQuery(text);
        }
      }
      setTimeout(() => inputRef.current?.select(), 30);
    } else {
      setMatchCount(0);
      setCurrentIdx(-1);
      matchesRef.current = [];
    }
  }, [open, editor]);

  const refresh = useCallback(
    (q = query, cs = caseSensitive, ww = wholeWord, rx = useRegex) => {
      if (!editor || editor.isDestroyed) return;
      const re = buildRegex(q, cs, ww, rx);
      if (!re) {
        matchesRef.current = [];
        setMatchCount(0);
        setCurrentIdx(-1);
        return;
      }
      const matches = findMatches(editor, re);
      matchesRef.current = matches;
      setMatchCount(matches.length);
      setCurrentIdx(matches.length > 0 ? 0 : -1);
    },
    [editor, query, caseSensitive, wholeWord, useRegex],
  );

  const jumpTo = useCallback(
    (idx: number) => {
      if (!editor || editor.isDestroyed) return;
      const matches = matchesRef.current;
      if (matches.length === 0) return;
      const wrapped = ((idx % matches.length) + matches.length) % matches.length;
      const m = matches[wrapped];
      editor.chain().focus().setTextSelection({ from: m.from, to: m.to }).scrollIntoView().run();
      setCurrentIdx(wrapped);
    },
    [editor],
  );

  const findNext = useCallback(() => {
    refresh();
    jumpTo(currentIdx + 1);
  }, [refresh, jumpTo, currentIdx]);
  const findPrev = useCallback(() => {
    refresh();
    jumpTo(currentIdx - 1);
  }, [refresh, jumpTo, currentIdx]);

  // 暴露给命令层(F3 / Shift+F3 / Ctrl+Shift+1 不走本组件键盘事件时)。
  useEffect(() => {
    if (!navRef) return;
    navRef.current = { next: findNext, prev: findPrev, replaceNext: replaceCurrent };
    return () => {
      navRef.current = null;
    };
  });

  const replaceCurrent = useCallback(() => {
    refresh();
    if (!editor || editor.isDestroyed || currentIdx < 0) return;
    const m = matchesRef.current[currentIdx];
    if (!m) return;
    const tr = editor.state.tr.insertText(replacement, m.from, m.to);
    tr.setSelection(TextSelection.create(tr.doc, m.from + replacement.length));
    editor.view.dispatch(tr);
    // 替换后重算并跳到下一个。
    refresh(query, caseSensitive, wholeWord, useRegex);
    setTimeout(() => jumpTo(currentIdx), 30);
  }, [editor, currentIdx, replacement, refresh, query, caseSensitive, wholeWord, useRegex, jumpTo]);

  const replaceAll = useCallback(() => {
    refresh();
    if (!editor || editor.isDestroyed) return;
    const matches = matchesRef.current;
    if (matches.length === 0) return;
    const tr = editor.state.tr;
    // 倒序替换,位置不失效。
    for (let i = matches.length - 1; i >= 0; i--) {
      tr.insertText(replacement, matches[i].from, matches[i].to);
    }
    editor.view.dispatch(tr);
    refresh(query, caseSensitive, wholeWord, useRegex);
  }, [editor, replacement, refresh, query, caseSensitive, wholeWord, useRegex]);

  if (!open || !editor) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) findPrev();
      else if (mode === "replace" && document.activeElement !== inputRef.current) replaceCurrent();
      else findNext();
    } else if (e.key === "F3") {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) findPrev();
      else findNext();
    }
  };

  const updateQuery = (q: string) => {
    setQuery(q);
    refresh(q, caseSensitive, wholeWord, useRegex);
  };

  const toggleCase = () => { const v = !caseSensitive; setCaseSensitive(v); refresh(query, v, wholeWord, useRegex); };
  const toggleWord = () => { const v = !wholeWord; setWholeWord(v); refresh(query, caseSensitive, v, useRegex); };
  const toggleRegex = () => { const v = !useRegex; setUseRegex(v); refresh(query, caseSensitive, wholeWord, v); };

  return (
    <div
      className="absolute right-4 top-2 z-30 w-80 rounded-lg border border-warm-gray bg-paper p-2 shadow-lg dark:border-warm-gray-dark dark:bg-paper-dark animate-[inkwell-pop-in_0.12s_ease-out]"
      onKeyDown={onKey}
    >
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          placeholder="查找…"
          className="h-7 min-w-0 flex-1 rounded-md border border-warm-gray bg-paper px-2 text-sm text-ink outline-none focus:border-accent dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark"
        />
        <Toggle title="区分大小写" active={caseSensitive} onClick={toggleCase} icon={<CaseSensitive size={14} />} />
        <Toggle title="全词匹配" active={wholeWord} onClick={toggleWord} icon={<WholeWord size={14} />} />
        <Toggle title="正则表达式" active={useRegex} onClick={toggleRegex} icon={<Regex size={14} />} />
        <span className="w-12 shrink-0 text-center text-[11px] tabular-nums text-ink-muted dark:text-ink-muted-dark">
          {matchCount > 0 ? `${currentIdx + 1}/${matchCount}` : "0/0"}
        </span>
        <button onClick={findPrev} className="flex h-6 w-6 items-center justify-center rounded text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark" title="上一个 (Shift+Enter)">
          <ChevronUp size={14} />
        </button>
        <button onClick={findNext} className="flex h-6 w-6 items-center justify-center rounded text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark" title="下一个 (Enter)">
          <ChevronDown size={14} />
        </button>
        <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark" title="关闭 (Esc)">
          <X size={14} />
        </button>
      </div>
      {mode === "replace" && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder="替换为…"
            className="h-7 min-w-0 flex-1 rounded-md border border-warm-gray bg-paper px-2 text-sm text-ink outline-none focus:border-accent dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark"
          />
          <button
            onClick={replaceCurrent}
            disabled={currentIdx < 0}
            className="flex h-7 items-center gap-1 rounded-md bg-accent px-2 text-xs text-white transition-colors hover:bg-accent-light disabled:opacity-40"
            title="替换当前并找下一个 (Enter)"
          >
            <Replace size={12} />
            替换
          </button>
          <button
            onClick={replaceAll}
            disabled={matchCount === 0}
            className="flex h-7 items-center gap-1 rounded-md border border-warm-gray px-2 text-xs text-ink transition-colors hover:bg-warm-gray disabled:opacity-40 dark:border-warm-gray-dark dark:text-ink-dark dark:hover:bg-warm-gray-dark"
            title="全部替换"
          >
            <ReplaceAll size={12} />
            全部
          </button>
        </div>
      )}
    </div>
  );
}

function Toggle({ title, active, onClick, icon }: { title: string; active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded transition-colors",
        active ? "bg-accent/15 text-accent dark:bg-accent/25" : "text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark",
      )}
    >
      {icon}
    </button>
  );
}
