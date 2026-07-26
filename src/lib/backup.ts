// 项目备份:把整个作品文件夹复制到 {内容根}/backups/{作品名}-{时间戳}/。
// 复用 storage 的 copyDirRecursive(Tauri 递归复制命令,白名单内)。

import type { AppSettings, Project } from "../types";
import {
  copyDirRecursive,
  getAppDataDir,
  isTauri,
  projectFolderName,
  join,
} from "./storage";

export async function backupProject(project: Project, appSettings: AppSettings): Promise<string> {
  const base = appSettings.projectSaveDirectory || (await getAppDataDir());
  const src = await join(base, projectFolderName(project.name, project.id));
  const stamp = new Date()
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(0, 14);
  const destDir = await join(base, "backups");
  const dest = await join(destDir, `${projectFolderName(project.name, project.id)}-${stamp}`);
  if (!isTauri()) {
    // 浏览器模式:无真实文件系统,复制走 localStorage 命名空间。
    await copyDirRecursive(src, dest);
    return dest;
  }
  await copyDirRecursive(src, dest);
  return dest;
}
