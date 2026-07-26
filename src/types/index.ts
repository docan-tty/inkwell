export type ChapterStatus = "draft" | "editing" | "review" | "done";

/** 文档类型:novel = 小说正文(只许在小说根下,参与手稿);note = 项目笔记。 */
export type DocKind = "novel" | "note";

/** 根文件夹类型(novelWriter 式)。 */
export type RootKind =
  | "novel"
  | "plot"
  | "characters"
  | "locations"
  | "timeline"
  | "objects"
  | "entities"
  | "custom"
  | "templates"
  | "archive"
  | "trash";

export interface RootFolderDef {
  kind: RootKind;
  label: string;
  /** 该根下的文档类型;trash/archive 两者皆可。 */
  docKind: DocKind | "any";
  /** 该根下文档的状态字段语义:novel 用 status,note 用 importance。 */
  usesStatus: boolean;
}

export const ROOT_KIND_ORDER: RootKind[] = [
  "novel",
  "plot",
  "characters",
  "locations",
  "timeline",
  "objects",
  "entities",
  "custom",
  "templates",
  "archive",
  "trash",
];

export const ROOT_DEFS: Record<RootKind, RootFolderDef> = {
  novel: { kind: "novel", label: "小说", docKind: "novel", usesStatus: true },
  plot: { kind: "plot", label: "情节", docKind: "note", usesStatus: false },
  characters: { kind: "characters", label: "角色", docKind: "note", usesStatus: false },
  locations: { kind: "locations", label: "位置", docKind: "note", usesStatus: false },
  timeline: { kind: "timeline", label: "时间线", docKind: "note", usesStatus: false },
  objects: { kind: "objects", label: "物品", docKind: "note", usesStatus: false },
  entities: { kind: "entities", label: "势力", docKind: "note", usesStatus: false },
  custom: { kind: "custom", label: "自定义", docKind: "note", usesStatus: false },
  templates: { kind: "templates", label: "模板", docKind: "note", usesStatus: false },
  archive: { kind: "archive", label: "归档", docKind: "any", usesStatus: false },
  trash: { kind: "trash", label: "回收站", docKind: "any", usesStatus: false },
};

/** 新建项目时默认创建的根文件夹。 */
export const DEFAULT_ROOTS: RootKind[] = ["novel", "plot", "characters", "locations", "archive", "trash"];

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
  /** 文档类型。旧数据无此字段 → 按 parentId 推断(有卷=小说根,否则看卷 rootKind)。 */
  kind?: DocKind;
  /** 所属根文件夹(挂在卷 id 上,卷的 rootKind 为准;此字段是文档被移到
   *  其他卷/顶层时的冗余速查)。空 = 由 parentId 链推断。 */
  rootKey?: RootKind;
  /** 卷内序号(构建手稿、树内展示用);空 = 由 order 推断。 */
  orderInVolume?: number;
  /** 非激活文档:默认不进入手稿,树内显示空心图标。 */
  inactive?: boolean;
  /** 笔记类文档的重要度标签(角色:主角/次要…)。与 status 共用存储槽位语义,
   *  由所在根决定展示哪个。 */
  importance?: string;
}

export interface Volume {
  id: string;
  projectId: string;
  title: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  /** 根文件夹类型;空 = "novel"(旧数据:所有卷都是小说根)。 */
  rootKind?: RootKind;
  /** 父卷 id:根文件夹下可有普通子文件夹。空 = 顶层根。 */
  parentId?: string | null;
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
  /** 应用级快捷键自定义：动作 id → 按键串（如 "Ctrl+Shift+D"），缺项用默认。 */
  shortcuts?: Record<string, string>;
  /** 自动整理格式规则开关（默认全开）。 */
  formatOptions?: {
    removeEmptyLines?: boolean;
    collapseInlineWhitespace?: boolean;
    punctuationToFullWidth?: boolean;
    normalizeQuotes?: boolean;
  };
  /** 拼写检查开关(浏览器原生)。 */
  spellCheck?: boolean;
  /** 拼写检查语言(BCP-47,如 "zh-CN" / "en-US")。 */
  spellCheckLang?: string;
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
