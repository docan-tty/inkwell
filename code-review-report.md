# InkWell 全量代码审查报告（第二轮）

**审查日期：** 2026-07-19
**范围：** 全部工程代码 —— `src/`（全部组件、store、13 个 lib 模块、hooks、types）、`src-tauri/`（Rust 后端、capabilities、配置）、构建配置与全部测试。覆盖两个新提交（词典分组/右键子菜单/自动整理格式/书封作品库；每作品独立文件夹存储/全书搜索替换/界面分区）及全部未提交工作区改动。
**方法：** 五轴审查（正确性 / 可读性 / 架构 / 安全 / 性能），双人并行全量重读 + 上轮全部 Critical/Required 修复项逐条核验 + 本轮关键发现源码复核
**验证：** `tsc --noEmit` ✅ 零错误；`vitest run` ⚠️ 本审查沙箱无法执行（node_modules 原生绑定为 Windows 平台编译，非代码问题）——测试改为逐行审读，请在 Windows 本机运行 `npm test` 确认

## 结论（Verdict）

**Request changes（需修改后合并）** —— 1 项 Critical + 若干 Required，均集中在本轮新增代码（导出白名单冲突、搜索替换引擎、项目重命名竞态）。

上轮审查指出的丢稿族问题（计时器 vs 状态切换）得到了**系统性**修复：序号化 pending map、切换/关闭/关窗前统一冲刷、恢复后 contentVersion 刷新，且都配了能回归的测试。Rust 侧 tmp+rename 原子写、路径白名单、canonicalize 校验均已落地。本轮的问题主要是新功能与这些新机制之间的摩擦。

---

## 一、上轮发现复核

| 上轮 ID | 结论 | 说明 |
|---|---|---|
| C1 非原子写损坏项目文件 | ✅ 已修复 | `lib.rs:150-175` tmp+rename+sync_all；加载侧区分损坏/缺失，损坏时报错并提示 `.tmp`（storage.ts:459-462） |
| C2 FS 命令路径无限制 | ⚠️ 部分修复 | 白名单+canonicalize 已落地（lib.rs:72-104），但与导出功能冲突 → 见本轮 NC1 |
| C3 笔记/词典防抖丢失 | ✅ 已修复 | 调度时捕获负载（store:873-892），openProject/closeProject/关窗前 `flushPendingMetaSaves`，有测试 |
| R1 恢复后编辑器不刷新 | ✅ 已修复 | `contentVersion` 计数器（store:685-705），Workspace 加载 effect 依赖之；恢复时清 pending 与草稿 |
| R2 章节加载失败串写 | ✅ 已修复 | 加载前清空 + 错误面板阻止编辑（Workspace.tsx:86-112, 440-449），修复质量堪称样板 |
| R3 autosave 计时器竞态 | ✅ 已修复 | 序号守卫 + 切章/关项目/关窗取消并冲刷，有测试（index.test.ts:48-58） |
| R4 closeProject 求值顺序运气 | ✅ 已修复 | 先捕获引用、try 内冲刷、finally 清状态（store:440-469） |
| R5 任何读错误都回退镜像 | ⚠️ 部分修复 | 章节读已严格（仅 NotFound 回退）；**registry 读仍是 any-error 回退** → NC6 |
| R6 ID 未校验进路径 | ✅ 已修复 | `assertSafeId` 全边界校验（storage.ts:26-30 等），有测试。残留 Nit：作品名进文件夹名未过滤 Windows 保留名（CON/PRN/NUL 等） |
| R7 旧闭包保存/侧栏宽度 | ✅ 已修复 | `localContentRef`、`sidebarWidthRef` 均已采用 |
| R8 字数统计一处失败全灭 | ✅ 已修复 | 逐项目 try/catch（ProjectList.tsx:50-59） |
| R9 导出 URL 校验可绕过 | ✅ 已修复 | `isSafeUrl` 剥离空白控制字符 + `new URL` scheme 白名单（export.ts:98-108） |
| R10 自动排版未 sanitize | ✅ 已修复 | `sanitizeHtml(formatHtmlTextNodes(...))`（Workspace.tsx:199），且已抽为可测纯函数 |
| R11 全 store 裸订阅 | ⚠️ 部分修复 | ChapterTree 已改选择器；**编辑器周边组件仍是裸订阅** → NC7 |
| R12 笔记分隔条逐帧写存储 | ⚠️ 部分修复 | 仍在每 pointermove 持久化（NotesView.tsx:104-108），现为轻量写但应与侧栏对齐到 pointerup |
| R13 搜索随打字全书重搜 | ✅ 已修复 | 结构签名 `structureSig`（SearchPanel.tsx:65-71） |
| R14 镜像写无 try/catch | ✅ 已修复 | `writeMirror`/`readMirror` 全包裹。残留 Nit：`persistAppSettings`（store:264-266）仍无保护 |
| R15 Workspace 职责过载 | ⚠️ 部分修复 | format 已抽 lib；Workspace 仍 518 行（可接受，非阻断） |
| R16 Tauri 分支零测试 | ✅ 已修复 | mock FS bridge 双分支测试、snapshots 测试、store 生命周期测试均已补齐 |

