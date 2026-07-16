import { useMemo, useState } from "react";
import { BookMarked, Check, Plus, Search, Trash2, X } from "lucide-react";
import { useAppStore } from "../../store";
import { cn } from "../../lib/utils";
import { DICT_CATEGORIES } from "../../types";
import { ConfirmDialog } from "../ConfirmDialog";

// 设定词典：小说世界观设定库（人物卡、地点、势力……）。
// 左侧栏页签内的独立区域：上方搜索 + 分类筛选，中部词条列表，下方词条编辑器。
// 输入即防抖自动保存，存储于 dictionary/<projectId>.json。
export function DictionaryView() {
  const {
    dictEntries,
    activeDictId,
    setActiveDict,
    addDictEntry,
    updateDictEntry,
    removeDictEntry,
  } = useAppStore();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [customCategory, setCustomCategory] = useState(false);

  const active = dictEntries.find((e) => e.id === activeDictId) || null;

  // All categories in use: presets plus any custom ones present in entries.
  const allCategories = useMemo(() => {
    const custom = new Set<string>();
    for (const e of dictEntries) {
      if (e.category && !(DICT_CATEGORIES as readonly string[]).includes(e.category)) {
        custom.add(e.category);
      }
    }
    return [...DICT_CATEGORIES, ...custom];
  }, [dictEntries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dictEntries
      .filter((e) => (categoryFilter ? e.category === categoryFilter : true))
      .filter((e) => {
        if (!q) return true;
        return (
          e.term.toLowerCase().includes(q) ||
          e.aliases.some((a) => a.toLowerCase().includes(q)) ||
          e.content.toLowerCase().includes(q)
        );
      });
  }, [dictEntries, query, categoryFilter]);

  return (
    <div className="flex h-full flex-col">
      {/* 搜索 + 新建 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-warm-gray px-3 py-2 dark:border-warm-gray-dark">
        <div className="relative min-w-0 flex-1">
          <Search
            size={13}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted dark:text-ink-muted-dark"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索词条 / 别名 / 内容"
            className="w-full rounded-md border border-warm-gray bg-paper py-1 pl-7 pr-2 text-xs text-ink outline-none transition-colors placeholder:text-ink-muted/50 focus:border-accent dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark"
          />
        </div>
        <button
          onClick={addDictEntry}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warm-gray hover:text-accent dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
          title="新建词条"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* 分类筛选 */}
      {dictEntries.length > 0 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-warm-gray px-3 py-1.5 scrollbar-hide dark:border-warm-gray-dark">
          <FilterChip active={categoryFilter === null} onClick={() => setCategoryFilter(null)}>
            全部
          </FilterChip>
          {allCategories.map((c) => (
            <FilterChip
              key={c}
              active={categoryFilter === c}
              onClick={() => setCategoryFilter(categoryFilter === c ? null : c)}
            >
              {c}
            </FilterChip>
          ))}
        </div>
      )}

      {/* 词条列表 */}
      <div className="max-h-44 shrink-0 overflow-y-auto border-b border-warm-gray dark:border-warm-gray-dark">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-ink-muted dark:text-ink-muted-dark">
            {dictEntries.length === 0 ? "还没有词条，点右上角 + 创建第一张设定卡" : "没有匹配的词条"}
          </div>
        ) : (
          filtered.map((e) => (
            <button
              key={e.id}
              onClick={() => setActiveDict(e.id)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
                e.id === activeDictId
                  ? "bg-accent/10 dark:bg-accent/20"
                  : "hover:bg-warm-gray dark:hover:bg-warm-gray-dark",
              )}
            >
              <span
                className={cn(
                  "shrink-0 rounded px-1 py-0.5 text-[10px]",
                  e.id === activeDictId
                    ? "bg-accent/20 text-accent"
                    : "bg-warm-gray text-ink-muted dark:bg-warm-gray-dark dark:text-ink-muted-dark",
                )}
              >
                {e.category || "未分类"}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  e.id === activeDictId
                    ? "font-medium text-accent"
                    : "text-ink dark:text-ink-dark",
                )}
              >
                {e.term || "未命名词条"}
              </span>
              {e.aliases.length > 0 && (
                <span className="shrink-0 truncate text-[10px] text-ink-muted dark:text-ink-muted-dark">
                  {e.aliases[0]}
                </span>
              )}
            </button>
          ))
        )}
      </div>

      {/* 编辑器 */}
      {active ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
          <div className="flex items-center gap-2">
            <input
              value={active.term}
              onChange={(e) => updateDictEntry(active.id, { term: e.target.value })}
              placeholder="词条名（如：顾云峥）"
              className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 text-sm font-medium text-ink outline-none placeholder:text-ink-muted/50 dark:text-ink-dark"
            />
            <button
              onClick={() => setConfirmingDelete(active.id)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-ink-muted-dark"
              title="删除词条"
            >
              <Trash2 size={14} />
            </button>
          </div>

          {/* 分类 */}
          <div className="flex flex-wrap items-center gap-1">
            {allCategories.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCustomCategory(false);
                  updateDictEntry(active.id, { category: c });
                }}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                  !customCategory && active.category === c
                    ? "border-accent bg-accent/10 text-accent dark:bg-accent/20"
                    : "border-warm-gray text-ink-muted hover:border-accent/50 dark:border-warm-gray-dark dark:text-ink-muted-dark",
                )}
              >
                {c}
              </button>
            ))}
            <button
              onClick={() => setCustomCategory(true)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                customCategory
                  ? "border-accent bg-accent/10 text-accent dark:bg-accent/20"
                  : "border-dashed border-warm-gray text-ink-muted hover:border-accent/50 dark:border-warm-gray-dark dark:text-ink-muted-dark",
              )}
            >
              自定义…
            </button>
            {customCategory && (
              <input
                autoFocus
                value={active.category}
                onChange={(e) => updateDictEntry(active.id, { category: e.target.value })}
                placeholder="输入分类名"
                className="w-24 rounded-md border border-accent bg-paper px-2 py-0.5 text-[11px] text-ink outline-none dark:bg-paper-dark dark:text-ink-dark"
              />
            )}
          </div>

          {/* 别名 */}
          <AliasesEditor
            aliases={active.aliases}
            onChange={(aliases) => updateDictEntry(active.id, { aliases })}
          />

          {/* 内容 */}
          <textarea
            value={active.content}
            onChange={(e) => updateDictEntry(active.id, { content: e.target.value })}
            placeholder="设定详情……（自动保存）"
            className="min-h-0 flex-1 resize-none rounded-md bg-transparent py-1 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-muted/50 dark:text-ink-dark"
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <BookMarked size={26} className="text-ink-muted/40 dark:text-ink-muted-dark/40" />
          <p className="text-xs leading-relaxed text-ink-muted dark:text-ink-muted-dark">
            词典是小说的设定库。
            <br />
            人物卡、地名、势力关系，随查随写。
          </p>
          <button
            onClick={addDictEntry}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-light"
          >
            <Plus size={14} />
            新建词条
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmingDelete !== null}
        title="删除词条？"
        message="这个词条及其设定内容将被删除，且无法恢复。"
        confirmLabel="删除"
        danger
        onConfirm={() => {
          if (confirmingDelete) removeDictEntry(confirmingDelete);
          setConfirmingDelete(null);
        }}
        onCancel={() => setConfirmingDelete(null)}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] transition-colors",
        active
          ? "bg-accent/15 font-medium text-accent"
          : "text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark",
      )}
    >
      {children}
    </button>
  );
}

