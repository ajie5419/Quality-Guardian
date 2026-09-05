---
name: qg-project
description: Quality Guardian 项目规则入口；在该仓库开发、调查、审查或维护规则时，按任务范围定位项目档案与领域文档。不用于与项目无关的问答。
whenToUse: 在 Quality Guardian 仓库及其独立 worktree 中处理项目任务时加载。
---

# Quality Guardian 项目入口

本文件是现有 .dsh 客户端的技能入口，不改变其注册方式；是否自动加载取决于当前客户端。未提供技能加载能力时，可直接读取仓库根 AGENTS.md。

以当前 worktree 根目录解析以下路径，不固定到原始重构目录：

1. 先读 docs/PROJECT_GUIDE.md 第 0 节，确定用户要求是只读、实现还是专项治理；需要项目状态时读取 PROJECT_STATE.md 的相关段落。
2. 改代码前读 CONSTRAINTS.md，通过 code_map.md 定位模块，读取该模块 ARCHITECTURE.md；其他材料按项目档案第 9 节选取。
3. 验证、模型分工、完成记录分别遵守项目档案第 7、8、10 节。只读任务不修改代码、日志、状态、知识库或外部系统。
4. 只有用户明确授权专项治理时才执行 docs/governance-charter.md 全流程；发现同类问题不自动授权全仓迁移。

本入口只维护路由。用户明确请求优先于技能工作流；技能不得扩大任务或外部操作权限。若规则导致真实阻塞，说明具体来源与缺少的条件。
