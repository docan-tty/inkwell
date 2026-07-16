import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, BookOpen, MoreVertical, Trash2, FileText, Settings, PencilLine } from "lucide-react";
import { useAppStore } from "../store";
import type { Project } from "../types";
import { formatNumber, formatDateTime } from "../lib/utils";
import { GlobalSettingsModal } from "./GlobalSettingsModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { ProjectEditDialog } from "./ProjectEditDialog";
import { useClickOutside } from "../hooks/useClickOutside";
import { loadProjectFromLocal } from "../lib/storage";

export function ProjectList() {
  const { projects, loadProjects, createProject, openProject, deleteProject, updateProject } =
    useAppStore();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingChapterCount, setDeletingChapterCount] = useState(0);
  // Total word count per project, aggregated from each project file so the
  // cards can show live progress without opening the project.
  const [wordCounts, setWordCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Aggregate per-project word counts for the progress display. Reads each
  // project file once per registry change — cheap JSON, no chapter content.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const settings = useAppStore.getState().appSettings;
      const counts: Record<string, number> = {};
      await Promise.all(
        projects.map(async (p) => {
          const loaded = await loadProjectFromLocal(p.id, settings);
          counts[p.id] = (loaded?.chapters || []).reduce((sum, c) => sum + c.wordCount, 0);
        }),
      );
      if (!cancelled) setWordCounts(counts);
    })();
    return () => {
      cancelled = true;
    };
  }, [projects]);

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

  return (
    <div className="flex h-full flex-col bg-paper dark:bg-paper-dark">
      <div className="flex h-16 items-center justify-between border-b border-warm-gray px-6 dark:border-warm-gray-dark">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white shadow-sm">
            <BookOpen size={20} />
          </div>
          <h1 className="text-lg font-semibold text-ink dark:text-ink-dark">墨池</h1>
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
          title="全局设置"
        >
          <Settings size={18} />
        </button>
      </div>

      <div className="relative flex-1 overflow-y-auto p-6">
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              totalWords={wordCounts[project.id]}
              onOpen={() => openProject(project)}
              onEdit={() => setEditingProject(project)}
              onDelete={() => requestDelete(project)}
            />
          ))}
        </div>

        <button
          onClick={() => setCreating(true)}
          className="fixed bottom-6 right-6 flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-all hover:bg-accent-light hover:shadow-xl"
        >
          <Plus size={16} />
          新建作品
        </button>
      </div>
      <GlobalSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ProjectEditDialog
        project={editingProject}
        onSave={(data) => {
          if (editingProject) updateProject(editingProject.id, data);
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

function ProjectCard({
  project,
  totalWords,
  onOpen,
  onEdit,
  onDelete,
}: {
  project: Project;
  totalWords?: number;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  const progress =
    totalWords !== undefined && project.targetWords > 0
      ? Math.min(100, Math.round((totalWords / project.targetWords) * 100))
      : null;

  return (
    <div
      onClick={onOpen}
      className="group relative cursor-pointer rounded-xl border border-warm-gray bg-paper p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-lg dark:border-warm-gray-dark dark:bg-paper-dark"
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warm-gray text-accent transition-colors group-hover:bg-accent/10 dark:bg-warm-gray-dark">
          <BookOpen size={24} />
        </div>
        <div ref={menuRef} className="relative">
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
      </div>

      <h3 className="mb-1 text-base font-semibold text-ink dark:text-ink-dark">{project.name}</h3>
      {project.author && (
        <p className="mb-1 text-xs text-ink-muted dark:text-ink-muted-dark">{project.author} 著</p>
      )}

      <p className="mb-4 line-clamp-2 min-h-[2.5em] text-sm text-ink-muted dark:text-ink-muted-dark">
        {project.description || "暂无简介"}
      </p>

      {progress !== null && (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-ink dark:text-ink-dark">
              {formatNumber(totalWords!)} <span className="text-ink-muted dark:text-ink-muted-dark">/ {formatNumber(project.targetWords)} 字</span>
            </span>
            <span className="font-medium text-accent">{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-warm-gray dark:bg-warm-gray-dark">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-end text-xs text-ink-muted dark:text-ink-muted-dark">
        <span>更新于 {formatDateTime(project.updatedAt)}</span>
      </div>
    </div>
  );
}
