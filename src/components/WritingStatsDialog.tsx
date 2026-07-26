import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useAppStore } from "../store";
import { getWritingHistory, formatDuration, type DayStat } from "../lib/stats";
import { formatNumber, cn } from "../lib/utils";

// 写作统计对话框(novelWriter F6):按日历史(起始/结束总字数、净增、
// 写作时长),支持近 7/30/全部范围,可导出 JSON / CSV。
export function WritingStatsDialog() {
  const open = useAppStore((s) => s.statsOpen);
  const setStatsOpen = useAppStore((s) => s.setStatsOpen);
  const currentProject = useAppStore((s) => s.currentProject);
  const [range, setRange] = useState<"7" | "30" | "all">("30");
  const [history, setHistory] = useState<DayStat[]>([]);

  useEffect(() => {
    if (!open || !currentProject) return;
    setHistory(getWritingHistory(currentProject.id));
  }, [open, currentProject]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setStatsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, setStatsOpen]);

  const filtered = useMemo(() => {
    if (range === "all") return history;
    const days = parseInt(range, 10);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cut = cutoff.toISOString().slice(0, 10);
    return history.filter((d) => d.date >= cut);
  }, [history, range]);

  const totals = useMemo(() => {
    const gained = filtered.reduce((s, d) => s + Math.max(0, d.endTotal - d.startTotal), 0);
    const seconds = filtered.reduce((s, d) => s + d.seconds, 0);
    return { gained, seconds };
  }, [filtered]);

  if (!open || !currentProject) return null;

  const exportJSON = () => download(`${currentProject.name}-写作统计.json`, JSON.stringify(filtered, null, 2), "application/json");
  const exportCSV = () => {
    const rows = [["日期", "起始总字数", "结束总字数", "净增", "写作秒数"].join(",")];
    for (const d of filtered) {
      rows.push([d.date, d.startTotal, d.endTotal, Math.max(0, d.endTotal - d.startTotal), d.seconds].join(","));
    }
    download(`${currentProject.name}-写作统计.csv`, "﻿" + rows.join("\n"), "text/csv");
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 animate-[inkwell-fade-in_0.15s_ease-out]" onClick={() => setStatsOpen(false)}>
      <div
        className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-warm-gray bg-paper shadow-2xl dark:border-warm-gray-dark dark:bg-paper-dark animate-[inkwell-pop-in_0.15s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-warm-gray px-4 dark:border-warm-gray-dark">
          <span className="text-sm font-medium text-ink dark:text-ink-dark">写作统计 — {currentProject.name}</span>
          <button onClick={() => setStatsOpen(false)} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark">
            <X size={16} />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-b border-warm-gray/60 px-4 py-2 dark:border-warm-gray-dark/60">
          {(["7", "30", "all"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs transition-colors",
                range === r ? "bg-accent/10 font-medium text-accent dark:bg-accent/20" : "text-ink-muted hover:bg-warm-gray dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark",
              )}
            >
              {r === "all" ? "全部" : `近 ${r} 天`}
            </button>
          ))}
          <span className="ml-auto text-xs text-ink-muted dark:text-ink-muted-dark">
            净增 {formatNumber(totals.gained)} 字 · 写作 {formatDuration(totals.seconds)}
          </span>
          <button onClick={exportJSON} className="rounded-md border border-warm-gray px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-warm-gray dark:border-warm-gray-dark dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark">
            JSON
          </button>
          <button onClick={exportCSV} className="rounded-md border border-warm-gray px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-warm-gray dark:border-warm-gray-dark dark:text-ink-muted-dark dark:hover:bg-warm-gray-dark">
            CSV
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-muted dark:text-ink-muted-dark">
              还没有写作记录。开始写作后,这里会按天记录字数与时长。
            </p>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-left text-ink-muted dark:text-ink-muted-dark">
                  <th className="border-b border-warm-gray px-2 py-1.5 font-medium dark:border-warm-gray-dark">日期</th>
                  <th className="border-b border-warm-gray px-2 py-1.5 text-right font-medium dark:border-warm-gray-dark">起始</th>
                  <th className="border-b border-warm-gray px-2 py-1.5 text-right font-medium dark:border-warm-gray-dark">结束</th>
                  <th className="border-b border-warm-gray px-2 py-1.5 text-right font-medium dark:border-warm-gray-dark">净增</th>
                  <th className="border-b border-warm-gray px-2 py-1.5 text-right font-medium dark:border-warm-gray-dark">时长</th>
                </tr>
              </thead>
              <tbody>
                {[...filtered].reverse().map((d) => (
                  <tr key={d.date} className="text-ink dark:text-ink-dark">
                    <td className="border-b border-warm-gray/50 px-2 py-1.5 dark:border-warm-gray-dark/50">{d.date}</td>
                    <td className="border-b border-warm-gray/50 px-2 py-1.5 text-right tabular-nums dark:border-warm-gray-dark/50">{formatNumber(d.startTotal)}</td>
                    <td className="border-b border-warm-gray/50 px-2 py-1.5 text-right tabular-nums dark:border-warm-gray-dark/50">{formatNumber(d.endTotal)}</td>
                    <td className="border-b border-warm-gray/50 px-2 py-1.5 text-right tabular-nums text-accent dark:border-warm-gray-dark/50">
                      +{formatNumber(Math.max(0, d.endTotal - d.startTotal))}
                    </td>
                    <td className="border-b border-warm-gray/50 px-2 py-1.5 text-right text-ink-muted dark:border-warm-gray-dark/50 dark:text-ink-muted-dark">
                      {formatDuration(d.seconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
