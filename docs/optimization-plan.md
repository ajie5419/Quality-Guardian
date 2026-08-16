# Quality Guardian 优化方案（2026-08）

> 依据：2026-08-15 全项目只读审计（32 后端模块 + 基础设施 + 前端 + 共享包）。原则：每个阶段先补测试暴露问题 → 再改实现 → 全量门禁回归 → CHANGELOG 记录；每阶段独立 PR、可独立上线；实施遵循 AGENTS.md（terra 子代理实施、主代理验收）。

## 阶段总览

| 阶段 | 主题 | 目标 | 预计工作量 |
| --- | --- | --- | --- |
| W0 | 门禁与基线加固 | 让规则真正拦住新增违规、前端纳入检查 | 1–2 人日 |
| W1 | P0 安全修复（10 项） | 消除凭据泄露/越权/任意文件读取 | 4–6 人日 |
| W2 | 硬约束与功能缺陷 | 分层/zod/分页/错误契约真实性 | 6–10 人日 |
| W3 | 性能与数据一致性 | 4GB 生产环境安全边际 | 4–6 人日 |
| W4 | 架构债务与前端重构 | baseline 出账、前端可维护性 | 8–12 人日 |
| W5 | 持续治理 | 安全专项、审计补全、灰度机制 | 持续 |

---

## W0 门禁与基线加固（1–2 人日）

1. **前端纳入架构检查**：新增规则——前端非测试文件禁止 `as unknown as`（当前 22 处，先入 baseline 再逐个清理）；`index.vue`/组件行数阈值（当前 R3 只覆盖 qms/index.vue，monitor 2440 行、SupervisionManagementView 2384 行不受限）。
2. **后端补三条规则**（B-R4 系列）：
   - 禁止 `z.record(z.string(), z.unknown())` / `z.object({}).passthrough()` 出现在写路由（当前 52 处，先基线后清理）；
   - 列表查询 `findMany` 无 `skip/take` 且路由用 `usePageResponseSuccess` 不传 total 时告警（内存分页启发式）；
   - modules/ 下 `defineEventHandler` 文件（当前 ~43 个）显式命名 `*.handler.ts` 并适用 50 行限制，取代"藏在 modules 里"。
3. **测试隔离与门槛**：根 vitest.config.ts 增加 `include` 限定或为 web-antd 建独立配置；加 coverage 报告与最低门槛（建议 line ≥ 60% 起步，只对新代码强制）。
4. **文档校正**：`docs/api-conventions.md` 模板与实现对齐（api 禁 import prisma、logApiError 参数顺序、zod 范式）；`code_map.md` 补 master-data-governance；清理 baseline 中已过期的条目（report.service.ts→dept-tree 已改走 index、B-E2 已补 logger 的文件）。
5. **验收**：`pnpm lint && pnpm run check:type && pnpm run check:qms-arch:all && pnpm test:unit` 全绿；新增违规 0。

## W1 P0 安全修复（10 项，4–6 人日）

