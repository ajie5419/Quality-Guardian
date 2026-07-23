# 项目进度

## 当前状态

- 最新变更: 已启用 `main-protection` Ruleset 保护默认分支，并将代码审查流程确定为合并前在 Codex 中手动执行；无需配置额外 API 密钥
- 测试状态: 全量 305/305 个文件、2636/2636 个用例通过；后端 221/221 个文件、2091/2091 个用例通过；类型检查、lint 和 QMS 架构检查通过
- Lint: 通过（0 error，0 warning）
- Typecheck: 0 error（3/3 workspace tasks；weapp 自身脚本为项目既有 skip）
- 模块 TS 文件数: 515（含测试）
- 当前版本: `0.19.0`（生产部署成功）

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
- [x] `main` GitHub Ruleset 合并门禁（强制 PR、最新基线、6 项 CI、review thread 解决、禁止删除/强推）
- [x] Codex 手动代码审查流程（合并前审查最新差异并处理全部 P0/P1 问题）
- [x] 报检任务模块重构（状态机文档、创建 schema、查询/创建/派工/删除/关闭服务拆分）
- [x] 小程序不合格品项模块（列表、详情、新增、编辑、照片、草稿、RBAC，复用电脑版数据与状态）
- [x] 不合格品项所有权隔离（普通用户仅可查看及管理本人记录，具备对应权限码的管理员可查看、编辑及删除全部记录）
- [x] 报检不合格项事业部身份修复（部门 canonical 双写、事务内检验关联、历史回填、unresolved 审计与发布链路）
- [x] 报检不合格项责任归属修复（显式责任类型、部门/供应商 canonical 双写、历史回填、冲突审计与发布链路）
- [x] 不合格项列表增加报告日期范围搜索（列表、查询全部和导出参数一致，结束日完整包含）
- [x] 检验记录按检验类型补齐项目、物料、组件、检验员和检验日期范围搜索
- [x] 不合格项列表增加供应商/外协单位搜索（列表、查询全部和导出参数一致）
- [x] 工单要求跟踪补齐带 RBAC 与数据范围校验的编辑、软删除及图标化确认/撤销操作
- [x] 售后质量搜索项按业务字段补齐（项目、责任部门、经办人、缺陷、供应商和日期范围）
- [x] 售后质量搜索增加部件名称，列表与全量导出共用查询参数
- [x] 报检任务电脑版与移动版派单只显示启用的 `QC` 检验员，后端同步强制校验
- [x] 调试验收问题台账增加带 RBAC 校验的软删除操作（附件、质量损失索引和审计同步处理）
- [x] 调试验收问题台账的一级导出和二级编辑、删除、日志使用带提示的图标按钮
- [x] 本地 Apple Container 开发启动脚本改用有界端口探测，避免 macOS `lsof` 内核阻塞
- [x] supplier identity governance wave（供应商画像、评分、检验、不合格项、售后评分、TEAM 映射、存量回填与 unresolved 审计）
- [x] 供应商画像数据源契约修复（历史项目完整聚合、检验批次合格率、手工工程问题归属、V3 快照重算）
- [x] 新增供应商同名软删除档案恢复（保留原 ID、并发 CAS、RESTORE 审计、业务冲突分级）
- [ ] 后端业务模块逐功能测试覆盖补齐（进行中）

## 当前架构

```
apps/backend/
├── api/          # 路由薄层（≤50 行）
├── middleware/   # 认证、数据权限、日志
├── modules/      # 业务逻辑（25 个模块，515 个 TS 文件）
├── prisma/       # Schema + Migrations
├── routes/       # catch-all 404
└── utils/        # 基础设施（24 个文件）
```

## 待办

- [ ] 完成不合格品项剩余设备验收（真机、实际新增提交、照片上传、分页、草稿、账号切换）；微信开发者工具的权限、列表、详情、编辑、新增页面已验证
- [ ] 持续补强端到端业务流程验证
- [x] 核对事业部生产回填汇总（工单修复 142 条，不合格项修复 46 条，无冲突和并发覆盖）
- [ ] 人工处置事业部回填遗留的 124 条工单和不合格项侧 8 个无法解析计数
- [x] 完成 supplier identity wave 的 PR、release-please、部署、migration、回填和健康检查
- [ ] 使用已登录业务账号验收秦皇岛吉兴机械制造有限公司供应商画像的 7 月 8 日不合格项、手工工程问题、进货合格率和完整历史项目
- [ ] 为 `unresolved_master_data_refs` 增加人工处置 API/UI，并为 `supplier_identity_links` 增加管理 UI
- [ ] 为 supervision 等尚未覆盖的存量供应商引用补齐回填、unresolved 审计和生产指标核对
- [ ] 将其他受控主数据从 `DUAL_WRITE/legacy` 逐 wave 推进到在线 `ID-required`
- [ ] 将单进程 EventEmitter 替换为可持久化、跨实例、可重试的事件机制

## 基线数据（用于异常检测）

- 模块 TS 文件数: 515（含测试）
- utils TS 文件数: 41
- 测试文件数: 199（modules 内）；后端总计 221
- 导出入口基线: 约 610；已完成 343，剩余 267
- 顶层目录: api/ middleware/ modules/ prisma/ routes/ utils/
