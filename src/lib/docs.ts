// 文档模型辅助:根文件夹推断、文档类型推断、树形排序。
// novelWriter 第一性原则:一切内容皆为文档,文档归属由「所在卷的 rootKind」
// 决定;kind/rootKey 字段只是冗余速查,推断规则是单一事实源。

import type { Chapter, DocKind, RootKind, Volume } from "../types";
import { ROOT_DEFS } from "../types";

/** 卷的根文件夹类型(旧数据无 rootKind → novel)。 */
export function volumeRootKind(volume: Volume | undefined | null): RootKind {
  return volume?.rootKind ?? "novel";
}

/** 文档所属的根文件夹类型:挂在卷下 → 卷的 rootKind;顶层孤儿 → 存量的
 *  rootKey 速查,否则 novel(旧数据全是正文章节)。 */
export function chapterRootKind(chapter: Chapter, volumes: Volume[]): RootKind {
  if (chapter.parentId) {
    const v = volumes.find((v) => v.id === chapter.parentId);
    if (v) return volumeRootKind(v);
  }
  return chapter.rootKey ?? "novel";
}

/** 文档类型:显式 kind 优先,否则由所在根的 docKind 推断。 */
export function chapterDocKind(chapter: Chapter, volumes: Volume[]): DocKind {
  if (chapter.kind) return chapter.kind;
  const root = chapterRootKind(chapter, volumes);
  const def = ROOT_DEFS[root];
  return def.docKind === "novel" ? "novel" : "note";
}

/** 收集文档及其全部后代 id(移动到回收站/删除时用)。 */
export function collectDescendants(chapters: Chapter[], rootId: string): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    out.push(id);
    for (const c of chapters) if (c.parentId === id) walk(c.id);
  };
  walk(rootId);
  return out;
}

/** 文档目标字数:0/未设置 = 跟随全局默认。 */
export function chapterTarget(chapter: Chapter | null | undefined, defaultTarget: number): number {
  return chapter?.targetWords || defaultTarget;
}