// Aliases as removable chips + inline add input (Enter / 逗号 confirms).
function AliasesEditor({
  aliases,
  onChange,
}: {
  aliases: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const value = draft.trim().replace(/[,，]$/, "");
    if (value && !aliases.includes(value)) onChange([...aliases, value]);
    setDraft("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark">别名</span>
      {aliases.map((a) => (
        <span
          key={a}
          className="group flex items-center gap-0.5 rounded-full bg-warm-gray px-2 py-0.5 text-[11px] text-ink dark:bg-warm-gray-dark dark:text-ink-dark"
        >
          {a}
          <button
            onClick={() => onChange(aliases.filter((x) => x !== a))}
            className="text-ink-muted transition-colors hover:text-red-500 dark:text-ink-muted-dark"
            title="移除别名"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => {
          const v = e.target.value;
          if (/[,，]$/.test(v)) {
            setDraft(v);
            setTimeout(commit, 0);
          } else {
            setDraft(v);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder="回车添加"
        className="w-16 min-w-0 rounded bg-transparent px-1 py-0.5 text-[11px] text-ink outline-none placeholder:text-ink-muted/40 dark:text-ink-dark"
      />
      {aliases.length > 0 && (
        <Check size={11} className="text-ink-muted/40 dark:text-ink-muted-dark/40" aria-hidden />
      )}
    </div>
  );
}
