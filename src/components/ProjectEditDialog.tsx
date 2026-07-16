import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Project } from "../types";
import { formatNumber } from "../lib/utils";

interface ProjectEditDialogProps {
  project: Project | null;
  onSave: (data: { name: string; author: string; description: string; targetWords: number }) => void;
  onClose: () => void;
}

// 作品信息编辑对话框：名称 / 作者 / 简介 / 目标字数。
// 由项目卡片「编辑信息」菜单项打开。
export function ProjectEditDialog({ project, onSave, onClose }: ProjectEditDialogProps) {
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [targetWords, setTargetWords] = useState("4000");

  useEffect(() => {
    if (project) {
      setName(project.name);
      setAuthor(project.author);
      setDescription(project.description);
      setTargetWords(String(project.targetWords));
    }
  }, [project]);

  if (!project) return null;

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const words = parseInt(targetWords.replace(/\D/g, ""), 10);
    onSave({
      name: trimmed,
      author: author.trim(),
      description: description.trim(),
      targetWords: Number.isNaN(words) || words <= 0 ? project.targetWords : words,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-[inkwell-fade-in_0.15s_ease-out]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-warm-gray bg-paper shadow-xl dark:border-warm-gray-dark dark:bg-paper-dark animate-[inkwell-pop-in_0.15s_ease-out]"
      >
        <div className="flex h-11 items-center justify-between border-b border-warm-gray px-4 dark:border-warm-gray-dark">
          <span className="text-sm font-medium text-ink dark:text-ink-dark">编辑作品信息</span>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <label className="block space-y-1.5">
            <span className="text-xs text-ink-muted dark:text-ink-muted-dark">作品名称</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="作品名称"
              className="w-full rounded-lg border border-warm-gray bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs text-ink-muted dark:text-ink-muted-dark">作者</span>
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="署名（可留空）"
              className="w-full rounded-lg border border-warm-gray bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs text-ink-muted dark:text-ink-muted-dark">简介</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="一句话介绍这部作品……"
              rows={3}
              className="w-full resize-none rounded-lg border border-warm-gray bg-paper px-3 py-2 text-sm leading-relaxed text-ink outline-none transition-colors focus:border-accent dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs text-ink-muted dark:text-ink-muted-dark">
              目标字数 <span className="text-ink dark:text-ink-dark">{formatNumber(parseInt(targetWords, 10) || 0)}</span>
            </span>
            <input
              type="number"
              min={1}
              value={targetWords}
              onChange={(e) => setTargetWords(e.target.value)}
              className="w-full rounded-lg border border-warm-gray bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent dark:border-warm-gray-dark dark:bg-paper-dark dark:text-ink-dark"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-warm-gray px-4 py-3 dark:border-warm-gray-dark">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm text-white transition-colors hover:bg-accent-light disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