| # | 问题（位置） | 修复方案要点 | 验收 |
| --- | --- | --- | --- |
| 1 | **AI 路径穿越→任意文件读取+外泄**（`ai/generate-itp.post.service.ts:57-63`） | 禁用直接 `join(UPLOAD_DIR, filename)`；改为经 file-storage 服务按 storedName 查库解析真实对象，或 `path.basename` 白名单 + `resolve` 后校验前缀包含于 UPLOAD_DIR；**先补测试**覆盖 `../../etc/passwd`、绝对路径、URL 编码、超长路径 | 穿越测试全绿；fileList 分支 100% 覆盖 |
| 2 | **match-cases 跨组织泄露+直读他表**（`ai/ai-route.service.ts:5-23`） | 改走 `InspectionService` 公开查询（index 导出）；发送给 LLM 的字段最小化（rootCause/solution 脱敏或剔除）；AI 离线 fallback 不回传原始问题；补 dataScope/createdBy 过滤 | 越权/泄露回归测试；跨模块仅 index |
| 3 | **用户列表泄露 bcrypt 哈希**（`user.service.ts:158` findAll 无 select） | `select` 显式排除 password；`GET /api/system/user/list` 加 `requireSystemAdmin` 或用户列表权限点 | 响应不含 password；非管理员 403 测试 |
| 4 | **AI apiKey 明文无鉴权回读**（`api/system/ai-settings/index.get.ts`、`settings/[key].get.ts`、`system.service.ts:55-87`） | GET 加 `requireSystemAdmin`；`getAiSettings` 返回时 apiKey 脱敏（掩码 + hasApiKey） | 非管理员 403；响应无明文 key |
| 5 | **软删/禁用用户仍可登录**（`auth.service.ts:10-13`、`user.service.ts:280-288`、`middleware/3.auth.ts`） | 登录/刷新查 DB 校验 `isDeleted=false && status=ACTIVE`；`delete` 同时置 `status:INACTIVE`；access token TTL 缩短（7d→建议 2h）+ 提供吊销表（或每请求校验 DB 的用户状态，权衡 QPS） | 软删用户登录 401/403 测试；token 过期策略文档化 |
| 6 | **登录无防爆破**（`login.post.service.ts:36-97`） | 复用 `utils/rate-limit.ts`：按 ip+username 失败计数，5 次失败锁定 15 分钟；成功登录清零 | 锁定/解锁回归测试 |
| 7 | **DATA_SCOPE_V2 默认关闭→数据权限全开**（`data-scope.service.ts:54-56`） | 默认改为 fail-closed（未配置返回 SELF 而非 ALL）；`.env.example` 标注；deploy workflow 增加"生产必须显式设置"校验；上线前灰度验证各域列表行为变化 | 未配置时 SELF 测试；部署校验步骤生效 |
| 8 | **计量公共借用 fail-open + 并发双借**（`public-metrology-borrow.ts:13-16`、`metrology-borrow.service.ts:140-195`） | token 未配置即拒绝（fail-closed）；借用/归还改 `updateMany({where:{id,borrowStatus:'AVAILABLE'}})+count` 原子守卫；移除/重写把 fail-open 当特性的测试 | 并发借用仅 1 条成功；未配置 token 401 |
| 9 | **写路径越权**（supplier/after-sales/report/knowledge/dashboard/task-dispatch/supervision/vehicle-commissioning） | 统一三件套：① 扩展 data-scope 前缀表（或 module 声明加 writeOwnership 配置）；② 提供 `assertWriteOwnership(user, row)`/写路由必须消费 `event.context.dataScope` 的通用 helper；③ 缺 createdBy/isDeleted 的表（reports/daily_reports/knowledge 等）补字段（migration）。**以 quality-loss 写路由为正确范式**（`api/qms/quality-loss/[id].put.ts:26`） | 各模块越权测试；写路径全部接线 scope |
| 10 | **/mobile 无守卫 + mobile-token 死机制**（`guard.ts:59-61`、`MobileLayout.vue:13`） | 移除 /mobile 直通，纳入权限守卫；删除 mobile-token 死机制或接入真实登录态 | 未登录访问 /mobile 跳登录 |

**W1 收尾**：全量回归 + 每项独立 PR + CHANGELOG；安全修复期间禁止新增其他功能。

## W2 硬约束与功能缺陷（6–10 人日）

