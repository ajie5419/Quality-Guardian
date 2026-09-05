# 技术治理基线整改计划（Baseline v1.0 落地路线图）

> 来源：《Quality-Guardian\_技术治理基线与整改规范.docx》（Baseline v1.0，2026-08-19）目标：从"修复单点 BUG"升级为"范式 + 自动化守门"，让同类问题无法再次进入主分支。治理原则：每个问题必须回答三件事——① 当前问题如何修复；② 系统为什么允许它发生；③ 用哪个统一范式 / 架构规则 / CI 检查防止回归。

## 1. 现状核实（2026-08-19 对照文档 §19 整改映射）

| 问题族 | 文档优先级 | 仓库现状核实 | 结论 |
| --- | --- | --- | --- |
| DataScope | P0 | `modules/data-scope/data-scope.service.ts` 已有 `buildScopedWhere`（inspection/supplier/after-sales/work-order），但 detail/update/delete/export/stats 未全部收口；生产"数据范围隔离暂不实施" | 缺口：收口 + 启用决策 |
| Task Dispatch | P0 | 确认存在 `api/qms/task-dispatch/seed.get.ts`、`api/qms/planning/dfmea/seed.get.ts`（GET 执行 seed）；状态修改仅有功能权限 | 缺口：收口 seed GET + 对象级授权 |
| 并发 | P1 | 部分表有 version 字段但未用于 CAS | 缺口：乐观锁收口 |
| Scheduler | P1 | `cron_jobs` 迁移（20260816120000）jobKey 仅有普通索引，无唯一约束 | 缺口：补唯一约束 |
| Quality Loss | P1 | 已改查 quality_loss_index 物化表，不再全量拉 Node；B-MF 指标门禁已挂 | 基本闭环，纳入回归 |
| Inspection | P1 | 列表 DTO 过重 | 缺口：List/Detail 分离 |
| Lifecycle | P1 | archivedAt 打标记不拆表（2026-08-17 决策）；保留期规则 + daily-archive 已有 | 决策已定，需 ADR 固化 + 附件/快照补齐 |
| File | P1 | upload-policy.ts 扩展名白名单 + 服务端 MIME 校验（SVG/HTML/宏文档拒绝） | 缺口：magic byte + 孤儿补偿 |
| AI | P1 | baseUrl 来自配置，无强制 allowlist | 缺口：allowlist + 日志脱敏 |
| CI | P1 | qms-arch 门禁已有（B-AUTH1/B-EC/B-GF/B-MF/R2 等） | 缺口：Security E2E / CVE / Trivy |

## 2. 阶段计划（沿用文档 §17，工作量按 P0 → P1 排序）

### Phase 0 — 冻结架构漂移

**目标：** 发布基线规范，Architecture Gate 初版上线，新代码不再扩大已知模式。

- [ ] 规范入库：把 docx 版本化为 `docs/architecture/BASELINE.md`（v1.0，目录尚需创建），在 `docs/PROJECT_GUIDE.md` 文档地图登记，明确层级关系（PROJECT_GUIDE 为总档案，BASELINE 为技术治理基线专项规范）。
- [ ] Architecture Gate 初版（`scripts/check-qms-architecture.sh` 新增规则，存量 baseline 化）：
  - GET 路由禁止执行写/seed（R-GET）；
  - 受保护模块禁止直接 `prisma.<model>.update({ where: { id } })` / `delete` 绕过 scope（R-SCOPE）；
  - 受保护资源的 export/stats/drilldown 必须复用共享 scope builder（R-SCOPE-EXPORT）。
- [ ] 收口已知违规：删除/改造 2 个 `seed.get.ts`，归入 Phase 1 一并处理。

**交付物：** BASELINE.md；新增门禁规则 + 存量 baseline；门禁测试。 **验收：** `pnpm run check:qms-arch --all` 0 违规；新增违规样例被门禁拦截；docs drift 通过。

### Phase 1 — 权限收口（P0）

**目标：** RBAC 与 DataScope 分离落地，跨部门 Security E2E 全通过。

- [ ] Task Dispatch：seed GET 改为受权限保护的 POST（仅开发环境）；状态修改（派单/关闭等）增加对象级授权 + 状态机校验。
- [ ] DataScope 统一：受保护资源的 detail/update/delete/export/stats/trend 全部复用 `buildScopedWhere` / findAccessible / updateAccessible，删除"先 findUnique 再补判断"和自建查询。
- [ ] 导出与统计与 List 同源：export/stats 复用同一 scope builder。
- [ ] Security E2E 矩阵：新增跨部门 GET/UPDATE/DELETE/EXPORT/STATS/DRILLDOWN 全矩阵测试脚本，挂入 CI。

