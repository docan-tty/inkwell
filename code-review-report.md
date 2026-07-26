# 墨池 novelWriter 风格重构 — 代码审查报告单

**审查日期：** 2026-07-24
**审查范围：** 工作区重构为 novelWriter 风格的全部未提交改动 — 25 个修改文件 + 30 个新文件，约 4500 行 diff
**审查方式：** 4 个并行审查 agent 覆盖五轴（正确性/可读性/架构/安全/性能）+ 4 个验证 agent 对关键发现实测复现
**验证基线：** `npm run build` ✓(tsc 严格模式通过)、`npm test` 145/145 ✓

---

## 审查结论

**判定：Request changes(请求修改)**

按 skill 批准标准——不是因为完美主义，而是存在 2 个会导致用户可见数据错乱/错误行为的功能性 bug，且验证 agent 已实测复现。架构本身扎实、类型边界清晰、核心链路（防抖落盘/原子写/关窗 flush/路径白名单）设计正确；修复下述必修项后即可合并。

---

## 一、Critical — 合并前必须修复

### C1.bang 标题(`#!` / `##!`)在标签解析层完全丢失

| 项目 | 内容 |
|------|------|
| **位置** | `src/lib/tags.ts:129` |
| **严重级别** | Critical |
| **验证状态** | CONFIRMED(验证 agent 实测复现) |

