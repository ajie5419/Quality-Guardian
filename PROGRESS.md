# 项目进度

## 当前状态

- 最新变更: 完善 ESLint Flat Config 累计规则与后端源码约束；新增 TypeScript AST 架构门禁、递减 baseline 和 CI 全量扫描
- 测试状态: 后端 201/201 文件、1919/1919 用例通过；ESLint 最终配置与架构脚本回归 10/10 通过
- Lint: 通过（0 error，0 warning）
- Typecheck: 0 error（3/3 workspace tasks；weapp 自身脚本为项目既有 skip）
- 模块 TS 文件数: 497（含测试）
- 当前版本: `0.16.0`

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
- [x] 模块自治（module-loader + \*.module.ts 声明）
- [x] 错误处理与中间件（BusinessError、认证中间件、数据权限中间件）
- [x] 数据库 schema 优化（索引、结构化存储、冗余列清理）
- [x] 前后端类型契约（@qgs/shared API 响应类型）
- [x] 根目录 + 后端脏数据清理
- [x] 偏离修复（文件超限、governance 残留、route-handlers 合并、prisma 脚本清理）
- [x] ESLint 与架构门禁完善（累计 Flat Config、AST 语义规则、历史债务递减 baseline、CI 全量扫描）
- [x] 报检任务模块重构（状态机文档、创建 schema、查询/创建/派工/删除/关闭服务拆分）
- [x] 小程序不合格品项模块（列表、详情、新增、编辑、照片、草稿、RBAC，复用电脑版数据与状态）
- [x] 不合格品项所有权隔离（普通用户仅本人、管理员全部、写操作仅创建人）
- [ ] 后端业务模块逐功能测试覆盖补齐（进行中）

## 当前架构

```
apps/backend/
├── api/          # 路由薄层（≤50 行）
├── middleware/   # 认证、数据权限、日志
├── modules/      # 业务逻辑（25 个模块，497 个 TS 文件）
├── prisma/       # Schema + Migrations
├── routes/       # catch-all 404
└── utils/        # 基础设施（24 个文件）
```

## 待办

- [ ] 完成不合格品项剩余设备验收（真机、实际新增提交、照片上传、分页、草稿、账号切换）；微信开发者工具的权限、列表、详情、编辑、新增页面已验证
- [ ] 持续补强端到端业务流程验证

## 基线数据（用于异常检测）

- 模块 TS 文件数: 497（含测试）
- utils TS 文件数: 41
- 测试文件数: 193（modules 内）；后端总计待下次全量基线刷新
- 导出入口基线: 约 610；已完成 343，剩余 267
- 顶层目录: api/ middleware/ modules/ prisma/ routes/ utils/
