// 菜单栏数据源
// ------------
// 菜单结构与命令的映射集中在这里(MenuBar 纯渲染),便于测试校验:
// 每个 command 引用都必须在 COMMANDS 里存在,shortcutId 必须在 SHORTCUT_DEFS
// 里存在。内联动作(如主题三态)用 { label, checked, run } 直接描述。

import type { ThemeMode } from "./theme";
import { useAppStore } from "../store";

export type MenuItem =
  | { kind: "command"; command: string; label?: string }
  | { kind: "separator" }
  | { kind: "recent" }
  | { kind: "theme" }
  | { kind: "submenu"; label: string; items: MenuItem[] }
  | { kind: "label"; label: string; checked?: boolean; disabled?: boolean; run: () => void };

export interface MenuDef {
  id: string;
  label: string;
  items: MenuItem[];
}

export const MENU_DEFS: MenuDef[] = [
  {
    id: "project",
    label: "项目",
    items: [
      { kind: "command", command: "project.new" },
      { kind: "command", command: "project.open" },
      { kind: "recent" },
      { kind: "separator" },
      { kind: "command", command: "project.save" },
      { kind: "command", command: "project.close" },
      { kind: "separator" },
      { kind: "command", command: "project.edit" },
      { kind: "command", command: "project.details" },
      { kind: "command", command: "project.rename" },
      { kind: "command", command: "project.trashItem" },
      { kind: "command", command: "project.emptyTrash" },
      { kind: "separator" },
      { kind: "command", command: "project.delete" },
      { kind: "separator" },
      { kind: "command", command: "app.quit" },
    ],
  },
  {
    id: "document",
    label: "文档",
    items: [
      { kind: "command", command: "doc.open" },
      { kind: "command", command: "doc.save" },
      { kind: "command", command: "doc.close" },
      { kind: "separator" },
      { kind: "command", command: "doc.view" },
      { kind: "command", command: "doc.closeView" },
      { kind: "separator" },
      { kind: "command", command: "doc.details" },
      { kind: "command", command: "doc.importText" },
      { kind: "command", command: "doc.moveToNew" },
    ],
  },
  {
    id: "edit",
    label: "编辑",
    items: [
      { kind: "command", command: "edit.undo" },
      { kind: "command", command: "edit.redo" },
      { kind: "separator" },
      { kind: "command", command: "edit.cut" },
      { kind: "command", command: "edit.copy" },
      { kind: "command", command: "edit.paste" },
      { kind: "command", command: "edit.selectAll" },
      { kind: "command", command: "edit.selectParagraph" },
      { kind: "separator" },
      { kind: "command", command: "newChapter" },
      { kind: "command", command: "volume.new" },
      { kind: "separator" },
      { kind: "command", command: "search" },
      { kind: "command", command: "format.auto" },
    ],
  },
  {
    id: "view",
    label: "视图",
    items: [
      { kind: "command", command: "view.chapters" },
      { kind: "command", command: "view.notes" },
      { kind: "command", command: "view.dictionary" },
      { kind: "separator" },
      { kind: "command", command: "toggleRightSidebar" },
      { kind: "command", command: "view.history" },
      { kind: "separator" },
      { kind: "command", command: "focusMode" },
      { kind: "command", command: "view.fullscreen" },
      { kind: "separator" },
      { kind: "theme" },
    ],
  },
  {
    id: "insert",
    label: "插入",
    items: [
      {
        kind: "submenu",
        label: "破折号",
        items: [
          { kind: "command", command: "insert.emDash" },
          { kind: "command", command: "insert.enDash" },
          { kind: "command", command: "insert.hBar" },
          { kind: "command", command: "insert.figDash" },
        ],
      },
      {
        kind: "submenu",
        label: "引号",
        items: [
          { kind: "command", command: "insert.lsquo" },
          { kind: "command", command: "insert.rsquo" },
          { kind: "command", command: "insert.ldquo" },
          { kind: "command", command: "insert.rdquo" },
          { kind: "command", command: "insert.prime" },
          { kind: "command", command: "insert.dblPrime" },
        ],
      },
      {
        kind: "submenu",
        label: "一般标点",
        items: [
          { kind: "command", command: "insert.ellipsis" },
          { kind: "command", command: "insert.apostrophe" },
          { kind: "command", command: "insert.perMille" },
        ],
      },
      {
        kind: "submenu",
        label: "空白",
        items: [
          { kind: "command", command: "insert.nbsp" },
          { kind: "command", command: "insert.thinNbsp" },
          { kind: "command", command: "insert.thinSpace" },
        ],
      },
      {
        kind: "submenu",
        label: "其他符号",
        items: [
          { kind: "command", command: "insert.bullet" },
          { kind: "command", command: "insert.flower" },
          { kind: "command", command: "insert.hyphenBullet" },
          { kind: "command", command: "insert.times" },
          { kind: "command", command: "insert.divide" },
          { kind: "command", command: "insert.degree" },
        ],
      },
      {
        kind: "submenu",
        label: "标签和参考",
        items: [
          { kind: "command", command: "insert.kwTag" },
          { kind: "command", command: "insert.kwPov" },
          { kind: "command", command: "insert.kwFocus" },
          { kind: "command", command: "insert.kwChar" },
          { kind: "command", command: "insert.kwPlot" },
          { kind: "command", command: "insert.kwTime" },
          { kind: "command", command: "insert.kwLocation" },
          { kind: "command", command: "insert.kwObject" },
          { kind: "command", command: "insert.kwEntity" },
          { kind: "command", command: "insert.kwCustom" },
          { kind: "command", command: "insert.kwMention" },
          { kind: "command", command: "insert.kwStory" },
        ],
      },
      {
        kind: "submenu",
        label: "特殊注释",
        items: [
          { kind: "command", command: "insert.synopsis" },
          { kind: "command", command: "insert.short" },
          { kind: "command", command: "insert.footnoteComment" },
        ],
      },
      {
        kind: "submenu",
        label: "单词/字符计数",
        items: [
          { kind: "command", command: "insert.fieldWords" },
          { kind: "command", command: "insert.fieldChars" },
          { kind: "command", command: "insert.fieldParas" },
        ],
      },
      { kind: "separator" },
      { kind: "command", command: "insert.vspace" },
      { kind: "command", command: "insert.vspace2" },
      { kind: "command", command: "insert.newPage" },
      { kind: "separator" },
      { kind: "command", command: "insert.footnote" },
    ],
  },
  {
    id: "format",
    label: "格式",
    items: [
      { kind: "command", command: "fmt.bold" },
      { kind: "command", command: "fmt.italic" },
      { kind: "command", command: "fmt.strike" },
      { kind: "command", command: "fmt.underline" },
      { kind: "command", command: "fmt.highlight" },
      { kind: "command", command: "fmt.superscript" },
      { kind: "command", command: "fmt.subscript" },
      { kind: "separator" },
      { kind: "command", command: "fmt.wrapDq" },
      { kind: "command", command: "fmt.wrapSq" },
      { kind: "separator" },
      { kind: "command", command: "fmt.h1" },
      { kind: "command", command: "fmt.h2" },
      { kind: "command", command: "fmt.h3" },
      { kind: "command", command: "fmt.h4" },
      { kind: "separator" },
      { kind: "command", command: "fmt.bangH1" },
      { kind: "command", command: "fmt.bangH2" },
      { kind: "command", command: "fmt.bangH3" },
      { kind: "separator" },
      { kind: "command", command: "fmt.alignLeft" },
      { kind: "command", command: "fmt.alignCenter" },
      { kind: "command", command: "fmt.alignRight" },
      { kind: "separator" },
      { kind: "command", command: "fmt.toggleComment" },
      { kind: "command", command: "fmt.toggleIgnore" },
      { kind: "command", command: "fmt.clearFormat" },
      { kind: "separator" },
      { kind: "command", command: "format.auto" },
    ],
  },
  {
    id: "search",
    label: "搜索",
    items: [
      { kind: "command", command: "search.find" },
      { kind: "command", command: "search.replace" },
      { kind: "command", command: "search.findNext" },
      { kind: "command", command: "search.findPrev" },
      { kind: "command", command: "search.replaceNext" },
      { kind: "separator" },
      { kind: "command", command: "search" },
    ],
  },
  {
    id: "tools",
    label: "工具",
    items: [
      { kind: "command", command: "tools.spellToggle" },
      { kind: "command", command: "tools.spellRerun" },
      { kind: "command", command: "tools.projectWords" },
      { kind: "separator" },
      { kind: "command", command: "tools.rebuildIndex" },
      { kind: "command", command: "tools.backup" },
      { kind: "command", command: "tools.manuscript" },
      { kind: "command", command: "tools.stats" },
      { kind: "separator" },
      { kind: "command", command: "tools.revealDir" },
      { kind: "command", command: "settings.open" },
    ],
  },
  {
    id: "help",
    label: "帮助",
    items: [
      {
        kind: "label",
        label: "关于墨池",
        run: () => useAppStore.getState().setAboutOpen(true),
      },
    ],
  },
];

export const THEME_OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: "light", label: "浅色" },
  { mode: "dark", label: "深色" },
  { mode: "system", label: "跟随系统" },
];
