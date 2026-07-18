/** 当前平台的修饰键标签：Mac 用 ⌘，其余 Ctrl。
 *  （navigator.platform 已废弃，优先 userAgentData。） */
export function modKey(): string {
  const uaData = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  const platform = uaData?.platform ?? navigator.platform ?? "";
  return /mac/i.test(platform) ? "⌘" : "Ctrl";
}
