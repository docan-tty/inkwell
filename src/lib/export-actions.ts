// 导出动作(菜单栏与编辑器工具条共用)
// ----------------------------------
// 原本内嵌在 Toolbar 的 ExportDropdown 里;菜单栏的「项目 → 导出」需要同样
// 的入口,提取为独立函数避免两份导出代码漂移。

import { exportChapter, exportProject } from "./export";
import { revealInFolder, dirname, getAppDataDir } from "./storage";
import type { AppSettings, Chapter, Project, Volume } from "../types";

export type ExportFormat = "chapter-md" | "chapter-txt" | "project-html" | "project-md" | "project-txt";

export interface ExportDeps {
  project: Project;
  chapter: Chapter | null;
  volumes: Volume[];
  chapters: Chapter[];
  appSettings: AppSettings;
  getChapterContent: (chapterId: string) => Promise<string>;
}

/** 执行导出并返回写出的文件路径;用户取消返回 null,失败抛错(调用方提示)。 */
export async function runExport(format: ExportFormat, deps: ExportDeps): Promise<string | null> {
  let result: { canceled: boolean; path?: string };
  if (format === "project-html" || format === "project-md" || format === "project-txt") {
    const projectFormat = format === "project-html" ? "html" : format === "project-md" ? "md" : "txt";
    result = await exportProject(
      deps.project,
      deps.volumes,
      deps.chapters,
      deps.getChapterContent,
      deps.appSettings,
      projectFormat,
    );
  } else {
    if (!deps.chapter) return null;
    result = await exportChapter(
      deps.project,
      deps.chapter,
      deps.getChapterContent,
      format === "chapter-md" ? "md" : "txt",
      deps.appSettings,
    );
  }
  return result.canceled ? null : (result.path ?? null);
}

/** 在系统文件管理器中显示已导出的文件所在目录。 */
export async function revealExportedFile(path: string): Promise<void> {
  const dir = await dirname(path);
  const err = await revealInFolder(dir);
  if (err) alert(`无法打开文件夹:${err}`);
}

/** 作品内容所在的根目录(自定义保存位置或应用数据目录)。 */
export async function getContentBaseDirForReveal(appSettings: AppSettings): Promise<string> {
  return appSettings.projectSaveDirectory || (await getAppDataDir());
}
