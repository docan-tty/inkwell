// 应用命令层
// ----------
// 菜单项、快捷键、工具条按钮、图标栏共用的动作注册表。每个命令有 id、
// 显示文案、可选的快捷键引用(指向 SHORTCUT_DEFS 的动作 id,展示时解析
// 用户自定义按键)和 enabled 谓词。runCommand 统一做 enabled 守卫——无作品
// 时章节类动作 no-op 而非 throw(如 createChapter 的 "No project open")。

import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "../store";
import { editorContext } from "./editor-context";
import { revealInFolder, getAppDataDir, isTauri } from "./storage";
import { runExport, type ExportFormat } from "./export-actions";

export interface CommandContext {
  hasProject: boolean;
  hasChapter: boolean;
  focusMode: boolean;
}

export interface Command {
  id: string;
  label: string;
  /** SHORTCUT_DEFS 的动作 id;菜单项据此显示用户自定义后的按键。 */
  shortcutId?: string;
  enabled?: (ctx: CommandContext) => boolean;
  run: () => void | Promise<void>;
}

export function getCommandContext(): CommandContext {
  const s = useAppStore.getState();
  return {
    hasProject: s.currentProject !== null,
    hasChapter: s.currentChapter !== null,
    focusMode: s.focusMode,
  };
}

const needsProject = (ctx: CommandContext) => ctx.hasProject;
const needsChapter = (ctx: CommandContext) => ctx.hasProject && ctx.hasChapter;

async function exportAs(format: ExportFormat): Promise<void> {
  const s = useAppStore.getState();
  if (!s.currentProject) return;
  try {
    await runExport(format, {
      project: s.currentProject,
      chapter: s.currentChapter,
      volumes: s.volumes,
      chapters: s.chapters,
      appSettings: s.appSettings,
      getChapterContent: s.getChapterContent,
    });
  } catch (err) {
    alert(`导出失败:${err instanceof Error ? err.message : String(err)}`);
  }
}

