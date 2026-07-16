export type ChapterStatus = "draft" | "editing" | "review" | "done";

export interface Chapter {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  summary: string;
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
  // Chinese-novel typography: indent the first line of every paragraph by
  // 2em. On by default — the README promises it; headings, lists and
  // blockquotes always reset to 0 indent regardless of this setting.
  firstLineIndent?: boolean;
  // Custom location for the user's novel content (project JSON files and
  // chapter `.md` files). When unset, content falls back to the data folder.
  // The data folder itself holds app-level data only — settings and the
  // project index (`registry.json`).
  projectSaveDirectory?: string;
}

export type ViewMode = "projects" | "editor";
export type RightPanelTab = "outline" | "history" | "none";

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
