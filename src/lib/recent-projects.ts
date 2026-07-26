// 最近作品辅助:欢迎对话框的数据逻辑(排序 + 字数惰性汇总)抽成纯函数,
// 便于测试。

import type { Project } from "../types";

/** 按「最近打开」排序:recentProjects 顺序优先,未记录的按更新时间倒序。 */
export function sortProjectsByRecency(projects: Project[], recentIds: string[]): Project[] {
  const rank = new Map(recentIds.map((id, idx) => [id, idx]));
  return [...projects].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return b.updatedAt - a.updatedAt;
  });
}

/** 作品总字数(章节 wordCount 求和)。 */
export function sumChapterWords(chapters: { wordCount: number }[]): number {
  return chapters.reduce((sum, c) => sum + c.wordCount, 0);
}