export const COMMANDS: Record<string, Command> = {
  // --- 项目 ---
  "project.new": {
    id: "project.new",
    label: "新建作品…",
    run: () => useAppStore.getState().setWelcomeOpen(true),
  },
  "project.open": {
    id: "project.open",
    label: "打开作品…",
    shortcutId: "openProject",
    run: () => useAppStore.getState().setWelcomeOpen(true),
  },
  "project.edit": {
    id: "project.edit",
    label: "作品信息…",
    enabled: needsProject,
    run: () => {
      const s = useAppStore.getState();
      s.setProjectEditTarget(s.currentProject);
    },
  },
  "project.close": {
    id: "project.close",
    label: "关闭作品",
    enabled: needsProject,
    run: async () => {
      const s = useAppStore.getState();
      await s.closeProject();
      s.setWelcomeOpen(true);
    },
  },
  "project.delete": {
    id: "project.delete",
    label: "删除作品…",
    enabled: needsProject,
    run: () => {
      const s = useAppStore.getState();
      s.setProjectDeleteTarget(s.currentProject);
    },
  },
  "project.save": {
    id: "project.save",
    label: "保存项目",
    shortcutId: "saveProject",
    enabled: needsProject,
    run: async () => {
      await editorContext.save?.();
      await useAppStore.getState().saveCurrentProject();
    },
  },
  "project.details": {
    id: "project.details",
    label: "小说细节",
    shortcutId: "projectDetails",
    enabled: needsProject,
    run: () => useAppStore.getState().setProjectDetailsOpen(true),
  },
  "project.rename": {
    id: "project.rename",
    label: "重命名项",
    shortcutId: "renameItem",
    enabled: needsProject,
    run: () => {
      // 树内重命名由选中项的 EditableLabel 处理;菜单入口聚焦于树。
      useAppStore.getState().setRenameRequest(Date.now());
    },
  },
  "project.trashItem": {
    id: "project.trashItem",
    label: "删除条目(移入回收站)",
    shortcutId: "trashItem",
    enabled: needsChapter,
    run: () => {
      const s = useAppStore.getState();
      if (s.currentChapter) void s.trashChapter(s.currentChapter.id);
    },
  },
  "project.emptyTrash": {
    id: "project.emptyTrash",
    label: "清空回收站",
    enabled: needsProject,
    run: () => useAppStore.getState().setEmptyTrashConfirm(true),
  },
  "app.quit": {
    id: "app.quit",
    label: "退出",
    shortcutId: "quitApp",
    run: async () => {
      try {
        await getCurrentWindow().close();
      } catch {
        window.close();
      }
    },
  },
  save: {
    id: "save",
    label: "保存",
    shortcutId: "save",
    enabled: needsChapter,
    run: () => editorContext.save?.(),
  },
  "export.chapter-md": {
    id: "export.chapter-md",
    label: "本章导出为 Markdown",
    enabled: needsChapter,
    run: () => exportAs("chapter-md"),
  },
  "export.chapter-txt": {
    id: "export.chapter-txt",
    label: "本章导出为纯文本",
    enabled: needsChapter,
    run: () => exportAs("chapter-txt"),
  },
  "export.project-html": {
    id: "export.project-html",
    label: "整本导出为 HTML",
    enabled: needsProject,
    run: () => exportAs("project-html"),
  },
  "export.project-md": {
    id: "export.project-md",
    label: "整本导出为 Markdown",
    enabled: needsProject,
    run: () => exportAs("project-md"),
  },
  "export.project-txt": {
    id: "export.project-txt",
    label: "整本导出为纯文本",
    enabled: needsProject,
    run: () => exportAs("project-txt"),
  },

  // --- 文档 ---
  "doc.open": {
    id: "doc.open",
    label: "打开文档",
    shortcutId: "docOpen",
    enabled: needsProject,
    run: () => toggleLeftTab("chapters"),
  },
  "doc.save": {
    id: "doc.save",
    label: "保存文档",
    shortcutId: "save",
    enabled: needsChapter,
    run: () => editorContext.save?.(),
  },
  "doc.close": {
    id: "doc.close",
    label: "关闭文档",
    shortcutId: "docClose",
    enabled: needsChapter,
    run: async () => {
      await editorContext.save?.();
      await useAppStore.getState().setCurrentChapter(null);
    },
  },
  "doc.view": {
    id: "doc.view",
    label: "查看文档",
    shortcutId: "docView",
    enabled: needsChapter,
    run: () => useAppStore.getState().setViewerOpen(true),
  },
  "doc.closeView": {
    id: "doc.closeView",
    label: "关闭文档查看",
    shortcutId: "docCloseView",
    run: () => useAppStore.getState().setViewerOpen(false),
  },
  "doc.details": {
    id: "doc.details",
    label: "显示文件详情",
    enabled: needsChapter,
    run: () => useAppStore.getState().setDocDetailsOpen(true),
  },
  "doc.importText": {
    id: "doc.importText",
    label: "从文件中导入文本",
    enabled: needsChapter,
    run: () => editorContext.exec?.("importText"),
  },
  "doc.moveToNew": {
    id: "doc.moveToNew",
    label: "移动文本到新文档",
    enabled: needsChapter,
    run: () => editorContext.exec?.("moveToNew"),
  },

  // --- 编辑 ---
  "edit.undo": {
    id: "edit.undo",
    label: "撤销",
    enabled: (ctx) => needsChapter(ctx) && (editorContext.canUndo?.() ?? false),
    run: () => editorContext.undo?.(),
  },
  "edit.redo": {
    id: "edit.redo",
    label: "重做",
    enabled: (ctx) => needsChapter(ctx) && (editorContext.canRedo?.() ?? false),
    run: () => editorContext.redo?.(),
  },
  "edit.cut": {
    id: "edit.cut",
    label: "剪切",
    enabled: needsChapter,
    run: () => { document.execCommand("cut"); },
  },
  "edit.copy": {
    id: "edit.copy",
    label: "复制",
    enabled: needsChapter,
    run: () => { document.execCommand("copy"); },
  },
  "edit.paste": {
    id: "edit.paste",
    label: "粘贴",
    enabled: needsChapter,
    run: async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) editorContext.exec?.("insertText", text);
      } catch { /* 剪贴板权限被拒时静默 */ }
    },
  },
  "edit.selectAll": {
    id: "edit.selectAll",
    label: "全选",
    enabled: needsChapter,
    run: () => editorContext.exec?.("selectAll"),
  },
  "edit.selectParagraph": {
    id: "edit.selectParagraph",
    label: "选择段落",
    shortcutId: "selectParagraph",
    enabled: needsChapter,
    run: () => editorContext.exec?.("selectParagraph"),
  },
  newChapter: {
    id: "newChapter",
    label: "新建章节",
    shortcutId: "newChapter",
    enabled: needsProject,
    run: () => {
      const s = useAppStore.getState();
      const targetVolume = s.currentChapter?.parentId ?? (s.volumes[0]?.id || null);
      void s.createChapter(targetVolume, "");
    },
  },
  "volume.new": {
    id: "volume.new",
    label: "新建分卷",
    enabled: needsProject,
    run: () => void useAppStore.getState().createVolume(""),
  },
  search: {
    id: "search",
    label: "全书搜索",
    shortcutId: "search",
    enabled: needsProject,
    run: () => useAppStore.getState().setSearchOpen(true),
  },
  "format.auto": {
    id: "format.auto",
    label: "自动整理格式",
    enabled: needsChapter,
    run: () => editorContext.autoFormat?.(),
  },

  // --- 视图 ---
  toggleLeftSidebar: {
    id: "toggleLeftSidebar",
    label: "目录侧栏",
    shortcutId: "toggleLeftSidebar",
    enabled: needsProject,
    run: () => useAppStore.getState().toggleLeftSidebar(),
  },
  "view.notes": {
    id: "view.notes",
    label: "笔记面板",
    enabled: needsProject,
    run: () => toggleLeftTab("notes"),
  },
  "view.dictionary": {
    id: "view.dictionary",
    label: "词典面板",
    enabled: needsProject,
    run: () => toggleLeftTab("dictionary"),
  },
  "view.chapters": {
    id: "view.chapters",
    label: "目录面板",
    enabled: needsProject,
    run: () => toggleLeftTab("chapters"),
  },
  toggleRightSidebar: {
    id: "toggleRightSidebar",
    label: "大纲面板",
    shortcutId: "toggleRightSidebar",
    enabled: needsProject,
    run: () => useAppStore.getState().toggleRightSidebar(),
  },
  "view.history": {
    id: "view.history",
    label: "历史版本",
    enabled: needsProject,
    run: () => {
      const s = useAppStore.getState();
      s.setRightPanelTab(s.rightSidebarOpen && s.rightPanelTab === "history" ? "none" : "history");
    },
  },
  focusMode: {
    id: "focusMode",
    label: "专注模式",
    shortcutId: "focusMode",
    enabled: needsProject,
    run: () => useAppStore.getState().toggleFocusMode(),
  },
  "view.fullscreen": {
    id: "view.fullscreen",
    label: "全屏",
    run: async () => {
      try {
        const win = getCurrentWindow();
        await win.setFullscreen(!(await win.isFullscreen()));
      } catch {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen().catch(() => {});
      }
    },
  },

  // --- 工具 ---
  "settings.open": {
    id: "settings.open",
    label: "全局设置…",
    shortcutId: "openSettings",
    run: () => useAppStore.getState().setSettingsOpen(true),
  },
  "tools.revealDir": {
    id: "tools.revealDir",
    label: "打开作品保存位置",
    run: async () => {
      const s = useAppStore.getState();
      const dir = s.appSettings.projectSaveDirectory || (await getAppDataDir());
      const err = await revealInFolder(dir);
      if (err) alert(`无法打开文件夹:${err}`);
    },
  },
  "tools.spellToggle": {
    id: "tools.spellToggle",
    label: "拼写检查",
    shortcutId: "spellToggle",
    enabled: needsProject,
    run: () => {
      const s = useAppStore.getState();
      s.updateAppSettings({ spellCheck: !s.appSettings.spellCheck });
    },
  },
  "tools.spellRerun": {
    id: "tools.spellRerun",
    label: "重新执行拼写检查",
    shortcutId: "spellRerun",
    enabled: needsChapter,
    run: () => editorContext.exec?.("spellRerun"),
  },
  "tools.projectWords": {
    id: "tools.projectWords",
    label: "项目单词列表",
    enabled: needsProject,
    run: () => useAppStore.getState().setProjectWordsOpen(true),
  },
  "tools.rebuildIndex": {
    id: "tools.rebuildIndex",
    label: "重建索引",
    shortcutId: "rebuildIndex",
    enabled: needsProject,
    run: async () => {
      await useAppStore.getState().rebuildTagsIndex();
    },
  },
  "tools.backup": {
    id: "tools.backup",
    label: "备份项目",
    enabled: needsProject,
    run: () => useAppStore.getState().setBackupConfirm(true),
  },
  /** 供确认对话框调用的实际备份动作。 */
  "tools.backupNow": {
    id: "tools.backupNow",
    label: "立即备份",
    enabled: needsProject,
    run: async () => {
      const s = useAppStore.getState();
      const project = s.currentProject;
      if (!project) return;
      try {
        await editorContext.save?.();
        await s.saveCurrentProject();
        const { backupProject } = await import("./backup");
        const path = await backupProject(project, s.appSettings);
        alert(`备份完成:\n${path}`);
      } catch (err) {
        alert(`备份失败:${err instanceof Error ? err.message : String(err)}`);
      }
    },
  },
  "tools.manuscript": {
    id: "tools.manuscript",
    label: "手稿构建",
    shortcutId: "manuscript",
    enabled: needsProject,
    run: () => useAppStore.getState().setManuscriptOpen(true),
  },
  "tools.stats": {
    id: "tools.stats",
    label: "写作统计",
    shortcutId: "writingStats",
    enabled: needsProject,
    run: () => useAppStore.getState().setStatsOpen(true),
  },
};

