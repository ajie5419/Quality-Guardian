# PROJECT_STATE — Quality Guardian 项目状态日报

> **本文件是"现在到哪一步了"的唯一权威。** 每次 AI 会话开工先读本文件；完成工作后必须更新本文件。硬数据段（版本/模块数/文件数）由 `pnpm run docs:sync` 自动生成，**禁止手写**；AI 只维护"进度 / 最近变更 / 待办"三段。

## 硬数据（自动生成，勿手改）

<!-- docs:sync-start -->
- 最后同步时间: 2026-08-18 11:02
- 版本: 0.27.0
- 后端模块数: 34
- 模块 TS 文件数: 683
- 后端测试文件数: 299
<!-- docs:sync-end -->

## 当前进度

<!-- AI 维护：简述当前进行中的工作、目标、当前阶段。 -->

- 主分支已发布 v0.27.0（2026-08-15，PR #130 合并）。
- 文档知识库治理已完成一轮：项目档案（docs/PROJECT_GUIDE.md）为规范唯一权威、状态日报（本文件）自动同步硬数据、漂移门禁（check:docs-drift）拦截版本/模块清单/基线漂移；33/33 模块已具备 ARCHITECTURE.md。
- 数据契约规范已落地：docs/data-contract.md 成文 + ErrorCode 枚举 + B-EC/B-GF/R2 门禁 + where:field 影响面脚本（详见最近变更）。
- 定时任务框架（方案 A）已实现：modules/scheduler/ + cron-scheduler plugin + 3 个首批任务（计量到期/NC 超时/供应商月度快照），设计文档 docs/scheduler-design.md。
- 待办列表见下方「待办」，多数为历史遗留的生产回填/验收/治理项（详见 PROGRESS.md 待办段）。

## 最近变更（倒序）

<!-- AI 维护：每次完成工作后，在顶部插入一行：日期 + 做了什么 + commit/验证。 -->

