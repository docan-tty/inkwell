# InkWell 全量代码审查报告

**审查日期：** 2026-07-17
**范围：** 全部工程代码 —— `src/`（21 个组件、store、9 个 lib 模块、types）、`src-tauri/`（Rust 后端、capabilities、配置）、构建配置与全部测试文件
**方法：** 五轴审查（正确性 / 可读性 / 架构 / 安全 / 性能），双人并行审查 + 关键发现源码复核
**验证：** `tsc --noEmit` ✅ 通过；`vitest run` ⚠️ 无法在本审查环境执行（node_modules 原生绑定为 Windows 平台编译，非代码问题）——测试通过状态未经本次验证

## 结论（Verdict）

**Request changes（需修改后合并）** —— 存在 3 项 Critical（其中 2 项为数据丢失场景）与多项 Required。

代码整体质量较高：持久化采用"草稿缓冲 + pending map + 3 秒自动保存 + 定时快照 + 关闭落盘"的多层冗余设计，注释解释 *为什么* 而非 *是什么*，无任何 `dangerouslySetInnerHTML`，Tauri capabilities 与 CSP 收敛得当。问题集中在**各层之间的接缝处**：竞态窗口、防抖计时器与状态切换的交错，正是写作软件最不能出错的"丢稿"路径。

---

## Critical（阻断合并）

### C1. 非原子写入可能损坏项目文件 → 整部作品"消失"（体验级数据丢失）

`src-tauri/src/lib.rs:29-38`（`write_text_file` 使用 `std::fs::write` 原地截断写入），消费方：`src/lib/storage.ts:162-178`（`saveProjectToLocal`）、`src/store/index.ts:670-676`。

`std::fs::write` 非原子。写入中途崩溃/断电/磁盘满会留下截断的 `projects/{id}.json`。下次打开时 `loadProjectFromLocal`（storage.ts:155-159）走 `catch { return null; }`，`openProject` 将其视为新项目——**章节 .md 文件全部还在磁盘上，但用户看到的是一部空白小说，且应用内无任何恢复入口**。同理适用于 `registry.json`（解析失败返回 `[]`，隐藏所有项目）与章节 .md 文件本身。

**修复：** 写入改为"先写 `{path}.tmp` 再 `std::fs::rename`"（同卷重命名在三大桌面 OS 上均原子），rename 前可 `sync_all`。加载侧区分"文件不存在"与"文件损坏"：损坏时尝试 `.bak`/临时文件，至少向用户报错而不是静默展示空项目。

### C2. Tauri 文件系统命令完全未限定范围 → webview 内任意脚本可读写删全盘

`src-tauri/src/lib.rs:23-124`（`read_text_file` / `write_text_file` / `remove_file` / `list_files` / `copy_file` / `copy_dir_recursive` / `open_path`）均接受任意绝对路径，零校验；配合 `core:default`（capabilities/default.json:7）即可从窗口 JS 调用。CSP（`default-src 'self'`）挡得住远程 XSS，但挡不住 npm 供应链投毒（Tiptap、lucide-react 等同处一个 JS 领域）。一个被攻陷的依赖即可 `invoke("write_text_file", ...)` 写启动项或窃取任意文件。lib.rs:11-18 的注释解释了当初为何移除 scope，但纠正过度了。

此外 `open_path`（lib.rs:6-9）可对任意路径调用 `opener::open`——配合 `write_text_file` 即一键 RCE（写 .exe 再打开）。

**修复：** 在 Rust 侧按白名单根目录校验路径（`app_data_dir()` + 用户配置的 `projectSaveDirectory`，canonicalize 后拒绝 `..` 与逃逸符号链接）；导出文件单独走"由 save 对话框返回路径"的命令；`open_path` 限制为目录（`p.is_dir()`）。

### C3. 笔记/词典在 800ms 防抖窗口内切换或关闭项目 → 编辑静默丢失

`src/store/index.ts:700-718`（`scheduleNoteSave` / `scheduleDictSave`），交互方：`openProject`（318-352）、`closeProject`（353-368）。

计时器在**触发时**读取 `currentProject`/`notes`，但编辑发生在**调度时**。序列：编辑笔记 → 400ms 后切换项目 → `openProject` 用项目 B 的数据替换 `notes` → 计时器触发时项目 A 的编辑已无处写入（`if (!currentProject) return` 或写错对象）。**每次切换/关闭项目，最后 <800ms 的笔记与词典输入必丢**——章节内容有草稿缓冲兜底，笔记和词典没有任何兜底。

**修复：** 调度时捕获负载（`projectId` + 数据快照），或在 `openProject`/`closeProject` 替换状态前 `flushPendingMetaSaves()` 同步落盘旧项目的 notes/dict。