// --- 插入(符号/关键字/字段,经 editorContext.exec 注入当前编辑器) ---
const INSERT_TEXT: Record<string, [string, string]> = {
  "insert.emDash": ["破折号(长)", "—"],
  "insert.enDash": ["破折号(短)", "–"],
  "insert.hBar": ["水平线", "――"],
  "insert.figDash": ["数字宽破折号", "‒"],
  "insert.lsquo": ["左单引号", "‘"],
  "insert.rsquo": ["右单引号", "’"],
  "insert.ldquo": ["左双引号", "“"],
  "insert.rdquo": ["右双引号", "”"],
  "insert.prime": ["撇号", "′"],
  "insert.dblPrime": ["双撇号", "″"],
  "insert.ellipsis": ["省略号", "……"],
  "insert.apostrophe": ["修饰撇号", "ʼ"],
  "insert.perMille": ["千分号", "‰"],
  "insert.nbsp": ["不换行空格", " "],
  "insert.thinNbsp": ["窄不换行空格", " "],
  "insert.thinSpace": ["窄空格", " "],
  "insert.bullet": ["列表圆点", "•"],
  "insert.flower": ["花形符号", "⁂"],
  "insert.hyphenBullet": ["连字符圆点", "⁃"],
  "insert.times": ["乘号", "×"],
  "insert.divide": ["除号", "÷"],
  "insert.degree": ["度数符号", "°"],
};
for (const [id, [label, text]] of Object.entries(INSERT_TEXT)) {
  COMMANDS[id] = {
    id,
    label,
    enabled: needsChapter,
    run: () => editorContext.exec?.("insertText", text),
  };
}
const INSERT_KW: Record<string, string> = {
  "insert.kwTag": "tag",
  "insert.kwPov": "pov",
  "insert.kwFocus": "focus",
  "insert.kwChar": "char",
  "insert.kwPlot": "plot",
  "insert.kwTime": "time",
  "insert.kwLocation": "location",
  "insert.kwObject": "object",
  "insert.kwEntity": "entity",
  "insert.kwCustom": "custom",
  "insert.kwMention": "mention",
  "insert.kwStory": "story",
};
for (const [id, kw] of Object.entries(INSERT_KW)) {
  COMMANDS[id] = {
    id,
    label: `@${kw}`,
    enabled: needsChapter,
    run: () => editorContext.exec?.("insertKeyword", kw),
  };
}
Object.assign(COMMANDS, {
  "insert.synopsis": { id: "insert.synopsis", label: "概要注释 %Synopsis:", enabled: needsChapter, run: () => editorContext.exec?.("insertComment", "Synopsis") },
  "insert.short": { id: "insert.short", label: "简述注释 %Short:", enabled: needsChapter, run: () => editorContext.exec?.("insertComment", "Short") },
  "insert.footnoteComment": { id: "insert.footnoteComment", label: "脚注文本 %Footnote:", enabled: needsChapter, run: () => editorContext.exec?.("insertComment", "Footnote.fn1") },
  "insert.fieldWords": { id: "insert.fieldWords", label: "总字数代码", enabled: needsChapter, run: () => editorContext.exec?.("insertField", "textWords") },
  "insert.fieldChars": { id: "insert.fieldChars", label: "总字符代码", enabled: needsChapter, run: () => editorContext.exec?.("insertField", "textChars") },
  "insert.fieldParas": { id: "insert.fieldParas", label: "段落数代码", enabled: needsChapter, run: () => editorContext.exec?.("insertField", "paragraphCount") },
  "insert.vspace": { id: "insert.vspace", label: "垂直间距", enabled: needsChapter, run: () => editorContext.exec?.("insertVspace") },
  "insert.vspace2": { id: "insert.vspace2", label: "垂直间距 ×2", enabled: needsChapter, run: () => editorContext.exec?.("insertVspace", "2") },
  "insert.newPage": { id: "insert.newPage", label: "分页符", enabled: needsChapter, run: () => editorContext.exec?.("insertNewPage") },
  "insert.footnote": { id: "insert.footnote", label: "脚注", enabled: needsChapter, run: () => editorContext.exec?.("insertFootnote") },
} satisfies Record<string, Command>);

