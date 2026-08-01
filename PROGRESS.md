# 项目进度

## 当前状态

- 最新变更: 主数据身份治理 WP3 已为合格率增加管理员开关、严格切换门禁、独立可重试重建队列、六窗口影子对账和可证明的 unresolved 分类；用户可见口径仍为默认 legacy，生产环境未访问、未修改。
- 测试状态: WP3 定向测试与后端全仓 Vitest `262/262` 文件、`2380/2380` 用例及全部提交门禁均已通过。
- Lint: 通过（0 error，0 warning）
- Typecheck: 0 error（3/3 workspace tasks；weapp 自身脚本为项目既有 skip）
- 模块 TS 文件数: 581（含测试）
- 当前版本: `0.19.1`

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
- [x] 不合格品项所有权隔离（普通用户仅可查看及管理本人记录，具备对应权限码的管理员可查看、编辑及删除全部记录）
- [x] 页面与按钮权限层级统一（菜单严格校验页面权限、角色授权层级校验、原子保存、通用存量回填与发布链路）
- [x] Permission-aware login landing page fallback for restricted roles, including a dedicated no-access 403 route
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
- [x] TEAM 主数据身份治理（独立模块、稳定来源、别名、合并审计、通用字典写保护）
- [x] 报检任务统计按 `category + teamId/supplierId/inspectorId` 聚合，名称只用于最终展示
- [x] 受控主数据统计门禁与首波全库迁移（售后、检验、不合格品、报表、供应商评分）
- [x] 售后与不合格品动态图表统一携带 canonical ID、名称和解析状态，前端不再按名称或部门树二次归并
- [x] 工单看板、周报/月报缺陷分布和车辆缺陷排行按 canonical ID 聚合并透传身份状态
- [x] 质量损失索引、检验部件、工单要求/聚合和 BOM 所需工序身份治理
- [x] 报检 Web/小程序与工单要求 V2 ID-required 写契约
- [x] Historical process identity bootstrap and work-order requirement `processId` backfill, including empty-only seeding and ordered release maintenance
- [x] 全局工序主数据与报检显示配置解耦（过程报检/进货检验独立开关、稳定 ID、全局复用、无名称或工单要求兜底）
- [x] 受控名称 `Map` 键架构门禁 `B-ID9`
- [x] 质量二级分类开放配置（不合格项缺陷、售后产品、售后缺陷），含 Web/小程序接入、canonical ID 统计、发布初始化和历史回填
- [x] 质量分类 migration 的 MySQL 长索引名修复、自动化门禁与本地容器数据库恢复
- [x] 主数据治理后的质量统计与报表修复（概览、过程合格率、售后、质量损失、周报、项目排行及历史身份回填）
- [x] 统计身份状态统一（已解析、待治理、主数据失效、不适用），保留原始证据并消除业务图表中的 `Unknown`
- [x] 系统设置主数据治理清单与分类处置闭环（不合格项缺陷、售后产品、售后缺陷）
- [x] 历史统计兼容与 ID 写入契约加固（旧数据按快照保留、新数据按 ID 写入、治理并发 CAS）
- [x] 车辆故障率历史产品快照兼容（ID 主路径、精确历史快照和事业部兜底）
- [x] 物料新增申请审核闭环（独立物料主数据、公开申请、后台审核、规范 ID 回填与派单强校验）
- [x] 主数据身份治理 WP0（历史名称冻结、重名解析安全、已裁决治理项保护、改名死代码删除、只读身份基线）
- [x] 主数据身份治理 WP1（旁路台账、身份投影、人工归档、对账 cutoff 与受控初始化）
- [x] 主数据身份治理 WP2 首批试点（合格率窄投影、固定快照影子对账、报表级开关）
- [x] 主数据身份治理 WP3（合格率安全切换门禁、管理员控制、可重试重建、六窗口影子对账）
- [ ] 后端业务模块逐功能测试覆盖补齐（进行中）

## 当前架构

```
apps/backend/
├── api/          # 路由薄层（≤50 行）
├── middleware/   # 认证、数据权限、日志
├── modules/      # 业务逻辑（30 个模块，581 个 TS 文件）
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
- [ ] 为 `supplier_identity_links` 增加管理 UI
- [ ] 在本地管理员登录态或容器恢复后，通过主数据治理页处置 `ISS-2026-_O7D0ZBC` 的缺陷分类审计；当前保持 `OPEN`，未绕过认证或直接改库
- [ ] 为 supervision 等尚未覆盖的存量供应商引用补齐回填、unresolved 审计和生产指标核对
- [ ] 将其他受控主数据从 `DUAL_WRITE/legacy` 逐 wave 推进到在线 `ID-required`
- [ ] 按生产 V1/V2 流量和 `missing_id_count` 指标删除报检/工单要求 V1 迁移协议
- [ ] 继续核对尚未登记的动态字段和名称分支路径
- [ ] 治理售后反馈部门、检验归档、BOM 项目和文档项目剩余的 18 条缺失身份及反馈部门孤儿引用
- [ ] 通过发布流程部署 TEAM identity migrations，执行有序 reconciliation/category backfill，并核对生产报检排行总数与 unresolved 审计
- [ ] Deliver the process identity bootstrap and inspection-request option migration through the release workflow, then verify production counts without manual database edits
- [ ] 通过发布流程部署质量分类 migration 和有序维护脚本，核对三套初始分类、历史回填数量及 unresolved 审计
- [ ] 将单进程 EventEmitter 替换为可持久化、跨实例、可重试的事件机制

## 基线数据（用于异常检测）

- 模块 TS 文件数: 581（含测试）
- utils TS 文件数: 42
- 后端测试文件数: 246
- 导出入口基线: 约 610；已完成 343，剩余 267
- 顶层目录: api/ middleware/ modules/ prisma/ routes/ utils/
