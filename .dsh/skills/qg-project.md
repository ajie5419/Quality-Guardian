---
name: qg-project
description: Quality Guardian QMS 项目技能入口：指向项目档案（docs/PROJECT_GUIDE.md）与状态日报（PROJECT_STATE.md）。加载后掌握"去哪里读什么"，按档案规范在该仓库内开发/重构/调试/测试/提交。
whenToUse: 在 Quality Guardian 仓库（/Users/zhaoxiaojie/代码/Quality-Guardian）内进行任何编码、重构、调试、测试、审查或提交工作时加载。
---

# Quality Guardian 项目技能

本技能是项目知识的**入口**，不是副本。规范正文由 `docs/PROJECT_GUIDE.md` 单一维护，状态由 `PROJECT_STATE.md` 记录，本技能只负责告诉 AI 去哪里读什么。

## 开工必读（按此顺序）

1. **`docs/PROJECT_GUIDE.md`** — 项目档案（规范唯一权威）：
   - 项目概览、技术栈、三层架构（api/modules/utils）
   - **能做什么 / 应该怎么做**（新增模块、新增端点、改数据库、写测试的标准流程）
   - **不能做什么**（13 条红线）
   - 常用命令与提交门禁、文档地图
2. **`PROJECT_STATE.md`** — 状态日报：当前版本、进度、最近变更、待办（硬数据段由 `pnpm run docs:sync` 自动生成）
3. 改模块前：读该模块 `apps/backend/modules/<name>/ARCHITECTURE.md`（如存在）
4. 定位模块归属：`code_map.md`

## 防漂移规则（重要）

- 本技能、`AGENTS.md`、`CLAUDE.md` **不维护规范正文副本**，只做索引；与 `docs/PROJECT_GUIDE.md` 冲突时以档案为准，并同步修正。
- 硬数据（版本/模块数/文件数）必须由脚本生成，禁止手写：`pnpm run docs:sync`
- 提交前跑 `pnpm run check:docs-drift`，漂移即拦截。

## 知识库四层载体分工

项目知识按执行性分四层存放（完整规范见 `docs/PROJECT_GUIDE.md` 第 11 节）：

| 层  | 载体                                    | 执行机制 | 放什么        |
| --- | --------------------------------------- | -------- | ------------- |
| 1   | `docs/*.md`                             | 被动阅读 | 规范正文      |
| 2   | `AGENTS.md` / `CLAUDE.md`               | 自动注入 | 短路由指令    |
| 3   | Skill（本技能）                         | 按需加载 | 工作流 + 索引 |
| 4   | 门禁脚本（check:qms-arch / docs-drift） | 机器强制 | 硬红线        |

**新规则落地顺序**：先成文 docs → 同步进 AGENTS/Skill 索引 → 可程序化判断的进层门禁。禁止同一条规则在多层重复维护正文。

## 完成工作后

1. 更新 `PROJECT_STATE.md`（当前进度 / 最近变更插入顶部 / 待办勾选）
2. 追加 `CHANGELOG.md` 执行记录
3. 涉及模块/路由/视图目录变化时更新 `code_map.md`
4. 跑门禁：`pnpm lint && pnpm run check:type && pnpm run check:qms-arch && pnpm run check:docs-drift`
