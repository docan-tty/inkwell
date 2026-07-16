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
  /** 编辑区正文最大宽度（px），随窗口自适应。 */
  editorMaxWidth?: number;
  includePunctuationInWordCount: boolean;
  defaultChapterTargetWords: number;
  leftSidebarWidth?: number;
  // Chinese-novel typography: indent the first line of every paragraph by
  // 2em. On by default — the README promises it; headings, lists and
  // blockquotes always reset to 0 indent regardless of this setting.
  firstLineIndent?: boolean;
  /** 个性化主题色（墨棕/黛蓝/松绿/胭脂/紫檀）。 */
  themeColor?: string;
  /** 纸张质感（米白/羊皮纸/护眼绿），仅浅色模式生效。 */
  paperTexture?: string;
  // Custom location for the user's novel content (project JSON files and
  // chapter `.md` files). When unset, content falls back to the data folder.
  // The data folder itself holds app-level data only — settings and the
  // project index (`registry.json`).
  projectSaveDirectory?: string;
}

/** 写作笔记：全书共享的随手记（人物设定、灵感、伏笔等）。 */
export interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

export type ViewMode = "projects" | "editor";
export type RightPanelTab = "outline" | "history" | "notes" | "none";

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
