import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, Plus, RefreshCw, Settings2, Trash2, X } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../store";
import { ROOT_DEFS, ROOT_KIND_ORDER } from "../types";
import {
  buildBlocks,
  buildStats,
  DEFAULT_BUILD_SETTINGS,
  renderHtml,
  renderMarkdown,
  renderPlainText,
  selectBuildDocuments,
  type BuildDoc,
  type BuildSettings,
} from "../lib/manuscript";
import { chapterRootKind } from "../lib/docs";
import { loadBuildsFromLocal, saveBuildsToLocal, grantExportPath, writeTextFile, isTauri } from "../lib/storage";
import { sanitizeFileName } from "../lib/utils";
import { generateId, cn, formatNumber } from "../lib/utils";

interface BuildDef {
  id: string;
  name: string;
  settings: BuildSettings;
}

type OutputFormat = "html" | "md" | "txt";

// 手稿构建工具(novelWriter F5):左列构建定义 + 设置页(选择/标题/格式/
// 内容),右侧预览 + 大纲 + 统计,底部导出 HTML / Markdown / 纯文本。
export function ManuscriptDialog() {
  const open = useAppStore((s) => s.manuscriptOpen);
  const setManuscriptOpen = useAppStore((s) => s.setManuscriptOpen);
  const currentProject = useAppStore((s) => s.currentProject);
  const chapters = useAppStore((s) => s.chapters);
  const volumes = useAppStore((s) => s.volumes);
  const tagsIndex = useAppStore((s) => s.tagsIndex);
  const appSettings = useAppStore((s) => s.appSettings);
  const getChapterContent = useAppStore((s) => s.getChapterContent);

  const [builds, setBuilds] = useState<BuildDef[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settings, setSettings] = useState<BuildSettings>(DEFAULT_BUILD_SETTINGS);
  const [tab, setTab] = useState<"select" | "headings" | "format" | "content">("select");
  const [docs, setDocs] = useState<BuildDoc[]>([]);
  const [previewHtml, setPreviewHtml] = useState("");
  const [showSettings, setShowSettings] = useState(true);
  const [exporting, setExporting] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // 载入构建定义。
  useEffect(() => {
    if (!open || !currentProject) return;
    void loadBuildsFromLocal<BuildDef>(currentProject.id, appSettings).then((loaded) => {
      if (loaded.length === 0) {
        const def: BuildDef = { id: generateId(), name: "我的手稿", settings: DEFAULT_BUILD_SETTINGS };
        setBuilds([def]);
        setActiveId(def.id);
        setSettings(def.settings);
      } else {
        setBuilds(loaded);
        setActiveId(loaded[0].id);
        setSettings(loaded[0].settings);
      }
    });
  }, [open, currentProject, appSettings]);

  const persist = useCallback(
    (next: BuildDef[]) => {
      setBuilds(next);
      if (currentProject) void saveBuildsToLocal(currentProject.id, next, appSettings);
    },
    [currentProject, appSettings],
  );

  const updateSettings = useCallback(
    (patch: Partial<BuildSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        persist(builds.map((b) => (b.id === activeId ? { ...b, settings: next } : b)));
        return next;
      });
    },
    [builds, activeId, persist],
  );

  // 选中文档(选择页显示 + 构建输入)。
  const selectedChapters = useMemo(
    () => selectBuildDocuments(chapters, volumes, settings),
    [chapters, volumes, settings],
  );

  // 加载所选文档正文并构建预览。
  const rebuild = useCallback(async () => {
    const loaded: BuildDoc[] = await Promise.all(
      selectedChapters.map(async (c) => ({ chapter: c, html: await getChapterContent(c.id).catch(() => "") })),
    );
    setDocs(loaded);
    const blocks = buildBlocks(loaded, volumes, settings, tagsIndex);
    setPreviewHtml(renderHtml(blocks, settings, currentProject?.name ?? "手稿"));
  }, [selectedChapters, volumes, settings, tagsIndex, getChapterContent, currentProject]);

  useEffect(() => {
    if (open) void rebuild();
  }, [open, rebuild]);

  const blocks = useMemo(
    () => buildBlocks(docs, volumes, settings, tagsIndex),
    [docs, volumes, settings, tagsIndex],
  );
  const stats = useMemo(() => buildStats(blocks, appSettings), [blocks, appSettings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setManuscriptOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, setManuscriptOpen]);

  if (!open || !currentProject) return null;

  const doExport = async (format: OutputFormat) => {
    setExporting(true);
    try {
      const name = sanitizeFileName(currentProject.name);
      const suggested = `${name}.${format === "html" ? "html" : format}`;
      const content =
        format === "html" ? previewHtml : format === "md" ? renderMarkdown(blocks) : renderPlainText(blocks);
      if (isTauri()) {
        const path = await save({
          defaultPath: suggested,
          filters: [{ name: format.toUpperCase(), extensions: [format === "html" ? "html" : format] }],
        });
        if (!path) return;
        await grantExportPath(path);
        await writeTextFile(path, content);
        alert(`已导出:\n${path}`);
      } else {
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = suggested;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      alert(`导出失败:${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  };

  const usedRoots = new Set(chapters.map((c) => chapterRootKind(c, volumes)));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 animate-[inkwell-fade-in_0.15s_ease-out]">
      <div className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-warm-gray bg-paper shadow-2xl dark:border-warm-gray-dark dark:bg-paper-dark animate-[inkwell-pop-in_0.15s_ease-out]">
        {/* 头部 */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-warm-gray px-4 dark:border-warm-gray-dark">
          <span className="text-sm font-medium text-ink dark:text-ink-dark">手稿构建 — {currentProject.name}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={cn(
                "flex h-7 items-center gap-1 rounded-md px-2 text-xs transition-colors",
                showSettings ? "bg-accent/10 text-accent dark:bg-accent/20" : "text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark",
              )}
            >
              <Settings2 size={13} />
              设置
            </button>
            <button onClick={() => void rebuild()} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark" title="重新生成预览">
              <RefreshCw size={14} />
            </button>
            <button onClick={() => setManuscriptOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* 左:构建列表 + 设置 */}
          {showSettings && (
            <div className="flex w-80 shrink-0 flex-col border-r border-warm-gray dark:border-warm-gray-dark">
              <div className="flex shrink-0 items-center justify-between border-b border-warm-gray/60 px-3 py-2 dark:border-warm-gray-dark/60">
                <span className="text-xs font-medium text-ink-muted dark:text-ink-muted-dark">构建定义</span>
                <button
                  onClick={() => {
                    const def: BuildDef = { id: generateId(), name: `构建 ${builds.length + 1}`, settings: DEFAULT_BUILD_SETTINGS };
                    persist([...builds, def]);
                    setActiveId(def.id);
                    setSettings(def.settings);
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
                  title="新建构建"
                >
                  <Plus size={13} />
                </button>
              </div>
              <div className="max-h-28 shrink-0 overflow-y-auto border-b border-warm-gray/60 dark:border-warm-gray-dark/60">
                {builds.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => {
                      setActiveId(b.id);
                      setSettings(b.settings);
                    }}
                    className={cn(
                      "group flex cursor-pointer items-center justify-between px-3 py-1.5 text-sm transition-colors",
                      activeId === b.id ? "bg-accent/10 text-accent dark:bg-accent/15" : "text-ink hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark",
                    )}
                  >
                    <span className="truncate">{b.name}</span>
                    {builds.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = builds.filter((x) => x.id !== b.id);
                          persist(next);
                          if (activeId === b.id && next[0]) {
                            setActiveId(next[0].id);
                            setSettings(next[0].settings);
                          }
                        }}
                        className="invisible flex h-5 w-5 items-center justify-center rounded text-ink-muted hover:text-red-500 group-hover:visible"
                        title="删除构建"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* 设置页签 */}
              <div className="flex shrink-0 gap-1 border-b border-warm-gray/60 px-2 py-1.5 dark:border-warm-gray-dark/60">
                {(
                  [
                    ["select", "选择"],
                    ["headings", "标题"],
                    ["format", "格式"],
                    ["content", "内容"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    className={cn(
                      "flex-1 rounded-md py-1 text-xs transition-colors",
                      tab === id ? "bg-accent/10 font-medium text-accent dark:bg-accent/20" : "text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
                {tab === "select" && (
                  <div className="space-y-3">
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-ink-muted dark:text-ink-muted-dark">根文件夹</p>
                      {ROOT_KIND_ORDER.filter((k) => usedRoots.has(k)).map((kind) => (
                        <label key={kind} className="flex cursor-pointer items-center gap-2 py-0.5 text-ink dark:text-ink-dark">
                          <input
                            type="checkbox"
                            checked={settings.includeRoots[kind] ?? kind === "novel"}
                            onChange={(e) => updateSettings({ includeRoots: { ...settings.includeRoots, [kind]: e.target.checked } })}
                            className="accent-[var(--accent)]"
                          />
                          {ROOT_DEFS[kind].label}
                        </label>
                      ))}
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-ink dark:text-ink-dark">
                      <input
                        type="checkbox"
                        checked={settings.includeInactive}
                        onChange={(e) => updateSettings({ includeInactive: e.target.checked })}
                        className="accent-[var(--accent)]"
                      />
                      包含非激活文档
                    </label>
                    <p className="text-xs leading-relaxed text-ink-muted dark:text-ink-muted-dark">
                      当前选中 {selectedChapters.length} 个文档。单个文档的包含/排除可在「内容」页调整。
                    </p>
                  </div>
                )}
                {tab === "headings" && (
                  <div className="space-y-2.5">
                    <FmtField label="书名标题 (#!)" value={settings.fmtTitle} onChange={(v) => updateSettings({ fmtTitle: v })} />
                    <FmtField label="分区标题 (#)" value={settings.fmtPartition} onChange={(v) => updateSettings({ fmtPartition: v })} />
                    <FmtField label="章节标题 (##)" value={settings.fmtChapter} onChange={(v) => updateSettings({ fmtChapter: v })} />
                    <FmtField label="场景标题 (###)" value={settings.fmtScene} onChange={(v) => updateSettings({ fmtScene: v })} hint="留空=空行分隔;静态文本=分隔符;----=分隔线" />
                    <FmtField label="小节标题 (####)" value={settings.fmtSection} onChange={(v) => updateSettings({ fmtSection: v })} />
                    <p className="text-[11px] leading-relaxed text-ink-muted dark:text-ink-muted-dark">
                      可用代码:{"{Title}"} {"{Chapter}"} {"{Chapter:Word}"} {"{Chapter:URoman}"} {"{Scene}"} {"{Scene:Abs}"} {"{Char:POV}"} {"{Char:Focus}"} {"{BR}"}
                    </p>
                  </div>
                )}
                {tab === "format" && (
                  <div className="space-y-2.5">
                    <Toggle label="标题居中" checked={settings.centerHeadings} onChange={(v) => updateSettings({ centerHeadings: v })} />
                    <Toggle label="章节前分页" checked={settings.pageBreakBeforeChapter} onChange={(v) => updateSettings({ pageBreakBeforeChapter: v })} />
                    <Toggle label="标题加粗" checked={settings.boldHeadings} onChange={(v) => updateSettings({ boldHeadings: v })} />
                    <Toggle label="标题大写" checked={settings.upperHeadings} onChange={(v) => updateSettings({ upperHeadings: v })} />
                    <Toggle label="首行缩进" checked={settings.firstLineIndent} onChange={(v) => updateSettings({ firstLineIndent: v })} />
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-ink dark:text-ink-dark">正文字号</span>
                      <input
                        type="number"
                        min={9}
                        max={24}
                        value={settings.fontSize}
                        onChange={(e) => updateSettings({ fontSize: Number(e.target.value) || 12 })}
                        className="w-16 rounded-md border border-warm-gray bg-paper px-2 py-1 text-xs dark:border-warm-gray-dark dark:bg-paper-dark"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-ink dark:text-ink-dark">行高</span>
                      <input
                        type="number"
                        min={1}
                        max={3}
                        step={0.05}
                        value={settings.lineHeight}
                        onChange={(e) => updateSettings({ lineHeight: Number(e.target.value) || 1.85 })}
                        className="w-16 rounded-md border border-warm-gray bg-paper px-2 py-1 text-xs dark:border-warm-gray-dark dark:bg-paper-dark"
                      />
                    </div>
                  </div>
                )}
                {tab === "content" && (
                  <div className="space-y-2.5">
                    <Toggle label="包含正文" checked={settings.includeBody} onChange={(v) => updateSettings({ includeBody: v })} />
                    <Toggle label="包含概要注释" checked={settings.includeSynopsis} onChange={(v) => updateSettings({ includeSynopsis: v })} />
                    <Toggle label="包含一般注释" checked={settings.includeComments} onChange={(v) => updateSettings({ includeComments: v })} />
                    <Toggle label="包含关键字行" checked={settings.includeKeywords} onChange={(v) => updateSettings({ includeKeywords: v })} />
                    <div className="pt-2">
                      <p className="mb-1.5 text-xs font-medium text-ink-muted dark:text-ink-muted-dark">单文档包含/排除</p>
                      <div className="max-h-48 space-y-0.5 overflow-y-auto">
                        {chapters.map((c) => {
                          const included = settings.includeDocs.includes(c.id);
                          const excluded = settings.excludeDocs.includes(c.id);
                          return (
                            <div key={c.id} className="flex items-center justify-between gap-2 rounded px-1.5 py-0.5 text-xs hover:bg-warm-gray dark:hover:bg-warm-gray-dark">
                              <span className="truncate text-ink dark:text-ink-dark">{c.title}</span>
                              <span className="flex shrink-0 gap-1">
                                <button
                                  onClick={() =>
                                    updateSettings({
                                      includeDocs: included ? settings.includeDocs.filter((x) => x !== c.id) : [...settings.includeDocs, c.id],
                                      excludeDocs: settings.excludeDocs.filter((x) => x !== c.id),
                                    })
                                  }
                                  className={cn("rounded px-1.5 py-0.5", included ? "bg-green-500/15 text-green-700 dark:text-green-400" : "text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark")}
                                  title="显式包含"
                                >
                                  含
                                </button>
                                <button
                                  onClick={() =>
                                    updateSettings({
                                      excludeDocs: excluded ? settings.excludeDocs.filter((x) => x !== c.id) : [...settings.excludeDocs, c.id],
                                      includeDocs: settings.includeDocs.filter((x) => x !== c.id),
                                    })
                                  }
                                  className={cn("rounded px-1.5 py-0.5", excluded ? "bg-red-500/15 text-red-600 dark:text-red-400" : "text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark")}
                                  title="显式排除"
                                >
                                  排
                                </button>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 右:预览 + 大纲 + 统计 */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div ref={previewRef} className="min-h-0 flex-1 overflow-y-auto bg-warm-gray/30 p-4 dark:bg-warm-gray-dark/30">
              {previewHtml ? (
                <iframe title="手稿预览" sandbox="" srcDoc={previewHtml} className="h-full w-full rounded-lg border border-warm-gray bg-white dark:border-warm-gray-dark" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-ink-muted dark:text-ink-muted-dark">
                  预览生成中…
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center justify-between border-t border-warm-gray px-4 py-2 text-xs text-ink-muted dark:border-warm-gray-dark dark:text-ink-muted-dark">
              <span className="flex items-center gap-1.5">
                <Eye size={12} />
                {selectedChapters.length} 个文档 · 约 {formatNumber(stats.words)} 字 / {formatNumber(stats.chars)} 字符
              </span>
              <span className="flex gap-2">
                <ExportButton label="HTML" busy={exporting} onClick={() => void doExport("html")} />
                <ExportButton label="Markdown" busy={exporting} onClick={() => void doExport("md")} />
                <ExportButton label="纯文本" busy={exporting} onClick={() => void doExport("txt")} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FmtField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div>
      <label className="mb-0.5 block text-xs text-ink-muted dark:text-ink-muted-dark">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-warm-gray bg-paper px-2 py-1 font-mono text-xs text-ink outline-none focus:border-accent dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark"
      />
      {hint && <p className="mt-0.5 text-[10px] text-ink-muted/70 dark:text-ink-muted-dark/70">{hint}</p>}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-ink dark:text-ink-dark">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--accent)]" />
      {label}
    </label>
  );
}

function ExportButton({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-light disabled:opacity-50"
    >
      <Download size={11} />
      {label}
    </button>
  );
}
