// 编辑器上下文桥接
// ----------------
// 菜单栏/命令层需要触发「保存、自动整理、撤销重做、章节切换、格式、插入」
// 这类依赖 Workspace/Editor 内部 ref(localContentRef、editorSyncRef、
// TipTap 实例)的动作。把这些动作提升进 store 会破坏现有的渲染性能设计
// (内容状态不进 store),所以用一个模块级可变容器:Workspace/Editor 挂载
// 时注册实现,卸载时清空。命令层调用前判空——无作品/无打开章节时为
// undefined,命令标记为禁用,no-op 而非 throw。

import type { Chapter } from "../types";

export interface EditorContext {
  /** 保存当前章节(= Workspace.handleManualSave)。 */
  save?: () => Promise<void>;
  /** 自动整理格式(= Workspace.handleAutoFormat)。 */
  autoFormat?: () => void;
  /** 带保存的章节切换(= Workspace.handleSelectChapter)。 */
  selectChapter?: (chapter: Chapter) => Promise<void>;
  /** TipTap 撤销/重做;编辑器未挂载时为 undefined。 */
  undo?: () => void;
  redo?: () => void;
  canUndo?: () => boolean;
  canRedo?: () => boolean;
  /** 通用编辑器动作(格式/插入/查找),由 Editor 挂载时注册。 */
  exec?: (action: string, arg?: string) => void;
}

export const editorContext: EditorContext = {};

export function registerEditorContext(ctx: Partial<EditorContext>): () => void {
  Object.assign(editorContext, ctx);
  return () => {
    for (const key of Object.keys(ctx) as (keyof EditorContext)[]) {
      delete editorContext[key];
    }
  };
}
