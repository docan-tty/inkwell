// Daily writing statistics, persisted in localStorage.
//
// Two kinds of data:
//  - a daily snapshot of the project's TOTAL word count at first load of the
//    day. "今日新增" = current total - snapshot (floored at 0, so deleting
//    text never shows a negative gain);
//  - accumulated active writing time in seconds, incremented by the editor
//    while the user is actually typing (idle pauses don't count).
//
// Keys are namespaced per project so stats from different works don't mix.

const snapshotKey = (projectId: string) => `inkwell-stats-snapshot:${projectId}`;
const secondsKey = (projectId: string) => `inkwell-stats-seconds:${projectId}`;

export function todayKey(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort — stats are advisory, never break the editor over them
  }
}

/**
 * Returns today's gained word count for the project. The first call of each
 * day pins the opening snapshot; deleting text below the snapshot yields 0.
 */
export function getTodayGained(projectId: string, currentTotal: number): number {
  const key = snapshotKey(projectId);
  const today = todayKey();
  const snap = readJSON<{ date: string; total: number }>(key);
  if (!snap || snap.date !== today) {
    writeJSON(key, { date: today, total: currentTotal });
    return 0;
  }
  return Math.max(0, currentTotal - snap.total);
}

/** Accumulated active-writing seconds for the project today. */
export function getTodayWritingSeconds(projectId: string): number {
  const rec = readJSON<{ date: string; seconds: number }>(secondsKey(projectId));
  return rec && rec.date === todayKey() ? rec.seconds : 0;
}

/** Add `delta` seconds of active writing time to today's counter. */
export function addWritingSeconds(projectId: string, delta: number): number {
  const key = secondsKey(projectId);
  const today = todayKey();
  const rec = readJSON<{ date: string; seconds: number }>(key);
  const seconds = (rec && rec.date === today ? rec.seconds : 0) + delta;
  writeJSON(key, { date: today, seconds });
  return seconds;
}

// --- 按日历史(写作统计对话框用) ---
// 在现有「当日快照/秒数」键之外,维护一个按日聚合的历史:每天最后一次
// 调用时写入当日的 起始总字数/当前总字数/写作秒数。历史随快照键自然滚动,
// 只保留最近 400 天。

const historyKey = (projectId: string) => `inkwell-stats-history:${projectId}`;

export interface DayStat {
  date: string;
  /** 当日开卷总字数(日初快照)。 */
  startTotal: number;
  /** 当日最后记录的总字数。 */
  endTotal: number;
  /** 当日有效写作秒数。 */
  seconds: number;
}

function readHistory(projectId: string): DayStat[] {
  return readJSON<DayStat[]>(historyKey(projectId)) ?? [];
}

/** 记录当日进度(每次字数/秒数更新时调用,幂等)。 */
export function recordDailyProgress(projectId: string, currentTotal: number): void {
  const today = todayKey();
  const history = readHistory(projectId);
  const startSnap = readJSON<{ date: string; total: number }>(snapshotKey(projectId));
  const startTotal = startSnap && startSnap.date === today ? startSnap.total : currentTotal;
  const seconds = getTodayWritingSeconds(projectId);
  const idx = history.findIndex((d) => d.date === today);
  const entry: DayStat = { date: today, startTotal, endTotal: currentTotal, seconds };
  if (idx >= 0) history[idx] = entry;
  else history.push(entry);
  // 只保留最近 400 天。
  while (history.length > 400) history.shift();
  writeJSON(historyKey(projectId), history);
}

/** 读取按日历史(升序)。 */
export function getWritingHistory(projectId: string): DayStat[] {
  return readHistory(projectId).sort((a, b) => a.date.localeCompare(b.date));
}

/** Drops a project's stats keys — called when the project is deleted so the
 *  namespaced keys don't leak forever. */
export function clearProjectStats(projectId: string): void {
  try {
    localStorage.removeItem(snapshotKey(projectId));
    localStorage.removeItem(secondsKey(projectId));
    localStorage.removeItem(historyKey(projectId));
  } catch {
    // best-effort
  }
}

/** Formats a duration in seconds as e.g. "8 分钟" / "1 小时 23 分钟". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小时 ${minutes % 60} 分钟`;
}