---

## Required（合并前必须处理）

### 正确性（数据安全相关，按杠杆排序）

**R1. 快照/草稿恢复后编辑器不刷新，且可能被旧内容再次覆盖。**
`src/components/RightPanel.tsx:179` 与 `src/App.tsx:131`：恢复后用 `setCurrentChapter({ ...currentChapter })` 试图"轻推"重载，但 Workspace 加载 effect 的依赖是 `[currentChapter?.id, ...]`——id 未变，effect 不触发。用户看到的仍是旧内容，而**下一次自动保存会把内存中的旧内容写回，抹掉刚恢复的快照**。这是本次审查中最接近"用户可操作触发的丢稿"的问题。
**修复：** store 增加 `contentVersion` 计数器，`restoreChapterContent` 时递增，并加入 Workspace 加载 effect 的依赖。

**R2. 章节加载失败 + 一次击键 = 跨章节内容串写。**
`src/components/Workspace.tsx:102-120`：`getChapterContent` 若 reject（文件损坏），无 catch、无错误提示——`currentChapter` 已切到 B，`localContent` 仍停留在 A 的内容，下一次自动保存将把 A 的文本写入 B 的文件。
**修复：** 加 `.catch` 报错并 `setCurrentChapter(null)`；并在 effect 开始时先将 `localContent` 置空（乐观清空），杜绝旧内容残留。

**R3. 全局 autosave 计时器在切章/关窗时不取消、不冲刷，旧内容可覆盖新内容。**
`src/store/index.ts:681-696`（`scheduleAutoSave`）与 `src/App.tsx:89-104`（关窗 flush）：单一全局 `autoSaveTimer` 按击键时捕获的 `chapterId`+`content` 延迟写入。关窗 flush 不取消该计时器——若 flush 后计时器才触发，将以较旧内容覆盖；`setCurrentChapter`（store:515-521）切章时只保存项目 JSON，不冲刷上一章的 pending 内容。
**修复：** `pendingChapterContent` 改为 `Map<id, {content, seq}>` 携带单调版本号，autosave 回调发现存储版本更新则放弃写入；`setCurrentChapter` 与关窗流程先冲刷/取消计时器。

**R4. `closeProject` 先清状态、依赖求值顺序运气完成最终保存。**
`src/store/index.ts:353-368`：`saveCurrentProject` 内部 `get()` 恰好在 `set` 清空前同步执行所以今天能工作；任何在函数顶部插入 `await` 的未来重构都会把最终保存变成静默空操作。且关闭时 pending 章节内容同样未冲刷（同 R3）。
**修复：** 显式化：`closeProject` 先捕获引用、`await flushPendingContent()` + `await saveProjectToLocal(...)`，再清状态。

**R5. `readFileOrFallback` 对任何 Tauri 读错误都回退 localStorage → 可能提供过期镜像并回写。**
`src/lib/storage.ts:86-93`：外置盘暂时拔掉 → 应用打开的是 localStorage 旧镜像；盘恢复后自动保存把旧内容写回，静默回滚章节。且"文件缺失"走镜像、"文件损坏"返回空，行为不一致。
**修复：** 仅在 NotFound 时回退，其他错误上浮；或 Tauri 模式下干脆去掉镜像（见 R14）。

**R6. 项目/章节 ID 直接进入文件路径，无格式校验。**
`src/lib/storage.ts:71-79`：ID 目前由 `generateId()` 生成所以安全，但 `registry.json` 本身是可被本地篡改的文件——`id: "../../x"` 即路径穿越（含删除任意 `{id}.json`）。成本极低的加固。
**修复：** 存储边界校验 `/^[a-z0-9-]+$/i`，或并入 C2 的 canonicalize 校验。

**R7. `handleManualSave` / 侧栏 resize 持有旧闭包值。**
`Workspace.tsx:241-254`：手动保存闭包捕获 `localContent`，而文件里已有 `localContentRef`——应改用 ref（上下文菜单等延迟触发路径会写入旧内容）。`Workspace.tsx:327-353`：拖拽结束时持久化的是**拖拽起点**的侧栏宽度（`handleUp` 闭包自 mousedown 渲染），重启后宽度"失忆"。
**修复：** 两处均改用 ref 镜像最新值。

**R8. ProjectList 字数统计一处失败全体消失。**
`ProjectList.tsx:42-58`：`Promise.all` 中任一项目文件损坏 → 全部卡片进度条静默消失。
**修复：** 每个项目的 load 各自 try/catch，失败置 0。

### 安全