**失败场景：**
用户用「格式 → 未编号章节(##!)」后，该章在大纲视图整体消失、手稿构建时 `@pov` / `@synopsis` 静默失效。

**实测证据：**
输入 `<h2>!第三章</h2><p>@pov: Jane</p><p>%Synopsis: 概要</p><p>正文</p>` 时，`parseDocumentIndex` 返回 `headings: []`。

**根因：**
`extractHeadings`(tags.ts:107-108)剥离 `!` 前缀后 title 为 `"第三章"`,但 `htmlToLines` 生成的行仍含 `!`(行内容为 `"!第三章"`)。行扫描用纯文本等值匹配(`line === headingMeta[headingIdx + 1].title`,tags.ts:129)永远对不上，bang 标题无法被认领。连带 `manuscript.ts:191` 的 `idx.headings.find(...)` 找不到，导致 `includeSynopsis`/`includeKeywords` 对 bang 标题完全失效。

**修复方向：**
行扫描匹配时先剥离行首 `!` 再比对，或让 `htmlToLines` 与 `extractHeadings` 共享同一规范化逻辑。需补测试:bang 标题经 `parseDocumentIndex` 的完整用例。

---

### C2.Ctrl+O 同时绑定「打开作品」和「打开文档」

| 项目 | 内容 |
|------|------|
| **位置** | `src/lib/shortcuts.ts:26` 和 `src/lib/shortcuts.ts:35` |
| **严重级别** | Critical |
| **验证状态** | CONFIRMED |

**失败场景：**
`openProject` 和 `docOpen` 的默认键都是 `Ctrl+O`。Workspace 分发表(`Workspace.tsx:147-182`)循环首个命中即 `return`,`openProject` 排在 `docOpen` 之前——按 Ctrl+O 永远只执行「打开作品」,「打开文档」的默认快捷键是死绑定，设置界面还会显示冲突提示。

**修复方向：**
给 `docOpen` 换一个不冲突的默认键(novelWriter 原版打开文档用 Enter/双击,Ctrl+O 保留给打开作品即可),或删除 `docOpen` 的默认键。

---

## 二、Required — 功能性问题，强烈建议同批修复

### R1.场景编号/分隔符跨文档不重置

| 项目 | 内容 |
|------|------|
| **位置** | `src/lib/manuscript.ts:208-218` |
| **严重级别** | Required |
| **验证状态** | CONFIRMED(实测复现) |

**失败场景：**
无 h2(章标题)的纯场景文档跨多篇时，`ctx.sceneNum` 持续累加不清零：第二篇文档的首个场景渲染为"场景3"而非"场景1",且文档间会插入多余的静态分隔符(如 `* * *`)。

**实测证据：**
`fmtScene = "场景{Scene}"`,两篇纯场景文档(h3 开头)→ 第二篇首个场景输出"场景3"。根因:`ctx.sceneNum = 0` 只在遇到 h2 时执行(manuscript.ts:200),缺少 per-document 复位。

**修复方向：**
`buildBlocks` 的文档循环开头(manuscript.ts:182 的 `for (const { chapter, html } of docs)`)重置 `ctx.sceneNum = 0`。补测试：跨文档场景编号。

---

### R2.trash 后立即 emptyTrash 丢失未落盘输入

| 项目 | 内容 |
|------|------|
| **位置** | `src/store/index.ts:836-850`(trashChapter)→ `src/store/index.ts:824`(deleteChapter) |
| **严重级别** | Required(数据丢失) |
| **验证状态** | CONFIRMED(调用链追踪) |

**失败场景：**
1.5s 自动保存防抖窗口内打字 → 移入回收站 → 立即清空回收站：`deleteChapter` 直接 `pendingChapterContent.delete(chapterId)` + `clearDraft(chapterId)` + 删除磁盘文件。最后一两秒输入无任何持久层副本即被清除。确认对话框存在时用户操作完全可能快于防抖。

**修复方向：**
`trashChapter` 时先 flush 该章节的 pending 内容落盘(或 `deleteChapter` 删除前检查 pending map 并先落盘)。

---

### R3.右键菜单标注的标题快捷键与实际不符

| 项目 | 内容 |
|------|------|
| **位置** | `src/components/Editor.tsx:477`(菜单显示 `Ctrl+Alt+1`)vs `src/components/Editor.tsx:349`(实际绑定 `Ctrl+1`) |
| **严重级别** | Required |

**失败场景：**
右键菜单显示「标题 1 — Ctrl+Alt+1」,用户按 Ctrl+Alt+1 无反应；实际生效的是 Ctrl+1。两处标注必有一处错误。

**修复方向：**
统一为一处定义(建议提取快捷键映射常量，菜单显示与实际绑定共用)。

---

### R4.大纲表与章节树打字期间高频全量重渲染

| 项目 | 内容 |
|------|------|
| **位置** | `src/components/RightPanel.tsx:95`(`collectOutline` 无 `useMemo`)、`src/components/chapter-tree/ChapterTree.tsx:55-56`(无 memo) |
| **严重级别** | Required(性能) |
| **验证状态** | CONFIRMED(性能 agent 实测) |

**失败场景：**
字数统计每 200ms 产生新 chapters 数组 → 右侧大纲表全量重算 + 左侧整棵树(含每个 ChapterItem/DropTarget)重渲染。千章项目持续打字时可见掉帧。

**修复方向：**
`collectOutline` 加 `useMemo`(依赖 chapters/volumes/tagsIndex.docs);`ChapterItem` 加 `React.memo`;`ChapterTree` 按 parentId 拆分订阅而非订阅整个 chapters 数组。

---

## 三、Optional — 值得修复，不阻塞合并

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| O1 | F3 双重跳转 | `EditorSearchBar.tsx:158` + `Workspace.tsx:170` | 查找栏聚焦时 F3 被组件内 onKey 和分发表各处理一次，跳 2 个匹配 |
| O2 | 查找栏陈旧匹配 | `EditorSearchBar.tsx:79-95` | 打开查找栏后继续打字，matches 偏移漂移，替换会插错位置 |
| O3 | mergeChapters 不校验目标存在性 | `store/index.ts:718-737` | 传入不存在的 parentId 时合并文档悬空且源文档仍被 trash;当前 UI 入口正常但竞态/扩展调用有风险 |
| O4 | 手稿对话框每次勾选设置都全量重读章节 | `ManuscriptDialog.tsx:95-106` | `rebuild` 未防抖，千章项目点一次 checkbox = 全量磁盘重读 |
| O5 | tagsIndex 删除残留 | `store/index.ts:824-835` | deleteChapter 不清理 tagsIndex;已验证当前无用户可见影响(仅内存残留),Nit |
| O6 | 正文行与下一标题同文本时游标错位 | `tags.ts:129` | `<h2>第一章</h2><p>第二章</p><p>@pov: X</p><h2>第二章</h2>` 时 @pov 错挂到第二章;触发条件苛刻 |
| O7 | 死代码/小问题 | 多处 | `commands.ts` 的 `insert.nbsp` 等用不可见字面量空格(建议改 ` `);`orderInVolume` 字段无消费方;`manuscript.ts:210` 三元两边相同 |

---

## 四、安全审查结论

本地单机威胁模型下 **无 Critical 安全发现**:

- **XSS 回显:** `sanitizeHtml`(`export.ts:110-167`)白名单 + 属性级过滤实现可靠(协议校验、剥离控制字符防 `java\tscript:` 绕过),有单测覆盖;全仓库 `dangerouslySetInnerHTML` 仅 `DocViewer.tsx:47` 一处且已过 sanitize。
- **手稿预览:** iframe 带 `sandbox=""`(无 `allow-scripts`),正文段虽未消毒但预览内脚本不执行;仅"导出 HTML 后用真实浏览器打开手工污染的磁盘文件"才成立，属本地数据非可利用注入。
- **路径白名单:** Rust 侧所有 JS 路径经 `authorize_path` 校验(`..`/符号链接/未注册根均拒绝),builds/wordlist/backup 路径全部覆盖。
- **ReDoS:** EditorSearchBar 用户正则无防护(输入 `(a+)+` 会卡 UI),但属本地自伤型,Optional。

---

## 五、架构与可读性评价

**正面:**
- 命令层(commands.ts + editor-context.ts)设计清晰，菜单/快捷键/工具栏统一走 runCommand,enabled 守卫与内部逻辑一致性整体良好。
- 纯逻辑层(lib/)无 React 依赖，无循环依赖，tags→docs→types 单向。
- 旧数据兼容处理到位:`kind?`/`rootKey?`/`inactive?` 消费方全部对 undefined 有回落。
- 防抖落盘、原子写(tmp+rename)、关窗 flush、镜像迁移回退设计严密，相比 master 有明显加固。
- 测试质量好:manuscript/docops 测的是行为而非实现细节。

**改进建议:**
- `tags.ts` 的标题行对齐机制(纯文本等值匹配)是本次缺陷的集中点,bang 语义在写入(Editor)、解析(tags)、渲染(manuscript)三处各写一遍，建议提取共享常量/规范化函数。
- `editor-context.ts` 的模块级单例桥接当前安全(键集不相交),但未来双 Editor 实例会产生半悬空引用，建议重复注册时 warn。

---

## 六、修复优先级建议

```
必修(本批):   C1 bang 标题对齐  →  C2 Ctrl+O 解绑
强烈建议同批:  R1 场景编号重置  →  R2 trash 数据丢失窗口  →  R3 菜单快捷键标注
性能(可下批):  R4 useMemo/memo  →  O4 手稿对话框 rebuild 防抖
```

---

*审查完成。所有 Critical/Required 发现均经独立验证 agent 实测复现或调用链追踪确认。*