**交付物：** Scoped Repository 收口清单；Security E2E 测试套件。 **验收：** 跨部门 Security E2E 全通过；受保护模块无裸 prisma 写路径；门禁全绿。

### Phase 2 — 一致性收口（P1）

**目标：** 关键业务无 Lost Update / 非法状态跳转。

- [ ] 乐观锁：售后/质量损失/供应商整改/任务等关键表启用 `WHERE id + version`，更新 count != 1 视为冲突，成功后 version += 1；对"有 version 但未用于 CAS"的表逐个收口。
- [ ] 状态机：显式边 + expectedStatus 校验（任务、审批、关闭、归档），客户端不得直接提交任意 status。
- [ ] 事务一致性：核查事务内公共服务是否透传 tx，禁止"外层事务 + 内层默认 prisma"。
- [ ] Scheduler：`cron_jobs.jobKey` 补唯一约束迁移 + 注册 upsert 幂等（对齐文档 §11 Cron Registry 基线）。

**交付物：** 乐观锁/状态机/tx 收口清单；jobKey 唯一约束迁移。 **验收：** 并发冲突用例测试通过；无非法状态跳转；scheduler 测试全绿。

### Phase 3 — 性能收口（P1）

**目标：** 核心接口达到约定 SLO（10x 数据量）。

- [ ] Inspection 列表 DTO 瘦身：List 只返回展示摘要，完整 items/附件/历史仅 Detail 获取。
- [ ] 聚合下推：扫描剩余"findMany 到 Node 再聚合"的统计，改为 SQL 聚合（受 B-MF 指标门禁约束）。
- [ ] 复合索引：针对真实 SQL + EXPLAIN ANALYZE 建立，禁止盲目加单列索引。
- [ ] 核心表 SLO 压测基线。

**交付物：** DTO 收口；聚合下推清单；SLO 压测报告模板。 **验收：** 核心接口达到 SLO；qms-arch / B-MF 全绿。

### Phase 4 — 数据生命周期（P1）

**目标：** 归档/恢复/销毁可演练。

- [ ] ADR：固化"archivedAt 打标记不拆表"决策，明确 Hot/Warm/Cold 边界与迁移触发条件。
- [ ] 附件生命周期跟随业务对象：数据库清理时同步 OSS purge，孤儿补偿。
- [ ] snapshot rebuild + 一致性校验脚本（物理删除前必须可重复执行）。
- [ ] 归档任务批处理/限流/可重试（在 daily-archive 基础上补强）。

**交付物：** 生命周期 ADR；附件 purge/补偿；rebuild 校验脚本。 **验收：** 归档、恢复、销毁演练通过。

### Phase 5 — 安全与供应链（P1）

**目标：** Release Gate 完整。

- [ ] Upload：扩展名 + MIME + Magic Byte + 大小限制 + 流式处理；Office/PDF 禁宏格式。
- [ ] AI：provider baseUrl allowlist + 防 SSRF；日志脱敏（不记录完整 prompt / provider error body / AI JSON 原文）；记录 provider/model/version/request id。
- [ ] CI/CD：Gitleaks、OSV/Dependabot、Trivy/镜像 CVE、production non-root。
- [ ] 补安全回归用例（恶意上传、SSRF、越权导出等）。

**交付物：** 上传安全收口；AI allowlist；供应链门禁。 **验收：** Release Gate 完整；安全回归全通过。

## 3. 每阶段收尾（强制）

- 更新 `PROJECT_STATE.md`（进度/最近变更/待办）→ 追加 `CHANGELOG.md` → 按需更新 `code_map.md`。
- 跑门禁：`pnpm lint && pnpm run check:type && pnpm run check:qms-arch && pnpm run check:docs-drift`。
- 每个 P0/P1 关闭前回答文档 §18 的 12 条 PR 审查清单；确认已上提为范式 + CI Gate，否则不算真正关闭。

## 4. 维护规则（文档 §20）

- 规范版本化存于 `docs/architecture/BASELINE.md`，重大架构决策必须通过 ADR 更新，不允许只在聊天/会议纪要中存在。
- 每季度做一次基线漂移检查：扫描受保护模块、直接 Prisma、Raw SQL、Export、Seed/Debug 路由。
- 规范变化先升级模板/公共组件 → 迁移存量模块 → 最后收紧 CI。

## 5. 待确认决策点

- DataScope 生产启用时机："数据范围隔离暂不实施"是 2026-08-17 的产品决策，收口完成后需确认是否开启。
- Lifecycle 分层是否维持"打标记不拆表"：建议 ADR 固化，避免长期两套语义。
- 新增 CI 门禁（Security E2E / CVE / Trivy）的失败策略：建议 fail-closed。