// --- 格式 ---
const FORMAT_ACTIONS: Record<string, [string, string]> = {
  "fmt.bold": ["粗体", "bold"],
  "fmt.italic": ["斜体", "italic"],
  "fmt.strike": ["删除线", "strike"],
  "fmt.underline": ["下划线", "underline"],
  "fmt.highlight": ["高亮", "highlight"],
  "fmt.superscript": ["上标", "superscript"],
  "fmt.subscript": ["下标", "subscript"],
  "fmt.h1": ["标题 1(分区)", "h1"],
  "fmt.h2": ["标题 2(章节)", "h2"],
  "fmt.h3": ["标题 3(场景)", "h3"],
  "fmt.h4": ["标题 4(小节)", "h4"],
  "fmt.alignLeft": ["左对齐", "alignLeft"],
  "fmt.alignCenter": ["居中", "alignCenter"],
  "fmt.alignRight": ["右对齐", "alignRight"],
  "fmt.clearFormat": ["移除块格式", "clearFormat"],
};
for (const [id, [label, action]] of Object.entries(FORMAT_ACTIONS)) {
  COMMANDS[id] = {
    id,
    label,
    enabled: needsChapter,
    run: () => editorContext.exec?.(action),
  };
}
Object.assign(COMMANDS, {
  "fmt.wrapDq": { id: "fmt.wrapDq", label: "用双引号环绕", enabled: needsChapter, run: () => editorContext.exec?.("wrapDoubleQuote") },
  "fmt.wrapSq": { id: "fmt.wrapSq", label: "用单引号环绕", enabled: needsChapter, run: () => editorContext.exec?.("wrapSingleQuote") },
  "fmt.bangH1": { id: "fmt.bangH1", label: "小说标题(#!)", enabled: needsChapter, run: () => editorContext.exec?.("bangHeading", "1") },
  "fmt.bangH2": { id: "fmt.bangH2", label: "未编号章节(##!)", enabled: needsChapter, run: () => editorContext.exec?.("bangHeading", "2") },
  "fmt.bangH3": { id: "fmt.bangH3", label: "备选场景(###!)", enabled: needsChapter, run: () => editorContext.exec?.("bangHeading", "3") },
  "fmt.toggleComment": { id: "fmt.toggleComment", label: "切换注释", enabled: needsChapter, run: () => editorContext.exec?.("toggleComment") },
  "fmt.toggleIgnore": { id: "fmt.toggleIgnore", label: "切换忽略文本", enabled: needsChapter, run: () => editorContext.exec?.("toggleIgnore") },
} satisfies Record<string, Command>);

