/*
 * 主题调色板定义
 * -------------
 * applyTheme() 把这里选中的色板写成 <html> 上的 CSS 变量，Tailwind 的
 * paper/ink/accent 等工具类经 @theme inline 读取这些变量。
 *
 * 设计要点：
 *  - 深色模式为「暖调墨色」：低蓝光的暖灰背景 + 柔和米色文字，长时间写作不刺眼；
 *    accent 在深色下统一提亮，保证按钮/高亮的可读对比度。
 *  - 纸张质感只作用于浅色（深色下保持暗背景）。
 */

export type AccentKey = "brown" | "blue" | "green" | "red" | "purple" | "teal";
export type PaperKey = "plain" | "white" | "parchment" | "eye" | "celadon";
export type ThemeMode = "light" | "dark" | "system";

interface Palette {
  paper: string;
  ink: string;
  inkMuted: string;
  warmGray: string;
  accent: string;
  accentLight: string;
  scrollbarThumb: string;
  scrollbarThumbHover: string;
  placeholder: string;
}

interface DarkPalette {
  paper: string;
  ink: string;
  inkMuted: string;
  warmGray: string;
  scrollbarThumb: string;
  scrollbarThumbHover: string;
  placeholder: string;
}

export const ACCENT_ORDER: AccentKey[] = ["brown", "blue", "green", "teal", "red", "purple"];

export const ACCENTS: Record<
  AccentKey,
  { label: string; light: string; lightLight: string; dark: string; darkLight: string; swatch: string }
> = {
  brown: {
    label: "墨棕",
    light: "#8b5a2b",
    lightLight: "#a67c52",
    dark: "#cba06b",
    darkLight: "#ddbb8a",
    swatch: "#a67c52",
  },
  blue: {
    label: "黛蓝",
    light: "#33547d",
    lightLight: "#4f719c",
    dark: "#8db3e0",
    darkLight: "#a9c8ec",
    swatch: "#4f719c",
  },
  green: {
    label: "松绿",
    light: "#35604a",
    lightLight: "#52806a",
    dark: "#93c3a6",
    darkLight: "#add6bd",
    swatch: "#52806a",
  },
  red: {
    label: "胭脂",
    light: "#9c3f45",
    lightLight: "#b86066",
    dark: "#dd9398",
    darkLight: "#e8adb1",
    swatch: "#b86066",
  },
  purple: {
    label: "紫檀",
    light: "#6b4a7d",
    lightLight: "#876a99",
    dark: "#bda3d6",
    darkLight: "#d0bde3",
    swatch: "#876a99",
  },
  teal: {
    label: "青瓷",
    light: "#2f6f6a",
    lightLight: "#4d8c86",
    dark: "#8fc4bd",
    darkLight: "#abd6d0",
    swatch: "#4d8c86",
  },
};

export const PAPER_ORDER: PaperKey[] = ["plain", "white", "parchment", "eye", "celadon"];

export const PAPERS: Record<PaperKey, { label: string; hint: string; base: Omit<Palette, "accent" | "accentLight"> }> = {
  plain: {
    label: "米白",
    hint: "默认纸质",
    base: {
      paper: "#faf8f5",
      ink: "#1a1a1a",
      inkMuted: "#6b6b6b",
      warmGray: "#e8e4de",
      scrollbarThumb: "rgba(0,0,0,0.15)",
      scrollbarThumbHover: "rgba(0,0,0,0.25)",
      placeholder: "rgba(0,0,0,0.25)",
    },
  },
  white: {
    label: "纯白",
    hint: "干净亮白",
    base: {
      paper: "#ffffff",
      ink: "#1a1a1a",
      inkMuted: "#6b6b6b",
      warmGray: "#ececec",
      scrollbarThumb: "rgba(0,0,0,0.14)",
      scrollbarThumbHover: "rgba(0,0,0,0.24)",
      placeholder: "rgba(0,0,0,0.25)",
    },
  },
  parchment: {
    label: "羊皮纸",
    hint: "暖黄复古",
    base: {
      paper: "#f5efdd",
      ink: "#2a2113",
      inkMuted: "#77683f",
      warmGray: "#e6dcc0",
      scrollbarThumb: "rgba(120,95,40,0.20)",
      scrollbarThumbHover: "rgba(120,95,40,0.32)",
      placeholder: "rgba(90,70,30,0.30)",
    },
  },
  eye: {
    label: "护眼绿",
    hint: "柔绿低刺激",
    base: {
      paper: "#edf3ec",
      ink: "#18221a",
      inkMuted: "#5b6b5d",
      warmGray: "#d7e2d6",
      scrollbarThumb: "rgba(40,80,50,0.18)",
      scrollbarThumbHover: "rgba(40,80,50,0.30)",
      placeholder: "rgba(50,80,55,0.28)",
    },
  },
  celadon: {
    label: "青瓷",
    hint: "冷调青灰",
    base: {
      paper: "#eef3f2",
      ink: "#1a2322",
      inkMuted: "#556664",
      warmGray: "#d8e2e0",
      scrollbarThumb: "rgba(40,80,80,0.16)",
      scrollbarThumbHover: "rgba(40,80,80,0.28)",
      placeholder: "rgba(45,75,75,0.26)",
    },
  },
};

  /** 预设主题：整套协调搭配（主题色 + 纸张质感），一键应用。 */
