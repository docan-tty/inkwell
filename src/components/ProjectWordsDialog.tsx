import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { useAppStore } from "../store";
import { loadProjectWords, saveProjectWords } from "../lib/storage";

// 项目单词列表(novelWriter「项目单词列表」):拼写检查的自定义词典,
// 存于作品文件夹 wordlist.json,随作品迁移。
export function ProjectWordsDialog() {
  const open = useAppStore((s) => s.projectWordsOpen);
  const setOpen = useAppStore((s) => s.setProjectWordsOpen);
  const currentProject = useAppStore((s) => s.currentProject);
  const appSettings = useAppStore((s) => s.appSettings);
  const [words, setWords] = useState<string[]>([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    if (!open || !currentProject) return;
    void loadProjectWords(currentProject.id, appSettings).then(setWords);
  }, [open, currentProject, appSettings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, setOpen]);

  if (!open || !currentProject) return null;

  const persist = (next: string[]) => {
    setWords(next);
    void saveProjectWords(currentProject.id, next, appSettings);
  };

  const add = () => {
    const w = input.trim();
    if (!w || words.includes(w)) {
      setInput("");
      return;
    }
    persist([...words, w].sort((a, b) => a.localeCompare(b, "zh-CN")));
    setInput("");
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 animate-[inkwell-fade-in_0.15s_ease-out]" onClick={() => setOpen(false)}>
      <div
        className="flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-warm-gray bg-paper shadow-2xl dark:border-warm-gray-dark dark:bg-paper-dark animate-[inkwell-pop-in_0.15s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-warm-gray px-4 dark:border-warm-gray-dark">
          <span className="text-sm font-medium text-ink dark:text-ink-dark">项目单词列表</span>
          <button onClick={() => setOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark">
            <X size={16} />
          </button>
        </div>
        <div className="flex shrink-0 gap-2 border-b border-warm-gray/60 p-3 dark:border-warm-gray-dark/60">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="添加自定义单词…"
            className="h-8 min-w-0 flex-1 rounded-md border border-warm-gray bg-paper px-2.5 text-sm text-ink outline-none focus:border-accent dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark"
          />
          <button onClick={add} className="flex h-8 items-center gap-1 rounded-md bg-accent px-3 text-sm text-white transition-colors hover:bg-accent-light">
            <Plus size={13} />
            添加
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {words.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted dark:text-ink-muted-dark">
              还没有自定义单词。拼写检查时标记为错误的词可以加到这里,之后不再提示。
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {words.map((w) => (
                <span key={w} className="group flex items-center gap-1 rounded-full border border-warm-gray bg-warm-gray/40 px-2.5 py-1 text-xs text-ink dark:border-warm-gray-dark dark:bg-warm-gray-dark/40 dark:text-ink-dark">
                  {w}
                  <button
                    onClick={() => persist(words.filter((x) => x !== w))}
                    className="text-ink-muted transition-colors hover:text-red-500 dark:text-ink-muted-dark"
                    title="移除"
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
