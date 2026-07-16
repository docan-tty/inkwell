import { describe, expect, it } from "vitest";
import { computeThemeVars, ACCENTS, PAPERS } from "./theme";

describe("computeThemeVars", () => {
  it("dark mode uses the warm-ink dark palette regardless of paper texture", () => {
    const a = computeThemeVars("dark", "brown", "parchment", false);
    const b = computeThemeVars("dark", "brown", "eye", false);
    expect(a.paper).toBe(b.paper);
    expect(a.paper).toBe("#1d1b19");
    expect(a["paper-dark"]).toBe("#1d1b19");
  });

  it("dark mode brightens the accent for contrast", () => {
    const light = computeThemeVars("light", "blue", "plain", false);
    const dark = computeThemeVars("dark", "blue", "plain", false);
    expect(light.accent).toBe(ACCENTS.blue.light);
    expect(dark.accent).toBe(ACCENTS.blue.dark);
    expect(dark.accent).not.toBe(light.accent);
  });

  it("light mode applies the selected paper texture", () => {
    const parchment = computeThemeVars("light", "brown", "parchment", false);
    expect(parchment.paper).toBe(PAPERS.parchment.base.paper);
    const plain = computeThemeVars("light", "brown", "plain", false);
    expect(plain.paper).toBe(PAPERS.plain.base.paper);
  });

  it("system mode follows the OS preference", () => {
    const sysDark = computeThemeVars("system", "brown", "plain", true);
    expect(sysDark.paper).toBe("#1d1b19");
    const sysLight = computeThemeVars("system", "brown", "plain", false);
    expect(sysLight.paper).toBe(PAPERS.plain.base.paper);
  });

  it("falls back to defaults for unknown accent/paper keys", () => {
    const vars = computeThemeVars("light", "nope" as any, "nope" as any, false);
    expect(vars.accent).toBe(ACCENTS.brown.light);
    expect(vars.paper).toBe(PAPERS.plain.base.paper);
  });

  it("always emits editor-ink so the editor text color follows the theme", () => {
    for (const mode of ["light", "dark"] as const) {
      const vars = computeThemeVars(mode, "brown", "plain", false);
      expect(vars["editor-ink"]).toBeTruthy();
    }
  });
});
