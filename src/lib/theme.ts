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

export type AccentKey = "brown" | "blue" | "green" | "red" | "purple";
export type PaperKey = "plain" | "parchment" | "eye";
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

export const ACCENT_ORDER: AccentKey[] = ["brown", "blue", "green", "red", "purple"];

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
};

export const PAPER_ORDER: PaperKey[] = ["plain", "parchment", "eye"];

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
};

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