**R9. 导出 HTML 的 URL 校验可被空白/实体绕过，文件在用户真实浏览器打开。**
`src/lib/export.ts:85-90`：`startsWith("javascript:")` 漏掉 `java\tscript:`、HTML 实体编码等浏览器会归一化的变体；导出文件脱离 CSP 在默认浏览器以 file:// 打开。
**修复：** 用 `new URL()` 解析并按 scheme 白名单（http/https/mailto）放行，检查前剥离空白与控制字符；`DANGEROUS_ATTRS` 更名 `BLOCKED_ATTRS` 并注明"向 ALLOWED_TAGS 加标签即重开 URL 属性面"的不变量。

**R10. 自动排版路径未过 sanitizeHtml（纵深防御缺口）。**
`Workspace.tsx:24-45`：`formatHtmlTextNodes` 以 `innerHTML` 重序列化后直推编辑器管线；快照恢复路径（RightPanel.tsx:177）做了 sanitize，此路径没有。内容今天来自 TipTap 应属惰性，但一旦非 TipTap 内容进入（导入功能、粘贴 bug）即成注入放大器。
**修复：** 推送前过一遍 `sanitizeHtml`，与恢复路径对齐。

### 性能

**R11. 全组件 `useAppStore()` 无选择器订阅 → 每次击键全树重渲染。**
Editor.tsx:38、Toolbar.tsx:70-83、Workspace.tsx:48-70、StatusBar.tsx:8、ProjectList、RightPanel、SearchPanel、ChapterTree、NotesView、DictionaryView、GlobalSettingsModal、App.tsx:23 全部裸订阅整个 store。每 200ms 的字数更新替换 `chapters` 数组引用 → 上述组件全部重渲染，ChapterTree 还在每次渲染中对每卷做 filter+sort（ChapterTree.tsx:88-89，O(V·C)）。300 章长篇时每次输入产生数百次无谓渲染。
**修复：** 全面改选择器（`useAppStore(s => s.theme)`），组合取值用 `useShallow`；优先 Editor/Toolbar/StatusBar/ChapterTree。ChapterTree 的按卷分组用 `useMemo` 建 `Map<volumeId, Chapter[]>`。

**R12. 笔记分隔条拖拽每帧 pointermove 都写 localStorage。**
`NotesView.tsx:96-110`：`onMove` 内直接 `updateAppSettings`（同步 JSON 序列化 + 存储写）。侧栏 resize 是 mouseup 才持久化的——应对齐。
**修复：** 拖拽中用本地 state 实时显示，`onUp` 时才 `updateAppSettings`。

**R13. 搜索面板打开时，打字触发全书重搜。**
`SearchPanel.tsx:64-122`：effect 依赖 `chapters` 数组引用，打字→字数更新→数组换新→重读全部章节文件重搜。防抖+token 防的是错误结果，防不了无谓 I/O。
**修复：** 依赖改为稳定结构签名（章节 id+title 的 memo 化字符串）。

**R14. localStorage 镜像写无 try/catch，配额满会误报保存失败。**
`src/lib/storage.ts:195`：磁盘写成功后镜像写抛 `QuotaExceededError` 会冒泡成"保存失败"——数据其实安全。`saveDraft` 反而有 try/catch，不一致。
**修复：** 镜像写包 try/catch（同 `writeMeta`），或按 R5 去掉镜像。

### 架构

**R15. `Workspace.tsx`（520 行）职责过载；`formatHtmlTextNodes` 是无法脱离 React 测试的纯函数。**
文件同时承载：章节加载、草稿恢复 UI、自动保存管线、写作计时、全局快捷键、自动排版（DOM 操作）、专注模式 chrome、侧栏 resize。
**修复：** `formatHtmlTextNodes` 抽到 `src/lib/format.ts` 并配单测；写作计时与顶栏自动隐藏抽成 hooks。

**R16. 测试完全不覆盖 Tauri 持久化分支——真正写用户小说的路径零测试。**
happy-dom 下 `isTauri()` 恒 false，`storage.test.ts` 全部走 localStorage 回退。`snapshots.ts`（剪枝、`parseTimestamp`、删除容错）完全无测试；store 的 autosave/草稿/pending 生命周期（C3/R3/R4 场景）无测试。
**修复：** `vi.mock` `@tauri-apps/api/core` 并按测试设置 `window.__TAURI_INTERNALS__` 跑双分支；补快照剪枝测试；用 fake timers 固化 C3 回归。

---

## Optional / Nit（择要）

