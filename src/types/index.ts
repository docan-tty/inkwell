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
  /** 编辑区正文字体（UI_FONT_PRESETS 中的字体栈）。 */
  editorFontFamily?: string;
  /** 界面字体（侧栏 / 按钮 / 菜单等编辑区之外的部分）。 */
  uiFontFamily?: string;
  editorPadding: number;
  /** 笔记页签中笔记列表区的高度（px），可拖拽调整。 */
  notesListHeight?: number;
  /** 作品库的展示模式：卡片网格 / 紧凑列表。 */
  projectViewMode?: "grid" | "list";
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
  /** 置顶笔记排在列表最前（置顶区内部按更新时间排序）。 */
  pinned?: boolean;
  /** 所属文件夹名；空值归入「未归档」。 */
  folder?: string;
  updatedAt: number;
}

export type ViewMode = "projects" | "editor";
export type RightPanelTab = "outline" | "history" | "none";
/** 左侧栏页签：章节目录 / 写作笔记 / 设定词典。 */
export type LeftSidebarTab = "chapters" | "notes" | "dictionary";

/** 词典词条预设分类。 */
export const DICT_CATEGORIES = ["人物", "地点", "势力", "物品", "概念"] as const;
export type DictCategory = (typeof DICT_CATEGORIES)[number] | (string & {});

/** 词典词条：小说设定库（人物卡、地名、势力关系……），按分类检索。 */
export interface DictEntry {
  id: string;
  /** 词条名，如「顾云峥」 */
  term: string;
  /** 别名/称呼，多个，如「云峥 / 峥哥」 */
  aliases: string[];
  /** 分类，见 DICT_CATEGORIES 预设，也允许自定义。 */
  category: string;
  /** 词条内容（设定详情）。 */
  content: string;
  updatedAt: number;
}

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
