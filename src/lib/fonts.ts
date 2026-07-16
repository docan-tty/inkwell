/*
 * 字体预设
 * --------
 * 全部使用系统已装字体，零下载、零网络请求；每个栈末尾回落到通用族，
 * 缺字体时自动取下一候选。label 用于设置页展示，preview 是卡片上的样字。
 */

export interface FontPreset {
  id: string;
  label: string;
  preview: string;
  value: string;
}

export const UI_FONT_PRESETS: FontPreset[] = [
  {
    id: "serif",
    label: "思源宋体",
    preview: "笔墨纸砚",
    value: '"Noto Serif SC", "Source Han Serif SC", "PingFang SC", "Microsoft YaHei", serif',
  },
  {
    id: "sans",
    label: "黑体",
    preview: "笔墨纸砚",
    value: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif',
  },
  {
    id: "kai",
    label: "楷体",
    preview: "笔墨纸砚",
    value: '"Kaiti SC", "KaiTi", "STKaiti", "楷体", serif',
  },
  {
    id: "fangsong",
    label: "仿宋",
    preview: "笔墨纸砚",
    value: '"FangSong", "STFangsong", "仿宋", serif',
  },
  {
    id: "mono",
    label: "等宽",
    preview: "Ink0123",
    value: '"JetBrains Mono", "Cascadia Mono", Consolas, "Courier New", monospace',
  },
];
