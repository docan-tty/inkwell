import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, BookOpen, MoreVertical, Trash2, FileText, Settings, PencilLine, Feather, LayoutGrid, Rows3 } from "lucide-react";
import { useAppStore } from "../store";
import type { Project } from "../types";
import { GlobalSettingsModal } from "./GlobalSettingsModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { ProjectEditDialog } from "./ProjectEditDialog";
import { useClickOutside } from "../hooks/useClickOutside";
import { loadProjectFromLocal } from "../lib/storage";
import { cn } from "../lib/utils";

export function ProjectList() {
  const projects = useAppStore((s) => s.projects);
  const loadProjects = useAppStore((s) => s.loadProjects);
  const createProject = useAppStore((s) => s.createProject);
  const openProject = useAppStore((s) => s.openProject);
  const deleteProject = useAppStore((s) => s.deleteProject);
  const updateProject = useAppStore((s) => s.updateProject);
  const appSettings = useAppStore((s) => s.appSettings);
  const updateAppSettings = useAppStore((s) => s.updateAppSettings);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingChapterCount, setDeletingChapterCount] = useState(0);
  // 书籍打开动效：点击书封 → 播放翻页动画 → 动画结束后真正进入作品。
  const [opening, setOpening] = useState<{ id: string; rect: DOMRect } | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (openTimer.current) clearTimeout(openTimer.current);
    },
    [],
  );

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const project = await createProject({ name: newName.trim() });
      await openProject(project);
      setCreating(false);
      setNewName("");
      setCreateError("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    }
  };

  const requestDelete = useCallback(async (project: Project) => {
    setDeleting(project);
    setDeletingChapterCount(0);
    try {
      const loaded = await loadProjectFromLocal(
        project.id,
        useAppStore.getState().appSettings,
      );
      setDeletingChapterCount(loaded?.chapters.length || 0);
    } catch {
      setDeletingChapterCount(0);
    }
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleting) return;
    const id = deleting.id;
    setDeleting(null);
    await deleteProject(id);
  }, [deleting, deleteProject]);

  // 作品展示模式：卡片网格（默认）/ 紧凑列表，持久化在全局设置里。
  const viewMode = appSettings.projectViewMode ?? "grid";

  // 点击书封：记录封面位置播放「翻书打开」动效，结束后进入作品。
  // 守卫覆盖所有入口（卡片与列表行），防止双击交错打开两个作品。
  const handleOpen = useCallback(
    (project: Project, rect: DOMRect | null) => {
      if (opening) return; // 动画进行中忽略重复点击
      if (!rect) {
        openProject(project);
        return;
      }
      setOpening({ id: project.id, rect });
      if (openTimer.current) clearTimeout(openTimer.current);
      openTimer.current = window.setTimeout(() => {
        openTimer.current = null;
        setOpening(null);
        openProject(project);
      }, 700);
    },
    [opening, openProject],
  );

  return (
    <div className="flex h-full flex-col bg-paper dark:bg-paper-dark">
      <div className="flex h-16 items-center justify-between border-b border-warm-gray px-6 dark:border-warm-gray-dark">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white shadow-sm">
            <BookOpen size={20} />
          </div>
          <h1 className="text-lg font-semibold text-ink dark:text-ink-dark">墨池</h1>
        </div>
        <div className="flex items-center gap-1">
          {/* 展示模式切换：卡片网格 / 紧凑列表 */}
          <div className="mr-1 flex items-center rounded-lg border border-warm-gray p-0.5 dark:border-warm-gray-dark">
            <button
              onClick={() => updateAppSettings({ projectViewMode: "grid" })}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                viewMode === "grid"
                  ? "bg-accent/10 text-accent dark:bg-accent/20"
                  : "text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark",
              )}
              title="卡片视图"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => updateAppSettings({ projectViewMode: "list" })}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                viewMode === "list"
                  ? "bg-accent/10 text-accent dark:bg-accent/20"
                  : "text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark",
              )}
              title="列表视图"
            >
              <Rows3 size={15} />
            </button>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
            title="全局设置"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto px-8 py-7 lg:px-12">
        {creating && (
          <div className="mb-6 rounded-xl border border-warm-gray bg-paper p-4 shadow-sm dark:border-warm-gray-dark dark:bg-paper-dark">
            <h3 className="mb-3 text-sm font-medium text-ink dark:text-ink-dark">新建作品</h3>
            <div className="space-y-3">
              <input
                autoFocus
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setCreateError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="作品名称"
                className="w-full rounded-lg border border-warm-gray bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark"
              />
              {createError && <p className="text-xs text-red-600 dark:text-red-400">{createError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                    setCreateError("");
                  }}
                  className="rounded-lg px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
                >
                  取消
                </button>
                <button
                  onClick={handleCreate}
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm text-white transition-colors hover:bg-accent-light"
                >
                  创建
                </button>
              </div>
            </div>
          </div>
        )}

        {projects.length === 0 && !creating && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warm-gray dark:bg-warm-gray-dark">
              <FileText size={28} className="text-ink-muted dark:text-ink-muted-dark" />
            </div>
            <h3 className="mb-1 text-base font-medium text-ink dark:text-ink-dark">还没有作品</h3>
            <p className="mb-6 text-sm text-ink-muted dark:text-ink-muted-dark">创建一个新作品，开始你的创作之旅</p>
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-accent-light hover:shadow"
            >
              <Plus size={16} />
              新建作品
            </button>
          </div>
        )}

        {viewMode === "grid" ? (
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {projects.map((project, idx) => (
              <ProjectCard
                key={project.id}
                project={project}
                index={idx}
                onOpen={handleOpen}
                onEdit={() => setEditingProject(project)}
                onDelete={() => requestDelete(project)}
              />
            ))}
          </div>
        ) : (
          <div className="mx-auto flex max-w-4xl flex-col gap-2">
            {projects.map((project, idx) => (
              <ProjectRow
                key={project.id}
                project={project}
                index={idx}
                onOpen={handleOpen}
                onEdit={() => setEditingProject(project)}
                onDelete={() => requestDelete(project)}
              />
            ))}
          </div>
        )}

        <button
          onClick={() => setCreating(true)}
          className="fixed bottom-6 right-6 flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-all hover:bg-accent-light hover:shadow-xl"
        >
          <Plus size={16} />
          新建作品
        </button>
      </div>
      {/* 翻书打开动效覆盖层：从被点封面位置翻开，淡出前完成项目切换 */}
      {opening && (
        <BookOpenOverlay
          rect={opening.rect}
          title={projects.find((p) => p.id === opening.id)?.name ?? ""}
          palette={coverColor(opening.id)}
        />
      )}
      <GlobalSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ProjectEditDialog
        project={editingProject}
        onSave={async (data) => {
          // Await (and let failures propagate into the dialog): renaming a
          // work moves its folder on disk — a failed move must not close the
          // dialog looking like a successful save.
          if (editingProject) await updateProject(editingProject.id, data);
        }}
        onClose={() => setEditingProject(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`删除作品「${deleting?.name ?? ""}」？`}
        message={
          deletingChapterCount > 0
            ? `将永久删除该作品及其 ${deletingChapterCount} 个章节的全部内容，此操作不可撤销。`
            : "将永久删除该作品，此操作不可撤销。"
        }
        confirmLabel="永久删除"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

// 书封配色：按作品 id 散列到一组雅致的主题色（底色 + 书名/书脊深浅阶）。
const BOOK_COVER_COLORS: { base: string; deep: string; soft: string }[] = [
  { base: "#7a5c3f", deep: "#5f4630", soft: "#96765a" }, // 棕
  { base: "#4f6b8a", deep: "#3d5470", soft: "#6a85a3" }, // 黛蓝
  { base: "#6b7c56", deep: "#546343", soft: "#86976f" }, // 苔绿
  { base: "#8a5560", deep: "#6e434c", soft: "#a3707b" }, // 绛红
  { base: "#5f6e9e", deep: "#4b577e", soft: "#7a88b3" }, // 靛青
  { base: "#7d6b4f", deep: "#63543d", soft: "#97846a" }, // 茶褐
];

function coverColor(id: string): (typeof BOOK_COVER_COLORS)[number] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return BOOK_COVER_COLORS[Math.abs(hash) % BOOK_COVER_COLORS.length];
}