// --- 搜索(文档内查找/替换由 EditorSearchBar 处理,命令只做入口) ---
Object.assign(COMMANDS, {
  "search.find": { id: "search.find", label: "查找", shortcutId: "findInDoc", enabled: needsChapter, run: () => editorContext.exec?.("searchOpen", "find") },
  "search.replace": { id: "search.replace", label: "替换", shortcutId: "replaceInDoc", enabled: needsChapter, run: () => editorContext.exec?.("searchOpen", "replace") },
  "search.findNext": { id: "search.findNext", label: "查找下一个", shortcutId: "findNext", enabled: needsChapter, run: () => editorContext.exec?.("searchNext") },
  "search.findPrev": { id: "search.findPrev", label: "查找上一个", shortcutId: "findPrev", enabled: needsChapter, run: () => editorContext.exec?.("searchPrev") },
  "search.replaceNext": { id: "search.replaceNext", label: "替换下一个", shortcutId: "replaceNext", enabled: needsChapter, run: () => editorContext.exec?.("searchReplaceNext") },
} satisfies Record<string, Command>);

function toggleLeftTab(tab: "chapters" | "notes" | "dictionary"): void {
  const s = useAppStore.getState();
  if (s.leftSidebarOpen && s.leftSidebarTab === tab) s.toggleLeftSidebar();
  else s.setLeftSidebarTab(tab);
}

/** 打开最近作品(供「项目 → 最近打开」子菜单)。 */
export async function openRecentProject(projectId: string): Promise<void> {
  const s = useAppStore.getState();
  const project = s.projects.find((p) => p.id === projectId);
  if (!project) return;
  try {
    await s.openProject(project);
    s.setWelcomeOpen(false);
  } catch (err) {
    alert(`打开作品失败:${err instanceof Error ? err.message : String(err)}`);
  }
}

export function isTauriApp(): boolean {
  return isTauri();
}

/** 执行命令;disabled 或不存在时 no-op。 */
export function runCommand(id: string): void {
  const cmd = COMMANDS[id];
  if (!cmd) return;
  if (cmd.enabled && !cmd.enabled(getCommandContext())) return;
  void cmd.run();
}

export function isCommandEnabled(id: string, ctx: CommandContext): boolean {
  const cmd = COMMANDS[id];
  if (!cmd) return false;
  return cmd.enabled ? cmd.enabled(ctx) : true;
}
