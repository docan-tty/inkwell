export type ChapterStatus = "draft" | "editing" | "review" | "done";

export interface Chapter {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  summary: string;
  contentPath: string;
  order: number;
  status: ChapterStatus;
  wordCount: number;
  targetWords?: number;
  tags: string[];
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface Volume {
  id: string;
  projectId: string;
  title: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  author: string;
  genre: string;
  description: string;
  coverImage?: string;
  targetWords: number;
  createdAt: number;
  updatedAt: number;
  settings: ProjectSettings;
}

export interface ProjectSettings {
  // All editor-level settings have moved to AppSettings.
}

export interface EditorTypography {
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
}

export interface AppSettings {
  theme: "light" | "dark" | "system";
  recentProjects: string[];
  windowState?: {
    width: number;
    height: number;
    maximized: boolean;
  };
  editorTypography: EditorTypography;
  editorPadding: number;
  includePunctuationInWordCount: boolean;
  defaultChapterTargetWords: number;
  leftSidebarWidth?: number;
  projectSaveDirectory?: string;
  chapterCacheDirectory?: string;
}

export type ViewMode = "projects" | "editor";
export type RightPanelTab = "outline" | "none";

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {};

export const DEFAULT_PROJECT_TARGET_WORDS = 4000;

export const DEFAULT_EDITOR_TYPOGRAPHY: EditorTypography = {
  fontSize: 18,
  lineHeight: 1.85,
  paragraphSpacing: 0.8,
};

export const STATUS_LABELS: Record<ChapterStatus, string> = {
  draft: "草稿",
  editing: "修改中",
  review: "待校对",
  done: "已完成",
};

export const STATUS_COLORS: Record<ChapterStatus, string> = {
  draft: "bg-warm-gray dark:bg-warm-gray-dark",
  editing: "bg-amber-100 dark:bg-amber-900/40",
  review: "bg-blue-100 dark:bg-blue-900/40",
  done: "bg-emerald-100 dark:bg-emerald-900/40",
};
