import { beforeEach, describe, expect, it } from "vitest";
import {
  getTodayGained,
  getTodayWritingSeconds,
  addWritingSeconds,
  formatDuration,
  todayKey,
} from "./stats";

describe("writing stats", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("first call of the day pins the snapshot and reports 0 gained", () => {
    expect(getTodayGained("p1", 10000)).toBe(0);
  });

  it("reports gained words against the daily snapshot", () => {
    getTodayGained("p1", 10000);
    expect(getTodayGained("p1", 12500)).toBe(2500);
  });

  it("never reports a negative gain when text is deleted", () => {
    getTodayGained("p1", 10000);
    expect(getTodayGained("p1", 8000)).toBe(0);
  });

  it("tracks projects independently", () => {
    getTodayGained("p1", 100);
    getTodayGained("p2", 500);
    expect(getTodayGained("p1", 150)).toBe(50);
    expect(getTodayGained("p2", 700)).toBe(200);
  });

  it("accumulates writing seconds for today", () => {
    expect(getTodayWritingSeconds("p1")).toBe(0);
    addWritingSeconds("p1", 60);
    addWritingSeconds("p1", 60);
    expect(getTodayWritingSeconds("p1")).toBe(120);
  });

  it("formats durations in Chinese", () => {
    expect(formatDuration(30)).toBe("30 秒");
    expect(formatDuration(600)).toBe("10 分钟");
    expect(formatDuration(4980)).toBe("1 小时 23 分钟");
  });

  it("todayKey follows YYYY-MM-DD", () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