**16 项中：12 项修复、4 项部分修复，0 项回退。**

---

## 二、本轮新发现

### Critical（阻断合并）

**NC1. 导出到用户自选位置被路径白名单拒绝 → 导出功能在 Tauri 下不可用。**
`src/lib/export.ts:183` 由 save 对话框返回任意路径（桌面/文档/D:\），经 `storage.ts:701-707` 的 `invoke("write_text_file")` 进入 `authorize_path`（lib.rs:72-104）——对话框路径几乎必然不在 app-data 或已注册内容根内，写入被拒，用户看到"导出失败"。
**修复（任选其一）：** Rust 侧新增 `pick_save_path` 命令包装对话框并将返回路径登记为一次性授权；或导出改用 tauri-plugin-fs（对话框确认的路径在其授权模型内）；不建议"把选中文件的父目录注册为内容根"（会永久性扩大写权限面）。

### Required（合并前必须处理）

**NC2. 项目重命名竞态可把作品拆到两个文件夹、章节"变空"。**
`store/index.ts:365-372`：重命名时 `renameProjectFolder` 触发即弃（`.catch(() => {})`），随后 `saveCurrentProject` 立即向**新**文件夹写 project.json——若 `move_path` 失败或在途，`write_text_file` 自动创建新目录，而全部章节 .md 和快照仍在旧文件夹。更糟的是 `renameProjectFolder` 在移动前就 `projectNameMap.set(projectId, newName)`（storage.ts:265），后续章节读按新文件夹解析→未命中→回退旧平铺路径，旧文件夹反而对应用"不可读"。
**修复：** `projectNameMap` 仅在 `move_path` 成功后更新；失败时回滚注册表名称；`updateProject` 必须 await 并上 surface 失败，不得 `.catch(() => {})`。

**NC3. 替换内容包含查询串时 replace-all 死循环，渲染进程挂死。**
`src/lib/replace.ts:121-161`：`replaceAllInHtml` 每轮从文本开头重新找第一个可替换匹配。替换 "他" → "他们" 时，下一轮在刚插入的 "他们" 中再次命中 "他"——无限增长、永不返回，整个 webview 卡死。全书替换（SearchPanel.tsx:225-232 顺序循环）会放大此问题。另有性能面：每次替换重解析整章 DOM，百处匹配即百次全量解析。
**修复：** 改为单遍扫描 + 游标推进：替换后从 `hit.index + replacement.length` 继续匹配，跳过落在已插入替换文本内的命中；单遍同时解决 O(n²) 解析。

**NC4. 单条替换的序号按过期搜索结果计算，可能替换到错误的匹配。**
`src/components/SearchPanel.tsx:191-215`：`ordinalInChapter` 来自上次搜索的结果列表，而 `replaceInChapter` 在**当前磁盘内容**上重新计数。搜索后若用户在编辑器里增删了同章匹配，序号指向另一处——用户替换了与摘要所示不同的匹配，且无任何提示（"成功"）。
**修复：** 在 `SearchResult` 中携带纯文本偏移，`replaceInChapter` 接受 `{type:"at", offset}` 并校验该处文本等于 query；或替换前对该章即时重搜一次再定序号。

**NC5. 迁移 `moveFile` 复制-删除无回滚；惰性迁移与保存竞态可让旧字节覆盖新 project.json。**
`storage.ts:243-252`（read→写新→删旧，删旧仅 best-effort）；`readProjectFileRaw`（404-410）的惰性迁移**非 await 触发**后即返回解析结果，store 随即向新文件夹执行保存写——若迁移写与 `saveProjectToLocal` 对同一路径竞速，较旧的迁移字节可覆盖较新的 project.json（章节列表回退）。
**修复：** 迁移改用 rename（`move_path` 已存在）而非复制+删除；`readProjectFileRaw` await 迁移完成再返回。

