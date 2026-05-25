# 项目进度

## 当前状态

- 最新 commit: `6ca9807` (chore: ignore master-data governance tmp reports in prettier)
- 测试状态: 38 文件 / 225 测试全部通过
- Lint: 通过

## 已完成

- [x] 后端模块化迁移（25 个模块迁入 modules/）
- [x] 主数据治理内核（core/master-data/）
- [x] processName (Wave 0) 全链路 canonical 化
- [x] 项目文档体系重建（AGENTS.md、CONSTRAINTS.md、模块 ARCHITECTURE.md）

## 进行中

- [ ] 后端精简重构（目录规范化、去除过度工程）
  - 删除 services/ 兼容壳（31 文件，影响 158 个 API 文件 import）
  - 删除 core/module-registry 抽象层
  - utils/ 业务逻辑归位到 modules/
  - 治理脚本清理（backend/scripts/ + root scripts/）
  - package.json check 链路精简

## 已知问题

- `check:master-data-release-gate` 的 template 阶段需要连库（127.0.0.1:3306），本地 DB 不通时该步骤失败
- services/ 兼容壳仍被 158 个 API 文件引用，删除前需批量替换 import

## 下一步

1. 执行精简方案第 1 步：删除 core/module-registry + definition 文件
2. 执行第 2 步：批量替换 services/ import → modules/，删除 services/
3. 执行第 3 步：utils/ 业务逻辑迁入对应 modules/
4. 清理 scripts/ 和 package.json