- `src/lib/export.ts:301-306`：`?? -1` 使无卷章节排在第一卷之前导出，与树 UI 顺序不一致（用 `Number.MAX_SAFE_INTEGER` 或与树比较器对齐）。
- `src/store/index.ts:530`：`moveChapter` 只钳上界，负 `targetIndex` 触发 splice 倒数语义；`moveVolume` 两端都钳——对齐。
- `src/lib/storage.ts:18-29`：`tauriPath` 动态导入缓存与第 3 行静态导入重复，`getPath()` 可删。
- `src/lib/snapshots.ts:14-16`：`buildFsPath` 是对 `join` 的无增益包装，可删（死代码清理候选）。
- `ProjectList.tsx:2`：两条 import 挤在一行。
- `Editor.tsx:253-284`：专注/全屏两分支重复 `<Toolbar>` 调用，可提取常量。`Editor.tsx:75`：`setContent(content)` 未传 `{ emitUpdate: false }`，非规范 HTML 首载会触发幻影"修改"→多余草稿+autosave。
- `Editor.tsx:176`、`GlobalSettingsModal.tsx:57`：`navigator.platform` 已废弃，建议集中一个 `modKey()` helper。
- `StatusBar.tsx:118`：`formatDateTime(...).slice(11)` 取时间脆弱，应有独立 `formatTime`。
- `ProjectEditDialog` / `GlobalSettingsModal` 无 Escape 关闭（其他弹窗都有），不一致。
- `Toolbar.tsx:171` 等 tooltip 宣称的快捷键在可编辑区域不生效，提示过度承诺。
- `stats.ts` 的 `inkwell-stats-*` 键在项目删除时不清理——无界泄漏（体积微不足道，Nit）。
- `App.tsx:29-45`：全局右键抑制只豁免 `input, textarea`，未来出现 `[contenteditable]` 表面会被静默打断（把豁免加上）。
- 文件规模提醒：`store/index.ts`（718）、`NotesView.tsx`（593）、`ProjectList.tsx`（570）、`GlobalSettingsModal.tsx`（569）已接近 1000 行警戒线——后续加功能前先分解（ProjectCard/ProjectRow 的进度条块近乎逐字重复，可先抽 `ProgressBar`）。

---

## 做得好的地方

- **内容防丢的设计意图是一流的**：逐键草稿 + pending map + 3 秒 autosave + 5 分钟快照（20 个剪枝上限）+ 关窗落盘；缺口都在接缝，不在设计。
- 快照失败回滚时间戳以便下次重试（store:497-501）；`findRecoverableDrafts` 对读不到的磁盘文件偏向"可恢复"而非丢弃最后副本（draft.ts:104-111）——正确的偏向。
- 章节正文与项目元数据分离存储，元数据操作不重写小说全文。
- 竞态守卫覆盖到位：async effect 的 `cancelled` 标志、search token、`editor.isDestroyed` 检查、拖拽深度计数。
- 安全姿态：零 `dangerouslySetInnerHTML`；CSP 无 `unsafe-eval`；`dragDropEnabled: false` 阻断 webview 拖拽劫持导航；capabilities 最小化；导出时标题/作者统一 `escapeHtml`。
- 主题系统纯函数化（`computeThemeVars` 无 DOM 依赖）且有测试；现有测试行为驱动、命名达意。

## 测试充分性评估

现有测试质量不差（draft 恢复分支、排序不变量、标点边界都有覆盖），但存在结构性盲区：**Tauri 分支零覆盖**（R16）、**snapshots 零测试**、**store 保存生命周期零测试**——恰好是 C1/C3/R3/R4 的所在层。修复上述 Critical/Required 时应一并补回归测试，尤其 C3 可用 fake timers 精确复现。

## 验证记录（本次审查执行）

| 项目 | 结果 |
|---|---|
| `tsc --noEmit` | ✅ 通过，零错误 |
| `vitest run` | ⚠️ 未能执行：node_modules 的 rollup/swc 原生绑定为 Windows 平台编译，审查沙箱（Linux）无法加载。非代码缺陷；请在 Windows 本机跑一次 `npm test` 确认 |
| 关键发现源码复核 | ✅ C1/C2/C3/R1/R2/R9 均逐行核对源码确认 |

## 修复优先级（只做五件事的话）

1. **C2** — Rust 侧给文件命令加根目录白名单、`open_path` 限目录。
2. **C1** — 写入改 temp+rename 原子化；加载区分缺失/损坏。
3. **C3 + R3/R4** — 统一修"防抖计时器 vs 状态切换"族：调度时捕获负载、切换/关闭前冲刷、关闭前落盘再清状态。
4. **R1 + R2** — 恢复后刷新编辑器（contentVersion）、章节加载失败的错误面与清空保护。这两条是用户正常操作即可踩到的丢稿路径。
5. **R11/R12/R13** — 打字卡顿三件套：store 选择器、分隔条 mouseup 持久化、搜索依赖结构签名。
