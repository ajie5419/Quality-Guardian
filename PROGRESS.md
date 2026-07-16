# 项目进度

## 当前状态

- 最新变更: TEAM 身份治理已生成 `qgs-v0.17.4`，首次生产部署因历史 unresolved 被新门禁误判而回滚；已完成仅阻断新增/变化 OPEN 审计的 hotfix，待发布复验
- 测试状态: 本次后端 218/218 个文件、2015/2015 个用例通过
- Lint: 通过（0 error，0 warning）
- Typecheck: 0 error（3/3 workspace tasks；weapp 自身脚本为项目既有 skip）
- 模块 TS 文件数: 508（含测试）
- 当前版本: `0.17.4`（生产部署已回滚）

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
- [x] 后端类型感知 ESLint 完善（Promise 生命周期、异常类型、switch 穷尽性、测试断言与禁用测试约束）
- [x] Git hooks 完善（pre-commit 自动修复重暂存、pre-push 类型与架构检查、条件化 post-merge 安装）
- [x] 报检任务模块重构（状态机文档、创建 schema、查询/创建/派工/删除/关闭服务拆分）
- [x] 小程序不合格品项模块（列表、详情、新增、编辑、照片、草稿、RBAC，复用电脑版数据与状态）
- [x] 不合格品项所有权隔离（普通用户仅本人、管理员全部、写操作仅创建人）
- [x] supplier identity governance wave（供应商画像、评分、检验、不合格项、售后评分、TEAM 映射、存量回填与 unresolved 审计）
- [x] 供应商画像数据源契约修复（历史项目完整聚合、检验批次合格率、手工工程问题归属、V3 快照重算）
- [x] 新增供应商同名软删除档案恢复（保留原 ID、并发 CAS、RESTORE 审计、业务冲突分级）
- [ ] 后端业务模块逐功能测试覆盖补齐（进行中）

## 当前架构

```
apps/backend/
├── api/          # 路由薄层（≤50 行）
├── middleware/   # 认证、数据权限、日志
├── modules/      # 业务逻辑（25 个模块，508 个 TS 文件）
├── prisma/       # Schema + Migrations
├── routes/       # catch-all 404
└── utils/        # 基础设施（24 个文件）
```

## 待办

- [ ] 完成不合格品项剩余设备验收（真机、实际新增提交、照片上传、分页、草稿、账号切换）；微信开发者工具的权限、列表、详情、编辑、新增页面已验证
- [ ] 持续补强端到端业务流程验证
- [x] 完成 supplier identity wave 的 PR、release-please、部署、migration、回填和健康检查
- [ ] 使用已登录业务账号验收秦皇岛吉兴机械制造有限公司供应商画像的 7 月 8 日不合格项、手工工程问题、进货合格率和完整历史项目
- [ ] 为 `unresolved_master_data_refs` 增加人工处置 API/UI，并为 `supplier_identity_links` 增加管理 UI
- [ ] 为 supervision 等尚未覆盖的存量供应商引用补齐回填、unresolved 审计和生产指标核对
- [ ] 将其他受控主数据从 `DUAL_WRITE/legacy` 逐 wave 推进到在线 `ID-required`
- [ ] 将单进程 EventEmitter 替换为可持久化、跨实例、可重试的事件机制

## 基线数据（用于异常检测）

- 模块 TS 文件数: 508（含测试）
- utils TS 文件数: 41
- 测试文件数: 196（modules 内）；后端总计 213
- 导出入口基线: 约 610；已完成 343，剩余 267
- 顶层目录: api/ middleware/ modules/ prisma/ routes/ utils/