- 2026-08-18 报检界面迭代收尾（6 个修复）：公开创建接口可选解析 token（登录用户报检落 reporterId，546d2038）；已派单改名"待检验"并排除未闭环 NC 单（bdb3e5e1）；修复入口页 MyInspectionRequests 组件未注册导致"我的报检"空白（cfd2dcc5）；表格列补 dataIndex（工序/工单号显示，86f9eaab）；列表初始加载带 scope（待派单不再混入已关闭/不合格单，f1a48605）；无派单权限用户 closed/abnormal/自由搜索强制限本人相关（inspectorId OR reporterId，0f3cc4f5）。保留期确认：报检/检验/NC 10 年归档、审计 90 天、本机回执永久（上限 20 条）。
- 2026-08-18 报检任务界面角色化视图：报检任务页 Segmented 视图改为 待派单/已派单/已完成单/不合格异常单/我的检验(近一周)——待派/已派仅派单权限可见（前端 Tab 显隐 + 后端 scope=pending/dispatched 权限 403 强制）；新增 scope 查询（abnormal=NC 未闭环、my-inspection=当前检验员近7天、my-report=当前报检人）；报检单新增 reporterId（迁移 20260818090000，登录创建时落库）；公开状态接口 GET /qms/public/inspection/requests/status?requestNo=（匿名扫码查询，仅返回状态类最小字段防枚举泄露）；报检入口页加 Tab（报检单/我的报检）——提交成功存本机回执（localStorage）并自动切换，匿名靠本机回执+公开状态接口，登录合并 reporterId 查询。真库验证：scope=pending/abnormal/my-inspection/my-report 全通、匿名公开状态查询通。
- 2026-08-17 工序责任部门回填脚本成文（scripts/process-responsible-department-backfill.ts + 入口 + 6 测试）：部门按名称路径（如 科技公司/制造SOBU/采购部）解析、不硬编码 ID，重名/缺失报错列候选；dry-run/--apply 双模式、幂等 skip、supplierSource 与责任类型不一致仅告警；package.json 新增 maintenance:process-responsible-departments。本地 dry-run 验证 4 工序全部已配置（skipped=4）。生产部署时核对部门路径后跑 --apply 即可。
- 2026-08-17 报检责任落库链路修复（工序责任部门 + 快照继承，**前端零改动**）：processes 恢复 responsibleDepartmentId（迁移 20260817160000，本地 DB 列与迁移记录已在，直接恢复文件）；创建报检单外部责任（进货/外协）前端不传部门 → 后端从工序主数据静默带出落库，未配置则在创建时提示"请联系管理员配置工序责任部门"（不再拖到关闭才报"责任部门不能为空"）；关闭链路删除 system_settings 服务端解析（删 4 个死代码文件：default service/setting service/bootstrap 脚本及其测试），提交缺部门时继承报检单快照（resolveSubmittedCloseResponsibility + hydrateOutsourcingLinkedIssueResponsibility）；检验记录继承链路确认已存在（buildInspectionRecordPayloadCore 全量带出责任）。**工序责任部门配置靠 SQL/脚本维护（本地已预配 4 工序），不做任何设置界面**（用户决策：只传数据、不显示，避免增加操作步骤；曾误加设置页工序列已回退）。真库验证：创建（外购件→采购部）→ 关闭 FAIL → NC-26KJ-052，报检单/不合格项责任逐字段一致 PASS；未配置工序创建时报错提示正确。
- 2026-08-17 指标治理阶段4 落地（收官）：拆 inspection-reporting.service.ts（428→287 行）——3 个跨域函数经数据源核查实为检验域数据，拆至 inspection-score-data.service.ts，转发面与消费者零改动；全量 2686 用例、qms-arch 0 violations。
- 2026-08-17 指标治理阶段3 落地：检验员在办量排行收敛——inspection 新增 getInspectorActiveTaskCounts（独立文件），user.service 动态 import 调用统一出口（顶层 import 会触发 inspection→user 模块加载循环）；quality-loss-trend 经核实为工作台在用（非死端点）保留；全量 2686 用例、qms-arch 0 violations。
- 2026-08-17 指标治理阶段2 落地：质量损失三源聚合收敛——getTrendData 改查 quality_loss_index 物化表（四源口径写入时统一 isClaim||amount>0），删除 3 模块 12 个同构直查函数 + 转发链（此前仅 getTrendData 消费）；metrics-registry 42→41（M-D07 并入 M-B03）；全量 2686 用例通过，qms-arch 0 violations。
- 2026-08-17 数据生命周期 P1-P3 落地：审计日志 90 天清理 cron（P1）、保留期规则表 9 条幂等种子（P2）、归档框架（P3：3 业务表归档字段 + daily-archive 任务 + 快照超期清理）；真实库验证全过；全量 2693 用例。
- 2026-08-17 数据生命周期设计成文：docs/data-lifecycle.md——业务口径 10 年保留、审计日志 3 个月、历史只读、到期人工三选一（续留/销毁/导出，未决策自动续留 1 年）；归档选型打标记不拆表；存量数据分批干跑；P1-P5 入待办。
- 2026-08-17 指标治理真实验证（本地库 quality_guard_local_test）：三源口径抽查 100% 一致（External 54→19、Internal 236→2、Commissioning 53→0）；getTrendData 真实执行暴露并修复 SQL 参数化 bug（SELECT 表达式误入 ${} 被当参数绑定 → 全 0，改用 Prisma.sql 片段）；修复后 1月 13380/2月 230012.24/3月 31775 与模拟 SQL 一致；getAllLosses 分页 21 条、在办 8 人正常。
- 2026-08-17 指标治理阶段0-1 落地：指标字典成文（docs/metrics-registry.md + utils/metrics-registry.ts，42 指标 7 族，58 聚合点登记 + 24 豁免点）；门禁 B-MF 挂入 check:qms-arch（新增聚合必须登记 + 文档/代码 ID 一致性校验），存量零 baseline，测试 13/13 全绿。
- 2026-08-17 待办核实闭环：EventEmitter 替换项标记完成（event-bus.ts 已于 d4015f43 删除；售后→供应商评分走 MetricRefreshQueue 持久化队列，报检创建走 Redis pub/sub 跨实例广播 + SSE；全仓库零残留，历史遗留清单清理）。
- 2026-08-17 数据契约自动化收官：命名规则检测落地（B-N1 Boolean is/has 前缀、B-N2 DateTime At 后缀+语义时间例外、B-N3 字段 camelCase；scripts/check-field-naming.mjs 挂入 check:qms-arch，存量 13 处入 baseline 新增即拦截；--changed 模式仅 schema 变更时检查）；顺带修复 B-AUTH2 门禁脚本路径（$ROOT_DIR→$SCRIPT_DIR，修复 fixture 测试 3 个既有失败）；脚本测试 11/11 通过。
- 2026-08-17 业务决策三项：**① 数据范围隔离暂不实施**（代码已就绪，随时可按手册开启）；**② 审批流引擎暂不实施**（需求明确后再启动）；**③ Ai/Reports/ITP 菜单按钮等生产部署回填**（随部署窗口处理）。决策已记录于 PROJECT_STATE 待办 / audit-action-plan / permission-consistency-report / permission-module。
- 2026-08-17 权限模块文档成文：docs/permission-module.md（三层模型/权限码字典/授权组件/门禁/数据范围开启手册/缓存/token/运维脚本/排查表/已知边界），PROJECT_GUIDE 文档地图收录。
- 2026-08-16 修复售后导出按钮权限缺失：3 组前端按钮码缺口（AfterSales/Outsourcing/ProjectDocs Export 等 4 码）补菜单声明+权限表+角色分配。
- 2026-08-16 统一授权框架 Phase 2f（收官）：系统设置/监造/收尾共 51 个写端点迁移+豁免，**B-AUTH1 基线清零（189 个写端点全覆盖）**。
- 2026-08-16 统一授权框架 Phase 2e：迁移报表/派发/车辆/看板/AI 16 个写端点（9 个新权限码+回填），B-AUTH1 基线 70→54。
- 2026-08-16 统一授权框架 Phase 2d：迁移策划全系 26 个写端点（BOM/DFMEA/ITP/检验表单/项目文档），B-AUTH1 基线 96→70。
- 2026-08-16 统一授权框架 Phase 2c：迁移售后/供应商/质量损失/工单 23 个写端点，B-AUTH1 基线 119→96。
- 2026-08-16 统一授权框架 Phase 2：迁移计量/知识库/焊工 21 个写端点（authorizeWrite 声明 + @qgs/shared 权限码枚举），B-AUTH1 基线 140→119。验证：全量 2693 用例、lint/typecheck/qms-arch/docs-drift 全绿。
- 2026-08-16 上传文件类型可配置化：新增 modules/file-storage/upload-policy.ts（上传白名单三级策略：images / images+pdf / images+pdf+office（含 Word/Excel）；默认文档档兼容知识库/表单模板等附件场景，SVG/HTML/宏文档等一律拒绝，脏配置 fail-closed）；file-storage.service 上传流入口按服务端扩展名校验，MIME 不再信任客户端；upload.service 端点将 BusinessError 转标准 400 响应；重建 @qgs/shared dist（ErrorCode 首次真正进入构建产物）；系统设置页（报检与检验设置）新增"上传文件类型"下拉框（仅管理员可改，即时生效）；修复存量 error-code.ts prettier 格式。验证：file-storage 测试 34/34、后端全量 295 文件/2685 用例通过、qms-arch --all 0 violations、eslint/prettier 0 error、typecheck 通过。
- 2026-08-16 定时任务框架（方案 A）实现：新增 modules/scheduler/（cron 表达式解析 + 任务注册表 + 调度执行器）、plugins/cron-scheduler.ts（60s 轮询 + lastRunAt CAS 防重）、cron_jobs 表迁移（20260816120000_add_cron_jobs）；3 个首批任务：metrology.due-reminder（每日 8:00 计量 30 天内到期提醒）、inspection.nc-overdue（每日 9:00 超 7 天未关闭 NC 催办）、supplier.monthly-snapshot（每月 1 日 2:00 全量评分快照）。验证：scheduler 测试 13/13、相关模块回归 108 文件/1186 用例、qms-arch --all 0 violations、docs drift PASSED。设计文档 docs/scheduler-design.md。
- 2026-08-16 知识库四层载体分工成文：PROJECT_GUIDE.md 新增第 11 节（docs 正文 / AGENTS 注入 / skill 按需 / 门禁强制 的执行性分层与放置规则）；qg-project 技能同步索引。验证：docs drift PASSED。
- 2026-08-16 数据契约自动化落地：@qgs/shared 新增 ErrorCode 枚举（9 code + ERROR_UX_LEVEL + isErrorCode）；架构门禁新增 B-EC（BusinessError 错误码白名单，存量 170 处入 baseline）、B-GF（新增跨表 name 字段治理登记，增量检查）、R2（views/qms 禁裸 axios/fetch，存量已 baseline）；新增 scripts/where-field.mjs（六层字段影响面扫描，pnpm run where:field）。验证：check:qms-arch --all PASSED（0 违规）、docs drift PASSED、三项门禁模拟新增违规均正确拦截。
- 2026-08-16 数据契约规范成文：新增 docs/data-contract.md（字段治理登记流程/错误码字典/命名规则/前端消费约束/字段影响面 checklist + 自动化路线图）；CONSTRAINTS.md 追加 15 条数据契约硬约束；PROJECT_GUIDE.md 红线新增第 14 条 + 文档地图收录。验证：docs drift check PASSED。自动化项（ErrorCode 枚举、架构门禁、where:field 脚本）列入待办。
- 2026-08-16 文档体系补齐：为 16 个缺失模块新建 ARCHITECTURE.md（ai/dashboard/data-scope/dept/dictionary/file-storage/knowledge/planning/rbac/report/system/system-log/task-dispatch/user/welder/work-order-requirement），32/32 模块全部具备；docs/architecture.md 标注为历史方案（顶部加对照表，指向 PROJECT_GUIDE）；PROGRESS.md 版本号修正 0.24.0→0.27.0、基线数据改为实测并标注被 PROJECT_STATE 取代。验证：docs drift check PASSED（0 违规、0 提示）。
- 2026-08-16 文档知识库防漂移体系落地：新增 docs/PROJECT_GUIDE.md（规范唯一权威）、PROJECT_STATE.md（自动同步状态日报）、scripts/sync-project-state.sh + scripts/check-docs-drift.sh（挂入 pnpm check / lefthook pre-push）；修正 code_map.md 缺失的 master-data-governance 模块条目；AGENTS.md 增加交接规矩、qg-project 技能改为索引式。验证：docs drift check PASSED（0 违规，16 个模块缺 ARCHITECTURE.md 为提示项）。
- 2026-08-15 v0.27.0 发布（PR #130，tag qgs-v0.27.0）。