export interface ThemePreset {
  id: string;
  label: string;
  hint: string;
  accent: AccentKey;
  paper: PaperKey;
  /** 预览卡底色（浅色纸张）。 */
  preview: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "ink", label: "墨韵", hint: "默认米白 + 墨棕", accent: "brown", paper: "plain", preview: "#faf8f5" },
  { id: "celadon", label: "青瓷", hint: "冷调青灰 + 青瓷", accent: "teal", paper: "celadon", preview: "#eef3f2" },
  { id: "parchment", label: "卷轴", hint: "暖黄羊皮纸 + 胭脂", accent: "red", paper: "parchment", preview: "#f5efdd" },
  { id: "pine", label: "松间", hint: "护眼绿 + 松绿", accent: "green", paper: "eye", preview: "#edf3ec" },
  { id: "dusk", label: "暮蓝", hint: "米白 + 黛蓝", accent: "blue", paper: "plain", preview: "#f2f4f8" },
  { id: "sandal", label: "檀香", hint: "羊皮纸 + 紫檀", accent: "purple", paper: "parchment", preview: "#f5efdd" },
];

/*
 * 深色模式：暖调墨色。
 * 背景是带一点点暖意的深灰（非纯黑、非蓝灰），文字是低对比米色，
 * 大幅减少夜间长时间写作的视觉疲劳。accent 统一提亮一档。
 */
const DARK: DarkPalette = {
  paper: "#1d1b19",
  ink: "#e9e4dc",
  inkMuted: "#a49c92",
  warmGray: "#35312d",
  scrollbarThumb: "rgba(255,255,255,0.14)",
  scrollbarThumbHover: "rgba(255,255,255,0.26)",
  placeholder: "rgba(255,255,255,0.24)",
};

/** 计算当前应写入 <html> 的全部 CSS 变量。 */
export function computeThemeVars(
  mode: ThemeMode,
  accentKey: AccentKey,
  paperKey: PaperKey,
  systemPrefersDark: boolean,
): Record<string, string> {
  const dark = mode === "dark" || (mode === "system" && systemPrefersDark);
  const accent = ACCENTS[accentKey] || ACCENTS.brown;
  const paperDef = PAPERS[paperKey] || PAPERS.plain;

  if (dark) {
    return {
      paper: DARK.paper,
      "paper-dark": DARK.paper,
      ink: DARK.ink,
      "ink-dark": DARK.ink,
      "ink-muted": DARK.inkMuted,
      "ink-muted-dark": DARK.inkMuted,
      "warm-gray": DARK.warmGray,
      "warm-gray-dark": DARK.warmGray,
      accent: accent.dark,
      "accent-light": accent.darkLight,
      "scrollbar-thumb": DARK.scrollbarThumb,
      "scrollbar-thumb-hover": DARK.scrollbarThumbHover,
      placeholder: DARK.placeholder,
      "editor-ink": DARK.ink,
    };
  }

  const p = paperDef.base;
  return {
    paper: p.paper,
    "paper-dark": DARK.paper,
    ink: p.ink,
    "ink-dark": DARK.ink,
    "ink-muted": p.inkMuted,
    "ink-muted-dark": DARK.inkMuted,
    "warm-gray": p.warmGray,
    "warm-gray-dark": DARK.warmGray,
    accent: accent.light,
    "accent-light": accent.lightLight,
    "scrollbar-thumb": p.scrollbarThumb,
    "scrollbar-thumb-hover": p.scrollbarThumbHover,
    placeholder: p.placeholder,
    "editor-ink": p.ink,
  };
}