// 书影配色：固定深灰褐，与被点封面无关。

// 书籍卡片：竖版书封 + 书脊，悬停微掀，信息排于书封之下。
function ProjectCard({
  project,
  index,
  onOpen,
  onEdit,
  onDelete,
}: {
  project: Project;
  index: number;
  onOpen: (project: Project, rect: DOMRect | null) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);
  const palette = coverColor(project.id);

  return (
    <div
      onClick={() => onOpen(project, coverRef.current?.getBoundingClientRect() ?? null)}
      style={{ "--inkwell-card-delay": `${Math.min(index, 8) * 45}ms` } as React.CSSProperties}
      className="inkwell-card-enter group cursor-pointer"
    >
      {/* 书封：3:4 竖版 + 左侧书脊 + 竖排书名 */}
      <div
        ref={coverRef}
        style={{ perspective: "1000px" }}
        className="relative mx-auto w-full max-w-44"
      >
        <div
          style={{
            background: `linear-gradient(150deg, ${palette.soft} 0%, ${palette.base} 38%, ${palette.deep} 100%)`,
            transformOrigin: "left center",
          }}
          className="relative aspect-[3/4] overflow-hidden rounded-r-lg rounded-l-[3px] shadow-[0_10px_24px_-10px_rgba(0,0,0,0.45)] transition-all duration-300 ease-out group-hover:-translate-y-2 group-hover:shadow-[0_24px_44px_-14px_rgba(0,0,0,0.55)] group-hover:[transform:translateY(-8px)_rotateY(-11deg)]"
        >
          {/* 书脊：两道压痕 + 纵深阴影 */}
          <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/35 via-black/15 to-transparent" />
          <div className="absolute inset-y-0 left-3 w-px bg-white/25" />
          <div className="absolute inset-y-0 left-[13px] w-px bg-black/15" />
          {/* 封面光泽：上亮下暗的基础光影 */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/18 via-transparent to-black/25" />
          {/* 悬停高光扫过（reduced-motion 下不播放） */}
          <div className="inkwell-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-80" style={{ transform: "translateX(-120%) skewX(-18deg)" }} />
          {/* 上下装饰线：精装书封的框线感 */}
          <div className="absolute inset-x-4 top-3 h-px bg-white/25" />
          <div className="absolute inset-x-4 bottom-3 h-px bg-white/25" />
          {/* 竖排书名与作者：放宽高度、允许换到第二竖列，长书名不再被单列
              max-h 截掉开头 */}
          <div className="absolute inset-y-0 right-0 flex max-w-full flex-col flex-wrap items-center justify-center gap-x-1.5 gap-y-3 overflow-hidden px-3 py-5 [writing-mode:vertical-rl]">
            <span className="max-h-[82%] overflow-hidden text-base font-semibold leading-snug tracking-[0.2em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
              {project.name}
            </span>
            {project.author && (
              <span className="max-h-[40%] overflow-hidden text-[11px] tracking-[0.18em] text-white/75">
                {project.author} 著
              </span>
            )}
          </div>
        </div>
        <ProjectMenu menuRef={menuRef} menuOpen={menuOpen} setMenuOpen={setMenuOpen} onEdit={onEdit} onDelete={onDelete} />
      </div>

      {/* 书下信息：简介 */}
      <div className="mt-3.5 px-1">
        <h3 className="truncate text-center text-sm font-semibold text-ink transition-colors group-hover:text-accent dark:text-ink-dark">
          {project.name}
        </h3>
        <p className="mt-1 line-clamp-2 min-h-[2.5em] text-center text-xs leading-relaxed text-ink-muted dark:text-ink-muted-dark">
          {project.description || "暂无简介"}
        </p>
      </div>
    </div>
  );
}

// 翻书打开动效：书影留在原位放大淡出，封面从被点位置掀起（绕左缘
// rotateY）并放大铺满屏幕，纸色遮罩在后半段接管画面，700ms 后由调用方
// 完成项目切换。
function BookOpenOverlay({
  rect,
  title,
  palette,
}: {
  rect: DOMRect;
  title: string;
  palette: (typeof BOOK_COVER_COLORS)[number];
}) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return (
    <div className="pointer-events-none fixed inset-0 z-[70]">
      {/* 纸色遮罩：封面放大到失焦后接管画面，衔接编辑器视图 */}
      <div className="inkwell-book-page-overlay absolute inset-0 bg-paper opacity-0 dark:bg-paper-dark" />
      {/* 书影：封面掀开后留在原位的封底 */}
      <div
        className="inkwell-book-open-shadow absolute rounded-r-lg rounded-l-[3px] bg-black/30 blur-md"
        style={{
          left: cx,
          top: cy,
          width: rect.width,
          height: rect.height,
          transform: "translate(-50%, -50%)",
        }}
      />
      <div className="absolute inset-0" style={{ perspective: "1600px" }}>
        <div
          className="inkwell-book-open-cover absolute rounded-r-lg rounded-l-[3px] shadow-2xl"
          style={{
            left: cx,
            top: cy,
            width: rect.width,
            height: rect.height,
            background: `linear-gradient(150deg, ${palette.soft} 0%, ${palette.base} 38%, ${palette.deep} 100%)`,
            transformOrigin: "left center",
          }}
        >
          <div className="absolute inset-y-0 left-0 w-3.5 bg-gradient-to-r from-black/35 via-black/15 to-transparent" />
          <div className="absolute inset-y-0 left-3.5 w-px bg-white/25" />
          <div className="absolute inset-0 bg-gradient-to-br from-white/18 via-transparent to-black/25" />
          <div className="absolute inset-x-5 top-4 h-px bg-white/25" />
          <div className="absolute inset-x-5 bottom-4 h-px bg-white/25" />
          <div className="absolute inset-y-0 right-0 flex items-center px-5 py-7 [writing-mode:vertical-rl]">
            <span className="max-h-full overflow-hidden text-xl font-semibold tracking-[0.25em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
              {title}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// 紧凑列表行：图标 + 名称/作者/简介 + 内嵌进度条 + 更新时间，与卡片共享菜单交互。
function ProjectRow({
  project,
  index,
  onOpen,
  onEdit,
  onDelete,
}: {
  project: Project;
  index: number;
  onOpen: (project: Project, rect: DOMRect | null) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  return (
    <div
      onClick={() => onOpen(project, null)}
      style={{ "--inkwell-card-delay": `${Math.min(index, 8) * 40}ms` } as React.CSSProperties}
      className="inkwell-card-enter group flex cursor-pointer items-center gap-4 rounded-xl border border-warm-gray bg-paper px-4 py-3 transition-all duration-200 hover:border-accent/60 hover:shadow-md dark:border-warm-gray-dark dark:bg-paper-dark"
    >
      <div
        className="flex h-11 w-9 shrink-0 items-center justify-center rounded-r-md rounded-l-[2px] shadow-sm transition-transform duration-200 group-hover:-translate-y-0.5"
        style={{ background: `linear-gradient(150deg, ${coverColor(project.id).soft}, ${coverColor(project.id).deep})` }}
      >
        <BookOpen size={16} className="text-white/90" />
      </div>

      <div className="w-48 min-w-0 shrink-0">
        <h3 className="truncate text-sm font-semibold text-ink transition-colors group-hover:text-accent dark:text-ink-dark">
          {project.name}
        </h3>
        <p className="flex items-center gap-1 text-xs text-ink-muted dark:text-ink-muted-dark">
          <Feather size={9} className="shrink-0" />
          <span className="truncate">{project.author ? `${project.author} 著` : "未署名"}</span>
        </p>
      </div>

      <p className="hidden min-w-0 flex-1 truncate text-sm text-ink-muted md:block dark:text-ink-muted-dark">
        {project.description || "暂无简介"}
      </p>

      <ProjectMenu menuRef={menuRef} menuOpen={menuOpen} setMenuOpen={setMenuOpen} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

// 卡片 / 列表行共用的「⋯」菜单（编辑信息 / 删除）。
function ProjectMenu({
  menuRef,
  menuOpen,
  setMenuOpen,
  onEdit,
  onDelete,
}: {
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen(!menuOpen);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted opacity-0 transition-opacity hover:bg-warm-gray group-hover:opacity-100 dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
      >
        <MoreVertical size={16} />
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-9 z-10 w-32 rounded-lg border border-warm-gray bg-paper py-1 shadow-lg dark:border-warm-gray-dark dark:bg-paper-dark">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink transition-colors hover:bg-warm-gray dark:text-ink-dark dark:hover:bg-warm-gray-dark"
          >
            <PencilLine size={12} />
            编辑信息
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
          >
            <Trash2 size={12} />
            删除
          </button>
        </div>
      )}
    </div>
  );
}
