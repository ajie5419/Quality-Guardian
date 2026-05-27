# 项目进度

## 当前状态

- 最新 commit: `0adadf7d` (docs: add new module checklist to CONSTRAINTS.md)
- 测试状态: 29 文件 / 153 测试全部通过
- Lint: 通过
- Typecheck: 0 error
- 模块文件数: 302
- 标签: `v0.1.0-clean-baseline`

## 已完成

- [x] 项目文档体系重建（AGENTS.md、CONSTRAINTS.md、CHANGELOG.md）
- [x] 后端精简重构 13 阶段全部完成
- [x] 目录结构规范化（api/ → modules/ → utils/ 三层）
- [x] 路由瘦身（269 个路由全部 ≤50 行，0 个 import prisma）
- [x] 模块逻辑优化（inspection 拆分、supplier 评分分离、薄模块合并）
- [x] 安全修复（SQL 注入、ID 生成、密码、execSync）
- [x] 跨模块解耦（dashboard/quality-loss/supplier/report 不再直接查其他表）
- [x] 性能优化（DB 分页、缓存、批量查询）
- [x] utils/ 归位（业务逻辑迁入 modules/，utils 仅剩基础设施）
- [x] CI 精简（16 job → 5 job）
- [x] 模块自治（module-loader + *.module.ts 声明）
- [x] 错误处理与中间件（BusinessError、认证中间件、数据权限中间件）
- [x] 数据库 schema 优化（索引、结构化存储、冗余列清理）
- [x] 前后端类型契约（@qgs/shared API 响应类型）
- [x] 根目录 + 后端脏数据清理
- [x] 偏离修复（文件超限、governance 残留、route-handlers 合并、prisma 脚本清理）

## 当前架构

```
apps/backend/
├── api/          # 路由薄层（≤50 行）
├── middleware/   # 认证、数据权限、日志
├── modules/      # 业务逻辑（25 个模块，302 个文件）
├── prisma/       # Schema + Migrations
├── routes/       # catch-all 404
└── utils/        # 基础设施（24 个文件）
```

## 待办

- [ ] 目录结构偏离修复（governance/、route-handlers/、modules/__tests__/ 待 Codex 执行）
- [ ] 需求：责任部门多选（不合格品 + 售后问题）

## 基线数据（用于异常检测）

- 模块文件数: 302
- utils 文件数: 24
- 测试数: 153
- 顶层目录: api/ middleware/ modules/ prisma/ routes/ utils/