## 待办

<!-- AI 维护：从 PROGRESS.md 待办同步，勾选完成的，新增的。 -->

- [x] 文档体系：为缺失 ARCHITECTURE.md 的 16 个模块补齐骨架（ai、dashboard、data-scope、dept、dictionary、file-storage、knowledge、planning、rbac、report、system、system-log、task-dispatch、user、welder、work-order-requirement）
- [x] 修复 docs/architecture.md 中的过时内容（标注为历史方案 + 顶部对照表）
- [x] 同步修正 PROGRESS.md 的版本号（0.24.0→0.27.0）与基线数据（实测 660/293，标注被 PROJECT_STATE 取代）
- [x] 数据契约规范成文（docs/data-contract.md + CONSTRAINTS 15 条 + PROJECT_GUIDE 红线）
- [x] 数据契约自动化：@qgs/shared 建 ErrorCode 枚举
- [x] 数据契约自动化：架构门禁拦 BusinessError 自由字符串错误码（B-EC）
- [x] 数据契约自动化：架构门禁拦未登记跨表 name 字段（B-GF）
- [x] 数据契约自动化：where:field 影响面查询脚本（pnpm run where:field）
- [x] 数据契约自动化：前端禁裸请求门禁（R2）
- [x] 定时任务框架（方案 A）：scheduler 模块 + cron-scheduler plugin + cron_jobs 表 + 3 个首批任务
- [ ] 定时任务框架后续：生产环境启动验证（观察 cron-scheduler plugin 日志与 cron_jobs 落库）
- [ ] 定时任务框架后续：如需更多周期任务（周报生成、数据对账巡检等）按 docs/scheduler-design.md 注册
- [ ] 审批流引擎（方案 B）：通用申请-审批链模块 —— **2026-08-17 业务决策：暂不实施**（需求明确后再启动）
- [ ] 数据范围隔离（Phase 4）—— **2026-08-17 业务决策：暂不实施**（代码已就绪：读路径接入 + audit-data-scope-policies.ts 核查脚本；重新评估时按 docs/permission-module.md §5.2 开启手册执行）
- [ ] Ai/Reports/ITP 权限码菜单按钮补全 —— **2026-08-17 业务决策：等生产部署回填**（随部署窗口一并处理，期间界面分配走脚本回填）
- [x] 数据契约自动化：命名规则检测（P2，B-N1/B-N2/B-N3 门禁 2026-08-17 落地，存量 13 处入 baseline）
- [ ] 完成不合格品项剩余设备验收（真机、实际新增提交、照片上传、分页、草稿、账号切换）
- [ ] 通过正式发布链路执行不合格项责任类型 migration 与 remediation（先 dry-run 审核 OPEN unresolved 清单）
- [x] 生产缺口单统计（2026-08-18 实测）：qms_inspection_requests 4214 条、外部责任 1834 条、缺部门 0 条、未关闭且缺部门 0 条——P2 关闭回归无实际影响，上线条件满足
- [ ] 完成 supplier identity wave 生产回填与健康检查（此前 17 条 PROCESS supplier identity 被错误绕过）
- [ ] 使用已登录业务账号验收秦皇岛吉兴机械制造供应商画像的 7 月 8 日数据
- [ ] 治理售后反馈部门、检验归档、BOM 项目和文档项目剩余的 18 条缺失身份
- [x] 将单进程 EventEmitter 替换为可持久化、跨实例、可重试的事件机制（2026-08-17 核实：event-bus.ts 已删，MetricRefreshQueue 持久化队列 + Redis pub/sub 跨实例广播）
- [x] 上传文件类型可配置化（匿名上传白名单收紧，默认纯图片，可切图片+PDF）
- [x] **指标治理阶段0（2026-08-17 完成）**：指标字典基线——docs/metrics-registry.md 文档登记 + apps/backend/utils/metrics-registry.ts 代码版登记表（**42 指标 7 族**），58 个聚合点全部登记 + 24 个豁免点（序号/行锁/对账/治理工具/监控），文档与代码版 ID 一致（42/42）
- [x] **指标治理阶段1（2026-08-17 完成）**：门禁 B-MF——scripts/check-metric-registration.mjs（新增聚合必须登记 + 文档/代码 ID 一致性校验），挂入 check:qms-arch，存量零 baseline，测试 2 例，全套 13/13；顺带修复 bash 传输层 `$'` 序列截断问题（改写函数避开 ANSI-C quoting）
- [x] **指标治理阶段2（2026-08-17 完成，口径已确认 lossAmount>0 OR isClaim=true）**：质量损失三源聚合收敛——getTrendData 改查 quality_loss_index 物化表（四源口径写入时统一：Internal amount>0 / External、Commissioning isClaim||amount>0 / Manual amount>0）；getDrillDown/getAllLosses 同走 index 表；**删除 3 模块 12 个同构直查函数 + 全部转发链**（inspection-reporting / after-sales-integration / vehicle-commissioning + inspection.service / after-sales.service / exports.ts）；metrics-registry 同步（M-D07 并入 M-B03 删除，42→41 指标）
- [x] **指标治理阶段3（2026-08-17 完成）**：排行收敛——inspection 模块新增轻量 getInspectorActiveTaskCounts（独立文件，避免模块加载循环），user.service 在办量改调统一出口（函数内动态 import 规避 inspection→user 循环依赖）；**quality-loss-trend 判断修正：非死端点**（工作台 dashboard/index.vue 经常量间接调用趋势图），保留
- [x] **指标治理阶段4（2026-08-17 完成，判断修正）**：拆 inspection-reporting.service.ts——3 个跨域函数（getSupplierScoringData/getWelderScoreStats/getWorkOrderAggregateInspections）经数据源核查实为检验域数据（inspections/quality_records），按模块自包含原则留在 inspection 模块，拆至新文件 inspection-score-data.service.ts（报表中心 428→287 行）；InspectionCoreService spread 合并保持转发面不变，消费者零改动；metrics-registry 实现点同步
- [x] **数据生命周期 P1（2026-08-17 完成）**：审计日志自动清理——system-log.audit-cleanup cron（每日 03:00）删除超 90 天 audit_logs/login_logs（分批 ID 列表防锁）；真实库干跑 1556+511 条超期
- [x] **数据生命周期 P2（2026-08-17 完成）**：data_retention_rules 表 + 9 条默认规则幂等种子（业务 3650 天 ARCHIVE×6/审计 90 DELETE/快照 730 DELETE/临时 30 PURGE）；启动时 ensureDefaultRetentionRules
- [x] **数据生命周期 P3（2026-08-17 完成，方案 B 全覆盖）**：归档框架——**7 类业务表全覆盖**（含后补 4 类字段：计量/售后/质量损失/工单）+ **兜底推算**（无标签存量按 createdAt+规则天数自动到期，真实库验证 270 条老工单自动归档/近期数据跳过）；创建链路回填保留（显式优先）；daily-archive cron；快照超期清理；年份查询不过滤归档（§3.5）
- [ ] **数据生命周期 P4**：OSS 冷存储规则 —— **2026-08-17 业务决策：暂缓**（当前存储 6.79GB ≈ 0.8 元/月，转冷仅省 0.6 元/月；且内网免流量费；触发条件：存储量 100GB+ 或账单有感知时，控制台配生命周期规则 5 分钟即可）
- [ ] **数据生命周期 P5**：到期评估界面（到期前 90 天预警 + 续留/销毁/导出三选一 + 未决策自动续留 1 年）
- [x] **可用年份统一服务（2026-08-17 完成）**：docs/available-years.md + YEAR_SOURCES 注册表（7 数据源，含归档）+ /qms/common/years?scopes 接口 + 60s 缓存；前端 useAvailableYears 泛化（scopes/缓存/容错），检验记录页硬编码 [2024,2025,2026] 替换为动态，售后/不合格项/工单传各自 scope（修正数据源错）；真实库验证 2026/2025/2024 合并 ✓
- [ ] 其他待办详见 PROGRESS.md 待办段

---

## 交接检查清单（每个 AI 会话离开前）

- [ ] 硬数据段执行过 `pnpm run docs:sync`（或确认无新增/删除模块、版本未变）
- [ ] 「当前进度」反映实际状态
- [ ] 「最近变更」顶部插入了本次变更
- [ ] 「待办」勾选/新增了对应项
- [ ] `CHANGELOG.md` 已追加记录
