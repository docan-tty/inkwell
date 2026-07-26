import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Feather, FolderOpen, Plus, X } from "lucide-react";
import { useAppStore } from "../store";
import type { Project } from "../types";
import { loadProjectFromLocal, getAppDataDir } from "../lib/storage";
import { sortProjectsByRecency, sumChapterWords } from "../lib/recent-projects";
import { formatDateTime, formatNumber, cn } from "../lib/utils";

// 作品字数缓存:打开对话框时对未缓存项惰性加载(读 project.json 求和)。
const wordCountCache = new Map<string, number>();

/**
 * 启动 / 项目选择对话框(novelWriter 的「欢迎使用」式)。
 * 按最近打开排序列出作品(名称 + 最近打开时间 + 字数),双击或选中后
 * 「打开」进入;底部可新建作品;有作品打开时 Esc/取消返回工作区。
 */
export function WelcomeDialog() {
  const open = useAppStore((s) => s.welcomeOpen);
  const setWelcomeOpen = useAppStore((s) => s.setWelcomeOpen);
  const projects = useAppStore((s) => s.projects);
  const recentIds = useAppStore((s) => s.appSettings.recentProjects);
  const openProject = useAppStore((s) => s.openProject);
  const createProject = useAppStore((s) => s.createProject);
  const hasProject = useAppStore((s) => s.currentProject !== null);
  const recoveryPending = useAppStore((s) => s.recoveryPending);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 字数展示直接用模块级缓存做数据源,不进 state——加载完成靠 bump 版本号
  // 触发重渲染,避免 effect 里 setState 与兄弟组件渲染期更新纠缠。
  const [, setCacheVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const [baseDir, setBaseDir] = useState("");
  const openGuard = useRef(false);

  const sorted = sortProjectsByRecency(projects, recentIds);

  // 默认选中最近的作品(延后到渲染后,避免在兄弟组件渲染期间 setState)。
  useEffect(() => {
    if (open && sorted.length > 0 && !selectedId) {
      const t = setTimeout(() => setSelectedId(sorted[0].id), 0);
      return () => clearTimeout(t);
    }
  }, [open, sorted, selectedId]);

  // 惰性加载各作品字数(未缓存的;并发全开,项目数通常很小)。完成后 bump
  // 版本号重渲染;渲染期直接读 wordCountCache,无需 state 拷贝。
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const settings = useAppStore.getState().appSettings;
    for (const p of sorted) {
      if (wordCountCache.get(p.id) !== undefined) continue;
      loadProjectFromLocal(p.id, settings)
        .then((loaded) => {
          if (cancelled || !loaded) return;
          wordCountCache.set(p.id, sumChapterWords(loaded.chapters));
          setCacheVersion((v) => v + 1);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // sorted 每次渲染都是新数组;以项目 id 串为依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sorted.map((p) => p.id).join(",")]);

  // 保存位置显示。
  useEffect(() => {
    if (!open) return;
    const custom = useAppStore.getState().appSettings.projectSaveDirectory;
    if (custom) setBaseDir(custom);
    else void getAppDataDir().then(setBaseDir);
  }, [open]);

  const handleOpen = useCallback(
    async (project: Project) => {
      if (openGuard.current) return;
      openGuard.current = true;
      setOpening(true);
      setError("");
      try {
        await openProject(project);
        wordCountCache.delete(project.id); // 字数可能有新进展,下次重算
        // 延后到渲染后关闭对话框——openProject 的 store 更新会触发 App
        // 重渲染,在同一事件链里再 setWelcomeOpen 会报渲染期跨组件更新。
        setTimeout(() => setWelcomeOpen(false), 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        openGuard.current = false;
        setOpening(false);
      }
    },
    [openProject, setWelcomeOpen],
  );

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setError("");
    try {
      const project = await createProject({ name });
      setCreating(false);
      setNewName("");
      await handleOpen(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [newName, createProject, handleOpen]);

  const canDismiss = hasProject;
  const dismiss = useCallback(() => {
    if (canDismiss) setWelcomeOpen(false);
  }, [canDismiss, setWelcomeOpen]);

  // Esc 关闭(仅当有作品可回);恢复草稿对话框优先,它在时这里不响应。
  useEffect(() => {
    if (!open || recoveryPending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        dismiss();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, recoveryPending, dismiss]);

  if (!open || recoveryPending) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 animate-[inkwell-fade-in_0.15s_ease-out]">
      <div className="flex max-h-[82vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-warm-gray bg-paper shadow-2xl dark:border-warm-gray-dark dark:bg-paper-dark animate-[inkwell-pop-in_0.15s_ease-out]">
        {/* 头部:品牌 */}
        <div className="flex shrink-0 items-center justify-between border-b border-warm-gray px-5 py-4 dark:border-warm-gray-dark">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white shadow-sm">
              <Feather size={20} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-ink dark:text-ink-dark">墨池</h1>
              <p className="text-xs text-ink-muted dark:text-ink-muted-dark">选择一部作品,继续你的故事</p>
            </div>
          </div>
          {canDismiss && (
            <button
              onClick={dismiss}
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
              title="返回工作区 (Esc)"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* 作品列表 */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BookOpen size={28} className="mb-3 text-ink-muted/50 dark:text-ink-muted-dark/50" />
              <p className="text-sm text-ink-muted dark:text-ink-muted-dark">还没有作品,从下方新建一部开始。</p>
            </div>
          ) : (
            <div className="space-y-1">
              {sorted.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  onDoubleClick={() => void handleOpen(p)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors",
                    selectedId === p.id
                      ? "border-accent/60 bg-accent/5 dark:bg-accent/10"
                      : "border-transparent hover:bg-warm-gray dark:hover:bg-warm-gray-dark",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink dark:text-ink-dark">{p.name}</div>
                    <div className="mt-0.5 text-xs text-ink-muted dark:text-ink-muted-dark">
                      最近打开 {formatDateTime(p.updatedAt)}
                      {" · "}
                      {wordCountCache.get(p.id) !== undefined
                        ? `字数 ${formatNumber(wordCountCache.get(p.id)!)}`
                        : "字数 …"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* 新建作品 */}
          {creating ? (
            <div className="mt-2 rounded-lg border border-warm-gray p-3 dark:border-warm-gray-dark">
              <input
                autoFocus
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
                placeholder="作品名称"
                className="w-full rounded-lg border border-warm-gray bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                    setError("");
                  }}
                  className="rounded-lg px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
                >
                  取消
                </button>
                <button
                  onClick={() => void handleCreate()}
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm text-white transition-colors hover:bg-accent-light"
                >
                  创建并打开
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-warm-gray px-3.5 py-2.5 text-sm text-ink-muted transition-colors hover:border-accent/60 hover:text-accent dark:border-warm-gray-dark dark:text-ink-muted-dark"
            >
              <Plus size={15} />
              新建作品
            </button>
          )}

          {error && <p className="mt-2 px-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>

        {/* 底部:保存路径 + 操作 */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-warm-gray px-5 py-3 dark:border-warm-gray-dark">
          <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-ink-muted dark:text-ink-muted-dark" title={baseDir}>
            <FolderOpen size={12} className="shrink-0" />
            <span className="truncate">{baseDir || "…"}</span>
          </div>
          <div className="flex shrink-0 gap-2">
            {canDismiss && (
              <button
                onClick={dismiss}
                className="rounded-lg px-3.5 py-1.5 text-sm text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
              >
                取消
              </button>
            )}
            <button
              disabled={!selectedId || opening}
              onClick={() => {
                const p = sorted.find((x) => x.id === selectedId);
                if (p) void handleOpen(p);
              }}
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors",
                !selectedId || opening ? "bg-accent/50" : "bg-accent hover:bg-accent-light",
              )}
            >
              {opening ? "打开中…" : "打开"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