**NC6. registry 读仍是 any-error 回退镜像 → 可将作品库静默回滚。**
`storage.ts:336`：`.catch(() => localStorageFallback())`。registry.json 被锁/权限错误时，应用展示镜像中的旧项目列表；此后任何建/删项目都会 `setLocalProjectRegistry` 把这份过期列表**原子覆盖**真实 registry——仅存于真实 registry 的项目从库里消失（文件夹还在磁盘上但无从发现）。上轮 R5 的残留。
**修复：** 与章节读对齐——仅 NotFound 回退，其他错误上浮（损坏解析已正确 throw，见 341 行）。

**NC7. 编辑器周边组件仍裸订阅整个 store → 打字时每秒约 5 次全工作区重渲染。**
ChapterTree 已改选择器，但 Workspace.tsx:23-46、Editor.tsx:40、Toolbar.tsx:70-83、StatusBar.tsx:8-18、RightPanel、ProjectList、GlobalSettingsModal、NotesView 仍解构 `useAppStore()`。打字每 200ms 触发 `updateChapterWordCount` 换新 `chapters` 数组 → 上述全部重渲染（含 518 行的 Workspace 与 `useEditor` 配置重建）。上轮 R11 的核心残留。
**修复：** 全面改选择器；`currentChapter` 身份随字数更新变化，只需要 id/title 的消费方应选更窄（`s.currentChapter?.id`）。

**NC8. 快捷键录制中按 Esc 会连带关闭整个设置弹窗。**
`GlobalSettingsModal.tsx:97-132`（录制监听）与 `:68-78`（关闭监听）同在 window capture 阶段注册；`stopPropagation` 不能阻止同一节点的其他监听器，按 Esc 取消录制时关闭处理器也会执行——整个设置弹窗被关掉。
**修复：** 关闭处理器在 `capturing` 为真时直接返回（把 `capturing` 加入依赖），或合并为单一 Esc 处理器按优先级分发。

**NC9. 搜索跳转/大纲点击绕过 `handleSelectChapter` 的细致保存路径。**
`SearchPanel.tsx:179-185`、`RightPanel.tsx:104` 直接调 store 的 `setCurrentChapter`：内容本身有 pending 冲刷兜底（安全），但跳前不基于最终内存内容重算上一章字数（project.json 中字数可过期），且冲刷失败被 `.catch(() => {})` 吞掉——`handleSelectChapter` 的"旧章节未写入"告警被绕过。
**修复：** 向 SearchPanel/RightPanel 传 `onSelectChapter` 走 `Workspace.handleSelectChapter`，或把字数重算+错误上浮下沉到 store。

**NC10. 双击连续打开两个项目可交错：后打开的解析先到会被先打开的覆盖。**
`ProjectList.tsx:506` 列表行 `onClick` 无 `opening` 守卫（网格卡片有）；两次 `openProject` 的异步加载交错时，A 的章节/笔记可覆盖 B 的状态。
**修复：** store 内加 openProject 序号令牌，过期解析直接丢弃。

### 安全（Required 级）

**NC11. 内容根标记文件位置与注释不符，且根只增不减。**
`lib.rs:21-66`：标记文件写在 `dirs_next::data_dir()/inkwell`，与 Tauri `app_data_dir()`（`%APPDATA%/com.inkwell.app`）是两个目录，JS 侧注释声称在 app data dir——实际不在。另外用户改存储位置后旧根**永久保留授权**，写权限面只增不减。
**修复：** 标记文件改用 `app.path().app_data_dir()`；设置变更时撤销旧根；在注释中声明"本地攻击者改标记文件即获任意写"这一可接受风险。

### Nit / Optional（择要）