1. **导出静默截断 ×2**：`work-order-route.service.ts:356`、`supplier-export.get.service.ts:22` 请求 pageSize 20001 被钳到 100。方案：导出走专用聚合路径（DB 游标分页/直接流式导出），或放开导出上限但 DB 层分页；**先补测试**（>100 行导出完整性）。
2. **after-sales 列表伪分页**（`after-sales.service.ts:367` findMany 无 skip/take + response.ts 内存切片）：改 DB 层 `skip/take` + count；`usePageResponseSuccess` 传真实 total；补分页断言测试。
3. **弱 zod 收口（52 处）**：写路由全部换真实 schema（参照 `incoming-material-free-input.post.service.ts` strict 范式）；`z.record/z.unknown/passthrough` 清零。优先高敏路径：报检关闭（`inspection-request-close.post.service.ts:16`）、用户创建（`system/user/index.post.ts:21`）、AI 4 端点、dept/role/settings 写路由。
4. **BusinessError 迁移**：按模块清单替换 `throw new Error('CODE'/中文)` → `new BusinessError(code,msg,httpStatus)`；api 层删除 `error.message === 'xxx'` 字符串匹配；优先 inspection/after-sales/task-dispatch/metrology/supervision/ai 六个重灾模块。
5. **中间件修复**：request-dedupe 移到 auth 之后（`2.request-dedupe.ts:45` userId 永远不命中）；data-scope 前缀精确匹配（`/api/qms/supplier` 误配 supplier-identity-links，`4.data-scope.ts:8-9`）；CORS 统一（middleware 回显 Origin 覆盖 routeRules 白名单，`1.api.ts:10-13`）；认证端点纳入限流。
6. **handler 下沉治理**：将 modules/ 下 ~43 个 `defineEventHandler` 文件按 W0 规则显式化为 handler 并压回 api 层（或保留但套 50 行限制 + 命名规范）。
7. **pageSize 统一**：welder（200）、vehicle-commissioning（无上限）、supervision（无上限）、dictionary、knowledge、file-storage（200）全部收敛到 ≤100。
8. **非 cuid 主键**：welder（`WEL-年份-随机`）、vehicle-commissioning（`DA-年份-nanoid`）、knowledge docId（`Math.random()`）→ cuid（需评估存量数据迁移，可先停止生成新键 + 补唯一约束）。
9. **前端 /mobile 与权限单源**：/mobile 复用桌面 composable + 接 i18n；权限码以 qgs-shared `PermissionCode` 为唯一真源，消除 50+ 字面量与角色名判断（`after-sales/index.vue:92-99`、`TaskList.vue:18-27`）。

**W2 验收**：写路由 100% zod + 100% 权限接线；导出无截断；`as Record<string,unknown>` 清零；BusinessError 使用率 ≥ 90%。

## W3 性能与数据一致性（4–6 人日）

1. **全表加载→DB 聚合**（优先级排序）：
   - after-sales reportMonth 维度（`after-sales-chart-aggregation.service.ts:313-342`）
   - report legacy drill-down（`pass-rate.ts:349-503`）+ vehicle-failure-rate 排名/月度（`vehicle-failure-rate.service.ts:156-242`）
   - metrology overview（`metrology.service.ts:356-408`、`borrow-query:130-232`）
   - dashboard workspace 排序（`dashboard-route.service.ts:66-82`）、quality-loss summary（`loadAllScopedItems`）、supervision deadlineBoard、vehicle 日报（N+1）
   - 全部改 `groupBy/aggregate/$queryRaw`，4GB 内存边际安全。
2. **导出/大查询边界**：vehicle-commissioning export（pageSize 20000 逐行 sharp）改游标/限流；quality-loss drill-down take:2000 静默截断改为显式分页。
3. **热点扫描**：freshness 全表 count/LEFT JOIN（`pass-rate-projection-query.service.ts:139-156`）、team legacy 碰撞全表扫描（`team-identity-write.ts:69-92`）——评估索引/一次性 backfill 建键后移除扫描、refreshOverdueStatuses 双份重复定义合并。
4. **distinct+orderBy 真机验证**：`metric-refresh-queue.service.ts:102,294`、`quality-loss-index-queue.service.ts:105` 的 claim() 组合用真实 MySQL 冒烟（Prisma/MySQL 对 SELECT DISTINCT+ORDER BY 有校验），失败则改取数策略。
5. **缓存治理**：dashboard trend 缓存键加 userId/scope/年份（`dashboard.service.ts:224`）；dashboardStatsCache Map 加容量上限/淘汰；dept 树缓存失效与写路径同事务化评估。
6. **验收**：压测/explain 关键列表与聚合；内存峰值下降；无未分页 findMany 于热路径。

## W4 架构债务与前端重构（8–12 人日）

