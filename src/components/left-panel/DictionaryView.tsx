import { useMemo, useRef, useState } from "react";
import { ArrowLeft, BookMarked, Check, ChevronDown, Plus, Search, Trash2, X } from "lucide-react";
import { useAppStore } from "../../store";
import { cn } from "../../lib/utils";
import { DICT_CATEGORIES } from "../../types";
import type { DictEntry } from "../../types";
import { ConfirmDialog } from "../ConfirmDialog";

// 设定词典：小说世界观设定库（人物卡、地点、势力……）。
// 列表按分类分组折叠展示，分类行即快捷目录——点分类跳转/收起，「全部」
// 一键展开；搜索时自动命中词名/别名/内容并展开所在分组。点词条进入
// 全高度详情编辑（返回键回到列表），输入即防抖自动保存。
export function DictionaryView() {
  const dictEntries = useAppStore((s) => s.dictEntries);
  const activeDictId = useAppStore((s) => s.activeDictId);
  const setActiveDict = useAppStore((s) => s.setActiveDict);
  const addDictEntry = useAppStore((s) => s.addDictEntry);
  const updateDictEntry = useAppStore((s) => s.updateDictEntry);
  const removeDictEntry = useAppStore((s) => s.removeDictEntry);
  const [query, setQuery] = useState("");
  // 收起的分类集合：默认全部展开，点分类名收起/展开。
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  // 分类锚点：点顶部分类 chip 滚动定位到对应分组（快捷跳转）。
  const groupRefs = useRef<Map<string, HTMLElement>>(new Map());

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

  const searching = query.trim().length > 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return dictEntries;
    return dictEntries.filter(
      (e) =>
        e.term.toLowerCase().includes(q) ||
        e.aliases.some((a) => a.toLowerCase().includes(q)) ||
        e.content.toLowerCase().includes(q),
    );
  }, [dictEntries, query]);

  // 分组：按分类聚合，组内按更新时间倒序；空分类不显示。
  const groups = useMemo(() => {
    const map = new Map<string, DictEntry[]>();
    for (const e of filtered) {
      const key = e.category || "未分类";
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
    const order = [...allCategories, "未分类"].filter((c) => map.has(c));
    return order.map((c) => ({
      category: c,
      entries: map.get(c)!.sort((a, b) => b.updatedAt - a.updatedAt),
    }));
  }, [filtered, allCategories]);

  const toggleGroup = (category: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  // 快捷跳转：滚动到分组并确保展开；已展开且在视野内时切换为收起。
  const jumpToGroup = (category: string) => {
    if (collapsed.has(category)) {
      toggleGroup(category);
      requestAnimationFrame(() => {
        groupRefs.current.get(category)?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
      return;
    }
    const el = groupRefs.current.get(category);
    if (el) {
      el.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  };

  // 详情视图：词条占满侧栏剩余高度，编辑不再被列表挤压。
  if (active) {
    return (
      <div className="flex h-full flex-col">
        <EntryDetail
          entry={active}
          allCategories={allCategories}
          onBack={() => setActiveDict(null)}
          onUpdate={(data) => updateDictEntry(active.id, data)}
          onDelete={() => setConfirmingDelete(active.id)}
        />
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
          onClick={() => addDictEntry()}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warm-gray hover:text-accent dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
          title="新建词条"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* 分类快捷目录：点击跳转并展开；「全部」一键展开所有分组 */}
      {dictEntries.length > 0 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-warm-gray px-3 py-1.5 scrollbar-hide dark:border-warm-gray-dark">
          <FilterChip active={collapsed.size === 0} onClick={() => setCollapsed(new Set())}>
            全部
          </FilterChip>
          {groups.map((g) => (
            <FilterChip key={g.category} active={!collapsed.has(g.category)} onClick={() => jumpToGroup(g.category)}>
              {g.category}
            </FilterChip>
          ))}
        </div>
      )}

      {/* 分组词条列表：占满剩余空间 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <BookMarked size={26} className="text-ink-muted/40 dark:text-ink-muted-dark/40" />
            <p className="text-xs leading-relaxed text-ink-muted dark:text-ink-muted-dark">
              {dictEntries.length === 0 ? (
                <>
                  词典是小说的设定库。
                  <br />
                  人物卡、地名、势力关系，随查随写。
                </>
              ) : (
                "没有匹配的词条"
              )}
            </p>
            {dictEntries.length === 0 && (
              <button
                onClick={() => addDictEntry()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-light"
              >
                <Plus size={14} />
                新建词条
              </button>
            )}
          </div>
        ) : (
          groups.map((g) => {
            const isCollapsed = !searching && collapsed.has(g.category);
            return (
              <div
                key={g.category}
                ref={(el) => {
                  if (el) groupRefs.current.set(g.category, el);
                  else groupRefs.current.delete(g.category);
                }}
              >
                {/* 分组头：分类名 + 数量 + 组内新建 + 折叠开关 */}
                <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-warm-gray/60 bg-paper px-3 py-1.5 dark:border-warm-gray-dark/60 dark:bg-paper-dark">
                  <button
                    onClick={() => toggleGroup(g.category)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <ChevronDown
                      size={13}
                      className={cn(
                        "shrink-0 text-ink-muted transition-transform dark:text-ink-muted-dark",
                        isCollapsed && "-rotate-90",
                      )}
                    />
                    <span className="truncate text-xs font-medium text-ink dark:text-ink-dark">
                      {g.category}
                    </span>
                    <span className="shrink-0 text-[10px] text-ink-muted dark:text-ink-muted-dark">
                      {g.entries.length}
                    </span>
                  </button>
                  <button
                    onClick={() => addDictEntry(g.category === "未分类" ? undefined : g.category)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-muted transition-colors hover:bg-warm-gray hover:text-accent dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
                    title={`在「${g.category}」下新建词条`}
                  >
                    <Plus size={12} />
                  </button>
                </div>
                {!isCollapsed &&
                  g.entries.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => setActiveDict(e.id)}
                      className="flex w-full flex-col gap-0.5 border-b border-warm-gray/40 px-3 py-2 text-left transition-colors hover:bg-warm-gray dark:border-warm-gray-dark/40 dark:hover:bg-warm-gray-dark"
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm text-ink dark:text-ink-dark">
                          {e.term || "未命名词条"}
                        </span>
                        {e.aliases.length > 0 && (
                          <span className="shrink-0 truncate text-[11px] text-ink-muted dark:text-ink-muted-dark">
                            {e.aliases.join(" / ")}
                          </span>
                        )}
                      </span>
                      {e.content.trim() && (
                        <span className="line-clamp-1 text-[11px] leading-relaxed text-ink-muted/80 dark:text-ink-muted-dark/80">
                          {e.content.trim()}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// 词条详情：词条名 / 分类 / 别名 / 设定详情，占满侧栏高度。
function EntryDetail({
  entry,
  allCategories,
  onBack,
  onUpdate,
  onDelete,
}: {
  entry: DictEntry;
  allCategories: string[];
  onBack: () => void;
  onUpdate: (data: Partial<DictEntry>) => void;
  onDelete: () => void;
}) {
  const [customCategory, setCustomCategory] = useState(
    () =>
      !!entry.category &&
      !(DICT_CATEGORIES as readonly string[]).includes(entry.category),
  );

  return (
    <>
      {/* 标题栏：返回 + 词条名 + 删除 */}
      <div className="flex shrink-0 items-center gap-1 border-b border-warm-gray px-2 py-1.5 dark:border-warm-gray-dark">
        <button
          onClick={onBack}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
          title="返回词条列表"
        >
          <ArrowLeft size={15} />
        </button>
        <input
          value={entry.term}
          onChange={(e) => onUpdate({ term: e.target.value })}
          placeholder="词条名（如：顾云峥）"
          className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 text-sm font-medium text-ink outline-none placeholder:text-ink-muted/50 dark:text-ink-dark"
        />
        <button
          onClick={onDelete}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-ink-muted-dark"
          title="删除词条"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* 元信息：分类 + 别名，内容超长时独立滚动，不挤压详情区 */}
      <div className="max-h-40 shrink-0 space-y-2 overflow-y-auto border-b border-warm-gray px-3 py-2.5 dark:border-warm-gray-dark">
        <div className="flex flex-wrap items-center gap-1">
          {allCategories.map((c) => (
            <button
              key={c}
              onClick={() => {
                setCustomCategory(false);
                onUpdate({ category: c });
              }}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                !customCategory && entry.category === c
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
              value={entry.category}
              onChange={(e) => onUpdate({ category: e.target.value })}
              placeholder="输入分类名"
              className="w-24 rounded-md border border-accent bg-paper px-2 py-0.5 text-[11px] text-ink outline-none dark:bg-paper-dark dark:text-ink-dark"
            />
          )}
        </div>

        <AliasesEditor aliases={entry.aliases} onChange={(aliases) => onUpdate({ aliases })} />
      </div>

      {/* 设定详情：占满剩余高度 */}
      <textarea
        value={entry.content}
        onChange={(e) => onUpdate({ content: e.target.value })}
        placeholder="设定详情……（自动保存）"
        className="min-h-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-muted/50 dark:text-ink-dark"
      />
    </>
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