- `store/index.ts:530-542`：默认目标字数改动会把"恰好等于旧默认值"的章节视为跟随默认而改目标——用户显式输入同数的章节被静默改，行为意外（记录即可）。
- `storage.ts:159-179`：孤儿宽限表只增不删（60s 有效性在读时判断但死条目累积），读时顺手清理。
- `EditableLabel.tsx:39-52`：blur 时无论是否修改都 onSave → 全量 project.json 写；Enter→blur 双写。加 `text.trim() !== value` 判断。
- `NotesView.tsx:264-270`：拖入悬停的 `onDragLeave` 在子元素边界反复触发，600ms 自动展开计时器被反复重置（VolumeItem 的 dragDepth 计数器模式可复用）。
- `NotesView.tsx:69-94`：打字时 updatedAt 每键更新使当前笔记在分组内每键跳到顶部，与注释声称的行为相反。
- `Editor.tsx:156-171`：Ctrl+滚轮缩放每个 tick 都 `updateAppSettings`（同步 localStorage 全量写），应防抖或滚轮结束提交。
- `ProjectList.tsx:112-116`：700ms 打开动画定时器未在卸载时清除，且与 CSS `0.72s` 是两个魔法数字，应共享常量。
- `App.tsx:76-91`：启动恢复扫描先于项目加载（owner map 为空），草稿对比走旧平铺路径——多数自愈但顺序脆弱，建议先注册 owner 再扫描。
- `lib.rs:82`：`canonical_roots` 在 canonicalize 失败时回退到未规范化根——建议去掉 `or_else` 失败即拒（fail closed）。
- 三处重复的"卷序+章序"排序（SearchPanel:109-115、RightPanel:87-94、export.ts）应抽一个 `sortChaptersByTreeOrder` 到 lib。
- `RightPanel.tsx:12` 与 store 的 `rightSidebarOpen`/`rightPanelTab` 双字段表达一个概念，建议派生。
- `snapshots.ts:118`：同毫秒两次快照同名互相覆盖（5 分钟策略下无害，FYI）。
- **文件规模**：`GlobalSettingsModal.tsx` 787 行（快捷键录制状态机、存储迁移可各抽一节）、`NotesView.tsx` 663 行（NoteRow/FolderPicker 可拆）、`storage.ts` 796 行、`store/index.ts` 892 行——四文件均逼近 1000 行警戒线，后续加功能前先分解。
- **架构观察**：`atomic.ts` bridge 与 storage.ts 直调 `invoke("write_text_file")`（导出）并存两套 FS 栈，bridge 应成为唯一栈；`projectNameMap` 在删项目时不清理（session 级残留）。

### 复核后撤回/降级的发现

- ~~atomic.ts 生产环境 FS bridge 未安装（疑全部 Tauri 写入走 localStorage 假 FS）~~：**撤回**。核实调用方后，`atomicWriteTextFile`/`bridgeReadTextFile` 仅在 `isTauri()` 为 false 的浏览器回退路径使用，Tauri 路径全部直调 `invoke`。设计确易误读（建议给 bridge 改名或加注释明确其仅服务测试与浏览器模式），但无功能缺陷。

---

## 三、做得好的地方

- 上轮丢稿族修复是**系统性**的而非打补丁：序号化 pending map、切换/关闭/关窗前统一冲刷、恢复后 contentVersion，且每条都带能在旧代码上失败的回归测试。
- 损坏 vs 缺失的区分 + `.tmp` 恢复提示用可操作的中文错误信息（指明文件夹、警告勿删除）——对写作软件完全正确的取舍。
- Rust 后端：原子写、`remove_project_dir` 以 project.json 标记防误删、`move_path` 拒绝已存在目标、canonicalize 白名单——纵深防御考虑周到。
- 替换引擎对跨标签匹配的保守跳过语义设计正确（问题只在 NC3 的循环推进方式）。
- R2 的修复（加载前清空 + 阻止编辑的错误面板）优于一个裸 catch，堪称样板。
- 书封打开动画的 reduced-motion 降级、`pointer-events-none` 遮罩、防重复点击守卫——细节打磨到位。
- `shortcuts.ts` 归一化干净（mac Ctrl/Meta 统一、修饰键顺序规范化、录制时冲突剔除）。
- 注释持续解释"为什么"——seq 守卫、捕获时机、宽限窗、镜像角色、replace/export 的 BLOCK_TAGS 对齐要求，均写在约束点上。

## 四、验证记录

| 项目 | 结果 |
|---|---|
| `tsc --noEmit` | ✅ 零错误 |
| `vitest run` | ⚠️ 沙箱无法执行（Windows 原生绑定）；测试改为逐行审读，质量良好（fake timers 竞态测试、mock FS bridge、旧布局迁移 fixture），请本机运行确认 |
| 关键发现源码复核 | ✅ NC1/NC3/NC4/NC5/NC8 及撤回项均逐行核对确认 |

## 五、修复优先级（只做五件事的话）

1. **NC1** — 导出与路径白名单冲突：导出在 Tauri 下不可用，属功能阻断。
2. **NC3** — 替换内容含查询串时 replace-all 死循环挂死渲染进程：单行游标推进即可修。
3. **NC2 + NC5** — 重命名/迁移竞态把作品拆到两个文件夹：`projectNameMap` 成功后再更新、迁移改 rename 并 await。
4. **NC4** — 单条替换序号漂移会改错地方且无声：换偏移定位+校验。
5. **NC7** — 编辑器周边组件补选择器订阅，消除打字期全工作区重渲染。