1. **utils 大文件拆分**：canonical-master-data.ts（1548 行）、master-data-fields.ts（1528 行）按职责下沉 modules/ 或拆多文件；utils 行数规则纳入 arch 检查。
2. **baseline 出账**：B-M1 跨模块内部 import（140 条）分批改为走 index；B-E2 silent catch（57 条）逐个补 logger；B-T2 双重断言（8 条）消除；每批出账后收紧 baseline 文件。
3. **表结构补齐**（migration）：39 张缺 createdBy 的表按业务优先级补字段；16 张缺 isDeleted 的表确认删除语义（file_assets/file_references 若物理删需显式文档化）；`@module` 标签补齐 82 张表。
4. **前端死代码与重构**：
   - 删除/收敛：components/Qms/ChartBuilder（保留 useChartCore，两域 fork 改用它）、MobilePageShell、7 个 vue-query 死 hook、legacyResponsibilityDepartment、updateByRoute/savePassRateTargets/invalidateStatsCache 等后端死路径；
   - 神组件拆分：SupervisionManagementView（2384）、WelderManagementView（1228）、WorkOrderAggregateDrawer（1149）、monitor/index.vue（模板 2300 行静态大盘可数据化）；
   - 重复收敛：AfterSalesPhotoUpload vs IssuePhotoUpload、三份 MobileList、ToolbarActions 一族、KPI 卡一族（抽 OverviewStatCards）、状态 UI 色映射单一权威（@qgs/shared）、全局 css 改 scoped、after-sales/issues index.css 合并；
   - 类型安全：22 处 `as unknown as` + 29 处 `as any`（GanttTaskEditor 21 处集中处理）清零。
5. **qgs-shared 收口**：5 组双轨枚举合并（以 domain-modules as-const + 规范化函数为唯一权威，迁移 enum 消费者）；清理 89 个仅包内导出；prisma-error 移回后端并删 6+ 个 1:1 转发 shim；补 files/sideEffects 导出。
6. **审计与权限补全**：supervision/quality-classification/平台域 CRUD 补 audit 声明；超管判定从角色名子串（`rbac-role.service.ts:62-65`）+ 硬编码 userId（`rbac-menu.service.ts:134`）改为权限点/系统标记；dept 成环校验、dictionary 引用完整性删除检查。
7. **验收**：arch --all 新增违规 0；baseline 缩减 ≥ 50%；前端构建 + 全量测试通过；无死代码（grep 复核）。

## W5 持续治理（长期）

1. **安全专项**：/api/uploads/ 附件 URL 无鉴权（`middleware/3.auth.ts:17` 白名单 + ACAO \*）改短期签名/鉴权策略；SVG 存储型 XSS 面（`IMAGE_EXTENSIONS` 含 svg）收紧；OSS delete 与 objectKey 不一致（`oss-storage.ts:63-65`）修复；file-storage 只软删不物理删策略（存储无限增长）明确化；AI prompt 注入隔离指令 + 错误消息不泄漏上游内容。
2. **灰度与发布机制**：DATA_SCOPE_V2/数据权限开启、createdBy 补字段、分页行为变化均配灰度开关与回滚预案；release-maintenance manifest 登记必要数据任务（保持 taskKey/revision/checksum 纪律）。
3. **覆盖持续上升**：前端 9 个零测试域 + 31 个未测 composable 补测；后端 master-data-identity（8 it）/supplier-mutation（0 测试）/planning routes（37 handler 0 测试）补齐。
4. **监控**：system-monitoring 硬编码假数据（`system-monitoring.service.ts:228-248`）接真实指标。

## 关键风险与依赖

- **迁移类**：createdBy/isDeleted 补字段、非 cuid 主键迁移需写停止窗口 + 回滚预案，先 dry-run。
- **行为变化**：DATA_SCOPE_V2 默认 fail-closed、附件鉴权、写路径权限收紧会改变现有用户可见行为，需灰度 + 培训同步。
- **重构回归面**：前端神组件拆分、BusinessError 迁移回归面大，坚持"先测试后改码"。
- **执行环境**：按 AGENTS.md，实施需在可指定 gpt-5.6-terra 子代理模型的运行时执行（本次审计会话模型不可选，已披露）；主代理负责验收与最终交付。
- **节奏建议**：W0+W1 合并为第一个发布（安全封板）；W2 第二个发布；W3/W4 可并行但各自独立 PR；每阶段结束跑 `pnpm lint && check:type && check:qms-arch:all && test:unit` 全量门禁并更新 CHANGELOG。
