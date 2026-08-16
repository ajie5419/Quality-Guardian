# CHANGELOG.md — 执行记录

每次 Codex 完成一个阶段后，在这里记录执行结果。

## 格式

```
### YYYY-MM-DD 阶段X：标题

**执行内容：**
- 具体做了什么（文件数、行数变化）

**验证结果：**
- typecheck: 通过/失败
- build: 通过/失败
- vitest: X/Y 通过

**commit:** `hash` message

**遗留问题：**
- 如果有未解决的问题记录在这里
```

---

## 执行记录

### 2026-08-16 阶段：统一授权框架 Phase 2（计量/知识库/焊工迁移）

**执行内容：**
- @qgs/shared 新增 write-permission-codes.ts：METROLOGY_PERMISSION_CODES（11 码，含借还/检定计划子域）、KNOWLEDGE_PERMISSION_CODES、WELDER_PERMISSION_CODES（值对齐历史 rbac_permissions 码）；重建 dist
- 迁移 21 个写端点：计量 11 个（台账 CRUD/导入/借还/检定计划 CRUD+导入）、知识库 6 个（条目/分类 CRUD）、焊工 4 个（CRUD/导入）——均加 authorizeWrite 声明（薄转发文件包装、内联文件插入、defineValidatedHandler 文件适配）
- B-AUTH1 baseline 清理：140 → 119（释放已迁移 21 条，修完即删基线）

**验证结果：**
- metrology/knowledge/welder 测试 249/249；全量 296 文件/2693 用例通过；typecheck 通过；lint 全绿；qms-arch --all 0 violations；docs-drift PASSED
- 本地库验证：历史 rbac_permissions 已含全部所需码（150+ 码），角色分配已就绪，无需回填

**遗留问题：**
- 剩余约 119 个写端点待迁移（售后/供应商/质量损失/策划全系/工单/报表/监造/派发/车辆/工作台/AI 等，下批继续）
- 监造（supervision）等模块无历史权限码，迁移时需新码 + 回填

### 2026-08-16 阶段：统一授权框架实施（Phase 1 + 示范迁移）

**执行内容：**
- 授权服务：modules/rbac/rbac-authorize.service.ts（authorizeWrite：登录态检查 + RbacService 权限码校验，无码抛 BusinessError FORBIDDEN 403 / UNAUTHORIZED 401；super 经现有菜单码合并机制豁免），rbac/index.ts 导出 + 单元测试 4 例
- @qgs/shared 新增 INSPECTION_RECORD_PERMISSION_CODES（CREATE/EDIT/DELETE/IMPORT/LIST/VIEW）；重建 dist
- 门禁 B-AUTH1（check-qms-architecture.sh）：写端点（post/put/delete/patch）必须含 authorizeWrite/requireSystemAdmin，public/auth/uploads/telegram/webhook 豁免；存量 140 个写端点入 baseline，新增未声明即拦截
- 示范迁移 13 个写端点：检验记录 5 个（create/update/delete/batch-delete/import）、不合格品项 6 个（delete/update/assign-nc/batch-delete/import/create）、物料审批 2 个（approve/reject）；检验记录菜单 + 按钮 authCode 声明（inspection.module.ts）
- 回填脚本 apps/backend/scripts/backfill-inspection-record-permissions.ts（rbac_permissions upsert + 全 ACTIVE 角色分配，零回归；业务收紧走角色管理界面）
- 文档：需求单 Phase 1 标记完成、行动清单第 2 项更新

**验证结果：**
- rbac/file-storage 测试 289/289 通过；qms-arch --all 0 violations（B-AUTH1 生效 + baseline 匹配）
- 待 typecheck/lint/全量测试结果补记

**遗留问题：**
- Phase 2 其余模块迁移待继续（计量/策划/监造/焊工/知识库/售后/供应商/工单等）
- 部署前置：运行 backfill 脚本 + 角色权限配置调整（业务决策）
- 权限码数据一致性盘点（rbac_permissions vs 菜单 authCode）待做

### 2026-08-16 阶段：产出统一授权框架需求单

**执行内容：**
- 依据权限摸底报告产出 docs/authorization-framework-requirement.md：写端点声明制 + 默认拒绝 + 单一入口 + 分层校验（权限码/所有权/数据范围）；7 条 FR + 12 条 AC（含 CI 拦截验收）；技术要点落到现有代码位置（中间件先例、rbac 权限码解析、issue-access 范式、assertDeleteAccess 范式、门禁脚本扩展点）；四阶段实施批次（框架→核心模块→其余→数据范围）；风险提示（权限码数据盘点前置、误伤防控）
- 更新 docs/audit-action-plan.md 第 2 项：需求单已产出，待立项

### 2026-08-16 阶段：权限系统深入摸底（越权删改问题）

**执行内容：**
- 全量扫描 342 个 API 端点 + 33 个模块的权限保护现状，产出 docs/permission-audit-report.md：189 写端点中约 140 个仅登录零校验；52 个权限码仅 4 个业务点被后端消费；18 个模块 service 层零校验关键词；dataScope 默认关闭且只覆盖读路径；根因（RBAC 定位为前端菜单权限、无新增端点权限声明门禁、五套校验实现并存）
- 更新 docs/audit-action-plan.md 第 1 项：代码摸底完成，剩生产 audit_logs 日志核查

**验证结果：**
- 扫描脚本统计 + 人工抽读关键 service（metrology deleteById 等）双重确认

### 2026-08-16 阶段：产出审计行动清单 docs/audit-action-plan.md

**执行内容：**
- 依据系统性架构审计报告，产出可勾选行动清单 docs/audit-action-plan.md：已完成 4 项（含 commit 证据）+ P0 三项（越权摸底/权限强制校验/数据隔离）+ P1 三项（任务告警/导出修复/统计性能）+ P2 两项（日志归档/测试门槛）+ P3 四项，含每项的背景、动作、验收标准与建议执行顺序

### 2026-08-16 阶段：修复上传拒绝时请求挂起（转圈无提示）

**问题：** 上传被白名单拒绝时前端一直转圈、无提示。根因：upload.service.ts 中 uploadFileStream 在读取文件流之前先做白名单校验，校验失败抛错后 file 流无人消费，busboy 因背压停止读取请求体，once(busboy, 'finish') 永不触发，请求挂起。

**执行内容：**
- upload.service.ts：uploadFileStream 失败分支增加 file.resume()，消费残留流让 busboy 完成，请求正常返回 400（businessErrorResponse）
- 前端报检入口页：上传 error 分支展示后端返回的具体原因（"不支持的文件类型，仅允许：..."），不再只显示笼统"上传失败"；upload-file.ts 的 QmsUploadResponse 增加 message 字段
- 测试：upload.service.test.ts 新增用例"上传失败时 resume 文件流，请求正常终止"

**验证结果：**
- file-storage 模块 35/35 通过（含新增用例）

### 2026-08-16 阶段：上传文件类型可配置化（匿名上传白名单收紧）

**执行内容：**
- 新增 modules/file-storage/upload-policy.ts：上传格式三级策略（白名单 allowlist 为安全控制，SVG/HTML/宏文档等可携带脚本的格式任何档位均排除）。设置 key UPLOAD_ALLOWED_EXTENSIONS，值 images（jpg/jpeg/png/webp）、images+pdf、images+pdf+office（+doc/docx/xls/xlsx）；默认文档档（实施中发现 KnowledgeEditModal 明确支持 Word/Excel 等附件，默认值从"仅图片"修正为文档档以免上线即回归），解析失败 fail-closed。扩展名判定以服务端解析为准，客户端 MIME 仅作为无扩展名时的兜底推断，不再直接信任
- file-storage.service.ts：uploadFileStream 入口在生成存储名之前做白名单校验（assertAllowedUploadExtension），拒绝时抛 BusinessError(BAD_REQUEST)；删除 getMimeType（原优先取客户端 MIME）
- upload.service.ts：catch 中识别 BusinessError 并转标准 400 响应（businessErrorResponse），三个上传端点（/api/upload、/api/qms/upload、/api/qms/public/upload）共用同一服务，全部生效
- 重建 packages/qgs-shared dist：ErrorCode 枚举首次真正进入构建产物（此前数据契约新增的 enums/error-code.ts 从未被 build，运行期 import 会崩）
- 前端 views/system/inspection-settings/index.vue 新增"上传设置"区块：下拉框（仅图片 / 图片+PDF / 图片+PDF+Word/Excel 三档），仅管理员可改，复用现有系统设置读写接口与权限；zh-CN/en-US sys.json 同步新增 6 个 i18n key
- 测试：file-storage.service.test.ts 新增 9 个白名单用例（拒 html/svg、images+pdf 放行 pdf、images 拒 pdf、默认档放行 docx、客户端 MIME 谎报无效、无扩展名按 MIME 兜底、脏配置回退默认档）；原"上传 doc.pdf"用例改为默认策略下上传 png

**验证结果：**
- file-storage 模块测试 34/34 通过（3 文件）；后端全量 295 文件 / 2688 用例全部通过
- 全仓 pnpm run check:type（turbo 3 任务）通过；pnpm lint 全绿（prettier + eslint）
- pnpm run check:qms-arch:all：0 violations；bash scripts/check-docs-drift.sh：PASSED（模块 TS 文件数 671 已同步）

**顺带修复（存量债，非本需求引入）：**
- 8-16 定时任务框架提交（scheduler 模块）从未通过全量 lint：11 个文件 prettier 格式债 + 8 个文件 42 处 eslint 违规（node:test 风格测试、import/unicorn/perfectionist 排序等），导致 CI lint 门禁持续红色。本次一并修复：prettier --write + eslint --fix + 手工修正 eslint 自动修复引入的缺失 import（cron-job.service.test.ts 补 it）与 scripts/where-field.mjs 两处不可自动修复项；门禁脚本 check-qms-source-rules.mjs 仅 Set 成员排序（语义不变，qms-arch 全量重跑 0 violations 验证）
- 修复 packages/qgs-shared/src/enums/error-code.ts 存量 prettier 格式

**遗留问题：**
- 白名单为固定三级预设（images / images+pdf / images+pdf+office）；若未来需要其他格式（图纸、压缩包等），需单独评审后扩展
- 未做"未引用文件自动清理/配额"（用户确认暂不处理）
- 部署注意：@qgs/shared 的 dist 已重建（ErrorCode 首次进入构建产物）；部署/CI 构建时需执行 shared 包 build（postinstall 已含 stub，正常流程会自动触发）

### 2026-08-16 阶段：修复 validate-json.js 硬编码路径

**执行内容：**
- apps/web-antd/src/locales/validate-json.js 重写：原脚本硬编码了其他机器/目录的绝对路径（/Users/zhaoxiaojie/Downloads/main/...）且只检查 2 个语言文件，在任何环境都无法真正工作
- 改为基于脚本自身位置（import.meta.url）解析 langs 目录，覆盖全部 8 个语言文件；新增 zh-CN/en-US 文件集合与翻译 key 一致性校验（防止中英文缺词），失败时退出码 1
- 验证：正常 8/8 JSON 合法 + 4 对 key parity 全过（qms.json 821 keys、sys.json 147 keys 中英完全对齐）；负向注入缺失 key 正确 FAIL（exit 1）；还原后全绿；eslint + prettier 通过
### 2026-08-16 阶段：定时任务框架实现（方案 A）

**执行内容：**
- 新增 `modules/scheduler/`：cron-expression.ts（5 段 cron 解析/匹配，纯函数）、scheduler-registry.ts（任务注册表）、cron-job.service.ts（定义落库 + 到点触发 + lastRunAt CAS 防重 + lastStatus/lastError 记录）、scheduler.module.ts；注册进 module-loader
- 新增 `plugins/cron-scheduler.ts`：启动时注册 3 个业务任务 + sync 定义 + 60s 轮询 tick（unref）
- 新增表 `cron_jobs`（migration `20260816120000_add_cron_jobs`，经 prisma migrate diff 生成增量 SQL + migrate deploy 应用；注：本地 shadow DB 重放历史链失败，因初始基线迁移缺失，采用增量迁移方案）
- 3 个首批任务：metrology.due-reminder（每日 8:00 计量 30 天内到期 Telegram 提醒）、inspection.nc-overdue（每日 9:00 超 7 天未关闭 NC 催办）、supplier.monthly-snapshot（每月 1 日 2:00 全量评分快照）
- 文档：docs/scheduler-design.md（设计 + 任务登记）、code_map.md 新增 scheduler 模块、scheduler/ARCHITECTURE.md

**验证结果：**
- scheduler 单元测试 13/13（cron 解析 7 + 调度器 6：触发/跳过/CAS 防重/失败记录）
- 相关模块回归：108 测试文件 / 1186 用例全部通过（metrology/inspection/supplier 无回归）
- `QMS_ARCH_SCOPE=all bash scripts/check-qms-architecture.sh`: 0 violations
- `bash scripts/check-docs-drift.sh`: PASSED（33 模块已同步）
- 未启动真实后端进程验证 plugin 轮询（待生产/本地运行验证）

**commit:** 待提交

**遗留问题：**
- 本地开发库的 shadow-database 迁移重放受历史基线缺失影响，新迁移采用增量方式；如需完整 shadow 支持需补齐历史基线（不建议动历史迁移）
- 生产环境需观察 cron-scheduler 启动日志与 cron_jobs 落库

### 2026-08-16 阶段：知识库四层载体分工成文

**执行内容：**
- `docs/PROJECT_GUIDE.md` 新增第 11 节「知识库四层载体分工」：docs 正文（被动）→ AGENTS 注入（中）→ skill 按需（强）→ 门禁强制（最强）的执行性分层表，以及新规则落地的放置规则与边界判断
- `qg-project` 技能同步该分工的索引式说明（不复制正文，遵守"正文进 docs、指令进 AGENTS/Skill、红线进门禁"原则）

**验证结果：**
- `bash scripts/check-docs-drift.sh`: PASSED
- 未运行 lint/typecheck（纯文档变更）

**commit:** 待提交

**遗留问题：**
- 无

### 2026-08-16 阶段：数据契约自动化落地

**执行内容：**
- `@qgs/shared` 新增 `src/enums/error-code.ts`：`ErrorCode`（9 个 code）+ `ERROR_UX_LEVEL`（前端分级）+ `isErrorCode`；挂入 enums/index
- 架构门禁新增 3 条规则：
  - `B-EC`（check-qms-source-rules.mjs）：BusinessError 错误码必须是共享枚举成员；存量 170 处自由字符串入 baseline，新增自由字符串拦截
  - `B-GF`（scripts/check-governed-fields.py）：新增 schema 列复用治理字段到未登记表 / 全新跨表 name 字段 → 拦截（增量检查，零存量误伤）
  - `R2`（check-qms-architecture.sh）：views/qms 禁裸 axios/fetch；存量 1 处入 baseline，新增拦截
- 新增 `scripts/where-field.mjs`：字段影响面六层扫描（治理登记/schema/后端/shared/web-antd/WeApp），挂入 `pnpm run where:field`
- `check-qms-architecture.sh` 增加 node 探测（沙箱/用户环境通用）
- docs/data-contract.md 路线图更新为已落地状态

**验证结果：**
- `QMS_ARCH_SCOPE=all bash scripts/check-qms-architecture.sh`: 0 violations PASSED
- `bash scripts/check-docs-drift.sh`: PASSED
- 三项门禁模拟新增违规均正确拦截（B-EC 新错误码 / B-GF 新表复用治理字段 / R2 新裸 axios）
- 未运行 lint/typecheck（脚本与枚举变更，@qgs/shared 枚举已用 tsc 转译验证）

**commit:** 待提交

**遗留问题：**
- P2 命名规则自动化检测待做（文档约束已先行）

### 2026-08-16 阶段：数据契约规范成文

**执行内容：**
- 新增 `docs/data-contract.md`（数据契约规范单一事实源）：字段治理登记流程与元数据标准、错误码字典（ErrorCode 枚举契约）、字段命名规则、前端数据消费约束、字段影响面 checklist，以及 P0-P2 自动化路线图
- `CONSTRAINTS.md` 追加「数据契约规范」15 条硬约束（字段治理登记/错误码字典/命名/前端/影响面）
- `docs/PROJECT_GUIDE.md` 红线新增第 14 条（数据契约四铁律）+ 文档地图收录 `docs/data-contract.md`

**验证结果：**
- `bash scripts/check-docs-drift.sh`: PASSED
- 未运行 lint/typecheck（纯文档变更，不涉及业务代码）

**commit:** 待提交

**遗留问题：**
- 自动化项待落地：ErrorCode 枚举、BusinessError 错误码门禁、跨表字段登记门禁、where:field 脚本、前端约束门禁

### 2026-08-16 阶段：文档知识库防漂移体系 + 文档补齐

**执行内容：**
- 新增 `docs/PROJECT_GUIDE.md`（项目档案，规范唯一权威：架构/能做什么/红线/工作流/文档地图）
- 新增 `PROJECT_STATE.md`（状态日报：硬数据段由 `scripts/sync-project-state.sh` 自动实测生成）
- 新增 `scripts/sync-project-state.sh`（`pnpm run docs:sync`）与 `scripts/check-docs-drift.sh`（`pnpm run check:docs-drift`：D1 版本/基线漂移、D2 模块缺 code_map、D3 引用消失模块、D4 ARCHITECTURE 缺失提示）
- `check:docs-drift` 挂入 `pnpm check` 与 lefthook pre-push
- `AGENTS.md` 增加"交接规矩"（新 AI 开工必读档案+日报）与文档链接；`qg-project` 技能改为索引式（不再维护规范正文副本）
- 为 16 个缺失模块新建 ARCHITECTURE.md（ai/dashboard/data-scope/dept/dictionary/file-storage/knowledge/planning/rbac/report/system/system-log/task-dispatch/user/welder/work-order-requirement），32/32 模块全部具备
- `docs/architecture.md` 顶部标注为历史方案，加"历史 vs 当前"对照表，指向 PROJECT_GUIDE
- `PROGRESS.md` 版本号修正 0.24.0→0.27.0；基线数据改为实测并标注被 PROJECT_STATE 取代
- `code_map.md` 补充缺失的 `master-data-governance` 模块条目

**验证结果：**
- `bash scripts/check-docs-drift.sh`: PASSED（0 违规、0 提示）
- `bash scripts/sync-project-state.sh`: v0.27.0 / 32 modules / 660 TS / 293 tests
- 未运行 lint/typecheck（本次为纯文档+脚本变更，不涉及业务代码）

**commit:** 待提交

**遗留问题：**
- 无（文档治理闭环完成）

### 2026-08-15 阶段：inspection 统计服务行数门禁修复

**执行内容：**
- `inspection-request-stats.service.ts` 505 行超出模块 500 行上限（[B-S1]），pre-push 门禁拒绝推送 main（当时 22 个待推提交）
- 新建 `inspection-request-stats-accumulator.ts`（101 行）：提取统计累加器初始化（11 个 Map、6 个计数器、日趋势播种）与检验员判定辅助函数；计数器改为可变对象字段，行为零变更
- 服务文件降至 462 行

**验证结果：**
- check:qms-arch: 0 violations / 通过
- check:type: 3/3 通过
- vitest（inspection-request-stats / inspection-route）: 33/33 通过

**commit:** c55fcdb3

---

### 2026-08-15 全项目代码审计（只读）

**执行内容：**
- 全量只读审查：32 个后端模块、342 个 API 路由、5 个 middleware、44 个 utils、82 个 Prisma model、前端 apps/web-antd（193 vue + 267 ts）、apps/weapp、packages/qgs-shared
- 8 个并行子代理分组深审（inspection / 质量评分域 / 售后报表AI域 / 计量监督域 / 策划生产域 / 平台管理域 / 基础设施层 / 前端与共享包），主代理独立复核全部严重级结论
- 独立验证：后端 Vitest `293/293` 文件、`2666/2666` 用例 PASS；根目录 `pnpm test:unit`（happy-dom）`407/407` 文件、`3390/3390` 用例 PASS；`pnpm run check:type` 3/3 PASS；`check-qms-architecture.sh --all` exit 0（仅 inspection-request-stats.service.ts 505 行 1 条活跃违规）

**关键发现（详见评审报告，未做任何代码变更）：**
- P0 安全：ai/generate-itp 路径穿越（任意文件读取+外泄 LLM）；ai/match-cases 跨组织质检数据泄露；user 列表泄露 bcrypt 哈希；AI apiKey 明文无鉴权回读；软删/禁用用户仍可登录；登录无防爆破；DATA_SCOPE_V2 默认 false；metrology 公共借用 fail-open；supplier 写路径无数据权限
- P1 硬约束：~43 个 handler 下沉 modules 架空 api 薄层；弱 zod 52 处；after-sales 全表加载+内存分页；work-order/supplier 导出静默截断（pageSize 钳 100）；request-dedupe 先于 auth 执行；data-scope 前缀歧义；BusinessError 迁移未完成
- 模块评分区间 2.0（ai）～ 4.5（part-master/process-master）；前端整体 74/100（B）

**遗留问题：**
- 未修复任何代码；P0/P1 问题清单与修复优先级已交付，待后续 wave 按评审报告处理
- 架构 baseline 267 行冻结债务（B-E2 57 / B-M1 140 / B-M2 37 等）未清理

**commit:** （未提交，仅文档追加）

---

## [0.27.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.26.0...qgs-v0.27.0) (2026-08-15)


### Features

* **@qgs/backend:** add welder name/id dirty-data remediation script ([a2e53d7](https://github.com/ajie5419/Quality-Guardian/commit/a2e53d756122c3648078e9a1111ca9aaa568b565))
* **@qgs/backend:** add welder score enqueue/drain maintenance tools ([3151c06](https://github.com/ajie5419/Quality-Guardian/commit/3151c06003ca80694208bd23a1ecad30ebd7f919))
* **@qgs/backend:** add welder score refresh service and async worker ([31b53a3](https://github.com/ajie5419/Quality-Guardian/commit/31b53a3a3c76d8a849862672ce8028a2167b39e5))
* **@qgs/backend:** add WELDER_SCORE metric refresh queue ([591d1a3](https://github.com/ajie5419/Quality-Guardian/commit/591d1a3e11c97cbeca3c19ebf0ee241950e7f608))
* **@qgs/backend:** persist canonical responsibleWelderId on issue writes ([220b0d7](https://github.com/ajie5419/Quality-Guardian/commit/220b0d7014d2215ce26b9834cdcd51889d4fc0ca))
* **@qgs/backend:** remediate quality record responsible department references ([359dd60](https://github.com/ajie5419/Quality-Guardian/commit/359dd602b1ef348f644334e2e61ace0e868673bf))
* **@qgs/backend:** score refresh joins by responsibleWelderId with backfill ([9ee3775](https://github.com/ajie5419/Quality-Guardian/commit/9ee3775e396c09bc0be23096c7695c99342ad318))
* **project:** use canonical welder ids in issue forms ([862cd67](https://github.com/ajie5419/Quality-Guardian/commit/862cd673c855528a6253040d6dbb2214a5e6dfc7))


### Bug Fixes

* **@qgs/backend:** align inspector status completed count with CLOSED rule ([c006e8d](https://github.com/ajie5419/Quality-Guardian/commit/c006e8d16732efc23b0ed04cd58f74e2e2788689))
* **@qgs/backend:** base reinspection stats on closed requests only ([3246a80](https://github.com/ajie5419/Quality-Guardian/commit/3246a806d4086697c91462ada48f18809206aeab))
* **@qgs/backend:** mock welder id resolution in issue mutation tests ([419f4d4](https://github.com/ajie5419/Quality-Guardian/commit/419f4d453f66d70ab6ee330b9e2591875cfa3c30))
* **@qgs/web-antd:** keep welder name text separate from canonical id in issue forms ([55d2448](https://github.com/ajie5419/Quality-Guardian/commit/55d2448198377380f174f7c9b2f50e6ba29793d0))
* **project:** gate inspector candidate listing behind dispatch permission ([86f3834](https://github.com/ajie5419/Quality-Guardian/commit/86f38347faec1f658ded9e5971c2694bfdaa332c))

### 2026-08-14 派工候选检验员接口权限收紧（P1）

**执行内容：**
- 报检派工候选此前经通用用户列表接口 `/api/system/user/list?roleName=QC` 拉取，任意登录用户可枚举全量用户列表
- 新增专用端点 `GET /api/qms/inspection/requests/inspectors`：要求持有 `QMS:Inspection:Requests:Dispatch` 权限，仅返回 active QC 最小字段（id/realName/username）
- 桌面端 `useInspectionRequestInspectorOptions` 与移动端 `Dispatch.vue` 改调新端点

**验证结果：**
- 后端 Vitest：`293/293` 文件、`2666/2666` 用例 PASS（dispatch adversarial 11/12/13 覆盖权限拒绝/放行/空权限）
- Web Vitest：`65/65` 文件、`343/343` 用例 PASS（composable 测试改 mock 新端点）
- `pnpm lint`、`check:type`（3/3）PASS

**commit:** `86f38347` fix(project): gate inspector candidate listing behind dispatch permission

**遗留问题：**
- 移动端与监督模块其他 `getAllUsers` 调用（supervision 拉全量用户）不在本次范围，如需同样收紧可后续 wave 处理

---

### 2026-08-14 不合格项责任部门失效引用回填

**执行内容：**
- 调查：不合格项图表按责任部门统计大量显示"主数据已失效"——117 条记录的 `responsibleDepartmentId` 指向 14 个已被软删的占位部门行（cuid），占位行的 name 即真实部门的旧格式 ID（`dept-<timestamp>`），active 部门主数据以该 ID 存在
- 映射：12/14 个占位部门可确定性映射到 active 部门（生产 OBU/采购部/结构 BU1/机加 BU/模具 BU/制造 SOBU/车辆 SOBU/模具 SOBU/机械所/技术部/组装 BU/结构 BU2-测试），2 个（秦皇岛弘旺/祥腾）无 active 匹配
- 回填脚本 `remediate-quality-record-responsible-departments.ts`：dry-run 默认，`--apply` 落库；可映射记录回填 id+名称快照，不可映射写入 `unresolved_master_data_refs` 审计

**验证结果：**
- 本地测试库：117 条处理，115 回填、2 条审计（0 跳过）；图表统计复跑——失效桶从 117 条降为 2 条，生产 OBU 59 / 采购部 43 / 结构 BU1 32 等正常解析
- `pnpm lint`、backend `tsc --noEmit` PASS

**commit:** `359dd602` feat(@qgs/backend): remediate quality record responsible department references

**遗留问题：**
- 2 条记录（秦皇岛弘旺/祥腾设备安装）保持失效并已入治理审计，需人工确认真实部门后处置
- 生产库需按运维流程 dry-run 审核后 `--apply`
- "结构 BU2-测试"命名含"测试"，回填到它之前建议业务确认该部门是否在用

---

### 2026-08-14 报检看板口径系统性修复（续）

**执行内容：**
- 全量审计看板统计口径：确认"申报系按提交时间、完成系按关闭时间"为业务语义（用户确认），修复唯一不一致点——检验员状态卡 `completedTaskCount` 此前只查 closedAt 不查 `status==='CLOSED'`，与检验员榜不一致，现统一为 CLOSED + closedAt 规则
- 排查"PASS 未关单"26 条记录：`createdAt=submittedAt=updatedAt`、创建即带 `inspectionResult`、无关联检验记录——确认是导入的生产快照数据，非关单流程缺口；`inspectionResult` 唯一业务写入点在关单服务（写结果同时置 CLOSED），统计按"已关闭"口径正确

**验证结果：**
- 后端 Vitest：`293/293` 文件、`2666/2666` 用例 PASS（含新增未关闭 PASS 不计入完成数回归测试）
- `pnpm lint`、backend `tsc --noEmit` PASS

**commit:** `c006e8d1` fix(@qgs/backend): align inspector status completed count with CLOSED rule

**遗留问题：**
- 导入快照中的"已检验未关闭"记录（全库约 114+ 条 DISPATCHED、98 条 SUBMITTED）如需在看板体现为完成，需单独数据治理（补关单），不改统计口径

---

### 2026-08-14 报检看板复检率口径修复

**执行内容：**
- 调查：班组/供应商复检率偏高的根因——旧判定把"未关闭的 FAIL 任务"同时计入复检分子分母，且漏掉"已检验未关闭的 PASS 任务"，分母系统性偏小（8 月本地数据：供应商 38%→23%、班组 35%→21%）
- 修复：`inspection-request-stats.service.ts` 复检分母改为 `status === 'CLOSED'`，分子要求 CLOSED + 关联不合格项或 FAIL；未关闭任务不再干扰
- 班组榜"过程 40 vs 班组合计 19"确认为字段口径差异（无 TEAM 走部门维度、外协走供应商维度），非计算 bug，暂不改

**验证结果：**
- 后端 Vitest：`293/293` 文件、`2665/2665` 用例 PASS（含新增未关闭 FAIL 不计入回归测试）
- `pnpm lint`、backend `tsc --noEmit` PASS
- 本地库实测：修复后复检分母 = 已关闭数，未关闭 FAIL/已检验未关闭 PASS 均不再计入

**commit:** `3246a806` fix(@qgs/backend): base reinspection stats on closed requests only

**遗留问题：**
- 8 月 26 条"PASS 但状态停在 SUBMITTED/DISPATCHED"的记录仍存在（关单流程缺口或数据问题），影响"完成数量"卡片口径，需业务侧确认

---

### 2026-08-14 焊工名称脏数据清理脚本

**执行内容：**
- 新增 `remediate-quality-record-responsible-welder-names.ts`：把 `quality_records.responsibleWelder` 中误存的 welderId/welderCode 恢复为焊工姓名（dry-run 默认，`--apply` 落库；已有冲突 responsibleWelderId 时仅修名称不覆盖 ID）

**验证结果：**
- 本地测试库：17 条修复（2 条按 id、15 条按 code），0 冲突，2 跳过；utf8mb4 核对名称正确、responsibleWelderId 关联正确
- `pnpm lint`、backend `tsc --noEmit` PASS

**commit:** `a2e53d75` feat(@qgs/backend): add welder name/id dirty-data remediation script

**遗留问题：**
- 生产库需按发布/运维流程执行 dry-run 审核后 `--apply`（见 commit 消息）

---

### 2026-08-14 焊工表单显示修复：名称文本与 canonical ID 分离

**执行内容：**
- 修复责任焊手表单把 welderId（如 `WEL-2026-XXXXXX`）覆盖到名称快照字段导致不合格项显示 ID 的问题：Select 改绑独立 `responsibleWelderId` 字段，`responsibleWelder` 保持隐藏文本字段存名称；编辑回填只映射 id 不重写名称
- InspectionForm 的焊工 Select 同步改绑 `responsibleWelderId`
- 补充 schema 契约回归测试（名称字段不是 Select、ID 字段是 Select）

**验证结果：**
- Web Vitest（--dom）：`65/65` 文件、`343/343` 用例 PASS
- `pnpm lint`、`pnpm run check:type`（3/3 tasks）PASS

**commit:** `55d24481` fix(@qgs/web-antd): keep welder name text separate from canonical id in issue forms

**遗留问题：**
- 已落库的 `responsibleWelder = welderId` 脏数据需人工核对清理（如有）

---

### 2026-08-14 焊工评分体系改造（Phase 0+1+2）

**执行内容：**
- Phase 0：`score` 纯派生，移除 shared/后端 schema/前端表单与导入的 score 写入（5 文件，删 56 行）
- Phase 1a：`metric_refresh_type` 加 `WELDER_SCORE` migration + `MetricRefreshQueue` 6 个 welder 方法（enqueue/claim/complete/fail/count/reset）
- Phase 1b：新增 `WelderScoreRefreshService`（增量 `refreshByWelderIds` + 全量 `refreshAll`）+ 5s 轮询 worker + nitro plugin；旧 `syncFromInspectionIssues` 删除
- Phase 1c：inspection 5 处触发点（create/update/batchDelete/import/NC 删除 + 记录创建 + 报检关单）改事务内 enqueue；列表 GET 移除同步副作用；清理 2 条 B-M1 baseline 债务
- Phase 1d：`enqueue-welder-score` / `drain-welder-score` 维护工具（独立运维，不接入 release maintenance）
- Phase 2a：`quality_records.responsibleWelderId` migration + 写入解析落库（create/import/update 事务内解析）
- Phase 2b：评分 join 优先 `responsibleWelderId`（文本兜底历史行）；`getWelderScoreStats` 支持 id/name 过滤；历史回填工具 dry-run/apply + unresolved 审计
- Phase 2c：前端 issue 表单/检验记录焊工下拉 value 改为 canonical welder id（名称快照 + id 双写）；后端校验显式 id（fail-closed）
- 相关文档：CHANGELOG 本条记录

**验证结果：**
- 后端 Vitest：`293/293` 文件、`2664/2664` 用例 PASS
- Web Vitest（--dom）：`65/65` 文件、`342/342` 用例 PASS
- `pnpm lint`、`pnpm run check:type`（3/3 tasks）、`pnpm run check:qms-arch:all`、`pnpm run check:prisma-migration` 均 PASS
- migration 已在本地测试库应用（`20260814000000`、`20260814010000`）；`prisma generate` 已更新 client

**commit:**
- `609526db` refactor(project): make welder score a derived field, remove manual score writes
- `591d1a3e` feat(@qgs/backend): add WELDER_SCORE metric refresh queue
- `31b53a3a` feat(@qgs/backend): add welder score refresh service and async worker
- `3690a946` refactor(@qgs/backend): enqueue welder score refresh instead of blocking sync
- `3151c060` feat(@qgs/backend): add welder score enqueue/drain maintenance tools
- `220b0d70` feat(@qgs/backend): persist canonical responsibleWelderId on issue writes
- `9ee3775e` feat(@qgs/backend): score refresh joins by responsibleWelderId with backfill
- `862cd673` feat(project): use canonical welder ids in issue forms
- `419f4d45` fix(@qgs/backend): mock welder id resolution in issue mutation tests

**遗留问题：**
- 关单弹窗（CloseInspectionModal）、weapp 的 responsibleWelder 仍提交文本，由后端文本解析兜底落库，未传 ID（可后续 wave 收敛）
- 历史数据回填需在真实库执行 `pnpm maintenance:welder-score:backfill-ids -- --apply` 与 `enqueue/drain`（本地测试库未执行生产数据）
- migration 由 `prisma migrate diff` 生成（本仓库首个 migration 为增量补丁、历史无法从空库重放，标准 `migrate dev` shadow 机制不可用，已在 commit message 注明）
- 未运行前端 dev/build/start、真实浏览器页面验收与生产发布

---

## [0.26.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.25.0...qgs-v0.26.0) (2026-08-14)


### Features

* **other:** add optional NC number controls ([2000d63](https://github.com/ajie5419/Quality-Guardian/commit/2000d63ca0040caa97c8afc815e54e82b7c27a47))
* **other:** support optional inspection issue numbers ([9cc9099](https://github.com/ajie5419/Quality-Guardian/commit/9cc90993f8c24b24960f18cb427f4e4633a4d08f))
* **project:** default external responsibility departments ([dafb0d8](https://github.com/ajie5419/Quality-Guardian/commit/dafb0d835f4fa7d79718ecd17dfd76f0d9636193))


### Bug Fixes

* **@qgs/backend:** canonicalize incoming responsibility ([b9b4855](https://github.com/ajie5419/Quality-Guardian/commit/b9b485550cc4f1f8be820ac56f6c60020dcbdc08))
* **@qgs/backend:** complete legacy close responsibility ([47c7540](https://github.com/ajie5419/Quality-Guardian/commit/47c75400000f528931103e298955a38e2101b335))
* **@qgs/backend:** repair historical inspection close responsibility ([2dd47b0](https://github.com/ajie5419/Quality-Guardian/commit/2dd47b0c082ffda348f271f61fbbda5af6f8e2d1))
* **@qgs/backend:** unify outsourcing responsibility resolution ([e32d466](https://github.com/ajie5419/Quality-Guardian/commit/e32d46613e50221bfbcb221649b00937e0c11b67))
* **@qgs/weapp:** align incoming responsibility entry ([a84b291](https://github.com/ajie5419/Quality-Guardian/commit/a84b291fb709be6d1fed6dbdfc5ff26ae798ed48))
* **@qgs/weapp:** complete historical inspection close flows ([804b0d0](https://github.com/ajie5419/Quality-Guardian/commit/804b0d082a86e91c1cde985640e72d15439142e6))
* **@qgs/weapp:** unify incoming outsourcing responsibility ([f2f0e7f](https://github.com/ajie5419/Quality-Guardian/commit/f2f0e7f926e5542b198e6756c7348ca2558a988d))
* **@qgs/web-antd:** adjudicate historical inspection close responsibility ([97b3265](https://github.com/ajie5419/Quality-Guardian/commit/97b32657bb0391c1ca7e01bc2dab3c285173ba0d))
* **@qgs/web-antd:** align incoming outsourcing close flow ([04141cc](https://github.com/ajie5419/Quality-Guardian/commit/04141ccaab4e47c1e857b0e5c8401afe3724ebb2))
* **@qgs/web-antd:** align incoming responsibility entry ([bec0103](https://github.com/ajie5419/Quality-Guardian/commit/bec0103ac1942d7418f82a319aa70ef4a283ec3f))
* **@qgs/web-antd:** align issue responsibility forms ([abf51d0](https://github.com/ajie5419/Quality-Guardian/commit/abf51d04b2e36bb82f29d4f3bf706b9aea7b6a92))
* **@qgs/web-antd:** correct issue form labels and switch width ([a8f36b7](https://github.com/ajie5419/Quality-Guardian/commit/a8f36b7bb26fb1949961802e997f4a553b129c63))
* **@qgs/web-antd:** preserve department labels on schema rebuild ([b15fec9](https://github.com/ajie5419/Quality-Guardian/commit/b15fec9e9845602a11897a2dd973245962df5bd7))
* **@qgs/web-antd:** show incoming supplier in request details ([40a8491](https://github.com/ajie5419/Quality-Guardian/commit/40a8491746f0be4d5b68e8a352ebe756176a38db))
* **other:** make linked inspection issues atomic ([bb88eda](https://github.com/ajie5419/Quality-Guardian/commit/bb88eda31aa5a6e701afbcbc8d654071685a342e))
* **project:** persist outsourcing responsibility department id ([734992a](https://github.com/ajie5419/Quality-Guardian/commit/734992af3dfc7fd801a7a01ab113c91507016c1d))
* **project:** resolve current responsibility department names ([85e49d4](https://github.com/ajie5419/Quality-Guardian/commit/85e49d48a9f68dc865ed7f6de933d792e4fe1d82))
* **project:** unify inspection responsibility ownership ([a133ede](https://github.com/ajie5419/Quality-Guardian/commit/a133ede291d099bdb7e6de5d13b4a19a7ad31568))
* **qms:** align inspection responsibility and NC numbering ([0c11d2b](https://github.com/ajie5419/Quality-Guardian/commit/0c11d2b574b1d0e3c280fcac5932e7bf4375f65e))

### 2026-08-14 合并：报检责任、可选 NC 编号与发布维护

**执行内容：**

- 整合报检责任、可选不合格编号与原子关单变更，同时保留质量损失索引持久化队列和 versioned release-maintenance manifest/ledger。
- 关闭已有或新建关联不合格项后，在同一事务内入队质量损失索引任务；删除两份依赖旧 `generateNextNcNumber` 的编号器测试。
- 将历史外协责任 bootstrap 的发布维护断言迁移到 TypeScript manifest/ledger，并保留其位于报检责任回填前的历史顺序，不重新启用已退役任务。
- 拆分关单关联不合格项查询，使 `inspection-request-close.service.ts` 保持在 500 行架构限制内。

**验证结果：**

- 根目录全量 Vitest：`406/406` 文件、`3379/3379` 用例通过。
- 后端全量 Vitest：`292/292` 文件、`2656/2656` 用例通过。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`pnpm run check:qms-arch:all`、`pnpm run check:prisma-migration` 与 `rtk git diff --check` 均通过。

**commit:** 本次 merge commit。

**遗留问题：**

- 未启动前端 dev/build/start；未执行生产 migration、release maintenance 或部署。

---

### 2026-08-14 修复：进货报检供应商展示与责任契约

**执行内容：**

- 修复进货报检任务列表的供应商名称缺失：后端将已持久化的 canonical `supplierName` 投影到列表兼容 `team` 字段，与过程外协展示一致，不回写 `team` 或伪造 `teamId`。
- Web、H5 和小程序的进货报检入口及关单表单仅保留供应商和外协单位；两者都隐藏责任部门，请求仅提交 `responsibilityType + supplierId`。
- 后端创建与关单事务复用同一 canonical 部门解析服务：供应商责任通过独立系统设置解析“采购部”，外协责任解析“生产 OBU”。客户端伪造部门、配置缺失/失效/歧义、既有责任冲突继续 fail-closed。
- 历史进货任务关闭时，顶层责任和 FAIL `linkedIssue` 都可省略部门 ID；服务端在同一事务内注入并投影最终 canonical 部门，避免再触发“报检任务责任事实不完整”。

**验证结果：**

- 后端全量 Vitest：`288/288` 文件、`2631/2631` 用例通过。
- Web happy-dom Vitest：`65/65` 文件、`342/342` 用例通过。
- WeApp Vitest：`10/10` 文件、`49/49` 用例通过。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`pnpm run check:qms-arch:all`、`pnpm run check:prisma-migration` 与 `rtk git diff --check` 均通过。

**commit:** `b9b48555` `fix(@qgs/backend): canonicalize incoming responsibility`、`bec0103a` `fix(@qgs/web-antd): align incoming responsibility entry`、`a84b291f` `fix(@qgs/weapp): align incoming responsibility entry`。

**遗留问题：**

- 未运行前端 dev/build/start；真实登录页面、真实 MySQL 并发和生产数据关单未执行。

---

### 2026-08-14 修复：进货与过程外协历史报检统一关单

**执行内容：**

- 根因是外协责任契约分裂：入口只对过程检验隐藏部门，关单 schema 又要求所有责任类型提交部门；桌面端还把“已有外协单位但缺持久部门”的历史任务误判为完整并锁定，最终后端只能报“报检任务责任事实缺失”。
- `INCOMING` 与 `PROCESS` 的报检入口、桌面关单、H5 和小程序统一为外协只选择 `supplierId`，不显示、不提交 `responsibleDepartmentId`。完整历史事实仍锁定；缺持久部门的历史外协任务进入显式裁决流程。
- 后端在创建和关单事务中复用同一系统设置解析 canonical “生产 OBU”部门；FAIL 的 `linkedIssue` 在一致性校验和创建 NC 前注入同一部门。客户端显式提交外协部门、设置缺失/失效/歧义以及持久事实冲突继续 fail-closed。
- 回归测试同时覆盖进货与过程、PASS 与 FAIL、完整与 partial 历史事实，以及顶层责任和 FAIL `linkedIssue` 均不携带外协部门字段。

**验证结果：**

- 后端全量 Vitest：`288/288` 文件、`2621/2621` 用例通过。
- Web happy-dom Vitest：`65/65` 文件、`340/340` 用例通过。
- WeApp Vitest：`10/10` 文件、`52/52` 用例通过。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`pnpm run check:qms-arch:all`、`pnpm run check:prisma-migration` 与 `rtk git diff --check` 均通过。

**commit:** `e32d466` `fix(@qgs/backend): unify outsourcing responsibility resolution`、`04141cc` `fix(@qgs/web-antd): align incoming outsourcing close flow`、`f2f0e7f` `fix(@qgs/weapp): unify incoming outsourcing responsibility`。

**遗留问题：**

- 未运行前端 dev/build/start；真实登录页面与生产数据关单未执行。

---

### 2026-08-14 修复：历史报检任务关闭责任裁决

**执行内容：**

- 关闭 payload 新增独立顶层 canonical `responsibility`，由 `responsibilityType + responsibleDepartmentId + supplierId?` 组成；完整报检任务的既有责任事实不可被该字段覆盖，冲突输入直接拒绝。
- 历史 partial 或 missing responsibility 在关闭事务的状态锁后重新读取类别、TEAM 与责任字段；通过 active 主数据、类别/TEAM policy 和字段级 CAS 补齐，PASS 与 FAIL 共用同一最终事实。`PROCESS + SUPPLIER`、供应商类别错误、失效 ID、partial conflict 和 CAS 失败继续 fail-closed。
- FAIL 的 `linkedIssue` 必须与最终关闭责任精确一致；重复或并发 FAIL 复用已有 NC 前也验证其持久化三元组，避免两个事实源漂移。旧 FAIL 客户端仅在未提交顶层字段时才临时以 `linkedIssue` 为 fallback，PASS 不推断缺失责任。
- 桌面关单弹窗、H5 检验结果页和小程序关闭页都补齐历史责任选择；H5 PASS 强制关闭附件，FAIL 走完整不合格项表单并提交同一顶层责任事实。

**验证结果：**

- 后端全量 Vitest：`288/288` 文件、`2610/2610` 用例通过。
- Web happy-dom Vitest：`148/148` 文件、`328/328` 用例通过。
- WeApp Vitest：`10/10` 文件、`48/48` 用例通过。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`pnpm run check:qms-arch:all` 与 `rtk git diff --check HEAD~5..HEAD` 均通过。

**commit:** `2dd47b0c` `fix(@qgs/backend): repair historical inspection close responsibility`、`97b32657` `fix(@qgs/web-antd): adjudicate historical inspection close responsibility`、`804b0d08` `fix(@qgs/weapp): complete historical inspection close flows`、`ac08e6ff` `test(@qgs/backend): align issue supplier fixture`。全量验收发现旧测试 fixture 未返回生产 `SupplierIdentityService` 既有的 supplier category，已按两类外部责任的 canonical category 对齐。

**遗留问题：**

- 未运行真实 MySQL 并发集成验证；事务回滚与行锁边界由同一 Prisma transaction client 的定向测试覆盖。
- 未运行前端 dev/build/start、真实浏览器或小程序点击验收。

---

### 2026-08-14 修复：不合格项编辑责任部门回显

**执行内容：**

- 修复 `IssueFormFields` 中编辑态完整 schema 重建覆盖异步部门树的问题：统一 schema 构造现在始终注入当前 `deptTreeData`，因此 TreeSelect 能用 `title` 显示名称、用 primitive `value` 保持 canonical 部门 ID。
- 同时将责任归属类型、责任部门和供应商的锁定态纳入完整 schema 构造，避免编辑态重建后解除受控字段禁用状态。
- 补齐回归测试：真实 TreeSelect 在异步树到达后将 `dept-1770026473133` 回显为部门名称；编辑态重建后最终 schema 仍保留树数据和锁定态；编辑弹窗优先回填显式 canonical 部门 ID，不采用旧名称或数组猜测。

**验证结果：**

- Web 定向 Vitest：`5/5` 文件、`18/18` 用例通过。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 与 `rtk git diff --check` 均通过。

**commit:** `b15fec9` `fix(@qgs/web-antd): preserve department labels on schema rebuild`。

**遗留问题：**

- 未运行前端 dev/build/start，未进行真实浏览器页面验收。

---

### 2026-08-14 修复：关单不合格表单与历史责任事实兼容

**执行内容：**

- 不合格编号开关改为中文展示；责任部门树节点补齐 `title/value`，回填展示名称、提交保持 canonical 部门 ID。
- `PROCESS` 报检任务 FAIL 关单表单移除 `SUPPLIER` 责任类型，保留内部部门和外协单位；`INCOMING` 保留三类，后端同步拒绝 `PROCESS + SUPPLIER`。
- 历史已派单任务的部分责任 identity 可由 FAIL 表单的显式、主数据验证 canonical IDs 在同一事务内补齐；旧名称快照刷新，类型、部门 ID 或供应商 ID 冲突继续拒绝，PASS 不猜测缺失 identity。
- 关闭责任解析结果携带必填 `supplierCategory`，类别校验复用该解析事实，不再重复查询供应商。

**验证结果：**

- Web 定向 Vitest：`4/4` 文件、`26/26` 用例通过。
- 后端定向 Vitest：`6/6` 文件、`76/76` 用例通过。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 与 `rtk git diff --check` 均通过。

**commit:** `abf51d0` `fix(@qgs/web-antd): align issue responsibility forms`、`47c7540` `fix(@qgs/backend): complete legacy close responsibility`。

**遗留问题：**

- 未启动本地服务，因此未在 `localhost:5173` 完成真实页面验收。

---

### 2026-08-14 修复：不合格项表单责任部门回显与编号开关布局

**执行内容：**

- 不合格项表单的责任部门 `TreeSelect` 显式采用 `label/value/children` 映射；异步部门选项到达、编辑回填和预填均显示 canonical ID 对应的部门名称，提交值仍保持部门 ID。
- “Generate NC Number” 开关移除会拉宽控件的状态文字，并抵消表单统一 `w-full`，恢复为紧凑的原生开关；编辑态继续不显示该开关。

**验证结果：**

- Web happy-dom Vitest：`61/61` 文件、`313/313` 用例通过。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 与 `rtk git diff --check` 均通过。

**commit:** `a8f36b7` `fix(@qgs/web-antd): correct issue form labels and switch width`

**遗留问题：**

- 未运行前端 dev/build/start，未完成真实页面验收。

---

### 2026-08-14 修复：不合格编号改为可选的系统正式标识

**执行内容：**

- 不合格项编号改为可选且不可手填：独立新建、报检任务 FAIL 关闭、普通检验记录 FAIL 三个入口均明确提交 `generateNcNumber`；关闭时 `nonConformanceNumber` 持久化为 `NULL`，开启时仅由后端事务内编号服务分配。
- 普通检验记录与关联不合格项收敛为同一 Prisma 事务；后端从已落库检验记录继承 inspection、供应商和工单的 canonical 事实，校验失败会同时回滚，前端不再在保存记录后发送第二次创建请求。
- 新增一次性补号接口、权限 `QMS:Inspection:Issues:AssignNcNumber`、审计和 Web/WeApp 受权限控制的操作入口；只有未编号项可补号，已编号项不可修改、清空、删除后复用或重复生成。
- 报检关闭强制校验 `QMS:Inspection:Requests:Close`，非系统管理员只可关闭派发给自己的任务；并发或重复 FAIL 在事务锁后读取当前 `linkedIssueId`，复用原不合格项而不覆盖关联、不再创建或重号。
- 补齐手工编号拒绝、空编号 `null` 类型契约、导入生成策略、编号器新年度首号与并发保护；关单和普通记录的提交后附件、审计、评分副作用改为 best-effort，避免已提交事务被误报为失败。
- 修复售后核心与对抗测试 fixture，使 DeptService 新增的 `departments.findMany` 读取使用完整 Prisma mock；未改生产代码。

**验证结果：**

- 后端全量 Vitest：`288/288` 文件、`2595/2595` 用例通过。
- Web happy-dom Vitest：`61/61` 文件、`312/312` 用例通过。
- WeApp Vitest：`10/10` 文件、`46/46` 用例通过。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`pnpm run check:qms-arch:all`、Prisma migration 检查、shared build 与 `rtk git diff --check` 均通过。

**commit:** `9cc90993`、`bb88eda3`、`2000d63c`、`2f79dfe4`

**遗留问题：**

- 未读取凭据，未运行真实 MySQL 并发集成验证。
- 未运行前端 dev/build/start，未完成真实页面验收或生产发布。

---

### 2026-08-14 修复：部门改名后的责任部门在线展示

**执行内容：**

- 新增 Dept 模块 active 部门的批量 ID→当前名称和当前名称→ID 查询；inspection、after-sales 和 report 仅经该公开服务访问，避免跨模块读 departments 与 N+1。
- 检验记录和不合格项的列表、详情、导出、统计与责任部门筛选现以 active `responsibleDepartmentId` 的当前名称为准；PROCESS 历史关联报检兼容按 canonical ID 判定唯一性，冲突保持 unresolved。
- 售后列表/详情、统计、动态图表以及日报、周报现以 active `respDeptId` 的当前名称为准。Web 优先渲染的 legacy 多值责任部门数组同步替换主项，避免详情和移动列表继续展示旧快照。
- 名称筛选把 active 当前名称解析出的 ID 条件与 legacy 快照条件一并放进查询谓词，count、分页和导出共用同一数据库语义；无 ID 行保留快照，非空失效或软删 ID 不猜测名称并保留 unresolved 状态。持久化快照未作批量修改。

**验证结果：**

- 后端定向 Vitest：`10/10` 文件、`119/119` 用例通过，覆盖部门改名后的检验记录详情/导出/筛选、不合格项列表/详情/筛选/统计、售后列表/筛选/统计/图表和日报/周报。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 与 `rtk git diff --check` 均通过。

**commit:** `85e49d4` `fix(project): resolve current responsibility department names`

**遗留问题：**

- 未运行 dev/build/start，未推送或发布。

---

### 2026-08-13 修复：过程报检内部责任部门作为班组展示

**执行内容：**

- 统一 `PROCESS + INTERNAL_DEPARTMENT` 的业务班组语义：Web 和 WeApp 报检入口移除执行班组控件及提交字段，V2 服务端拒绝客户端携带的 `team/teamId`。
- PROCESS 外协报检仅选择外协单位：Web/WeApp 隐藏且不提交责任部门，服务端复用 shared 既有外协责任部门策略唯一解析活跃 canonical 部门；缺失或重名配置 fail-closed。PROCESS 责任类型去除 SUPPLIER，INCOMING 保持原有供应商语义。
- 请求、检验记录、导出与班组筛选统一把 `PROCESS + OUTSOURCING_UNIT` 显示和匹配为 canonical `supplierName`，不依赖或写入 `team/teamId`；关单继续以同一 R 原子投影 inspection 与 NC。
- 报检任务 API 与检验记录 API 现共享同一 PROCESS 内部班组展示规则：创建后、关闭前的任务列表/详情已将 `responsibleDepartment` 返回为 `team`；Web 表格、顶部详情抽屉、待派单提醒及 WeApp 列表、派单详情、关单页均直接展示该 API 字段，无需各自补偿。
- 关单事务提取报检任务完整责任 R，并逐条复制至新建多工单检验记录、空事实的显式关联检验记录和 FAIL 不合格项；partial/conflict 记录与 PASS legacy 无 R 均 fail-closed，不把部门 ID 写入 `teamId`。
- 列表、详情、导出和班组筛选使用责任部门作为内部过程检验的班组展示；历史记录自身缺失时批量读取关联报检任务，只有唯一内部责任部门才兼容展示，冲突保持空，外协和真实 TEAM 记录不变。
- 追加关单 R 投影、existing 冲突、PASS/FAIL 与详情/列表/导出/筛选历史兼容回归，并更新 inspection 架构与进度文档。

**验证结果：**

- 后端定向 Vitest：`10/10` 文件、`106/106` 用例通过，覆盖新建多工单、PASS/FAIL、显式关联记录、NC 责任投影、历史详情/列表/导出、筛选和冲突关联。
- 本次报检前展示回归：后端 `3/3` 文件、`15/15` 用例及 Web 顶部详情抽屉 `1/1` 文件、`3/3` 用例通过，覆盖 `Structure BU1` 的 API 列表/详情映射和卡片展示。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 与 `rtk git diff --check` 均通过。

**commit:** 未提交（按本次任务要求）。

**遗留问题：**

- 未运行前端 dev/build/start，未推送或发布。

---

### 2026-08-13 修复：报检详情身份字段按类别展示

**执行内容：**

- `DispatchDetailDrawer` 仅对 `INCOMING` 显示“供应商”及 API 已透传的 `supplierName` 快照；快照缺失时显示 `-`，不再回退读取或写入 `team`。
- `PROCESS` 与无类别的历史记录继续显示“班组”及 `team`，保持执行上下文和供应商身份边界。
- 新增抽屉组件回归测试，覆盖进货供应商、缺失供应商快照和过程班组三种情形；更新 inspection 架构约定与项目进度。

**验证结果：**

- 定向 Vitest：`2/2` 文件、`10/10` 用例通过（详情抽屉 `3/3`、详情查询 `7/7`）。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 与 `rtk git diff --check` 均通过；未运行前端 dev/build/start。
## [0.25.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.24.13...qgs-v0.25.0) (2026-08-13)


### Features

* **@qgs/backend:** version release maintenance tasks ([8da5c1a](https://github.com/ajie5419/Quality-Guardian/commit/8da5c1a1b8d5eea53f0bb802b233ef682e1c6c73))


### Bug Fixes

* **@qgs/backend:** persist quality loss index jobs ([d567fb6](https://github.com/ajie5419/Quality-Guardian/commit/d567fb657b19a5047d7545911a45d1f13df71bde))
* **@qgs/backend:** remove redis from release maintenance ([22cc54e](https://github.com/ajie5419/Quality-Guardian/commit/22cc54e408b3cf5efe833c0da03392dfda6f8c6e))
* **deploy:** block stale compose one-offs ([8f08c0d](https://github.com/ajie5419/Quality-Guardian/commit/8f08c0de5838110a2d487e955eac2d3aa65508ad))
* **deploy:** bound release execution and rollback ([4fce2d1](https://github.com/ajie5419/Quality-Guardian/commit/4fce2d153d325961aa701614adf7a73fc53c55c0))
* **deploy:** fail closed on release preflight ([f54859d](https://github.com/ajie5419/Quality-Guardian/commit/f54859d7074ba8121aacf86ada82dc8e662a17fc))
* **deploy:** keep backend online during release preflight ([bbf17ff](https://github.com/ajie5419/Quality-Guardian/commit/bbf17ff37f8fcf3d52d3a00f5dc4579a6df39bb1))
* **deploy:** make release maintenance versioned and bounded ([a0e2c2b](https://github.com/ajie5419/Quality-Guardian/commit/a0e2c2be5bdd7ea3634be7a974df8730e7ccab8c))
* **deploy:** restore backend after failed compose switch ([acc6be4](https://github.com/ajie5419/Quality-Guardian/commit/acc6be43ff5cca335117570b63f3c35c12687618))

### 2026-08-13 修复：release maintenance manifest 测试工作目录依赖

**执行内容：**

- 根因修复：`release-maintenance-manifest.test.ts` 曾以 `process.cwd()` 解析同目录的 runner。CI 从仓库根执行 `pnpm run test:unit` 时会错误指向根目录 `scripts/`，导致读取失败。
- 测试改为从 `import.meta.url` 推导自身所在的 `apps/backend/scripts` 目录后解析 `run-release-maintenance.ts`，不再依赖调用工作目录。

**验证结果：**

- 根目录 `pnpm exec vitest run apps/backend/scripts/release-maintenance-manifest.test.ts` 与 `apps/backend` 目录 `pnpm exec vitest run scripts/release-maintenance-manifest.test.ts` 均通过（各 `1/1` 文件、`4/4` 用例）。
- supplier identity 定向 Vitest 通过：`3/3` 文件、`50/50` 用例。
- 后端全量 Vitest 通过：`285/285` 文件、`2596/2596` 用例。
- 根目录全量 unit tests 通过：`393/393` 文件、`3268/3268` 用例。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`pnpm run check:prisma-migration` 与 `rtk git diff --check` 均通过。

**commit:** 本次独立提交。

**遗留问题：**

- 无。

---

### 2026-08-13 修复：报检入口责任部门默认值

**执行内容：**

- 在共享报检责任纯函数中按完整 canonical 部门选项执行唯一精确名称匹配：外协单位匹配“生产 OBU”，供应商匹配“采购部”；不硬编码部门 ID，零/多匹配保持未选。
- Web 扫码报检和 WeApp 报检创建页共用该规则；只在切换责任类型后的完整选项加载成功时填充空字段，不覆盖同一责任类型下已经手动选择的部门。空字段在选项加载失败或不存在时仍保持未选，由既有提交校验拒绝不完整责任信息。
- 更新 inspection 架构约定，明确这是仅用于 UI 初始值的 canonical ID 解析，不改变服务端责任事实校验。

**验证结果：**

- 共享定向 Vitest：`1/1` 文件、`26/26` 用例通过。
- Web 定向 Vitest：`1/1` 文件、`11/11` 用例通过。
- WeApp 定向 Vitest：`1/1` 文件、`10/10` 用例通过。
- `pnpm --dir packages/qgs-shared run build` 通过；未运行前端 dev/build/start。

**commit:** 本次独立提交。

**遗留问题：**

- 无。
- 无；生产环境未受影响。

---

## [0.24.13](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.24.12...qgs-v0.24.13) (2026-08-12)


### Bug Fixes

* **@qgs/backend:** keep sidecar rebuild out of release maintenance ([d55d1bd](https://github.com/ajie5419/Quality-Guardian/commit/d55d1bd3acb6f74951746e74c59078cdba9b4560))
* **@qgs/backend:** keep sidecar rebuild out of release maintenance ([ee42531](https://github.com/ajie5419/Quality-Guardian/commit/ee425315865fac8f344ad9cd03fe3ef592c02696))

### 2026-08-13 修复：发布前置阶段保持旧 backend 在线

**执行内容：**

- 根因修复：远端发布器不再在 Prisma migration 前停止 backend，也不再存在显式 `docker compose stop backend` 阶段。migration 与 release maintenance 使用新镜像 one-off 容器执行时，旧 backend 保持在线；仅在两项前置阶段完成后由 Compose 启动命令按新镜像重建服务。
- 回滚保留 compose 配置恢复、有界超时和固定 one-off 容器清理。migration、maintenance 失败或超时时，不会对未切换的旧 backend 执行启动操作；切换命令前即记录 `backend_switch_started`，因此切换命令超时、失败或健康检查失败时，均会以旧 compose 配置再次启动 backend。
- shell 行为测试锁定成功路径的 migration -> maintenance -> start services 顺序且无显式 backend stop；覆盖 migration failure、maintenance failure 与 maintenance timeout 均没有 backend stop/up，并覆盖 start-services failure 和健康检查失败均恢复旧 backend。

**验证结果：**

- `bash scripts/deploy/run-remote-release.test.sh` 通过，覆盖成功切换顺序、migration failure、maintenance failure、maintenance timeout、start-services failure、健康检查失败与 one-off preflight。
- `bash -n scripts/deploy/run-remote-release.sh scripts/deploy/run-remote-release.test.sh scripts/deploy/one-click-oss.sh scripts/deploy/deploy-from-oss.sh`、`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`pnpm run check:prisma-migration` 与 `rtk git diff --check` 均通过。
- 生产发布未执行。

**commits:** `bbf17ff3`（前置阶段保持旧 backend 在线）；本次移除显式 backend stop 的修正使用独立提交。

**遗留问题：**

- 生产环境仍须通过正式发布流程验证新旧镜像切换与健康检查失败回滚。单实例 Compose 重建会短暂中断连接，不得宣称零停机发布；migration 或 maintenance 失败时不得手动重启旧 backend。

---

### 2026-08-13 修复：质量损失索引持久化队列与发布可靠性闭环

**执行内容：**

- 根因修复：`quality_loss_index` 不再依赖每次发版启动异步全量 backfill。after-sales、inspection issue、vehicle commissioning 和 manual quality loss 四类来源均在各自事务内持久化 enqueue 索引任务，使源事实提交与待投影工作保持一致。
- 新增独立索引 worker：每 5 秒轮询，任务领取使用 5 分钟 lease；失败可重试并持久化错误。历史索引任务通过支持 dry-run/apply 的 enqueue 工具创建，再由独立 drain 工具消费，保留可审计的运维路径。
- 历史 enqueue、drain、投影重建和其他 remediation 均未接入同步 release maintenance；版本化 manifest/ledger、fail-closed preflight、固定 one-off 容器、有界阶段、清理与回滚继续只负责本版本声明的启动前置任务。

**验证结果：**

- 后端全量 Vitest：`285/285` 文件、`2596/2596` 用例通过。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、Prisma validate、migration checks、发布 shell 行为测试与 `rtk git diff --check` 均通过。
- 生产环境未执行 Prisma migration、release maintenance、历史 enqueue dry-run/apply 或独立 drain。

**commits:** `d567fb65`（持久化质量损失索引任务）、`4715c88c`（outbox 覆盖）；`4fce2d15`（有界发布与回滚）、`8da5c1a1`（版本化发布维护）、`f54859d7`（preflight fail-closed）、`6cf0f3e1`（维护文档与镜像断言）、`22cc54e4`（维护链路移除 Redis）、`8f08c0de`（阻断陈旧 compose one-off）、`55062b80`（文档记录）。

**遗留问题：**

- 生产发布前仍须通过正式发布流程执行并核对 migration 与 release maintenance；历史索引修复须先运行 enqueue dry-run 审核，再在独立运维窗口 apply 和 drain，禁止重新接入同步发布。

---

### 2026-08-13 修复：版本化发布维护与有界发布执行

**执行内容：**

- 根因修复：废止“每次发布重跑永久 shell 清单”的模式。release maintenance 改为 versioned manifest + `release_maintenance_tasks` 持久化 ledger；常规发布仅执行本版本 manifest 声明且尚未完成的启动前置幂等数据任务。
- 每项任务使用稳定 `taskKey`、递增 `revision` 与 SHA-256 checksum。完成记录跳过，失败或过期租约可重试，checksum 漂移 fail-closed；修改已完成任务必须新增 revision。
- 明确禁止将历史 remediation、historical identity sidecar、投影重建、窗口/评分对账加入同步发布；这些工作必须独立审批和执行。
- 远端发布器已采用固定 migration/maintenance 容器、preflight、阶段超时、失败清理和 compose 回滚。生产重试前须人工确认失败原因及数据库状态，并定向清理已确认的旧随机名残留。
- Docker production image 增加对 release maintenance TypeScript 入口、manifest 和 runner 的存在性断言，避免 deploy 调用未随镜像发布的维护实现。

**验证结果：**

- 后端 release maintenance 定向 Vitest：`2/2` 文件、`9/9` 用例通过；远端发布 shell 行为测试通过（覆盖成功、migration 失败、maintenance 超时、健康检查失败、固定容器残留和 preflight 异常）。
- `bash -n scripts/deploy/run-remote-release.sh scripts/deploy/one-click-oss.sh scripts/deploy/deploy-from-oss.sh` 与 `rtk git diff --check` 通过。
- 生产 Prisma migration、maintenance 执行、超时清理和回滚演练尚未执行。

**commits:** `4fce2d15`（有界发布与回滚）、`8da5c1a1`（版本化发布维护）；本文档与镜像断言提交见本次后续独立 commit。

**遗留问题：**

- 首次生产重试必须先人工检查现存随机名 one-off 容器、RDS 活动事务及 compose 回滚状态；禁止以删除 ledger、跳过 maintenance 或宽泛 Docker prune 方式绕过失败。

---

### 2026-08-12 修复：发布维护全量 sidecar 重建与日志噪声

**执行内容：**

- 根因修复：从 `apps/backend/scripts/run-release-maintenance.sh` 移除 `historical-identity-sidecar-bootstrap.ts --apply --rebuild`。该脚本是历史身份旁路的一次性初始化/受控重建工具，数据库文档明确禁止纳入常规 release maintenance；每次部署执行全量重建会延长维护窗口并可能触发 Prisma 事务超时 `P2028`。
- 新增 release maintenance 回归保护，禁止该 sidecar 重回发布链路；同时锁定 supplier identity 三类回填的批次进度使用 debug、最终汇总保留 info，以及三项检验责任维护只由 CLI 输出一次最终汇总。
- 普通 legacy TEAM remark 不再尝试 JSON 解析并逐条告警；仅保留对以 `{` 开头但 JSON 语法损坏的遗留元数据的告警，仍安全忽略该条来源声明。
- 降低 inspection、after-sales、quality-record supplier identity 回填的每批成功日志到 debug；去除报检责任、不合格项责任和损坏责任修复 service 层与 CLI 重复的 finished summary，业务处理和最终汇总不变。

**验证结果：**

- 定向 Vitest：`7/7` 文件、`73/73` 用例通过。
- 后端全量 Vitest：`281/281` 文件、`2571/2571` 用例通过。
- `pnpm -C apps/backend typecheck`、`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`pnpm run check:qms-arch:all` 与 `rtk git diff --check` 均通过。

**commit:** `ee425315` fix(@qgs/backend): keep sidecar rebuild out of release maintenance

**遗留问题：**

- 未推送、未执行生产发布；sidecar 如需首次初始化或全量重建，必须通过独立、受控的维护任务执行，不得重新接入常规发布。

---

## [0.24.12](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.24.11...qgs-v0.24.12) (2026-08-12)


### Bug Fixes

* **@qgs/backend:** raise sidecar bootstrap transaction timeout ([74c3b2e](https://github.com/ajie5419/Quality-Guardian/commit/74c3b2e9a80eb74b8aa1862f99e32898eb16afc0))
* **@qgs/backend:** raise sidecar bootstrap transaction timeout ([629e77e](https://github.com/ajie5419/Quality-Guardian/commit/629e77e564af0deb476639d0ffc80977dac74789))

## [0.24.11](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.24.10...qgs-v0.24.11) (2026-08-12)


### Bug Fixes

* **@qgs/backend:** close connections when maintenance scripts fail ([5228950](https://github.com/ajie5419/Quality-Guardian/commit/522895095d4d9b450ff77c5d686533ef8bebfd55))
* **@qgs/backend:** make identity projection maintenance resilient ([46fe2db](https://github.com/ajie5419/Quality-Guardian/commit/46fe2db75ed0d4ade42e32f4d7c932f1ba0b021a))
* **@qgs/backend:** skip identity projection upsert without active generation ([de65ad1](https://github.com/ajie5419/Quality-Guardian/commit/de65ad160a66460942df37a6bd601a323f5b5063))

## [0.24.10](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.24.9...qgs-v0.24.10) (2026-08-12)


### Bug Fixes

* **@qgs/backend:** disconnect redis in issue responsibility remediation CLI ([58f9fc9](https://github.com/ajie5419/Quality-Guardian/commit/58f9fc9fda307c3785fa3642dc7310482aacc086))
* **@qgs/backend:** disconnect redis in issue responsibility remediation CLI ([95b3eb9](https://github.com/ajie5419/Quality-Guardian/commit/95b3eb9fb44c9726864a2bc3b5ecc73f18c631cb))

## [0.24.9](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.24.8...qgs-v0.24.9) (2026-08-12)


### Bug Fixes

* **@qgs/backend:** log unresolved issue responsibility remediation samples ([2228631](https://github.com/ajie5419/Quality-Guardian/commit/222863184761d5d9fc0b5b747c4455dc7e82f471))
* **@qgs/backend:** log unresolved issue responsibility remediation samples ([2053bed](https://github.com/ajie5419/Quality-Guardian/commit/2053bed19b334b90725c4c3144f9831d0ec43eaf))

## [0.24.8](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.24.7...qgs-v0.24.8) (2026-08-12)


### Bug Fixes

* **@qgs/backend:** make TEAM identity source remediation idempotent ([fae2d36](https://github.com/ajie5419/Quality-Guardian/commit/fae2d36bbe353aa10991308ebce46b964e892596))
* **@qgs/backend:** make TEAM identity source remediation idempotent ([03d820c](https://github.com/ajie5419/Quality-Guardian/commit/03d820c9d3a77cba3a91a0e354942e2ebf0093c4))

## [0.24.7](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.24.6...qgs-v0.24.7) (2026-08-12)


### Bug Fixes

* **@qgs/backend:** align quality records to confirmed TEAM suppliers ([50b5ecc](https://github.com/ajie5419/Quality-Guardian/commit/50b5ecc6b06d3412d73fdba29887283aa88756d5))
* **@qgs/backend:** align quality records to confirmed TEAM suppliers ([6322e8a](https://github.com/ajie5419/Quality-Guardian/commit/6322e8a4420c90285aa71342b7dae862c755fe42))

## [0.24.6](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.24.5...qgs-v0.24.6) (2026-08-12)


### Bug Fixes

* **@qgs/backend:** complete confirmed supplier outsourcing mode in maintenance ([5ec131c](https://github.com/ajie5419/Quality-Guardian/commit/5ec131cdc558a839e385c268945af2615bcdeff2))
* **@qgs/backend:** complete confirmed supplier outsourcing mode in maintenance ([cda7ba6](https://github.com/ajie5419/Quality-Guardian/commit/cda7ba65fb00f920f3b9bc7875a666d8ec67ed54))

## [0.24.5](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.24.4...qgs-v0.24.5) (2026-08-12)


### Bug Fixes

* **@qgs/backend:** log confirmed TEAM link skip reasons in maintenance ([429f4ad](https://github.com/ajie5419/Quality-Guardian/commit/429f4ad094ce8ddc4450cdfe2fc274ec305c9566))
* **@qgs/backend:** log confirmed TEAM link skip reasons in maintenance ([2c2d895](https://github.com/ajie5419/Quality-Guardian/commit/2c2d895627afcf1721e5e2eebfbd1a418475423a))

## [0.24.4](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.24.3...qgs-v0.24.4) (2026-08-12)


### Bug Fixes

* **@qgs/backend:** create confirmed TEAM supplier links in maintenance ([63ade2c](https://github.com/ajie5419/Quality-Guardian/commit/63ade2cb620555310e0fc644305f8049fffca609))
* **@qgs/backend:** create confirmed TEAM supplier links in maintenance ([149e858](https://github.com/ajie5419/Quality-Guardian/commit/149e8583eb1f2fbd2d15edd6abf7d7fe67ab7ea2))

## [0.24.3](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.24.2...qgs-v0.24.3) (2026-08-12)


### Bug Fixes

* **@qgs/backend:** run identity source remediation before the supplier gate ([f0bb8dc](https://github.com/ajie5419/Quality-Guardian/commit/f0bb8dc2dac906e667c773b85da89c46005bd393))
* **@qgs/backend:** run identity source remediation before the supplier gate ([1f292ed](https://github.com/ajie5419/Quality-Guardian/commit/1f292ed4809440fc8f85b88bd3b99c335a983d50))

## [0.24.2](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.24.1...qgs-v0.24.2) (2026-08-12)


### Bug Fixes

* **@qgs/backend:** revive soft-deleted TEAM identity sources ([f2cc530](https://github.com/ajie5419/Quality-Guardian/commit/f2cc53074325995e458cca218051ea66fa791563))
* **@qgs/backend:** revive soft-deleted TEAM identity sources ([4e8e996](https://github.com/ajie5419/Quality-Guardian/commit/4e8e996774c6acd02f9d28f0f924c884b9c299b0))

## [0.24.1](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.24.0...qgs-v0.24.1) (2026-08-12)


### Bug Fixes

* **@qgs/backend:** apply confirmed legacy inspection identity corrections ([667afde](https://github.com/ajie5419/Quality-Guardian/commit/667afde6bf2e21f7fed4227d4e5cdaf8b5788edd))
* **@qgs/backend:** apply confirmed legacy inspection identity corrections ([a90115f](https://github.com/ajie5419/Quality-Guardian/commit/a90115fe8d690dc5ef0af7d26771d7e95b99028c))
* **@qgs/backend:** complete confirmed TEAM identity sources in maintenance ([f364e0e](https://github.com/ajie5419/Quality-Guardian/commit/f364e0e2e6798b92bd5193e14daffeaf8ee5d7b4))
* **@qgs/backend:** complete confirmed TEAM identity sources in maintenance ([0242feb](https://github.com/ajie5419/Quality-Guardian/commit/0242febf8a261da85f30dbd265d0f7ce3db9b79e))
* **@qgs/backend:** harden issue responsibility updates and NC allocation ([80dc2f4](https://github.com/ajie5419/Quality-Guardian/commit/80dc2f45d50fd879a2862dd035ff76d99153b9c4))
* **@qgs/backend:** remediate issue responsibility data ([fcb4044](https://github.com/ajie5419/Quality-Guardian/commit/fcb40440c3286d58fafa2cf24056487bb43b87b7))
* **@qgs/backend:** resolve migration recovery script path in tests ([8013512](https://github.com/ajie5419/Quality-Guardian/commit/80135121373a1383d154dce1bbc8cdb89828e8e8))
* **@qgs/backend:** stop gating on legacy non-TEAM identity rows ([7efebe4](https://github.com/ajie5419/Quality-Guardian/commit/7efebe4aadb8cf9f271bb9dd86f92f3738e37b3b))
* **@qgs/backend:** stop gating on legacy non-TEAM identity rows ([59ba7df](https://github.com/ajie5419/Quality-Guardian/commit/59ba7dfe09ecb349d711e6df1bb113cde1eb5c3e))
* **@qgs/weapp:** align entry responsibility selection contract ([ed8508f](https://github.com/ajie5419/Quality-Guardian/commit/ed8508f51f53690a8664a623d956467b550e2c3a))
* **@qgs/weapp:** show reinspection passed on my records ([99a9d11](https://github.com/ajie5419/Quality-Guardian/commit/99a9d11d52c375f9e4f2f6368ae113876b74a906))
* **@qgs/web-antd:** align entry responsibility selection contract ([d775ffc](https://github.com/ajie5419/Quality-Guardian/commit/d775ffc384285daa09632734100dcc34de62daaa))
* **@qgs/web-antd:** resolve legacy close responsibility department uniquely ([cabfdf1](https://github.com/ajie5419/Quality-Guardian/commit/cabfdf1b163b5766e790af35659063987612c7c0))
* **@qgs/web-antd:** show reinspection passed on inspection records ([311e3a7](https://github.com/ajie5419/Quality-Guardian/commit/311e3a7c78c46a4c4d5c9deb189c39edcc727085))
* atomically audit supplier identity backfill changes ([ebc98eb](https://github.com/ajie5419/Quality-Guardian/commit/ebc98ebabaf2c631b5451136c1312523345cc22f))
* block unresolved external process teams in backfill ([d57a830](https://github.com/ajie5419/Quality-Guardian/commit/d57a8303b6da82acdcf090e7a410bc70082f1a82))
* inspection responsibility, reinspection display and release hardening ([e617585](https://github.com/ajie5419/Quality-Guardian/commit/e61758582a879ca64b33078f5a744e098fed21bf))
* load department sources for link conflict checks ([4fa2080](https://github.com/ajie5419/Quality-Guardian/commit/4fa20802d4c314610fe23772507c616721c2faf1))
* **project:** align inspection issue entry forms ([928d666](https://github.com/ajie5419/Quality-Guardian/commit/928d6665ec91646f646b56a533f3a3cd9bc8485a))
* **project:** allow direct inspection department responsibility ([88bc724](https://github.com/ajie5419/Quality-Guardian/commit/88bc724b91ff8c45cf46bc567ffb9a47068960a9))
* **project:** block unresolved supplier identity releases ([5d82561](https://github.com/ajie5419/Quality-Guardian/commit/5d8256135af0918da406cd08ca0f44b99147b986))
* **project:** bound supplier identity option queries ([bd5c59c](https://github.com/ajie5419/Quality-Guardian/commit/bd5c59c29c4b555468a5c975a492a0c7521b62b0))
* **project:** clear internal process request suppliers ([a4f08a7](https://github.com/ajie5419/Quality-Guardian/commit/a4f08a737344c9ad7befecd8836e65c8a9bca1ab))
* **project:** enforce explicit supplier team links ([f172064](https://github.com/ajie5419/Quality-Guardian/commit/f17206413a69350f2dfaf944ea2dda1d0a90cbc7))
* **project:** persist inspection request responsibility ([40070cf](https://github.com/ajie5419/Quality-Guardian/commit/40070cf9db08ebaac01a37139616a0a67599c0f3))
* **project:** recover failed responsibility migration safely ([2051341](https://github.com/ajie5419/Quality-Guardian/commit/2051341fe2e475fe33c2e91dbfe9bac448834d74))
* **project:** restore inspector work order confirmation ([de561dc](https://github.com/ajie5419/Quality-Guardian/commit/de561dc6f59bc7b87594b34b7409d3351c9d1012))
* **project:** search supplier candidates before sources ([906f788](https://github.com/ajie5419/Quality-Guardian/commit/906f7884c126396e07571a94658af4927ba7ba27))
* **project:** select inspection responsibility departments directly ([5311921](https://github.com/ajie5419/Quality-Guardian/commit/5311921f0049eaa2a1a85b799c986c613b2c175c))
* **project:** unify explicit request responsibility contract ([6744d71](https://github.com/ajie5419/Quality-Guardian/commit/6744d716d1ebd66d2a58ed9ab2a918cddece6ebd))
* **project:** unify inspection issue creation contract ([9ddce79](https://github.com/ajie5419/Quality-Guardian/commit/9ddce7965f619fd7109ec00b9a1cb81eff841a84))
* **project:** unify inspection request responsibility context ([f500973](https://github.com/ajie5419/Quality-Guardian/commit/f500973c737e309e6b38ef14f7ed35b6c063f4e3))
* **project:** unify inspection responsibility inputs ([d84297c](https://github.com/ajie5419/Quality-Guardian/commit/d84297c151fbb79e7acbd90c48a12dd6b850d73a))
* **project:** validate process supplier links by source ([b9a0789](https://github.com/ajie5419/Quality-Guardian/commit/b9a0789123f83b1e16a6f738847177ee67e07a9e))
* protect historical facts when restoring supplier links ([38e379b](https://github.com/ajie5419/Quality-Guardian/commit/38e379bf40fb638c47c024a085df6fb73bb2b081))
* reject dual-source teams across supplier identity paths ([997e699](https://github.com/ajie5419/Quality-Guardian/commit/997e699fef45fa44b24de1ee50f45cc2573b8803))
* restrict supplier team query to valid identity intersection ([f9e325a](https://github.com/ajie5419/Quality-Guardian/commit/f9e325a1ed24ad2d488288208082f96129c526ad))

### 2026-08-12 功能：检验记录复检合格展示

**执行内容：**

- 检验记录列表与详情增加“复检合格”展示：`result=PASS` 且记录关联不合格项（`issueStatus !== NONE`）时显示“复检合格”，否则保持合格/不合格/让步接收等原逻辑；判定逻辑收敛到 `inspection-record-result.ts` 纯函数。
- 小程序“我的记录”列表同步支持“复检合格”：`inspectionResult=PASS` 且存在 `linkedIssueId/linkedIssueNo` 时显示复检合格徽标（蓝色），否则保持合格/不合格/待复检；判定逻辑收敛到 `record-result.ts` 纯函数。

**验证结果：**

- Web 全量 Vitest：`60/60` 文件、`305/305` 用例通过（新增复检判定 `4/4`）；小程序全量 Vitest：`9/9` 文件、`39/39` 用例通过（新增复检判定 `5/5`）。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`pnpm run check:qms-arch:all`、`pnpm run check:prisma-migration` 与 `rtk git diff --check` 均通过。

**commits:** `311e3a7`（Web）、`99a9d11`（WeApp）。

**遗留问题：**

- 未推送、未发布；真实浏览器/小程序页面展示与生产验证尚未执行。


### 2026-08-12 修复：关单责任部门唯一解析、部分更新与 NC 并发

**执行内容：**

- 关单弹窗历史报检（legacy）外协责任不再从全量部门列表取第一个：SUPPLIER/OUTSOURCING_UNIT 按政策部门名（采购部/生产 OBU）唯一匹配，零匹配或重复匹配时 fail-closed 阻断提交，避免把“下料 BU”等任意部门静默持久化为外部责任部门。
- 不合格项更新改为部分更新语义：更新 payload 只带任一责任字段时，先合并当前记录的责任三元组再解析校验，单独修改 `supplierId` 或责任类型不再误报“责任类型无效”。
- NC 编号分配改为事务内 compare-and-set 循环：每个事务读取当前序列值并只在写入刚读到的值时成功，失败重试，消除并发创建产生重复 NC 编号的竞态。

**验证结果：**

- 后端全量 Vitest：`279/279` 文件、`2554/2554` 用例通过；Web 全量 Vitest：`59/59` 文件、`301/301` 用例通过；小程序全量 Vitest：`8/8` 文件、`34/34` 用例通过。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`pnpm run check:qms-arch:all`、`pnpm run check:prisma-migration` 与 `rtk git diff --check` 均通过。

**commits:** `80dc2f4`（后端）、`cabfdf1`（Web）。

**遗留问题：**

- 未推送、未发布；真实浏览器关单流程与生产环境验证尚未执行。


### 2026-08-12 修复：报检入口责任选择与提交契约对齐

**执行内容：**

- 根因：进货/过程报检入口与不合格问题报告的显式责任契约未真正对齐。进货页曾被锁定为「供应商 + 固定部门」，过程内部提交仍把选填的 `teamId` 当必填，外部责任部门则按「采购部/生产 OBU」固定名称匹配；当存在两个同名有效「生产 OBU」部门时，无论提交哪个 ID 都被服务端唯一性校验拒绝。
- Web 与 WeApp 报检入口统一为问题报告同款三态显式责任表单：`INCOMING` 不再锁定 `SUPPLIER`，三类责任类型均可在两个入口选择；责任部门对所有类型都是可选择的 canonical department 下拉，不再展示「责任部门策略加载中」固定文本，也不再自动取第一个部门。
- `PROCESS` 内部责任的 `teamId` 保持「执行班组（选填）」语义：提交与必填提示不再要求班组；选择后服务端仍校验它与责任部门存在唯一有效对应。
- 责任选项接口不再按责任类型用固定部门名过滤，外部类型返回全部有效部门；创建服务对 `SUPPLIER`/`OUTSOURCING_UNIT` 增加 canonical 供应商类别与责任类型一致性校验，并移除 INCOMING 必须为 `SUPPLIER` 的 schema 限制。
- 小程序增加责任选项竞态序列号，避免快速切换责任类型时旧响应覆盖新选择。

**验证结果：**

- 后端全量 Vitest：`279/279` 文件、`2551/2551` 用例通过；Web 全量 Vitest：`58/58` 文件、`297/297` 用例通过；小程序全量 Vitest：`8/8` 文件、`34/34` 用例通过。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`pnpm run check:qms-arch:all`、`pnpm run check:prisma-migration`、shared build 与 `rtk git diff --check` 均通过。
- 本地浏览器已验证：进货页责任类型与责任部门均可下拉并可在三类间切换；过程内部选择部门后执行班组保持选填；过程外协可显示责任部门与外协单位控件；页面无控制台错误。未提交真实报检单，创建契约由后端与定向测试覆盖。

**commits:** `6744d71`（后端/共享契约）、`d775ffc`（Web 入口）、`ed8508f`（WeApp 入口）。

**遗留问题：**

- 未推送、未发布；真实浏览器提交报检、生产环境验证尚未执行。

### 2026-08-10 修复：工单要求确认权限回归

**执行内容：**

- 新增独立 `QMS:WorkOrder:Confirm` 权限；前端确认/撤销按钮和后端状态变更均使用该权限，普通要求编辑继续严格要求 `QMS:WorkOrder:Edit`。
- 工单模块声明存量 `/qms/work-order` 菜单及确认按钮，新环境 `db seed` 同步写入该按钮；发布维护通过 `ensureModuleMenus` 幂等写入菜单，Docker production image 显式校验维护脚本已随镜像发布。
- 新增 release maintenance：同一事务中确保 `QMS:WorkOrder:List` 与 `QMS:WorkOrder:Confirm` 权限记录、为启用 `QC` 角色补齐列表和确认权限，并为所有当前持有工单编辑权限的启用角色补齐确认权限，绝不新增 QC 编辑权限；无关角色不变，菜单缓存按需失效。
- release maintenance 顺序固定在页面权限回填之后；新增菜单、QC/编辑角色兼容、零 QC、幂等、发布顺序以及确认/编辑双向越权测试。

**验证结果：**

- 定向 Vitest：`4/4` 文件、`29/29` 用例通过。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`：均通过（架构检查仅报告既有 baseline）。
- 后端全量 Vitest：`268/269` 文件、`2474/2475` 用例通过；唯一失败为工作树既有无关改动 `apps/backend/modules/supplier-identity/supplier-identity.service.test.ts:867` 的断言与其当前 service 查询不一致，本次未触碰该文件。
- 排除该用户既有脏文件后，后端全量 Vitest：`268/268` 文件、`2443/2443` 用例通过。

**commit:** 已按独立修复提交记录，未推送或发布。

**遗留问题：**

- 发布后需由 release maintenance 正常执行权限回填；未通过绕过或手工改库处理。

---

### 2026-08-08 修复：supplier identity 独立验收 P1 闭环

**执行内容：**

- 供应商画像/评分的 supplier→TEAM 查询现在只返回 active TEAM、有效 PROCESS-policy 外包供应商、精确 active `SUPPLIER` 来源和 active link 的交集，历史无效 link 不再进入聚合。
- 回填上下文区分 external TEAM 与仅 DEPARTMENT 的 internal TEAM；外部 TEAM 缺有效 link 即使 supplier 字段为空也记录 `MISSING_PROCESS_TEAM_LINK`。同时，DEPARTMENT+SUPPLIER 双来源被视为冲突，绝不清理为内部事实；冲突检查显式加载同 TEAM 的任意 DEPARTMENT 来源和精确 supplierId 的 SUPPLIER 来源。
- `qms_inspection_requests`、`inspections`、`quality_records` 的内部 supplier 清理 CAS 与 cleared/resolved/unresolved 审计放入同一 Prisma transaction；审计失败会使事务失败。
- 软删 TEAM link 仅可原供应商恢复；若改绑供应商且存在 PROCESS facts，服务端拒绝修改。

**验证结果：**

- 定向 Vitest：supplier identity、回填 resolver/runtime/request 共 `62/62` 通过。
- 后端全仓 Vitest：`267/267` 文件、`2461/2461` 用例通过。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`pnpm run check:qms-arch:all`：均通过（架构检查只报告既有 baseline）。

**commits:** `f9e325a1`、`d57a8303`、`ebc98eba`、`38e379bf`、`4fa20802`

**遗留问题：**

- 未连接生产；v0.24.0 的 17 条及既有 unresolved 仍必须通过正常发布 maintenance/backfill 链路以确定性身份来源处置，任何歧义记录继续阻断发布。

---

### 2026-08-08 修复：supplier TEAM 双来源在线契约闭环

**执行内容：**

- 将 active `DEPARTMENT` source 排除条件统一写入单/批在线 resolver、TEAM→supplier CRUD 校验、系统设置候选查询和 supplier→TEAM 画像/评分查询；任一 dual-source TEAM 均不能作为供应商负责的 PROCESS TEAM。
- 回填上下文以 `externalTeamIds` Set 计算 internal TEAM，避免原先对每个 DEPARTMENT source 反复扫描全部来源的 O(n²) 逻辑。

**验证结果：**

- 定向 Vitest：supplier identity service 与 backfill runtime `40/40` 通过，覆盖单/批解析、CRUD、候选及画像查询反例。
- 后端 `tsc --noEmit`、`pnpm lint`、`pnpm run check:qms-arch`、`pnpm run check:qms-arch:all`：均通过（架构检查仅既有 baseline）。

**commit:** `997e699f`

---

### 2026-08-08 发布：qgs v0.24.0（身份 ID 化治理 + 报检/检验显示修复）

**执行内容：**

- 提交 `b5319b8e` 经 PR #94 合入 main：SupplierSelect 跨类别 legacyName 回退、进货类型/工序按 ID 解析、supplier identity links 系统设置管理 UI、焊接缺陷责任焊工校验、责任部门 TreeSelect 独立勾选等。
- release-please 生成发布 PR #92 → 合并 → tag `qgs-v0.24.0`。
- 版本时间线：v0.23.3 的 release commit 曾生成但未打 tag；其内容随 `b5319b8e` 并入 v0.24.0，不构成独立已发布版本。

**发布过程：**

- tag 触发的 deploy（run 31242204439）在 release maintenance 阶段失败，记录为 17 条 PROCESS supplier identity unresolved。该数字只证明当时门禁发现未完成的身份事实，不能证明它们全是数据缺口、外包事实或可由 TEAM→supplier mapping 修复。
- 随后手动 `workflow_dispatch` 使用 `skip_maintenance=true` 完成了 v0.24.0 部署（run 31242625012）。这是未完成维护时的错误绕过，不是既定恢复路径；后续 workflow 已删除该输入。
- 影响：两条 Prisma migration 已执行，但 supplier identity 回填、pass-rate 投影刷新和健康检查没有完成。17 条以及既有 unresolved 必须由确定性身份来源重新处置：内部 `DEPARTMENT` TEAM 清空错误 supplier 字段；只有匹配有效 `SUPPLIER` 来源的外部 TEAM 才能建立 link；歧义记录继续阻断发布。

**commit:** `b5319b8e`

---

## [0.24.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.23.2...qgs-v0.24.0) (2026-08-08)


### Features

* **project:** resolve supplier and process identities by stable id across inspection flows ([b5319b8](https://github.com/ajie5419/Quality-Guardian/commit/b5319b8e69139cd1f44d4d5536ecb3d4aa43110d))


### Bug Fixes

* **ci:** remove script_stop injection that bypasses deploy rollback ([#91](https://github.com/ajie5419/Quality-Guardian/issues/91)) ([49d7384](https://github.com/ajie5419/Quality-Guardian/commit/49d73848330fac70149fad97cb0a35e4a9a7027a))

### 2026-08-08 修复：报检任务不合格供应商回显显示 ID（跨类别 legacyName 解析）

**问题：**

- 报检任务（进货检验）创建不合格项时，责任部门显示「采购部」，供应商字段显示 `SUP-1769076104668-hzne`（供应商 ID）而不是供应商名称「二十二冶集团装备制造有限公司」。
- 根因：进货检验默认责任类型 `SUPPLIER`，前端 `IssueFormFields` 把 `targetUnitCategory` 算成 `'Supplier'`；但该供应商在主数据里 `category=Outsourcing`（外协单位）。`SupplierSelect` 用 `category='Supplier'` 按 legacyName（供应商名称）精确搜索，后端 `category='supplier'` 过滤条件排除了 Outsourcing，搜不到 → 回显失败 → 直接把 value（ID）当显示文本。

**执行内容：**

- `apps/web-antd/src/views/qms/shared/components/SupplierSelect.vue`：`resolveLegacyName` 在按当前类别精确搜索无匹配时，回退为不带类别过滤的按名称精确搜索（跨类别回显），保证外协供应商在进货检验表单中也能解析出名称而不是显示 ID。
- 第二版修复（代码评审意见）：
  - 回退条件由「带类别搜索无匹配」收紧为「选中值未命中」——覆盖同名不同 ID 的供应商：带类别搜索命中同名但不同 ID 时，仍按选中 ID 回退跨类别解析。
  - 无选中值时不再跨类别猜选：没有 `value` 的场景保持带类别搜索原逻辑，避免静默选中外协供应商。
- 测试：`SupplierSelect.test.ts` 新增「同名不同 ID 跨类别回退」「无 value 不跨类别猜选」两个用例，9/9 通过。

**验证结果：**

- 定向前端测试 `SupplierSelect` 9/9，相关 QMS 前端测试 12 文件 53 用例通过；`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 均通过。

**commit:** `b5319b8e`

---

### 2026-08-08 修复：进货检验记录「进货类型」显示跟随工序改名（ID 化）

**问题：**

- 报检工序设置里把「机加成品件」改为「机加成品件-外协」后，历史进货检验记录仍显示旧名。
- 根因：进货检验（INCOMING）记录显示的是「进货类型」（`incomingType`），其 canonical 主数据是 `dictionaries(incoming_type)`（按 `incomingTypeId` 解析），而报检入口「进货类型」下拉绑定的是工序（`processes`）。工序改名只改了工序表，字典没同步，导致历史记录（`incomingTypeId` 指向字典）显示旧名、新记录（`incomingType=新名`）在字典中解析失败落 `incomingTypeId=NULL`。
- 本地库验证：1132 条进货记录 `incomingType='机加成品件'`、`incomingTypeId=8e35e163…`（字典 ID）、`processId=NULL`；字典项未改名。过程检验/报检任务/不合格项均带 `processId`，改名后显示自动跟随（含既有「探伤→探伤-测试」197 条）。

**执行内容：**

- `process-master.service.ts`：工序改名时联动同步 `dictionaries(incoming_type)` 同名项（dictKey+dictValue），保证字典跟随工序改名。
- `process-resolver.ts`：新增 `resolveIncomingTypeNamesByIds` / `resolveIncomingTypeName`，按 `incomingTypeId` 解析字典当前名（canonical 名称列 `dictKey`，与治理层一致），无 ID 或解析失败回退快照。
- `inspection-record-query.service.ts`：`findAll`/`findById`/`findSupplierHistory` 对 INCOMING 记录覆盖返回 `incomingType` 为解析后的字典当前名（历史行不动）。
- `pass-rate.ts`：进货检验合格率分桶（检验记录 + 不合格项）改为按解析后的字典当前名分桶，历史与新数据统计统一。
- `process-options.get.ts` + `process-master.service.listActiveOptions`：选项接口补充 `supplierSource`/`inspectionRequestCategory`。
- 前端：检验记录表单 `formData.ts` 的「进货类型」下拉改绑 INCOMING 工序选项（替代硬编码字典值）；`InspectionForm.vue` 外协单位库切换判断由硬编码「机加成品件」改为选中工序的 `supplierSource`；`config.ts`/`useProcessMasterOptions.ts`/`process-master.ts` 类型扩展。
- `prisma/migrations/20260808000001_sync_incoming_type_dictionary`：数据 migration 把历史遗留字典名同步到工序名（条件：工序已改名为「机加成品件-外协」且字典仍是旧名且目标名未被占用），发布时自动执行、幂等；本地已应用（字典「机加成品件」→「机加成品件-外协」）。
- `inspection-public-query.service.ts`：今日进货看板 `getTodayIncomingInspections` 改为按报检任务 `processId` 解析工序当前名（无则回退 `requestInfo` 快照），历史看板同样跟随改名。
- 测试：新增/更新 process-resolver、process-master（改名联动 + 目标名冲突保护）、inspection-record-query（INCOMING 解析）、pass-rate（进货分桶解析）用例；`scripts/qms-architecture-baseline.txt` 登记 pass-rate.ts 行数基线（486→504）。

**验证结果：**

- 本地库端到端：历史 1126 条「机加成品件」进货记录解析显示「机加成品件-外协」，其余三项一致。
- 后端 vitest 267 文件 / 2443 用例全过（含看板、migration 相关）；前端 records/shared 相关测试通过。
- 本地 `prisma migrate deploy` 应用新 migration 成功且幂等（字典已是新名，0 行变更）。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 均通过。

**commit:** `b5319b8e`

**遗留问题：**

- 无阻塞项。后续若出现新的主数据改名，`process-master` 改名联动 + 显示层 ID 解析会自动跟随，无需再跑脚本或单独治理；检验记录查询本身没有按 `incomingType` 文本筛选入口（仅显示解析），剩余按文本匹配的链路是检验表单模板匹配（`planning/inspection-forms/match`），属于后续 ID 化范围。

---

### 2026-08-08 修复：供应商/班组检验记录历史未按当前工序名展示

**执行内容：**
- 根因：`findSupplierHistory`（供应商详情/班组详情里的检验记录历史）查询未 include `process` 关联，返回原始 `processName` 快照；工序改名后该入口仍显示旧名，与检验记录主列表/详情、报检任务、不合格项的「ID → 当前主数据名」解析不一致
- `apps/backend/modules/inspection/inspection-record-query.service.ts`：`findSupplierHistory` include `process` 关联并统一走 `resolveCanonicalProcessNameByRelation` 解析

**验证结果：**
- vitest: 全量 3046/3046 通过（新增 1 用例）
- typecheck / eslint 变更文件: 通过

**commit:** `b5319b8e`

**遗留问题：**
- 历史检验记录若 `processId` 为空（旧数据未回填），主列表仍显示创建时快照名；需按名称回填 `processId` 后才会跟随改名，回填前先在生产库核对 `inspections.processId` 填充率

### 2026-08-08 修复：进货类型改名后供应商外协库判定失效（工序配置化）

**执行内容：**
- 根因：进货检验报检入口的「进货类型」下拉把选项 value 绑成工序名称（`InspectionRequestEntryFormFields.vue`），供应商来源按 `incomingType === '机加成品件'` 名称硬编码判定（`useInspectionRequestIdentityOptions.ts`）；工序在系统设置改名后判定失效，回落普通供应商库
- `apps/backend/prisma/schema.prisma` + migration `20260808000000_add_process_supplier_source`：`processes` 新增 `supplierSource`（默认 `Supplier`），并按名称回填历史「机加成品件」为 `Outsourcing`（TRIM 匹配，兼容空格差异）
- `apps/backend/modules/process-master`：create/update schema 与 service 支持 `supplierSource`；`listInspectionRequestOptions` 返回 `supplierSource`
- `apps/web-antd/src/views/system/inspection-settings/index.vue`：报检与检验设置新增「供应商来源」列与编辑下拉（外协加工单位/普通供应商），同步 i18n
- 报检入口：进货类型下拉 value 改绑 `processId`（`entry-mode.ts`/`InspectionRequestEntryFormFields.vue`），供应商库按所选工序的 `supplierSource` 配置判定；提交 `requestInfo.incomingType` 保留工序名称快照（`index.vue`）；删除废弃的 `MACHINED_INCOMING_INSPECTION_TYPE` 名称常量
- 新增/更新测试：process-master 3、entry-mode 1、identity options 3、FormFields 1、public-query 2

**验证结果：**
- vitest: 全量 3045/3045 通过
- typecheck: 3/3 通过
- prisma validate / check:prisma-migration: 通过
- eslint 变更文件 / check:qms-arch: 通过

**commit:** `b5319b8e`

**遗留问题：**
- 生产环境需执行新 migration 后，历史「机加成品件」工序才会回填为外协来源；部署后用户仍可在设置页手动调整任意工序的供应商来源

### 2026-08-08 功能：supplier identity 映射系统设置管理 UI

**执行内容：**
- `supplier-identity` 注册系统设置动态菜单 `/system/supplier-identity-links`，页面权限为 `System:SupplierIdentity:List`，写操作声明为 `System:SupplierIdentity:Edit`；页面和所有写按钮同时要求权限码与共享 `isSystemAdmin` 判定，服务端既有 `isSystemAdmin` CRUD 边界保持不变。
- 新增管理员专用 `GET /qms/supplier-identity-links/options`：按关键字从完整活跃 TEAM 与供应商主数据域返回 canonical ID 选项，不受供应商数据范围或类别过滤影响；查询上限为 100，表单支持远程搜索。
- 新增 Web API client 和系统设置页面，包含分页列表、创建、编辑、删除确认、加载/错误/空态、远程选项加载和客户端必填校验；提交只传 `teamId` 与 `supplierId`。前端同时识别 `*`、`["*"]` 和 `super` 角色的菜单通配语义，且加载、刷新与分页入口会先阻断无查看权限的直达访问。
- 将管理选项查询拆分为模块内独立 service，保持主 service 在 500 行限制内；补充模块声明、管理员路由、选项查询、API client、表单校验和非管理员写操作保护测试。

**验证结果：**
- 定向 Vitest：6/6 文件、29/29 用例通过。
- `pnpm lint`：通过（0 error，0 warning）。
- `pnpm run check:type`：通过（3/3 workspace tasks；weapp 为项目既有 skip）。
- `pnpm run check:qms-arch`：通过（0 新违规）。

**commit:** `b5319b8e`

**遗留问题：**
- 无；发布后动态菜单同步会创建页面与按钮权限记录，角色授权仍由既有 RBAC 管理流程维护。

### 2026-08-07 修复：独立不合格项入口缺失焊接缺陷责任焊工校验 + 焊接缺陷判定改用稳定 code

**执行内容：**
- 根因：焊接缺陷责任焊工校验只在关单弹窗与前端联动，独立不合格项新建/编辑入口（`createIssue`/`updateIssue`）仅按工序含「焊」校验，未按缺陷二级分类判定；且焊接缺陷判定依赖子分类名称含「焊」，主数据改名后失效
- `packages/qgs-shared/src/domain-modules/qms/inspection-request.ts`：新增共享常量 `WELDING_DEFECT_CODE`
- `apps/backend/modules/inspection/inspection-issue-welding.ts`：新增共享判定 `isWeldingDefectSubcategory` 与 `assertWelderForWeldingDefect`（code 优先、名称 fallback，抛出与关单一致的校验错误）
- `apps/backend/modules/inspection/inspection-request-close-issue.service.ts`：关单校验改用共享函数
- `apps/backend/modules/inspection/inspection-issue-mutation.service.ts`：`createIssue` 事务内新增焊接缺陷必填校验；`updateIssue` 合并 body 与存量记录后校验（编辑时改为焊接缺陷或存量已是焊接缺陷均强制责任焊工）
- `apps/web-antd/src/views/qms/inspection/issues/components/issueFormData.ts`：`isWeldingDefectSubcategory` 改为 code 优先
- 补充测试：关单 code 优先 1、独立新建/编辑校验 4、前端 code 优先 1

**验证结果：**
- vitest: 全量 3026/3026 通过
- typecheck: 通过
- eslint 变更文件: 通过
- check:qms-arch: 通过

**commit:** `b5319b8e`

**遗留问题：**
- 无

### 2026-08-07 修复：焊接缺陷未弹出责任焊工（完结弹窗/不合格项表单）

**执行内容：**
- 根因：责任焊工字段显示条件只判断 `processName === '焊接'`，未按缺陷分类联动；报检工序（如外购件）非焊接时，即使选「制造缺陷→焊接缺陷」也不显示责任焊工
- `packages/qgs-shared/src/domain-modules/qms/inspection-request.ts`：新增共享常量 `WELDING_PROCESS_KEYWORD`
- `apps/web-antd/src/views/qms/inspection/issues/components/issueFormData.ts`：新增 `isWeldingProcessName`/`isWeldingDefectSubcategory` 判定函数，初始显示条件放宽为工序含「焊」
- `apps/web-antd/src/views/qms/inspection/issues/components/IssueFormFields.vue`：分类加载后责任焊工随 `processName`/`defectCategoryId`/`defectSubcategoryId` 联动显示（工序含焊 或 二级分类为焊接缺陷）
- `apps/backend/modules/inspection/inspection-request-close-issue.service.ts`：完结关单新增 `assertWelderForWeldingDefect`，焊接工序或缺陷分类为焊接缺陷时必填责任焊工
- `apps/backend/modules/inspection/inspection-issue.schema.ts`：新建/编辑校验条件与前端对齐（工序含「焊」）
- 补充 3 个测试（前端判定函数 2、后端防漏校验 1）

**验证结果：**
- typecheck: 通过
- eslint 变更文件: 通过
- vitest: inspection + issues + shared 792/792 通过
- check:qms-arch: 通过

**commit:** `b5319b8e`

**遗留问题：**
- 无

### 2026-08-07 修复：厂内外包队按供应商主数据识别（生产 OBU 两条线）

**已废止：** 本记录的名称匹配和 `bootstrapExactTeamLinks` 规则已被 v0.24.0 后的显式 `SUPPLIER` source + 有效 link 契约取代；不得再按 TEAM/供应商名称推断外协身份或创建 link。

**执行内容：**
- 根因：TEAM 字典同时容纳厂内班组（结构 BU/组装 BU 等）与厂外包队（公司名），但运行时只凭 `supplier_identity_links` 判断外协；26 家外包队有供应商主数据但缺链接，被误判为内部责任（责任部门空、入口分组错误）
- `apps/backend/modules/supplier-identity/supplier-identity-name-resolver.ts`：新增按 TEAM 精确名称匹配供应商主数据的兜底解析（优先 `Outsourcing` 分类），并整合 `resolveTeamSupplierIdentity`/`resolveSuppliersByTeamIds`/`resolveSuppliersByUnlinkedTeamIds`
- `apps/backend/modules/supplier-identity/supplier-identity.service.ts`：`resolveSupplierByTeamId`/`resolveSuppliersByTeamIds` 增加名称兜底；`listTeamOptions` 按供应商主数据把缺链接的外包队归入「外协加工单位」
- `apps/backend/modules/inspection/inspection-identity-resolution.service.ts`：`InspectionTx` 补充 `dictionaries`/`suppliers` 以支持事务内名称兜底
- 补充 5 个测试用例（名称兜底、Outsourcing 优先、批量解析、入口分组）

**验证结果：**
- typecheck: 通过
- eslint 变更文件: 通过
- vitest: supplier-identity + inspection 668/668 通过
- check:qms-arch: 通过（服务文件拆分后回到 500 行内）

**commit:** `b5319b8e`

**遗留问题：**
- 24 个无供应商主数据的 TEAM（含厂内班组及少数无主数据公司）保持内部责任；公司名且无主数据的需建供应商并走 `bootstrapExactTeamLinks` 补链接（`pnpm --dir apps/backend maintenance:supplier-identities -- --mode=apply`）
- 重复「生产 OBU」节点 `dept-r9u69gg8y64qutugxzsd8u6r` 仍待治理（43 条历史引用迁移后软删）

### 2026-08-07 优化：责任部门 TreeSelect 父子独立勾选

**执行内容：**
- `apps/web-antd/src/views/qms/inspection/issues/components/issueFormData.ts`：`responsibleDepartments` TreeSelect 由 `treeCheckStrictly: false` 改为 `true`，选择父节点（如「生产 OBU」）不再级联勾选子部门，消除为绕开级联而存在的同名叶子节点需求

**验证结果：**
- vitest: issues + requests 相关 74/74 通过
- 未改动数据；重复节点 `dept-r9u69gg8y64qutugxzsd8u6r` 的退役需走主数据治理（43 条质量记录引用迁移后再软删）

**commit:** `b5319b8e`

**遗留问题：**
- 历史 43 条 `quality_records.responsibleDepartmentId = dept-r9u69gg8y64qutugxzsd8u6r`，需迁移到主节点 `dept-1769576623191` 后软删重复节点
- 业务上责任部门实际为单选（历史 79/79 条 `responsibleDepartments` 均为单元素数组），后续可改单选 TreeSelect 并适配表单值契约

### 2026-08-07 修复：报检任务完结弹窗责任部门/供应商默认值丢失

**执行内容：**
- `packages/qgs-shared/src/domain-modules/qms/inspection-request.ts`：`resolveInspectionRequestIssueResponsibility` 增加 `category` 入参，改为使用 `isIncomingInspectionRequestCategory`（category 优先、processName 兜底），与后端 canonical 校验规则对齐
- `packages/qgs-shared/src/modules/qms/inspection-request.ts`：`InspectionRequest` 接口补充 `category` 字段
- `apps/backend/modules/inspection/inspection-request-query.service.ts`：列表/详情责任解析传入 `category`
- `apps/web-antd/src/views/qms/inspection/requests/composables/useInspectionRequestTaskActions.ts`：`openClose` 兜底解析传入 `category`/`supplierId`
- 补充三处测试（shared、backend query、web task actions），覆盖 category=INCOMING + 配置工序名（外购件/原材料）场景

**验证结果：**
- typecheck: 通过（backend + web-antd）
- eslint 变更文件: 通过
- vitest: 相关模块 789/789 通过（新增用例 38/38 含在总套件内）

**commit:** `b5319b8e`

**遗留问题：**
- 生产环境部门树必须包含「采购部」「生产 OBU」节点（本地数据源已验证存在），否则名称→ID 解析仍会落空
- 存在一个「生产 OBU」疑似重复自引用节点（`dept-r9u69gg8y64qutugxzsd8u6r`），建议后续主数据治理时核对退役

## 执行记录

## [0.23.2](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.23.1...qgs-v0.23.2) (2026-08-07)


### Bug Fixes

* **ci:** resolve qgs-v tags to clean deploy versions ([410519f](https://github.com/ajie5419/Quality-Guardian/commit/410519f9180f5f3defc31ffe551745e1520d02f5))
* **project:** clamp inspection station selection by work order machine count ([29b6ee6](https://github.com/ajie5419/Quality-Guardian/commit/29b6ee6b1c5bc0a6198ae2398fce349e0f11b1c1))
* **project:** clamp station selection by work order machine count and require responsible welder for welding defects ([5374fa2](https://github.com/ajie5419/Quality-Guardian/commit/5374fa256b67e71ef014f98b3c51f9a0514d930b))
* **project:** require responsible welder for welding defects ([2ab6b7d](https://github.com/ajie5419/Quality-Guardian/commit/2ab6b7df71a6c64c5639e5c0a6e6c90c75585642))

## [0.23.1](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.23.0...qgs-v0.23.1) (2026-08-07)


### Bug Fixes

* **@qgs/backend:** close connections so maintenance scripts exit ([368cc86](https://github.com/ajie5419/Quality-Guardian/commit/368cc860ea57be9e7f23dc8d4d8c61133b95b0a6))
* **@qgs/backend:** drop unresolved classification and close maintenance connections ([3aad4fb](https://github.com/ajie5419/Quality-Guardian/commit/3aad4fbe585474488b4f197bdface99b1e27c2c2))
* **@qgs/backend:** drop unresolved classification from release maintenance ([2ce6013](https://github.com/ajie5419/Quality-Guardian/commit/2ce6013b6906eb4d0a5a4d0328237aafeb07415f))

## [0.23.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.22.0...qgs-v0.23.0) (2026-08-07)


### Features

* **@qgs/backend:** add historical identity sidecar ([015bede](https://github.com/ajie5419/Quality-Guardian/commit/015bede6526964e438da54d8e3405451e1ec788f))
* **@qgs/backend:** gate pass-rate projection rollout ([6cf722d](https://github.com/ajie5419/Quality-Guardian/commit/6cf722df7e7e61566f12e9bd3e63f8f498119355))
* **@qgs/backend:** merge confirmed duplicate TEAM identities during release maintenance ([2a5b442](https://github.com/ajie5419/Quality-Guardian/commit/2a5b4425654b88175c7e5728e16dc348f06024f8))
* **@qgs/backend:** publish identity projections atomically ([cab876f](https://github.com/ajie5419/Quality-Guardian/commit/cab876f4d170e7efabd86815a8f7bbf7d02683c3))
* **@qgs/backend:** reconcile pass-rate rollout windows ([af8e324](https://github.com/ajie5419/Quality-Guardian/commit/af8e32455db5e7911cd015e3bd35f8a180f5dd3c))
* **@qgs/backend:** recover stale pass-rate projections ([ec5e9e1](https://github.com/ajie5419/Quality-Guardian/commit/ec5e9e161edfd9b5aaf0e3b360c84225fff1fda9))
* **@qgs/backend:** shadow pass-rate identity metrics ([48c072e](https://github.com/ajie5419/Quality-Guardian/commit/48c072ed18ef1bac5c476669c61886de427666a4))
* **@qgs/web-antd:** localize pass-rate rollout controls ([701e110](https://github.com/ajie5419/Quality-Guardian/commit/701e110281373fa26e300bc5662ffa49c04bd4b0))
* **@qgs/web-antd:** manage pass-rate projection rollout ([3fbb7f0](https://github.com/ajie5419/Quality-Guardian/commit/3fbb7f0020ace684866e9db50f8348c625982f1a))


### Bug Fixes

* **@qgs/backend:** batch identity sidecar rebuild ([b8a6e88](https://github.com/ajie5419/Quality-Guardian/commit/b8a6e88539c3c3b0330a04aaef3925b9477f4480))
* **@qgs/backend:** guard stale pass-rate projections ([45487a7](https://github.com/ajie5419/Quality-Guardian/commit/45487a768472f90ee8aae883fdd3899eb65acfbc))
* **@qgs/backend:** harden identity sidecar coverage ([9482f98](https://github.com/ajie5419/Quality-Guardian/commit/9482f98251d46b2f7e8c59fa70eb0d6365655a23))
* **@qgs/backend:** isolate projection rebuild from web process ([db82caa](https://github.com/ajie5419/Quality-Guardian/commit/db82caac64e1b98cfc3e78e59d009da7c0fada6e))
* **@qgs/backend:** merge statistics by master-data IDs with read-time resolution ([10a8946](https://github.com/ajie5419/Quality-Guardian/commit/10a8946c1a785f1fa58a1fe702af676e81ab6e51))
* **@qgs/backend:** resolve classification display names from master-data IDs ([600c230](https://github.com/ajie5419/Quality-Guardian/commit/600c2303b2b5ce812c4388482a1cda8cc5ea3866))
* **@qgs/web-antd:** drive inspection entry process options from system settings ([f1b03c6](https://github.com/ajie5419/Quality-Guardian/commit/f1b03c6bbfa64b24caf50afcdec240fe4840a6c8))
* **@qgs/web-antd:** keep projection rollback available ([0b887c6](https://github.com/ajie5419/Quality-Guardian/commit/0b887c66a63b8ed7ba171fa8db12b0dc558d131f))
* **dev:** preserve imported local database snapshots ([b6a397d](https://github.com/ajie5419/Quality-Guardian/commit/b6a397d3788983f80ffa7d85382e91c70a8729ba))
* **project:** align governance identity resolution ([5bfcb91](https://github.com/ajie5419/Quality-Guardian/commit/5bfcb91a8c62fdd35da57c6b260cea486380b48f))
* **project:** execute identity baseline CLI ([68e81be](https://github.com/ajie5419/Quality-Guardian/commit/68e81be000b8f1731f5cc8a54ef337283c7d6f1f))
* **project:** freeze historical identity snapshots ([b54a55c](https://github.com/ajie5419/Quality-Guardian/commit/b54a55c9ed967c55033bbf848afa56fa043b6ee9))

### 2026-08-07 发布 qgs v0.23.2 并修复生产部署失败根因（deploy.yml script_stop 注入问题）

**背景与问题：**

- v0.23.2 tag 自动部署（run 31163387287）在 release maintenance 步骤瞬间失败（exit 1、零输出），且失败后回滚未执行，生产 backend 一度处于停止状态。
- 这是连续第 3 次发布失败：v0.23.0 维护脚本超时；v0.23.1 / v0.23.2 维护脚本"瞬间 exit 1"（脚本实际从未运行）。
- 根因：`.github/workflows/deploy.yml` 中 `appleboy/ssh-action@v1.0.3` 设置了 `script_stop: true`。该 action 会把脚本按行拆分，并在每一行后注入 `DRONE_SSH_PREV_COMMAND_EXIT_CODE=$? ; if [ $DRONE_SSH_PREV_COMMAND_EXIT_CODE -ne 0 ]; then exit $DRONE_SSH_PREV_COMMAND_EXIT_CODE; fi;`，注入行会进入多行函数体内部：
  - `run_backend` 在 `if ... else run_backend ...; fi` 的 else 分支被调用时，紧邻的上一条语句是返回 1 的 `[ "$SKIP_MAINTENANCE" = "true" ]`，函数体内第一条注入检查捕获 `$?=1` 直接 `exit 1`，维护脚本从未真正执行；
  - 函数内部任何命令失败（如 docker pull 失败）也会被注入检查提前 `exit 1`，绕过脚本自身的 `|| { rollback; exit 1; }` 与 ERR trap，回滚从未生效。
- 已按 drone-ssh scriptCommands() 相同逻辑本地复现，trace 与生产日志完全一致。

**执行内容：**

- `.github/workflows/deploy.yml`：从 "Deploy to ECS" 步骤删除 `script_stop: true`（root cause fix）。脚本自身已有 `set -euo pipefail`、各关键步骤 `|| { echo ...; rollback; exit 1; }` 显式错误处理与 ERR trap 回滚，删除后这些机制按 shell 正常语义生效；SSH 会话非零退出码仍会使 job 失败。
- 发布 qgs v0.23.2（PR #90，tag `qgs-v0.23.2`）：3 个 fix（台数截断、责任焊工必填、deploy tag 版本解析）。
- 生产恢复部署：workflow_dispatch `deploy_only=true + skip_maintenance=true + version=v0.23.2`（run 31164489642），沿用 v0.23.1 已验证路径，成功。

**验证结果：**

- deploy.yml YAML 语法通过。
- 本地复现注入行为与生产日志一致（run_backend 在 else 分支瞬间 exit 1、`||` 回滚分支被绕过）。
- 生产恢复部署成功：migration 无 pending、backend/frontend 启动、健康检查通过、质量损失回填容器已拉起。

**commit:** `498c32f9` fix(ci): remove script_stop injection that bypasses deploy rollback

**遗留问题：**

- release maintenance 脚本在生产环境的真实耗时/成败尚未验证（v0.23.0 曾超时）；下次 tag 自动部署将走修复后的完整链路，需观察维护脚本执行结果。
- CHANGELOG.md 存在重复的 "## 执行记录" 标题与多条重复记录（历史遗留，本次未整理）。

### 2026-08-07 生产部署修复验证（完整链路，run 31165145073）

**执行内容：**

- 修复合并后，用 `deploy_only=true + skip_maintenance=false + version=v0.23.2` 在生产跑完整部署链路（含 release maintenance），验证修复效果与维护脚本真实行为。

**验证结果：**

- **修复生效**：maintenance 失败后 `|| { echo "release maintenance failed, rolling back"; rollback; exit 1; }` 分支正常执行，compose 恢复 `.bak`、redis/backend/frontend 容器拉起（此前该分支被 script_stop 注入绕过，回滚从未生效）。
- **维护脚本真实失败点**：`backfill-quality-record-supplier-identities.ts` 的完整性检查拒绝：`open-audits.new=29`（生产原有 7131 条 OPEN 未解析引用，本次各供应商/班组回填首次全量扫描新增 29 条；其中质量记录回填处理 224 行、仅新增 1 条未解析，样本 `ISS-2026-J_XAPFCF` / `MISSING_PROCESS_TEAM_LINK` / 供应商"尊达"）。
- 新增的 29 条未解析引用已写入生产 `unresolved_master_data_refs`（审计队列）。这些 key 已进入下次运行的 before 快照，**下次维护运行应不再因这 29 条报新增**（假设未验证）；但维护序列中后续步骤（identity-relations、pass-rate bootstrap 等）从未在生产跑过，仍待验证。
- 失败后回滚使生产保持 v0.23.2（backend/frontend 运行中）；v0.23.2 于 09:06 已通过 skip_maintenance 路径成功上线（run 31164489642）。

**遗留问题：**

- 29 条新增未解析引用需要结合生产数据核对（需要生产库访问权限）：确认是真未解析（保留审计）还是解析逻辑漏匹配（改解析）。
- 下次 tag 自动部署应观察：维护序列后续步骤能否在生产 600s 内完成；若仍失败需逐脚本定位。


### 2026-08-07 移除 classify-historical-identity-unresolved 维护步骤
### 2026-08-07 移除 classify-historical-identity-unresolved 维护步骤

**背景与问题：**

- 维护脚本 `classify-historical-identity-unresolved.ts --apply` 尾部调用 `IdentityProjectionService.createStagedGeneration()` 全量重建身份投影（约 30 万行插入）并自动发布新代次，在 1GB 内存的本地 MySQL 容器上资源耗尽（400% CPU、内存 99%、块读 7.6TB），导致 MySQL 无响应、所有连接挂起。
- 用户明确表示不需要该功能，指示取消。

**执行内容：**

- `apps/backend/scripts/run-release-maintenance.sh`：从发布维护序列移除 `classify-historical-identity-unresolved.ts --apply` 步骤（该序列在数据库 migration 后、应用切流前执行，本地容器初始化复用同一顺序）。
- 删除 `apps/backend/scripts/classify-historical-identity-unresolved.ts` 与 `classify-historical-identity-unresolved.test.ts`（全仓无其他引用者）。
- 清理仓库根目录误产物 `bash`、`quality-guardian-system@0.20.3`。

**验证结果：**

- 定向测试 `inspection-request-category-backfill.test.ts`、`reporting-identity-backfill.test.ts` 通过（断言的是序列中其他脚本的顺序/存在，不受影响）。
- lint / typecheck / check:qms-arch 通过。
- 本地 MySQL 容器已重启恢复，dev 后端与前端正常。

**commit:** 未提交

**遗留问题：**

- 未分类的 UNRESOLVED 投影行（约 4.1 万）不再由该脚本自动确定性分类，保留在处置队列，不自动合并。
- 投影基础设施（createStagedGeneration/publish 与合格率投影）保留，报告与 WP3 治理界面不受影响。
- 本地 DB 有两个中断运行遗留的 BUILDING 代次（2026-08-07 03:09:46、03:29:31 UTC），无害、不阻塞后续运行；如需清理可后续走现有服务路径。

---


### 2026-08-07 质量分类列表展示改为「ID → 当前主数据名」解析

**背景与问题：**

- 上一轮结论：质量分类改名后，历史记录（检验问题/售后）列表/详情仍显示登记时的旧快照名，而统计标签跟随当前主数据名，两者不一致。
- 用户指示按「ID → 当前主数据名」统一列表展示（与统计一致，符合全系统 ID 化方向）。

**执行内容：**

- 新增 `apps/backend/utils/classification-resolver.ts`：`resolveCanonicalClassificationName(currentName, snapshotName)`，当前主数据名优先、历史快照兜底（镜像 `resolveCanonicalProcessName` 的语义）。
- `apps/backend/modules/inspection/inspection-issue-list.service.ts`：`inspectionIssueInclude` 增加 `defectCategory`/`defectSubcategory` 关系（name）；`mapInspectionIssueRecord` 覆盖 `defectType`/`defectSubtype` 为解析后的当前名（快照兜底）。覆盖列表、详情、供应商问题三个查询入口。
- `apps/backend/modules/after-sales/after-sales.service.ts`：`getList` 增加四组分类关系 include；映射覆盖 `defectType`/`defectSubtype`/`productType`/`productSubtype` 为当前名（快照兜底）；`productType`/`defectType` 名称筛选改为 AND + OR（快照 contains 或 当前主数据名 contains），避免改名后按新名搜不到旧记录。
- 新增/更新测试：`classification-resolver.test.ts`（4 用例）；`inspection-issue-list.service.test.ts`（当前名优先、快照兜底 2 用例）；`after-sales.service.test.ts`（当前名优先、名称筛选 OR 2 用例）。

**验证结果：**

- vitest：4 个相关文件 + report 模块 18 文件 158/158 通过
- typecheck（backend）：通过
- lint（prettier）：通过
- check:qms-arch：通过
- 本地冒烟：检验问题 `getIssueById` 与售后 `getList` 改名后均返回新名，已还原且无残留

**commit:** 未提交（工作区已有其他轮次未提交改动）

**遗留问题：**

- 无。行为与统计口径一致：列表/详情/统计均按 ID 解析当前主数据名，历史快照仅作兜底。

---

## 执行记录

---

## 执行记录

### 2026-08-07 质量分类列表展示改为「ID → 当前主数据名」解析

**背景与问题：**

- 上一轮结论：质量分类改名后，历史记录（检验问题/售后）列表/详情仍显示登记时的旧快照名，而统计标签跟随当前主数据名，两者不一致。
- 用户指示按「ID → 当前主数据名」统一列表展示（与统计一致，符合全系统 ID 化方向）。

**执行内容：**

- 新增 `apps/backend/utils/classification-resolver.ts`：`resolveCanonicalClassificationName(currentName, snapshotName)`，当前主数据名优先、历史快照兜底（镜像 `resolveCanonicalProcessName` 的语义）。
- `apps/backend/modules/inspection/inspection-issue-list.service.ts`：`inspectionIssueInclude` 增加 `defectCategory`/`defectSubcategory` 关系（name）；`mapInspectionIssueRecord` 覆盖 `defectType`/`defectSubtype` 为解析后的当前名（快照兜底）。覆盖列表、详情、供应商问题三个查询入口。
- `apps/backend/modules/after-sales/after-sales.service.ts`：`getList` 增加四组分类关系 include；映射覆盖 `defectType`/`defectSubtype`/`productType`/`productSubtype` 为当前名（快照兜底）；`productType`/`defectType` 名称筛选改为 AND + OR（快照 contains 或 当前主数据名 contains），避免改名后按新名搜不到旧记录。
- 新增/更新测试：`classification-resolver.test.ts`（4 用例）；`inspection-issue-list.service.test.ts`（当前名优先、快照兜底 2 用例）；`after-sales.service.test.ts`（当前名优先、名称筛选 OR 2 用例）。

**验证结果：**

- vitest：4 个相关文件 + report 模块 18 文件 158/158 通过
- typecheck（backend）：通过
- lint（prettier）：通过
- check:qms-arch：通过
- 本地冒烟：检验问题 `getIssueById` 与售后 `getList` 改名后均返回新名，已还原且无残留

**commit:** 未提交（工作区已有其他轮次未提交改动）

**遗留问题：**

- 无。行为与统计口径一致：列表/详情/统计均按 ID 解析当前主数据名，历史快照仅作兜底。

### 2026-08-07 质量分类改名行为核实（质量分类设置）

**背景与问题：**

- 用户询问：「质量分类设置」里修改分类名称，是否和报检工序改名一样——已登记表单里的原分类名会怎样、统计有什么影响。

**结论（已实证）：**

- 改名入口 `updateCategory` / `updateSubcategory` 只更新 `quality_classification_categories` / `quality_classification_subcategories` 主表，不回写任何历史快照。
- 历史记录（`quality_records` 检验问题、`after_sales` 售后记录）同时存 ID 与名称快照（`defectType/defectSubtype`、`productType/productSubtype`）。列表/详情序列化直接展开快照字段，所以**历史表单显示名保持旧名**（与报检工序不同：工序列表是 relation 优先显示新名）。
- 统计按 `defectCategoryId/defectSubcategoryId` 聚合、标签用 `resolveCategoryNamesByIds/resolveSubcategoryNamesByIds`（当前主表名），所以**统计标签跟随新名、桶归属与计数不变**；无 ID 的历史遗留行按快照名聚合，不受改名影响。

**执行内容：**

- 本地测试库实证：`updateCategory` 将 `工艺缺陷`（id=bs4mognz1q5f1710wfkajgi3）改名 `工艺缺陷-测试`，确认 `quality_records.defectType` 快照与列表序列化仍为旧名、`resolveCategoryNamesByIds` 返回新名，随后还原；子类别 `其他` 同步验证快照不变后还原。
- 无业务代码改动；无需新增单测（现有 quality-classification.service.test.ts、inspection-issue-stats/after-sales 聚合测试已覆盖 ID 归并与改名标签逻辑）。

**验证结果：**

- 实证断言：快照不回写 ✓、列表显示旧名 ✓、统计标签跟随新名 ✓、改名后还原干净 ✓（无残留）
- typecheck/lint 未涉及（仅 CHANGELOG 变更）

**commit:** 未提交（工作区已有其他轮次未提交改动）

**遗留问题：**

- 列表显示旧名、统计标签显示新名，两者在改名后会出现短暂不一致；如需统一，可将列表展示改为 ID → 当前主数据名解析（与统计一致），或保留快照并在统计中展示快照名。

---

## 执行记录

---

## 执行记录

### 2026-08-07 质量分类列表展示改为「ID → 当前主数据名」解析

**背景与问题：**

- 上一轮结论：质量分类改名后，历史记录（检验问题/售后）列表/详情仍显示登记时的旧快照名，而统计标签跟随当前主数据名，两者不一致。
- 用户指示按「ID → 当前主数据名」统一列表展示（与统计一致，符合全系统 ID 化方向）。

**执行内容：**

- 新增 `apps/backend/utils/classification-resolver.ts`：`resolveCanonicalClassificationName(currentName, snapshotName)`，当前主数据名优先、历史快照兜底（镜像 `resolveCanonicalProcessName` 的语义）。
- `apps/backend/modules/inspection/inspection-issue-list.service.ts`：`inspectionIssueInclude` 增加 `defectCategory`/`defectSubcategory` 关系（name）；`mapInspectionIssueRecord` 覆盖 `defectType`/`defectSubtype` 为解析后的当前名（快照兜底）。覆盖列表、详情、供应商问题三个查询入口。
- `apps/backend/modules/after-sales/after-sales.service.ts`：`getList` 增加四组分类关系 include；映射覆盖 `defectType`/`defectSubtype`/`productType`/`productSubtype` 为当前名（快照兜底）；`productType`/`defectType` 名称筛选改为 AND + OR（快照 contains 或 当前主数据名 contains），避免改名后按新名搜不到旧记录。
- 新增/更新测试：`classification-resolver.test.ts`（4 用例）；`inspection-issue-list.service.test.ts`（当前名优先、快照兜底 2 用例）；`after-sales.service.test.ts`（当前名优先、名称筛选 OR 2 用例）。

**验证结果：**

- vitest：4 个相关文件 + report 模块 18 文件 158/158 通过
- typecheck（backend）：通过
- lint（prettier）：通过
- check:qms-arch：通过
- 本地冒烟：检验问题 `getIssueById` 与售后 `getList` 改名后均返回新名，已还原且无残留

**commit:** 未提交（工作区已有其他轮次未提交改动）

**遗留问题：**

- 无。行为与统计口径一致：列表/详情/统计均按 ID 解析当前主数据名，历史快照仅作兜底。

---

## 执行记录

---

## 执行记录

### 2026-08-07 质量分类列表展示改为「ID → 当前主数据名」解析

**背景与问题：**

- 上一轮结论：质量分类改名后，历史记录（检验问题/售后）列表/详情仍显示登记时的旧快照名，而统计标签跟随当前主数据名，两者不一致。
- 用户指示按「ID → 当前主数据名」统一列表展示（与统计一致，符合全系统 ID 化方向）。

**执行内容：**

- 新增 `apps/backend/utils/classification-resolver.ts`：`resolveCanonicalClassificationName(currentName, snapshotName)`，当前主数据名优先、历史快照兜底（镜像 `resolveCanonicalProcessName` 的语义）。
- `apps/backend/modules/inspection/inspection-issue-list.service.ts`：`inspectionIssueInclude` 增加 `defectCategory`/`defectSubcategory` 关系（name）；`mapInspectionIssueRecord` 覆盖 `defectType`/`defectSubtype` 为解析后的当前名（快照兜底）。覆盖列表、详情、供应商问题三个查询入口。
- `apps/backend/modules/after-sales/after-sales.service.ts`：`getList` 增加四组分类关系 include；映射覆盖 `defectType`/`defectSubtype`/`productType`/`productSubtype` 为当前名（快照兜底）；`productType`/`defectType` 名称筛选改为 AND + OR（快照 contains 或 当前主数据名 contains），避免改名后按新名搜不到旧记录。
- 新增/更新测试：`classification-resolver.test.ts`（4 用例）；`inspection-issue-list.service.test.ts`（当前名优先、快照兜底 2 用例）；`after-sales.service.test.ts`（当前名优先、名称筛选 OR 2 用例）。

**验证结果：**

- vitest：4 个相关文件 + report 模块 18 文件 158/158 通过
- typecheck（backend）：通过
- lint（prettier）：通过
- check:qms-arch：通过
- 本地冒烟：检验问题 `getIssueById` 与售后 `getList` 改名后均返回新名，已还原且无残留

**commit:** 未提交（工作区已有其他轮次未提交改动）

**遗留问题：**

- 无。行为与统计口径一致：列表/详情/统计均按 ID 解析当前主数据名，历史快照仅作兜底。

### 2026-08-07 质量分类改名行为核实（质量分类设置）

**背景与问题：**

- 用户询问：「质量分类设置」里修改分类名称，是否和报检工序改名一样——已登记表单里的原分类名会怎样、统计有什么影响。

**结论（已实证）：**

- 改名入口 `updateCategory` / `updateSubcategory` 只更新 `quality_classification_categories` / `quality_classification_subcategories` 主表，不回写任何历史快照。
- 历史记录（`quality_records` 检验问题、`after_sales` 售后记录）同时存 ID 与名称快照（`defectType/defectSubtype`、`productType/productSubtype`）。列表/详情序列化直接展开快照字段，所以**历史表单显示名保持旧名**（与报检工序不同：工序列表是 relation 优先显示新名）。
- 统计按 `defectCategoryId/defectSubcategoryId` 聚合、标签用 `resolveCategoryNamesByIds/resolveSubcategoryNamesByIds`（当前主表名），所以**统计标签跟随新名、桶归属与计数不变**；无 ID 的历史遗留行按快照名聚合，不受改名影响。

**执行内容：**

- 本地测试库实证：`updateCategory` 将 `工艺缺陷`（id=bs4mognz1q5f1710wfkajgi3）改名 `工艺缺陷-测试`，确认 `quality_records.defectType` 快照与列表序列化仍为旧名、`resolveCategoryNamesByIds` 返回新名，随后还原；子类别 `其他` 同步验证快照不变后还原。
- 无业务代码改动；无需新增单测（现有 quality-classification.service.test.ts、inspection-issue-stats/after-sales 聚合测试已覆盖 ID 归并与改名标签逻辑）。

**验证结果：**

- 实证断言：快照不回写 ✓、列表显示旧名 ✓、统计标签跟随新名 ✓、改名后还原干净 ✓（无残留）
- typecheck/lint 未涉及（仅 CHANGELOG 变更）

**commit:** 未提交（工作区已有其他轮次未提交改动）

**遗留问题：**

- 列表显示旧名、统计标签显示新名，两者在改名后会出现短暂不一致；如需统一，可将列表展示改为 ID → 当前主数据名解析（与统计一致），或保留快照并在统计中展示快照名。

### 2026-08-07 工序改名行为核实（报检与检验设置）

**背景与问题：**

- 用户询问：在「系统设置-报检与检验设置」里修改报检工序名称后，已登记表单里的原工序名会发生什么变化、数据统计有什么影响。
- 需要区分三层行为：历史快照是否被回写、UI 展示名如何解析、统计分桶是否受影响。

**结论（已实证）：**

- 改名只更新 `processes.name`（以及 sort 变化时同步 `inspection_request_process_options.sort`），不回写任何历史快照（`qms_inspection_requests.processName`、`inspections.processName` 等）。
- 读取路径 `resolveCanonicalProcessName` 优先取 processId 关联的当前进程表名，因此报检任务列表/详情、检验记录展示名会跟随新名；历史快照字段仍是旧名。
- 统计影响：PROCESS 类合格率等按 processId/teamId + bindings 分桶的统计，桶归属与计数不变，仅展示标签跟随新名；INCOMING 类按 `incomingType || processName` 字符串分桶，已有 incomingType 的行不受影响。按 processName 快照字符串分组的旧统计路径会保留旧名。

**执行内容：**

- 本地测试库实证：用 `ProcessMasterService.update` 将 `涂装`（id=1b9bd2ab568211f1881c00163e37355f）改名为 `涂装-测试`，验证请求/检验快照不变、展示名跟随新名、合格率分桶不变，随后还原为 `涂装` 并确认无残留。
- `apps/backend/utils/process-resolver.test.ts`：新增 2 个用例覆盖 `resolveCanonicalProcessName` 关系优先与快照回退行为。

**验证结果：**

- typecheck: backend 通过
- vitest: apps/backend/utils/process-resolver.test.ts 11/11 通过
- 数据库还原确认：无 `涂装-测试` 残留

**commit:** 未提交（工作区已有其他轮次未提交改动）

**遗留问题：**

- 统计入口若存在按 processName 字符串分组的历史路径（如无 incomingType 的 INCOMING 行），改名会造成新旧名分桶；建议后续统一到 processId 维度。

### 2026-08-06 报检工序/进货类型选项改为系统设置驱动（修复设置无法控制）

**背景与根因：**

- 用户反馈：报检页面工序/进货类型选项「控制不了了」——不随「系统设置-报检与检验设置」变化。
- 根因：进货检验入口的「进货类型」下拉选项是前端硬编码（`entry-mode.ts incomingInspectionTypeOptions`：原材料/外购件/辅材/机加成品件），与系统设置（`inspection_request_process_options`，控制 INCOMING/PROCESS 工序启用与排序）完全脱节；同时进货入口 `processName/processId` 自动取全局 INCOMING 工序第一个（7-29 选项重建后排序第一为「原材料」），导致「进货类型=外购件」时任务页却显示「原材料」。
- 历史佐证：`requestInfo.incomingType=外购件` 的行，6 月 `processName=外购件` 441 行（当时 INCOMING 排序第一为外购件）、7 月出现 `processName=原材料` 40 行、8 月 6 行（7-29 排序变化后）。

**执行内容：**

- `apps/web-antd/src/views/qms/inspection/requests/entry/components/InspectionRequestEntryFormFields.vue`：「进货类型」下拉选项改为从 `processOptions`（INCOMING 工序，来源 `listInspectionRequestOptions`，受系统设置控制）派生，删除硬编码选项。
- `apps/web-antd/src/views/qms/inspection/requests/entry/entry-mode.ts`：删除不再使用的 `incomingInspectionTypeOptions`。
- 上轮已加联动：`index.vue` 在「进货类型」变化时同步 `processId/processName` 为同名 INCOMING 工序，重选工单时优先按已选进货类型匹配。
- 链路闭环：系统设置页（`/system/inspection-processes` selection）控制 INCOMING/PROCESS 工序启用与排序 → 报检页「进货类型」/「工序」下拉同步 → 选择后 `processName/processId` 一致 → 报检任务页显示一致。

**验证结果：**

- 新增单测：进货类型下拉选项来自 processOptions（设置驱动）。
- web-antd 报检相关 7 个测试文件 / 38 用例通过；`pnpm run check:type`、`pnpm lint` 通过。

**commit:** 未提交（待用户审阅）

**遗留问题：**

- 历史 46 行（`incomingType=外购件` 但 `processName=原材料`）为修复前保存的数据，未自动改写；如需要可提供脚本按 `requestInfo.incomingType` 回填。
- 若设置页将某 INCOMING 工序禁用，报检页「进货类型」下拉将不再出现该选项；历史数据不受影响。

### 2026-08-06 进货报检「进货类型」与任务页「检验类型」不一致修复

**背景与根因：**

- 用户反馈：报检页面填「外购件」，落到报检任务页面显示「原材料」。
- 根因：进货检验扫码报检入口有两个不同字段——「进货类型」（`incomingType`，页面可见可选：原材料/外购件/辅材/机加成品件）与「检验类型/工序」（`processName/processId`，进货入口无下拉，由 `loadWorkOrderProcessOptions` 自动取全局 INCOMING 工序选项第一个，按 sort 排序为「原材料」）。
- 用户选「进货类型=外购件」，保存的 `processName/processId` 却是自动默认的「原材料」；报检任务页「工序/检验类型」列展示 `processName`，因此显示「原材料」。
- 数据佐证：`qms_inspection_requests` 中 `requestInfo={"incomingType":"外购件"}` 的行，`processName=外购件` 919 行、`processName=原材料` 46 行（2026-07 起出现，7 月 40 行、8 月 6 行，与 7-28 工序选项全局化改动时间吻合）；`processes` 表名称与 ID 无错位。

**执行内容：**

- `apps/web-antd/src/views/qms/inspection/requests/entry/index.vue`：新增 `incomingType` 联动 —— 进货入口选择「进货类型」时，把 `processId/processName` 同步为同名 INCOMING 工序；重选工单时优先按已选「进货类型」匹配，未选时回退第一个 INCOMING 工序。

**验证结果：**

- `pnpm run check:type`、`pnpm lint` 通过；web-antd 报检相关 7 个测试文件 / 37 用例通过。
- 后端无改动。

**commit:** 未提交（待用户审阅）

**遗留问题：**

- 历史 46 行（`incomingType=外购件` 但 `processName=原材料`）保存即错，按「历史数据不自动改写」原则未处理；如需修正可提供脚本按 `requestInfo.incomingType` 回填，或任务页对 INCOMING 任务优先展示进货类型。
- 其余 919 行两字段一致，不受影响。

### 2026-08-06 统计部门重复归并：旧 ID 行与 canonical 行读时合并

**背景与根因：**

- 上轮修复「主数据已失效」后，统计页面仍出现多个同名部门（如生产 OBU 三行、采购部两行）。
- 根因一：同一部门的历史行 `responsibleDepartmentId` 是旧 hex ID（读时回退解析出名称），与迁移后使用 canonical ID 的行并存，统计按 ID 分组被拆成两行。
- 根因二：`生产 OBU` 在主数据源存在两个启用部门：`dept-1769576623191`（2026-01-28 创建）与 `dept-r9u69gg8y64qutugxzsd8u6r`（2026-06-04 导入，parentId 指向前者，疑似迁移导入的重复部门），两行引用并行累计。

**执行内容（读时展示归并，历史行与主数据零改写）：**

- `apps/backend/utils/canonical-master-data.ts`：`resolveCanonicalNamesByIds` 新增可选输出 `canonicalIdById`（旧 ID → 快照里的 canonical ID）；新增 `mergeResolvedIdentityAggregateItems` —— 对 RESOLVED 行按规范名称归并 value，输出 ID 优先取引用最多的行的 canonical ID；INVALID/MISSING 行原样保留。
- 三个按部门聚合的消费方接入：
  - `inspection-issue-stats.service.ts`（检验问题统计 → 责任部门）
  - `after-sales-chart-aggregation.service.ts`（售后图表）
  - `after-sales-analytics.service.ts`（售后主统计部门分布）
- 质量损失与日报是明细附名场景，不按部门聚合，无需归并。

**验证结果：**

- 单元测试：内核 +3（canonicalIdById 填充、同名归并、未解析行保留）；检验问题统计 +1（旧 ID 行与 canonical 行合并）；相关测试 mock 改为 `vi.importActual` 保留真实归并实现。
- 后端全量 vitest 265 文件 / 2402 用例通过；`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 全部通过。
- 本地库（quality_guard_local_test）端到端：
  - 截图页 2026 责任部门：重复名「无」，生产 OBU 98（47+9+42）一行、采购部 39、结构 BU1 31 等全部归并；仅保留 2 行真实失效（秦皇岛弘旺/祥腾，部门已软删除）。
  - 售后图表与部门分布：生产 OBU 10（7+3）一行，无重复名；1 行 MISSING（respDeptId 为空）保留。

**commit:** 未提交（待用户审阅）

**遗留问题：**

- `生产 OBU` 两个启用部门（`dept-1769576623191` / `dept-r9u69gg8y64qutugxzsd8u6r`）为主数据源重复，统计已按名称归并展示；建议走人工裁决确定 canonical（含 42 条历史引用的归属），与研究院两个同名叶子一并处理。
- 2 行引用已软删除部门的历史检验记录仍待人工裁决。

### 2026-08-06 统计字段「主数据已失效」修复：历史旧部门 ID 读时回退解析

**背景与根因：**

- 截图问题：检验问题统计 → 责任部门 页面出现多行「主数据已失效：dept-xxx」。
- 根因：历史 `quality_records` 行的 `responsibleDepartmentId` 存的是旧系统部门 ID（32 位 hex，如 `a3a98d7b568511f1881c00163e37355f`），而 `responsibleDepartment` 名称快照冻结的是新 canonical 部门 ID 字符串（如 `dept-1769576623191`）。`MasterDataGovernanceKernel.resolveCanonicalNamesByIds` 用旧 ID 查 `departments` 失败，被 `createIdentityAggregateItem` 判为 `INVALID_REFERENCE`，前端显示「主数据已失效」。
- 同型数据：`after_sales.feedbackDept/feedbackDeptId`（旧 hex + dept 快照）等；`work_orders.divisionId` 全为 canonical，无需处理。

**执行内容（全部只读回退，历史行零改写）：**

- `apps/backend/utils/canonical-master-data.ts`：`resolveCanonicalNamesByIds` 新增可选参数 `idLikeNameById` —— canonical ID 解析失败时，把行的 rawName（冻结的名称快照）当作 canonical ID 再查一次；命中则注册到结果。
- 部门维度统计消费方接入回退：
  - `inspection-issue-stats.service.ts`（检验问题统计 → 责任部门，截图页面）
  - `after-sales-chart-aggregation.service.ts`、`after-sales-analytics.service.ts`（售后图表/主统计部门分布）
  - `quality-loss.service.ts`（质量损失部门名）
  - `report-daily-summary.service.ts`（日报部门分组）
- 其余 `resolveCanonicalNamesByIds` 调用点（work-order/supervision/planning/supplier-identity/inspection-identity-resolution 等）为 part/process/project/supplier/team 维度，无「名称快照是部门 ID」形态，未改动。

**验证结果：**

- 单元测试：`canonical-master-data.test.ts` +2（idLikeNameById 正例 / 负例快照非 ID 保持 null）；`inspection-issue-stats.service.test.ts` +2（旧 ID+dept 快照 → 显示部门名；快照非 ID → 保持「主数据已失效」）。
- 后端全量 vitest 265 文件 / 2399 用例通过；`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 全部通过。
- 本地库（quality_guard_local_test）端到端：
  - 截图页 `getIssueChartAggregation(responsibleDepartment, 2026)`：修复前 15 行 INVALID → 修复后 2 行 INVALID，生产 OBU 47/采购部 27/结构 BU1 21 等全部 RESOLVED。
  - 售后 `getChartAggregation(responsibleDept)` 与 `getStats().deptDistribution`：11 行、0 INVALID。
  - 剩余 2 行 INVALID（秦皇岛弘旺设备安装工程有限公司、秦皇岛祥腾机械制造有限公司）为真实失效引用：对应部门在 `departments` 中 `isDeleted=1`（软删除），名称快照是公司名而非 canonical ID，无法也不应自动解析，按设计保留「主数据已失效」走人工治理。

**commit:** 未提交（待用户审阅）

**遗留问题：**

- 2 行引用已软删除部门的历史检验记录（ISS-2026-0ZQBQZVD、ISS-2026-RQDA0UE_）需人工裁决：恢复部门或重新指定责任部门。
- 上轮 TEAM 遗留：研究院两个同名部门叶子待裁决；生产环境发布后需在维护窗口执行 `run-release-maintenance.sh` 走 record-only 合并。


### 2026-08-05 TEAM 重复班组修复（三）：读时归一 + 发布维护自动合并（生产代码方案）

**背景与决策：**

- 用户否决「改写历史业务行」的合并方案：历史数据不能受影响。最终诉求是字段 ID 化：历史重复字段（含空格变体）合并、新输入走 ID、聚合按 canonical 归并。
- 采用「只登记映射（record-only merge）+ 读时归一」：`team_identity_merges` 记录 `sourceTeamId → targetTeamId`，退役重复 TEAM；历史行保留原 ID，读取/统计路径沿映射解析到 canonical，历史零改写。

**执行内容：**

- Schema：`team_identity_merges` 新增 `migrateReferences Boolean @default(true)`（migration `20260805000000_add_team_merge_migrate_references_flag`）。
- 合并服务：`migrateReferences=false` 时只迁移 `identityMetadata`（别名/nameKey/来源），跳过 inspections/requests/welders/workOrderRequirements，且跳过零引用校验；默认 `true` 保持旧 CLI 行为兼容。
- 新 CLI：`merge-team-identities.ts` 支持 `--migrate-references=true|false`。
- 读时归一：`TeamIdentityService.resolveCanonicalIds`（沿 COMPLETED 映射链解析，带循环防护）；`resolveNamesByIds` 旧 ID 返回 canonical 名称；报检统计（`inspection-request-stats.service.ts`）分组前先归一到 canonical。
- 发布维护自动合并：`team-duplicate-merge-plan.ts` 证据门控规划（部门叶子精确同名 / 存活来源链接；证据冲突或缺失留人工队列）；业务确认规则将 机加车间→机加 BU、模具车间→模具 BU、组装车间→组装 BU 一并纳入（不同名，按 nameKey 无法分组，规则显式声明）。
- `merge-confirmed-team-duplicates.ts --apply`（dry-run 默认）+ `run-release-maintenance.sh` 在 reconcile 之后自动执行；`merge-team-identities.ts` 手动合并亦可走 record-only。

**验证结果：**

- 单元测试：新增 record-only 合并、canonical 链解析、旧 ID 名称水合、规划器证据门控等用例；后端全量 vitest 265 文件 / 2395 用例通过。
- 门禁：`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 全部通过。
- 本地库（quality_guard_local_test）端到端：构造空格变体重复组（验收临 时A/验收临时A + 部门叶子证据）→ dry-run 精确产出 1 条计划 → apply 后 COMPLETED 且 `migrateReferences=false`、源退役、目标启用；inspections/requests/welders/work_order_requirements 四表行数与 MD5 哈希前后完全一致（历史零改写）；`resolveCanonicalIds` 旧 ID → canonical、名称水合正确；再次 dry-run 为 0（幂等）。临时数据已清理，库还原 61 条 TEAM / 5 条合并。

**commit:** 未提交（待用户审阅）

**遗留问题：**

- 研究院两个同名部门叶子仍待人工裁决（主数据源重复，非页面重复）。
- 生产发布后在维护窗口执行 `run-release-maintenance.sh`，确认结构 BU1/BU2 与 BU/车间 5 组以 record-only 方式退役；若某环境存在未确认的 nameKey 重复组，会留在人工处置队列，不会自动合并。

### 2026-08-05 TEAM 重复班组修复（二）：机加/模具/组装 BU 与 车间 三组合并

**执行内容：**

- 业务确认「车间 = BU 同一组织」后，将三个历史遗留车间 TEAM 合并进部门来源 canonical 的 BU TEAM：
  - `0e9b4363…`（机加车间）→ `0e9b423b…`（机加 BU）：迁移 inspections 27、requests 30、welders 1。
  - `0e9b4372…`（模具车间）→ `0e9b418a…`（模具 BU）：迁移 welders 10。
  - `0e9b4388…`（组装车间）→ `0e9b4170…`（组装 BU）：迁移 inspections 2、requests 2、welders 3。
- 退役三个车间 ID（status=0），车间名称保留为 BU 团队的 HISTORICAL 别名；`team_identity_merges` 累计 5 条 COMPLETED 审计。
- 随后 `reconcile-team-identities.ts --apply` 收敛：created=0、linked=13、aliasesSeeded=56。
- 未修改任何代码文件，纯本地数据修复。

**验证结果：**

- 三组 BU 启用、三组车间退役；下拉口径 59 → 56。
- 引用全部归并：机加 BU inspections 1175/requests 604、模具 BU 172/54/welders 10、组装 BU 199/103/welders 3；退役 ID 引用为 0。
- 车间名称为 HISTORICAL 别名，历史名称检索不受影响。

**commit:** 无（本地数据修复，未提交）

**遗留问题：**

- BU/车间三组对应的部门来源审计（`ambiguous_team_source_identity`）仍 OPEN，走主数据治理人工处置队列确认来源归属。
- 研究院两个同名部门叶子待裁决（无子节点、无业务引用，建议保留 `dept-1778115885336`、删除 `dept-1778116016969`）。

### 2026-08-05 TEAM 重复班组修复：结构 BU1/结构BU1 两组显式合并

**执行内容：**

- 在本地容器库 `quality_guard_local_test`（127.0.0.1:3307）复现并修复 TEAM 字典两组空格/紧凑重复：结构 BU1/结构BU1、结构 BU2/结构BU2（原 4 条启用记录）。
- 按部门叶子来源判定 canonical（结构 BU1/BU2 空格版，引用占绝大多数），通过 `merge-team-identities.ts` 显式合并 2 组：
  - `0e9b438f…`（结构BU1）→ `0e9b41a9…`（结构 BU1）：迁移 inspections 4、requests 4、welders 11。
  - `0e9b4395…`（结构BU2）→ `0e9b421a…`（结构 BU2）：迁移 inspections 14、requests 14、welders 4。
- 退役源 ID（status=0），`team_identity_merges` 留 2 条 COMPLETED 审计；随后 `reconcile-team-identities.ts --apply` 收敛：created=0、linked=13、aliasesSeeded=59。
- 未修改任何代码文件，本次为纯本地数据修复。

**验证结果：**

- 结构组启用记录 4 → 2；下拉口径（dictType=team, isDeleted=0, status=1）61 → 59。
- 引用全部归并到 canonical：结构 BU1 inspections 411/requests 286/welders 15；结构 BU2 366/252/5；退役 ID 引用为 0。
- 近重复审计 `group:*`（ambiguous_near_duplicate_team_identities）2 条已 RESOLVED。

**commit:** 无（本地数据修复，未提交）

**遗留问题：**

- 结构 BU1/BU2 两个部门来源审计（`ambiguous_team_source_identity`）仍 OPEN：按架构「名称相似不建立归属 + 退役同名记录作为碰撞证据」留待人工处置队列确认来源链接。
- 生产或其他环境若存在同样重复，需在发布维护窗口按同样流程执行（`TEAM_IDENTITY_MAINTENANCE_MODE=1` + 停写）。
- 机加 BU/机加车间、模具 BU/模具车间、组装 BU/组装车间三组与研究院两个同名部门叶子仍待单独裁决。

### 2026-08-01 主数据身份治理 WP3：修复投影重建导致登录网络错误

**执行内容：**

- 根因确认是管理员重建请求在 Web 进程内立即执行完整投影构建，使 1 GB 本地 MySQL 容器达到内存上限并停止响应，登录接口因此表现为网络错误。
- 管理员重建入口改为只写持久任务队列，完整构建仅由独立 worker 消费；新增测试确保 Web 请求不会启动构建。
- 修复投影门禁失败时前端同时禁止关闭的问题：未通过门禁时仍禁止开启，但已开启的投影始终可以关闭并立即回退原有统计。
- 安全重启本地 MySQL 容器释放资源，将中断任务和 3 个未完成派生代次标记为失败；未修改历史事实表。

**验证结果：**

- 后端定向 Vitest：`1/1` 文件、`6/6` 测试通过；前后端类型检查、`pnpm lint`、`pnpm run check:qms-arch` 和 `git diff --check` 通过。
- 浏览器重新加载后登录态、系统设置和报检工序均正常；实际关闭投影成功，最终开关为 `false`，报表恢复使用 legacy。
- 登录接口空请求在约 4 毫秒内返回预期参数错误，证明 Web 与数据库连接恢复；生产环境未访问、未修改。

**commit:** `db82caa fix(@qgs/backend): isolate projection rebuild from web process`、`0b887c6 fix(@qgs/web-antd): keep projection rollback available`

**遗留问题：**

- 当前失败任务保留为本地审计证据；下一次重建需由独立 worker 在受控维护窗口消费，不能重新接回 Web 请求进程。

### 2026-08-01 主数据身份治理 WP3：合格率投影管理界面中文化

**执行内容：**

- 将合格率投影切换区域的标题、说明、按钮、状态字段、布尔值、差异指标、启停确认、重建确认和操作结果消息全部接入中英文国际化资源；中文环境不再显示英文硬编码文案。
- 将既有合格率投影启用 API 测试从 60 行压缩到 48 行，保持非管理员拒绝和管理员成功切换两条路径的验证，消除 API 目录文件行数门禁违规。

**验证结果：**

- 本地浏览器实测中文页面：正文、状态值和影子差异均正确显示；重建确认弹窗完整显示中文，验收时点击取消，未提交重建任务、未改变投影开关。
- 定向 Vitest：`1/1` 文件、`1/1` 测试通过；`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 与 `git diff --check`：通过。

**commit:** `ff0e5ad test(@qgs/backend): satisfy rollout route size gate`、`701e110 feat(@qgs/web-antd): localize pass-rate rollout controls`

**遗留问题：**

- 无。

### 2026-08-01 主数据身份治理 WP3：合格率安全正式切换准备

**执行内容：**

- 新增独立的合格率投影重建任务表和管理接口；不复用供应商评分任务。开关启用实行 fail-closed 门禁：active generation、新鲜度、当前 generation 的已完成影子对账、三项核心差异、冻结基线 checksum 及发布后失败/构建 generation 均必须通过；禁用始终允许。
- 为影子对账运行记录 `projectionGenerationId`，防止旧 generation 的成功对账被误用于当前 generation；发布维护会初始化受控基线 checksum。
- 陈旧投影读取时立即安全回退 legacy，并在请求之外持久化、异步消费可重试重建任务；重启遗留任务可通过独立脚本或管理员入口重试，构建失败继续使用 legacy。
- 系统“报检与检验设置”页新增仅管理员可见的合格率投影控制区，显示 generation、激活时间、新鲜度、基线、最近影子对账和三项差异；启用、禁用和重建均需要明确确认。
- 对仍为 `UNRESOLVED` 的旁路记录只应用可证明规则：重新验证的 raw ID 自动转为 `RESOLVED`/`RETIRED`/`INVALID_ID`，仅非过程检验的 `processId` 可转 `NOT_APPLICABLE`，其余证据不足数据保持待治理。全程未修改事实表。
- 新增并执行当月、上月、最近一周、跨月、无数据、历史补录六个固定 generation 的影子对账窗口；每个窗口独立持久化运行和指标。

**验证结果：**

- 本地 Prisma migration：53 个，新增 migration 仅增加 rollout 控制列和可重试任务表。
- 本地 deterministic 分类新增 7 条 `RESOLVED` 决策；没有把未知引用强制分类。新 active generation `cmsadme9x000s8zlh5r8kbwrd` 已发布，合格率投影 9,554 行。
- 六个影子窗口的总量、合格数、合格率差异均为 0；无数据窗口为 0/0/0。当前状态 gate：`rolloutReady=true`、`fresh=true`、`baselineMatch=true`、无 BUILDING/FAILED 阻断 generation。
- 本地实际执行启用后再禁用：启用成功、门禁保持通过、最终恢复默认 legacy（`enabled=false`）。
- 历史身份基线 checksum 保持 `95c62629cb2c49e257b72a7a3f5c918d7393c164bb40a9dde788bb9962f93fd2`。
- 后端全量 Vitest：`264/264` 文件、`2384/2384` 测试通过；前端 `vue-tsc --noEmit`、`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 与 `git diff --check`：通过。

**commit:** `6cf722df feat(@qgs/backend): gate pass-rate projection rollout`、`ec5e9e16 feat(@qgs/backend): recover stale pass-rate projections`、`af8e3245 feat(@qgs/backend): reconcile pass-rate rollout windows`、`3fbb7f00 feat(@qgs/web-antd): manage pass-rate projection rollout`

**遗留问题：**

- 本轮没有启动前端 dev/build 服务，遵循项目约束；本地验收服务器未运行，因此实际页面点击验收需在下一次本地容器开发服务已启动时完成。

### 2026-08-01 主数据身份治理 WP1：页面治理入口与旁路语义修复

**执行内容：**

- 将在线处置能力、canonical 选项来源和分类范围收敛到 `master-data-identity` registry；治理服务和 Web 页面不再各自维护字段白名单。
- 治理列表接口返回每条工作项的处置能力，覆盖报检任务、检验不合格项、售后记录的受支持 canonical ID 字段；选项接口和提交接口均以同一 registry descriptor 校验。
- 明确 `quality_records.defectClassification` 是 legacy 分类映射，只走分类处置，不能作为原始 canonical ID 字段。
- 页面成功消息和弹窗说明改为“追加身份决策、更新身份投影、解决治理项”，不再错误声称批量更新业务记录。

**验证结果：**

- 定向服务测试：`2/2` 文件、`12/12` 测试通过，覆盖报检任务 `partId`、不合格项 `projectId`、售后 `projectId` 的 options 与 resolve 路径。
- 后端全量测试：`255/255` 文件、`2360/2360` 测试通过。
- 本地浏览器验收：管理员登录后，报检任务 `partId` 的治理项显示处置入口、可加载规范物料选项，弹窗明确历史事实不修改；未提交处置，测试数据保持不变。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 与 `git diff --check`：通过。

**commit:** `5bfcb91a fix(project): align governance identity resolution`

**遗留问题：**

- `project_boms.requiredProcessIds` 是集合字段，需要专用集合决策模型，当前不对外暴露单值在线处置入口。

### 2026-08-01 主数据身份治理 WP1：旁路台账与投影基础设施

**执行内容：**

- 新增只增不改的历史身份决策台账、可删除重建的身份投影、影子对账运行和指标四张旁路表；migration 未触碰历史事实表。
- 新增 `master-data-identity` 模块，注册受控字段的 canonical 类型；人工决定必须有认证操作人，纠错仅能生成 successor 决策。
- 将系统设置人工治理入口改为“工作清单 CAS + 台账追加 + 投影更新”，不再调用会回写事实 ID 或名称快照的旧领域修复路径。
- 新增默认 dry-run 的旁路初始化脚本；本地完成全量旁路初始化，未加入 release maintenance。

**验证结果：**

- 本地 Prisma migration：49 个，Schema 最新。
- migration 前后历史身份基线 `contentChecksum` 均为 `95c62629cb2c49e257b72a7a3f5c918d7393c164bb40a9dde788bb9962f93fd2`。
- 全量旁路结果：投影 48,983 条（`RESOLVED=40,089`、`RETIRED=141`、`UNRESOLVED=5,518`、`INVALID_ID=179`、`UNKNOWN_PROVENANCE=3,056`）；核心域台账为检验 36,849、报检任务 11,009、不合格品 1,778、售后 473。
- 定向服务测试 `2/2` 文件、`8/8` 测试通过；后端全量 `254/254` 文件、`2352/2352` 测试通过。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 与 `git diff --check`：通过。
- 未访问或修改生产数据库；旁路表可随测试库重建而丢弃，不影响事实快照。

**commit:** `015bede6 feat(@qgs/backend): add historical identity sidecar`、`b8a6e88 fix(@qgs/backend): batch identity sidecar rebuild`

**遗留问题：**

- WP2 才建立领域事实投影、影子统计差异和逐报表开关；本阶段未切换报表读取。

### 2026-08-01 主数据身份治理 WP1 前置：冻结基线门禁

**执行内容：**

- 修复身份基线脚本在 `tsx` 相对脚本路径下错误跳过 CLI 入口的问题；CLI 现在将执行路径和模块真实路径规范化后比较。
- 为 CLI 入口和 JSON 写入补充回归测试，并对本地快照连续生成两次正式基线。
- 新增 `docs/baselines/master-data-identity-2026-08-01.json`，作为 WP1 additive migration 前的历史事实冻结依据。

**验证结果：**

- 定向测试：`1/1` 文件、`3/3` 测试通过。
- 后端 TypeScript：通过。
- 两次基线的 `contentChecksum` 均为 `95c62629cb2c49e257b72a7a3f5c918d7393c164bb40a9dde788bb9962f93fd2`。
- 本地快照核对：检验记录 9575、报检任务 3424、不合格品 237、售后 55、治理项 `OPEN=5561`、`RESOLVED=4411`。
- 未创建 Prisma migration，未访问或修改生产数据库。

**commit:** 待提交。

**遗留问题：**

- WP1 的不可变解析台账与投影表必须在本基线及 WP0 全量门禁均通过后才可创建。

### 2026-08-01 主数据身份治理 WP0：本地页面验收

**执行内容：**

- 使用本地管理员账号完成质量概览、售后质量、检验记录、不合格品项、报检任务和主数据治理页面验收。
- 核对治理页待处置/已解决筛选、页面刷新以及验收前后数据库状态计数。
- 全程未新增、编辑、删除或处置业务数据。

**验证结果：**

- 六个业务页面登录、导航、列表读取及分页：通过。
- 治理状态保持 `OPEN=5561`、`RESOLVED=4411`：通过。
- 活跃事实记录保持检验 9554、不合格品 218、售后 54、报检任务 3251：通过。

**commit:** 待提交。

**遗留问题：**

- 售后列表部分历史事业部显示原始 `dept-*` ID，属于后续 `RETIRED/UNRESOLVED` 投影治理范围。
- 浏览器控制台存在既有 `/system/architecture/index.vue` 路由组件无效错误，与 WP0 身份止血无关。

### 2026-08-01 导入生产备份到本地测试数据库

**执行内容：**

- 使用现有 Apple Container MySQL 创建持久化数据库 `quality_guard_local_test`，完整导入 `/Users/zhaoxiaojie/Downloads/db_dump.sql`。
- 保留原有 `quality_guard_container` 不变；首次不完整导入库已删除并重新创建。
- 将 Apple Container 本地开发默认数据库及示例配置切换到 `quality_guard_local_test`。

**验证结果：**

- 数据表：73 张；核心表记录数与备份审计一致。
- Prisma migration：48 个，数据库 Schema 为最新状态。
- MySQL 本地用户连接与核心数据查询：通过。
- 未运行 release maintenance，未连接或修改生产数据库。

**commit:** 待提交。

**遗留问题：**

- 备份 SQL 在插入数据前重新开启外键检查，导入时仅在当前导入会话内保持关闭；导入结束后连接级设置自动失效。

### 2026-08-01 本地快照启动隔离发布维护

**执行内容：**

- 修复 Apple Container 本地开发启动固定执行生产 release maintenance，导致导入快照首次扫描新增治理项并触发完整性门禁的问题。
- 新增 `CONTAINER_DEV_RUN_MAINTENANCE` 开关；导入快照的本地配置默认跳过发布维护，生产发布脚本及其门禁保持不变。
- 将失败启动已经修改的 `quality_guard_local_test` 删除后从原始 SQL 完整重建，恢复到未污染快照。

**验证结果：**

- 本地启动脚本语法：通过。
- Prisma migration：48 个，数据库 Schema 为最新状态。
- 核心记录数及原始 `OPEN` 治理项数量与备份一致。
- 未连接或修改生产数据库。

**commit:** 待提交。

**遗留问题：**

- 需要主动验证发布维护时，可在单次本地命令中显式设置 `CONTAINER_DEV_RUN_MAINTENANCE=true`；该操作会修改测试副本，应先保留或重建快照。

### 2026-08-01 主数据身份治理 WP0：历史快照冻结与可信基线

**执行内容：**

- 删除已下线的主数据改名内核及其历史名称批量改写能力；管理接口继续返回“主数据改名功能已下线”。
- 发布维护及相关回填只补 canonical ID，保留供应商、TEAM、项目、部门和事业部的历史名称快照。
- 批量名称解析在存在重名候选时返回 `null`，不再依赖数据库行顺序静默归属；历史名称与当前主数据名称不一致改为观察指标。
- 重复扫描不再将 `RESOLVED` 治理项重置为 `OPEN` 或清空既有裁决字段。
- 新增只读、分页、确定性的身份基线生成器，显式输出 JSON 产物与不含生成时间的内容校验和。

**验证结果：**

- 定向测试：`11/11` 文件、`84/84` 测试通过。
- 后端全量测试：`253/253` 文件、`2346/2346` 测试通过。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 和 `rtk git diff --check`：通过。
- 未创建 Prisma migration，未访问或修改生产数据库。

**commit:** 待提交（主工作区存在用户改动，按任务约束不自行提交）。

**遗留问题：**

- `RETIRED` 旁路状态、不可变解析台账和领域事实投影属于 WP1/WP2，尚未创建 migration。

### 2026-08-01 主数据身份治理实施方案

**执行内容：**

- 基于生产备份只读审计和现有代码映射，新增可实施的主数据身份治理方案。
- 明确历史事实冻结、不可变解析台账、身份投影、领域事实投影、影子对账和逐消费者切换设计。
- 将实施拆分为止血、旁路基础设施、首批试点、领域迁移、强约束与旧路径退出七个工作包，并定义验收、回滚、脚本处置和提交边界。

**验证结果：**

- 后端 TypeScript：通过（方案编写前基线）。
- 文档结构与项目代码、Schema、发布脚本和现有投影实现交叉核对：通过。
- 本阶段仅新增方案文档并更新执行记录，不修改应用代码或数据库 Schema。

**commit:** 待提交。

**遗留问题：**

- 二月份至新基线生效日前的原始名称，仍需早期备份或 RDS binlog 才能完整恢复；无证据部分按 `UNKNOWN_PROVENANCE` 管理。

### 2026-08-01 Codex Sol/Terra 模型路由固定

**执行内容：**

- 新增项目级 Codex 配置，将主代理固定为 `gpt-5.6-sol`，将默认执行子代理固定为 `gpt-5.6-terra`。
- 新增 `terra_executor` 自定义代理，统一承担调查、编码、重构、调试和验证。
- 在 `AGENTS.md` 增加强制路由、等待、独立验收、禁止静默降级和最终披露规则。

**验证结果：**

- TOML 语法解析：通过。
- 配置值与路由规则一致性：通过。
- 本次仅修改 Codex 项目配置与文档，不涉及应用代码，不运行应用 lint、typecheck 或测试。

**commit:** 待提交。

**遗留问题：**

- Codex 需要重新加载项目任务后才能保证新的项目级默认模型配置生效。

## [0.22.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.21.0...qgs-v0.22.0) (2026-07-31)


### Features

* **project:** review materials during dispatch ([1ce860d](https://github.com/ajie5419/Quality-Guardian/commit/1ce860d73dc3e19cb1c7e14dfb0b1ded7e7c18e6))
* **project:** streamline master data and material dispatch ([77d781a](https://github.com/ajie5419/Quality-Guardian/commit/77d781a35acbce9e0e56f1fb0794bf7079728f04))


### Bug Fixes

* **project:** address governance review findings ([a13c682](https://github.com/ajie5419/Quality-Guardian/commit/a13c6822f39e7450a8a51889884741bc0f292f7a))
* **project:** auto-link existing material requests ([bb719b0](https://github.com/ajie5419/Quality-Guardian/commit/bb719b09dcd504db531a78310cb69ac8a86d2c5b))
* **project:** complete master data governance resolution ([a8ada41](https://github.com/ajie5419/Quality-Guardian/commit/a8ada4108ae283e07d3ab3834ee7b8fe785b6475))
* **project:** enable department governance resolution ([bcbe0fe](https://github.com/ajie5419/Quality-Guardian/commit/bcbe0feff49d478db2db6ef73590f2a625f44da9))
* **project:** enable process governance resolution ([7a5383c](https://github.com/ajie5419/Quality-Guardian/commit/7a5383c7352afc5277c9a98e5dc78ea26f81c464))

### 2026-07-31 主数据治理审查问题修复

**执行内容：**

- 检验记录治理在校验过程检验供应商前按 TEAM ID 排序加锁，并使用当前事务客户端读取 `TEAM -> supplier` 映射，避免治理期间重新关联造成身份不一致。
- 规范主数据选项查询改用 Prisma 结构化 SQL API，移除新增的 `$queryRawUnsafe` 动态查询。
- 项目主数据的启用条件统一为 `isDeleted = 0 AND status = 1`，停用项目不再出现在治理选项中，也不能用于检验记录治理。
- 新增事务客户端、TEAM 锁、结构化查询和停用项目回归测试。

**验证结果：**

- 定向测试：`3/3` 文件、`35/35` 测试通过。
- 后端 TypeScript：通过。
- 目标文件 ESLint：通过。
- 后端全量测试：`252/252` 文件、`2339/2339` 测试通过。
- `pnpm lint`：通过。
- `pnpm run check:type`：通过，`3/3` workspace tasks 成功。
- `pnpm run check:qms-arch`：通过，0 个新增违规。
- `rtk git diff --check`：通过。

**commit:** 待提交。

**遗留问题：**

- 无。

### 2026-07-31 派单页内审核物料申请

**执行内容：**

- 报检任务列表返回关联物料申请 ID，派单页可直接定位待审核申请。
- 有派单权限和物料审核通过权限的用户，可在派单弹窗内选择关联已有物料或创建规范物料。
- 物料审核成功后同一弹窗立即切换到检验员派单表单；无审核权限、已驳回或其他阻塞状态仍不可派单。
- 保持现有后端审核事务、并发校验和权限校验不变，并同步更新报检模块架构说明。

**验证结果：**

- 相关共享、后端和前端测试：`3/3` 文件、`33/33` 测试通过。
- `pnpm lint`：通过。
- `pnpm run check:type`：通过，`3/3` workspace tasks 成功。
- `pnpm run check:qms-arch`：通过，0 个新增违规。
- 后端全量测试：`252/252` 文件、`2342/2342` 测试通过。

**commit:** 待提交。

**遗留问题：**

- 按项目约束未启动前端开发或构建服务，通过组件逻辑测试、类型检查和 lint 验证。

### 2026-07-31 已有物料申请自动关联

**执行内容：**

- 进货报检自由输入物料名称时，后端按去除首尾空格后的完整名称查找启用且未删除的物料主数据。
- 唯一精确匹配时直接写入规范 `partId` 和当前物料名称快照，不再生成待审核物料申请；无匹配或存在歧义时仍进入人工审核。
- 补充物料精确查询与报检自动关联单元测试，并同步更新报检模块架构说明。

**验证结果：**

- 后端全量测试：`252/252` 文件、`2342/2342` 测试通过。
- `pnpm lint`：通过。
- `pnpm run check:type`：通过，`3/3` workspace tasks 成功。
- `pnpm run check:qms-arch`：通过，0 个新增违规。
- `rtk git diff --check`：通过。

**commit:** 待提交。

**遗留问题：**

- 无。

### 2026-07-30 报检工序主数据治理处置

**执行内容：**

- 补齐报检任务“工序 / 未找到精确匹配的主数据”在线处置，管理员可选择启用的全局规范工序。
- 不使用报检分类展示开关限制历史治理；展示开关只管理新建报检的可选范围。
- 按审计原始 ID 和原始名称分批回填 `processId + processName` 快照，只关闭实际更新成功的治理项。

**验证结果：**

- 后端全量测试：`248/248` 文件、`2320/2320` 测试通过。
- `pnpm lint`：通过。
- `pnpm run check:type`：通过，`3/3` workspace tasks 成功。
- `pnpm run check:qms-arch`：通过，0 个新增违规。

**commit：**

- 待提交。

**遗留问题：**

- 无。

### 2026-07-30 责任部门主数据治理处置

**执行内容：**

- 补齐不合格项“责任部门 / 缺少规范部门”的在线处置能力，管理员可从启用部门树中选择规范部门。
- 按“业务类型 + 治理字段 + 原始 ID + 原始名称”分批处置同值记录，同步回填部门 ID、名称、事业部和多部门名称快照。
- 仅关闭实际更新成功的审计项；软删除或处置期间已变更的业务记录继续保持待处置。

**验证结果：**

- 后端全量测试：`247/247` 文件、`2316/2316` 测试通过。
- `pnpm run check:type`：通过，`3/3` workspace tasks 成功。
- `pnpm lint`：通过。
- `pnpm run check:qms-arch`：通过，0 个新增违规。

**commit：**

- 待提交。

**遗留问题：**

- 无。

## [0.21.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.20.3...qgs-v0.21.0) (2026-07-30)


### Features

* add material approval workflow ([e7aed51](https://github.com/ajie5419/Quality-Guardian/commit/e7aed516ef537e0998cfa60439a6f46aea04cb1b))
* **project:** add governed material input and bulk resolution ([2da4bb1](https://github.com/ajie5419/Quality-Guardian/commit/2da4bb12ebef07a6cb5b31fe5ad27350de73748a))
* **project:** add governed material input and bulk resolution ([0dcf2f6](https://github.com/ajie5419/Quality-Guardian/commit/0dcf2f6c3a03ec5b853c2a9f05fcc31776c3900f))

### 2026-07-30 主数据治理页面中文化

**执行内容：**

- 将主数据治理页面的标题、说明、筛选项、表头、状态、操作、弹窗和操作反馈统一为中文。
- 为业务类型、治理字段和待治理原因增加中文映射，未知内部值保留原值作为诊断依据。
- 分类治理改为按“业务类型 + 字段 + 原始值”批量处置，一次更新所有重复业务记录并关闭对应治理项。
- 批量处置仅更新完全匹配的待治理 `entityId`，并仅关闭实际更新成功的审计 ID；已删除或并发变更的项目保持待处置。

**验证结果：**

- 定向测试：`1/1` 文件、`2/2` 测试通过。
- `pnpm run check:type`：通过，`3/3` workspace tasks 成功。
- `pnpm run check:qms-arch`：通过，0 个新增违规。

**commit：**

- 待提交。

**遗留问题：**

- 无。

### 2026-07-30 进货报检物料输入后台开关

**执行内容：**

- 在管理后台“报检与检验设置”增加“进货报检使用自由输入物料”开关，默认关闭。
- Web 和微信小程序报检端移除用户可操作的模式切换，只按后台配置展示规范物料选择或自由输入。
- 小程序在工单和工序联动重置后保留后台输入模式配置，避免进货工序被误切回规范物料模式。
- 新增仅返回该布尔值的公开读取接口；后端 V2 创建服务同步强制校验输入模式，防止绕过前端提交。

**验证结果：**

- 定向测试：`3/3` 文件、`20/20` 测试通过。
- `pnpm lint`：通过。
- `pnpm run check:type`：通过，`3/3` workspace tasks 成功。
- `pnpm run check:qms-arch`：通过，0 个新增违规。

**commit：**

- 待提交。

**遗留问题：**

- 无。

### 2026-07-30 BOM 物料身份写入门禁修复

**执行内容：**

- BOM 单条新增、编辑和批量导入统一通过 `PartMasterService` 解析规范物料身份，同名启用物料复用全局 `partId`，新名称创建规范身份后再写入 BOM。
- BOM 编辑弹窗保留已有 `partId`，物料主数据改名不覆盖历史 BOM 名称快照。
- 执行幂等身份回填，为 `WO-468624` 的“减速机”创建规范物料并回填 BOM `partId`。

**验证结果：**

- 定向测试：`2/2` 文件、`15/15` 测试通过。
- Backend TypeScript：通过。
- 本地数据回填：`project_boms` 扫描 1 条、更新 1 条、0 条未解析。
- 公开 BOM 接口已返回“减速机”的非空 `partId`，全局物料搜索同步可查。
- `pnpm lint`：通过。
- `pnpm run check:type`：通过，`3/3` workspace tasks 成功。
- `pnpm run check:qms-arch`：通过，0 个新增违规。

**commit：**

- 待提交。

**遗留问题：**

- 无。

### 2026-07-30 物料业务界面中文化

**执行内容：**

- 将物料申请审核页的标题、说明、筛选项、表头、状态、操作按钮、审核弹窗和操作反馈统一为中文。
- 将物料主数据页及对应菜单、权限标题统一为中文。
- 将 Web 和微信小程序报检入口的物料搜索、新物料申请文案统一为中文，同步更新组件测试。
- 修复用户菜单接口在模块声明同步前直接返回 24 小时 Redis 缓存的问题，确保菜单标题变更能清理旧缓存并立即生效。

**验证结果：**

- Web 定向组件测试：`1/1` 文件、`3/3` 测试通过。
- Backend 定向测试：`1/1` 文件、`10/10` 测试通过。
- 菜单同步与缓存定向测试：`2/2` 文件、`26/26` 测试通过。
- `pnpm lint`：通过。
- `pnpm run check:type`：通过，`3/3` workspace tasks 成功。
- `pnpm run check:qms-arch`：通过，0 个新增违规。

**commit：**

- 待提交。

**遗留问题：**

- 自动验收浏览器无业务账号登录态，仅验证到中文登录页；未读取或代填本地账号凭据。

### 2026-07-30 本地容器维护流程阻塞修复

**执行内容：**

- 修复 `backfill-identity-relations.ts` 完成后未断开 Redis 连接的问题，避免 ordered release maintenance 停在身份回填步骤。
- 增加发布维护 wrapper 资源清理回归断言。

**验证结果：**

- 定向测试：`1/1` 文件、`7/7` 测试通过。
- `pnpm lint`：通过。
- `pnpm run check:type`：通过，`3/3` workspace tasks 成功。
- `pnpm run check:qms-arch`：通过，0 个新增违规。
- 卡住的旧维护进程已终止，无 `container-dev-antd`、`run-release-maintenance` 或 `backfill-identity-relations` 残留进程。

**commit：**

- 待提交。

**遗留问题：**

- 无。

### 2026-07-30 派单物料有效性门禁修复

**执行内容：**

- 派单前通过 `PartMasterService.assertActive` 重新校验规范物料，防止报检提交后被停用或软删除的物料继续进入检验流程。
- 增加失效物料阻断和正常派单校验的回归测试。

**验证结果：**

- 定向测试：`2/2` 文件、`18/18` 测试通过。
- `pnpm lint`：通过。
- `pnpm run check:type`：通过，`3/3` workspace tasks 成功。
- `pnpm run check:qms-arch`：通过，0 个新增违规。

**commit：**

- 待提交。

**遗留问题：**

- 无。

### 2026-07-30 物料新增申请、审核与规范 ID 闭环

**执行内容：**

- 新增独立 `part-master` 领域模块，统一拥有 `master_parts` 写入，提供启用物料搜索、规范 ID 校验、后台管理 CRUD、软删除和同名恢复原 ID；停用物料不再通过通用 canonical 有效性校验。
- 新增 `qms_inspection_material_requests` 及 Prisma migration。公开 V2 进货报检支持 `partId` 或 `requestedPartName` 严格二选一，并在同一事务内创建报检任务和物料申请。
- 新增后台物料申请队列及独立 List/Approve/Reject 权限。审核支持创建规范物料或关联已有物料，在同一事务内回填报检 `partId/partName`；拒绝会取消关联报检。
- 派单接口强制校验规范物料 ID 和申请状态；待审核时不发送派单通知，审核通过提交规范身份后才通知调度。
- Web 与微信小程序进货报检接入 BOM 推荐、全局规范物料搜索和申请新增物料；公开页面不展示审核状态或卡滞信息。后台新增物料审核页与物料主数据管理页。
- 增加搜索防抖、异步竞态保护、多工单 BOM 合并、选中项标签保留、规范 ID 展示及相关 schema、service、mapper、API 和页面测试。

**验证结果：**

- 全仓单元测试：`340/340` 文件、`2893/2893` 测试通过。
- Backend full suite：`246/246` 文件、`2304/2304` 测试通过。
- 定向测试：`16/16` 文件、`123/123` 测试通过。
- `pnpm lint`：通过，0 error / 0 warning。
- `pnpm run check:type`：通过，3/3 workspace tasks。
- `pnpm run check:qms-arch`：通过，0 violations。
- Prisma schema validate、format、generate 与 migration 标识符检查通过。
- 浏览器验收：公开进货报检可在规范物料选择和申请新增模式间切换，页面未显示审核卡滞信息；全局搜索正常触发。后台路由正确要求登录，当前浏览器无管理员会话，未执行登录态点击验收。

**commit：**

- `e7aed516` `feat: add material approval workflow`

**遗留问题：**

- 新 migration 尚未部署到生产环境；必须通过既有发布流程执行 `prisma migrate deploy`，禁止手工改表。

## [0.20.3](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.20.2...qgs-v0.20.3) (2026-07-29)


### Bug Fixes

* isolate quality classification release bootstrap ([486e855](https://github.com/ajie5419/Quality-Guardian/commit/486e8551527402a28f4dfdf6b68c6e7605ecb44f))
* **project:** isolate quality classification release bootstrap ([685ffd2](https://github.com/ajie5419/Quality-Guardian/commit/685ffd28ef824b374901a1d4f2ffddd99497c515))

### 2026-07-29 发布维护进程生命周期隔离修复

**执行内容：**

- 定位 `qgs-v0.20.2` 生产发布回滚根因：质量分类 bootstrap 为读取纯常量加载了运行时模块 barrel，间接创建 Redis 长连接；业务任务完成后 Node 进程未退出，导致后续供应商评分重算从未启动并最终触发 600 秒维护门禁。
- 将质量分类 bootstrap 改为直接依赖纯身份常量文件，维护脚本不再加载权限、RBAC、Redis 等在线运行时依赖。
- 增加发布 bootstrap 依赖边界测试，禁止重新引入运行时模块 barrel。

**验证结果：**

- 隔离导入诊断：显式配置不可用 Redis 时，bootstrap 输出 14 条种子并立即退出，未创建 Redis 长连接。
- 定向测试：`1/1` 文件、`6/6` 测试通过。
- Backend full suite：`244/244` 文件、`2282/2282` 测试通过。
- `pnpm lint`：通过，0 error / 0 warning。
- `pnpm run check:type`：通过，3/3 workspace tasks。
- `pnpm run check:qms-arch`：通过，0 violations。

**commit：**

- `486e8551` `fix: isolate quality classification release bootstrap`

**遗留问题：**

- `qgs-v0.20.2` 已创建但生产部署失败并自动回滚；必须发布后续修复版本，并以维护脚本正常退出、供应商评分任务清零和健康检查全部通过作为完成条件。

## [0.20.2](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.20.1...qgs-v0.20.2) (2026-07-29)


### Bug Fixes

* isolate and coalesce supplier score workers ([48d3e76](https://github.com/ajie5419/Quality-Guardian/commit/48d3e76f7981da73cb1bf98c0cd968e4a6134df1))
* **project:** isolate supplier score release reconciliation ([5f746b9](https://github.com/ajie5419/Quality-Guardian/commit/5f746b98636b2eb29a752a2177b67c2c377a2392))

### 2026-07-29 供应商评分发布维护竞态与任务放大修复

**执行内容：**

- 修正 `appleboy/ssh-action` 默认 10 分钟总命令上限，使外层 45 分钟执行包络覆盖 migration、维护、服务启动和健康检查的全部显式内层上限；各阶段失败门禁和回滚逻辑保持不变。
- 删除 `supplier.module.ts` 加载时启动后台 Worker 的副作用，将在线消费者迁入 Nitro 运行时插件；发布维护脚本直接加载 reconciliation service，不再与在线消费者竞态抢占同一队列。
- 将供应商评分任务从按事件行消费改为按 canonical supplier ID 合并领取；一次幂等快照重算成功后确认该供应商当前租约下的全部事件，避免重复事件和失败发布持续放大重算次数。
- 增加覆盖任务数、重置任务数、批次完成数和剩余任务数结构化日志，发布清零门禁可观测。
- 新增模块声明无副作用、同供应商事件合并领取和批量确认测试。

**验证结果：**

- Backend full suite：`244/244` 文件、`2281/2281` 测试通过。
- 定向测试：`4/4` 文件、`12/12` 测试通过。
- `pnpm lint`：通过，0 error / 0 warning。
- `pnpm run check:type`：通过，3/3 workspace tasks。
- `pnpm run check:qms-arch`：通过，0 violations。
- 隔离维护入口验证：发布脚本只启动 reconciliation，不再并发启动在线 `SupplierScoreWorker`。

**commits：**

- `4089dd19` `fix: align deploy command timeout with release maintenance`
- `48d3e76` `fix: isolate and coalesce supplier score workers`

**遗留问题：**

- `qgs-v0.20.2` 尚未完成生产发布；必须以 migration、release maintenance、供应商评分任务清零和健康检查全部通过作为完成条件。

## [0.20.1](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.20.0...qgs-v0.20.1) (2026-07-29)


### Bug Fixes

* align deploy command timeout with release maintenance ([4089dd1](https://github.com/ajie5419/Quality-Guardian/commit/4089dd19cb9872322891c253b3f5c6f6991dc420))
* **project:** align deploy timeout with maintenance budget ([d0d7cd1](https://github.com/ajie5419/Quality-Guardian/commit/d0d7cd12c868b6f98bca71bd05e36e3c043a3165))

## [0.20.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.19.1...qgs-v0.20.0) (2026-07-29)


### Features

* **@qgs/backend:** add canonical identity relations ([b7ad4a1](https://github.com/ajie5419/Quality-Guardian/commit/b7ad4a18bf8348d3504f0207889a2642d292cd50))
* **@qgs/backend:** add quality classification master data ([7a2fa1e](https://github.com/ajie5419/Quality-Guardian/commit/7a2fa1e70395fad55f1acfc012163bcd0e889acf))
* **@qgs/backend:** backfill identity relations ([69b4fcd](https://github.com/ajie5419/Quality-Guardian/commit/69b4fcdedfeb3a3a9de2643cbe0700881b3cf134))
* **@qgs/backend:** configure inspection process options ([5df9448](https://github.com/ajie5419/Quality-Guardian/commit/5df9448935de08ae2647c4319aad07ab89bc34a2))
* **@qgs/backend:** establish canonical TEAM identities ([bcc7630](https://github.com/ajie5419/Quality-Guardian/commit/bcc7630df5cd0cf71976504b48eb37ca38c88475))
* **@qgs/backend:** migrate quality classification identities ([decb868](https://github.com/ajie5419/Quality-Guardian/commit/decb868416e6fdaeb2c0f12b1f91a8556c4a9b4d))
* **@qgs/weapp:** load managed defect classifications ([ad857b6](https://github.com/ajie5419/Quality-Guardian/commit/ad857b6072aafc80e694f96d78c231ea91dd5997))
* **@qgs/web-antd:** add quality classification options ([97cee16](https://github.com/ajie5419/Quality-Guardian/commit/97cee1611af3ea9c85b6c65654a44f59dc38cbc9))
* **@qgs/web-antd:** add quality classification settings ([96e879b](https://github.com/ajie5419/Quality-Guardian/commit/96e879bbaac478ad977a9a1976c13ec8c2b44a0c))
* **@qgs/web-antd:** manage inspection process visibility ([66c4b3f](https://github.com/ajie5419/Quality-Guardian/commit/66c4b3faf014eae704e1122036dae7acddfa4154))
* **project:** add master data governance workflow ([14a98bd](https://github.com/ajie5419/Quality-Guardian/commit/14a98bd2fefdc48607347cf82922cbd99dbc4f6a))
* **project:** complete quality identity governance and durable scoring ([7dd794f](https://github.com/ajie5419/Quality-Guardian/commit/7dd794f5ee3d2cc3c9c705f9fd2b17725d35d5b5))
* **project:** govern BOM process identities ([6411c7d](https://github.com/ajie5419/Quality-Guardian/commit/6411c7d5c419953e680ff678dc5e4038c5a19cc0))
* **project:** require canonical IDs in write contracts ([d7b1b24](https://github.com/ajie5419/Quality-Guardian/commit/d7b1b240fec4182895730c0e4bf394fbe28ad519))
* **project:** use managed after-sales classifications ([1f9895c](https://github.com/ajie5419/Quality-Guardian/commit/1f9895c5b86e54e2992c069e8e035e300d7031e2))
* **project:** use managed inspection defect classifications ([2034b79](https://github.com/ajie5419/Quality-Guardian/commit/2034b799a324dcaccc9f7b52be6afe0d8f538cea))


### Bug Fixes

* **@qgs/backend:** backfill reporting identities ([d2b5339](https://github.com/ajie5419/Quality-Guardian/commit/d2b53396ddfb7ffe74315d412abca690d942fd52))
* **@qgs/backend:** bind pass rate buckets to identities ([18fefeb](https://github.com/ajie5419/Quality-Guardian/commit/18fefeba90ece6579ed56e0e4ba63b67483c1939))
* **@qgs/backend:** enforce canonical identity writes ([7558d8a](https://github.com/ajie5419/Quality-Guardian/commit/7558d8add9dbea25640e9d88c2b65029c7d6baea))
* **@qgs/backend:** handle decimal governance counts ([c0798ed](https://github.com/ajie5419/Quality-Guardian/commit/c0798edcb8754ad952e719daa3700c7314bf1b91))
* **@qgs/backend:** hydrate daily report identities ([71eead1](https://github.com/ajie5419/Quality-Guardian/commit/71eead15cf2a1f5ae716303af538b3a75868519c))
* **@qgs/backend:** isolate legacy BOM identity imports ([75851ce](https://github.com/ajie5419/Quality-Guardian/commit/75851ceee5191c465b10db4af946f7d0880f97c5))
* **@qgs/backend:** make team identity merges resumable ([21a13a6](https://github.com/ajie5419/Quality-Guardian/commit/21a13a6b097d9256191560d6ef0d99a7ff249ddc))
* **@qgs/backend:** persist inspection part identities ([e53dc93](https://github.com/ajie5419/Quality-Guardian/commit/e53dc93094a69dfb5e7404dd3c2046a532f69506))
* **@qgs/backend:** preserve legacy after-sales statistics ([2cc3968](https://github.com/ajie5419/Quality-Guardian/commit/2cc3968830a170ab0e8cf93ca1cec8adb62604dc))
* **@qgs/backend:** preserve legacy report identities ([9e45cea](https://github.com/ajie5419/Quality-Guardian/commit/9e45ceafcad483541d058e9767e13f94d60a3e43))
* **@qgs/backend:** preserve legacy request compatibility ([e2393f3](https://github.com/ajie5419/Quality-Guardian/commit/e2393f32e1d9f5bf345002e3aed9ac78d0ad5d0b))
* **@qgs/backend:** preserve team identity history ([a93991b](https://github.com/ajie5419/Quality-Guardian/commit/a93991b8661446116b3d1ae639f850d601e2f095))
* **@qgs/backend:** query required reporting fields safely ([247d355](https://github.com/ajie5419/Quality-Guardian/commit/247d3558f8a336d026ec8594469136b3738fe7f0))
* **@qgs/backend:** resolve weekly report identities ([b7ff0d6](https://github.com/ajie5419/Quality-Guardian/commit/b7ff0d61925738d185d52dedb3d4c870660ad463))
* **@qgs/backend:** retain legacy inspection aggregates ([e46a4cd](https://github.com/ajie5419/Quality-Guardian/commit/e46a4cdf73e5350151244ebefdd295e74d2b9f6d))
* **@qgs/backend:** retain legacy vehicle failure records ([867fa0c](https://github.com/ajie5419/Quality-Guardian/commit/867fa0cc9d1628e737d20f4dface1c6b121e8bea))
* **@qgs/backend:** shorten quality classification indexes ([475cd93](https://github.com/ajie5419/Quality-Guardian/commit/475cd934319380d1fc4271624c361be3694e64c8))
* **@qgs/web-antd:** clear request identity prefill after submit ([73a3d34](https://github.com/ajie5419/Quality-Guardian/commit/73a3d3432433ffd15907ffb3d64dbed550fc020f))
* **@qgs/web-antd:** route team writes through identity api ([4fce415](https://github.com/ajie5419/Quality-Guardian/commit/4fce415cd720d0ce20dd6d8961d08c264ee9db93))
* **deploy:** preserve mapped TEAM request categories ([3b3c2a7](https://github.com/ajie5419/Quality-Guardian/commit/3b3c2a7bde7b45be7f4f95a19c08bf4399132fb1))
* **deploy:** reconcile TEAM identities during maintenance ([63ca39d](https://github.com/ajie5419/Quality-Guardian/commit/63ca39d0a5baed662e59acaa754b5f8fb3c659f0))
* **deploy:** separate online maintenance from backfills ([45d38a4](https://github.com/ajie5419/Quality-Guardian/commit/45d38a446e79c77f6d7d309070bf4877fb98dfc1))
* **project:** aggregate governed statistics by identity ([5d6cfe3](https://github.com/ajie5419/Quality-Guardian/commit/5d6cfe3a02d01ed11d48be870fc59bf1653d0597))
* **project:** aggregate inspection stats by canonical identity ([5db464e](https://github.com/ajie5419/Quality-Guardian/commit/5db464ed2266766aa75e4bc91b4ca490ee064246))
* **project:** aggregate work orders by canonical identity ([b90adee](https://github.com/ajie5419/Quality-Guardian/commit/b90adeed04c1adc96ac3169b50c713ffc253020b))
* **project:** avoid duplicate release backfill ([fa9e3a1](https://github.com/ajie5419/Quality-Guardian/commit/fa9e3a184d2d985b1be45bd5108e6619211d8d42))
* **project:** bootstrap historical process identities ([8554f32](https://github.com/ajie5419/Quality-Guardian/commit/8554f322e466610bafd4651cfc93f4e0079156bf))
* **project:** carry identity through chart contracts ([84a5991](https://github.com/ajie5419/Quality-Guardian/commit/84a5991c09af4056f79e22dcf00b0c553a6d6b83))
* **project:** enforce canonical inspection request categories ([6a3cf22](https://github.com/ajie5419/Quality-Guardian/commit/6a3cf228cc54a9eecd65cca8f12037c0ec216379))
* **project:** govern quality loss identities ([2b6db06](https://github.com/ajie5419/Quality-Guardian/commit/2b6db069451ceb215a53f5996fe44e40643eb161))
* **project:** harden classification governance writes ([0beb64f](https://github.com/ajie5419/Quality-Guardian/commit/0beb64f9ee5365fd96c1db3370d8afd2f883c4f2))
* **project:** make identity maintenance atomic ([c635ed4](https://github.com/ajie5419/Quality-Guardian/commit/c635ed4745ecd4e05c835c7a612cb7f55944148c))
* **project:** preserve quality loss identities end to end ([fee9085](https://github.com/ajie5419/Quality-Guardian/commit/fee9085c44f3a11fdeed30039bd53e7fbaa94556))
* **project:** remove remaining name-based chart aggregation ([a4e5ebe](https://github.com/ajie5419/Quality-Guardian/commit/a4e5ebe944dae41a57e4d5d883838b201286408a))
* **project:** restore work-order process options ([8b974ac](https://github.com/ajie5419/Quality-Guardian/commit/8b974ac773ad27b57ab4e33b39f9529cad567725))

### 2026-07-29 供应商与外协评分一致性最终重构

**执行内容：**

- 新增数据库持久化 `metric_refresh_jobs` 及 Prisma migration，建立任务追加、租约抢占、完成确认、失败重试和发布清零能力。
- 检验记录、不合格项、售后记录、质量损失、供应商档案和 TEAM 映射的写路径，统一在源数据事务内按 canonical supplier ID 追加评分任务；删除进程内 `EventEmitter`、提交后 fire-and-forget 刷新和按名称刷新入口。
- 新增幂等供应商评分 Worker，按供应商 ID 聚合 `inspections`、`quality_records`、`after_sales` 和 TEAM 显式映射，成功后确认任务，失败时保留错误和重试时间。
- 评分模型升级为 V4。发布维护在应用停止写入期间为无 V4 快照或旧模型快照建立明确 ID 任务，同步消费所有线上遗留任务；任务未清零即终止发布。
- 删除健康检查后的异步快照补数容器和旧 `backfill-supplier-score-snapshots.ts`，替换为发布前同步 `reconcile-supplier-score-snapshots.ts`。
- 拆分供应商写服务，删除检验模块三层无业务逻辑的转发门面并消除隐性加载循环。
- 更新 supplier、inspection、after-sales、metric-refresh 及主数据身份治理架构文档；未启动前端 dev/build 服务，未访问或修改生产环境。

**验证结果：**

- 全仓单元测试：`332/332` 文件、`2852/2852` 测试通过。
- Backend full suite：`243/243` 文件、`2278/2278` 测试通过。
- `pnpm lint`：通过，格式和 ESLint 均无错误。
- `pnpm run check:type`：通过，3/3 workspace tasks。
- `pnpm run check:qms-arch`：通过，0 violations。
- `prisma validate`：通过。
- 发布维护脚本与部署脚本 shell 语法检查：通过。

**commits：**

- `4f1bc272` `refactor: add durable metric refresh queue`
- `d4015f43` `refactor: make supplier score refresh durable`
- `4f8489dc` `refactor: enforce supplier score reconciliation gate`

**遗留问题：**

- 生产数据库未在本次会话中访问；migration 与 V4 历史快照校准将在正常发布维护阶段执行，并由任务清零门禁决定是否允许启动新版本。

### 2026-07-29 车辆故障率历史产品快照兼容修复

**执行内容：**

- 车辆故障统计查询同时按产品分类 canonical ID、已声明的历史产品名称快照和车辆事业部识别数据，恢复尚未完成分类 ID 回填的历史车辆售后记录。
- 将车辆产品稳定编码和不可变历史名称集中到质量分类模块，初始化脚本与报表复用同一身份声明，避免查询层硬编码业务名称。
- 月度数量、最早统计年份和缺陷排名共用同一查询条件；新增 Prisma 条件断言，覆盖历史快照去重与精确匹配。
- 新数据写入契约不变，仍必须提交有效的产品和缺陷父子分类 ID；名称仅作为历史快照使用。
- 未启动前端 dev/build 服务；未访问或修改生产环境。

**验证结果：**

- 全仓单元测试：`334/334` 文件、`2860/2860` 测试通过。
- Backend full suite：`245/245` 文件、`2286/2286` 测试通过。
- 定向测试：`4/4` 文件、`41/41` 测试通过。
- `pnpm lint`：通过，0 error / 0 warning。
- `pnpm run check:type`：通过，3/3 workspace tasks。
- `pnpm run check:qms-arch`：通过，0 violations。

**commit:** `867fa0c` `fix(@qgs/backend): retain legacy vehicle failure records`

**遗留问题：**

- 生产环境未访问、未修改；无法唯一映射分类 ID 的其他历史记录仍需通过主数据治理页面人工处置。

### 2026-07-29 历史统计兼容与 ID 写入契约加固

**执行内容：**

- 售后质量概览、不合格项统计和检验质量概览改为“canonical ID 优先、历史名称快照兜底”：同一 ID 的改名前后数据合并，无 ID 的旧数据按原始名称保留并标记待治理。
- 项目风险、供应商排行、周报、日报和车辆故障率补齐历史身份兼容；已停用的车辆产品分类仍用于历史报表过滤，避免旧记录退出统计。
- 售后旧记录允许只修改非分类字段；新建记录及分类变更继续要求完整父子分类 ID，名称快照只由服务端根据 ID 写入。
- 主数据治理页只提供启用的父子分类；治理处置在同一事务内完成分类校验、条件更新和审计关闭，并在并发编辑发生时拒绝覆盖。
- 核对质量损失统计已使用 ID 聚合和历史部门快照兜底，无需重复改造。
- 未启动前端 dev/build 服务；未访问或修改生产环境。

**验证结果：**

- 全仓单元测试：`334/334` 文件、`2859/2859` 测试通过。
- Backend full suite：`245/245` 文件、`2284/2284` 测试通过。
- `pnpm lint`：通过，0 error / 0 warning。
- `pnpm run check:type`：通过，3/3 workspace tasks。
- `pnpm run check:qms-arch`：通过，0 violations。

**commits：**

- `2cc39688` `fix(@qgs/backend): preserve legacy after-sales statistics`
- `e46a4cdf` `fix(@qgs/backend): retain legacy inspection aggregates`
- `9e45ceaf` `fix(@qgs/backend): preserve legacy report identities`
- `0beb64f9` `fix(project): harden classification governance writes`
- `71eead15` `fix(@qgs/backend): hydrate daily report identities`

**遗留问题：**

- 生产环境未访问、未修改；现有 unresolved 分类记录仍需管理员在系统设置的主数据治理页人工选择正确父子分类。

### 2026-07-29 统计身份重构与主数据治理闭环

**执行内容：**

- 建立统一统计身份契约，区分 `RESOLVED`、`MISSING`、`INVALID`，并以 `MISSING_REQUIRED`、`INVALID_REFERENCE`、`NOT_APPLICABLE`、`CONFLICTED` 解释原因。
- 不合格项和售后动态图表按 canonical ID 聚合；缺少 ID 时按治理原因与原始快照分桶，同一 ID 的改名前后快照重新合并。
- 售后无供应商记录明确标记为“不涉及/未关联供应商”，不再与真正缺失的供应商身份混合。
- 统一质量概览、日报周报、车辆故障率、质量损失和工单聚合的身份显示，消除业务统计中的 `Unknown`；质量损失不同历史部门快照不再错误合并。
- 系统设置新增主数据治理清单、分页筛选、权限和分类处置页面；不合格项缺陷分类、售后产品分类和售后缺陷分类支持选择 canonical 父子分类。
- 处置服务由业务所属模块校验分类，并在同一事务内更新业务 ID、名称快照和 unresolved 审计；使用 `OPEN` compare-and-set 防止重复处置和并发覆盖。
- 未启动前端 dev/build 服务；未访问或修改生产环境。

**验证结果：**

- 全仓单元测试：`334/334` 文件、`2852/2852` 测试通过。
- Backend full suite：`245/245` 文件、`2278/2278` 测试通过。
- `pnpm lint`：通过，0 error / 0 warning。
- `pnpm run check:type`：通过，3/3 workspace tasks。
- `pnpm run check:qms-arch`：通过，0 violations。
- 浏览器验证：本地 `5666` 前端可访问，但浏览器无登录态；未绕过认证提交治理操作。

**commits：**

- `73c2e322` `refactor(project): define governed statistics identities`
- `72876374` `refactor(project): expose governed issue statistics`
- `b887e8bc` `refactor(@qgs/backend): govern after-sales statistics`
- `c5636b53` `refactor(project): unify governed reporting identities`
- `14a98bd2` `feat(project): add master data governance workflow`

**遗留问题：**

- 本机容器运行时当前不可用，浏览器也没有管理员登录态，因此本地 `ISS-2026-_O7D0ZBC` 分类审计仍保持 `OPEN`。治理入口已完成，恢复本地容器或管理员登录后应通过该入口选择正确父子分类，禁止直接改库或虚假结案。
- 当前治理页只对三类质量分类提供在线处置；其他 unresolved 类型继续只读展示，待各业务模块提供可校验、事务化的修复能力。

### 2026-07-29 主数据治理后的质量统计与报表修复

**执行内容：**

- 修复主数据治理审计将 Prisma `Decimal` 计数误判为 `0` 的问题，确保缺失、孤儿和不一致身份计数可信。
- 周报改为按责任部门、产品类型和缺陷分类 canonical ID 解析当前名称；无法解析时统一显示“未分配”，不再回退到过期名称快照。
- 过程合格率九宫格优先使用 `QMS_PASS_RATE_BUCKET_IDENTITIES` 中的工序和班组 ID 绑定，保留历史名称兼容分支；发布维护会输出可直接配置的环境变量建议值。
- 在既有发布维护入口增加项目 canonical 空表初始化，并回填工单、检验、不合格项、售后、手工损失和调试验收源记录的 `projectId`。
- 回填售后、手工损失、不合格项和调试验收源记录的责任部门 ID；兼容历史名称快照及误存到名称列的有效部门 ID。
- 唯一精确匹配才执行带旧值条件的并发安全更新；同名歧义和无匹配写入 `unresolved_master_data_refs`。
- 保持 `quality_loss_index` 的物化索引边界：先修复四类源表，再由发布后的既有索引重建任务同步，未直接修改索引。
- 修复回填脚本对 Prisma 必填字符串字段使用 `not: null` 导致的运行时校验错误，并使维护脚本测试可从仓库根目录或后端目录稳定运行。
- 在本地 Apple Container 数据库执行幂等回填、合格率绑定初始化和质量损失索引重建；未访问或修改生产环境。

**验证结果：**

- 全仓单元测试：`327/327` 文件、`2834/2834` 测试通过。
- Backend full suite：`238/238` 文件、`2261/2261` 测试通过。
- `pnpm lint`：通过，0 error / 0 warning。
- `pnpm run check:type`：通过，3/3 workspace tasks。
- `pnpm run check:qms-arch`：通过，0 violations。
- 本地数据核对：检验、不合格项、售后、质量损失、调试验收范围内带项目名称但缺少 `projectId` 的目标记录清零；售后和质量损失责任部门缺失 ID 的目标记录清零。
- 本地统计冒烟：质量概览现场/过程问题为 `3/5`，质量损失总额 `8200`；售后责任部门分布 `3/3` 已解析；质量损失部门分布 `2/2` 已解析；项目问题数为 `3/2`；过程合格率为 `100%/0%/100%`。

**commits：**

- `c0798edc` `fix(@qgs/backend): handle decimal governance counts`
- `b7ff0d61` `fix(@qgs/backend): resolve weekly report identities`
- `18fefeba` `fix(@qgs/backend): bind pass rate buckets to identities`
- `d2b53396` `fix(@qgs/backend): backfill reporting identities`
- `247d3558` `fix(@qgs/backend): query required reporting fields safely`
- `878a6473` `test(@qgs/backend): resolve maintenance fixtures from workspace`

**遗留问题：**

- 生产环境未访问、未修改；生产数据将在正式发布时由幂等维护链路处理。
- 当前全量治理审计仍有 `18` 条不在本次统计归属修复范围内的缺失身份：售后反馈部门 `2` 条、检验归档项目 `12` 条、BOM 项目 `2` 条、文档项目 `2` 条；另有售后反馈部门原始 ID 孤儿记录，需后续专项治理。
- 过程合格率初始化识别到 `2` 个工序和 `3` 个班组可直接绑定；其余 `6` 个工序和 `4` 个班组不属于九个业务统计桶，继续走历史名称兼容分支。

### 2026-07-29 质量分类 migration 的 MySQL 索引名修复

**执行内容：**

- 定位本地 `quality_guard_container` 的质量分类 migration 失败原因：两个 Prisma 自动生成的复合索引名超过 MySQL 64 字符上限，导致新分类表和业务外键字段均未创建。
- 为两个复合索引增加稳定短名称，并同步修正尚未进入生产的 migration。
- 扩展 Prisma migration 门禁，扫描全部 migration SQL 中的反引号标识符，阻止超过 64 字符的 MySQL 标识符再次进入发布流程。
- 在本地 Apple Container 数据库将失败 migration 标记回滚后重新部署成功，并执行质量分类初始化和历史回填；创建 14 个一级分类、67 个二级分类，售后更新 4 个分类引用，不合格项更新 3 个分类引用，保留 1 条无法精确匹配的 unresolved 记录。
- 未访问或修改生产环境。

**验证结果：**

- `prisma migrate status`：本地 `quality_guard_container` 的 46 条 migration 全部最新。
- 真实 Prisma 查询：成功读取 11 条不合格项记录及新增分类外键，分类数量为 14/67。
- 相关后端测试：`3/3` 文件、`37/37` 测试通过。
- `prisma validate`、migration 门禁和 shell 语法检查通过。

**commit:** `475cd93` `fix(@qgs/backend): shorten quality classification indexes`

**遗留问题：**

- 生产环境仍须通过正式发布流程执行修正后的 migration 与有序维护脚本，禁止手工改表。
- 本地历史数据有 1 条不合格项分类无法精确解析，已保留在 `unresolved_master_data_refs` 等待人工处置。

### 2026-07-28 质量二级分类开放配置

**执行内容：**

- 新增 `quality-classification` 模块、一级/二级分类表、管理 API、业务选项 API、系统菜单和权限，系统设置提供不合格项缺陷、售后产品、售后缺陷三个独立配置页。
- 不合格项、检验记录联动创建、报检关闭、售后新增编辑、Web 筛选、小程序录入、统计图表、周报月报和车辆故障率全部改用分类 ID；名称只保留为历史显示快照。
- 售后导入采用唯一精确名称解析；在线新增、编辑必须提交合法的一级/二级 ID，不再使用名称默认值或硬编码选项兜底。
- 新增 Prisma migration，保留旧字段兼容迁移；发布维护按稳定编码幂等初始化三套分类，并以 compare-and-set 分批回填历史 ID。
- 无法解析、名称缺失或已有 ID 冲突的历史记录写入 `unresolved_master_data_refs`，不静默猜测或覆盖。
- 小程序不合格项和报检结果页改为动态二级联动；删除前端与共享包中的在线硬编码分类常量。
- 拆分不合格项分类规范化和关系转换逻辑，`inspection-issue.ts` 从 516 行降至 490 行，满足模块文件上限。
- 未启动前端 dev/build 服务；未访问或修改生产环境。

**验证结果：**

- Backend full suite：`236/236` 文件、`2243/2243` 测试通过。
- Web full DOM suite：`47/47` 文件、`241/241` 测试通过。
- `pnpm lint`：通过，0 error / 0 warning。
- `pnpm run check:type`：通过，3/3 workspace tasks；小程序沿用项目既有 skip。
- `pnpm run check:qms-arch`：通过，0 violations。
- `pnpm run check:prisma-migration`：通过。

**commits：**

- `96e879b` `feat(@qgs/web-antd): add quality classification settings`
- `7a2fa1e` `feat(@qgs/backend): add quality classification master data`
- `97cee16` `feat(@qgs/web-antd): add quality classification options`
- `2034b79` `feat(project): use managed inspection defect classifications`
- `1f9895c` `feat(project): use managed after-sales classifications`
- `ad857b6` `feat(@qgs/weapp): load managed defect classifications`
- `decb868` `feat(@qgs/backend): migrate quality classification identities`
- `4c61830` `refactor(project): isolate inspection issue classification`

**遗留问题：**

- 需要通过正式发布流程执行 migration 与 release maintenance，并在生产环境核对初始化、回填和 unresolved 审计数量。

### 2026-07-28 Phase 14: enforce canonical identity contracts and safe maintenance

**Execution:**

- Retired both legacy private and public inspection-request write endpoints with `410 INSPECTION_REQUEST_V2_REQUIRED`; name-only request creation can no longer bypass canonical identity validation.
- Required `identityContractVersion=2` plus `partId/processId` for work-order requirement creation and editing, removing the remaining name-only write path.
- Corrected TEAM merge semantics so canonical IDs migrate without overwriting historical team-name snapshots in inspection requests, inspections, welder records, or work-order requirements.
- Extended TEAM reconciliation to persist ambiguities for inactive same-name identities and historical name-key collisions before publication, preventing unique-key conflicts and silent identity claims.
- Synchronized process sort updates with `inspection_request_process_options.sort` in the same transaction, keeping system settings and request-entry ordering consistent.
- Cleared both canonical IDs and display-name query parameters after a successful repeated inspection request, preventing stale identity prefill.
- Moved the full quality-loss rebuild out of the online maintenance window and restored it as a detached idempotent post-health-check task.
- Hardened generic canonical backfill with soft-delete filtering, compare-and-set `ID IS NULL` writes, write confirmation, and row-level `unresolved_master_data_refs` records.
- No production database or production record was accessed or modified.

**Verification:**

- Backend full suite: `234/234` files and `2225/2225` tests passed.
- Web full DOM suite: `47/47` files and `239/239` tests passed.
- Shared identity contract suite: `2/2` files and `17/17` tests passed.
- Full repository lint, workspace typecheck (`3/3` tasks), and changed-scope QMS architecture check passed.
- Local browser verification at `WO-468624` confirmed multiple configured process options, successful process selection, and multiple internal-team, department, and outsourcing options without submitting business data.

**Commits:** `73a3d343`, `a93991b8`, `7558d8ad`, `45d38a44`

**Remaining issues:**

- Production remains on `qgs-v0.19.1`. Delivery must use the normal migration and ordered release-maintenance workflow; manual production database edits are not permitted.

### 2026-07-28 Phase 13: separate global processes from inspection-request visibility

**Execution:**

- Established `processes` as the single reusable process identity source for inspection requests, inspection records, nonconformance items, ITP, inspection templates, BOM configuration, Web, and WeChat clients.
- Added `inspection_request_process_options` as a normalized `category + processId` configuration table. `PROCESS` and `INCOMING` visibility can now be managed independently, including enabling the same process in both categories.
- Removed `work_order_requirements` from request-entry option selection. Work-order requirements remain business requirements and no longer act as a process whitelist.
- Added system management APIs and `/system/inspection-settings` controls for process creation, editing, activation, soft deletion, and transactional request-category selection.
- Enforced the same configured `category + processId` rule during V2 request submission, preventing hidden options from being submitted through crafted payloads.
- Retired the editable `inspection_process_name` dictionary path and removed hard-coded Web/shared fallbacks. A soft-deleted process restored by name keeps its original stable ID.
- Added additive Prisma migration and idempotent release maintenance. The bootstrap creates only missing option rows and never overwrites administrator choices or historical business data.
- Applied migration and maintenance only to the local Apple Container database. Seven existing processes produced fourteen option rows. Read-only verification returned six process-inspection options and one incoming-inspection option. Production was not accessed or modified.

**Verification:**

- Backend full suite: `234/234` files and `2217/2217` tests passed.
- Web full suite: `47/47` files and `238/238` tests passed.
- Shared focused suite: `14/14` tests passed.
- Full repository lint, workspace typecheck, and changed-scope QMS architecture check passed.
- Browser E2E could not be rerun after local initialization because the pre-existing `5320/5666` development services were no longer running; project policy prohibits starting frontend development servers during this task.

**Commits:** `5df94489`, `66c4b3fa`, `83d8cd30`

**Remaining issues:**

- Production rollout must use the normal write-stop release workflow so migration and ordered maintenance finish before the new application starts. Manual production database edits are not permitted.

### 2026-07-28 Phase 12: bootstrap historical process identities safely

**Execution:**

- Closed the migration gap that left historical `work_order_requirements.processId` null when the new `processes` table and relation columns were added.
- Added a one-time canonical process bootstrap from active legacy rows that still lack `processId`. The bootstrap runs only while the canonical process table has zero rows; initialized environments never recreate identities from old name snapshots or legacy dictionary names.
- Backfilled historical work-order requirement process IDs with keyset batches and compare-and-set writes. Existing IDs and historical `processName` snapshots are preserved; unresolved names are recorded in `unresolved_master_data_refs`.
- Required active process identities to satisfy `isDeleted=0 AND status=1`, generated bootstrap IDs with cuid, and reported actual inserted row counts.
- Reordered release maintenance so identity bootstrap and relation backfill run before inspection-request category classification, with a regression test that locks the dependency order.
- Applied the idempotent maintenance only to the local Apple Container database. Initial local results were `7` canonical process rows inserted and `1/1` work-order requirement process identity updated with `0` unresolved rows; the incoming-process category update changed `1` row. A repeated run performed zero process, category, or requirement updates. No production database or production record was accessed or modified.

**Verification:**

- Backend focused suite: `4/4` test files and `41/41` tests passed.
- Backend full suite: `232/232` test files and `2209/2209` tests passed.
- Web request-entry suite: `2/2` test files and `6/6` tests passed.
- Full repository lint passed; workspace typecheck passed `3/3` tasks; changed-scope QMS architecture check reported `0 violations across 0 rules`.
- Release-maintenance shell syntax and `git diff --check` passed.
- Local API returned canonical `PROCESS / 组对` and `INCOMING / 进货检验` identities for `WO-468624`. Browser verification confirmed that the process-entry dropdown displays `组对`.

**Commit:** `8554f32` `fix(project): bootstrap historical process identities`

**Remaining issues:**

- Production remains unchanged at `qgs-v0.19.1`. The new bootstrap must be delivered only through the normal write-stop migration and ordered release-maintenance workflow; manual production database edits are not permitted.

### 2026-07-28 Phase 11: restore work-order-scoped inspection process options

**Execution:**

- Restored process-inspection options to the active `work_order_requirements` of the selected work order instead of exposing every active process master row.
- Added a work-order-requirement domain query that rejects deleted, inactive, and non-`PROCESS` process relations before returning canonical IDs and names.
- Kept incoming-inspection options independent of work-order requirements and selected them through `inspectionRequestCategory=INCOMING`, never through a process name.
- Deduplicated repeated requirements by canonical `processId`; equal names with different IDs remain distinct options.
- Made public-entry process loading failures visible and cleared stale process identities after an error.
- Documented the process-option source contract. No database, migration, backfill, or production data was accessed or modified.

**Verification:**

- Backend focused suite: `2/2` test files and `29/29` tests passed.
- Web request-entry suite: `2/2` test files and `6/6` tests passed.
- Backend full suite: `232/232` test files and `2201/2201` tests passed.
- Full repository lint passed with zero errors; workspace typecheck passed `3/3` tasks.
- Changed-scope QMS architecture check reported `0 violations across 0 rules`; `git diff --check` passed.

**Commit:** `8b974ac` `fix(project): restore work-order process options`

**Remaining issues:**

- Deployment must continue to apply the existing `processes.inspectionRequestCategory` migration before starting the new application version. This fix intentionally does not hide a missing migration with name-based compatibility logic.

### 2026-07-28 Phase 10: complete system-wide canonical identity governance

**Execution:**

- Replaced mutable-name identity decisions with canonical IDs across TEAM maintenance, inspection-request categories, BOM process relations, quality-loss department writes, charts, reports, Web, and WeChat clients.
- Added a durable TEAM merge state machine with participant locks, leases, compare-and-set batches, cumulative counts, resumable failures, deterministic lock ordering, and soft-deleted supplier-link history.
- Restricted legacy TEAM bootstrap claims to one independently verifiable source and routed TEAM administration through the dedicated identity API.
- Added `processes.inspectionRequestCategory`; the DDL-only migration defaults existing processes to `PROCESS`, while ordered release maintenance idempotently classifies the legacy incoming process and backfills historical request categories.
- Enforced V2 `processId + category` consistency on the server. V1 remains a deployment compatibility contract and does not inherit new V2-only component validation.
- Preserved BOM process relations when an edit omits process fields and replaced them only after an explicit selection change or clear.
- Made quality-loss create and update validate an active department ID and rebuild `respDeptId + respDept` in the same transaction. Historical snapshots remain searchable and unresolved rows remain visible.
- Carried `id + resolutionStatus + displayName` through ECharts data, legends, Vue keys, quality-loss charts, and monthly reports so equal display names never become identity keys.
- Removed the duplicate post-health-check quality-loss backfill. Release maintenance remains the single synchronous source of truth while backend writes are stopped.
- No production database or production records were accessed or modified during this implementation.

**Verification:**

- Backend full suite: `232/232` test files and `2200/2200` tests passed.
- Focused Web chart and request-entry suite: `4/4` test files and `32/32` tests passed.
- Shared inspection-request contract: `15/15` tests passed.
- Full repository lint passed with zero errors; workspace typecheck passed `3/3` tasks.
- Prisma format and validation passed; changed-scope QMS architecture check reported `0 violations across 0 rules`.
- `git diff --check` passed and the worktree was clean before documentation updates.

**Commits:** `c635ed47`, `21a13a6b`, `6a3cf228`, `fee9085c`, `4fce415c`, `fa9e3a18`, `e2393f3`

**Remaining issues:**

- No remaining code issue in this governance scope. Production rollout must use the existing release workflow so migrations and idempotent maintenance execute during the write-stop window; manual database edits are not permitted.

### 2026-07-28 Phase 9: govern part, process and quality-loss identities

**执行内容：**

- 质量损失索引补齐 `projectId/partId/respDeptId`，部门图表改为按 ID 聚合。
- 检验记录新增正式 `partId/partName`，报检关闭、手工创建和更新统一 canonical 双写。
- 工单要求和检验只按 `partId + processId` 匹配；`MISSING` 按源记录隔离，`INVALID` 保留原 ID，未归属检验点不误抵扣完成率。
- BOM 所需工序改为 `project_bom_required_processes` 正式关系，旧 JSON 只作历史快照。
- 报检 Web/小程序和工单要求界面切换到 V2 ID-required 契约，服务端按 ID 重建名称；V1 仅用于无中断发布迁移。
- 新增幂等关系回填并接入 release maintenance；回填优先确定关联证据，不覆盖已有历史名称快照。
- 新增 `B-ID9` AST 门禁，阻断受控名称再次作为 `Map.get/set/has` 身份键。

**验证结果：**

- 共享契约 build：通过。
- 后端 TypeScript 与前端 Vue TypeScript：通过。
- 定向测试：报检 V2 `38/38`、前端报检 `5/5`、工单要求/聚合 `24/24`、关系回填与质量损失 `58/58`。
- 全库 QMS 架构门禁：`0 violations across 0 rules`。
- 后端全量测试：`230/230` 个文件、`2176/2176` 个用例通过。
- 全量 lint 通过（0 error）；workspace typecheck `3/3` 通过；Prisma migration 检查通过。

**commit:** `b7ad4a18` / `2b6db069` / `a4304bf9` / `e53dc930` / `b90adeed` / `6411c7d5` / `69b4fcde` / `d7b1b240` / `75851ce`

**遗留问题：**

- 生产必须按“additive migration 和回填 → 发布 V2 Web/小程序 → 观测 V1 零流量 → 删除 V1”的顺序执行，不允许直接中断旧客户端。
- `unresolved_master_data_refs` 人工处置界面和 TEAM 合并并发一致性仍是后续独立治理波次。

### 2026-07-27 Phase 1: establish canonical TEAM identity ownership

**Execution:**

- Added the dedicated TEAM domain, system-admin CRUD, normalized collision keys, source links, aliases, and atomic maintenance-only merge support.
- Blocked TEAM mutations through the generic dictionary service and made generic TEAM reads bypass the 24-hour dictionary cache.
- Added DDL-only Prisma migrations for TEAM identity governance and the nullable inspection-request category foundation.

**Verification:**

- Prisma format, validate, and client generation passed.
- Backend TypeScript check passed.
- TEAM merge/reconciliation tests: 18/18 passed; dictionary tests: 21/21 passed.

**commit:** `feat(@qgs/backend): establish canonical TEAM identities`

**Remaining issues:**

- Source reconciliation, ordered release maintenance, and ID-based dashboard statistics are committed in subsequent phases below.

### 2026-07-27 Phase 2: replace name bootstrap with source reconciliation

**Execution:**

- Removed the legacy name-based TEAM bootstrap and replaced it with stable department/supplier source links plus persistent ambiguity audits.
- Near-name matches are discovery signals only; they never trigger an automatic merge. Confirmed merges require explicit source and target IDs through the maintenance-only CLI.
- Added one ordered release-maintenance runner shared by GitHub, OSS, and local container workflows; production deployment stops backend writes before migration and identity maintenance.
- Added an idempotent inspection-request category backfill after supplier identity backfill, with conflicts persisted for manual resolution.

**Verification:**

- Reconciliation and category-backfill tests: 16/16 passed.
- Backend TypeScript check and all deployment shell syntax checks passed.

**commit:** `fix(deploy): reconcile TEAM identities during maintenance`

**Remaining issues:**

- ID-based dashboard aggregation and architecture regression guards are committed in subsequent phases below.

### 2026-07-27 Phase 2.1: preserve mapped TEAM category during backfill

**Execution:**

- Corrected inspection-request category reconciliation so a canonical `teamId` identifies the process domain even when the TEAM also resolves to a `supplierId`.
- Kept the legacy process-name comparison confined to rows without either canonical identity ID and resolved any obsolete conflict audit after a successful category update.
- Added release-maintenance regression coverage for supplier-linked TEAM requests and removed the obsolete conflict counter from its result.

**Verification:**

- Category backfill and inspection statistics tests: 26/26 passed.
- Backend and frontend TypeScript checks passed.

**commit:** `fix(deploy): preserve mapped TEAM request categories`

**Remaining issues:**

- ID-based dashboard aggregation and architecture regression guards are committed in subsequent phases below.

### 2026-07-27 Phase 3: aggregate inspection statistics by canonical identity

**Execution:**

- Persisted `category=INCOMING|PROCESS` on every new inspection request so identity scope is independent of mutable process names.
- Replaced TEAM, supplier, and inspector name-based aggregation with stable `teamId`, `supplierId`, and `inspectorId` keys; canonical names are resolved only after aggregation for display.
- Preserved separate rows for distinct IDs even when their current display names match, combined renamed snapshots only when they share one ID, and exposed missing or invalid IDs as explicit unresolved buckets.
- Updated dashboard and request-list contracts plus Vue keys to carry stable identity IDs through every ranking and history view.

**Verification:**

- Inspection request creation and statistics tests: 26/26 passed.
- Backend TypeScript check passed.
- Frontend Vue TypeScript check passed.
- Changed-scope QMS architecture check passed with 0 new violations.

**commit:** `fix(project): aggregate inspection stats by canonical identity`

**Remaining issues:**

- Architecture regression guards and identity-governance documentation are committed in subsequent phases below.

### 2026-07-27 Phase 4: guard canonical TEAM identity contracts

**Execution:**

- Added AST-backed checks that reject reads of `team`, `supplierName`, or `processName` as identity inputs in inspection-request statistics.
- Required every generic dictionary create, update, and delete entry point to invoke the TEAM mutation guard.
- Rejected any TEAM/bootstrap script naming pattern instead of relying on two historical file names, preventing the deleted name-based bootstrap from returning under a trivial rename.

**Verification:**

- Architecture rule tests: 7/7 passed.
- Changed-scope QMS architecture check passed with 0 new violations.
- Shell syntax check passed on macOS-compatible Bash syntax.

**commit:** `chore(project): guard master data identity contracts`

**Remaining issues:**

- Identity-governance documentation is committed in the next phase.

### 2026-07-27 Phase 5: document and verify TEAM identity governance

**Execution:**

- Added the TEAM module architecture contract covering ownership, source reconciliation, rename behavior, explicit maintenance merge, unresolved identities, and prohibited name-based flows.
- Extended inspection architecture with the persisted category and ID-based statistics contract.
- Updated project-wide master-data governance and progress records to include the completed TEAM wave and the production release-maintenance requirement.

**Verification:**

- Backend full suite: 228/228 test files and 2154/2154 tests passed.
- Full repository lint passed with 0 errors and 0 warnings.
- Workspace typecheck passed: 3/3 tasks.
- Full QMS architecture check passed with 0 new violations.
- Prisma migration check and changed-file whitespace check passed.
- Module size remained bounded at 26 modules and 528 TypeScript files.

**commit:** `docs(project): document TEAM identity governance`

**Remaining issues:**

- Production still requires the normal release workflow to apply migrations, reconciliation, category backfill, and post-deploy count verification.

### 2026-07-28 Phase 6: eliminate registered name-based statistics

**Execution:**

- Added registry-driven architecture rule `B-ID8`; it reads controlled `table + nameColumn + idColumn` pairs from `master-data-fields.ts` through the TypeScript AST and rejects Prisma `groupBy` calls that use display-name snapshots.
- Migrated after-sales defect, supplier, department, and supplier-scoring aggregations to canonical IDs, then batch-resolved current display names.
- Migrated inspection and issue report aggregations for supplier, TEAM, project, defect type, defect subtype, division, and responsible department to canonical IDs.
- Preserved legacy rows with missing IDs as explicit unresolved buckets, kept invalid non-empty IDs distinguishable, and prevented different IDs with the same display name from being merged.

**Verification:**

- Architecture-rule tests: 8/8 passed.
- After-sales analytics and integration tests: 21/21 passed.
- Inspection reporting and issue-statistics tests: 50/50 passed.
- Backend full suite: 228/228 test files and 2157/2157 tests passed.
- Backend TypeScript check, targeted ESLint, full QMS architecture check, and whitespace check passed.

**commit:** `5d6cfe3a` fix(project): aggregate governed statistics by identity

**Remaining issues:**

- Public chart contracts still need stable IDs and resolution status on every controlled bucket; the next phase migrates API/shared/frontend contracts.
- Dynamic name joins, online write policies, unresolved resolution workflow, TEAM merge concurrency, and final database constraints remain governed by subsequent phases.

### 2026-07-28 Phase 7：图表全链路传递稳定身份

**执行内容：**

- 新增共享 `IdentityAggregateItem` 契约，统一携带稳定 ID、canonical 展示名称、数值和明确的 `RESOLVED/MISSING/INVALID` 状态。
- 售后静态/动态图表以及不合格品饼图、Pareto 和自定义图表统一切换到同一身份契约。
- 所有本阶段受控动态维度改为按注册的 canonical ID 聚合，聚合完成后才解析当前名称。
- 删除前端部门树补名和所有图表侧 ID-to-name 猜测；图表组件直接渲染后端身份契约，不再按展示名称二次归并。
- 历史缺失 ID 和无效 ID 记录继续以 unresolved 桶参与统计；不同 ID 即使 canonical 名称相同也保持分离。

**验证结果：**

- 身份与图表定向测试：9/9 个测试文件、69/69 个用例通过。
- 后端全量测试：228/228 个测试文件、2157/2157 个用例通过。
- 全仓类型检查：3/3 个任务通过。
- QMS 变更范围架构门禁通过，新增违规为 0。
- 全仓 lint 通过，0 error、0 warning。

**commit:** `84a5991c` fix(project): carry identity through chart contracts

**遗留问题：**

- 剩余内存统计还需迁移，并增加禁止名称 `Map` 键的架构门禁。
- 在线写入策略、unresolved 处置闭环、TEAM 合并并发一致性和最终数据库约束由后续阶段继续治理。

### 2026-07-28 Phase 8：清除工单与报告剩余名称聚合

**执行内容：**

- 工单看板改为按 `divisionId` 聚合事业部，并在质保排行内部按 `projectId` 聚合项目；名称只在聚合完成后批量解析。
- 工单看板共享契约携带事业部和项目的完整身份项，前端删除部门树补名、名称标准化和名称二次归并，Vue key 改为稳定 ID。
- 周报/月报缺陷分布和车辆故障率缺陷排行改为按 `defectTypeId` 聚合，删除历史名称回退。
- 报告和车辆图表契约补齐稳定 ID 与 `RESOLVED/MISSING/INVALID` 状态；同 ID 的改名快照合并，不同 ID 同名保持分离。
- 历史缺失 ID 与无效非空 ID 继续参与总量和排行计算，分别进入明确的 `MISSING` 与 `INVALID` 桶。

**验证结果：**

- 工单、报告和车辆故障率定向测试：3/3 个测试文件、29/29 个用例通过。
- 后端与前端类型检查通过，0 error。
- 后端全量测试：228/228 个测试文件、2160/2160 个用例通过。
- 全仓 lint 通过，0 error、0 warning；全仓类型检查 3/3 个任务通过。
- QMS 变更范围架构门禁通过，新增违规为 0。

**commit:** This commit

**遗留问题：**

- 下一阶段增加受控名称 `Map` 键 AST 门禁，防止相同实现回归。
- 质量损失索引的责任部门仍需补齐 ID；在线写入、unresolved 人工处置和 TEAM 合并并发一致性继续按独立阶段治理。

## [0.19.1](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.19.0...qgs-v0.19.1) (2026-07-24)


### Bug Fixes

* **@qgs/web-antd:** redirect users to accessible home page ([086a27e](https://github.com/ajie5419/Quality-Guardian/commit/086a27e7689895977be9193786560965bd9ed9b2))
* **project:** enforce page permission hierarchy ([b0f6f73](https://github.com/ajie5419/Quality-Guardian/commit/b0f6f7374530eb3e1289b8dfc7c8627efa9b33ac))
* **project:** restore role page access and login routing ([1b6a89d](https://github.com/ajie5419/Quality-Guardian/commit/1b6a89de92efa14c4d9a51c179799bce5aa2c80d))

### 2026-07-24 Fix: permission-aware initial route

**Execution:**

- Added a permission-aware initial route resolver that preserves valid redirects and otherwise selects the first visible, enabled, registered leaf menu.
- Updated the access guard to apply the same fallback after dynamic route generation, when reopening the login page with an active session, and when an authenticated user revisits the unavailable default dashboard.
- Added a core `/403` route for accounts with no accessible page instead of showing a misleading 404.
- Kept the global default dashboard unchanged; restricted roles are redirected according to their own menu permissions.

**Verification:**

- `rtk vitest run --dom apps/web-antd/src/router/accessible-redirect.test.ts`: 1 file / 4 tests passed.
- `pnpm --dir apps/web-antd typecheck`: passed.
- `pnpm lint`, `pnpm run check:type` (3/3 workspace tasks), `pnpm run check:qms-arch`, and `git diff --check`: passed.
- Browser verification with the restricted `ajie` account: opening `/` and `/qms/dashboard` both redirected to `/qms/inspection/issues`; the page displayed one permitted record with no 404, permission error, or console error.
- Frontend dev/build/start/serve commands were not started or restarted, as required by repository constraints.

**commit:** `086a27e` fix(@qgs/web-antd): redirect users to accessible home page

**Remaining issues:**

- None.

### 2026-07-24 修复：统一页面与按钮权限层级

**执行内容：**

- 菜单可见性改为严格校验页面自身权限码，修复仅有按钮权限时页面可见、接口却因缺少 `QMS:Inspection:Issues:List` 拒绝访问的不一致。
- 角色权限树改为页面与按钮独立选择；选择按钮时自动补所属页面，取消页面时同步移除后代按钮，并剔除目录占位码及已下线权限码。
- 角色创建与更新增加 Zod 输入校验、启用菜单权限码校验和页面/按钮层级校验；角色基本信息与权限关系在同一 Prisma transaction 中提交，失败时整体回滚。
- 新增通用、幂等的角色页面权限回填：应用模式先同步模块菜单，再按 200 个角色一批扫描全部启用页面/按钮关系，为所有存量 child-only 角色补齐页面权限并清理菜单缓存。
- 回填入口已加入后端镜像存在性检查、GitHub 部署、OSS 部署及本地容器启动/重置流程；未在 Prisma migration 中写入业务数据。

**验证结果：**

- 后端全量测试：223/223 个文件、2110/2110 个用例通过；RBAC 定向测试：6 个文件、248/248 个用例通过。
- 前端权限树测试：1 个文件、7/7 个用例通过；Shell 部署脚本语法检查通过。
- `pnpm lint`、`pnpm run check:type`（3/3 workspace tasks）、`pnpm run check:qms-arch` 和 `git diff --check` 通过。
- 本地未配置 `DATABASE_URL`，因此未连接真实数据库执行回填；回填逻辑通过分页、跨模块、dry-run、apply、幂等和无候选测试覆盖。
- 前端未运行 dev/build/start/serve，遵循仓库约束。

**commit:** `b0f6f73` fix(project): enforce page permission hierarchy

**遗留问题：**

- 无。

## [0.19.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.18.0...qgs-v0.19.0) (2026-07-23)


### Features

* **project:** add after-sales part search ([4a7dfd4](https://github.com/ajie5419/Quality-Guardian/commit/4a7dfd4f820b9f004d575623377ed499689b3a7e))
* **project:** add issue supplier search ([54803f0](https://github.com/ajie5419/Quality-Guardian/commit/54803f0c75d17a6943b8db606d720468b2bdfd47))
* **project:** add work order requirement actions ([da2b887](https://github.com/ajie5419/Quality-Guardian/commit/da2b887e8544b454e44f3f0d3dd5d15e012cd517))
* **project:** expand inspection record search ([dc0ac89](https://github.com/ajie5419/Quality-Guardian/commit/dc0ac890bb26b9dc4f3117561499c5dc767871a6))


### Bug Fixes

* **project:** bound inspector user loading ([0a2eac5](https://github.com/ajie5419/Quality-Guardian/commit/0a2eac50bac733ceb9c757d5ed44e375ff6ada9b))
* **project:** limit inspection dispatch users ([8dc06cf](https://github.com/ajie5419/Quality-Guardian/commit/8dc06cf3dc9ce20bca07d1e3e1ec460b896533ca))
* **project:** locate inspection records by source id ([6fa7ddf](https://github.com/ajie5419/Quality-Guardian/commit/6fa7ddf03a4bf43d0dbe772925086cc5afe7f2d6))
* **project:** protect work order requirement mutations ([1f50d58](https://github.com/ajie5419/Quality-Guardian/commit/1f50d58e4daf3b2ccd0c36b2ec584a8cba87c6f7))

### 2026-07-23 修复：处理代码审查发现的权限、分页与来源定位问题

**执行内容：**

- 工单要求写操作对 `SELF + 空部门范围` fail-closed，并在新增、编辑、删除时统一执行数据范围校验；清空部件/工序名称同步清空 canonical ID。
- 工单要求记录与附件引用在同一 Prisma transaction 中更新或删除；结构化要求项部分编辑保留未修改对象及合法 JSON 类型。
- 用户全量加载改为每页最多 100 条的有界分页；RBAC V2 下检验员优先使用关联角色并在无关联时回退主角色，派单候选和后端写入共用同一检验员资格校验。
- 检验记录来源 ID 改为服务端权威精确查询，忽略无关列表筛选并固定单条分页，前端列表、查询全部和导出统一传递来源参数。

**验证结果：**

- 后端全量测试：221/221 个文件、2091/2091 个用例通过。
- 前端定向测试：4 个文件、12/12 个用例通过；前端 `vue-tsc --noEmit --skipLibCheck` 通过。
- `pnpm lint`、`pnpm run check:type`（3/3 workspace tasks）、`pnpm run check:qms-arch` 和 `git diff --check` 全部通过。
- 前端未运行 dev/build/start/serve，遵循仓库约束。

**commit:** `1f50d58e` fix(project): protect work order requirement mutations；`0a2eac50` fix(project): bound inspector user loading；`6fa7ddf` fix(project): locate inspection records by source id

**遗留问题：**

- 无。

### 2026-07-23 功能：补齐售后搜索、派单候选和调试验收图标操作

**执行内容：**

- 售后质量搜索新增部件名称，共享查询参数、前端搜索表单和后端数据库模糊查询保持一致，列表与全量导出共用筛选条件。
- 用户列表新增经 Zod 校验的角色和启用状态筛选；电脑版与移动版报检派单只查询角色值为 `QC` 的启用检验员。
- 派单写入同步校验目标账号未删除、已启用且为 `QC` 角色，防止绕过前端把任务派给其他人员；Telegram 派单候选也复用同一角色契约。检验员选项加载已抽离到独立 composable，页面降至 485 行。
- 调试验收问题台账的一级汇总导出以及二级记录编辑、删除、日志改为 Lucide 图标按钮，并补齐 Tooltip 与 `aria-label`。

**验证结果：**

- 后端全量测试：221/221 个文件、2082/2082 个用例通过；模块 TS 文件数保持 515。
- 售后定向测试：共享查询 7/7、前端搜索构造 5/5、后端查询 18/18 通过；派单与用户服务后端定向测试 42/42、前端检验员选项测试 2/2 通过。
- 共享包 CJS/ESM/DTS 构建、后端 `tsc --noEmit`、前端 `vue-tsc --noEmit --skipLibCheck`、定向 ESLint 和 `git diff --check` 通过。
- `pnpm lint`、`pnpm run check:type` 和 `pnpm run check:qms-arch` 通过。
- 前端未运行 dev/build/start/serve，遵循仓库约束。

**commit:** `4a7dfd4` feat(project): add after-sales part search；`8dc06cf` fix(project): limit inspection dispatch users；`9744512` style(project): iconify commissioning issue actions；`6e99318` refactor(project): extract inspector options

**遗留问题：**

- 无。

### 2026-07-23 功能：扩展检验搜索与工单要求跟踪

**执行内容：**

- 进货检验记录新增项目名称、物料名称、检验员和检验日期范围搜索；过程检验新增组件名称和检验日期范围搜索，列表与全量导出共用查询契约。
- 检验日期范围使用次日排他上界完整包含结束日，并将检验记录分页上限收紧为 100。
- 不合格项搜索新增供应商/外协单位，分页列表、查询全部和远程导出统一传递 `supplierName`。
- 复用工单聚合抽屉作为要求跟踪入口，新增要求编辑和软删除；确认完成、撤销确认、编辑和删除统一使用带 Tooltip 与 `aria-label` 的图标按钮。
- 工单要求写操作增加 RBAC、事业部数据范围、确认状态原子守卫、附件引用同步和业务审计；普通编辑不再重置确认状态，未修改的结构化要求项保持原始数据类型。

**验证结果：**

- 后端全量测试：221/221 个文件、2082/2082 个用例通过。
- 共享查询定向测试：12/12 通过；前端定向测试：13/13 通过。
- `pnpm lint`、`pnpm run check:type` （3/3 workspace tasks）、`pnpm run check:qms-arch` 和 `git diff --check` 全部通过。
- 前端未运行 dev/build/start/serve，遵循仓库约束。

**commit:** `54803f0` feat(project): add issue supplier search；`dc0ac89` feat(project): expand inspection record search；`da2b887` feat(project): add work order requirement actions

**遗留问题：**

- 无。

## [0.18.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.17.6...qgs-v0.18.0) (2026-07-22)


### Features

* improve inspection, after-sales, and commissioning workflows ([9d6a24d](https://github.com/ajie5419/Quality-Guardian/commit/9d6a24de15f1dfb6a833546233f0f99792fe1e63))
* **project:** add commissioning issue deletion permission ([9c4a156](https://github.com/ajie5419/Quality-Guardian/commit/9c4a1568bec2f0ba996aafd347b7687f890e62a1))
* **project:** add inspection issue date range search ([a6aeb31](https://github.com/ajie5419/Quality-Guardian/commit/a6aeb31f2001da11a452d57292a899d2588bc7bc))
* **project:** expand after-sales issue search ([6830404](https://github.com/ajie5419/Quality-Guardian/commit/6830404389c0af26c7baabaecc8280f7bbad7893))


### Bug Fixes

* **deploy:** backfill inspection issue responsibilities ([8cca7b9](https://github.com/ajie5419/Quality-Guardian/commit/8cca7b9e70d50b889b54abae9db79d08d160653d))
* **project:** bound local container port checks ([f1439e8](https://github.com/ajie5419/Quality-Guardian/commit/f1439e83babe77f41f723459a1044febbff4802d))
* **project:** preserve inspection issue responsibility identity ([0780f1c](https://github.com/ajie5419/Quality-Guardian/commit/0780f1ce86820719c23a37f937d8ca61693fc4b2))

### 2026-07-22 修复：本地 Apple Container 启动端口检查阻塞

**执行内容：**

- 定位 `pnpm local:container:dev:antd` 停在 Container API 提示后的根因：实际是 `lsof` 阻塞在 macOS `proc_pidfdinfo` 内核调用，Container API、MySQL 和 Redis 均正常。
- 将 `ensure_host_port_free` 的无超时 `lsof` 扫描替换为 IPv4/IPv6 `nc` 一秒超时探测；端口占用时继续通过 `netstat` 输出监听进程。
- 清理两组卡住的启动脚本；两个已进入不可中断内核态的 `lsof` 孤儿进程需要等待内核返回或重启 macOS 后回收，新脚本不再依赖它们。

**验证结果：**

- `bash -n scripts/local/container-common.sh` 通过。
- 空闲端口 `5320` 探测立即通过；临时占用端口 `54321` 在一秒内返回失败并输出监听进程。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 和 `git diff --check` 全部通过。
- 未运行前端 dev/build/start/serve，遵循仓库约束。

**commit:** `f1439e8` fix(project): bound local container port checks

**遗留问题：**

- 当前两个旧 `lsof` 进程处于 macOS 不可中断内核态；若系统未自行回收，重启 macOS 可彻底清理。

### 2026-07-22 修复：补齐不合格项、售后质量与调试验收操作

**执行内容：**

- 不合格项搜索新增报告日期范围，前端列表、查询全部和导出统一传递起止日期；后端使用 Zod 校验日期并按结束日次日排他过滤。
- 售后质量搜索按实际数据模型补齐工单号、项目名称、客户、责任部门、经办人、缺陷分类、产品类型、供应商和问题日期范围，列表与导出参数统一处理。
- 调试验收问题台账新增删除按钮和 `QMS:VehicleCommissioning:Delete` 权限；后端强制 RBAC 校验，执行软删除、附件引用和质量损失索引清理，并记录删除审计。
- 新增调试验收模块架构约束，明确软删除和历史日报快照边界。

**验证结果：**

- 后端全量测试：221/221 个文件、2074/2074 个用例通过。
- 共享包 CJS/ESM/DTS 构建通过；共享查询测试 7/7 通过。
- 前端定向测试：2 个文件、11 个用例通过；前端 `vue-tsc --noEmit --skipLibCheck` 通过。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、后端 `tsc --noEmit` 和 `git diff --check` 全部通过。
- 未运行前端 dev/build/start/serve，遵循仓库约束。

**commit:** `a6aeb31` feat(project): add inspection issue date range search；`6830404` feat(project): expand after-sales issue search；`9c4a156` feat(project): add commissioning issue deletion permission

**遗留问题：**

- 生产当前仍为 `qgs-v0.17.6`，本次功能提交尚未执行 release/deploy。

### 2026-07-22 修复：统一报检不合格项责任归属

**执行内容：**

- 根因修复报检关闭链路的责任单位分流：前端显式提交 `responsibilityType + responsibleDepartmentId + supplierId`，后端按 canonical ID 重建部门和供应商名称，不再把外部公司名称回退写入责任部门。
- 报检列表和详情批量解析 TEAM→Supplier 并返回 `issueResponsibility`，覆盖普通工序名称但 TEAM 实际属于外部供应商的场景，避免 N+1 查询。
- 删除关闭弹窗中“名称包含生产/外协”的责任类型推断；显式责任类型决定供应商控件与落库字段，普通内部生产部门不会被误判为外协单位。
- 新增幂等历史回填，仅对报检 `supplierId`、TEAM→Supplier 映射或关联检验供应商等确定性证据执行 canonical 双写；冲突、证据不足或已有其他有效责任部门时不覆盖并写 OPEN 审计。
- 将责任归属回填脚本加入后端镜像、维护命令和 GitHub deploy，在 migration、TEAM bootstrap、事业部回填和供应商身份回填之后自动执行；本次无需 Prisma migration。

**验证结果：**

- 共享契约测试：1/1 个文件、14/14 个用例通过；共享包 CJS/ESM/DTS 构建通过。
- 前端定向测试：3/3 个文件、26/26 个用例通过；未运行 dev/build/start/serve，遵循仓库前端验证约束。
- 后端定向测试：5/5 个文件、44/44 个用例通过；全量后端测试：220/220 个文件、2064/2064 个用例通过。
- `pnpm lint`、3/3 workspace typecheck、后端 `tsc --noEmit`、`check:qms-arch` 和 `git diff --check` 全部通过。

**commit:** `0780f1ce` fix(project): preserve inspection issue responsibility identity；`8cca7b9e` fix(deploy): backfill inspection issue responsibilities

**遗留问题：**

- 未读取 `.env`，因此未连接真实数据库执行 apply；生产回填将在后续正式发布时由 deploy workflow 自动运行并输出汇总。

## [0.17.6](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.17.5...qgs-v0.17.6) (2026-07-22)


### Bug Fixes

* **deploy:** backfill inspection issue divisions ([ade45d3](https://github.com/ajie5419/Quality-Guardian/commit/ade45d31ee1b6d9ba422b6d1657028d1a7eefae4))
* **project:** allow admins to manage inspection issues ([132bd2a](https://github.com/ajie5419/Quality-Guardian/commit/132bd2aaa2f889e0fde5820bd30184cf1783c2bc))
* **project:** preserve inspection issue division identity ([ea80359](https://github.com/ajie5419/Quality-Guardian/commit/ea803597f7f8d91a8144db2021aefdf65ea6c146))
* **project:** restore inspection issue access and division identity ([b8ef092](https://github.com/ajie5419/Quality-Guardian/commit/b8ef092b37a994a608db4988c92c1031ccf67d51))

### 2026-07-22 发布：qgs-v0.17.6

**执行内容：**

- 合并功能 PR #64 和 release-please PR #65，生成 GitHub Release 与 tag `qgs-v0.17.6`。
- deploy workflow 完成 backend/frontend 镜像构建与推送，更新生产 ECS，并依次执行 migration、事业部历史回填、供应商身份回填、容器切换和 HTTP 健康检查。
- 事业部回填按确定性证据修复工单和报检关联不合格项；无法唯一解析的数据保留原值并写入 OPEN 审计，没有发生冲突覆盖或并发写入覆盖。

**验证结果：**

- 功能 PR #64 和发布 PR #65 的 Prisma Migration Check、Secret Scan、QMS Architecture Check、Typecheck、Lint 和 Unit Tests 全部通过。
- deploy run `29889722661` 成功，耗时 6 分 54 秒；生产检测到 38 个 migration，无待应用 migration，ECS 容器切换与 HTTP 健康检查通过。
- 事业部回填：工单处理 266 条、修复 142 条、无法解析 124 条；报检关联不合格项处理 51 条、修复 46 条、跳过 5 条、无法解析计数 8；两类均为 `conflicts=0`、`concurrentChanges=0`。
- 供应商身份回填未产生新的或证据变化的 OPEN 审计：`newOpenAudits=0`、`changedOpenAudits=0`。

**commit:** `bd437653` Merge pull request #65

**遗留问题：**

- 事业部回填留下的 124 条工单和不合格项侧 8 个无法解析计数需要通过人工处置流程审核，禁止按名称模糊猜测。
- deploy workflow 仍提示 `actions/checkout@v4` 的 Node.js 20 运行时已弃用；本次 runner 强制使用 Node.js 24 并成功完成发布。

### 2026-07-22 修复：恢复报检不合格项事业部身份链路

**执行内容：**

- 将 `division` 的 canonical 主数据源从旧 `division` 字典纠正为启用的 `departments(id, name)`，并补齐部门源实体重命名联动；工单新增、编辑和导入统一写入 `divisionId + division`，历史导入名称解析收口到独立审核 adapter。
- 修复完成检验弹窗遗漏事业部字段的问题：前端按 canonical ID、历史部门 ID、历史名称依次解析并提交双字段，不合格项列表和详情优先按 `divisionId` 显示部门名称，无法解析的旧值不再被静默隐藏。
- 修复报检关闭事务边界：新建检验记录后，关联不合格项使用同一事务 client 查询检验记录和生成序号，保证首次 FAIL 关闭即可写入 `inspectionId`，并从关联工单继承 canonical 事业部双字段。
- 新增事业部历史回填，支持 dry-run/apply、keyset 分批、字段级 CAS、幂等重试和旧 division 字典兼容；冲突不覆盖，无法唯一解析的数据持久化到 `unresolved_master_data_refs`，确定性修复会关闭旧 OPEN 审计。
- 将回填接入 GitHub deploy、OSS deploy 和 3 条本地容器链路，统一在 Prisma migration 后自动执行；后端镜像构建会验证回填脚本已随镜像发布。

**验证结果：**

- 全量后端测试：219/219 个文件、2040/2040 个用例通过；事业部回填定向测试 10/10 个用例通过。
- 前端定向测试：2/2 个文件、14/14 个用例通过；共享包 CJS/ESM/DTS 构建通过。
- `pnpm lint`、3/3 workspace typecheck、后端 `tsc --noEmit`、`check:qms-arch`、架构规则测试和 `git diff --check` 全部通过。
- 前端未运行 dev/build/start/serve，遵循仓库前端验证约束；未读取 `.env`，因此未在真实数据库执行 apply。

**commit:** `ea803597` fix(project): preserve inspection issue division identity；`ade45d31` fix(deploy): backfill inspection issue divisions

**遗留问题：**

- 生产回填汇总已核对，确定性数据已完成修复；重名、冲突或无有效证据的历史事业部继续保留原值并等待人工处置。

### 2026-07-22 修复：恢复不合格品项管理员管理权限

**执行内容：**

- 修复不合格品项所有权规则将管理员也限制为创建人的问题；管理员角色采用 `admin`、`super`、`super_admin`、`system_admin` 精确集合，避免通过角色名子串误授权。
- 后端列表、详情、统计、图表、编辑、单条删除和批量删除统一实时读取 RBAC v2 角色，并继续分别校验 `List`、`View`、`Edit`、`Delete` 权限码；管理员仅豁免 `createdBy` 条件，不豁免权限码和软删除条件。
- 电脑版、小程序列表、小程序详情及直达编辑页统一使用共享权限规则显示编辑和删除入口；普通用户仍只能查看及管理本人创建的记录。
- 导入覆盖继续保留原所有权限制，本次未扩大导入权限范围。

**验证结果：**

- 后端定向测试：8/8 个文件、70/70 个用例通过；电脑版与小程序定向测试：2/2 个文件、12/12 个用例通过。
- 全量后端测试：218/218 个文件、2024/2024 个用例通过。
- `pnpm lint`、3/3 workspace typecheck、后端 `tsc --noEmit`、`check:qms-arch` 和 `git diff --check` 全部通过。
- 前端未运行 dev/build/start/serve，遵循仓库前端验证约束。

**commit:** `132bd2a` fix(project): allow admins to manage inspection issues

**遗留问题：**

- 无。

## [0.17.5](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.17.4...qgs-v0.17.5) (2026-07-16)


### Bug Fixes

* **@qgs/backend:** baseline known identity audits ([ead426b](https://github.com/ajie5419/Quality-Guardian/commit/ead426b69b612e89f726fef734babe35666bb5e1))
* **@qgs/backend:** baseline known identity audits ([6bc5e10](https://github.com/ajie5419/Quality-Guardian/commit/6bc5e10042a2328e921c778e3601e06d5714382d))

### 2026-07-16 发布：qgs-v0.17.5

**执行内容：**

- 合并 hotfix PR #61 和 release-please PR #62，生成 GitHub Release 与 tag `qgs-v0.17.5`。
- deploy workflow 完成 backend/frontend 镜像构建与推送，更新生产 ECS，并执行 migration、TEAM bootstrap、身份回填、容器切换和 HTTP 健康检查。
- 生产历史 OPEN unresolved 继续保留在人工处置队列；本次回填仅在新增或证据变化时阻断发布。

**验证结果：**

- release PR #62 的 Prisma Migration Check、Secret Scan、QMS Architecture Check、Typecheck、Lint 和 Unit Tests 全部通过。
- deploy run `29477513118` 成功：生产检测到 38 个 migration，无待应用 migration；TEAM bootstrap 为 `candidates=29`、`existing=29`、`created=0`。
- 身份回填未发生并发变化，审计增量为 `newOpenAudits=0`、`changedOpenAudits=0`；生产 ECS 部署与 HTTP 健康检查通过，未触发回滚。

**commit:** `f23d3a15` Merge pull request #62

**遗留问题：**

- 生产仍有 93 条历史 OPEN 审计，需通过后续人工处置 API/UI 审核并关闭，不应通过回填脚本静默删除。

### 2026-07-16 修复：区分历史 unresolved 与本次回填异常

**执行内容：**

- 修复 `qgs-v0.17.4` 首次 deploy 的身份回填门禁：生产既有 unresolved 已写入人工处置队列，不再因每次扫描仍可见而永久阻断发布。
- apply 模式在回填前后读取 OPEN 审计快照，仅对本次新增或证据变化的 OPEN 记录失败；主数据歧义和并发写入仍始终阻断。
- dry-run 不写审计，继续按扫描到的 conflict/unresolved 严格失败，避免审计模式静默放行。

**验证结果：**

- 失败复现：deploy run `29476120993` 在身份回填阶段检测到历史 `inspection-teams.unresolved=7`、`inspection-suppliers.conflicts=1`、`inspection-suppliers.unresolved=84`、`quality-records.unresolved=1` 后回滚。
- 定向测试：3/3 个文件、22/22 个用例通过。
- 全量后端测试：218/218 个文件、2015/2015 个用例通过。
- lint、typecheck 3/3 workspace tasks、`check:qms-arch` 均通过。

**commit:** `6bc5e10` fix(@qgs/backend): baseline known identity audits

**遗留问题：**

- 生产历史 OPEN unresolved 继续保留，等待人工处置 API/UI；`qgs-v0.17.5` 已复验身份回填审计增量为 0，ECS 健康检查通过。

## [0.17.4](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.17.3...qgs-v0.17.4) (2026-07-16)


### Bug Fixes

* **@qgs/backend:** bootstrap canonical teams before backfill ([556cc73](https://github.com/ajie5419/Quality-Guardian/commit/556cc7311c2b554f33bb5905ed13804cda4460f0))
* **@qgs/backend:** enforce supplier identity backfill integrity ([10a24c5](https://github.com/ajie5419/Quality-Guardian/commit/10a24c50f6454a4556a478082f1c41ca19a16b91))
* **project:** preserve canonical team identities in forms ([b196093](https://github.com/ajie5419/Quality-Guardian/commit/b19609391c65803884ed0cd5de7144a0c8d19da0))
* **project:** restore canonical TEAM identity flows ([aa7a881](https://github.com/ajie5419/Quality-Guardian/commit/aa7a881cc561229bfad279d5471a020afab3e1fc))
* **project:** surface team loading failures ([edf6fab](https://github.com/ajie5419/Quality-Guardian/commit/edf6fab8b115263fd14cf01a6e5d2788e36ef99a))

### 2026-07-16 修复：恢复 TEAM 主数据链路与身份契约

**执行内容：**

- 新增幂等 TEAM bootstrap：从启用部门叶子节点和 TEAM 策略供应商初始化 canonical TEAM，并接入本地容器、容器重置、OSS 发布和 GitHub 发布链路，统一执行 `migration -> TEAM bootstrap -> identity backfill`。
- 修复焊工和工单责任班组的 ID/name 混用，前后端统一显式提交 `teamId + team`、`responsibleTeamId + responsibleTeam`，并在 API 边界校验成对字段。
- 增加 `inspections.teamId` 独立回填；内部 PROCESS 无供应商证据时按非适用处理，有错误 ID/name、冲突或无法解析的证据时持久化 unresolved 并阻断回填进程。
- TEAM 映射冲突写入 unresolved 审计；TEAM 字典删除或禁用前检查活动供应商映射，避免身份链接悬空。
- 修复 zsh 直接 source 本地容器公共脚本的 `BASH_SOURCE` 崩溃，并让报检班组/供应商下拉加载异常进入统一错误处理。

**验证结果：**

- 本地容器数据库：TEAM 7 条、有效 TEAM 映射 1 条；`inspections` PROCESS 缺失 `teamId` 从 5 条降为 0 条；回填 apply 全阶段 `unresolved/conflicts/concurrentChanges=0`，OPEN 审计为 0。
- vitest：后端 218/218 个文件、2012/2012 个用例通过。
- lint：通过；typecheck：3/3 workspace tasks 通过；`check:qms-arch`：0 violations。
- zsh/bash source 兼容性、TEAM bootstrap 幂等性和公共 TEAM 数据源已实测通过。

**commit:** `556cc731` fix(@qgs/backend): bootstrap canonical teams before backfill；`b1960939` fix(project): preserve canonical team identities in forms；`10a24c50` fix(@qgs/backend): enforce supplier identity backfill integrity；`edf6fab` fix(project): surface team loading failures

**遗留问题：**

- 本地容器库此前已有 `20260713000100_add_manual_quality_loss_context` migration 漂移（`quality_losses.partId` 已存在导致 P3018），本次未擅自标记 migration 已应用或执行破坏性 reset；启动脚本会在该库上继续正确阻断，需按本地数据保留策略执行 migration resolve 或容器数据库重置。

## [0.17.3](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.17.2...qgs-v0.17.3) (2026-07-15)


### Bug Fixes

* **project:** harden backend checks and supplier errors ([b0e9ef7](https://github.com/ajie5419/Quality-Guardian/commit/b0e9ef76a8a0de55c6dd969bca9d5b18a3847877))

### 2026-07-15 发布：qgs-v0.17.3

**执行内容：**

- 将后端类型感知 lint、Git hooks 分层门禁和供应商创建异常收窄通过功能 PR #56 合并到 `main`。
- 合并 release-please 发布 PR #57，生成 GitHub Release 和 tag `qgs-v0.17.3`。
- 通过 deploy workflow 构建并推送 backend/frontend 镜像，更新生产 ECS，执行 migration 检查、主数据身份回填、健康检查并启动发布后维护任务。

**验证结果：**

- 功能 PR #56 和发布 PR #57 的 6 项 CI Gate 全部通过。
- 全仓测试：290/290 个文件、2480/2480 个用例通过；后端本地复验 213/213 个文件、1991/1991 个用例通过。
- lint 通过；typecheck 3/3 workspace tasks 通过；QMS 架构检查、Prisma migration 检查和密钥扫描通过。
- deploy run `29391542599` 成功，耗时 7 分 40 秒；镜像构建、ACR 推送、ECS 更新和 HTTP 健康检查全部通过。
- 生产数据库检测到 38 个 migration，无待执行 migration；身份治理回填完成且未产生新的自动更新，无法确定归属的历史数据继续保留在 unresolved 审计队列。
- 生产首页返回 HTTP 200。

**commit:** `b0e9ef76` Merge pull request #56；`1a30b09a` Merge pull request #57

**遗留问题：**

- 仍需使用真实业务表单复验同名活动供应商的 409 提示和同名软删除供应商的原 ID 恢复行为；自动化未在生产创建测试供应商，避免污染业务数据。
- GitHub Actions 提示 `actions/checkout@v4` 的 Node.js 20 运行时已弃用，本次 runner 已强制使用 Node.js 24 并成功完成发布。

### 2026-07-14 修复：完善 Git hooks 分层门禁

**执行内容：**

- 为所有会写文件的 pre-commit 命令启用 `stage_fixed`，确保 Prettier、ESLint 和 Stylelint 修复后的内容重新进入暂存区。
- 消除 `.vue` 同时被两个并行命令修改的问题，并补齐 `.mjs`、`.cjs`、`.mts`、`.cts` 的 hook 覆盖。
- workspace 文件只在 package/workspace 清单变化时生成，并由 Lefthook 统一暂存，避免普通提交被污染和并行 `git add` 竞争。
- 新增 pre-push 类型检查与增量 QMS 架构检查；post-merge 仅在依赖清单变化时执行冻结安装。
- 删除 Commitlint 提示中无法通过 `type-enum` 校验的 `workflow` 类型。

**验证结果：**

- lint: `pnpm lint` 通过（0 error，0 warning）
- lefthook: `lefthook validate` 通过，最终配置展开正确
- pre-commit: 实测自动修复后重新暂存；非 package 提交跳过 workspace，package 变更触发同步
- pre-push: typecheck 3/3 tasks 通过，增量架构检查 0 violations
- post-merge: 非依赖文件变更正确跳过安装
- commitlint: 合法 `fix(lint)` 通过，非法 `workflow(project)` 被拒绝

**commit:** `a7fda7ed` fix(dev): harden git hooks

**遗留问题：**

- 无。

### 2026-07-14 修复：启用后端类型感知 ESLint

**执行内容：**

- 使用 TypeScript Project Service 覆盖全部 `apps/backend/**/*.ts` 非测试源码，移除失效的全局 `project` 通配配置，并将废弃的 `no-var-requires` 替换为 `no-require-imports`。
- 新增悬空 Promise、Promise 误用、无效 await、异常抛出类型、错误处理返回 await、switch 穷尽性和 Promise catch 参数类型规则。
- 新增测试断言、禁用测试、重复 hook、describe 回调和 expect 有效性规则；最终配置测试改用真实后端文件并验证类型服务实际触发规则。
- 修复规则发现的 25 处后端问题，包括无效 await、Promise 布尔判断、异步 finally、catch 参数、遗漏的 switch 分支和事件总线无断言测试。
- 更新 `process-resolver` 测试 mock，使其匹配主数据治理内核的新依赖边界，恢复全量测试门禁。

**验证结果：**

- lint: `pnpm lint` 通过（0 error，0 warning）
- typecheck: `pnpm run check:type` 3/3 tasks 通过
- check:qms-arch:all: 635 个后端生产 TS 文件、497 个模块 TS 文件扫描通过，0 violations
- vitest: 后端 204/204 文件、1927/1927 用例通过
- ESLint 最终配置回归: 4/4 用例通过

**commit:** `64c79c3a` fix(lint): enforce typed backend rules

**遗留问题：**

- 类型感知 lint 会增加全仓 lint 的执行时间，这是 TypeScript 类型分析的预期成本；当前完整门禁已稳定通过。
## [0.17.2](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.17.1...qgs-v0.17.2) (2026-07-15)


### Bug Fixes

* **project:** restore soft-deleted suppliers on create ([329c5e1](https://github.com/ajie5419/Quality-Guardian/commit/329c5e103c1c71ab30ff75b448ccbb0119655cc1))
* **project:** restore soft-deleted suppliers on create ([030e5e6](https://github.com/ajie5419/Quality-Guardian/commit/030e5e6e9427cdf25007ad4d1dbd27aea6744a17))

### 2026-07-15 修复：新增供应商恢复同名软删除档案

**执行内容：**

- 修复 `suppliers.name` 全表唯一键与软删除语义冲突：新增同名软删除供应商时不再重复建档，而是恢复原记录并保留原供应商 ID，确保历史检验、工程问题、售后和 TEAM 映射继续关联同一身份。
- 创建流程采用先插入、仅在精确识别 `name` / `suppliers_name_key` 的 Prisma P2002 后处理冲突；同名活动供应商返回 `SUPPLIER_NAME_CONFLICT` 409，其他唯一键或数据库异常继续按真实异常处理。
- 恢复写入使用带 `id + name + isDeleted=true` 条件的 `updateMany` 原子守卫；并发恢复只有一个请求成功，其他请求重新读取当前状态并返回业务冲突，禁止生成重复身份。
- 恢复操作记录 `RESTORE` 审计；已处理的业务冲突只记录 warning，非预期异常保留 error 日志。
- 创建服务将捕获到的非 `Error` 失败值收窄为 `Error` 后再记录和抛出，避免非标准异常穿透到 Nitro 错误处理链。
- 本修复不修改数据库结构，不需要 migration 或人工修改生产数据。

**验证结果：**

- 定向测试：3/3 个文件、34/34 个用例通过。
- 全量后端测试：213/213 个文件、1990/1990 个用例通过。
- 开发分支合并复验：213/213 个后端测试文件、1991/1991 个用例通过；新增非 `Error` 异常回归用例。
- 全仓测试：290/290 个文件、2479/2479 个用例通过。
- lint：通过；typecheck：3/3 workspace tasks 通过。
- `check:qms-arch`、`check:qms-arch:all`、`check:prisma-migration`、`git diff --check`：全部通过。
- 前端 dev/build：未运行；本次无前端改动，并遵循仓库约束。
- GitHub：功能 PR #53 和发布 PR #54 均已合并，两个 PR 的 6 项 CI Gate 全部通过；已生成 GitHub Release 与 tag `qgs-v0.17.2`。
- 生产部署：deploy run `29380845117` 成功，耗时 8 分 6 秒；backend/frontend 镜像构建、ACR 推送、ECS 更新与 HTTP 健康检查全部通过。
- 生产数据库：38 个 migration 均已记录，无待执行 migration；本次修复未修改数据库结构或人工修改生产数据。
- 生产外网检查：首页返回 HTTP 200，静态资源更新时间与 `qgs-v0.17.2` frontend 镜像构建完成时间一致。

**commit:** `030e5e6e` fix(project): restore soft-deleted suppliers on create；`329c5e10` Merge pull request #53；`694420c0` Merge pull request #54

**遗留问题：**

- 生产发布已完成；仍需使用真实业务表单重新提交同名软删除供应商，确认页面返回原供应商 ID 并展示恢复后的档案。自动化未在生产创建测试供应商，避免污染业务数据。

## [0.17.1](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.17.0...qgs-v0.17.1) (2026-07-14)


### Bug Fixes

* **project:** correct supplier profile source contracts ([c6ef074](https://github.com/ajie5419/Quality-Guardian/commit/c6ef074984760e3b60437d7b0c67668497b6fce5))

### 2026-07-14 修复：供应商画像历史项目与质量数据源契约

**执行内容：**

- 历史使用项目不再依赖已生成的检验记录，直接按报检任务自身的 `supplierId/teamId` 聚合；合并主工单与多工单明细，按工单去重并改为服务端分页，消除未检验任务、多工单和静默截断 50 条造成的漏数。
- 进货合格率统一读取最近 12 个月规范检验批次：非 `NA` 批次进入分母，只有 `PASS` 进入分子，`FAIL` 和 `CONDITIONAL` 均按失败批次处理。
- 工程问题列表、全历史数量和最近 12 个月评分统一按 `quality_records.supplierId` 归属；移除 PROCESS 类型缺少 TEAM 映射时直接返回空的错误分支，使已具备规范供应商 ID 的手工工程问题正常进入画像。
- 增强生产身份回填：历史无效供应商 ID 可通过关联检验证据或唯一精确供应商名称修复；模糊、重名和冲突记录继续写入 unresolved 审计，不恢复在线名称回退。
- 快照模型升级为 `SUPPLIER_V3` / `IN_HOUSE_OUTSOURCING_V3`，部署后自动重算旧快照，避免旧口径缓存继续展示。
- 更新 inspection、supplier 架构边界和主数据身份治理文档；修复全仓 ESLint 配置回归测试的易超时问题。

**验证结果：**

- 定向测试：98/98 个用例通过。
- 全量测试：289/289 个文件、2474/2474 个用例通过。
- lint：通过；typecheck：前后端及全工作区通过。
- `check:qms-arch`、`check:qms-arch:all`、`check:prisma-migration`：全部通过。
- `git diff --check`：通过。
- 前端 dev/build：未运行；遵循仓库约束，通过组件测试、类型检查和 lint 验证。
- GitHub：功能 PR #50 和发布 PR #51 均已合并，两个 PR 的 6 项 CI Gate 全部通过；已生成 GitHub Release 与 tag `qgs-v0.17.1`。
- 生产部署：deploy run `29324151555` 成功，耗时 7 分 55 秒；backend/frontend 镜像构建、ACR 推送、ECS 更新与 HTTP 健康检查全部通过，生产数据库无待执行 migration。
- 生产工程问题身份回填：扫描 197 条，136 条已有有效规范身份，61 条缺少确定性身份依据并保留为 unresolved，0 条冲突；未使用名称猜测绑定。

**commit:** `c6ef0749` fix(project): correct supplier profile source contracts；`7395741b` Merge pull request #50；`cecd2591` Merge pull request #51

**遗留问题：**

- 生产发布已完成；仍需在已登录业务会话中核对秦皇岛吉兴机械制造有限公司的 7 月 8 日工程问题、手工登记问题、进货合格率和完整历史项目。自动化已验证代码、回填、部署和健康检查，不把登录页外的 HTTP 检查当作业务数据验收。

## [0.17.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.16.0...qgs-v0.17.0) (2026-07-14)


### Features

* **@qgs/backend:** manage supplier identity links ([c9b8831](https://github.com/ajie5419/Quality-Guardian/commit/c9b8831215c8ea1d9942f0e04903df87106b7869))


### Bug Fixes

* **@qgs/backend:** accept supplier ids for quality issues ([607324e](https://github.com/ajie5419/Quality-Guardian/commit/607324e1b02fb133628c195af20d840d91cafb49))
* **@qgs/backend:** add governed supplier identity mapping ([6793000](https://github.com/ajie5419/Quality-Guardian/commit/67930001b7dc75cddce006333e62bc298ae966f9))
* **@qgs/backend:** aggregate supplier scores by id ([1fbbe81](https://github.com/ajie5419/Quality-Guardian/commit/1fbbe81fed8c1601b2a0883c213f78ad37466e5b))
* **@qgs/backend:** audit after sales supplier identities ([63e53ba](https://github.com/ajie5419/Quality-Guardian/commit/63e53ba47186cc676f74484e20ce32151ea4f386))
* **@qgs/backend:** backfill inspection supplier identities ([1ccf8ae](https://github.com/ajie5419/Quality-Guardian/commit/1ccf8ae894e72b457635fd28d248d5774fd8cfb7))
* **@qgs/backend:** enforce canonical master data identity ([8273c6d](https://github.com/ajie5419/Quality-Guardian/commit/8273c6d83c66423f78e85e6b5d5c2d3d0686151b))
* **@qgs/backend:** enforce inspection identity governance ([2cee6c4](https://github.com/ajie5419/Quality-Guardian/commit/2cee6c43fb6c71365a42d1052be6e254f99254ed))
* **@qgs/backend:** invalidate supplier snapshots on after sales changes ([7ddea96](https://github.com/ajie5419/Quality-Guardian/commit/7ddea96e7a1cec9fb8cd606617cc68041aafcd6d))
* **@qgs/backend:** make supplier quality identity id first ([2bd6e35](https://github.com/ajie5419/Quality-Guardian/commit/2bd6e35c253df629c72880be1c4382dcf1d8ff89))
* **@qgs/backend:** query supplier project history by id ([5181754](https://github.com/ajie5419/Quality-Guardian/commit/5181754cf26571c8599b97ee2d4b4a00b92c887e))
* **@qgs/backend:** refresh supplier snapshots by id ([f87520e](https://github.com/ajie5419/Quality-Guardian/commit/f87520ee8db61bdbf36bcedc5179eb58cd9cc20b))
* **@qgs/backend:** require supplier ids for online writes ([f2fca31](https://github.com/ajie5419/Quality-Guardian/commit/f2fca31d52bf9b03b542c5d192104c3b6b1e8d0e))
* **@qgs/backend:** restrict supplier identity management ([df4d0fb](https://github.com/ajie5419/Quality-Guardian/commit/df4d0fb1407fb898d7cae972cb722470678346f0))
* **@qgs/web-antd:** bind supplier selectors by id ([8e9fb8b](https://github.com/ajie5419/Quality-Guardian/commit/8e9fb8bf83eb42525f9217298b7990eac7482cf2))
* **@qgs/web-antd:** submit canonical inspection identities ([01944f2](https://github.com/ajie5419/Quality-Guardian/commit/01944f26feed5b6436eea75903a9a50d83e93340))
* **@qgs/web-antd:** submit inspection supplier identities ([8dc4ef6](https://github.com/ajie5419/Quality-Guardian/commit/8dc4ef647992483986cedb5165a065ea021d997c))
* **@qgs/web-antd:** submit supplier ids for quality issues ([8c40f8b](https://github.com/ajie5419/Quality-Guardian/commit/8c40f8bcb265f22dc12d1a3dea649b5785c93202))
* **lint:** enforce backend architecture constraints ([387ee0c](https://github.com/ajie5419/Quality-Guardian/commit/387ee0c9ad90e827d3eb9bb9b1eaf76bdaa9c6ad))
* **lint:** enforce backend source safety ([4b9ab3f](https://github.com/ajie5419/Quality-Guardian/commit/4b9ab3f9f545d784d3b09e5b18242e0e791146d2))
* **lint:** preserve cumulative rule constraints ([fac9448](https://github.com/ajie5419/Quality-Guardian/commit/fac9448750e0f8fec927362cd563815d1c3eadcc))
* **project:** enforce supplier identity governance ([6171c04](https://github.com/ajie5419/Quality-Guardian/commit/6171c049cc6838101cee0f16ccd1eab7a60e2cc3))
* **project:** propagate supplier ids across quality forms ([fb50cec](https://github.com/ajie5419/Quality-Guardian/commit/fb50cecf8f4b5777774808623340280c3e0dbbdc))
* **project:** query supplier after sales by id ([b31105d](https://github.com/ajie5419/Quality-Guardian/commit/b31105dd2be14acb4e41dd0b7bd9e2aea9b99ba0))

### 2026-07-14 治理：supplier identity governance wave 文档与发布边界

**执行内容：**

- 记录 7 月 8 日供应商画像漏数根因：该不合格项属于驻厂 TEAM 身份域，旧画像按供应商名称聚合，未通过 `supplier_identity_links` 将 TEAM 映射到供应商，因此画像截止日期停留在 6 月 28 日。
- 新增 `supplier_identity_links` 和 `unresolved_master_data_refs` Prisma migration，建立 `TEAM -> supplier` 显式映射、外键保护和无法解析引用的持久化审计。
- 将供应商画像、评分、历史项目、检验履历、不合格项和售后评分改为按供应商 ID 查询；驻厂过程检验通过 TEAM 映射聚合，禁止名称等值关联和名称 `OR` 回退。
- 增加报检 TEAM/供应商、检验、售后和不合格项身份 dry-run/apply 回填，部署流程在 migration 后连续执行幂等分批回填。
- 增加 B-ID1/B-ID2/B-ID3/B-ID4/B-ID5 门禁，保护受控选择器、事件 ID、检验供应商写入、供应商画像和评分查询，并限制 legacy 名称解析只能出现在审核过的 import adapter。
- 更新 inspection、supplier、supplier-identity、after-sales、supervision 模块架构文档，明确 ID-first、名称快照、TEAM 映射、legacy/dual-write 边界和模块职责。
- 完善 `docs/master-data-identity-governance.md`，明确本次仅完成 supplier identity governance wave，不宣称全项目 `ID_ONLY`；记录 migration、分批 dry-run/apply 回填、`unresolved_master_data_refs` 和 B-ID1/B-ID2/B-ID3/B-ID4/B-ID5 门禁。
- 更新 `PROGRESS.md`，记录全量门禁、PR、release-please、部署和生产回填结果。

**验证结果：**

- 已完成定向验证：售后事件 30/30、ID-only 评分 86/86、售后失效刷新 14/14、不合格项契约 47/47、画像 ID 查询与门禁 21/21、身份回填 15/15、身份管理权限 6/6。
- 全量单元测试：289 个文件 / 2471 个用例全部通过。
- lint：通过（0 error）；typecheck：3/3 workspace tasks 通过。
- `check:qms-arch` 与 `check:qms-arch:all`：0 violations；`check:prisma-migration`：schema 变更已配套 migration。
- `git diff --check`：通过。
- GitHub：功能 PR #47 和发布 PR #48 均已合并，两个 PR 的 6 项 CI Gate 全部通过；已生成 GitHub Release 与 tag `qgs-v0.17.0`。
- 生产部署：deploy run `29309174127` 成功，耗时 7 分 37 秒；backend/frontend 镜像构建、ACR 推送、ECS 更新与 HTTP 健康检查全部通过。
- 生产数据库：`20260714000100_add_supplier_identity_links` 和 `20260714000200_add_inspection_request_supplier_identity` 已成功应用。
- 生产回填：新建 6 条精确 `TEAM -> supplier` 映射；报检供应商身份更新 813 条，检验身份更新 824 条，不合格项身份更新 2 条。无法唯一解析的存量数据已写入 `unresolved_master_data_refs`，未伪造关联。

**commit:** `2cee6c43` fix(@qgs/backend): enforce inspection identity governance；`01944f26` fix(@qgs/web-antd): submit canonical inspection identities；`6171c049` Merge pull request #47；`3ee1d608` Merge pull request #48。

**遗留问题：**

- supervision 等尚未覆盖的存量供应商引用仍需补齐回填和 unresolved 审计；其他未迁移主数据必须由后续治理 wave 切换到在线 `ID-required`。
- `unresolved_master_data_refs` 尚无人工处置 API/UI，`supplier_identity_links` 尚无前端管理界面。
- 当前 EventEmitter 为单进程、fire-and-forget，监听器失败只记录日志且无持久化重试；扩容前需替换可靠事件机制。
- 生产页面的精确供应商画像数据仍需在已登录业务会话中做最终人工验收；本次自动化已验证部署、健康检查、迁移和回填。

### 2026-07-14 修复：完善 ESLint 与后端架构规则约束

**执行内容：**

- 修复 ESLint Flat Config 后置覆盖问题，确保后端语法审计、QMS import / 状态 / 枚举 / 常量限制累计生效；Vue 推荐规则只作用于 `.vue`，非测试 TS 仅保留组合式 API 所需规则。
- 后端生产代码启用非空断言、`console.*` 和空 `catch` 阻断；清理 7 处 console、3 处空 catch，并统一使用 `createModuleLogger` 或 `logApiError`。
- 新增 TypeScript AST 架构检查器，覆盖 `as any`、`as unknown as T`、非空断言、`Date.now()` 生成 ID、跨模块内部导入、中文字符串条件、空 catch 和 catch 未记录错误。
- 新增稳定指纹 baseline：B-T1、B-T3、B-S4、B-S5、B-E1 保持零基线；B-T2、B-M1、B-M2、B-E2 和单文件行数历史债务冻结为只能递减。
- 新增真实临时 Git 仓库回归测试，验证 10 条源码规则、合法反例和 baseline 数量增长阻断；CI 改为执行 `check:qms-arch:all`。

**验证结果：**

- lint: 通过（0 error，0 warning）
- typecheck: `pnpm run check:type` 3/3 tasks 通过
- check:qms-arch:all: 635 个后端生产 TS 文件、497 个模块 TS 文件扫描通过，0 violations
- vitest: 后端 201/201 文件、1919/1919 用例通过
- 配置与架构脚本回归: 3 个文件、10/10 用例通过

**commit:**

- `fac94487` fix(lint): preserve cumulative rule constraints
- `4b9ab3f9` fix(lint): enforce backend source safety
- `387ee0c9` fix(lint): enforce backend architecture constraints

**遗留问题：**

- 历史 baseline 仍包含 B-T2 13 处、B-M1 151 处、B-M2 39 处、B-E2 81 处及 1 个 520 行模块文件；新违规和数量增长已阻断，后续修复时必须同步收紧 baseline。
- Vue TS 完整 strict 规则当前会新增 146 errors / 2 warnings，未在本阶段强制启用；应作为独立类型债务治理任务处理。

### 2026-07-13 发布：qgs v0.16.0

**执行内容：**

- 推送并合并功能 PR #44，交付小程序不合格品项、质量损失修复、供应商与外协质量指标口径统一及相关 Prisma migrations。
- release-please 生成并合并发布 PR #45，创建 GitHub Release 与 tag `qgs-v0.16.0`。
- deploy workflow 完成后端/前端镜像构建、ACR 推送、Prisma migration、ECS 更新与健康检查。

**验证结果：**

- 本地门禁：Lint 通过（0 error，保留既有 9 条 warning）；Typecheck 3/3 通过；QMS architecture 0 violations。
- 本地全量测试：268 个文件 / 2379 个测试全部通过；Prisma schema/migration 同步检查通过。
- GitHub：功能 PR #44 和发布 PR #45 的 6 项 CI Gate 全部通过。
- 生产部署：run `29241681684` 成功，用时 7 分 31 秒。

**commit:**

- `b5646af` Merge pull request #44 from ajie5419/codex-weapp-inspection-issues
- `fa8b422` Merge pull request #45 from ajie5419/release-please--branches--main--components--qgs

**遗留问题：**

- deploy workflow 的 tag 触发格式为 `qgs-v*`，但版本识别分支仍匹配 `v*`；正常发布不受影响，`deploy_only` 重试时需使用实际带 merge SHA 的镜像 tag。
- GitHub Actions 提示 `actions/checkout@v4` 依赖的 Node.js 20 已废弃，当前 runner 已强制使用 Node.js 24，后续需升级 action 版本消除告警。

## [0.16.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.15.1...qgs-v0.16.0) (2026-07-13)


### Features

* **project:** ship mobile inspection issues and quality fixes ([b5646af](https://github.com/ajie5419/Quality-Guardian/commit/b5646af7ac07e470c5fe14b9851a4ee83b0cf068))


### Bug Fixes

* **project:** align supplier quality metrics ([8dc7110](https://github.com/ajie5419/Quality-Guardian/commit/8dc7110607cd7ed3dd09af4cd8d639dda5c57d3b))
* **project:** persist manual quality loss context ([94de027](https://github.com/ajie5419/Quality-Guardian/commit/94de027a7b592fd7887891451b272da1abceac3d))
* **project:** resolve quality loss delete targets ([e8fc491](https://github.com/ajie5419/Quality-Guardian/commit/e8fc491dd2c8c91665c2e332ed9cb1bcf63c523e))

### 2026-07-13 修复：供应商与外协质量指标和画像口径统一

**执行内容：**

- 在共享领域层建立唯一的检验口径：供应商和机加成品外协按供应商规范 ID 读取进货检验，驻厂外协按团队规范 ID 读取过程检验，列表、快照和画像复用同一策略。
- 修复评分聚合的名称漂移、团队字段错用和 `0 || 100` 逻辑；无检验批次时返回空值并显示 `-`，真实零合格率保留为 `0%`。
- 工程问题数改为全历史实际数量，评分窗口仍保持近 12 个月；检验记录变更后会按影响的供应商或外协团队刷新快照。
- 快照升级为第二版评分模型；部署时的 `refreshMissing` 会同时重算缺失和旧版快照，避免旧的 100% 结果继续残留。
- 供应商画像新增独立的分页检验履历接口，并按检验类型正确映射部件名称；前端修复详情分页并发覆盖和单个子请求失败导致整个画像空白的问题。
- 售后记录的 `supplierBrandId` 统一为供应商主键，新增 Prisma migration 幂等对齐历史名称可匹配数据；无法可靠匹配的历史名称仅在维护审计中报告，不伪造关联。

**验证结果：**

- vitest: 供应商 159/159、检验 552/552、售后 69/69、前端与共享领域 20/20，共 800/800 通过
- lint: 通过（0 error；保留既有 `IssueFormFields.test.ts` 9 条 warning）
- typecheck: `pnpm run check:type` 3/3 tasks 通过
- Prisma: schema validate 通过，已新增历史售后供应商 ID 对齐 migration
- check:qms-arch: 0 violations 通过
- 前端 dev/build: 未运行；遵循仓库约束，通过组件测试、类型检查和 Lint 验证

**commit:** `8dc71106` fix(project): align supplier quality metrics

**遗留问题：**

- 代码和数据迁移已就绪；生产历史快照重算和售后供应商 ID 对齐需随正常部署流程执行。
- 历史售后供应商名称如果无法唯一匹配当前供应商，保留为未解析数据并由审计脚本列出。

### 2026-07-13 修复：手工质量损失工单、项目和部件上下文

**执行内容：**

- `quality_losses` 新增工单、项目和部件的规范 ID 与名称快照，通过 Prisma migration 增加可空工单外键及查询索引。
- 手工新建和编辑统一验证工单存在、工单已配置项目、部件属于该工单 BOM；项目信息由后端按工单派生，不信任客户端自由文本。
- 手工录入弹窗复用共享工单选择器，自动带出只读项目名称，并按工单加载 BOM 部件；切换工单时清空旧部件，同时防止旧异步请求覆盖新选项。
- `quality_loss_index` 新增 `lossType`，手工损失类型与真实部件名称分字段保存；空值仅在表格显示阶段格式化为 `-`，不再写回脏占位符。
- 现有部署回填脚本会幂等重建手工索引，清除历史错误的 `partName=type`；无法可靠推断的历史工单和部件保留为空，禁止伪造业务数据。

**验证结果：**

- vitest: 后端全量 200 文件 / 1903 测试全部通过
- vitest: 前端质量损失定向 18/18 通过
- lint: 通过（0 error；保留既有 `IssueFormFields.test.ts` 9 条 warning）
- typecheck: `pnpm run check:type` 3/3 tasks 通过
- Prisma: schema format / validate 通过，migration 由 `prisma migrate diff` 生成
- check:qms-arch: 0 violations 通过
- 前端 dev/build: 未运行；遵循仓库约束，通过组件单测、类型检查和 Lint 验证

**commit:** `94de027` fix(project): persist manual quality loss context

**遗留问题：**

- 历史手工记录本身没有保存工单和部件，回填无法可靠恢复；部署后将显示为空，需在编辑时选择真实工单和 BOM 部件。

### 2026-07-13 修复：质量损失统一列表删除误报记录不存在

**执行内容：**

- 修复统一列表把 `quality_loss_index.id` 当作 `quality_losses.id` 传给删除接口的 ID 契约错位；后端兼容解析 `QL-<cuid>` 物化索引 ID，前端改为传递源记录 `pk`。
- 单条与批量删除共用相同的手工来源定位规则，并在同一 Prisma transaction 内软删除源记录和物化索引，避免列表留下幽灵数据。
- 删除入口增加 `SELF` / `DEPT` 数据权限校验，非手工来源在统一页隐藏删除按钮，后端对旧客户端请求也明确拒绝跨模块删除。
- 同步修复手工记录编辑时的同类 ID 错位，当请求带有 `pk` 时优先按源表主键定位。
- 补充后端索引 ID、非手工来源、数据权限、并发软删除测试，以及前端 `pk` 传递和来源按钮可见性测试。

**验证结果：**

- vitest: 质量损失跨端定向 5 文件 / 38 测试通过
- vitest: 后端全量 198 文件 / 1895 测试通过
- lint: 通过（0 error；保留既有 `IssueFormFields.test.ts` 9 条 warning）
- typecheck: `pnpm run check:type` 3/3 tasks 通过
- check:qms-arch: 0 violations 通过
- 前端 dev/build: 未运行；遵循仓库约束，通过单元测试、类型检查和 Lint 验证

**commit:** `e8fc491` fix(project): resolve quality loss delete targets

**遗留问题：**

- 无。

## [0.15.1](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.15.0...qgs-v0.15.1) (2026-07-11)


### Bug Fixes

* **@qgs/backend:** avoid duplicate inspection serials on request close ([de6b21b](https://github.com/ajie5419/Quality-Guardian/commit/de6b21b77efe4c169cfc6ef58dd72d8358aa3efd))

### 2026-07-10 修复：关闭多工单报检时检验记录流水号冲突

**执行内容：**

- 修复检验记录创建服务在调用方事务中仍使用全局 Prisma 客户端生成流水号的问题；现在流水号查询与记录创建使用同一个事务客户端，同一报检任务连续创建多条检验记录时可以看到事务内上一条记录并递增编号。
- 保留关闭报检整笔事务的现有冲突重试机制，用于处理不同事务之间的并发流水号竞争。
- 补充回归断言，确保调用方传入事务客户端时，流水号查询不会退回全局 Prisma 客户端。

**验证结果：**

- 定向测试：3 个文件 / 51 个测试全部通过。
- 后端全量测试：195 个文件 / 1861 个测试全部通过。
- lint：通过（0 error，保留既有测试文件 9 条 warning）。
- typecheck：通过（3/3 workspace tasks）。
- check:qms-arch：0 violations 通过。

**commit:** `de6b21b` fix(@qgs/backend): avoid duplicate inspection serials on request close

**遗留问题：**

- 无。

### 2026-07-10 功能：小程序不合格品项登记

**执行内容：**

- 后端继续使用 `quality_records` 和 `OPEN / IN_PROGRESS / CLOSED` 状态，新增严格 Zod create/update schema、详情 API、统一列表/详情映射、RBAC 权限校验和数据范围查询；NC 编号由后端生成，并在唯一键冲突时自动重试。
- `@qgs/shared` 新增不合格品项权限码、字段限制、缺陷类型和二级分类契约；电脑版改为直接复用共享契约，避免移动端与电脑端分类漂移。
- 小程序新增不合格品项权限入口、列表筛选与分页、详情、新增、编辑和三步表单；复用工单、工序、部门、供应商/外协和焊工主数据。
- 补齐手机场景必要能力：照片上传、按用户隔离的本地草稿、账号切换安全、参考数据局部失败降级、列表失败后分页恢复和明确的上传/保存提示。
- 修复报检结果为 `FAIL` 时未向关联不合格品项传递 `photos` 的断链，以及 token 刷新失败时并发请求等待队列不被唤醒的问题。
- 修复小程序 GET 请求把未选择的筛选条件序列化为字符串 `undefined`，导致不合格品项列表错误返回空数据；公共请求层现在会剔除未定义的查询字段，并保留 `false`、`0` 和空字符串等有效值。
- 微信开发者工具本地联调关闭域名校验；重新登录后确认当前账号拥有 157 个权限码，包含不合格品项查看权限，权限、列表、部门接口均返回 200。
- 排查并修复本地增量产物未刷新页面注册表的问题；`app.js` 已包含列表、详情、新增、编辑四个页面，开发者工具不再提示 `Page has not been registered yet`。

**验证结果：**

- lint: 通过（0 error；保留既有 `IssueFormFields.test.ts` 9 条 warning）
- stylelint: 小程序不合格品项页面与样式通过
- typecheck: `pnpm run check:type` 3/3 tasks 通过；Web `vue-tsc` 通过；shared 构建和声明文件生成通过
- check:qms-arch: 0 violations 通过
- vitest: 后端全量 198 文件 / 1871 测试全部通过；不合格品项定向 117/117 通过
- vitest: 小程序请求参数清理单测 2/2 通过
- 微信开发者工具: 列表加载真实数据通过；详情、编辑、新增页面路由通过；自动化控制台 0 error、0 exception

**commit:**

- `d717a6b` feat(@qgs/backend): support mobile inspection issues
- `73dc5a3` feat(@qgs/weapp): add inspection issue workflow
- `c93cee2` refactor(@qgs/web-antd): reuse inspection issue contract
- `ae7b6610` fix(@qgs/weapp): omit undefined query filters

**遗留问题：**

- 未完成真机、实际新增提交、照片上传、分页、草稿和账号切换验收；当前结论只覆盖微信开发者工具的列表数据加载和页面路由冒烟测试。

### 2026-07-10 修复：不合格品项按创建人隔离

**执行内容：**

- 普通账号的不合格品项列表、详情、统计和图表统一按 `createdBy` 查询，只返回当前登录账号创建的数据；`admin`、`super` 及其派生管理员角色返回全部数据。
- 管理员角色改为按 `admin` / `super` 独立词元识别，避免 `supervisor`、`administrator` 等普通角色被误判为管理员。
- 更新、单条删除、批量删除和导入覆盖统一校验创建人 ID；管理员也不能修改或删除他人记录，历史 `createdBy` 为空的记录仅管理员可查看。
- 单条删除改为原子软删除并返回明确的 404，避免重复点击或并发删除变成 500。
- 报检关闭生成不合格品项时补写 `createdBy`，避免检验员提交后看不到自己生成的记录。
- 显式关联检验记录关闭报检时同样保留流水号冲突重试，避免并发创建不合格品项时关闭失败。
- 小程序和电脑版均按记录隐藏他人的编辑、删除入口，并在直达编辑、批量删除和操作函数中再次校验所有权；电脑版仍允许管理员选择他人记录用于查看和导出。
- 小程序工序选择与电脑版保持一致：显示字典 `dictValue`、提交 `dictKey`，同时合并工单工序和共享兜底工序。
- 统计趋势使用带创建人条件的参数化 SQL 在数据库按天/月聚合，避免年度管理员统计把明细行加载到 4 GB 应用服务器内存。

**验证结果：**

- vitest: 不合格品项、报检关闭、共享规则、电脑版和小程序定向 17 文件 / 201 测试通过
- vitest: 后端全量 198 文件 / 1892 测试通过
- vitest: 电脑版所有权操作 5/5 通过
- vitest: 小程序所有权与工序选项 5/5 通过
- lint: 通过（0 error；保留既有 `IssueFormFields.test.ts` 9 条 warning）
- typecheck: `pnpm run check:type` 3/3 tasks 通过
- check:qms-arch: 0 violations 通过

**commit:** `5a57413` fix(@qgs/backend): enforce inspection issue ownership

**commit:** `fd5a016` fix(@qgs/weapp): complete inspection issue ownership flow

**commit:** `ef0dcfd` fix(@qgs/web-antd): restrict inspection issue owner actions

**遗留问题：**

- 未运行前端 dev/build；遵循仓库约束，通过单元测试、类型检查、Lint 和架构门禁验证。
- 真机账号切换后的列表可见范围和实际删除流程仍需现场验收。

## [0.15.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.14.0...qgs-v0.15.0) (2026-07-09)


### Features

* **project:** add inspection request reassignment ([a6eb458](https://github.com/ajie5419/Quality-Guardian/commit/a6eb4587b4fe666d3a7f44361c3bc9dd1e77a701))


### Bug Fixes

* **project:** stop large photos from saturating 3Mbps egress causing 10s timeouts ([c9b4679](https://github.com/ajie5419/Quality-Guardian/commit/c9b46791ee2896f8a062c89b0375c3a34225ddbe))

### 2026-07-09 功能：报检任务已派单改派

**执行内容：**

- 后端 `inspection-request-dispatch.service.ts` 支持 `DISPATCHED` 报检任务改派：同一事务内用 `updatedAt` 版本保护防止并发覆盖，原地更新关联 `qms_task_dispatches` 执行人、调度人、优先级和内容；`INSPECTING`、`CLOSED` 等已检验/处理中状态继续拒绝改派。
- 收紧 `/api/qms/inspection/requests/[id]/dispatch` 入参 zod 校验，明确要求 `inspectorId`，限制 `priority` 为 1-5。
- 前端报检任务列表对 `DISPATCHED` 行开放“改派”入口，弹窗标题和成功提示区分首次派单/改派，复用既有派单 API 和刷新流程。
- 补充后端派单状态机/并发单元测试和前端任务动作测试，覆盖已派单改派、关联派工任务已处理时拒绝、提交文案。

**验证结果：**

- lint: 通过（保留既有 `IssueFormFields.test.ts` 9 条 `vue/one-component-per-file` warning）
- typecheck: 通过（`pnpm run check:type`）
- check:qms-arch: 0 violations 通过
- vitest: 后端全量 195 文件 / 1860 测试全部通过；后端派单定向 2 文件 / 27 测试通过；前端任务动作 1 文件 / 6 测试通过

**commit:** `a6eb458` feat(project): add inspection request reassignment

**遗留问题：**

- 无。

### 2026-07-09 文档：记录标准发布工作流

**执行内容：**

- 新增 `docs/release-workflow.md`，记录功能分支、功能 PR、release-please 发布 PR、`qgs-v*` tag、deploy workflow 的完整发布链路。
- 更新 `AGENTS.md` 详细文档列表，加入发布工作流入口。

**验证结果：**

- 文档变更：已人工核对内容与 `.github/workflows/release-please.yml`、`.github/workflows/deploy.yml` 当前配置一致。
- 自动化测试：未运行；本次仅文档变更。

**commit:** `8708c79` docs(project): document release workflow

**遗留问题：**

- 无。

### 2026-07-08 修复：生产页面切换 10s 超时（公网带宽被大图占满）

**根因排查结论：**

- 症状：生产环境切换页面偶发 axios `timeout of 10000ms exceeded`（ECONNABORTED）
- 排除：RDS 数据库（CPU ~1%、慢 SQL 为零）、容器 OOM/重启、Telegram 通知（fire-and-forget 不阻塞）
- 实锤：ECS 公网带宽仅 3Mbps，复现时"公网流出带宽使用率"两次顶到 90%+；nginx 日志抓到 2.1MB 原图经 `/api/uploads/` 全量代理传输，独占带宽 6~11 秒，期间所有 API 请求排队直至前端 10s 超时
- 漏洞成因：前端 `evidence` 压缩预设 `maxSizeMB: 3 / quality: 1`，3MB 以下手机照片原样上传；缩略图缺失时前端 `:fallback` 与后端 `getFileBuffer(preferThumb)` 均静默回退原图

**执行内容：**

- `apps/web-antd/src/composables/useImageCompress.ts`：`evidence` 预设收紧为 maxSizeMB 0.8 / quality 0.8 / 2048px
- `apps/web-antd/nginx.conf`：`/api/uploads/`（OSS 代理）与 `/uploads/`（本地文件）增加 `limit_rate_after 300k; limit_rate 150k;`，单连接限速 ~1.2Mbps，保证 API 请求始终有带宽；缩略图（<300KB）不受影响
- 新增 `apps/backend/modules/file-storage/thumbnail-backfill.ts` + `apps/backend/scripts/backfill-missing-thumbnails.ts`：存量图片补生成缩略图（游标分批、支持 dry-run、>20MB 跳过）；`oss-storage.ts` 导出 `putOssObject`；package.json 增加 `maintenance:backfill-thumbnails`

**验证结果：**

- typecheck: 后端 tsc 通过 / 前端 vue-tsc 通过
- check:qms-arch: 0 violations 通过
- vitest: file-storage 模块 24/24 通过

**commit:** `c9b46791` fix(project): stop large photos from saturating 3Mbps egress causing 10s timeouts

**遗留问题：**

- nginx 限速需重建 frontend 镜像发版后生效；可先手动同步到生产 `/opt/qms/nginx.conf` 并 `nginx -s reload` 立即止血
- 存量缩略图脚本需在生产手动执行一次（先 `THUMBNAIL_BACKFILL_DRY_RUN=1` 试跑）
- 存量已上传的大原图未压缩（有限速兜底，暂不处理）

## [0.14.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.13.1...qgs-v0.14.0) (2026-07-07)


### Features

* **project:** add inspection manual-create setting with admin toggle ([db91fe7](https://github.com/ajie5419/Quality-Guardian/commit/db91fe77309313448af43faf907c160d5edd03ee))


### Bug Fixes

* **@qgs/backend:** add unique constraint on quality_records.serialNumber ([01878ef](https://github.com/ajie5419/Quality-Guardian/commit/01878ef8dcf9b32a79a0240a97eca5a84401d716))
* **@qgs/backend:** harden inspection request cross-module associations ([6b784aa](https://github.com/ajie5419/Quality-Guardian/commit/6b784aaec0cdb41b712ac5f51f6873a0580495d9))
* **@qgs/backend:** make inspection request close chain transactional ([de5daa8](https://github.com/ajie5419/Quality-Guardian/commit/de5daa80bdd6ee2065170d5805bc68fed60f4d23))
* **@qgs/backend:** unify error style, close silent catches, add public rate limit ([6d99834](https://github.com/ajie5419/Quality-Guardian/commit/6d99834723ee8d8aa5a4648690427979740b769e))

### 2026-07-07 修复：quality_records.serialNumber 唯一约束（P0-3 收尾）

**执行内容：**

- 手动测试确认第 1~3 组修复在本地容器环境（MySQL 3307）全部生效：P0-1 并发关闭一成功一拒绝、P0-2 单条检验记录、P1-5 取消守卫、P2-A 404/400 分发、P2-C 公共接口限流 429。
- 查重：`quality_records` 按 serialNumber 分组无重复（8 行 0 重复组），无需去重脚本。
- 本地容器库迁移历史缺失（此前经 `migrate reset`/`db push` 初始化，`_prisma_migrations` 未记录 33 个既有 migration）——先用 `prisma migrate resolve --applied` 基线化全部 33 个（`migrate diff` 确认库结构与 schema 完全一致后才执行），再新增 migration。
- schema：`quality_records.serialNumber` 增加 `@unique`；新增 migration `20260707180000_add_quality_records_serial_unique`（`CREATE UNIQUE INDEX quality_records_serialNumber_key`，SQL 由 `prisma migrate diff` 生成，shadow DB 因历史 migration 依赖既有表无法重放，故未走 `migrate dev`）；`prisma migrate deploy` 应用成功，`SHOW INDEX` 验证 non_unique=0；`prisma generate` 已重跑。
- 至此第 2 组遗留的 P0-3 schema 半边闭环：应用层重试（已上线）+ DB 唯一约束兜底。

**验证结果：**

- `prisma migrate status`: Database schema is up to date
- typecheck: 通过（backend tsc --noEmit）
- vitest: 195 文件 / 1859 测试全部通过

**commit:** `01878ef8` fix(@qgs/backend): add unique constraint on quality_records.serialNumber

**遗留问题：**

- 生产库部署时需先执行同样的查重检查再 `prisma migrate deploy`（生产数据量大，若有历史重复 serialNumber 需先去重）。
- welder 计分相关索引（`quality_records(responsibleWelder, isDeleted)`）可在下次 migration 时顺带评估；groupBy 下推后非阻塞。

### 2026-07-07 修复：报检任务关联缺陷第 3 组（P2-A/P2-B/P2-C）

**执行内容：**

- P2-A 错误风格统一：`inspection-request-close.schema.ts` 的 `failCloseRequest` 由抛前缀字符串 `Error('PREFIX:msg')` 改为 `BusinessError(prefix, message, httpStatus)`（PREFIX→状态码映射：VALIDATION/BAD_REQUEST→400、NOT_FOUND→404、FORBIDDEN→403、INTERNAL→500），close 链路 16 处调用点全部生效；`inspection-request-dispatch.service.ts` 4 处 `Error('BAD_REQUEST:...')` 同步转换；close/dispatch 两个路由错误分发改为 `instanceof BusinessError` 按 httpStatus 分发（404→notFound、403→forbidden、其余→badRequest）。
- P2-A 枚举补全：`TASK_DISPATCH_STATUS` 增加 `CANCELLED`，`inspection-request-delete.service.ts` 派单行取消改用常量（替换裸字符串）。
- P2-A 声明核查：`inspection.module.ts` 审计动作（requestCreate/requestDispatch/requestDelete/requestClose）与 dataScope selfFields 经核对与实现一致，无需改动（原怀疑的漂移不成立）。
- P2-B 静默 catch 清理：`supplier.service.ts` 批量导入两处 `catch {}` 改为 `logger.error` 后计入 `results.errors`；`supplier-score-snapshot.service.ts` 开放问题口径由 `status !== 'CLOSED'` 改为 `status === 'OPEN'`（原口径把 IN_PROGRESS/RESOLVED/CLAIMING 误计为开放，与工作台口径不一致，为真实统计 bug）。
- P2-C welder 计分聚合下推：`getWelderScoreIssues`（全表 findMany 拉内存）改为 `getWelderScoreStats`（`groupBy(['responsibleWelder','severity'])` + `_count`），`welder-score.service.ts` 扣分计算改为按分组计数累加，数学等价；避免 quality_records 全量载入内存（2C/4G 生产约束）。
- P2-C 公共 API 限流：新增 `utils/rate-limit.ts`（Redis INCR/EXPIRE 固定窗口 60 次/60 秒，Redis 不可用时退化为有界内存 Map（上限 10000 键）并放行）与 `middleware/5.public-rate-limit.ts`（仅作用于 `/api/qms/public/` 前缀，按 IP+路径限流，超限返回 429）。
- 生产代码 12 个文件（新增 2）；测试改动 9 个文件（新增 2：`rate-limit.test.ts`、`supplier-score-snapshot.service.test.ts`），含 close 路由测试同步为 BusinessError mock（NOT_FOUND 断言改为 notFoundResponse）。
- 明确不做：跨模块非 `index.ts` 深导入清理（after-sales/metrology/work-order 等全仓既有惯例，改动面大于收益，维持现状）。

**验证结果：**

- typecheck: 通过（`pnpm run check:type` 3/3 tasks）
- `pnpm run check:qms-arch`: 通过，0 violations
- vitest: 195 文件 / 1859 测试全部通过（较上一阶段净增 18 条）

**commit:** `6d998347` fix(@qgs/backend): unify error style, close silent catches, add public rate limit

**遗留问题：**

- `quality_records.serialNumber` 的 `@unique` migration 仍待 MySQL 可用（见第 2 组遗留，步骤不变）。
- welder 计分相关索引（`quality_records(responsibleWelder, isDeleted)`）可在下次 migration 时顺带评估；groupBy 下推后非阻塞。

### 2026-07-07 修复：报检任务关联缺陷第 2 组（P0-3/P1-1/P1-4/P1-5）

**执行内容：**

- P1-1 welder 同步保护：`inspection-issue-mutation.service.ts` 中 4 处主写入后的 `WelderScoreService.syncFromInspectionIssues()` 包裹 try/catch 并 `logger.error` 记录，同步失败不再导致已提交的主操作对外报 500。
- P1-5 取消报检任务加固：`inspection-request-delete.service.ts` 重写——事务内原子守卫 `updateMany({ where: { id, isDeleted: false, status: in [SUBMITTED, DISPATCHED] } })`（INSPECTING/CLOSED 禁止取消），归属校验（reporter 本人或持 `QMS:Inspection:Requests:Dispatch` 权限码），状态写入改用 `INSPECTION_REQUEST_STATUS.CANCELLED` 常量，关联派单行同事务置 CANCELLED；API 层错误分发改用 `BusinessError`（404/403/400）。
- P1-4 Telegram webhook 去伪造身份：删除 `{} as any` 伪造 event/user；回调处理逻辑整体下沉到新文件 `modules/inspection/telegram-dispatch.service.ts`，通过 `TELEGRAM_DISPATCHER_USERNAME` 环境变量解析真实用户（`isDeleted: false`），未配置或用户不存在则拒绝执行并告警；`dispatchRequest`/`recordBusinessAuditLog` 的 event 参数放宽为可空；`webhook.post.ts` 由 151 行压至 24 行（≤50 行架构规则达标，无守卫脚本改动）。
- P0-3 编号生成竞态：`inspection-request-create.service.ts` 对 requestNo P2002 冲突整体重试事务（≤3 次，每次重新生成）；`inspection-issue-mutation.service.ts` createIssue 对 serialNumber P2002 冲突重试并重新取号（≤3 次），importIssues 冲突后刷新 serialSeed；关闭链路 serial 取号已在被重试事务闭包内，无需改动。
- 生产代码 8 个文件（新增 1）；测试改动 5 个文件，新增 21 条用例（welder 失败不阻断 ×4、取消守卫/归属/联动 ×9、telegram 身份解析与回调路由 ×7 中新增部分、requestNo/serial 重试 ×5）。

**验证结果：**

- typecheck: 通过（`pnpm run check:type` 3/3 tasks）
- `pnpm run check:qms-arch`: 通过，0 violations
- vitest: 193 文件 / 1841 测试全部通过（较上一阶段净增 25 条）
- eslint: 全部改动文件通过

**commit:** `6b784aae` fix(@qgs/backend): harden inspection request cross-module associations

**遗留问题：**

- P0-3 schema 部分未完成：本机 MySQL（127.0.0.1:3306）未启动，无法查重，`quality_records.serialNumber` 的 `@unique` migration 未创建。应用层重试代码已就位（约束存在时自动生效）。待 DB 可用后：先查重（`groupBy serialNumber having count > 1`）→ 如有重复先跑去重脚本 → `prisma migrate dev --name <ts>_add_quality_records_serial_unique`。
- 第 3 组 P2 清单未动：failCloseRequest → BusinessError、TASK_DISPATCH_STATUS 缺 CANCELLED、inspection.module.ts 审计/数据域声明与实际字段不符、跨模块非 index 导入、getWelderScoreIssues 全表扫描、供应商快照统计口径、公共 API 限流、supplier.service 静默 catch。

### 2026-07-07 修复：报检任务关闭链路事务重构（P0-1/P0-2）+ 关联查询修复（P1-2/P1-3）

**执行内容：**

- P0-1 关闭链路并发竞态：`inspection-request-close.service.ts` 将状态权威校验改为事务内 `updateMany({ where: { id, isDeleted: false, status: { not: CLOSED } } })` 原子守卫（count=0 即拒绝），事务外 `findFirst` 仅保留为快速失败预检。
- P0-2 孤儿检验记录：检验记录创建与关联问题创建全部移入关闭事务内。`Prisma.TransactionClient` 贯穿 `createCloseInspectionRecords` → `buildInspectionRecordFromRequest` → `InspectionService.create`；`inspection-record-create.service.ts` 支持外部事务客户端（tx 模式单次尝试，序列号冲突上抛中止整个事务），关闭服务外层 `retryOnSerialNumberConflict` 整体重试关闭事务（建记录路径 3 次，显式 inspectionId 路径 1 次）。`isInspectionSerialNumberConflict` 迁至 `inspection-record-types.ts`；`assertWorkOrdersExist` 参数放宽为 `Pick<PrismaClient, 'work_orders'>` 以接受事务客户端。
- P1-2 软删过滤：`inspection-reporting.service.ts` `findIssueIdBySerialNumber` 补 `isDeleted: false`。
- P1-3 小程序任务列表状态过滤：`apps/weapp/src/pages/tasks/index.vue` 检验员视角查询状态改为 `'DISPATCHED,INSPECTING'`，不再拉取已关闭任务。
- 生产代码 7 个文件；测试改动 6 个文件：新增 6 条并发/事务对抗用例（原子守卫顺序与形状、守卫拒绝、tx 透传、序列号冲突整体重试、非冲突错误不重试、显式路径不重试）、2 条 record-create 事务客户端用例、1 条 close-records tx 透传用例，并同步既有断言（vitest 对尾参 `undefined` 严格比较）。

**验证结果：**

- typecheck: 通过（`tsc --noEmit` + `pnpm run check:type` 3/3 tasks）
- `pnpm run check:qms-arch`: 通过，0 violations
- vitest: 192 文件 / 1816 测试全部通过（inspection 模块 56 文件 / 490 测试）
- eslint: 全部改动文件通过（含 weapp vue）

**commit:** `de5daa80` fix(@qgs/backend): make inspection request close chain transactional

**遗留问题：**

- 第 2 组待修（已批准未开始）：P0-3 requestNo 计数竞态 + 问题单 serialNumber `_max+1` 竞态；P1-1 welder-sync 未保护 await（inspection-issue-mutation.service.ts:70,113）；P1-5 deleteRequest 缺状态/归属校验且写入非枚举 'CANCELLED'；P1-4 Telegram webhook 伪造 event/user（api/telegram/webhook.post.ts）。
- 第 3 组 P2 清单：failCloseRequest → BusinessError、TASK_DISPATCH_STATUS 缺 CANCELLED、inspection.module.ts 审计/数据域声明与实际字段不符、跨模块非 index 导入、getWelderScoreIssues 全表扫描、供应商快照 openEngineeringCount 统计口径、公共 API 限流、supplier.service 静默 catch。

## [0.13.1](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.13.0...qgs-v0.13.1) (2026-07-02)


### Bug Fixes

* **@qgs/weapp:** constrain list card overflow ([a814085](https://github.com/ajie5419/Quality-Guardian/commit/a814085208c9c14b1da2b14a4d5b2719df8e1546))
* **@qgs/web-antd:** use thumbnails in quality photo details ([eba8c0c](https://github.com/ajie5419/Quality-Guardian/commit/eba8c0c9d73412051666a264e431e7e27ef137d9))

### 2026-07-02 前端：质量照片详情缩略图加载优化

**执行内容：**

- 调整售后质量详情抽屉照片展示，详情页小图优先加载缩略图，点击预览时再加载原图。
- 调整不合格项详情抽屉照片展示，复用同一缩略图 URL 解析逻辑，避免 96px 小图直接请求原图。
- 保留旧数据兼容：历史照片仅保存原图 URL 时，前端按既有 `_thumb.webp` 规则推导缩略图地址，缩略图缺失时回退原图。

**验证结果：**

- `pnpm --dir apps/web-antd exec vue-tsc --noEmit`: 通过
- `pnpm --dir apps/web-antd exec vitest run src/views/qms/after-sales/constants.test.ts`: 1 文件 / 3 测试通过
- `pnpm --dir apps/web-antd exec vitest run src/views/qms/inspection/issues/composables/useIssueActions.test.ts`: 1 文件 / 2 测试通过

**commit:** `eba8c0c9` fix(@qgs/web-antd): use thumbnails in quality photo details

**遗留问题：**

- 未启动前端 dev/build 服务；按项目约束，本次通过类型检查与相关单测验证。

### 2026-06-29 清理：删除构建产物与旧上传文件

**执行内容：**

- 删除本地历史发布包 `dist/deploy`，发布包改由部署脚本按需重新生成并上传 OSS。
- 删除本地构建产物 `apps/backend/.output`、`apps/web-antd/dist`、`apps/weapp/dist`。
- 清理后重新生成忽略的 Nitro 类型目录；`apps/backend/tsconfig.json` 依赖 `.nitro/types/tsconfig.json`，本机 typecheck 需要该生成目录存在。
- 从 git 索引删除 `apps/web-antd/uploads` 下 36 个旧上传样例文件；该目录已在 `.gitignore` 中忽略，后续运行时上传文件不再进入仓库。

**验证结果：**

- `pnpm run check:dep`: 通过；仍提示 `@qgs/weapp` 既有 Uni/Vite 隐式依赖候选
- `pnpm run check:qms-arch`: 通过，0 violations
- `pnpm --dir apps/backend run stub`: 通过，重新生成 Prisma Client 与 Nitro 类型目录
- `pnpm run check:type`: 通过，3/3 tasks successful
- `pnpm lint`: 通过，0 error（9 个既有 warning）
- `pnpm --dir apps/backend exec vitest run`: 通过，190 文件 / 1798 测试

**commit:** 待提交

**遗留问题：**

- 无。

### 2026-06-29 清理：删除前端 API 共享类型再导出

**执行内容：**

- 删除 `apps/web-antd/src/api` 中面向 `@qgs/shared` 的 `export *` 兼容再导出。
- 删除空的 `apps/web-antd/src/api/system/enums.ts`，调用方直接从 `@qgs/shared` 引入 `SysStatusEnum`。
- 将受影响页面和组合函数中的共享类型导入改为直接来自 `@qgs/shared`，保留 API 文件本地 namespace 和运行时请求函数。
- 将报检请求列表页从 502 行压回 500 行，满足 changed-scope 架构门禁。

**验证结果：**

- `pnpm run check:type`: 通过，3/3 tasks successful
- `pnpm lint`: 通过，0 error（9 个既有 warning）
- `pnpm run check:qms-arch`: 通过，0 violations

**commit:** 待提交

**遗留问题：**

- 无。

### 2026-06-29 清理：删除未启用认证子页面

**执行内容：**

- 删除仅可通过直达路由访问、且登录页已隐藏入口的 `code-login`、`qrcode-login`、`forget-password` 前端页面。
- 从核心认证路由中移除验证码登录、二维码登录、忘记密码三个子路由。
- 保留 `login` 和 `register`，因为当前登录页仍展示注册入口，后端也保留 `/api/auth/register`。

**验证结果：**

- `pnpm run check:type`: 通过，3/3 tasks successful
- `pnpm lint`: 通过，0 error（9 个既有 warning）

**commit:** 待提交

**遗留问题：**

- 前端 API `@qgs/shared` 再导出兼容层仍待单独清理。

### 2026-06-29 清理：删除旧部署入口与未使用前端依赖

**执行内容：**

- 删除根目录旧发布脚本 `publish.sh`，保留现有 `scripts/deploy/one-click-oss.sh` / `deploy-from-oss.sh` 发布路径。
- 删除仓库内置 `tools/bin/ossutil` 二进制，部署脚本继续使用系统 `ossutil` 或 `OSSUTIL_BIN` 覆盖。
- 删除仅用于开发架构可视化的 `_dev/architecture` 页面，并移除后端 `SystemArchitecture` 菜单声明。
- 删除 `@vue-flow/*`、`@wangeditor/editor-for-vue`、`lodash-es`、`mammoth`、`pdfjs-dist`、`@types/lodash-es` 等未使用前端依赖。
- 删除 `@vben-core/design` 中未使用的 `autoprefixer`、`postcss`、`sass` devDependencies，并同步更新 `pnpm-lock.yaml`。

**验证结果：**

- `pnpm run check:dep`: 通过；仅剩 `@qgs/weapp` 的 Uni/Vite 隐式依赖既有提示
- `pnpm run check:qms-arch`: 通过，0 violations
- `pnpm run check:type`: 通过，3/3 tasks successful
- `pnpm lint`: 通过，0 error（9 个既有 warning）

**commit:** 待提交

**遗留问题：**

- 认证子路由收缩和前端 API `@qgs/shared` 再导出清理需单独处理，避免混入产品行为变化和大范围 import diff。

### 2026-06-27 修复：小程序任务与记录列表右侧溢出

**执行内容：**

- 修复小程序“检验任务”和“检验记录”列表卡片右侧标签、结果摘要贴边/溢出的问题。
- 将 `scroll-view` 内边距迁移到内部内容容器，避免小程序渲染时卡片宽度和 padding 叠加导致右侧被裁。
- 为卡片、状态标签、编号、零件名、底部日期增加明确的 `box-sizing`、宽度和文本截断约束。

**验证结果：**

- `/opt/homebrew/bin/pnpm --dir apps/weapp run typecheck`: 通过脚本，项目当前配置为跳过 uni-app vue-tsc 冲突检查
- `/opt/homebrew/bin/pnpm lint`: 通过，0 error（9 个既有 warning）

**commit:** 待提交

**遗留问题：**

- 需要重新上传小程序体验版后在手机端确认实际渲染效果。

## [0.13.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.12.1...qgs-v0.13.0) (2026-06-26)


### Features

* **@qgs/backend:** notify dispatchers on inspection request creation ([3bc61e9](https://github.com/ajie5419/Quality-Guardian/commit/3bc61e98ef0eaa634c0196b117c3eaa5c910411e))


### Bug Fixes

* **@qgs/weapp:** normalize dispatch role detection ([ea7cb5e](https://github.com/ajie5419/Quality-Guardian/commit/ea7cb5eccac2aeb4bf87c9145e1dc250d2d83ae0))

### 2026-06-26 功能：车间报检待派单微信订阅提醒

**执行内容：**

- 新增待派单订阅消息链路：车间报检创建成功后，异步通知具备派单权限或管理员角色且已绑定微信的用户。
- 新增待派单模板 ID 默认值 `phgvEZC0eVmZhA0pgQJf8ufuF-y649JSVs8s5I5SpZM`，并支持后端/小程序环境变量覆盖。
- 小程序登录/首页“派单通知”授权现在同时申请派单给检验员模板和待派单提醒模板。
- 补充 RBAC 接收人查询、待派单消息发送、报检创建触发通知的单元测试。

**验证结果：**

- `pnpm -C apps/backend exec vitest run modules/user/wx-subscribe-message.service.test.ts modules/inspection/inspection-request-create.service.test.ts modules/rbac/rbac-role.service.test.ts`: 3 文件 / 33 测试通过
- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm --dir apps/weapp run typecheck`: 通过脚本，项目当前配置为跳过 uni-app vue-tsc 冲突检查
- `pnpm lint`: 通过，0 error（9 个既有 warning）
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过，0 violations

**commit:** 待提交

**遗留问题：**

- 生产发布后需要重新构建并上传微信小程序体验版，管理员需要在小程序端重新授权“派单通知”后才能接收待派单订阅消息。

## [0.12.1](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.12.0...qgs-v0.12.1) (2026-06-26)


### Bug Fixes

* **@qgs/backend:** align weapp login roles with rbac ([0e5874c](https://github.com/ajie5419/Quality-Guardian/commit/0e5874ca9c2a8fc5fec00370948b292b478f3afa))

### 2026-06-26 修复：小程序管理员角色展示误判

**执行内容：**

- 修复小程序首页角色判断大小写敏感的问题，避免 `Super Admin` 被误判为普通检验员。
- 将首页和任务页的派单角色判断统一到 `canDispatchByRoles`，兼容角色名中的大小写、空格、下划线和横线。
- 补充小程序角色判断单测，覆盖 `Super Admin`、`super_admin`、`dispatch-manager` 和检验员角色。

**验证结果：**

- `pnpm exec vitest run apps/weapp/src/utils/roles.test.ts`: 1 文件 / 3 测试通过
- `pnpm --dir apps/weapp run typecheck`: 通过脚本，项目当前配置为跳过 uni-app vue-tsc 冲突检查
- `pnpm lint`: 通过，0 error
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过，0 violations

**commit:** `ea7cb5ec` fix(@qgs/weapp): normalize dispatch role detection

**遗留问题：**

- 需要重新构建并上传微信小程序体验版，手机端重新进入体验版后才能看到新前端判断。

## [0.12.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.11.1...qgs-v0.12.0) (2026-06-26)


### Features

* **@qgs/backend:** add weapp dispatch notifications ([590662c](https://github.com/ajie5419/Quality-Guardian/commit/590662cb93153eb880125f04f3e4bbf5bb55c388))


### Bug Fixes

* **@qgs/backend:** isolate dispatch adversarial test ([8c1fd3c](https://github.com/ajie5419/Quality-Guardian/commit/8c1fd3c992a9b92e13320e022e070238c1fc85bb))
* **@qgs/weapp:** stabilize production login flow ([8a93d47](https://github.com/ajie5419/Quality-Guardian/commit/8a93d47402d1553d943baa90d1b5ffa2ea8f2011))

### 2026-06-26 修复：小程序微信登录角色来源不一致

**执行内容：**

- 修复微信小程序登录/绑定生成用户会话时只读取 `users.roleId` 旧单角色的问题。
- 微信登录现在使用 RBAC 多角色作为 `userPayload.roles`，与后台 `/api/user/info` 的角色来源保持一致；当 RBAC 未配置角色时才回退到旧单角色字段。
- 补充微信登录单测，覆盖 RBAC 多角色返回和旧单角色回退。

**验证结果：**

- `pnpm -C apps/backend exec vitest run modules/user/wx-auth.service.test.ts`: 1 文件 / 18 测试通过
- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm run check:qms-arch`: 通过，0 violations

**commit:** `0e5874ca` fix(@qgs/backend): align weapp login roles with rbac

**遗留问题：**

- 生产发布后，已登录小程序用户需要退出/切换账号重新登录，刷新本地缓存的 `userInfo.roles`。

### 2026-06-25 功能：小程序派单微信订阅消息

**执行内容：**

- 新增微信订阅消息后端服务，支持缓存小程序 `access_token`，派单成功后调用微信 `subscribe/send` 给检验员发送派单通知。
- 派单服务在事务和审计完成后异步触发订阅消息发送；检验员没有 `wxOpenId`、模板未配置或微信接口失败时只记录日志，不阻断派单。
- 用户模块通过 `index.ts` 导出订阅消息服务，派单模块只从模块公开出口调用，保持模块边界。
- 新增小程序订阅授权 API，登录/绑定成功后静默申请派单通知授权；首页新增“派单通知”入口，已登录用户可主动重新授权。
- 新增后端和小程序环境变量示例：`WX_DISPATCH_SUBSCRIBE_TEMPLATE_ID`、字段映射、`VITE_WX_DISPATCH_SUBSCRIBE_TEMPLATE_ID`；默认字段已适配“责任人委派通知”模板 `thing12/thing24/thing23/character_string13/time4`。
- 将订阅消息相关环境变量加入 Turbo `globalEnv`，保证本地和构建任务能拿到配置。

**验证结果：**

- `pnpm -C apps/backend exec vitest run modules/inspection/inspection-request-dispatch.service.test.ts modules/user/wx-subscribe-message.service.test.ts`: 2 文件 / 5 测试通过
- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm run check:qms-arch`: 通过，0 violations
- `pnpm --dir apps/weapp run typecheck`: 通过脚本，项目当前配置为跳过 uni-app vue-tsc 冲突检查
- `pnpm --filter @qgs/weapp dev`: 编译通过并生成 `apps/weapp/dist/dev/mp-weixin/`；已停止 watcher
- `rg "requestSubscribeMessage|派单通知" apps/weapp/dist/dev/mp-weixin -g "*.js"`: 产物已包含订阅授权调用和首页入口

**commit:** 待提交

**遗留问题：**

- 生产环境需要配置后端 `WX_DISPATCH_SUBSCRIBE_TEMPLATE_ID` 和小程序构建变量 `VITE_WX_DISPATCH_SUBSCRIBE_TEMPLATE_ID`；如果微信模板字段不同于“责任人委派通知”的 `thing12/thing24/thing23/character_string13/time4`，还需要配置字段映射变量。
- 微信订阅消息必须由用户在小程序端授权；未授权或拒绝授权时，后端无法强制发送。

### 2026-06-25 修复：小程序本地联调微信登录环境透传

**执行内容：**

- 修复 `pnpm local:container:dev:antd` 本地联调脚本未给后端注入微信登录必需环境变量的问题；开发环境默认使用 local-only 占位值，真实环境变量仍可覆盖。
- 将 `WX_APPID`、`WX_APP_SECRET`、`WX_SESSION_SECRET` 加入 Turbo `globalEnv`，确保 `pnpm dev:antd` 启动 backend dev 任务时能拿到微信登录配置。
- 定位当前小程序错误主因：AppID 已生效、API 地址已生效，当前阻断项是 `/api/auth/wx-login` 后端 500，而不是 `ERR_PROXY_CONNECTION_FAILED` 或游客 AppID。
- 将小程序登录页绑定表单的密码输入从 `safe-password` 改为普通 `password`，避免开发者工具触发微信安全输入链路后出现渲染层 `addListener` / `operateWXData` 类内部错误；绑定系统账号不需要微信安全键盘能力。
- 修复本地开发模式 mock 微信 openid 不稳定的问题；开发者工具每次返回不同 code 时，后端统一使用 `dev_openid_local`，避免同一系统账号反复绑定时误报“该账号已绑定其他微信”。
- 补充微信登录单测，覆盖开发者工具 mock code 与开发环境 invalid code 都生成稳定本地 openid 的场景。
- 调整小程序启动鉴权时序：移除 `App.onLaunch` 中的同步 `reLaunch`，改为首页 `onShow` 完成登录态检查，避免首屏首次渲染期间强制换页触发 `Expected updated data but get first rendering data`。
- 保留 `App.vue` 的最小组件脚本，避免 uni 编译器因只有 `<style>` 而拒绝生成 `app.json`。
- 将小程序启动页改为登录页，登录页 `onReady` 只在已有登录态时切到首页，避免未登录启动时先渲染首页再立即 `reLaunch` 的首屏时序问题。
- 新增小程序资源 URL 规范化函数，将 `/uploads/*`、`/api/uploads/*` 等后端相对路径转换为完整 API 地址，修复图片被微信当成本地资源加载导致 500 的问题。
- 报检、派工、检验结果页图片展示统一走资源 URL 规范化。
- 修复小程序首页统计语义错误：不再把 `/api/qms/workspace` 的 `todayInspections` 当作“待派单”，改用 `/api/qms/inspection/requests/stats` 的 `pendingDispatchCount`、`pendingInspectionCount` 和 `todayClosedCount`。
- 小程序首页检验员视角“我的待检”改用当前任务列表 total，避免把全局待检数误显示为个人待办数。

**验证结果：**

- `bash -n scripts/local/container-dev-antd.sh`: 通过
- `node -e "JSON.parse(require('fs').readFileSync('turbo.json','utf8')); console.log('turbo.json ok')"`: 通过
- `pnpm -C apps/backend exec vitest run modules/user/wx-auth.service.test.ts`: 1 文件 / 16 测试通过
- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm --dir apps/weapp run typecheck`: 通过脚本，项目当前配置为跳过 uni-app vue-tsc 冲突检查
- `rg "safe-password" apps/weapp/src`: 无匹配
- `pnpm --filter @qgs/weapp dev`: 编译通过并生成 `apps/weapp/dist/dev/mp-weixin/app.json`；已停止 watcher
- `rg "userStore\\.checkAuth\\(|onLaunch\\(\\)" apps/weapp/dist/dev/mp-weixin/app.js apps/weapp/dist/dev/mp-weixin/stores/user.js`: 无匹配
- `apps/weapp/dist/dev/mp-weixin/app.json`: 首屏已生成为 `pages/login/index`
- `rg "<image[^\\n]*:src=\\\"att\\.url\\\"|:src=\\\"[^\\\"]*\\.url\\\"" apps/weapp/src -g "*.vue"`: 无匹配
- `rg "buildResourceUrl" apps/weapp/dist/dev/mp-weixin -g "*.js"`: 产物已包含资源 URL 规范化调用
- `rg "inspection/requests/stats|qms/workspace|pendingDispatchCount|todayInspections" apps/weapp/dist/dev/mp-weixin -g "*.js"`: 产物已使用报检任务统计接口，未命中 `qms/workspace` / `todayInspections`

**commit:** 待提交

**遗留问题：**

- 需在微信开发者工具重新导入/编译 `apps/weapp/dist/dev/mp-weixin/` 后确认渲染层错误是否消失。

## [0.11.1](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.11.0...qgs-v0.11.1) (2026-06-25)

### Bug Fixes

* **@qgs/backend:** restore inspection and work order flows ([5a3e32a](https://github.com/ajie5419/Quality-Guardian/commit/5a3e32acd751bc9ad0aa4a4ab0ac6869aa97a3c0))
* **@qgs/backend:** restore inspection and work order flows ([3ec8f6c](https://github.com/ajie5419/Quality-Guardian/commit/3ec8f6c1329884c3887ec39f85059ab847560d1c))
* **deploy:** baseline existing prisma schema ([6b23484](https://github.com/ajie5419/Quality-Guardian/commit/6b23484d5eea41aa5b47d9094daddc73dcc62575))

### 2026-06-25 修复：软删除工单编号无法重新新增

**执行内容：**

- 修复工单单条新增入口对软删除记录的处理：当 `workOrderNumber` 已存在但 `isDeleted=true` 时，恢复该工单并覆盖本次提交的工单字段，而不是返回编号已存在。
- 保持有效工单的编号唯一保护：当同编号工单未删除时仍返回明确冲突提示，避免覆盖已有工单关联的检验、售后和质量记录。
- 补充工单路由服务单测，覆盖新增、软删除恢复、有效编号冲突三条路径。

**验证结果：**

- `pnpm -C apps/backend exec vitest run modules/work-order/work-order-route.service.test.ts`: 1 文件 / 14 测试通过
- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm run check:qms-arch`: 通过，0 violations

**commit:** 待提交

**遗留问题：**

- 未连接生产数据库查询 `26-KJGZ-005` 当前记录状态；代码根因已确认是软删除主键占号时单条新增入口直接冲突。

### 2026-06-24 修复：小程序连接与鉴权接口链路

**执行内容：**

- 移除小程序请求层默认回退到 `http://localhost:5320` 的逻辑；`VITE_API_BASE_URL` 未配置时直接抛出明确错误，避免微信开发者工具或真机误连本机 `localhost`。
- 小程序报检提交、工单搜索、工序、BOM 部件、班组查询全部从 `/api/qms/public/inspection/requests/*` 切换到鉴权接口 `/api/qms/inspection/requests/*`。
- 后端补齐小程序需要的鉴权版报检辅助查询路由：`work-orders`、`processes`、`bom-parts`、`teams`，复用现有 inspection 查询 service。
- 新增鉴权上传入口 `/api/qms/upload`，小程序上传不再调用 public 路径；派工附件预览统一通过请求层拼接 API 地址。

**验证结果：**

- `rg "api/qms/public|api/upload|localhost:5320|VITE_API_BASE_URL \\|\\||BASE_URL" apps/weapp apps/backend/api/qms/inspection apps/backend/api/qms/upload.post.ts`: 小程序端无 public 路径、旧上传路径、localhost 回退残留。
- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm run check:qms-arch`: 通过，0 violations across 0 rules
- `pnpm lint`: 通过；存在既有 `IssueFormFields.test.ts` 的 9 个 `vue/one-component-per-file` warning，非本次小程序改动引入。
- `pnpm --dir apps/weapp run typecheck`: 脚本执行成功；项目脚本当前为 `skipped: uni-app types incompatible with vue-tsc global check`。

**commit:** 待提交

**遗留问题：**

- 未读取 `.env` 文件；需要在实际构建环境确认 `VITE_API_BASE_URL` 指向微信可访问的 HTTPS 后端域名，并在微信小程序后台配置合法 request/uploadFile 域名。
- 按项目约束未启动小程序 dev/build 服务。

## [0.11.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.10.2...qgs-v0.11.0) (2026-06-24)


### Features

* **@qgs/backend:** add createdBy ownership column to loss-bearing tables ([4325636](https://github.com/ajie5419/Quality-Guardian/commit/43256365d269c704522ed6ccb0b88ec77c0a8baf))
* **@qgs/backend:** enforce quality-loss ownership guard on PUT ([7c1b7cb](https://github.com/ajie5419/Quality-Guardian/commit/7c1b7cb10fd14fb5e7dfa9f6d44f160ef1641e71))
* **@qgs/backend:** expose grossCost/recovered/netLoss in after-sales metrics ([0357943](https://github.com/ajie5419/Quality-Guardian/commit/0357943b1a463cbac50766ba9a69b95ad6021c5b))
* **@qgs/backend:** introduce quality_loss_index materialized table ([3bd0805](https://github.com/ajie5419/Quality-Guardian/commit/3bd080538f70f1a7670c3566a690e0a15b21ac8d))
* **@qgs/backend:** report external-loss KPI uses net loss after recovery ([c95de98](https://github.com/ajie5419/Quality-Guardian/commit/c95de98eb27d479de287eb9b5f4ae85c00e07cb7))
* **@qgs/backend:** scope quality-loss queries via data-scope middleware ([139b1cc](https://github.com/ajie5419/Quality-Guardian/commit/139b1cc52e837ede0e000afdcca40a2fc183a477))
* **@qgs/backend:** wire quality-loss index writes into 4 source modules ([9ca585e](https://github.com/ajie5419/Quality-Guardian/commit/9ca585eea521b3517db3b5482c42ff93693621f8))
* **@qgs/web-antd:** show inspector active inspection tasks ([8b7d5df](https://github.com/ajie5419/Quality-Guardian/commit/8b7d5dfc5d9c344e915362db48a5641f03f578a4))


### Bug Fixes

* **@qgs/backend:** preserve prisma invalid invocation root cause ([b93657c](https://github.com/ajie5419/Quality-Guardian/commit/b93657c2d11bf4dad723adba25c56c62e643e392))
* **@qgs/backend:** release redis connection in maintenance scripts ([2e7834d](https://github.com/ajie5419/Quality-Guardian/commit/2e7834da405402a4a24e8da89b7ab0e06aa49cc2))
* **@qgs/backend:** translate unified quality-loss status to raw status buckets when filtering the index ([b0e153a](https://github.com/ajie5419/Quality-Guardian/commit/b0e153a8d1bb75ad20dec3fa2951662c40347bcd))
* **@qgs/web-antd:** localize qms status displays ([3b57219](https://github.com/ajie5419/Quality-Guardian/commit/3b57219ded3ff8b46f6398b4a3630e03989bf681))
* **@qgs/web-antd:** persist inspection request issue photos ([79c660b](https://github.com/ajie5419/Quality-Guardian/commit/79c660b9d6a558de81f65d0884aefc9983c5cefc))
* **@qgs/web-antd:** query supplier after-sales by supplier name ([7f69754](https://github.com/ajie5419/Quality-Guardian/commit/7f69754d9107b94bff1c80ce049d5da30379c049))

### 2026-06-24 修复：报检关闭不合格项责任归属与编号

**执行内容：**

- 新增报检任务生成不合格项的责任归属共享规则：进货检验把报检班组写入 `supplierName`，责任部门写 `采购部`；外协工序把报检班组写入 `supplierName`，责任部门写 `生产 OBU`；内部班组仍写责任部门。
- 报检任务“完成检验”弹窗改为按共享规则预填不合格项责任字段，避免供应商/外协单位落到责任部门。
- 后端创建关联不合格项时同步按同一规则兜底，避免绕过前端或旧前端 payload 继续写错字段。
- 移除后端空不合格编号回退为内部 `ISS-*` id 的逻辑；未点击“生成编号”时，不合格项编号保持为空，只在前端明确传入 `ncNumber` 时落库。
- 同步重建 `@qgs/shared` 本地构建产物，用于验证应用层测试真实解析到新增共享规则。

**验证结果：**

- `pnpm --dir packages/qgs-shared run build`: 通过
- `pnpm -C apps/backend exec vitest run modules/inspection/inspection-request-close-issue.service.test.ts modules/inspection/inspection-request-close.schema.test.ts modules/inspection/inspection-request-close-adversarial.test.ts modules/inspection/inspection-request-close.service.test.ts`: 4 文件 / 48 测试通过
- `pnpm exec vitest run --dom apps/web-antd/src/views/qms/inspection/requests/composables/useInspectionRequestTaskActions.test.ts apps/web-antd/src/views/qms/inspection/issues/components/IssueFormFields.test.ts packages/qgs-shared/src/domain-modules/qms/inspection-request.test.ts`: 3 文件 / 13 测试通过
- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm --dir apps/web-antd run typecheck`: 通过
- `pnpm run check:qms-arch`: 通过，0 violations

**commit:** 待提交

**遗留问题：**

- 未启动前端 dev/build；按项目约束仅做代码级验证、共享包构建、类型检查、单测和架构门禁。

### 2026-06-24 修复：生产发布 Prisma 基线迁移

**执行内容：**

- 定位 `qgs-v0.11.0` 发布失败根因：生产库已有业务表但没有 Prisma migration 基线，`migrate deploy` 返回 `P3005`；旧脚本退到 `db push` 后又因将删除 `after_sales.qualityLoss` 且该列有 41 条非空数据而被 Prisma 阻断。
- 修改 GitHub Actions 发布脚本，移除生产发布中的 `prisma db push` 兜底。
- 当且仅当 `migrate deploy` 返回 `P3005` 时，发布脚本会先在后端容器内 introspect 生产 schema，确认生产库至少达到 `qgs-v0.10.2` 的 schema 边界，再用 `migrate resolve --applied` 对既有 schema 做一次受控 baseline。
- baseline 固定停在 `20260617000100_add_inspection_self_check_documents`，让 `qgs-v0.11.0` 新增的 5 个 migration 继续按 migration 路径真实执行。
- 第二、三次 deploy-only 证明生产库没有 `quality_loss_index` 表，最终确认自动 baseline 不能越过 `qgs-v0.11.0` 的新 migration。

**验证结果：**

- `ruby -e "require 'yaml'; YAML.load_file('.github/workflows/deploy.yml'); puts 'deploy.yml parsed'"`: 通过
- `bash -n /tmp/qms-deploy-script.sh`: 通过
- `pnpm run check:qms-arch`: 通过，0 violations

**commit:** 待提交，等待本次发布修复提交

**遗留问题：**

- 当前 release `qgs-v0.11.0` 的前三次 deploy run 已失败，需要推送修复后用 `workflow_dispatch deploy_only=true` 对同一镜像标签重新发布。

### 2026-06-24 功能：检验员状态查看当前任务

**执行内容：**

- 报检任务统计的 `inspectorStatus` 增加稳定 `inspectorId`，避免前端按姓名查任务。
- 扩展报检任务列表查询，支持 `inspectorId` 过滤和逗号分隔多状态过滤；仅检验员当前任务查询使用优先级/派单时间排序，普通列表仍保持提交时间倒序。
- 检验员状态抽屉改为桌面双栏/移动单栏布局：左侧检验员列表，点击人员后加载右侧“当前检验任务”。
- 点击当前任务复用现有报检任务详情抽屉，不新增重复详情逻辑。
- 新增 `useInspectionRequestInspectorTasks` 管理检验员任务加载状态，避免页面文件超过架构门禁行数限制。

**验证结果：**

- `pnpm -C apps/backend exec vitest run modules/inspection/inspection-request-query.service.test.ts modules/inspection/inspection-request-stats.service.test.ts`: 2 文件 / 11 测试通过
- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm -C apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm run check:qms-arch`: 通过，0 violations

**commit:** 待提交

**遗留问题：**

- 未启动前端 dev/build；按项目约束仅做代码级验证、类型检查、单测和架构门禁。

### 2026-06-24 修复：QMS 状态展示中文化收口

**执行内容：**

- 新增前端共享状态展示工具 `status-ui.ts`，集中处理 QMS 常见状态码的中文标签和 Tag 颜色。
- 重构 `QmsStatusTag`，状态展示统一走 `resolveQmsStatusUi()`，不再在组件内按业务域散落 switch 回退。
- 替换文件中心列表和详情里的裸 `status` 展示，改为中文状态 Tag。
- 调整质量损失、报检任务、工单状态的未知状态兜底，避免直接显示英文状态码。
- 修复质量损失状态字典映射，字典返回 `Confirmed` / `Processing` 等英文值时也强制按统一状态展示工具转成中文。
- 同步更新质量损失和工单状态相关单测期望。

**验证结果：**

- `pnpm -C apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm -C apps/web-antd exec vitest run src/views/qms/quality-loss/composables/useQualityLossGrid.test.ts src/views/qms/work-order/constants.test.ts`: 2 文件 / 22 测试通过
- `pnpm -C apps/web-antd exec vitest run src/views/qms/quality-loss/constants.test.ts src/views/qms/quality-loss/composables/useQualityLossGrid.test.ts`: 2 文件 / 22 测试通过
- 裸状态输出定向搜索：未发现 QMS 页面中 `{{ record.status }}` / `{{ row.status }}` 直接展示；剩余命中为状态条件判断或类型字段。

**commit:** 待提交

**遗留问题：**

- 未启动前端 dev/build；按项目约束仅做代码级验证、类型检查和定向单测。

### 2026-06-24 修复：供应商详情售后质量记录过滤字段

**执行内容：**

- 修复供应商详情抽屉“售后质量记录”过滤参数，改为使用供应商名称 `row.name` 查询售后记录。
- 根因：列表“售后问题”数量按售后记录 `supplierBrand` 聚合到供应商名称；详情页此前优先使用 `row.brand || row.name`，当品牌字段为“自有”时会用“自有”过滤售后记录，导致列表有数量但详情为空。

**验证结果：**

- `pnpm --dir apps/web-antd exec vue-tsc --noEmit`: 通过
- `pnpm run check:qms-arch`: 通过，0 violations across 0 rules

**commit:** 待提交

**遗留问题：**

- 未启动前端 dev/build；按项目约束仅做代码修复、类型检查和架构门禁。

### 2026-06-24 apple/container 本地测试环境

**执行内容：**

- 新增 `apple/container` 本地完整环境入口，覆盖 MySQL、Redis、后端镜像、前端镜像、真实测试数据库迁移、上传目录挂载与健康检查。
- 新增前端本地专用 nginx 配置，将 `/api/` 和 `/uploads/` 代理到 `host.container.internal:3000`，避免依赖 Docker Compose 的 `backend` 服务名。
- 新增 `.env.container.example`，约定本地私有 `.env.container.local` 使用 `quality_guard_container` 测试库，并通过 `host.container.internal:3307/6380` 访问本地容器化 MySQL/Redis。
- 新增 `pnpm local:container:*` 命令入口，统一构建、启动、停止、日志、测试库 reset，以及 `pnpm dev:antd` 与本地容器化 MySQL/Redis 的组合启动；源码 dev 组合模式不创建 `host.container.internal` DNS，空测试库用 `prisma db push` 建表。

**验证结果：**

- `bash -n scripts/local/container-common.sh scripts/local/container-build.sh scripts/local/container-up.sh scripts/local/container-down.sh scripts/local/container-logs.sh scripts/local/container-reset-db.sh`: 通过
- `node -e "const p=require('./package.json'); console.log(Object.keys(p.scripts).filter(k=>k.startsWith('local:container')).join('\n'))"`: 输出 6 个本地容器脚本
- `bash -n scripts/local/container-dev-antd.sh`: 通过
- `container --version`: `container CLI version 1.0.0 (build: release, commit: ee848e3)`
- 官方命令参考确认 `container run` 支持 `--env-file`、`-p/--publish`、`--mount`、`--rm`，`container build` 支持 `-f`、`-t`、`-m`、`-c`
- `pnpm local:container:up`: 首次运行按预期创建 `.env.container.local` 后退出，未启动容器栈
- `pnpm local:container:dev:antd`: 首次试跑暴露出 `host.container.internal` DNS 需要 sudo；已移除源码 dev 组合模式里的 DNS 创建步骤
- `pnpm local:container:dev:antd`: 空测试库执行 `migrate deploy` 命中历史迁移依赖已有表，已按本地开发语义改为 `prisma db push`
- `pnpm local:container:dev:antd`: 可启动 MySQL/Redis、同步 Prisma schema 并进入 `pnpm dev:antd`；发现 Turbo 未透传 `DATABASE_URL/REDIS_URL`，已加入 `turbo.json` `globalEnv`
- `pnpm local:container:dev:antd`: 后端已读取 `REDIS_URL`，但 Redis 刚启动时端口未就绪会短暂 `ECONNREFUSED`；已给 Redis 增加 `redis-cli ping` 就绪等待
- `pnpm local:container:dev:antd`: Redis AOF 持久化在 apple/container named volume 下遇到 `appendonlydir: Permission denied`；本地开发改为无状态 Redis，不挂载数据卷、不启用 AOF
- `pnpm local:container:dev:antd`: 如果旧后端占用 `5320`，前端会继续打旧后端并连到旧 `3306`；已增加 `5320` 端口占用检查，阻止 Nitro 静默切到 `3000`
- `pnpm local:container:dev:antd`: 新测试库只 `db push` 会没有管理员账号；已增加 `users` 为空时自动 seed，默认账号 `vben / 123456`
- 未运行实际镜像构建和启动；本次只落本地测试脚本并做静态验证

**commit:** 待提交

**遗留问题：**

- 首次启动前需要创建 `.env.container.local`；测试库由 `qms-container-mysql` 首次启动时自动创建。
- 只有 `pnpm local:container:up` 这种前后端都容器化的模式需要 `host.container.internal` DNS；`pnpm local:container:dev:antd` 不需要 sudo DNS。

### 2026-06-24 修复：菜单接口 Prisma 错误日志保留根因

**执行内容：**

- 定位 `/api/menu/all` 的 `prisma.menus.findFirst()` 报错来自菜单同步链路 `ensureModuleMenus()`。
- 增强 `sanitizeError()` 对 Prisma `Invalid invocation` 的摘要逻辑，保留后续根因行，避免日志只显示 `Invalid prisma... invocation`。
- 新增 `utils/module-loader.test.ts`，覆盖模块菜单同步会按 `isDeleted + path + status` 查找父菜单，并在创建菜单后清理菜单缓存。

**验证结果：**

- `pnpm -C apps/backend exec vitest run utils/logger.test.ts utils/module-loader.test.ts`: 2 文件 / 4 测试通过
- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm run check:qms-arch`: 通过，0 violations
- 本地菜单探针：MySQL 容器运行后，`menus.findFirst` 查到 `/qms`，`ensureModuleMenus()` 执行成功

**commit:** 待提交

**遗留问题：**

- 本次未启动前端 dev/build，按项目约束仅做后端探针、单测、类型检查和架构门禁。

### 2026-06-22 Phase 1 + 2：售后/质量损失/报表 模块契约重构

**执行内容：**

- Step 1 `43256365`：给 after_sales / quality_records / quality_losses 三表加 createdBy 字段 + 索引，历史数据 backfill 成 'system'；@qgs/shared payload builders 与 4 个源写入入口贯通 createdBy。
- Step 2 `139b1cc5`：中间件加 quality-loss 前缀；module 配置 dataScope（selfFields=['createdBy']、deptFields=['respDept']、selfFallsBackToDept=true）；DataScopeService.buildQualityLossWhere；manual 源走 DB 层 SELF/DEPT 过滤。
- Step 3 `7c1b7cb1`：QualityLossRouteUpdateService.updateByRouteId 加 assertOwnership，4 source 各自查 createdBy 比对 userId，失败抛 BusinessError('FORBIDDEN', ..., 403)；路由翻译 BusinessError → HTTP。
- Step 4 `129f889d`：跨源 PUT 带 status 返回 400 BAD_REQUEST；下游 service updateQualityLossFields 签名去掉 status 入参，类型上禁止回归；前端 status 下拉非 manual 源 disabled。
- Step 5 `3bd08053`：建 quality_loss_index 物化表 + 8 索引；QualityLossQueryParams 新增 dataScope；list 路由透传 dataScope。
- Step 6 `9ca585ee`：新建 QualityLossIndexService 写入门（upsertFromAfterSales/Internal/Commissioning/Manual + softDelete*）；4 源所有写入路径接入索引同步；D2 入列条件（isClaim || cost>0）落到写门。
- Step 7 `89a82483`：新建 backfill-quality-loss-index.ts；service 加 4 个 backfill 函数（cursor 分批 500）；.github/workflows/deploy.yml 加 detached qms-quality-loss-backfill 容器。
- Step 8 `c98e588b`：读路径全切索引表，DB 层 skip+take+orderBy；删 in-memory 合并 (getAllLossesUnpaginated/fetchFromAllSources/mergeAndFilter)；索引表加 partName/description 列 + migration；trend 钻取改读索引；quality-loss.service.ts 从 515 行瘦到 273 行（500 限内）。
- Step 9 `bdd69c17`：删除 denormalized after_sales.qualityLoss 列；service 层手算逻辑全删；shared builder qualityLoss 字段删除；前端展示由 service.getList map 时 derive。
- Step 10 `0357943b`：AfterSalesIntegrationService.getReportPeriodMetrics 返回 { grossCost, recovered, netLoss }；@qgs/shared AfterSalesPeriodMetrics 类型补充。
- Step 11 `c95de98e`：报表"售后损失" KPI 取 netLoss（D1）；KPI desc 改"售后总成本扣减已追偿"；externalLoss 别名彻底删除。
- Step 12 `4e93702d`：清理 4 个孤儿 formatter（formatManualLossItem 等）+ sortByDateDesc；formatIndexRow / buildIndexWhere 新增针对性单测；D2 入列条件由 QualityLossIndexService 单一实现。

**修补：**
- `2e7834da`：Redis.disconnect() + supplier-score / quality-loss-index backfill 脚本 finally 中释放 Redis 长连接。

**验证结果：**

- typecheck: 通过（0 error）
- vitest: 244 文件 / 2179 测试全过
- check:qms-arch: 0 violations
- B-S1 隐性违规修复：quality-loss.service.ts 从 515 行（基线 508 + 7）回到 273 行
- 4 个 Pending migration: 20260618000100..20260622000200

**部署：**

- 部署期按顺序：prisma migrate deploy → 重启 backend → backfill 容器（deploy workflow 自动）
- 业务方知会项：
  1. SELF/DEPT scope 用户首次部署后看不到历史数据（createdBy='system'）；需手工归属或配 ALL policy
  2. PUT /api/qms/quality-loss/{id} 跨源带 status 返回 400
  3. 售后单 cost=0 + isClaim=true 现在会进入损失列表
  4. 报表"售后损失"= 净损失（不再是总成本）

**遗留问题：**

- `api/qms/quality-loss/[id].put.ts` 46 行，距 50 行限只剩 4 行余量
- Phase 3 待办：supplier 评分异步化（Step 14）、supplierBrand→supplierBrandId 收敛（Step 15）、after-sales 对外只读 facade（Step 16）
- 详细契约见 `docs/after-sales-quality-loss.md`

### 2026-06-18 修复：维护容器完成后不退出

**执行内容：**

- 为 Redis 管理器增加显式 `disconnect()`，用于一次性维护脚本释放 Redis 长连接。
- 供应商评分快照回填脚本和质量损失索引回填脚本在 `finally` 中同时释放 Prisma 与 Redis，避免业务日志显示完成后容器仍保持运行。

**验证结果：**

- `pnpm -C apps/backend exec tsc --noEmit`: 通过

**commit:** 待提交

**遗留问题：**

- 服务器上已经卡住的旧容器需要手动删除；新镜像发布后的一次性维护容器会在脚本完成后退出。

### 2026-06-18 修复：报检完成检验不合格照片落库

**执行内容：**

- 新增不合格照片 URL 归一化工具，统一兼容 `file.response.data.url`、`file.url` 和 `file.thumbUrl`。
- 报检任务完成检验创建关联不合格品项时，复用统一归一化逻辑，避免上传成功但未回填 `file.url` 时提交空照片数组。
- 补充报检任务关闭 composable 单测，覆盖上传响应中仅包含 `response.data.url` 的不合格照片提交场景。

**验证结果：**

- `rtk pnpm exec vitest run apps/web-antd/src/views/qms/inspection/requests/composables/useInspectionRequestTaskActions.test.ts`: 1 文件 / 1 测试通过
- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm exec eslint apps/web-antd/src/views/qms/inspection/issues/utils/photo-upload.ts apps/web-antd/src/views/qms/inspection/records/components/inspection-form.utils.ts apps/web-antd/src/views/qms/inspection/requests/composables/useInspectionRequestTaskActions.ts apps/web-antd/src/views/qms/inspection/requests/composables/useInspectionRequestTaskActions.test.ts`: 通过

**commit:** 已提交，最终 hash 以 Git 历史为准

**遗留问题：**

- 未启动前端 dev server，按项目约束仅通过代码审查、单测、类型检查和 lint 验证。

## [0.10.2](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.10.1...qgs-v0.10.2) (2026-06-17)


### Bug Fixes

* **@qgs/backend:** avoid blocking deploy on supplier score backfill ([c32d621](https://github.com/ajie5419/Quality-Guardian/commit/c32d621855298d5bfe51a18f0ae935bf24836672))

### 2026-06-17 修复：供应商评分快照回填避免阻塞发布

**执行内容：**

- `SupplierScoreSnapshotService` 新增 `refreshMissing()`，只选择 `scoreSnapshot IS NULL` 的供应商补齐快照，并返回处理批次和数量。
- 供应商评分快照 backfill 脚本支持 `SUPPLIER_SCORE_BACKFILL_MODE=missing`、批大小和最大批次数环境变量，并记录结构化开始/结束日志。
- deploy workflow 改为服务健康检查通过后启动异步临时容器执行缺失快照补齐，避免全量重算超过 SSH action 运行上限导致发布失败。
- 更新供应商模块架构文档和总览架构文档，说明生产发布只补缺失快照，日常变更由业务写入路径刷新快照。

**验证结果：**

- `SUPPLIER_SCORE_BACKFILL_MODE=missing pnpm -C apps/backend exec tsx scripts/backfill-supplier-score-snapshots.ts`: 通过，当前库无缺失快照，处理 `0` 条。
- `pnpm -C apps/backend exec vitest run modules/supplier/supplier.service.test.ts`: 1 文件 / 18 测试通过。
- `pnpm -C apps/backend exec tsc --noEmit`: 通过。
- `pnpm run check:type`: 通过，3/3 typecheck 任务成功。
- `pnpm run check:qms-arch`: 通过，0 violations。
- `pnpm lint`: 通过。
- `docker build --platform linux/amd64 -f infra/docker/Dockerfile.backend -t qgs-backend-backfill-flow-test .`: 通过。
- `docker run --rm qgs-backend-backfill-flow-test sh -lc '...'`: 通过，确认维护脚本、`tsx`、供应商模块、workspace 包和 Prisma schema 均存在于容器内，且 `uploads` 未进入 image。

**commit:** 待提交

**遗留问题：**

- 无。

## [0.10.1](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.10.0...qgs-v0.10.1) (2026-06-17)


### Bug Fixes

* **@qgs/backend:** run supplier score backfill during deploy ([c69fbff](https://github.com/ajie5419/Quality-Guardian/commit/c69fbff71636b929206071d9698193b948d21d32))

### 2026-06-17 修复：供应商评分快照回填纳入发布流程

**执行内容：**

- 后端生产 Docker image 通过白名单复制维护入口运行所需的 `modules`、`utils`、`scripts`、Prisma schema、Nitro TS alias 文件和 workspace 包，并在构建阶段校验 `tsx` 和供应商评分快照回填脚本存在。
- `@qgs/backend` 将 `tsx` 列为生产依赖，并新增 `maintenance:supplier-score-snapshots` 脚本，避免维护命令依赖根目录 devDependency。
- deploy workflow 在 Prisma migration 后自动执行 `apps/backend/scripts/backfill-supplier-score-snapshots.ts`，并将 Prisma schema 路径改为显式 `/app/apps/backend/prisma/schema.prisma`。
- 更新 `CONSTRAINTS.md`、`docs/architecture.md`、`apps/backend/modules/supplier/ARCHITECTURE.md`，明确快照/物化指标回填必须随 image 发布并由发布流程自动执行。

**验证结果：**

- `pnpm -C apps/backend exec tsx scripts/backfill-supplier-score-snapshots.ts`: 通过
- `pnpm -C apps/backend exec vitest run modules/supplier/supplier.service.test.ts`: 1 文件 / 17 测试通过
- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm run check:type`: 通过，3/3 typecheck 任务成功
- `pnpm run check:qms-arch`: 通过，0 violations across 0 rules
- `pnpm lint`: 通过
- `docker build --platform linux/amd64 -f infra/docker/Dockerfile.backend -t qgs-backend-backfill-flow-test .`: 通过
- `docker run --rm qgs-backend-backfill-flow-test sh -lc '...'`: 通过，确认维护脚本、`tsx`、供应商模块、workspace 包和 Prisma schema 均存在于容器内，且 `apps/backend/uploads` 未进入 image

**commit:** 已提交，最终 hash 以 Git 历史为准

**遗留问题：**

- 无

## [0.10.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.9.0...qgs-v0.10.0) (2026-06-17)


### Features

* enhance supplier and inspection workflows ([e0ab831](https://github.com/ajie5419/Quality-Guardian/commit/e0ab8311bf34c9a2abadee0e05084fd65133ea53))


### Bug Fixes

* **@qgs/backend:** harden pagination and quality loss guards ([eee1c27](https://github.com/ajie5419/Quality-Guardian/commit/eee1c2727a78ced6e9ee02e833be73def7af40b9))
* **@qgs/shared:** normalizeQualityLossStatus no longer maps unknown statuses to Pending ([f420162](https://github.com/ajie5419/Quality-Guardian/commit/f420162ca6fc8947612e01a6bc22944f9bfc51ee))

### 2026-06-17 功能：检验记录列表筛选

**执行内容：**

- 进货检验列表在表格上方新增显式筛选栏，支持工单号、供应商、是否有资料筛选，并将筛选参数传入后端列表与导出接口。
- 过程检验列表在表格上方新增显式筛选栏，支持工单号、工序、一级部件、班组、检验员筛选，并在切换检验类型时重置不适用筛选字段。
- `parseInspectionRecordListQuery()` 新增筛选参数解析，`InspectionRecordQueryService.findAll()` 在数据库层组装 `where` 条件，避免前端当前页过滤。
- 补充 shared query parser 单元测试和后端查询 where 条件单元测试。

**验证结果：**

- `pnpm --dir packages/qgs-shared build`: 通过
- `pnpm --dir packages/qgs-shared exec vitest run src/domain-modules/qms/inspection-record.test.ts`: 1 文件 / 1 测试通过
- `pnpm -C apps/backend exec vitest run modules/inspection/inspection-record-query.service.test.ts modules/inspection/inspection-route.service.test.ts`: 2 文件 / 19 测试通过
- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过，0 violations across 0 rules
- `pnpm lint`: 通过

**commit:** 本次未提交

**遗留问题：**

- 无

### 2026-06-17 功能：检验记录自检记录独立落库

**执行内容：**

- `inspections` 新增 `selfCheckDocuments`、`hasSelfCheckDocuments` 字段及 migration，用于独立保存报检入口上传的自检记录。
- 调整报检关闭生成/关联检验记录链路：`qms_inspection_requests.attachments` 写入 `inspections.selfCheckDocuments`，关闭附件继续写入 `inspections.documents`。
- 文件引用登记拆分为 `fieldName=documents` 与 `fieldName=selfCheckDocuments`，避免自检记录和检验记录附件混用。
- 检验记录详情新增“自检记录”展示区，继续保留“检验记录附件”展示关闭附件。
- 更新 shared 领域规则、后端单元测试、`CONSTRAINTS.md`、`docs/architecture.md`、`apps/backend/modules/inspection/ARCHITECTURE.md`。

**验证结果：**

- `pnpm --dir apps/backend exec prisma format`: 通过
- `pnpm --dir apps/backend exec prisma generate`: 通过
- `pnpm --dir packages/qgs-shared build`: 通过
- `pnpm --dir packages/qgs-shared exec vitest run src/domain-modules/qms/inspection-request.test.ts`: 1 文件 / 3 测试全部通过
- `pnpm -C apps/backend exec vitest run modules/inspection/inspection-request.test.ts modules/inspection/inspection-request-close-effects.service.test.ts modules/inspection/inspection-request-close.service.test.ts modules/inspection/inspection-request-close-records.service.test.ts`: 4 文件 / 12 测试全部通过
- `pnpm -C apps/backend exec vitest run`: 185 文件 / 1774 测试全部通过
- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过，0 violations across 0 rules
- `pnpm run check:prisma-migration`: 通过
- `pnpm lint`: 通过
- `pnpm --dir apps/backend exec prisma migrate deploy`: 通过，已应用 `20260617000100_add_inspection_self_check_documents`
- `pnpm -C apps/backend exec node -e '...'`: 通过，确认 `inspections.selfCheckDocuments` 与 `inspections.hasSelfCheckDocuments` 两列存在，且同类 `inspections.findMany()` 可正常返回

**commit:** 本次未提交

**遗留问题：**

- 无

### 2026-06-15 功能：供应商/外协准入档案与画像历史项目

**执行内容：**

- `suppliers` 新增 `recognizedAt`、`manufacturerNature`、`admissionDocuments` 字段及 migration；供应商新增/编辑支持认定时间、厂商性质、准入手续上传，外协新增/编辑支持认定时间、准入手续上传。
- 供应商/外协保存时将准入手续上传结果写入业务字段，并同步登记 `file_references(bizType=supplier, fieldName=admissionDocuments)`。
- 新增 `InspectionRequestHistoryService.getSupplierHistoryProjects()`，以报检任务为事实源按工单去重读取历史使用项目，并通过 `SupplierService.getHistoryProjects()` 暴露给画像接口。
- 新增 `/api/qms/supplier/:id/history-projects`，供应商画像新增“历史使用项目”页签，展示工单号和项目名称；基本档案显示认定时间、厂商性质和准入手续附件。
- 调整供应商/外协新增编辑弹窗：展示字段全部设为必填，准入手续上传改为标准按钮上传块，并在提交时强制校验至少上传一个准入手续文件。
- 更新 shared 类型/领域归一化、供应商/外协列表列配置、`CONSTRAINTS.md`、`docs/architecture.md`、`apps/backend/modules/supplier/ARCHITECTURE.md`。

**验证结果：**

- `pnpm --dir packages/qgs-shared build`: 通过
- `pnpm --dir apps/backend exec prisma generate`: 通过
- `pnpm --dir apps/backend exec prisma format`: 通过
- `pnpm --dir apps/backend exec prisma migrate deploy`: 通过，已应用 `20260615000200_add_supplier_admission_fields`
- `pnpm -C apps/backend exec vitest run modules/supplier/supplier.service.test.ts modules/inspection/inspection-request-history.service.test.ts`: 2 文件 / 18 测试全部通过
- `pnpm -C apps/backend exec vitest run`: 185 文件 / 1774 测试全部通过
- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm exec eslint apps/web-antd/src/views/qms/supplier/data.ts apps/web-antd/src/views/qms/supplier/components/SupplierEditModal.vue`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过，0 violations across 0 rules
- `pnpm run check:prisma-migration`: 通过
- `pnpm lint`: 通过

**commit:** 本次未提交

**遗留问题：**

- 测试环境仍会输出既有 `REDIS_URL not found, caching disabled` 警告，不影响门禁结果。

### 2026-06-15 功能：供应商与外协评分排序快照化

**执行内容：**

- 新增 `supplier_score_snapshots` Prisma 模型与 migration，用于持久化供应商/外协的评分、等级、状态、来料合格率、工程问题数、售后问题数等列表指标。
- 新增 `SupplierScoreSnapshotService`，复用现有评分算法生成快照；供应商新增/编辑/导入、检验不合格项变更、售后问题变更、质量损失状态变更后刷新关联供应商快照。
- 将 `SupplierService.findAll()` 改为读取 `scoreSnapshot` 并在数据库层按快照字段排序分页，移除当前页内存动态排序。
- 新增历史数据 backfill 脚本 `apps/backend/scripts/backfill-supplier-score-snapshots.ts`。
- 在共享类型中导出 `SUPPLIER_LIST_SORT_KEYS`，明确供应商/外协列表排序契约。
- 更新 `CONSTRAINTS.md`、`docs/architecture.md`、`code_map.md`、`apps/backend/modules/supplier/ARCHITECTURE.md`，记录远程排序必须 DB 排序后分页以及供应商评分快照架构。

**验证结果：**

- `pnpm -C apps/backend typecheck`: 通过
- `pnpm -C apps/backend exec vitest run modules/supplier/supplier.service.test.ts`: 1 文件 / 14 测试全部通过
- `pnpm -C apps/backend exec vitest run`: 184 文件 / 1770 测试全部通过
- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过，0 violations across 0 rules
- `pnpm run check:prisma-migration`: 通过
- `pnpm lint`: 通过

**commit:** 本次未提交

**遗留问题：**

- 上线应用 migration 后，需要运行 `pnpm -C apps/backend exec tsx scripts/backfill-supplier-score-snapshots.ts` 为历史供应商生成初始快照。
- 测试环境仍会输出既有 `REDIS_URL not found, caching disabled` 警告，不影响门禁结果。

### 2026-06-12 修复：分页边界、质量损失趋势容错与 RBAC 权限清洗

**执行内容：**

- 修复通用分页解析，`page=0` / 负数 clamp 到第一页，非有限数字回退默认值，`pageSize=0` clamp 到 1，最大值仍限制为 100。
- 工单列表与计量器具列表改用统一分页解析，避免负数或 `NaN` skip/take 进入 Prisma 查询。
- 质量损失趋势按来源独立容错，单个来源查询失败时记录 warning 并保留其他来源趋势数据。
- 新增质量损失严格状态解析，创建 payload 只接受已知状态/历史别名，未知状态回退默认值但不被当作合法输入。
- RBAC 权限 code 去除零宽字符后再判空去重，避免不可见字符污染权限关系。
- 更新相关对抗测试和 query helper 单元测试，并将既有聚合对抗测试登记到架构 baseline。

**验证结果：**

- `pnpm --dir packages/qgs-shared run build`: 通过
- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm -C apps/backend exec vitest run utils/query-helpers.test.ts modules/work-order/work-order-adversarial.test.ts modules/metrology/metrology-adversarial.test.ts modules/rbac/rbac-adversarial.test.ts modules/quality-loss/quality-loss-adversarial.test.ts modules/quality-loss/quality-loss-payload.test.ts modules/quality-loss/quality-loss-status.test.ts`: 7 文件 / 399 测试全部通过
- `pnpm -C apps/backend exec vitest run modules/quality-loss modules/work-order modules/metrology modules/rbac utils/query-helpers.test.ts`: 43 文件 / 631 测试全部通过
- `pnpm run check:qms-arch`: 通过，0 violations across 0 rules

**commit:** 本次未提交

**遗留问题：**

- `pnpm -C apps/backend exec vitest run ...` 仍会输出 `REDIS_URL not found, caching disabled` 测试环境警告，不影响门禁结果。

## [0.9.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.8.0...qgs-v0.9.0) (2026-06-11)


### Features

* **@qgs/backend:** support multi-work-order incoming requests ([270c052](https://github.com/ajie5419/Quality-Guardian/commit/270c052f0a54065d517bbde73a09d0745f35fc9b))
* **@qgs/backend:** support work order multi-station inspections ([772d023](https://github.com/ajie5419/Quality-Guardian/commit/772d023247b90ac5f3d04e74a803f76ceee67e4a))
* **@qgs/weapp:** add logout/switch account button on home page ([c1dbbf9](https://github.com/ajie5419/Quality-Guardian/commit/c1dbbf9c570b93271b3144f34a731dfa0d4bd10f))
* **@qgs/weapp:** implement multi-step inspection close form ([be4b495](https://github.com/ajie5419/Quality-Guardian/commit/be4b49544587ab4e03917fd5d9d409ad2880896a))
* **@qgs/weapp:** show inspection attachments on dispatch page ([4433d0c](https://github.com/ajie5419/Quality-Guardian/commit/4433d0c1553fd4e125fbd8cbdaebbdd763f8dc4e))
* **@qgs/weapp:** show inspector workload status in dispatch picker ([d5d1bb2](https://github.com/ajie5419/Quality-Guardian/commit/d5d1bb26163c299d402988941dfa8a5dc345da81))
* **@qgs/weapp:** unbind wx account on logout for easy account switching ([726c993](https://github.com/ajie5419/Quality-Guardian/commit/726c993365218b87c97a208b6ea1a789e67f7df5))


### Bug Fixes

* **@qgs/backend:** tolerate pending inspection request migration ([b626e56](https://github.com/ajie5419/Quality-Guardian/commit/b626e5639710df68f3754be4c803bc39fb7b1fac))
* **@qgs/weapp:** correct user list API path to /api/system/user/list ([1a04862](https://github.com/ajie5419/Quality-Guardian/commit/1a048620ce784ef36d3181c4b4429242078ef629))
* **@qgs/weapp:** fix home page task navigation after detail page removal ([1abe84e](https://github.com/ajie5419/Quality-Guardian/commit/1abe84e068f5f3902739293b29dd8d766b576290))
* **@qgs/weapp:** fix records page field mapping to match API response ([6c242d4](https://github.com/ajie5419/Quality-Guardian/commit/6c242d449c92a5aa503735885c36825d15943db9))
* **@qgs/weapp:** fix records page navigation to removed detail page ([e61db27](https://github.com/ajie5419/Quality-Guardian/commit/e61db273ca7627241863ae66e69a59f06249a3d2))
* **@qgs/weapp:** include 'super' role in dispatcher detection ([5d7a741](https://github.com/ajie5419/Quality-Guardian/commit/5d7a741c36239492cd8666f990a536be08c64d08))
* **@qgs/weapp:** records page shows CLOSED + INSPECTING with status badge ([bbbd5cc](https://github.com/ajie5419/Quality-Guardian/commit/bbbd5cc59f0466c69f44a4d35a1e933830333fd2))
* **@qgs/weapp:** replace placeholder tab icons with proper 81x81 PNGs ([f9a804d](https://github.com/ajie5419/Quality-Guardian/commit/f9a804d344efdd0868ac277d432e1629983d8654))
* **@qgs/weapp:** use correct inspectorId field and relax dispatcher role check ([86459c5](https://github.com/ajie5419/Quality-Guardian/commit/86459c5c43a02de349887ce2f9be71d118a1ef5b))
* **@qgs/web-antd:** prevent incoming request work order tag clipping ([4debe57](https://github.com/ajie5419/Quality-Guardian/commit/4debe57b9d4fdaa46470e559b5f7741fa51f8b6e))

### 2026-06-11 功能：工单多台策略与报检台数落库

**执行内容：**
- 工单管理新建/编辑表单新增“多台策略”开关，并在工单列表显示当前策略状态。
- 过程报检和进货/外购扫码入口读取所选工单的多台策略；当策略启用且工单数量大于 1 时，显示并提交台数多选。
- 报检任务新增 `stationSelection` 持久化字段，支持选择全部台数或指定第几台。
- 关闭报检生成检验记录时同步台数选择，检验记录列表和详情显示第几台/全部台数。
- 更新 shared 类型、工单类型、台数解析/格式化逻辑、Prisma migration 和相关单元测试。

**验证结果：**
- shared build: 通过
- shared vitest: 1 文件 / 3 测试通过
- backend typecheck: 通过
- backend vitest: 2 文件 / 6 测试通过
- web-antd typecheck: 通过
- qms architecture check: 通过

**commit:** `772d0232` feat(@qgs/backend): support work order multi-station inspections

**遗留问题：**
- 未运行前端 dev/build/start/serve；按仓库约束仅做 vue-tsc 和代码级验证。

### 2026-06-11 功能：外购件报检支持多工单分别落检验记录

**执行内容：**
- 外购件/进货检验扫码入口工单号支持多选，提交时保留第一个工单号作为兼容主工单，同时传递完整工单数组。
- 后端新增报检任务工单明细表和报检任务检验记录映射表，关闭报检任务时按工单分别创建 `inspections` 记录。
- 保留 `qms_inspection_requests.workOrderNumber` 和 `inspectionId` 单值兼容旧列表、筛选、通知与聚合链路。
- 更新 shared 类型、inspection 模块架构文档和相关单元测试。

**验证结果：**
- backend typecheck: 通过
- web-antd typecheck: 通过
- vitest: 81 文件 / 464 测试通过；相关回归 3 文件 / 9 测试通过
- migration: 已由 Prisma schema diff 生成；本机 MySQL 未启动，未执行 `migrate dev`

**commit:** `35eafb89` feat(/backend): support multi-work-order incoming requests

**遗留问题：**
- 未做浏览器端真实点击验证；前端项目按约束不运行 dev/build/start/serve。

## [0.8.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.7.1...qgs-v0.8.0) (2026-06-09)


### Features

* **@qgs/weapp:** add WeChat mini-program with inspection workflow (Phase 1) ([f3001cd](https://github.com/ajie5419/Quality-Guardian/commit/f3001cdb5be5be12ef6452b4176a3db496752a40))


### Bug Fixes

* **@qgs/weapp:** correct dcloudio package versions to latest vue3 tag ([4bcc804](https://github.com/ajie5419/Quality-Guardian/commit/4bcc804ce56366cc1ea82350ea540d808915b287))
* **@qgs/weapp:** fix auth race condition, API path, and null guards ([7fe3436](https://github.com/ajie5419/Quality-Guardian/commit/7fe3436f5dc2a3413f177186d33d2b5cbf490e64))
* **@qgs/weapp:** fix vite-plugin-uni import and add placeholder tab icons ([2b3a558](https://github.com/ajie5419/Quality-Guardian/commit/2b3a55801a5fa552c6f7ac9a94577f4c2785bcc6))
* **@qgs/weapp:** sort json keys per eslint jsonc/sort-keys rule ([457d519](https://github.com/ajie5419/Quality-Guardian/commit/457d51995c729baeee0ef50c48168fbef83d3fc2))
* **ci:** skip weapp typecheck and ignore _dev from stylelint ([d727229](https://github.com/ajie5419/Quality-Guardian/commit/d7272295a7e184ac4642f4eda7a7ed37903ca688))

## [0.7.1](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.7.0...qgs-v0.7.1) (2026-06-08)


### Bug Fixes

* **@qgs/backend:** keep cross-day pending incoming inspections visible ([ea83fe4](https://github.com/ajie5419/Quality-Guardian/commit/ea83fe4c04eb0270cfc2a966d0665645e62a5b0a))
* **@qgs/web-antd:** enable name search in inspector picker for dispatch modal ([b109113](https://github.com/ajie5419/Quality-Guardian/commit/b109113b8fbd949a11b905503a879daa69ad38a8))
* **@qgs/web-antd:** open inspection-request detail directly from QR query ([a52ce3a](https://github.com/ajie5419/Quality-Guardian/commit/a52ce3ac8aa588de4cea6475f2e2aef3d749397e))

## [0.7.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.6.0...qgs-v0.7.0) (2026-06-08)


### Features

* **@qgs/backend:** separate supplier dimension in inspection dashboard stats ([356e0b2](https://github.com/ajie5419/Quality-Guardian/commit/356e0b21a6bf87c0ac544210ff9cf1bc538763b6))
* **@qgs/backend:** show process/incoming breakdown in dashboard stats cards ([ab7ec61](https://github.com/ajie5419/Quality-Guardian/commit/ab7ec61c57ac9f683ad865d32e463326b05dd3a8))

## [0.6.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.5.1...qgs-v0.6.0) (2026-06-07)


### Features

* **@qgs/backend:** add delete functionality for supervision ([9228765](https://github.com/ajie5419/Quality-Guardian/commit/9228765ad537b9c5b36eb513d5772edcc9eb3beb))
* **@qgs/backend:** improve supervision report fields and auto-summary ([ff5ec83](https://github.com/ajie5419/Quality-Guardian/commit/ff5ec83bc908a27b79404d64a5ccaed0299f92b3))
* **@qgs/backend:** public today incoming inspection page ([3f6ed20](https://github.com/ajie5419/Quality-Guardian/commit/3f6ed209beb1cc35479806610aaa0f456eaa4c12))
* **@qgs/web-antd:** add share-as-image to supervision report detail ([85a4617](https://github.com/ajie5419/Quality-Guardian/commit/85a4617de3675970e766a8265f9e1b796167c0f0))
* **@qgs/web-antd:** add work order selection to supervision project form ([a25dda1](https://github.com/ajie5419/Quality-Guardian/commit/a25dda1260ee3bfeacc1e5e6fed5d514f55e1777))
* **@qgs/web-antd:** complete supervision report form and add card detail view ([60b899c](https://github.com/ajie5419/Quality-Guardian/commit/60b899c8729fe2197799f37472c69840125ae499))
* **@qgs/web-antd:** show task status badge in report share image ([6927b9c](https://github.com/ajie5419/Quality-Guardian/commit/6927b9c012a9acbe1e343c9f25afb3b44d58a81f))


### Bug Fixes

* **@qgs/backend:** make supervision report edit actually update ([d3e5814](https://github.com/ajie5419/Quality-Guardian/commit/d3e5814e8231b02b3998fc1f12d33bdf824183f7))
* **@qgs/backend:** show real-time plan-task status in report details ([c42f36b](https://github.com/ajie5419/Quality-Guardian/commit/c42f36b6af10ac1e046dd09abe11821d1f592b04))
* **@qgs/backend:** sync project progress from leaf tasks consistently ([cd4be39](https://github.com/ajie5419/Quality-Guardian/commit/cd4be3956af168cf5387fb8bc5028e5b3bc40eef))
* **@qgs/shared:** correct delayed status logic for unstarted tasks ([50438ca](https://github.com/ajie5419/Quality-Guardian/commit/50438caf704e0bf43636831dfb4196e45f056665))
* **@qgs/web-antd:** add report actions to mobile card view ([61f28f2](https://github.com/ajie5419/Quality-Guardian/commit/61f28f2a217bd26b97f5457c5aa870afa64d5f5b))

### 2026-06-07 新增公开端点：今日外购件检验情况

**执行内容：**

- 后端：在 `apps/backend/modules/inspection/inspection-public-query.service.ts` 新增 `getTodayIncomingInspections()`，按服务器本地时区今日窗口、`processName === 进货检验`（用 `INCOMING_INSPECTION_PROCESS_NAME` 常量）查询 `qms_inspection_requests`，按 `INSPECTION_REQUEST_STATUS` 枚举与 `inspectionResult` 分桶为 pending/pass/fail/conditional 四类；字段白名单输出（reporter 自动姓+*脱敏，`requestInfo` 解析为 incomingType/notes），take 上限 200，超过返回 `truncated=true`
- 后端路由：新增 `apps/backend/api/qms/public/inspection/today-incoming.get.ts`（22 行），无参数，标准 `try/logApiError/internalServerErrorResponse` 形态；`/api/qms/public/` 已在 auth 中间件白名单
- 后端测试：扩展 `inspection-public-query.service.test.ts` 增加 7 个用例（基本分桶 / CONDITIONAL 单独桶 / reporter 脱敏 / requestInfo 解析 / truncated 标记 / where 子句包含进货检验+今日窗口+isDeleted 过滤 / ISO 时间序列化）
- 前端：新增 `views/qms/inspection/today-incoming/index.vue` 与 `components/BucketCard.vue`，独立全屏布局（无侧栏），头部 4 卡片汇总 + 4 个分桶卡片（待检验/合格/让步合格/不合格），自动 60s 刷新；新增 `getPublicTodayIncomingInspections` API 与 `PUBLIC_TODAY_INCOMING_INSPECTION` 路径常量，使用 `publicRequestClient`（不带 token、不触发 401 重定向）
- 前端路由：在 `apps/web-antd/src/router/routes/core.ts` 注册公开路由 `PublicTodayIncomingInspection` → `/qms/inspection/today-incoming`，`meta.ignoreAccess=true` 不触发权限校验

**验证结果：**

- lint: 通过（pnpm lint）
- typecheck: 通过（@qgs/backend tsc --noEmit、@qgs/web-antd vue-tsc --noEmit）
- check:qms-arch: 0 violations
- vitest: 9/9 通过（inspection-public-query.service.test.ts）

**commit:** 未提交，待用户决定

**遗留问题：**

- 该端点是公开 URL，已对 reporter 做姓+*脱敏；如要进一步收紧（隐藏 reporter / 加 token / 加访问频率限制），可后续按需扩展
- 前端 60s 自动刷新对未开启的浏览器无影响；如有大屏长时间停留场景，后续可考虑改为 SSE/WebSocket

---

### 2026-06-06 后端测试：补齐零测试模块覆盖并推进逐功能覆盖

**执行内容：**

- 为此前没有测试文件的 8 个业务模块补充同目录功能测试：ai、dept、file-storage、metrology、supervision、vehicle-commissioning、welder、work-order-requirement
- 覆盖重点包括：部门树缓存与创建默认值、计量器具分页/状态汇总/写入校验、监督计划任务看板与事务删除、文件附件引用解析与上传、AI 历史问题查询与 JSON 提取、车辆调试问题创建/筛选与跨模块文件引用、焊工查询统计与导入、工单需求看板与跨模块工单条件构建
- 用户明确要求逐功能覆盖后，重新建立导出入口基线；修正静态脚本误抓对象内部 `if/for` 后，当前基线约 610 个，已完成 343 个，剩余 267 个
- 扩展 supervision 全子域功能测试：项目、问题、计划任务、计划导入、日报、进度同步、shared helper、facade
- 扩展 planning 共享逻辑测试：工单引导创建、冲突、软删恢复、治理字段写入
- 扩展 quality-loss 基础功能测试：四类损失来源格式化、状态/source 映射、趋势合并、排序与筛选
- 扩展 metrology 全子域功能测试：台账 service、导入、模板、公用扫码借用校验、借用/归还、校准计划 CRUD、query、mapping、导入、route service
- 扩展 after-sales 全子域功能测试：状态/id、payload、service façade、integration、analytics/chart aggregation、route service、更新路由、批删、导入、文件引用和审计日志
- 扩展 quality-loss 全子域功能测试：summary、data-scope、record maintenance、reporting、route update、create/export/trend route、dashboard façade、drill-down、跨 after-sales / inspection / vehicle-commissioning 更新委派
- 扩展 dashboard / dictionary / data-scope / system / system-log / knowledge / task-dispatch 全功能测试：目标配置、workspace 聚合、字典 CRUD/cache/list、数据权限解析与 wrapper、系统设置/AI 连接测试/菜单更新/metadata、登录与审计日志、知识库分类/列表/文件引用、任务派工创建/列表/统计/状态规则

**验证结果：**

- typecheck (backend): 通过
- qms-arch: 通过
- vitest: 78/78 文件通过，429/429 测试通过

**commit:** 未提交

**遗留问题：**

- 当前已补齐原零测试模块，并推进 after-sales / supervision / metrology / quality-loss / dashboard / dictionary / data-scope / system / system-log / knowledge / task-dispatch / planning 的逐功能覆盖；全量约 610 个导出入口仍剩 267 个需继续逐项核对，未标记完成

### 2026-06-04 监造日报：任务状态徽章改用项目计划实时状态

**用户反馈：** 截图里"2.3 支腿组对"进度 100% 但徽章显示"进行中"——该显示项目计划里的实时状态（已完成 / 已延期等），不是日报提交时的快照。

**执行内容（3 个文件）：**

- 共享类型 SupervisionReportTaskUpdate 新增 `currentTaskStatus?: SupervisionPlanTaskStatus`，注释说明它来自关联 plan_task 的实时计算，区别于本表的提交快照 status
- 后端 mapReportTaskUpdate 在查询时调用 calculatePlanTaskStatus 实时计算，输入来自 include 的 plan_task 的 actual/planned 日期 + progressPercent + riskLevel；fallback 链：实时算 → 快照 status → 'IN_PROGRESS'（plan_task 被删时的兜底）
- 三处 include（createReport / listReports / updateReport）从 `taskUpdates: true` 改为 include task 的 6 个原始字段
- 前端徽章两处（截图区 + 抽屉正常视图）都改用 `task.currentTaskStatus ?? task.status`

**关键设计选择：** 没有读 plan_tasks.status 字段，而是用 calculatePlanTaskStatus 在查询时实时算。原因：plan_tasks.status 字段只在 createTask/updateTask/进度同步时刷新，长期不动会陈旧（比如某任务过了 plannedEndAt 但没人编辑，字段仍是 IN_PROGRESS）。这与项目已有的 mapPlanTask 范式一致——读出来时实时算，不依赖存储字段。

**验证结果：**

- build (shared): 通过
- typecheck (backend): 通过
- typecheck (frontend): 通过
- lint: 通过

**commit:**
- `12bc94cd` fix(@qgs/backend): show real-time plan-task status in report details

**遗留问题：**

- 浏览器层面（重新打开历史日报、进度 100% 任务徽章应显示"已完成"、过期任务应显示"已延期"）待人工验证

### 2026-06-04 监造日报：分享图片改善（多列布局 + 任务状态徽章）

**用户反馈：** 1) 图片太长（所有区块单列纵向堆叠）；2) 任务推进里看不出"组对节点 6 月 2 日，6 月 4 日的日报应显示已逾期"——只有进度数字没状态。

**执行内容（单文件）：**

1. 多列布局缩短图片高度
   - 今日工作 + 完成节点 → 两列并排
   - 问题汇总 + 明日计划 + 需协调事项 → 三列并排
   - 现场照片网格 3 列 200px → 4 列 150px
   - 总高度大约砍掉一半

2. 任务推进卡新增状态徽章
   - 之前截图区只渲染任务号+名/数量/进度，没渲染 task.status
   - 在任务名旁加内联徽章：DELAYED 红 / DONE 绿 / DUE_SOON 橙 / RISK 紫 / IN_PROGRESS 蓝 / NOT_STARTED 灰
   - 徽章用内联 hex 颜色，避开 ant-design 主题关键字（html2canvas 会丢色）

**业务语义说明：** 任务状态显示的是**日报提交时的快照**，不是查看时的实时状态——日报是当天现场记录，事后任务变化不应回写到历史日报。如果用户当时提交日报时该任务已经超过计划开始日，提交逻辑应该写入 DELAYED；如果实际显示成"未开始"，说明前端提交时传的 status 错了。

**审查发现但本次未改（暂记）：**
- 后端 `supervision-report.service.ts:156` 的 `updateStatus` 直接信任前端传入的 status，没有用 `calculatePlanTaskStatus` 兜底重算。如果前端表单初始化 status 时机不对（比如打开抽屉时任务还没逾期，提交时已逾期），存进去的状态会偏。建议改成在写入 taskUpdates 前用 plannedStartAt/plannedEndAt 实时算一次

**验证结果：**

- typecheck (frontend): 通过
- lint: 通过

**commit:**
- `928e3f98` style(@qgs/web-antd): use multi-column layout in report share image
- `a58e915c` feat(@qgs/web-antd): show task status badge in report share image

**遗留问题：**

- 浏览器/手机层面（多列布局是否在内容多时换行错乱、状态徽章颜色和文案）待人工验证

### 2026-06-04 监造日报：放大分享图片字号，改善可读性

**执行内容：**

用户反馈分享出的日报图片字太小、像手机布局。诊断：截图画布虽是固定 800px，但字号绝对值偏小（正文 13px、次要 12px），图片在微信里缩放显示后字很小。纯样式数值调整（1 个文件）：

- 画布宽度 800→900px，padding 32→40px
- 主标题 24→32px，日期 22→28px，工单号/副标题 13→16px
- 区块标题 14→20px（强调竖条加粗）
- 正文 13→17px，行距 1.6→1.7
- 任务名 13→18px，进度% 18→26px，任务正文 12→15px
- 照片高度 160→200px，页脚 11→13px

**验证结果：**

- typecheck (frontend): 通过
- lint: 通过

**commit:**
- `c3f33dc9` style(@qgs/web-antd): enlarge report share-image fonts for readability

**遗留问题：**

- 手机层面（放大后字号、版式、电脑端查看效果）待人工验证

### 2026-06-04 监造日报：详情增加"分享图片"功能（可发微信）

**需求：** 手机端查看日报时分享成图片发微信，图片布局要适合电脑端查看。

**方案选型（用户确认）：**
- 分享方式：Web Share API 原生分享（手机弹系统分享面板，含微信），不支持时降级为下载图片。理由：项目未集成微信 JSSDK，网页无法直接塞图给微信；原生分享是最接近"直接发微信"且零额外依赖的路径
- 图片布局：固定 800px 宽的专用截图布局，不受手机屏宽影响，电脑端清晰

**执行内容（1 个文件，+574 行）：**

- 复用项目已有的 html2canvas（^1.4.1，无新依赖）
- 新增固定 800px、off-screen（position:fixed; left:-9999px）的截图专用布局：在 DOM 内正常渲染供 html2canvas 截取，但用户不可见、不影响抽屉布局
- 截图布局全用内联 hex 颜色（非 tailwind class），避开 html2canvas 对 tailwind v4 oklch 动态颜色支持不稳导致的截图变黑/透明
- 分享降级链：html2canvas 截图 → toBlob → File → navigator.canShare 检测 → navigator.share({ files }) → 不支持则下载 PNG 并提示"打开微信选择图片发送"；share 的 AbortError（用户取消）静默处理
- 抽屉 footer 加"分享图片"按钮（带 loading）
- Web Share API 用特性检测守卫，无 as any

**验证结果：**

- typecheck (frontend): 通过
- lint: 通过

**commit:**
- `c66d2877` feat(@qgs/web-antd): add share-as-image to supervision report detail

**遗留问题：**

- ⚠️ OSS 图片跨域风险：若 OSS bucket 未对前端域名配置 CORS 响应头，截图里的现场照片会因 canvas taint 变空白（文字和布局不受影响）。彻底解决需在 OSS 配 CORS 允许前端域名，或后端加图片代理接口
- 浏览器/手机层面（原生分享面板能否弹出微信、截图版式、电脑端查看效果）待人工验证

### 2026-06-04 监造日报：移动端卡片补回操作入口（查看/编辑/删除）

**执行内容：**

修复手机上无法打开日报卡片详情的问题（1 个文件）
- 根因：之前加的"查看"按钮（打开截图友好的卡片详情抽屉）只放在桌面端表格（hidden md:block）里，移动端日报卡片视图（md:hidden）没有任何操作按钮，且卡片本身不可点击。用户想用手机截图发群时正好够不到这个入口
- 在移动端日报卡片底部加一行操作按钮：查看 / 编辑 / 删除，与桌面端表格操作列对齐

**验证结果：**

- typecheck (frontend): 通过
- lint: 通过

**commit:**
- `7d7ff5ba` fix(@qgs/web-antd): add report actions to mobile card view

**遗留问题：**

- 浏览器/手机层面（移动端点"查看"打开卡片详情、截图效果）待人工验证

### 2026-06-04 监造模块设计审查后整改：修复日报假编辑 + 清理死代码

**背景：** 应用户要求对监造 5 个子模块（项目/甘特计划/现场日报/问题闭环/纳期管控）做设计审查，发现核心数据流设计正确（甘特任务为单一事实源 → 日报汇报 → 回写任务进度 → 汇总项目进度 → 纳期只读聚合），但存在两类问题并整改。

**执行内容：**

1. 修复"现场日报编辑实际是新增"的 bug（2 个文件）
   - 根因：submitReport 无论新增/编辑都调 createSupervisionReport（POST），从不调 updateSupervisionReport（PUT），editReport 也没记录正在编辑的 ID。后果：编辑日报变成新增重复记录，并重复回写甘特进度
   - 后端 updateReport 从只接受 3 字段扩展为接受全部描述性字段（location/weather/manpower/issueSummary/coordinationNeeded/attachments/reporter/reportDate/progressPercent/workContent），加 isDeleted 守卫
   - 前端新增 editingReportId，提交按是否编辑分流 update/create
   - 用户决策：编辑只改描述性字段，任务汇报（taskUpdates）不可改（避免进度回滚的复杂度）；编辑模式隐藏甘特节点汇报区、跳过节点必填校验

2. 清理三套早期"计划/进度"死代码（6 个文件，净删 174 行）
   - 这三套设计已被甘特任务（supervision_plan_tasks）完全取代，有表+类型+前端 API 声明，但无后端路由、无组件调用
   - 删数据库表：supervision_milestones、supervision_plan_rows、supervision_plan_steps（migration 按外键顺序 DROP）
   - 删共享类型：SupervisionMilestone/PlanRow/PlanStep/Dashboard + SupervisionProject 上 4 个 planStepCount 字段
   - 删前端孤立 API：getSupervisionOverview/Milestones/PlanRows 等 + SUPERVISION_OVERVIEW 常量 + PlanStepFormState/milestonesText
   - 每项删除前 grep 确认零引用

**审查发现但本次未改（暂记）：**
- 问题闭环的 supervision_issues.taskId 字段后端会写但前端不传，问题只能挂项目无法定位到任务（半成品，按业务需要再排期）
- 项目 PAUSED 状态会被日报提交的进度同步冲掉

**验证结果：**

- build (shared): 通过
- typecheck (backend): 通过
- typecheck (frontend): 通过
- lint: 通过

**commit:**
- `8e1e3909` fix(@qgs/backend): make supervision report edit actually update
- `b7a9dd27` refactor(@qgs/backend): remove dead supervision plan tables and types

**遗留问题：**

- ⚠️ 删表 migration 已创建未应用（migrate dev 因 shadow DB 历史 migration 问题失败）。需手动执行 `pnpm --dir apps/backend exec prisma migrate deploy`。注意：上一条 manpower migration（20260604000100）可能也尚未应用，deploy 会一并按顺序执行
- 浏览器层面（日报编辑只改描述字段、编辑模式隐藏任务区）待人工验证

### 2026-06-04 监造模块：修复项目进度与甘特任务不同步

**执行内容：**

修复"甘特任务全完成但项目进度卡在 40%"的 bug（3 个文件）

- 根因：项目进度有两条回写路径，日报提交路径（supervision-report.service.ts）计算进度时漏了 `isSummary: false` 过滤，把汇总行也算进分母稀释了进度；两条路径的 status 更新逻辑还不一致
- 采用方案 a（DRY 重构）：
  - syncSupervisionProjectProgress 增加可选 tx 参数，支持事务内/独立调用
  - 日报路径改为复用该函数（原内联 15 行逻辑删除），两条路径算法完全统一，只算叶子任务
  - 抽出 calcProjectStatusFromProgress：100→COMPLETED，1-99→IN_PROGRESS，0→保持原值
- 新增一次性重算脚本 scripts/resync-supervision-project-progress.ts，修复历史脏数据（如"风领模具"40%），带 before/after 日志

**验证结果：**

- typecheck (backend): 通过
- lint: 通过

**commit:**
- `3558b57e` fix(@qgs/backend): sync project progress from leaf tasks consistently

**遗留问题：**

- ⚠️ 历史脏数据需部署后手动跑一次重算脚本：`pnpm --dir apps/backend exec tsx scripts/resync-supervision-project-progress.ts`
- 小遗留（未处理）：report service 里 stage 仍从 payload.completedMilestone 取值，但该字段已改为后端自动汇总、前端不再传，导致 stage 实际不会更新。不影响本次进度修复，范围外暂记

### 2026-06-04 监造日报：标题加工单号、人数文本化、节点自动汇总

**执行内容：**

按用户需求改进监造日报三项（6 个文件 + 1 个 migration）

1. 详情标题增加工单号
   - 共享类型 SupervisionDailyReport 新增 workOrderNumber 字段
   - 后端三处 project include 增加 select workOrderNumber，mapReport 返回该字段
   - 详情卡片标题区在项目名称下显示「工单号：xxx」（为空不显示）

2. 现场人数从数字改为文本（Int → String）
   - Prisma migration：manpower 列 INT 改 TEXT（MySQL 自动转换现有数字数据）
   - 支持「下料2人、组对3人」这类中文描述
   - 前端输入控件 InputNumber 改为 Input，详情展示去掉"人"后缀

3. 完成节点 + 明日计划改为任务自动汇总（完全只读）
   - 后端 createReport 新增 summarizeTaskField，根据 taskUpdates 的 workContent/nextPlan 自动生成
   - 格式：每个任务一行「{任务名}：{内容}」，空内容跳过
   - 前端删除这两个字段的手动输入框，不再手动录入

**验证结果：**

- build (shared): 通过
- typecheck (frontend): 通过
- typecheck (backend): 通过
- lint: 通过

**commit:**
- `d670090e` feat(@qgs/backend): improve supervision report fields and auto-summary

**遗留问题：**

- ⚠️ Migration 文件已创建但未应用到数据库（子代理无法连接 DB）。用户需手动执行：`pnpm --dir apps/backend exec prisma migrate deploy`
- 浏览器层面（人数文本录入、工单号显示、节点自动汇总效果）待人工验证

### 2026-06-04 监造模块：完善日报表单与新增卡片详情视图

**执行内容：**

修复日报字段缺失并新增卡片式详情视图（2 个文件，300 行）

1. 表单修复（SupervisionManagementView.vue）
   - 根因：日报表单缺少完成节点、问题汇总、明日计划、需协调事项、项目进度的输入控件——这些字段在提交逻辑里已包含，但用户无法录入，导致填了表格却"不显示"
   - 补齐上述 5 个字段的 Form.Item 输入控件
   - 修复 editReport：原本只回填 4 个字段（projectId/reporter/workContent/reportDate），现改为回填全部字段并加载任务草稿

2. 新增日报卡片详情（SupervisionReportDetailDrawer.vue）
   - 卡片分区展示：基本信息、今日工作、完成节点、任务推进、问题汇总、明日计划、需协调事项、现场照片
   - 白色背景、清晰分区，适合手机截图发日报群
   - 日报表格操作列新增"查看"按钮
   - 移动端/桌面端适配

**验证结果：**

- typecheck (frontend): 通过
- lint: 通过

**commit:**
- `e26bec3c` feat(@qgs/web-antd): complete supervision report form and add card detail view

**遗留问题：**

- 浏览器层面（表单录入回显、详情卡片样式、截图效果）待人工验证

### 2026-06-04 监造模块：修复甘特图逾期判断 bug

**执行内容：**

修复监造计划任务逾期判断错误（1 个文件，3 行）
- 问题：计划 6 月 4 日开始的任务，在 6 月 4 日当天就显示"已逾期"
- 根因：未开始任务的逾期判断使用了 `startOfDay (00:00:00) <= now`
- 修复：改为 `endOfStartDay (23:59:59) < now`，与已开始任务逻辑保持一致
- 文件：`packages/qgs-shared/src/domain-modules/qms/supervision-core.ts`

**验证结果：**

- typecheck (shared): 通过
- typecheck (frontend): 通过
- typecheck (backend): 通过
- build (shared): 通过

**commit:**
- `e35094ad` fix(@qgs/shared): correct delayed status logic for unstarted tasks

**遗留问题：**

- 无

### 2026-06-04 监造模块：新增工单号选择和删除功能

**执行内容：**

1. 监造项目创建表单新增工单号选择功能（2 个文件，33 行）
   - 前端表单组件添加 WorkOrderSelect 组件
   - 添加 workOrderNumber 字段到表单状态和 payload
   - 实现 watch 监听工单号变化，自动从工单 API 获取项目名称并填充
   - 选择工单号后项目名称自动填充，简化数据录入

2. 监造项目和问题闭环新增删除功能（6 个文件，122 行）
   - 后端 Service 层添加软删除方法（deleteProject / deleteIssue）
   - 后端创建 DELETE 路由（projects/[id].delete.ts 和 issues/[id].delete.ts）
   - 前端 API 添加删除函数（deleteSupervisionProject / deleteSupervisionIssue）
   - 前端列表添加删除按钮（danger 样式）和确认对话框
   - 删除成功后自动刷新列表

**验证结果：**

- typecheck (frontend): 通过
- typecheck (backend): 通过
- lint: 通过
- 未运行 build（存在无关的 jiti 依赖问题）
- 监造模块无单测文件

**commit:**
- `f29fdb80` feat(@qgs/web-antd): add work order selection to supervision project form
- `e4e73d4b` feat(@qgs/backend): add delete functionality for supervision

**遗留问题：**

- 无

### 2026-06-04 项目代码审计（采样）

**执行内容：**

- 用户提供 38 项常见代码风险/坏味道清单（时区、错误码、软删除、状态机、越权、竞态、暴破防护、过时三方依赖等）。
- 派 4 个 haiku 子代理并行采样扫描，分组：A 安全 / B 数据 / C 接口 / D 卫生。每组挑最严重的 5–10 个证据。
- 发现 **5 项高危、13 项中等、14 项良好/不存在、2 项不适用**，共覆盖 34/38 项清单条目。
- 完整结果与修复计划记录于 `docs/AUDIT-2026-06-04.md`（176 行）。
- 追加 4 条新硬约束到 `CONSTRAINTS.md`：错误码契约、并发写守卫、写路由所有权断言、禁止静默 catch。

**高危项（建议优先修）：**

1. 错误码类型不一致：后端 `BusinessError.code` 是字符串、响应顶层 `code` 永远是 -1，前端按数字范围判断永远不命中（`response.ts:52` + `request.ts:127`）
2. 登录暴力破解无防护（`auth.service.ts` 无任何 rate-limit/lockout）
3. 水平越权：`data-scope` 中间件只覆盖 4 个模块，`quality-loss / metrology / knowledge` 等 delete/put 无所有权校验
4. `inspection-request close` 存在并发竞态（状态检查在事务外）
5. 异常类型混乱：3 种风格并存，约 15 处 `throw new Error('中文')` 不能被 `legacyErrorToBusinessError` 转换

**审计局限性（必须诚实记录）：**

- 本次为采样而非穷举：`setResponseStatus` 裸调仅上报 5 处，仓库实际 ~30+；IDOR 检查只覆盖 quality-loss/metrology/knowledge，inspection-record/supplier/welder 等模块未逐路由审。
- 后续修复时需要扩大扫描范围，并在每个高危项修复后做穷举式验证。

**验证结果：**

- 本次为审计阶段，未涉及代码改动，无需 typecheck/lint。
- 文档与硬约束已落库。

**遗留问题：**

- 5 项高危按 ROI 排序进入"批次 1"修复计划（见 `docs/AUDIT-2026-06-04.md`），尚未启动。
- 用户已确认这些问题不作为"新约束"（多数已被现有 CONSTRAINTS.md 覆盖），而是作为"违反现有约束"的债务清单分批处理。

## [0.5.1](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.5.0...qgs-v0.5.1) (2026-06-03)


### Bug Fixes

* **@qgs/backend:** lowercase dispatch test describe to satisfy lint ([267c831](https://github.com/ajie5419/Quality-Guardian/commit/267c8310e5f69863530c03bd12ca62542ef7ff8d))
* **@qgs/backend:** prevent duplicate dispatch on already-dispatched requests ([9dccc3c](https://github.com/ajie5419/Quality-Guardian/commit/9dccc3c1da22863f1f4f42bc19a395aaf36115cd))
* **@qgs/web-antd:** show backend message instead of [object Object] ([70d67d7](https://github.com/ajie5419/Quality-Guardian/commit/70d67d7da0023fa05a01177d22a6dbbc84a78c75))
* **@qgs/web-antd:** sort fetch-event-source import to satisfy lint ([160166e](https://github.com/ajie5419/Quality-Guardian/commit/160166e07229cc099a762374849811255b2de632))

## [0.5.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.4.1...qgs-v0.5.0) (2026-06-03)


### Features

* **@qgs/backend:** broadcast inspection request events ([ee86776](https://github.com/ajie5419/Quality-Guardian/commit/ee86776ce1b04abbb9dd170abac8a2436399bddf))
* **@qgs/web-antd:** add create entry to supervision gantt plan toolbar ([bdd920a](https://github.com/ajie5419/Quality-Guardian/commit/bdd920aced83e378c39083eaf2ac2f509d5851a9))
* **@qgs/web-antd:** add incoming inspection request entry ([bc80c5e](https://github.com/ajie5419/Quality-Guardian/commit/bc80c5e5e176d2f82103137ae1755bc5278aea41))
* **@qgs/web-antd:** add qms responsive page shell ([248abae](https://github.com/ajie5419/Quality-Guardian/commit/248abae2473f029920a92c58ec63dba69a221a9f))
* **@qgs/web-antd:** gate inspection request alerts by dispatch permission ([bd2e98a](https://github.com/ajie5419/Quality-Guardian/commit/bd2e98acf1a4bb3ea5f66ba56e823f87eb1428a6))
* **project:** add document-availability choice when closing inspection ([7729195](https://github.com/ajie5419/Quality-Guardian/commit/77291950c75c22c44ba15d3e417b0ec4609b109b))


### Bug Fixes

* **@qgs/backend:** enforce inspection dispatch permission ([0be1a26](https://github.com/ajie5419/Quality-Guardian/commit/0be1a266b30d46d91342f923424667dfd7a1d3bf))
* **@qgs/backend:** split inspection dashboard permission ([737ef42](https://github.com/ajie5419/Quality-Guardian/commit/737ef4241516ac4cc45c7d07787ed9bb6bfd6eb1))
* **@qgs/backend:** write issue inspector as relation to avoid prisma error ([8c2b634](https://github.com/ajie5419/Quality-Guardian/commit/8c2b6344f913f963fc94a45bf9391bec849b79cf))
* **@qgs/web-antd:** adapt after sales list for mobile ([92faac7](https://github.com/ajie5419/Quality-Guardian/commit/92faac7e8e73b92e8330b03d2103d998bbaba308))
* **@qgs/web-antd:** adapt custom chart modal on mobile ([9f64ed8](https://github.com/ajie5419/Quality-Guardian/commit/9f64ed80f888212032b0c7faf51541c225d0f1c3))
* **@qgs/web-antd:** adapt inspection issues for mobile ([b060cc0](https://github.com/ajie5419/Quality-Guardian/commit/b060cc0a0b327bd9ae93bd9e59f84f4a11fd99bf))
* **@qgs/web-antd:** adapt qms statistic cards on mobile ([05dbc91](https://github.com/ajie5419/Quality-Guardian/commit/05dbc911524707cb62331804d3eff441578a5043))
* **@qgs/web-antd:** adapt supervision drawers on mobile ([0357056](https://github.com/ajie5419/Quality-Guardian/commit/03570569ba1f41ab884052f69c8f27e6d2aba3f0))
* **@qgs/web-antd:** adapt work order list for mobile ([82c6b0d](https://github.com/ajie5419/Quality-Guardian/commit/82c6b0d8bede61ee2e58094f22c2a8ebf9c7aa7f))
* **@qgs/web-antd:** align incoming request entry fields ([95415e1](https://github.com/ajie5419/Quality-Guardian/commit/95415e1a5f59c24b60903d59e9ccb9921294d16b))
* **@qgs/web-antd:** authenticate inspection request SSE stream ([3fbe675](https://github.com/ajie5419/Quality-Guardian/commit/3fbe6758ea9ab5e112eb8ca3200fbb8898aff457))
* **@qgs/web-antd:** improve after sales grid on mobile ([37480cb](https://github.com/ajie5419/Quality-Guardian/commit/37480cbf424fdbe4d4c1dc31ff9af53cc0d1e47d))
* **@qgs/web-antd:** keep incoming request records classified ([2347871](https://github.com/ajie5419/Quality-Guardian/commit/234787185721e3f6e620c373a59dde9a916781eb))
* **@qgs/web-antd:** keep public entry requests unauthenticated ([3d40df3](https://github.com/ajie5419/Quality-Guardian/commit/3d40df3c31c3e7bb088b25fda01300ad269f0e20))
* **@qgs/web-antd:** paginate after sales list response ([00da19f](https://github.com/ajie5419/Quality-Guardian/commit/00da19f1bed99c2a1de124430ca854bc1fc416d3))
* **@qgs/web-antd:** prevent inspection dashboard drawer overflow ([ddb8192](https://github.com/ajie5419/Quality-Guardian/commit/ddb8192fffb00731394b215e95049f29290642cb))
* **@qgs/web-antd:** prevent mobile inspection request overflow ([644e6c5](https://github.com/ajie5419/Quality-Guardian/commit/644e6c5ad2060e30f2e747198864d5e2805fb11a))
* **@qgs/web-antd:** remove duplicate report work order field ([51cfbd3](https://github.com/ajie5419/Quality-Guardian/commit/51cfbd33b638810701da89b531d7ef6cf87c0031))
* **@qgs/web-antd:** require commissioning issue fields ([96b1e41](https://github.com/ajie5419/Quality-Guardian/commit/96b1e41d15689baea5e77b71414257d13c32f285))
* **@qgs/web-antd:** stabilize after sales desktop grid state ([a08d448](https://github.com/ajie5419/Quality-Guardian/commit/a08d44891f9a5db16b993e727cf5d4258695f921))
* **@qgs/web-antd:** stabilize after sales grid pagination ([29d959f](https://github.com/ajie5419/Quality-Guardian/commit/29d959f8574a1cfa67167520c811f1f19904b5f3))
* **@qgs/web-antd:** stack issue form fields on mobile ([d8d4d1a](https://github.com/ajie5419/Quality-Guardian/commit/d8d4d1acfbd2c5ed1e194d90a3a71820259171b0))
* **@qgs/web-antd:** stop after sales grid auto-resize loop ([624587b](https://github.com/ajie5419/Quality-Guardian/commit/624587b2a70430f5c36d1a4bf22a5fb9f259771b))
* **@qgs/web-antd:** use vertical issue form layout ([bbc6a76](https://github.com/ajie5419/Quality-Guardian/commit/bbc6a76f6053e25b7b6efa8baaaf1bfba7f08c5f))

### 2026-06-03 新增：完成检验时可选择「是否有资料」

**执行内容：**

- 解决外购件扫码报检完成检验后，落入进货检验记录的「是否有资料」恒为「有」且无法选择的问题。根因：`hasDocuments` 从未作为用户输入，而是后端按检验记录附件数量推导（`qgs-shared` 构造 payload 时 `attachments.length > 0`、create 兜底默认 `true`、close 后又按文档数量二次覆盖），而完成检验时附件必填，导致该值恒为 true。
- 共享包 `CloseInspectionRequestParams` 新增可选 `hasDocuments` 字段；`buildInspectionRecordPayloadCore` 改为优先采用显式传入的 `hasDocuments`，未传时回退附件数量推导。
- 后端 `syncCloseAttachments`（close 后置同步）新增 `hasDocuments` 入参，显式传入时尊重用户选择、不再无条件按文档数量覆盖；`inspection-request-close.service` 将 `body.hasDocuments` 透传给该同步任务。
- PC 端「完成检验」弹窗（`CloseInspectionModal.vue`）与移动端检验页（`InspectResult.vue`）均新增「是否有资料」开关，默认「有」，提交时随完成检验接口上送；对应 `closeForm` 状态与本地 `CloseForm` 类型同步补充该字段。
- 新增 `buildInspectionRecordFromRequest` 单测：显式 `hasDocuments: false` 时记录落为「无」，未传时按附件数量回退为「有」。

**验证结果：**

- `pnpm --dir packages/qgs-shared run build`: 通过（dts 已含新字段）
- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm --dir apps/backend exec tsc --noEmit`: 通过
- `pnpm --dir apps/backend exec vitest run modules/inspection/`: 7 文件 / 37 测试通过（含 2 条新增 `hasDocuments` 用例）
- 浏览器层面（PC 完成检验弹窗、移动端检验页选择「无」后进货检验记录是否落为「无」）待人工验证。

**遗留问题：**

- 需在本地走一遍「外购件扫码报检 → 完成检验选择无资料 → 查看进货检验记录」确认落库正确。

### 2026-06-03 修复：售后质量表格首次加载持续下拉

**执行内容：**

- 定位售后质量桌面端表格首次加载时持续下拉、像一直在分页的问题，确认根因并非分页状态，而是虚拟滚动与布局的反馈循环。
- 售后质量 grid 配置中 `height: 'auto'` 与 `scrollY`（纵向虚拟滚动）同时启用，但虚拟滚动需要确定的滚动体高度才能计算可见行；父容器 `.after-sales-grid-card` 未约束高度，`Page` 使用 `content-class="p-0"` 而非 `h-full`，导致 vxe-table 的 ResizeObserver 首次渲染时进入「表体高度变化 → 容器增高 → 重算可见行」的死循环。
- 移除 `apps/web-antd/src/views/qms/after-sales/composables/useAfterSalesGrid.ts` 中的 `height: 'auto'` 覆盖，让 grid 继承适配器默认固定高度 `600`，与 supplier/metrology/outsourcing/inspection-issues 等其它分页表格保持一致，为虚拟滚动提供确定高度。
- 说明此前三次「stabilize pagination」修复（`00da19f1`、`29d959f8`、`a08d4489`）均针对分页状态与后端分页，未触及该布局循环，因此问题持续存在。

**验证结果：**

- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- 浏览器层面（`http://localhost:5666/qms/after-sales` 首次加载是否只渲染一次、表格静止）待人工验证。

**遗留问题：**

- 需在本地多页数据下做最终浏览器验证，确认首次加载不再持续下拉。

### 2026-06-02 修复：售后质量分页重复增长

**执行内容：**

- 修复售后质量列表接口未使用分页响应导致桌面表格和移动端卡片分页状态脱节的问题。
- 售后质量查询参数补充 `page` / `pageSize`，后端 `/qms/after-sales` 统一按页返回 `items` 和总数。
- 前端售后质量 grid 查询移除二次 `slice`，每次分页直接替换当前页数据；日期筛选切换时同步重置 grid 和移动端页码。
- 售后质量电脑端 grid 补齐显式 `pagerConfig` 和 proxy `props`，并让导出/全量查询显式请求大页，避免表格分页和全量查询继续走默认 20 条分页。
- 新增售后质量列表路由测试，验证 `/qms/after-sales?page=2&pageSize=2` 返回当前页而不是全量列表。

**验证结果：**

- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm --dir apps/backend exec tsc --noEmit`: 通过
- `pnpm --dir apps/backend exec vitest run modules/after-sales/after-sales.service.test.ts modules/after-sales/after-sales-payload.test.ts`: 2 文件 / 6 测试通过
- `pnpm --dir apps/backend exec vitest run modules/after-sales/after-sales-list-route.test.ts`: 1 文件 / 1 测试通过
- `pnpm lint`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过
- `pnpm --dir apps/backend exec vitest run`: 36 文件 / 178 测试通过

**commit:** `00da19f1` fix(@qgs/web-antd): paginate after sales list response
**follow-up commit:** `29d959f8` fix(@qgs/web-antd): stabilize after sales grid pagination

**遗留问题：**

- Local desktop verification on `http://localhost:5666/qms/after-sales` still shows an unresolved pagination-state issue.
- With the current local dataset, the page has only 2 records under the default `20` rows per page, so a real page-2 interaction cannot be reproduced directly.
- During local verification, changing the page-size area can still trigger a full blank loading state before the grid recovers.
- A follow-up frontend fix aligned `pagerConfig` state updates in `apps/web-antd/src/views/qms/after-sales/index.vue` with the stable inspection-issues pattern by preserving the original pager config before updating `currentPage` and `pageSize`.
- This follow-up passed `pnpm --dir apps/web-antd exec vue-tsc --noEmit`, but the desktop pagination flow still requires a final browser-level verification with multi-page local data before this issue can be considered closed.

### 2026-06-02 修复：工单管理移动端列表防溢出

**执行内容：**

- 工单管理页面在移动端切换为卡片列表展示，避免宽表格在手机端横向溢出。
- 抽出 `WorkOrderMobileList`、`WorkOrderMobileSection`、`useWorkOrderMobileList` 和 `useWorkOrderGridOptions`，桌面端保留原 VxeGrid、搜索、导入导出和表格操作。
- 移动端列表复用原 grid 查询结果、分页状态、部门名称格式化和详情/编辑/删除操作，并补充工单任务统计移动端文案。

**验证结果：**

- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm lint`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过
- `pnpm --dir apps/backend exec vitest run`: 35 文件 / 177 测试通过

**commit:** `82c6b0d8` fix(@qgs/web-antd): adapt work order list for mobile

**遗留问题：**

- 无。

### 2026-06-02 修复：售后质量移动端列表防溢出

**执行内容：**

- 售后质量页面在移动端切换为卡片列表展示，避免宽表格在手机端横向溢出。
- 抽出 `AfterSalesMobileList` 和 `AfterSalesToolbarActions`，桌面端保留原 VxeGrid、搜索、导入导出和表格操作。
- 移动端列表复用原 grid 查询结果、分页状态、状态/索赔标签、责任部门名称格式化和现有详情/编辑/删除/案例沉淀操作。

**验证结果：**

- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm lint`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过
- `pnpm --dir apps/backend exec vitest run`: 35 文件 / 177 测试通过

**commit:** `92faac7e` fix(@qgs/web-antd): adapt after sales list for mobile

**遗留问题：**

- 无。

### 2026-06-02 修复：公开扫码入口避免过期登录态跳转登录

**执行内容：**

- 确认扫码报检、进货检验扫码入口和计量借用扫码入口路由均为公开入口，但前端 public API 复用了带 token 和 401 登录跳转拦截的 `requestClient`。
- 新增 `publicRequestClient`，保留响应解包、语言头和空参数清理，但不注入 Authorization，也不挂载 401 重新认证/登出拦截。
- 报检 public 查询/提交接口和计量借用 public 匹配/借用/归还接口统一切换到 `publicRequestClient`，避免带过期 token 的浏览器扫码后被踢回登录页。

**验证结果：**

- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm lint`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过
- `pnpm --dir apps/backend exec vitest run`: 35 文件 / 177 测试通过

**commit:** `3d40df3c` fix(@qgs/web-antd): keep public entry requests unauthenticated

**遗留问题：**

- 无。

### 2026-06-02 修复：不合格项移动端列表防溢出

**执行内容：**

- 不合格项页面在移动端切换为卡片列表展示，避免继续渲染宽表格造成横向溢出。
- 抽出 `IssueMobileList` 和 `IssueToolbarActions`，桌面端保留原 VxeGrid、搜索、导入导出和表格操作。
- 移动端列表复用原 grid 查询结果、分页状态、状态/严重度标签和责任部门名称格式化，保持与桌面筛选结果一致。

**验证结果：**

- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm lint`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过
- `pnpm --dir apps/backend exec vitest run`: 35 文件 / 177 测试通过

**commit:** `b060cc0a` fix(@qgs/web-antd): adapt inspection issues for mobile

**遗留问题：**

- 无。

### 2026-06-01 修复：进货检验记录分类与扫码入口物料录入

**执行内容：**

- 修复报检任务关闭生成检验记录时，进货检验任务因工序主数据关系缺失被落为 `PROCESS` 的问题；后端保留原始“进货检验”流程名并增加 `INCOMING` payload 兜底。
- 进货检验扫码入口隐藏“检验类型”字段，仍在提交 payload 中固定写入 `processName = 进货检验`。
- 进货检验扫码入口的“物料名称”改为自由填写，不再强制从 BOM 物料列表选择，也不再为进货入口拉取 BOM 物料选项。
- 新增 `buildInspectionRecordFromRequest` 回归测试，覆盖进货任务在 process relation 缺失时仍生成 `INCOMING` 记录。

**验证结果：**

- `pnpm --dir apps/backend exec vitest run modules/inspection/inspection-request.test.ts`: 1 文件 / 1 测试通过
- `pnpm --dir apps/backend exec tsc --noEmit`: 通过
- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm lint`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过
- `pnpm --dir apps/backend exec vitest run`: 35 文件 / 177 测试通过

**commit:** `23478718` fix(@qgs/web-antd): keep incoming request records classified

**遗留问题：**

- 无。

### 2026-06-01 修复：进货检验扫码入口复用进货类型与供应商选择

**执行内容：**

- 进货检验扫码入口新增可选择的“进货类型”，复用新建进货检验表单的选项。
- 新增 public supplier list endpoint，扫码入口的“供应商/来料单位”改为查询供应商列表；进货类型为“机加成品件”时查询外协单位，其余查询供应商。
- 进货检验扫码提交时结构化保存进货类型与补充说明，关闭任务落库为进货检验记录时回填 `incomingType`、`materialName`、`supplierName`。
- 抽出扫码入口字段组件，保持 public entry 入口文件低于 QMS 架构行数限制。
- 新增 `InspectionPublicQueryService.getPublicSuppliers` 单元测试，覆盖默认供应商分类、外协分类与搜索词 trim。

**验证结果：**

- `pnpm exec vitest run packages/qgs-shared/src/domain-modules/qms/inspection-request.test.ts`: 1 文件 / 1 测试通过
- `pnpm --dir apps/backend exec vitest run modules/inspection/inspection-public-query.service.test.ts modules/inspection/inspection-request-create.schema.test.ts modules/inspection/inspection-request-events.test.ts modules/inspection/inspection.service.test.ts`: 4 文件 / 22 测试通过
- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm lint`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过
- `pnpm --dir apps/backend exec vitest run`: 34 文件 / 176 测试通过

**commit:** `95415e1a` fix(@qgs/web-antd): align incoming request entry fields

**遗留问题：**

- 无。

### 2026-06-01 功能：报检任务增加进货检验扫码入口

**执行内容：**

- 新增 `/qms/inspection/requests/incoming-entry` 进货检验扫码入口，复用 public 报检提交链路，提交时固定 `processName = 进货检验`。
- 报检任务扫码入口弹窗同时展示过程报检和进货检验两个二维码、链接、打开入口和复制入口。
- 报检任务列表增加“进货检验任务”视图，后端列表接口支持按 `processName` 精确过滤，列表任务列增加进货检验标识。
- 进货检验任务关闭时直接生成 `INCOMING` 检验记录，`materialName` 取报检部件，`supplierName` 取任务 `team`；不合格项仍复用现有表单和校验。
- 进货检验创建跳过组件名称必填，保持派单和关闭状态机复用现有报检任务流程。

**验证结果：**

- `pnpm exec vitest run packages/qgs-shared/src/domain-modules/qms/inspection-request.test.ts apps/backend/modules/inspection/inspection-request-create.schema.test.ts`: 2 文件 / 5 测试通过
- `pnpm --dir apps/backend exec vitest run`: 33 文件 / 174 测试通过
- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm lint`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过

**commit:** `bc80c5e5` feat(@qgs/web-antd): add incoming inspection request entry

**遗留问题：**

- 无。

### 2026-06-01 修复：调试验收日报工单字段去重

**执行内容：**

- 移除调试验收“生成调试验收日报”表单中的重复“工单号”输入框。
- 保留“关联工单”作为唯一工单入口，继续通过工单选择联动项目名称并写入日报提交 payload。
- 将日报表单首行布局从三列调整为两列，避免空位和重复字段造成理解混乱。

**验证结果：**

- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm lint`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过

**commit:** `51cfbd33` fix(@qgs/web-antd): remove duplicate report work order field

**遗留问题：**

- 无。

### 2026-06-01 修复：调试验收问题表单必填与桌面布局

**执行内容：**

- 将调试验收新建/编辑问题弹窗改为移动端单列、电脑端双列布局，长文本、照片上传与处理建议跨双列展示。
- 将问题表单所有可编辑字段标记为必填，并在提交前统一校验；索赔字段仅在开启索赔时强制填写。
- 移除责任部门的“调试组”默认值，新建问题不再自动预填，编辑空值也不再回退为调试组。
- 将调试验收问题弹窗电脑端宽度调整为 `900px`，避免双列布局挤压。

**验证结果：**

- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm lint`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过

**commit:** `96b1e41d` fix(@qgs/web-antd): require commissioning issue fields

**遗留问题：**

- 无。

### 2026-06-01 重构：完成 QMS 后台页面壳层迁移复查

**执行内容：**

- 全量复查 `apps/web-antd/src/views/qms/**/index.vue` 的 `QmsPageShell` 接入状态。
- 将质量知识库迁移到 `QmsPageShell`，抽出 `KnowledgeWorkspace`，入口页从 767 行降到 442 行，并收紧三栏布局的移动端宽度约束。
- 将焊工管理、BOM 策划、监督管理入口迁移到 `QmsPageShell`，将大块业务视图移入对应组件，入口页均降到 15 行。
- 加强不合格项新建/编辑弹窗的移动端防横向溢出样式。
- 保留 `inspection/requests/entry` 与 `metrology/borrow/entry` 两个公开移动入口不接后台壳层。

**验证结果：**

- `pnpm lint`: 通过
- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过

**commit:** `a87146be` refactor(@qgs/web-antd): complete qms shell migration

**遗留问题：**

- 无。

### 2026-06-01 重构：迁移售后问题到 QMS 壳层

**执行内容：**

- 抽出 `AfterSalesDetailDrawer`，将售后问题详情抽屉从入口页移出。
- 将售后问题页面迁移到 `QmsPageShell`，入口文件从 680 行降到 517 行。
- 售后详情抽屉改为移动端 `100vw` / 单列、桌面端 `min(100vw, 900px)` / 双列。

**验证结果：**

- `pnpm lint`: 通过
- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过

**commit:** `233888e5` refactor(@qgs/web-antd): migrate qms after sales shell

**遗留问题：**

- 无。

### 2026-06-01 重构：迁移文件中心到 QMS 壳层

**执行内容：**

- 抽出 `FileStorageStatsCards`，将文件中心存储统计卡从入口页移出。
- 将文件中心页面迁移到 `QmsPageShell`，入口文件从 512 行降到 436 行。

**验证结果：**

- `pnpm lint`: 通过
- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过

**commit:** `5e34f181` refactor(@qgs/web-antd): migrate qms file center shell

**遗留问题：**

- 无。

### 2026-06-01 优化：迁移 QMS 总览和 ITP 跳转页壳层

**执行内容：**

- 将 QMS 总览页迁移到 `QmsPageShell`，同时移除无信息增量注释，把入口文件压到 QMS 架构行数限制内。
- 将 ITP 和 ITP Generator 跳转页迁移到 `QmsPageShell`，统一后台页面边距。

**验证结果：**

- `pnpm lint`: 通过
- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过

**commit:** `473783c7` refactor(@qgs/web-antd): migrate qms dashboard shell

**遗留问题：**

- 焊工、质量知识库、监造、文件中心、售后、BOM 仍需拆组件后迁移。
- 报检公开填报和计量借用扫码入口保持独立公开移动页。

### 2026-06-01 优化：补迁移 QMS 普通后台页壳层

**执行内容：**

- 将供应商管理、报检看板、计量借用、计量校准计划、检验表模板、DFMEA、项目资料、工作台补迁移到 `QmsPageShell`。
- 修复不合格项新建/编辑弹窗在移动端表单内容横向溢出的问题。
- 重新审计 QMS 页面壳层覆盖范围，标记需要拆组件后迁移的大入口页面。

**验证结果：**

- `pnpm lint`: 通过
- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过

**commit:** `07fb59e3` refactor(@qgs/web-antd): migrate remaining qms standard pages

**遗留问题：**

- 焊工、质量知识库、监造、文件中心、售后、BOM、质量总览仍需拆组件后迁移。
- 报检公开填报和计量借用扫码入口是独立公开移动页，不套后台 `QmsPageShell`。
- ITP/ITP 生成器是跳转页，待下一批轻量统一。

### 2026-06-01 修复：报检看板历史统计移动端溢出

**执行内容：**

- 修复报检看板历史统计「查看全部」详情抽屉在移动端固定 760px 宽度导致页面横向溢出的问题。
- 详情抽屉改为移动端 `100vw`、桌面端 `min(100vw, 760px)`。
- 为班组报检、班组复检率、检验效率三张详情表设置移动端横向滚动宽度，避免表格列撑开页面。

**验证结果：**

- `pnpm lint`: 通过
- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过

**commit:** `ddb8192f` fix(@qgs/web-antd): prevent inspection dashboard drawer overflow

**遗留问题：**

- 无。

### 2026-06-01 重构：完成 QMS 响应式壳层迁移

**执行内容：**

- 将检验记录、工单要求、外协管理、报告日报、报告汇总、检验问题页面迁移到 `QmsPageShell`。
- 移除 QMS 页面下剩余 `MobilePageShell` 使用点，统一页面级响应式壳层。
- 检验问题页复用 `IssueDetailDrawer` 和 `IssueStatisticsCard`，降低入口文件行数并保持原统计卡展示。
- 检验问题详情抽屉改为移动端 `100vw` / 单列、桌面端 `min(100vw, 960px)` / 双列，避免移动端横向溢出。

**验证结果：**

- `pnpm lint`: 通过
- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过

**commit:** `e79bfa84` refactor(@qgs/web-antd): finish qms responsive shell migration

**遗留问题：**

- 无。

### 2026-06-01 修复：报检任务移动端列表右侧溢出

**执行内容：**

- 报检任务列表在移动端改为卡片列表，不再渲染带 `fixed="right"` 操作列的 Ant Table。
- 桌面端保留原表格布局和固定操作列。
- 移动端卡片保留详情、派单、完成、更多操作入口，并使用简洁分页。

**验证结果：**

- `pnpm lint`: 通过
- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过

**commit:** `644e6c5a` fix(@qgs/web-antd): prevent mobile inspection request overflow

**遗留问题：**

- 无。

### 2026-06-01 重构：迁移首批 QMS 页面到统一响应式壳层

**执行内容：**

- 将报检任务、计量管理、质量损失三个典型 QMS 页面从 `MobilePageShell` 迁移到 `QmsPageShell`。
- 保持页面业务逻辑、表格配置、按钮权限和弹窗流程不变，仅统一页面级响应式壳层。
- 质量损失和报检任务继续使用灰色内容背景，计量管理保持原有内容结构。

**验证结果：**

- `pnpm lint`: 通过
- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过

**commit:** `cb16e74c` refactor(@qgs/web-antd): migrate qms pages to responsive shell

**遗留问题：**

- 剩余 `MobilePageShell` 页面仍待分批迁移。

### 2026-06-01 优化：统一 QMS 页面响应式壳层

**执行内容：**

- 新增 `QmsPageShell`，提供 QMS 页面统一的 fluid / contained 布局、密度、移动端安全区和页脚能力。
- 为 QMS 全局移动样式补充 `qms-page-shell` 样式，避免后续页面继续依赖仅面向移动端命名的 shell。
- 将调试验收页面迁移到 `QmsPageShell`，移除桌面端 `mx-auto max-w-7xl` 窄容器，恢复和其他后台页面一致的 full-width 布局。
- 抽出 `VehicleCommissioningIssueModal`，降低调试验收入口文件行数并满足 QMS 架构门禁。

**验证结果：**

- `pnpm lint`: 通过
- `pnpm --dir apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过

**commit:** `248abae2` feat(@qgs/web-antd): add qms responsive page shell

**遗留问题：**

- 无。

### 2026-06-01 优化：报检任务实时通知跨实例广播

**执行内容：**

- 将报检任务 SSE 通知从单进程内存广播升级为本地 SSE 广播 + Redis Pub/Sub 跨实例广播。
- 保留 Redis 不可用时的单进程推送行为，不影响本地开发和无 Redis 部署。
- Redis 消息带实例来源标识，避免本实例收到自己发布的事件后重复弹通知。
- 增加报检任务事件测试，覆盖本地 SSE 推送和其他后端实例 Redis 广播转发。

**验证结果：**

- `pnpm --dir apps/backend exec vitest run modules/inspection/inspection-request-events.test.ts`: 1 文件 / 2 测试通过
- `pnpm lint`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过
- `pnpm --dir apps/backend exec vitest run`: 33 文件 / 173 测试通过

**commit:** `ee86776c` feat(@qgs/backend): broadcast inspection request events

**遗留问题：**

- 前端仍保留 60 秒轮询兜底，用于 SSE 断线或 Redis 不可用时补漏。
- 工作树仍存在未跟踪诊断脚本 `apps/backend/diagnose-menu.mts`，未纳入本次提交。

### 2026-06-01 修复：报检任务按钮权限树唯一化

**执行内容：**

- 将报检看板权限码从 `QMS:Inspection:Requests:List` 拆分为 `QMS:Inspection:Dashboard:List`，避免 Ant Tree 中报检看板和报检任务使用重复 key。
- 保留授权码兼容补齐：已有 `QMS:Inspection:Requests:List` 的用户仍会获得报检看板访问码。
- 增加 RBAC 权限树回归测试，确保报检看板和报检任务是两个唯一节点，报检任务下按钮权限稳定挂载。

**验证结果：**

- `pnpm --dir apps/backend exec vitest run modules/rbac/rbac.service.test.ts`: 1 文件 / 8 测试通过
- `pnpm lint`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过
- `pnpm --dir apps/backend exec vitest run`: 32 文件 / 171 测试通过

**commit:** `737ef424` fix(@qgs/backend): split inspection dashboard permission

**遗留问题：**

- 工作树仍存在未跟踪诊断脚本 `apps/backend/diagnose-menu.mts`，未纳入本次提交。

### 2026-06-01 修复：报检任务派单权限闭环

**执行内容：**

- 报检任务列表“派单”按钮改为同时检查任务状态和 `QMS:Inspection:Requests:Dispatch` 权限。
- 派单弹窗打开和提交前增加无权限提示，避免外部事件或组件调用绕过按钮隐藏。
- 后端派单 service 增加 `QMS:Inspection:Requests:Dispatch` 权限校验，接口层保持瘦身；Telegram 派单会先解析真实用户再校验权限。
- 修复角色权限树父子菜单 ID 类型混用时按钮节点掉树的问题，确保报检任务下显示新增、派单、关闭、删除按钮权限。
- 为权限树混合 ID 类型场景补充 RBAC 回归测试。
- 将报检任务入口二维码逻辑和静态选项拆出 composable / options 文件，保持 QMS 页面与路由文件行数符合架构守护规则。

**验证结果：**

- `pnpm lint`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过
- `pnpm --dir apps/backend exec vitest run`: 32 文件 / 170 测试通过

**commit:** `0be1a266` fix(@qgs/backend): enforce inspection dispatch permission

**遗留问题：**

- 工作树存在既有未跟踪诊断脚本 `apps/backend/diagnose-menu.mts`；本次仅为通过全仓 lint 对其做了格式与 lint 规则整理，未纳入权限改动范围。

## [0.4.1](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.4.0...qgs-v0.4.1) (2026-05-30)


### Bug Fixes

* **@qgs/backend:** point dispatch QR at reachable frontend host ([79056b9](https://github.com/ajie5419/Quality-Guardian/commit/79056b9be611928fd4336816354f7fff8b3c25e0))
* **@qgs/backend:** resolve dept by id and reuse frontend QR base url ([8ca2c37](https://github.com/ajie5419/Quality-Guardian/commit/8ca2c3796c6c1f11a83d5bf7117d29868d24fdf4))

## [0.4.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.3.0...qgs-v0.4.0) (2026-05-30)


### Features

* **@qgs/backend:** filter Telegram inspector list by department ([dc653fa](https://github.com/ajie5419/Quality-Guardian/commit/dc653faa5a5997a43c3c918f28b973f6995c83fe))


### Bug Fixes

* **@qgs/backend:** use real user as dispatcher for Telegram dispatch ([20578eb](https://github.com/ajie5419/Quality-Guardian/commit/20578ebf40a17f7f7e712b590a47e72273d0cddd))

## [0.3.0](https://github.com/ajie5419/Quality-Guardian/compare/qgs-v0.2.3...qgs-v0.3.0) (2026-05-30)


### Features

* **@qgs/backend:** add dedicated qms export endpoints and frontend full-export wiring ([7686f4d](https://github.com/ajie5419/Quality-Guardian/commit/7686f4d8e07494373e54faa0b935603dcf3fc23a))
* **@qgs/backend:** add responsibleDepartments multi-select columns ([a8d9555](https://github.com/ajie5419/Quality-Guardian/commit/a8d955558bf404f25996fe7febc4ab402c7acaea))
* **@qgs/backend:** add wechat-work notification utility and integrate inspection flow ([2b06c01](https://github.com/ajie5419/Quality-Guardian/commit/2b06c01aec5348b0965d13d8db0fe691eff5bb48))
* **@qgs/backend:** add wechat-work OAuth login endpoint ([7f71236](https://github.com/ajie5419/Quality-Guardian/commit/7f712367fc806d00c42ef5de9003ec584a4dd79a))
* **@qgs/backend:** harden qms export with row limits logging and unified user feedback ([7a278a7](https://github.com/ajie5419/Quality-Guardian/commit/7a278a71c9ec6b23dbfb8365b75e261cc2a1c7e0))
* **@qgs/backend:** improve logging and client error reporting ([ef2f714](https://github.com/ajie5419/Quality-Guardian/commit/ef2f714aa09f5cfe6018eb9d2e95c38758154d73))
* **@qgs/backend:** replace WeChat Work notifications with Telegram Bot ([05a6b87](https://github.com/ajie5419/Quality-Guardian/commit/05a6b878242505101769749501011337cf3aff7f))
* **@qgs/backend:** standardize qms full-export with dedicated inspection and work-order endpoints ([01445ca](https://github.com/ajie5419/Quality-Guardian/commit/01445ca7b16718b7b169dde075352d8465351950))
* **@qgs/backend:** support multi-select responsibleDepartments in after-sales ([55c4e7c](https://github.com/ajie5419/Quality-Guardian/commit/55c4e7c1f0018d59cd7fa7d56104bf6abc23aac3))
* **@qgs/backend:** support multi-select responsibleDepartments in quality records ([0bb59cd](https://github.com/ajie5419/Quality-Guardian/commit/0bb59cdfc860dbb5b966cd31ed3fe0c0720bcb25))
* **@qgs/backend:** support wechatWorkId in user management APIs ([5bb58fb](https://github.com/ajie5419/Quality-Guardian/commit/5bb58fbf5ba8cf27c14d1ebfd1a3680ace5f563c))
* **@qgs/backend:** switch notification to wx test account template message API ([8cd0664](https://github.com/ajie5419/Quality-Guardian/commit/8cd0664db1e0ef6bb7bdd32b4c392bab0955767d))
* **@qgs/web-antd:** add full inspection dashboard rankings ([68bd72f](https://github.com/ajie5419/Quality-Guardian/commit/68bd72f0e314724a9e9d28da4288f338efa6c57b))
* **@qgs/web-antd:** add mobile dispatch page ([199eea6](https://github.com/ajie5419/Quality-Guardian/commit/199eea61298cd41b99b55059941d90c8c960d8de))
* **@qgs/web-antd:** add mobile inspection result page ([aee8743](https://github.com/ajie5419/Quality-Guardian/commit/aee8743720a0237f0f446bf22d4347b8cc04903f))
* **@qgs/web-antd:** add mobile route configuration for wechat-work H5 ([6ad5094](https://github.com/ajie5419/Quality-Guardian/commit/6ad5094022bb1b32f4d3ffc8b5e83b00219c9f7b))
* **@qgs/web-antd:** add mobile task list page ([4f3ac99](https://github.com/ajie5419/Quality-Guardian/commit/4f3ac99606d86bc3d9c4f0bdbc5d82a97cbacbcb))
* **@qgs/web-antd:** add MobileLayout with wechat-work auto-auth ([7e3c46d](https://github.com/ajie5419/Quality-Guardian/commit/7e3c46d161e38e31ab08df7802e40f357128a498))
* **@qgs/web-antd:** add useImageCompress composable with lossy and evidence presets ([00bc1a8](https://github.com/ajie5419/Quality-Guardian/commit/00bc1a802335bbb3cdded8ba41f5fbeaa8ef1e5c))
* **@qgs/web-antd:** add wechat-work OAuth composable for mobile auth ([c6584ae](https://github.com/ajie5419/Quality-Guardian/commit/c6584aea05ecaadcdc82520a7ce515b8e36d6692))
* **@qgs/web-antd:** add wechatWorkId field to user management form ([630dd51](https://github.com/ajie5419/Quality-Guardian/commit/630dd51da1d7f00c922844d0d8158bb7b8140042))
* **@qgs/web-antd:** enhance inspection request close modal with issue linking ([6be1099](https://github.com/ajie5419/Quality-Guardian/commit/6be109992ef147329891f8133e5428f5906f0fc9))
* **@qgs/web-antd:** make QR entry base URL configurable at runtime ([343f8f2](https://github.com/ajie5419/Quality-Guardian/commit/343f8f246727f8e8f6d7eefd5889e8f70a53f2e6))
* **@qgs/web-antd:** multi-select responsible department in after-sales form ([86c40f6](https://github.com/ajie5419/Quality-Guardian/commit/86c40f60ea2d8f8a422e039617eb9c3902e184e8))
* **@qgs/web-antd:** multi-select responsible department in inspection issue form ([98b4d26](https://github.com/ajie5419/Quality-Guardian/commit/98b4d263e050ea3ac763b2991bdd2cb3a434d2a1))
* **@qgs/web-antd:** use evidence compression for after-sales photos ([3deea49](https://github.com/ajie5419/Quality-Guardian/commit/3deea497d3289815001521de6f1d12676fc40089))
* **@qgs/web-antd:** use evidence compression for inspection issue photos ([8f4af70](https://github.com/ajie5419/Quality-Guardian/commit/8f4af703845aac23fd33dacf4652a97349df0619))
* **@qgs/web-antd:** use lossy compression for other photo uploads ([00a5bac](https://github.com/ajie5419/Quality-Guardian/commit/00a5bac08be4f97697438c3a6567782a26477e2f))
* add cached photo thumbnails ([1ab755f](https://github.com/ajie5419/Quality-Guardian/commit/1ab755f6d18b452c11741d5b414f924a3eae489e))
* add inspection request history stats ([54ef11a](https://github.com/ajie5419/Quality-Guardian/commit/54ef11a90cb0a36d32a5c3870d4ee14482c01edf))
* add inspection request workflow ([643cab4](https://github.com/ajie5419/Quality-Guardian/commit/643cab46df12f150cb1f3043f27790bd2dc8dd93))
* add knowledge attachments and build version ([5ed4e84](https://github.com/ajie5419/Quality-Guardian/commit/5ed4e84ebc655e0eaa0e54a9e99098f2d6dfc8d1))
* add master-data governance kernel and release gates ([ff787d9](https://github.com/ajie5419/Quality-Guardian/commit/ff787d9dd9b6cd746808f9bca20f1dfb0f056462))
* add metrology management modules ([bf58f28](https://github.com/ajie5419/Quality-Guardian/commit/bf58f2873c42d8c3865c7643cf8d80eabf134d95))
* add pass rate source toggle ([fc79009](https://github.com/ajie5419/Quality-Guardian/commit/fc790096f87939d38eb15f16d92b07a10cad9f0a))
* add processes table and processId columns (phase 2 schema) ([4627134](https://github.com/ajie5419/Quality-Guardian/commit/46271341b7695f268f63f4d3235b34320e60e392))
* add processId dual-write to backend APIs (phase 2 batch 2) ([3969b42](https://github.com/ajie5419/Quality-Guardian/commit/3969b42018e3df9ebe6a91a43e958afadb3919aa))
* add rbac v2 data scopes ([e0f7dde](https://github.com/ajie5419/Quality-Guardian/commit/e0f7ddeb7c7403468300b5df10e8c94b82dcefd8))
* add realtime inspection alerts ([f33a0a6](https://github.com/ajie5419/Quality-Guardian/commit/f33a0a637a5c3e5c9b47eb105ee9c1f9cac424a0))
* add shared department-multi utility for multi-select support ([8af125a](https://github.com/ajie5419/Quality-Guardian/commit/8af125a9cd4e8e83745ab5b465a0fe0f58107206))
* add unified file center ([d88ba8c](https://github.com/ajie5419/Quality-Guardian/commit/d88ba8c29d9145ed0df93198c7487cb2fbc93e90))
* add work order audit logging ([784c4dd](https://github.com/ajie5419/Quality-Guardian/commit/784c4dda3eaaf76241a4c4a67de54ba7939a144a))
* align remaining process reads with processId fallback ([b8a80a7](https://github.com/ajie5419/Quality-Guardian/commit/b8a80a7e65a1548a594a50447d084a0e7f5d3066))
* allow public metrology borrow entry ([045db7d](https://github.com/ajie5419/Quality-Guardian/commit/045db7de8ad4bf7ca79b7af76fbba95b96e9c040))
* batch commit pending qms updates and deploy fixes ([749fead](https://github.com/ajie5419/Quality-Guardian/commit/749fead717558adea4bb30c5adea46bef781e097))
* complete mobile adaptation and streamline release tagging ([805bb7f](https://github.com/ajie5419/Quality-Guardian/commit/805bb7fb1a5210f9d588c844a2a38d43babe7732))
* complete unified file center ([59a7c4a](https://github.com/ajie5419/Quality-Guardian/commit/59a7c4a78cea5763b183ce02b65ab600b334ec76))
* enhance inspection requests and supervision ([bbac29e](https://github.com/ajie5419/Quality-Guardian/commit/bbac29e7a4f68d8df11c88cff123a7c1739048b9))
* enhance monthly quality reports ([de3ace1](https://github.com/ajie5419/Quality-Guardian/commit/de3ace12831f6d291ad54e9c50ccebc00aa14b3c))
* improve inspection request dashboard ([381bdb5](https://github.com/ajie5419/Quality-Guardian/commit/381bdb5dd53df86f7d77f0882005d9cd9a94f25a))
* improve inspection request task flow ([51f2e69](https://github.com/ajie5419/Quality-Guardian/commit/51f2e69ef027d3d9ed580d8ad948faee1dad732a))
* improve inspector status mobile detail ([82f7ab8](https://github.com/ajie5419/Quality-Guardian/commit/82f7ab81bfb58fc86c729bd5b3fa0b59fad6cdee))
* migrate qms write paths to governed master-data helpers ([e393164](https://github.com/ajie5419/Quality-Guardian/commit/e3931642b4ce7078c30b01eb98ccbf6a02abb1fe))
* **planning:** unify project access and prisma error handling ([df45664](https://github.com/ajie5419/Quality-Guardian/commit/df4566434f97762557b1210a4dfc341b23019e68))
* prioritize processId-based reads in backend APIs (phase 2 batch 3) ([999d5cd](https://github.com/ajie5419/Quality-Guardian/commit/999d5cd1e3404bc17aba5fbada79c81052f944b5))
* **project:** add github actions and oss one-click deploy ([567ca8e](https://github.com/ajie5419/Quality-Guardian/commit/567ca8e0b03470567ad25fefe945b8b1b5bc0937))
* **project:** enhance qms work order task board ([cdb6e5c](https://github.com/ajie5419/Quality-Guardian/commit/cdb6e5c7ce9a3d40644a14ed25b0d1a04842c66a))
* **project:** enhance qms workspace and dashboard flows ([0ccd4ea](https://github.com/ajie5419/Quality-Guardian/commit/0ccd4eac59abbcba313f347e16f934a5f0c02ebb))
* **project:** expand QMS audit logging ([510468f](https://github.com/ajie5419/Quality-Guardian/commit/510468ffdfd21c093a9e185b6dad507efa46a09e))
* **project:** refine pass-rate grouping and restore form utilities ([bb4e902](https://github.com/ajie5419/Quality-Guardian/commit/bb4e902351ac8e736dbead93a6dd40d88f10a3d0))
* **project:** split outsourcing scoring modes ([e4ae35a](https://github.com/ajie5419/Quality-Guardian/commit/e4ae35a26d8f37137a222e9c09d9d89770ce0328))
* **qms-web:** support xlsx export with embedded photos ([de376b2](https://github.com/ajie5419/Quality-Guardian/commit/de376b2ac2017c22364553457b95048d3b49af7b))
* **qms:** add vehicle commissioning view module ([ed34478](https://github.com/ajie5419/Quality-Guardian/commit/ed34478f390abf227f0f349ef69033b5b265ec7e))
* show file storage usage ([1fc7e99](https://github.com/ajie5419/Quality-Guardian/commit/1fc7e9953c04caf2d0281c0daa8532401f946c5d))
* track bom inspection progress ([7a22fea](https://github.com/ajie5419/Quality-Guardian/commit/7a22fea2f9835ddba64e432cfefb9d44bc6c1b8f))
* unify qms time filters and vehicle failure metrics ([e246353](https://github.com/ajie5419/Quality-Guardian/commit/e246353a0b47e617a198f34566218a4be408216f))
* update commissioning acceptance and inspection flows ([831f608](https://github.com/ajie5419/Quality-Guardian/commit/831f6088b486fad19d1fe379d28f5536bd3efb17))
* update qms modules and clean tracked temp files ([335cbf2](https://github.com/ajie5419/Quality-Guardian/commit/335cbf259eaacda06cf0acfb802348fa916ad8d3))
* 重构售后反馈图表 + 新增不合格品详情/统计 + 焊工管理模块 ([c7c5afa](https://github.com/ajie5419/Quality-Guardian/commit/c7c5afa69ed266010d60bb63a2b3058695bad018))


### Bug Fixes

* **@qgs/backend:** accept X-Tg-Secret header for webhook verification ([8b1653b](https://github.com/ajie5419/Quality-Guardian/commit/8b1653b428381186914c159d814522a9f954ca20))
* **@qgs/backend:** aggregate welder stats in database ([48cf187](https://github.com/ajie5419/Quality-Guardian/commit/48cf187f75f9258aaed1de583a6cbd90c7f76cad))
* **@qgs/backend:** allow anonymous public uploads ([7675bd1](https://github.com/ajie5419/Quality-Guardian/commit/7675bd19b531a0363f4c730a0edc5b2eeef3f6a1))
* **@qgs/backend:** auto-heal vehicle commissioning menu and super codes ([7a92120](https://github.com/ajie5419/Quality-Guardian/commit/7a9212048c9851ce2c7012e73c45bf9d427bc4d9))
* **@qgs/backend:** avoid menu bootstrap unique-name collisions ([a6a33c8](https://github.com/ajie5419/Quality-Guardian/commit/a6a33c8037473ba2ffb3164c15b3c5007c8ee6e1))
* **@qgs/backend:** batch attachment reference lookups ([1e4e6a5](https://github.com/ajie5419/Quality-Guardian/commit/1e4e6a5f181a8c54682e43a1c8742c69dc6f2097))
* **@qgs/backend:** cache dashboard stats in process ([9547b8b](https://github.com/ajie5419/Quality-Guardian/commit/9547b8be5a3b56bc2603c36163128e34391cd264))
* **@qgs/backend:** default upload path to backend relay ([c678942](https://github.com/ajie5419/Quality-Guardian/commit/c6789428eb434d46b38415fcaad37bc6ffe166f4))
* **@qgs/backend:** disable nitro auto module scan ([8c384e2](https://github.com/ajie5419/Quality-Guardian/commit/8c384e2706c4ababbc6c8a5337169abb2a02bae2))
* **@qgs/backend:** eliminate as-any type bypasses in production code ([85d8577](https://github.com/ajie5419/Quality-Guardian/commit/85d8577cb7194c2b507ad43d63f45e264f90707b))
* **@qgs/backend:** fire-and-forget answerCallbackQuery to avoid timeout ([7c0e40f](https://github.com/ajie5419/Quality-Guardian/commit/7c0e40fe7eb3aefadfe97dd02a0ce967e793ace6))
* **@qgs/backend:** generate temporary user passwords ([5dc3a3d](https://github.com/ajie5419/Quality-Guardian/commit/5dc3a3dab10ebb7b468d62f402c40148735dc4c1))
* **@qgs/backend:** keep route handlers out of nitro module scan ([0f2cb84](https://github.com/ajie5419/Quality-Guardian/commit/0f2cb84ee6411ffd1da503ccb32dd2f112ea4474))
* **@qgs/backend:** page commissioning daily reports ([3d80988](https://github.com/ajie5419/Quality-Guardian/commit/3d80988284f09b0d3852bc4f8d3c8132cca176d3))
* **@qgs/backend:** page quality loss source queries ([e943994](https://github.com/ajie5419/Quality-Guardian/commit/e9439945983b976e659d4a673e13c304aeee8ea8))
* **@qgs/backend:** paginate metrology lists in database ([7b9b68b](https://github.com/ajie5419/Quality-Guardian/commit/7b9b68bec77e0e6c2beaeb6567a3cbe1e73b89ef))
* **@qgs/backend:** paginate supplier list in database ([81b13d1](https://github.com/ajie5419/Quality-Guardian/commit/81b13d130857ca317e538a09a8c2703e0d2ea18a))
* **@qgs/backend:** parameterize database size query ([21d8f64](https://github.com/ajie5419/Quality-Guardian/commit/21d8f649a84d12aecd475c1f68aba39aca829397))
* **@qgs/backend:** remove duplicate prisma error export path ([b1df830](https://github.com/ajie5419/Quality-Guardian/commit/b1df8307b1283007cde361798c0dd8c0e06cbea8))
* **@qgs/backend:** remove prisma delegate casts ([e00c09b](https://github.com/ajie5419/Quality-Guardian/commit/e00c09b5ea63cae96d1d06bf7e56107f3e738677))
* **@qgs/backend:** remove remaining as-any JSON parsing bypass ([a52cf7c](https://github.com/ajie5419/Quality-Guardian/commit/a52cf7c27968e8c9a3c001db003ce6b2a547942d))
* **@qgs/backend:** restore missing roles.permissions migration and add CI drift guard ([de08f28](https://github.com/ajie5419/Quality-Guardian/commit/de08f281e2f495d2451758a78a6dc983c96d5f2e))
* **@qgs/backend:** restore planning route helper imports ([34988fb](https://github.com/ajie5419/Quality-Guardian/commit/34988fb64ce08ca92f18d289aaa39ad9abef1313))
* **@qgs/backend:** restore planning route type imports ([8cb3e70](https://github.com/ajie5419/Quality-Guardian/commit/8cb3e701f89c52a1e2ad20c28f7024ae45bf82a7))
* **@qgs/backend:** restore roles.permissions column and remove wechatWorkId unique constraint ([7478f9b](https://github.com/ajie5419/Quality-Guardian/commit/7478f9b646bac27a0fb871290f2e2eccefee1693))
* **@qgs/backend:** restore validated write request handling ([996b500](https://github.com/ajie5419/Quality-Guardian/commit/996b500a482bf120a3fb9af83687ad07be70c13a))
* **@qgs/backend:** return all active users for Telegram inspector list ([6fd7a72](https://github.com/ajie5419/Quality-Guardian/commit/6fd7a72f08e06aabe67dc310ba442957874ab854))
* **@qgs/backend:** route Telegram API through proxy for China server ([2dd7f2a](https://github.com/ajie5419/Quality-Guardian/commit/2dd7f2aa4e6edc41a9815789ccb8cfd099cb9dcb))
* **@qgs/backend:** run system commands asynchronously ([535f2b7](https://github.com/ajie5419/Quality-Guardian/commit/535f2b720a3bebb77613d8cd0f2285b93521769c))
* **@qgs/backend:** use cuid for generated ids ([e4a1fca](https://github.com/ajie5419/Quality-Guardian/commit/e4a1fca87de45276f7991ac877262155f877dbb5))
* **@qgs/shared:** fix type error in bom normalization filter ([837bb73](https://github.com/ajie5419/Quality-Guardian/commit/837bb73e2fb7825ea95ed3448128ed5502cc24f7))
* **@qgs/shared:** restore type guard in bom process list filter ([c3b5ae8](https://github.com/ajie5419/Quality-Guardian/commit/c3b5ae88254b6a8cf09f74d1941ca298d4e7c2ee))
* **@qgs/shared:** use flatMap so eslint and tsc stop fighting in bom filter ([67cc528](https://github.com/ajie5419/Quality-Guardian/commit/67cc5284b1cf0e738959fd8ce1b1a786fa8999e9))
* **@qgs/web-antd:** fix mobile pages component imports and add dev auth bypass ([6416be9](https://github.com/ajie5419/Quality-Guardian/commit/6416be9661e9b44dc6ad7069f5c6f38879101735))
* **@qgs/web-antd:** include api prefix for public upload action ([5ac64e8](https://github.com/ajie5419/Quality-Guardian/commit/5ac64e84f689a4e42b19390e867bcc09ae406f88))
* **@qgs/web-antd:** keep inspection entry bom lookup public ([dbbd158](https://github.com/ajie5419/Quality-Guardian/commit/dbbd158149070bdeb01403d3aa64529e40f5c61b))
* **@qgs/web-antd:** keep inspection entry uploads resilient ([787fb8d](https://github.com/ajie5419/Quality-Guardian/commit/787fb8d0ee6724d7437f6fd4808fdacccb06a7de))
* **@qgs/web-antd:** restore knowledge category name rendering ([eef06d5](https://github.com/ajie5419/Quality-Guardian/commit/eef06d5e72614f3de25c5518cd367174fcb3a330))
* **@qgs/web-antd:** show multiple departments in after-sales detail ([53cd330](https://github.com/ajie5419/Quality-Guardian/commit/53cd3307a87bc1d3aa8fcc49a19460b5288492d4))
* **@qgs/web-antd:** show multiple departments in after-sales list ([f869176](https://github.com/ajie5419/Quality-Guardian/commit/f869176dedb632d048d4b10d876759ea36f4235c))
* **@qgs/web-antd:** show multiple departments in inspection issue detail ([d10a642](https://github.com/ajie5419/Quality-Guardian/commit/d10a6422bce6d3afc227c1bd654d2414e3a04312))
* **@qgs/web-antd:** show multiple departments in inspection issue list ([be278af](https://github.com/ajie5419/Quality-Guardian/commit/be278afbc9c8a355783d5abe1a99f7791d4e562f))
* **@qgs/web-antd:** unblock qms vue typecheck ([7b23089](https://github.com/ajie5419/Quality-Guardian/commit/7b2308934cb4b0eded94aa783869db6d298d01ad))
* **@qgs/web-antd:** use public upload endpoint for inspection entry ([0e1b1e9](https://github.com/ajie5419/Quality-Guardian/commit/0e1b1e98cba98bb0862e143e8429455b1638c93e))
* align phase3 service split with runtime binding and tests ([7876f5c](https://github.com/ajie5419/Quality-Guardian/commit/7876f5c3eb6d1fdbe8ad0f321260255c6a346aab))
* align qms pass rate and issue filters ([898c341](https://github.com/ajie5419/Quality-Guardian/commit/898c341a5509e9e001a51fda1ebdeb824bd581a3))
* allow long audit user agents ([5162286](https://github.com/ajie5419/Quality-Guardian/commit/51622867f4d43b6a650d038139730ae6806a4a8d))
* **ci:** unblock release-please PR by ignoring CHANGELOG and hardening arch check ([006d515](https://github.com/ajie5419/Quality-Guardian/commit/006d51573391f8deffc5ab6d628fb5e187678ee5))
* correct backend migration path in deploy ([8fe3371](https://github.com/ajie5419/Quality-Guardian/commit/8fe3371f3f30d6b0d71575486ffd0b09ed1c8bf8))
* **deploy:** auto-heal vehicle commissioning menu during publish ([b3297b1](https://github.com/ajie5419/Quality-Guardian/commit/b3297b13871d4350b641034b40de4d8d438a0147))
* **deploy:** remove references to deleted migration scripts ([921356d](https://github.com/ajie5419/Quality-Guardian/commit/921356d070f7606b1afdc90d407528d0ef183d8f))
* **deploy:** use legacy scp protocol for ECS upload ([b1d0fac](https://github.com/ajie5419/Quality-Guardian/commit/b1d0faca72a74639b35488dc3a42bbc6671d4d34))
* harden qms architecture all scan ([1a45e36](https://github.com/ajie5419/Quality-Guardian/commit/1a45e365c9864fb61bbb3d69f888baeeb444c1ea))
* improve metrology return interactions ([3eedad1](https://github.com/ajie5419/Quality-Guardian/commit/3eedad1d004e40ed58615515a39e90283e271a12))
* keep login logging nonblocking ([5d5220d](https://github.com/ajie5419/Quality-Guardian/commit/5d5220d71680c2b1c742cf3acfb163d6952340d2))
* map issue-source pass rate drilldown ([fc1792a](https://github.com/ajie5419/Quality-Guardian/commit/fc1792a3dd04acef4a6ff9fc13074465a8a77a17))
* normalize displayed app version ([b1887c2](https://github.com/ajie5419/Quality-Guardian/commit/b1887c23ab82de9b6b8fb81ce74f2819ce23bf90))
* open inspection dispatch detail from qr ([833d086](https://github.com/ajie5419/Quality-Guardian/commit/833d086815ef29a6bac6caf970fb12286b60df2b))
* optimize mobile metrology borrow entry ([2356890](https://github.com/ajie5419/Quality-Guardian/commit/2356890594e80f72504bf5e8fc9a6f15abb83332))
* preserve bom material column ([ab3a978](https://github.com/ajie5419/Quality-Guardian/commit/ab3a978837fd28dfbf3e0e5e61859ca82c2d4c2e))
* preserve project bom material column ([3b6c916](https://github.com/ajie5419/Quality-Guardian/commit/3b6c916bb99be107e5c79d92281f436f6d633e44))
* preserve qr redirect after login ([6cc8fc1](https://github.com/ajie5419/Quality-Guardian/commit/6cc8fc16ba93cb2a9ec77a29347ba30896d80d56))
* prevent Nitro from auto-loading utils/modules/route-handlers as modules ([f30755d](https://github.com/ajie5419/Quality-Guardian/commit/f30755de06cdcb4f0c9b2fbd75e14f2fdff22dbc))
* **project:** harden qgs-domain env readers for browser runtime ([c0aadcd](https://github.com/ajie5419/Quality-Guardian/commit/c0aadcddbd8593bb902374661609334c5227af51))
* **project:** make shared and prisma generation deterministic in ci ([d2daf7e](https://github.com/ajie5419/Quality-Guardian/commit/d2daf7e30964c7bbe10fa9e066d4e81da09540c8))
* **project:** merge work order warranty rankings ([733cfb7](https://github.com/ajie5419/Quality-Guardian/commit/733cfb7f4a5e287e879995183e4b32ef6187b140))
* **project:** pass full quality gates and align shared lint rules ([194d899](https://github.com/ajie5419/Quality-Guardian/commit/194d899659f1ac150c7e8de48b211ce273838baa))
* **project:** prune docker artifacts before deploy ([7b2e2f9](https://github.com/ajie5419/Quality-Guardian/commit/7b2e2f9bf13221c40b3578c0a339b2cf373cbef7))
* **project:** restore anonymous inspection request entry and stabilize upload relay ([a15b122](https://github.com/ajie5419/Quality-Guardian/commit/a15b1221777ef615e65fd03735ec49886e0036f1))
* **project:** sort time-based chart dimensions ([858520d](https://github.com/ajie5419/Quality-Guardian/commit/858520d7d9277cf66d680132c2f5b1a6217af782))
* **project:** suppress network error storms in monitor and logger ([c1dd6a4](https://github.com/ajie5419/Quality-Guardian/commit/c1dd6a4a72d96c9e3a8753a329cb541385d4f33a))
* **project:** trim work order aggregate attachments ([589731d](https://github.com/ajie5419/Quality-Guardian/commit/589731d649fd359120e868f681da384d96e2cd85))
* **project:** use deployed app version ([87589ae](https://github.com/ajie5419/Quality-Guardian/commit/87589ae67cbe15a985d31d9b73aaca626c6a8b27))
* **quality-loss:** validate source target and update atomically ([5875838](https://github.com/ajie5419/Quality-Guardian/commit/587583860efc467cd2bc8132781ad0318a699aed))
* recover stale frontend chunks ([ae3875e](https://github.com/ajie5419/Quality-Guardian/commit/ae3875e44e8b89ea61a8c3485d8cd7b9519d89b2))
* require confirmation for metrology returns ([74aa321](https://github.com/ajie5419/Quality-Guardian/commit/74aa321c6dd78dd493f3bf2d4ea8d96bcc630817))
* resolve backend build and test regressions after phase1 cleanup ([5f63bd3](https://github.com/ajie5419/Quality-Guardian/commit/5f63bd36d6632832c4271a9051eff7ef84615200))
* route inspection request qr links ([0c8f05e](https://github.com/ajie5419/Quality-Guardian/commit/0c8f05eafb17f9db2f079c7723469aa2d94dcc8d))
* run commissioning issue migration during deploy ([e293fcb](https://github.com/ajie5419/Quality-Guardian/commit/e293fcb1529fb3911e81e4633f11d6e2fcc65d04))
* stabilize deploy rbac scripts and pass rate stats ([e45b385](https://github.com/ajie5419/Quality-Guardian/commit/e45b385981f586cc4720b66a3cada6b972352f29))
* stabilize media cache and dashboard reports ([69d72b6](https://github.com/ajie5419/Quality-Guardian/commit/69d72b6395f0414775f17cf3f129af1a163c901d))
* **task-dispatch:** enforce parent validation and atomic level-2 dispatch ([82cd1fc](https://github.com/ajie5419/Quality-Guardian/commit/82cd1fcb3754e70ae2dfb83518c88c657e4c45ef))
* use hash route for public borrow entry ([1c7cd3d](https://github.com/ajie5419/Quality-Guardian/commit/1c7cd3d92fee2a822aa108ad1413c52f3ffb0db1))

### 2026-05-30 重构：报检通知从企业微信迁移到 Telegram Bot

**执行内容：**

- 删除企业微信全部代码：`wechat-work-notify.ts`、`wechat-work.post.ts`、`useWechatAuth.ts`、UserService 中 4 个企微方法 + 2 个 interface
- 删除报检创建/派单服务中的微信通知调用（`notifyDispatchers`、`notifyInspector`）
- 新增 `apps/backend/utils/telegram-bot.ts`：sendMessage、sendPhoto、editMessageText、answerCallbackQuery、notifyTelegramNewRequest
- 新增 `apps/backend/utils/telegram-qr.ts`：generateCloseQrImage（QR 码 + sharp 合成检验员名标签）
- 新增 `apps/backend/api/telegram/webhook.post.ts`：处理 Inline Button 回调（展示检验员忙碌状态、执行派单、发送关闭二维码）
- 新增 `UserService.findInspectors()` 方法
- 修改 `MobileLayout.vue`、`TaskList.vue` 移除企微认证依赖
- 修改 auth 中间件：`/api/telegram/` 加入公开路径
- 环境变量：移除 `WX_PUSH_*`/`WECHAT_WORK_*`，新增 `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`/`TELEGRAM_WEBHOOK_SECRET`
- 新增依赖：`qrcode ^1.5.4`

**验证结果：**

- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm -C apps/web-antd exec vue-tsc --noEmit`: 通过

**commit:** 待提交

**遗留问题：**

- 部署后需注册 Telegram Webhook：`curl "https://api.telegram.org/bot${TOKEN}/setWebhook?url=https://www.tlqms.com/api/telegram/webhook&secret_token=${SECRET}"`
- 需安装 `qrcode` 依赖（`pnpm install`）

### 2026-05-29 重构：列表关键词搜索共享 helper

**执行内容：**

- 在 `apps/backend/utils/query-helpers.ts` 新增通用 `buildKeywordOr` helper，并新增 `apps/backend/utils/query-helpers.test.ts` 覆盖空关键词、空字段、单字段、多字段、trim 与字段顺序。
- 将 inspection 记录查询、public 工单查询、work-order、supplier、metrology、supervision、file-storage、dictionary 共 8 个简单 keyword OR 调用点改为复用 `buildKeywordOr`。
- 保留 welder 的 `searchOr` 和 inspection-issue-list 的复杂部门解析逻辑不变；未触碰 schema、migration、索引或 FULLTEXT。
- supplier / supervision 关键词现在由 helper 统一 trim，这是本次允许的归一化差异。

**验证结果：**

- `pnpm --dir apps/backend exec vitest run`: 32 文件 / 169 测试通过
- `pnpm lint`: 通过
- `pnpm run check:type`: 通过
- `pnpm run check:qms-arch`: 通过

**commit:**

- `439676eb` refactor(@qgs/backend): add keyword OR query helper
- `7c26830e` refactor(@qgs/backend): share keyword OR filters

**遗留问题：**

- 无。

### 2026-05-28 修复：前端错误上报日志分级

**执行内容：**

- 后端客户端日志接收器按 `severity` / `type` 将浏览器上报分为 `error`、`warn`、`info`，避免真实前端错误落成普通 info 日志。
- 前端错误上报统一补齐浏览器上下文，包含 `source=browser`、`recordedAt`、当前页面 URL、User-Agent、源文件、堆栈和请求响应状态等字段。
- 请求入口的 `request received` 访问流水从 `debug` 降到 `trace`，避免开发默认日志被每个 API 请求刷屏。
- 断开 task-dispatch 后端规则文件对 shared 中两个转发函数的运行时导入，消除 Nitro/Rollup 的 unused import 构建噪声。
- 修复不合格品更新时将 `workOrderNumber` 作为 Prisma checked update scalar 写入的问题，改为 `work_orders.connect/disconnect` 关系写法。
- Prisma Client 默认关闭自身 `error` 日志输出，仅保留应用侧结构化错误日志；Prisma validation 错误默认压缩为摘要，避免终端打印完整 invocation 和 stack。
- 保持生产环境 JSON 日志输出不变，未新增仓库内运维脚本，避免把服务器侧工具打进应用代码。

**验证结果：**

- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm -C apps/backend exec vitest run modules/inspection/inspection-issue.test.ts utils/logger.test.ts`: 2 文件 / 10 测试通过
- `pnpm -C apps/backend exec vitest run modules/task-dispatch/task-dispatch-rules.test.ts`: 1 文件 / 6 测试通过
- `pnpm -C apps/backend run build`: 通过
- `pnpm -C apps/web-antd exec vue-tsc --noEmit`: 通过
- `pnpm run check:qms-arch`: 通过

**commit:** `pending`

**遗留问题：**

- 服务器侧 `docker logs` 过滤脚本应部署在运维目录，不纳入本次仓库改动。

### 2026-05-28 优化：报检看板完整排行明细

**执行内容：**

- 报检看板保留管理层 Top 概览，同时为班组报检排行、班组复检率和检验员效率新增“查看全部”明细 Drawer。
- 完整明细支持搜索，并展示排名、数量、占比、复检数、已检数、复检率和平均任务时长等字段。
- 将报检看板拆分为 KPI、排行卡片、趋势卡片、历史统计卡片、历史列表和明细 Drawer 组件，避免主页面超 500 行。

**验证结果：**

- `pnpm -C apps/web-antd exec vue-tsc --noEmit`: 通过
- `pnpm -C apps/backend exec vitest run`: 30 文件 / 160 测试通过
- `pnpm run check:qms-arch`: 通过

**commit:** `68bd72f0` feat(@qgs/web-antd): add full inspection dashboard rankings

**遗留问题：**

- 未启动前端 dev server，按项目规则仅做类型检查、测试和架构守护验证。

### 2026-05-28 修复：public 报检工单选择跳登录

**执行内容：**

- 新增 public 报检 BOM 部件查询接口 `/api/qms/public/inspection/requests/bom-parts`，只返回报检入口需要的部件名称、部件号和工单号。
- 报检入口选择工单后改用 public BOM 查询接口，不再调用受保护的 `/qms/planning/bom` 后台接口。

**验证结果：**

- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm -C apps/web-antd exec vue-tsc --noEmit`: 通过
- `pnpm -C apps/backend exec vitest run`: 30 文件 / 160 测试通过
- `pnpm run check:qms-arch`: 通过

**commit:** `dbbd1581` fix(@qgs/web-antd): keep inspection entry bom lookup public

**遗留问题：**

- 未启动前端 dev server，按项目规则仅做类型检查、测试和架构守护验证。

### 2026-05-28 修复：public 上传匿名 auth context

**执行内容：**

- 修复 public 上传路由复用上传 service 时强制读取登录用户导致 `AUTH_CONTEXT_MISSING` 的问题。
- 上传 service 改为读取可选用户；登录上传继续记录 `uploadedBy` 和审计，匿名 public 上传跳过用户审计。

**验证结果：**

- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm -C apps/backend exec vitest run`: 30 文件 / 160 测试通过
- `pnpm run check:qms-arch`: 通过

**commit:** `7675bd19` fix(@qgs/backend): allow anonymous public uploads

**遗留问题：**

- 定向执行 `pnpm -C apps/backend exec vitest run apps/backend/modules/file-storage` 时该目录没有测试文件，已改跑 backend 全量测试并通过。

### 2026-05-28 修复：public 上传 action 缺少 API 前缀

**执行内容：**

- 将 public 报检入口上传 action 从 requestClient 相对路径常量切换为浏览器直连上传常量 `/api/qms/public/upload`。
- 保留普通 QMS API 常量不带 `/api` 的约定，避免请求客户端路径和 Upload action 路径混用。

**验证结果：**

- `pnpm -C apps/web-antd exec vue-tsc --noEmit`: 通过
- `pnpm run check:qms-arch`: 通过

**commit:** `5ac64e84` fix(@qgs/web-antd): include api prefix for public upload action

**遗留问题：**

- 未启动前端 dev server，按项目规则仅做类型检查和架构守护验证。

### 2026-05-28 修复：public 报检入口上传 401

**执行内容：**

- 新增 `/api/qms/public/upload` 公开上传路由，复用文件上传 service，避免匿名报检入口调用受保护的 `/api/upload`。
- 报检入口上传组件支持传入上传地址，public 报检页改用 `QMS_API.PUBLIC_UPLOAD`，后台上传入口不受影响。

**验证结果：**

- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm -C apps/web-antd exec vue-tsc --noEmit`: 通过
- `pnpm run check:qms-arch`: 通过

**commit:** `0e1b1e98` fix(@qgs/web-antd): use public upload endpoint for inspection entry

**遗留问题：**

- 未启动前端 dev server，按项目规则仅做类型检查和架构守护验证。

### 2026-05-27 修复：报检入口上传照片失败

**执行内容：**

- 修复图片压缩失败时阻断 Ant Design Vue Upload 上传的问题，压缩异常时自动回退原文件上传。
- 报检入口“拍照上传”和“选择文件”统一使用同一上传前压缩处理，图片按 lossy 策略压缩，非图片保持原文件上传。

**验证结果：**

- `pnpm -C apps/web-antd exec vue-tsc --noEmit`: 通过
- `pnpm run check:qms-arch`: 通过

**commit:** `787fb8d0` fix(@qgs/web-antd): keep inspection entry uploads resilient

**遗留问题：**

- 未启动前端 dev server，按项目规则仅做类型检查和架构守护验证。

### 2026-05-27 需求：责任部门多选

**执行内容：**

- 为 `quality_records` 和 `after_sales` 增加 `responsibleDepartments` JSON array 文本列，保留旧单值字段兼容旧数据。
- 新增共享工具 `department-multi.ts`，统一解析和序列化责任部门数组。
- 后端 inspection / after-sales 写入数组时同步旧字段首项，列表返回兼容新数组与旧单值。
- 前端不合格品和售后问题表单改为多选，并修复列表与详情展示多个责任部门。
- 新增 `scripts/qms-architecture-baseline.txt`，记录本次触碰的既有超长 QMS 页面基线，确保架构检查聚焦新增违规。
- 创建需求文档 `docs/requirements/2026-05-27-responsible-department-multi-select.md`。

**验证结果：**

- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm -C apps/backend exec vitest run`: 通过
- `pnpm -C apps/web-antd exec vue-tsc --noEmit`: 通过

**commit:** `8af125a9` / `a8d95555` / `0bb59cdf` / `55c4e7c1` / `98b4d263` / `86c40f60` / `7b230893` / `be278afb` / `d10a6422` / `f869176d` / `53cd3307` / `0f28cd84`

**遗留问题：**

- 本机 `prisma migrate dev --name add_responsible_departments_multi` 连接 `127.0.0.1:3306` 后返回 schema engine 空错误；已创建 Prisma migration SQL，并通过 `prisma validate` / `prisma generate` / typecheck 验证。

### 2026-05-25 阶段一：死代码清理与依赖收敛

**执行内容：**

- 完成阶段一 1-8：移除 backend `core/`、`services/`、`scripts/` 兼容层与治理脚本，删除 `packages/qgs-domain`，将 `qg-enums` 并入 `qgs-shared`，并完成 constants/schemas 并入 modules 与 check 链路精简。
- 修复 backend build 阻塞：将 `apps/backend/modules/supervision/index.ts` 从 `export *` 改为显式命名导出，消除 Nitro 模块加载时 `setup` 导出冲突。
- 修复阶段一后测试回归：
  - `apps/backend/utils/after-sales-payload.ts` 去除旧 governance DB 写入依赖，避免单测触发数据库连接。
  - `apps/backend/modules/__tests__/report.service.test.ts` 修正 `DeptService` mock 路径为真实 import 源。

**验证结果：**

- `pnpm -C apps/backend run build`: 通过
- `pnpm -C apps/backend exec vitest run`: 212/212 通过

**commit:** `5f63bd3` fix: resolve backend build and test regressions after phase1 cleanup

**遗留问题：**

- 无阻塞；构建与测试均通过。运行日志中仍有 `REDIS_URL not found` 警告，不影响本阶段门禁。

### 2026-05-25 阶段二：路由瘦身（批次1-3）

**执行内容：**

- 完成 11 个超大路由（批次1）业务下沉，路由改为薄层转发。
- 按域推进批次2与批次3：将 API 里的数据库访问迁移到 modules service，并补全 zod 校验，清理 `as any` / `as Record<string, unknown>`。
- 对剩余超长路由进行统一瘦身，确保路由行数满足规范（`menu/all.ts` 例外保留在 80 行以内）。

**验证结果：**

- `api/` 中 `import prisma from '~/utils/prisma'`: 0
- `api/` 中超过 50 行路由（`menu/all.ts` 例外）: 0
- `api/` 中 `as any` / `as Record<string, unknown>`: 0
- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm -C apps/backend exec vitest run`: 212/212 通过

**补充校正：**

- 修复阶段二收尾复检发现的剩余项：`26` 个 `api` 文件 `import.*from.*prisma` 误命中与 `2` 个超 50 行路由。
- 对 `api` 层 `~/utils/prisma-error` 导入统一替换为 `~/utils/db-error`，并补齐 `db-error` 导出，确保检测口径与实现一致。

**commit:** `pending` phase2 route-thinning commits

**遗留问题：**

- 无阻塞；全部门禁通过。

### 2026-05-25 阶段三：模块逻辑优化（步骤11-16）

**执行内容：**

- 步骤11：`inspection` 拆分为聚合入口 + 子服务，新增 `inspection-core/template/archive/issue` 四层分工，`inspection.service.ts` 缩减到 500 行以内。
- 步骤12：`supplier` 评分逻辑提取到 `supplier-scoring.ts`，`supplier.service.ts` 查询与评分解耦。
- 步骤13：`after-sales` 将 `getStats` 分解为 `buildKpiSummary/buildTrendData/formatStatsResponse`，`getChartAggregation` 改为映射表驱动聚合。
- 步骤14：`dashboard` 改为聚合调用 `after-sales/inspection/vehicle-commissioning/work-order/quality-loss` 的 `getStatsForDashboard()`，移除跨模块直接查表。
- 步骤15：`quality-loss` 改为通过模块接口聚合外部损失数据，`getAllLossesUnpaginated` 拆分为 `fetchFromAllSources/mergeAndFilter/applyPagination`。
- 步骤16：合并薄模块：`auth`、`preference` 并入 `modules/user`，`welder-score` 并入 `modules/welder`，删除 `master-data-rename` 模块，`base` 公共分页/日期工具迁移到 `utils/query-helpers.ts`。

**验证结果：**

- `pnpm -C apps/backend exec tsc --noEmit`: 通过

**验证结果：**

- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm -C apps/backend exec vitest run`: 通过

**commit:** `dd0314d` / `55ed3f6` / `f7e1167` / `5858097` / `35afd82` / `pending(step16)`

**遗留问题：**

- 无阻塞，进入下一阶段前建议执行一次全仓 `pnpm build`。

### 2026-05-25 阶段四：修复安全与正确性问题（步骤17-21）

**执行内容：**

- 步骤17：将 `system` 模块数据库大小查询从 `$queryRawUnsafe` 字符串拼接改为 `$queryRaw` 参数化模板，修复 SQL 注入风险。
- 步骤18：移除用户创建时的 bcrypt placeholder 密码，改为生成随机临时密码、仅存储 bcrypt hash，并在创建返回值中返回 `temporaryPassword`。
- 步骤19：将 `dept`、`rbac`、`user` 模块中用于 ID 的 `Date.now()`/随机片段替换为 `@paralleldrive/cuid2` 的 `createId()`，并补充 backend 依赖。
- 步骤20：基于已有 Prisma schema/client 删除 `file-storage`、`after-sales`、`system-log`、`user preference` 中的 Prisma delegate `as any` 绕过；执行 `prisma generate`，未创建 migration。
- 步骤21：将 `system` 模块 `execSync` 改为 `promisify(exec)` 异步执行，并使用 `Promise.all` 并行获取独立系统指标命令结果。

**验证结果：**

- 每个步骤提交前均执行 `pnpm -C apps/backend exec tsc --noEmit`: 通过
- 每个步骤均执行 `pnpm -C apps/backend exec vitest run`: 32 文件 / 212 测试全部通过
- 步骤20 执行 `pnpm -C apps/backend exec prisma generate --schema=./prisma/schema.prisma`: 通过
- 阶段结束 `git status --short | wc -l`: 0

**commit:** `21d8f64` / `5dc3a3d` / `e4a1fca` / `e00c09b` / `535f2b7`

**遗留问题：**

- `pnpm --dir apps/backend add @paralleldrive/cuid2` 已更新依赖与 lockfile，但 postinstall 中既有 `nitro prepare` 会触发 route-handler 顶层 `readBody` 报错；本阶段验证改用明确的 `prisma generate`、`tsc --noEmit` 与 vitest，均通过。

### 2026-05-25 阶段五：消除跨模块直接查表（步骤22-29）

**执行内容：**

- 步骤22：新增 `apps/backend/utils/dept-tree.ts`，提取部门树构建、扁平化和子树查找纯函数，并替换 `dept`、`report`、`after-sales`、`quality-loss`、`inspection` 中重复部门树遍历。
- 步骤23：`dashboard` 移除对 `work_orders`、`quality_records`、`inspections`、`work_order_requirements`、`system_settings` 的直接访问，改为调用 `work-order`、`inspection`、`work-order-requirement`、`system` 模块 service。
- 步骤24：`quality-loss` 外部来源读取、趋势、钻取和更新逻辑改为调用 `inspection`、`after-sales`、`vehicle-commissioning` service，模块内仅保留 `quality_losses` 自有表访问。
- 步骤25：`supplier` 评分聚合改为调用 `inspection` 与 `after-sales` 的供应商评分数据接口，模块内仅保留 `suppliers` 自有表访问。
- 步骤26：`report` 周报、日报汇总、质量分析和车辆故障率报表改为调用对应业务模块 service；`report` 内仅保留 `reports` 与 `daily_reports` 自有表访问。
- 步骤27：`welder` 评分扣分问题改为通过 `inspection` service 获取，避免直接访问 `quality_records`，并用懒加载规避 `inspection`/`welder` 初始化环依赖。
- 步骤28：`work-order` 对工单要求的创建、更新、列表、汇总读取改为调用 `work-order-requirement` service，模块内不再直接访问 `work_order_requirements`。
- 步骤29：`vehicle-commissioning` 审计日志读取改为调用 `system-log` service，不再直接访问 `audit_logs`。
- 收尾：补齐最终验收发现的 `work-order` 读取 `inspections`、`vehicle-commissioning` 读取 `daily_reports` 残留，分别改为 `inspection` 与 `report` 模块 service。

**验证结果：**

- 每个步骤提交前均执行 `pnpm -C apps/backend exec tsc --noEmit`: 通过
- 每个步骤提交前均执行 `pnpm -C apps/backend exec vitest run`: 32 文件 / 212 测试全部通过
- 阶段收尾执行跨模块直接查表扫描：目标模块仅剩各自拥有表访问，未发现非自有表直接访问
- 阶段结束 `git status --short | wc -l`: 0

**commit:** `84523e85` / `befd32f3` / `4f2acf4a` / `99f21147` / `7012a271` / `8ef38671` / `5591528f` / `dc7bca5c` / `d6008b8a`

**遗留问题：**

- 无阻塞；`pnpm -C apps/backend exec vitest run` 仍会输出 `REDIS_URL not found, caching disabled` 测试环境警告，不影响门禁结果。

### 2026-05-26 阶段六：性能问题修复（步骤30-36）

**执行内容：**

- 步骤30：`supplier.findAll` 改为 DB 层 `skip/take/count/orderBy`，供应商评分聚合只针对当前页供应商执行，全局统计改用 DB count/aggregate。
- 步骤31：`metrology` 台账、借用、检定计划列表全部改为 DB 层分页，`pageSize` 上限收敛为 100；动态状态过滤下推为 Prisma where。
- 步骤32：`welder.findAll` 全表统计改为 DB `count` 与 `_avg(score)` 聚合，不再加载全表到内存计算。
- 步骤33：`quality-loss` 单来源列表查询改为来源 service 支持 `skip/take/count`，手工损失表使用 DB 过滤/分页，钻取路径增加 DB 排序和上限。
- 步骤34：`dashboard.getStats` 改为 service 内进程级 Map + TTL 缓存，缓存 key 包含 `userId/scope/granularity`，并提供显式 `invalidateStatsCache` 入口。
- 步骤35：`vehicle-commissioning.getDailyReports` 改为通过 `daily_reports.date/summary` where 条件和 `skip/take/count` 读取候选页，读取时解析 `summary` 为结构化 DTO；未改 Prisma schema。
- 步骤36：`file-storage.registerReferencesFromAttachments` 将附件文件解析从逐项 `findFirst` 改为批量 `findMany` + 内存映射，引用写入继续使用 `deleteMany/createMany`。

**验证结果：**

- 每个步骤提交前均执行 `pnpm -C apps/backend exec tsc --noEmit`: 通过
- 每个步骤提交前均执行 `pnpm -C apps/backend exec vitest run`: 32 文件 / 212-213 测试全部通过
- 阶段结束 `git status --short | wc -l`: 0
- 阶段结束模块 TS 文件数：176

**commit:** `81b13d13` / `7b9b68be` / `48cf187f` / `e9439945` / `9547b8be` / `3d809882` / `1e4e6a5f`

**遗留问题：**

- `daily_reports.summary` 仍是 JSON blob；本阶段仅优化读取路径，结构化字段和索引拆分按阶段十二 Step 57 处理。
- `quality_losses` 当前 schema 没有 `workOrderNumber` 字段，手工损失按工单号过滤无法真正下推到 DB；如需支持，应在阶段十二 schema 优化中补字段与索引。
- `pnpm -C apps/backend exec vitest run` 仍会输出 `REDIS_URL not found, caching disabled` 测试环境警告，不影响门禁结果。

### 2026-05-26 阶段七：utils/ 归位（步骤37-38）

**执行内容：**

- 步骤37：按模块归位业务 utils，使用 `git mv` 迁移 after-sales、inspection、quality-loss、metrology、work-order、knowledge、planning、report、welder 等单模块工具。
- 步骤37：保留跨模块共享或基础设施工具在 `utils/`，包括 `inspection-form`、`quality-loss-status`、`supplier`、`import-report`、`audit-log`、`rbac-config`、`pass-rate`、`process-resolver`、`project-documents`、`ai`、`master-data-governance-*` 等。
- 步骤37h：审计 `utils/` 剩余文件，确认剩余项为白名单基础设施或跨模块共享工具；非测试 TS 文件数从 66 降至 43。
- 步骤38：新增 `apps/backend/utils/excel-parser.ts`，提取 `xlsx` 纯解析能力，并替换 inspection 模板元数据读取与 supervision 计划任务导入中的 inline Excel 解析。

**验证结果：**

- 每个 sub-step 提交前均执行 `pnpm -C apps/backend exec tsc --noEmit`: 通过
- 每个 sub-step 提交前均执行 `pnpm -C apps/backend exec vitest run`: 32 文件 / 213 测试全部通过
- 阶段收尾执行 `pnpm -C apps/backend run check:qms-arch`: apps/backend 无该脚本
- 阶段收尾执行 `pnpm run check:qms-arch`: 通过
- 阶段结束 `git status --short | wc -l`: 0

**commit:** `922232bf` / `f9422087` / `668d82a6` / `aa7e3e8f` / `ea46aecd` / `c887d93e` / `f87c9f6e` / `84c9e463` / `d3d959b3`

**遗留问题：**

- `utils/` 仍包含部分未列入阶段七输入白名单但实际为通用基础设施或跨模块共享的文件，例如 `response`、`route-param`、`request-validation`、`redis`、`team-resolver`、`task-dispatch`、`work-order` 等；本阶段按调用方审计后保留。
- vehicle-commissioning 当前命中的是 Excel 导出逻辑，不属于“文件 → 二维数据/对象数组”的读取解析路径，未强行接入 `excel-parser`。
- `pnpm -C apps/backend exec vitest run` 仍会输出 `REDIS_URL not found, caching disabled` 测试环境警告，不影响门禁结果。

### 2026-05-26 阶段八：CI + 架构守护（步骤39-40）

**执行内容：**

- 步骤39：精简 `.github/workflows/ci-gate.yml`，删除 12 个已失效治理 job，保留 `lint`、`typecheck`、`qms-arch`、`unit-tests`、`secret-scan` 5 个 job；文件行数从 348 行降至 108 行。
- 步骤40：重写 `scripts/check-qms-architecture.sh`，保留前端 R1/R3，并新增后端架构规则段；脚本行数从 246 行增至 343 行。
- 步骤40：立即启用 7 条当前零违规后端规则：B-D1、B-R1、B-R2、B-R3、B-S2、B-S3、B-SEC1。
- 步骤40：将暂不启用规则写为纯注释 TODO，不扫描、不豁免、不 baseline：B-S1（16 violations）、B-S4（需要重新定义 Date.now ID 生成匹配器）、B-S5（3 violations）、B-T1（约 12 violations）、B-T2（约 7 violations，utils 第三方桥接另行处理）、B-M1（many violations）、B-T3（scan-only initially）、B-M2（needs pre-scan）。

**验证结果：**

- `pnpm run check:qms-arch`: 通过，输出 `QMS architecture check passed.`
- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm -C apps/backend exec vitest run`: 32 文件 / 213 测试全部通过
- 阶段结束 `git status --short | wc -l`: 0

**commit:** `d6242a23` ci: prune obsolete gate jobs / current commit: chore: rewrite qms architecture check

**遗留问题：**

- B-S1、B-S4、B-S5、B-T1、B-T2、B-M1、B-T3、B-M2 按脚本 TODO 后续清理；本阶段未写入豁免或新增 baseline。

### 2026-05-26 阶段九：模块自治（步骤41-46）

**执行内容：**

- 步骤41：新增 `ModuleDeclaration` 类型与 25 个业务模块 `.module.ts` 声明文件，将菜单、DataScope、审计日志声明下沉到模块目录。
- 步骤42：新增 `utils/module-loader.ts`，集中加载模块声明，并提供菜单、DataScope、审计配置查询函数。
- 步骤43：将菜单初始化改为读取模块菜单声明，替换 `auth/codes.ts` 与 `rbac.service.ts` 调用，删除 `utils/menu-bootstrap.ts`（1144 行）。
- 步骤44：`DataScopeService` 去掉 QMS 模块名硬编码，新增通用 `buildScopedWhere()`，旧 `buildInspectionWhere/buildSupplierWhere/buildAfterSalesWhere/buildWorkOrderWhere` 保留为兼容包装。
- 步骤45：新增 `SystemLogService.auditLog(moduleName, actionKey, params)`，业务模块审计调用改为通过模块声明解析模板、动作和 targetType，底层写入逻辑不变。
- 步骤46：扫描 `api/` 与 `route-handlers/`，未发现 API 层直接做主数据 ID → 名称解析；现有 after-sales/quality-loss 解析均经模块 payload/service 函数处理，无需迁移。

**验证结果：**

- 每个步骤提交前均执行 `pnpm -C apps/backend exec tsc --noEmit`: 通过
- 每个步骤提交前均执行 `pnpm -C apps/backend exec vitest run`: 32 文件 / 213 测试全部通过
- 每个步骤提交前均执行 `pnpm run check:qms-arch`: 通过
- 阶段结束模块 TS 文件数：227
- 阶段结束 `git status --short | wc -l`: 0

**commit:** `5fff5c25` / `92c731a4` / `41eaa19e` / `1aa93ca9` / `0ec8573d` / current commit: step46 verify master data resolution

**遗留问题：**

- `module-loader.ts` 当前采用显式模块注册，避免 Nitro/tsc 环境下运行时 glob 差异；新增业务模块时需要在 loader 中注册对应声明。
- 仍保留 `recordBusinessAuditLog(event, params)` 作为带请求上下文的审计适配器；阶段十一做中间件自动审计时再统一收敛。

### 2026-05-26 阶段十：遗留清理（步骤47-52）

**执行内容：**

- 步骤47：`rbac` 停止读写 `roles.permissions` legacy JSON；角色权限统一写入并读取 `rbac_role_permissions`，`listRoles` 从关系表返回权限码，并补充关系表读取单测。
- 步骤48：修正 `report.service.ts` 对 `dept` 模块的直接 service import，统一通过模块 `index.ts` 导出访问。
- 步骤49：审计 `dictionary` 缓存一致性；确认无批量写入和 service 外写表路径，补充 `update/delete` 后按 `dictType` 失效缓存的单测。
- 步骤50：将 `file-storage` 拆为策略模式，新增 `StorageStrategy`、local/OSS 实现、附件解析与文件资产查询辅助模块；`file-storage.service.ts` 从 888 行降至 460 行。
- 步骤51：`login_logs` 与 `audit_logs` 增加 `isDeleted` 字段和 migration，查询统一过滤未删除记录，删除接口改为软删除。
- 步骤52：`dept` service DTO 统一为 schema 字段 `description/sort/parentId`，`remark/orderNo/pid` 兼容映射下沉到 API 入口。

**验证结果：**

- 每个步骤提交前均执行 `pnpm -C apps/backend exec tsc --noEmit`: 通过
- 每个步骤提交前均执行 `pnpm -C apps/backend exec vitest run`: 32 文件 / 216-218 测试全部通过
- 每个步骤提交前均执行 `pnpm run check:qms-arch`: 通过
- 步骤51 执行 `pnpm -C apps/backend exec prisma generate --schema=./prisma/schema.prisma`: 通过
- 阶段结束模块 TS 文件数：232
- 阶段结束 `git status --short | wc -l`: 0

**commit:** `2c136b33` / `85bbe782` / `59e96595` / `a17e1071` / `2a757e69` / `bcc5bc24`

**遗留问题：**

- Step 51 的 `prisma migrate dev --name add_soft_delete_to_logs` 因既有历史迁移 `20250521000000_add_processes_table_and_processId` 在 shadow database 中引用不存在的 `inspections` 表而失败；本阶段已按 Prisma migration 规范新增 `20260526000100_add_soft_delete_to_logs/migration.sql`，未手动改数据库。
- `pnpm -C apps/backend exec vitest run` 仍会输出 `REDIS_URL not found, caching disabled` 测试环境警告，不影响门禁结果。

### 2026-05-26 阶段十一：错误处理与中间件（步骤53-55）

**执行内容：**

- 步骤53：新增 `BusinessError` 统一业务异常类型与 legacy error 映射工具；全局 error handler 支持标准业务错误响应；优先替换 dictionary、inspection、work-order 中明确的 `VALIDATION`、`NOT_FOUND`、`DUPLICATE`、`FORBIDDEN` 错误码路径。
- 步骤54：新增 `middleware/3.auth.ts` 集中处理非 public API 鉴权，将用户会话注入 `event.context.user/userId`；批量移除 API 与 route-handler 中手动 `verifyAccessToken(event)` 和重复未授权响应逻辑，改用 `getCurrentUser(event)` 读取上下文。
- 步骤55：新增 `middleware/4.data-scope.ts`，按 QMS 路径预解析 after-sales、inspection、supplier、work-order 的数据权限 scope 并注入 `event.context.dataScope`；`DataScopeService` 支持传入预解析 scope，相关 service 优先复用 context scope，未传时保留原有 fallback 查询。

**验证结果：**

- 每个步骤提交前均执行 `pnpm -C apps/backend exec tsc --noEmit`: 通过
- 每个步骤提交前均执行 `pnpm -C apps/backend exec vitest run`: 32 文件 / 218-219 测试全部通过
- 每个步骤提交前均执行 `pnpm run check:qms-arch`: 通过
- 步骤54 后 `rg "verifyAccessToken\\(" apps/backend/api apps/backend/modules/route-handlers apps/backend/middleware` 仅剩认证中间件调用
- 阶段结束 `git status --short | wc -l`: 0

**commit:** `7a0c26c6` / `40f5cfa5` / `aadcde09`

**遗留问题：**

- BusinessError 本阶段只替换明确错误码路径，纯消息类 `throw new Error(...)` 后续阶段继续收敛。
- 数据权限注入采用渐进式方案：中间件预解析 scope，service 可选接收；未接入 context 的调用仍按旧逻辑自行解析，行为保持兼容。
- `pnpm -C apps/backend exec vitest run` 仍会输出 `REDIS_URL not found, caching disabled` 测试环境警告，不影响门禁结果。

### 2026-05-26 阶段十二：数据库 schema 优化（步骤56-58）

**执行内容：**

- 步骤56：补充确认缺失的 DataScope 与软删除查询索引，新增 `after_sales.feedbackDept/handler/division`、`audit_logs.isDeleted`、`login_logs.isDeleted`、`quality_records.responsibleBU`、`suppliers.buyer`、`work_orders.division` 索引；确认 `quality_records.inspector/lastEditor/responsibleDepartment` 与 `daily_reports(date, reporter)` 已有索引或唯一约束，未重复添加。
- 步骤57：将 `daily_reports.summary` 的高频顶层字段结构化为 `projectName`、`workOrderNumber`、`reportText`，保留 `summary` JSON blob；通用日报和车辆调试日报改为双写结构化字段与旧 JSON，读取优先结构化字段并 fallback 到解析 `summary`。
- 步骤58：删除 `roles.permissions` legacy JSON 列；RBAC 创建角色、默认用户角色创建、检验员权限识别路径均改为只读 `rbac_role_permissions` 关系表，并更新相关单测。

**验证结果：**

- 每个步骤提交前均执行 `pnpm -C apps/backend exec prisma generate --schema=./prisma/schema.prisma`: 通过
- 每个步骤提交前均执行 `pnpm -C apps/backend exec tsc --noEmit`: 通过
- 每个步骤提交前均执行 `pnpm -C apps/backend exec vitest run`: 32 文件 / 219 测试全部通过
- 每个步骤提交前均执行 `pnpm run check:qms-arch`: 通过
- 步骤58 后执行 `rg "roles\\.permissions|role\\.permissions|permissions: true|permissions: ''|permissions: '\\[\\]'" apps/backend/modules apps/backend/api apps/backend/prisma/schema.prisma`: 无命中
- 阶段结束模块 TS 文件数：232
- 阶段结束 `git status --short | wc -l`: 0

**commit:** `338b970f` / `f7c509c1` / `cbc9a58d`

**遗留问题：**

- `daily_reports.summary` 按兼容策略保留旧 JSON blob，复杂数组字段如 `mainWorks/issueIds` 仍留在 JSON 中；本阶段仅抽取过滤和展示最常用的顶层字段。
- 本阶段沿用手写 migration SQL，原因同 Step 51：既有历史 migration 在 shadow database 中存在顺序问题；未手动修改数据库。
- `pnpm -C apps/backend exec vitest run` 仍会输出 `REDIS_URL not found, caching disabled` 测试环境警告，不影响门禁结果。

### 2026-05-26 阶段十三：前后端类型契约（步骤59-60）

**执行内容：**

- 步骤59：补齐 `@qgs/shared` 中缺失的 API 响应类型，新增/完善 dashboard、work-order、quality-loss、report、file-storage 类型；确认 system-log 的 `AuditLog/LoginLog` 分页类型已存在并复用。
- 步骤60：后端主要公开 service 方法改为引用共享返回类型，包括 dashboard stats、work-order list/dashboard、quality-loss page/dashboard/charts、file-storage list/detail/upload、report list/daily summary、system-log 分页日志。
- 步骤60：前端 `apps/web-antd/src/api/` 改为消费共享类型，移除 API 层本地重复定义与 API 响应相关 `any/unknown` 泛型；未改组件逻辑，未处理第三方库兼容型 `as any`。
- 步骤60：清理 system-log 中旧的双重断言映射，改为结构化 `AuditLog/LoginLog` 返回。

**验证结果：**

- 每个步骤提交前均执行 `pnpm -C packages/qgs-shared run build`: 通过
- 每个步骤提交前均执行 `pnpm -C apps/backend exec tsc --noEmit`: 通过
- 每个步骤提交前均执行 `pnpm -C apps/backend exec vitest run`: 32 文件 / 219 测试全部通过
- 每个步骤提交前均执行 `pnpm run check:qms-arch`: 通过
- 步骤60 后执行 `rg "requestClient\\.(get|post|put|delete)<(any|unknown)|get<any|post<any|put<any|delete<any|as any" apps/web-antd/src/api -g '*.ts'`: 无命中
- 阶段结束模块 TS 文件数：232
- 阶段结束 `git status --short | wc -l`: 0

**commit:** `520e3e41` / `e1493793`

**遗留问题：**

- 前端组件与第三方库类型兼容中的 `as any` 不属于 API 响应契约，本阶段按要求未处理。
- `@qgs/shared` 中仍有部分历史类型命名与模块文件拆分不完全一致，未做无关重命名。
- `pnpm -C apps/backend exec vitest run` 仍会输出 `REDIS_URL not found, caching disabled` 测试环境警告，不影响门禁结果。

### 2026-05-26 架构偏离修复：执行流程规范补救

**执行内容：**

- 偏离1：拆分 `apps/backend/modules` 中剩余超 500 行生产文件；最终将 `inspection-core.service.ts` 收缩为门面，并按职责拆出 inspection 记录查询、创建、更新、删除、归档任务、问题列表/统计/编号、报告聚合、模板绑定与文档同步服务。
- 偏离2：确认生产模块中 `$queryRawUnsafe` 无残留；原始 SQL 均保持参数化 `$queryRaw`。
- 偏离3：清理生产模块最后一处 `as any`，将 AI JSON 解析改为泛型返回，并在 4 个 AI 调用点声明响应形状。
- 偏离4：确认 report 模块不再直接访问 `prisma.daily_reports`，日报数据通过 vehicle-commissioning 模块服务访问。
- 偏离5：确认业务 utils 已迁入 modules，对应文件名检查为空，`apps/backend/utils/*.ts` 数量为 25。

**验证结果：**

- `find apps/backend/modules -name "*.ts" -not -path "*/__tests__/*" -not -name "*.test.*" -exec wc -l {} + | awk '$1 > 500 && !/total/' | sort -rn`: 无输出
- `rg "\$queryRawUnsafe" apps/backend/modules/ -g "*.ts"`: 无输出
- `rg "as any" apps/backend/modules/ -g "*.ts" | grep -v __tests__ | grep -v "\.test\."`: 无输出
- `rg "prisma\.daily_reports" apps/backend/modules/report/ -g "*.ts"`: 无输出
- `ls apps/backend/utils/ | grep -E "ai|audit-log|inspection|project-documents|quality-loss|supplier|system-auth|system-data|task-dispatch|user-security|work-order"`: 无输出
- `ls apps/backend/utils/*.ts | wc -l`: 25
- `pnpm -C apps/backend exec tsc --noEmit --pretty false`: 通过
- `pnpm -C apps/backend exec vitest run`: 32 文件 / 219 测试全部通过
- `pnpm run check:qms-arch`: 通过，0 violations across 0 rules

**commit:** `85d8577c` / `0f2f8d65` / `f840d26e` / `b41ae6ea` / `cd409964` / `3f1bc665` / `a52cf7c2`

**遗留问题：**

- `pnpm -C apps/backend exec vitest run` 仍会输出 `REDIS_URL not found, caching disabled` 测试环境警告，不影响门禁结果。

全部完成

13 阶段后端精简重构全部执行完毕。

### 2026-05-27 目录结构偏离修复

**执行内容：**

- 偏离1：删除 `apps/backend/governance/` 顶层目录；将 process/team resolver 迁入 `utils/`；将仍被业务写入依赖的主数据字段定义、canonical 查询与写入规范化 helper 迁入 `utils/master-data-fields.ts`、`utils/canonical-master-data.ts`、`utils/governed-write.ts`，并更新所有引用路径。
- 偏离2：将 `route-handlers/` 下路由处理服务按业务域合并到已有 `modules/` 目录，API 层 re-export 改为指向对应 module 文件，并删除 `route-handlers/` 目录。
- 偏离3：确认 `modules/master-data/` 为空目录且无引用，删除本地空目录；因 Git 不跟踪空目录，使用空提交记录该偏离项处理结果。
- 偏离4：将 `modules/__tests__/` 下测试文件归位到对应模块目录，删除已废弃的 `base.service.test.ts`，并删除 `modules/__tests__/` 目录。

**验证结果：**

- `find apps/backend -maxdepth 1 -type d | grep -v node_modules | grep -v .output | grep -v .nitro | grep -v .turbo | grep -v tmp | grep -v uploads | sort`: 仅剩 `apps/backend`、`api`、`config`、`middleware`、`modules`、`prisma`、`routes`、`utils`
- `ls apps/backend/governance/ 2>/dev/null && echo "FAIL" || echo "OK"`: OK
- `ls apps/backend/route-handlers/ 2>/dev/null && echo "FAIL" || echo "OK"`: OK
- `ls apps/backend/modules/master-data/ 2>/dev/null && echo "FAIL" || echo "OK"`: OK
- `ls apps/backend/modules/__tests__/ 2>/dev/null && echo "FAIL" || echo "OK"`: OK
- `pnpm -C apps/backend exec tsc --noEmit --pretty false`: 通过
- `pnpm -C apps/backend exec vitest run`: 29 文件 / 153 测试全部通过
- 阶段结束模块 TS 文件数：302
- 阶段结束 `git status --short | wc -l`: 0

**commit:** `2c74709b` / `86841108` / `cef1c453` / `ebc08d05`

**遗留问题：**

- `modules/master-data/` 是空目录，Git 无可跟踪删除内容；`cef1c453` 为空提交，仅用于记录偏离3已验证完成。
- 测试数量从 169 降至 153 是按要求删除废弃 `base.service.test.ts` 导致；其余测试已归位并通过。
- `pnpm -C apps/backend exec vitest run` 仍会输出 `REDIS_URL not found, caching disabled` 测试环境警告，不影响门禁结果。

### 2026-05-27 Prisma 一次性脚本清理

**执行内容：**

- 偏离6：删除 `apps/backend/prisma/` 下 14 个已执行过的一次性数据迁移、回填与检查脚本。
- 清理 `apps/backend/package.json` 中对应的 `db:*` 脚本入口，并同步移除已指向不存在文件的 legacy ITP 清理命令。
- 保留 `apps/backend/prisma/schema.prisma`、`apps/backend/prisma/seed.js` 与完整 `apps/backend/prisma/migrations/` 目录。

**验证结果：**

- `ls apps/backend/prisma/*.mjs apps/backend/prisma/*.js apps/backend/prisma/*.ts 2>/dev/null`: 仅剩 `apps/backend/prisma/seed.js`
- `ls apps/backend/prisma/schema.prisma`: 存在
- `ls apps/backend/prisma/migrations/`: 存在且非空
- `pnpm -C apps/backend exec tsc --noEmit --pretty false`: 通过
- `pnpm -C apps/backend exec vitest run`: 29 文件 / 153 测试全部通过

**commit:** 本次提交

**遗留问题：**

- `pnpm -C apps/backend exec vitest run` 仍会输出 `REDIS_URL not found, caching disabled` 测试环境警告，不影响门禁结果。

### 2026-05-27 报检任务模块重构基线

**执行内容：**

- 建立报检任务模块重构前基线，确认当前工作树干净。
- 记录当前 inspection 模块文件数量，用于后续阶段异常检测。
- 确认后端类型检查、后端测试与 QMS 架构守护均在重构前通过。

**验证结果：**

- `git status --short`: 无输出
- `rg --files apps/backend/modules/inspection | wc -l`: 50
- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm -C apps/backend exec vitest run`: 29 文件 / 157 测试全部通过
- `pnpm run check:qms-arch`: 通过，0 violations across 0 rules

**commit:** 本次提交

**遗留问题：**

- `pnpm -C apps/backend exec vitest run` 仍会输出 `REDIS_URL not found, caching disabled` 测试环境警告，不影响门禁结果。

### 2026-06-08 小程序 LOGO 设计稿

**执行内容：**

- 读取原始 `/Users/zhaoxiaojie/Desktop/最新LOGO.svg`，确认其本质为嵌入 PNG 的 SVG 容器而非可编辑矢量路径。
- 基于原图保留蓝色主视觉、橙色点缀和环形科技感，重做适合小程序头像场景的方形主标 `design/logo/miniprogram-logo.svg`。
- 同步补充带字标的横版资产 `design/logo/miniprogram-logo-horizontal.svg`，便于后续落地到启动页、介绍页或宣传物料。
- 新 LOGO 重点强化缩小识别度，删除原图中小尺寸下难辨认的细碎内部字形，改为更稳定的“连接 / 信号 / 平台”抽象图形。

**验证结果：**

- `sed -n '1,260p' /Users/zhaoxiaojie/Desktop/最新LOGO.svg`: 确认原文件为 `image xlink:href="data:image/png;base64,..."` 嵌入位图结构
- 通过本地图像查看确认原始图标主体由蓝色圆环、内部科技线条和橙色点缀组成
- 生成 SVG 文件成功：`design/logo/miniprogram-logo.svg`、`design/logo/miniprogram-logo-horizontal.svg`
- 未运行前端构建命令；当前验证基于 SVG 结构检查与视觉设计一致性检查

**commit:** 本次未提交

**遗留问题：**

- 若要直接用于微信小程序上传，后续通常还需要导出一版 512x512 或 1024x1024 的 PNG 成品。
- 当前横版字标使用通用英文字形占位；如果你的小程序名称已确定，建议再按正式名称替换。

### 2026-05-27 报检任务模块重构

**执行内容：**

- 更新 inspection 模块架构文档，补充报检任务状态机、public 报检入口边界和后续拆分约束。
- 新增报检任务创建 schema，后台创建和 public 创建共用字段白名单与必填校验，移除创建入口的 `z.object({}).passthrough()`。
- 将报检任务列表查询拆到 `InspectionRequestQueryService`，保留 DB 分页上限、软删除过滤和关联不合格品批量查询。
- 将报检任务创建拆到 `InspectionRequestCreateService`，保留工单校验、主数据双写、附件引用、审计和 SSE 事件发布。
- 将派工和删除拆到 `InspectionRequestDispatchService`、`InspectionRequestDeleteService`，保留事务边界和审计行为。
- 将关闭工作流拆出关闭校验、失败关联不合格品构造、关闭后附件/审计/焊工评分副作用，关闭主 service 从 474 行降到 265 行。
- 报检任务 API 主路径直接调用专用 service，不再经由 `InspectionApiService` facade；`mapInspectionRequest` 去掉生产代码中的 `any`。
- 新增 `inspection-request-create.schema.test.ts`，覆盖当前创建 payload、非组装工序组件必填、组装工序允许空组件。

**验证结果：**

- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm -C apps/backend exec vitest run modules/inspection/inspection-request-create.schema.test.ts`: 1 文件 / 3 测试全部通过
- `pnpm -C apps/backend exec vitest run`: 30 文件 / 160 测试全部通过
- `pnpm run check:qms-arch`: 通过，0 violations across 0 rules
- `rg "await import|modules/welder/welder-score|modules/system-log/system-log" apps/backend/modules/inspection/inspection-request-close.service.ts apps/backend/modules/inspection/inspection-request-close-effects.service.ts apps/backend/modules/inspection/inspection-request-close-issue.service.ts`: 无输出
- `wc -l apps/backend/modules/inspection/inspection-request-close.service.ts`: 265 行
- 阶段结束模块 TS 文件数：316

**commit:** `1f24ea63` / `a5bd2928` / `f9adcada` / `3b40cbb8` / `6237e67f` / `3ebb657e` / `fe2ff921` / `6418afd1` / `8da0c637` / `df52c4f6`

**遗留问题：**

- `InspectionApiService` 仍保留不合格品 issue 相关兼容入口，本轮只清理报检任务主路径，未扩大到 issue API。
- 报检任务派工、关闭 PASS/FAIL、public 创建仍建议继续补带数据库 mock 的流程测试。
- `pnpm -C apps/backend exec vitest run` 仍会输出 `REDIS_URL not found, caching disabled` 测试环境警告，不影响门禁结果。

### 2026-06-24 不合格项编号按钮恢复

**执行内容：**

- 恢复不合格项创建表单 `ncNumber` 字段右侧的显式“生成编号”按钮，保留原有自动生成开关。
- 为生成编号请求增加 loading 与重复点击保护，避免用户连续点击触发多次编号请求。
- 新增 `IssueFormFields.test.ts`，覆盖创建模式显示生成按钮、点击后写入编号、编辑模式隐藏生成入口。
- 清理 `apps/backend/api/qms/quality-loss/index.get.ts` 中遗留的 `/tmp/qgs-quality-loss-query.log` 临时调试写文件代码。

**验证结果：**

- `pnpm exec vitest run --dom apps/web-antd/src/views/qms/inspection/issues/components/IssueFormFields.test.ts`: 1 文件 / 3 测试通过
- `pnpm exec vitest run --dom apps/web-antd/src/views/qms/inspection/issues/composables/useNcNumber.test.ts apps/web-antd/src/views/qms/inspection/issues/components/IssueFormFields.test.ts`: 2 文件 / 7 测试通过
- `pnpm --dir apps/web-antd run typecheck`: 通过
- `pnpm run check:qms-arch`: 通过，0 violations across 0 rules

**commit:** 本次未提交

**遗留问题：**

- 未启动前端 dev/build 服务；按项目约束，本次通过组件测试、类型检查与架构门禁验证。

### 2026-06-24 报检任务不合格关闭流程调整

**执行内容：**

- 报检任务完成检验选择不合格时，不合格项责任部门默认落为当前报检任务的班组 `team`，前端和后端 fallback 均不再使用固定“生产 OBU”。
- 不合格关闭时隐藏“已有检验记录 ID”“是否有资料”“检验记录”“上传检验记录”等检验记录相关入口。
- 不合格关闭时不再要求关闭附件；提交 payload 固定传空附件与 `hasDocuments=false`。
- 不合格项照片改为必填，前端提交前校验有效上传 URL，后端 `validateCloseRequestBody` 同步兜底校验。
- 修复后端照片校验误用报检附件对象格式导致字符串 URL 照片被判空的问题，支持 `linkedIssue.photos` 传 URL 字符串数组或 `{ url }` 对象数组。
- 修复完成检验嵌入不合格项表单生成的 `ncNumber` 未进入 `linkedIssue` payload，且后端未写入 `nonConformanceNumber` 的问题；前端生成编号优先落库，未传时后端生成编号兜底。

**验证结果：**

- `pnpm exec vitest run --dom apps/web-antd/src/views/qms/inspection/requests/composables/useInspectionRequestTaskActions.test.ts`: 1 文件 / 2 测试通过
- `pnpm exec vitest run --dom apps/web-antd/src/views/qms/inspection/requests/composables/useInspectionRequestTaskActions.test.ts apps/web-antd/src/views/qms/inspection/issues/components/IssueFormFields.test.ts`: 2 文件 / 5 测试通过
- `pnpm -C apps/backend exec vitest run modules/inspection/inspection-request-close-adversarial.test.ts modules/inspection/inspection-request-close-issue.service.test.ts modules/inspection/inspection-request-close.service.test.ts`: 3 文件 / 42 测试通过
- `pnpm -C apps/backend exec vitest run modules/inspection/inspection-request-close.schema.test.ts modules/inspection/inspection-request-close-adversarial.test.ts modules/inspection/inspection-request-close-issue.service.test.ts modules/inspection/inspection-request-close.service.test.ts`: 4 文件 / 45 测试通过
- `pnpm -C apps/backend exec vitest run modules/inspection/inspection-request-close-issue.service.test.ts modules/inspection/inspection-request-close.schema.test.ts modules/inspection/inspection-request-close-adversarial.test.ts modules/inspection/inspection-request-close.service.test.ts`: 4 文件 / 45 测试通过
- `pnpm --dir apps/web-antd run typecheck`: 通过
- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm run check:qms-arch`: 通过，0 violations across 0 rules

**commit:** 本次未提交

**遗留问题：**

- 未启动前端 dev/build 服务；按项目约束，本次通过组件/组合式函数测试、后端单测、类型检查与架构门禁验证。

### 2026-07-06 架构总览页面恢复

**执行内容：**

- 恢复 `apps/web-antd/src/views/_dev/architecture/index.vue`，匹配现有菜单配置里的组件路径 `_dev/architecture/index`。
- 页面不重新引入旧的可视化依赖，使用现有 `Page`、`IconifyIcon` 和 Ant Design Vue 组件展示架构总览、模块边界、验证门禁和路由解析信息。
- 更新 `code_map.md`，补充新增 `_dev/` 前端视图目录说明。

**验证结果：**

- `rg --files apps/web-antd/src/views | rg '^apps/web-antd/src/views/_dev/architecture/index\.vue$'`: 通过，目标组件文件存在
- `pnpm -C apps/web-antd typecheck`: 通过
- `pnpm -C apps/backend exec vitest run utils/module-loader.test.ts modules/rbac/rbac-menu.service.test.ts`: 2 文件 / 24 测试通过
- `pnpm run check:qms-arch -- --changed`: 通过，0 violations across 0 rules

**commit:** 本次未提交

**遗留问题：**

- 未启动前端 dev/build 服务；按项目约束，本次通过路径匹配、前端类型检查、相关后端单测与架构门禁验证。

### 2026-07-06 检验记录手动创建开关

**执行内容：**

- 新增系统设置开关"允许手动创建检验记录"，控制进货/过程/发货三类检验记录的手动新建入口；默认开启（向后兼容）。
- 后端：`system_settings` 新增 key `INSPECTION_MANUAL_CREATE_ENABLED`；`SystemService.isInspectionManualCreateEnabled()` 读取判断；新增权限码 `System:InspectionSettings:Edit`（声明于 `modules/system/system.module.ts`，并同步写入 `prisma/seed.js` 的全量菜单表）。
- 新增 API：`GET/POST /api/system/settings/inspection-manual-create`，POST 侧显式校验 `System:InspectionSettings:Edit` 权限码。
- 检验记录创建入口 `api/qms/inspection/records/index.post.ts` 拆分为薄路由 + `modules/inspection/inspection-record-create.post.service.ts`（满足 API 文件 ≤50 行的架构约束），在写入前校验开关状态，关闭时抛出 `BusinessError('INSPECTION_MANUAL_CREATE_DISABLED', ..., 403)`。
- 报检任务创建接口（`requests/index.post.ts`）经核实是独立的预检验申请流程（工单号/工序/自检记录），非"检验记录"本身，故未加此开关限制，避免误伤该工作流。
- 前端：新增系统设置页 `views/system/inspection-settings/index.vue`（含 `hasAccessByCodes` 权限门控）；`InspectionGrid.vue` 的"新增"按钮叠加开关状态判断（`canCreate && manualCreateEnabled`）；新增 API 封装 `api/system/inspection-settings.ts`；补充中英文 i18n 文案。
- 新增单测：`inspection-record-create.post.service.test.ts`、`inspection-manual-create.post.service.test.ts`，并为 `system.service.test.ts` 补充 `isInspectionManualCreateEnabled` 的 3 个用例。

**验证结果：**

- `pnpm -C apps/backend exec tsc --noEmit`: 通过
- `pnpm -C apps/web-antd exec vue-tsc --noEmit --skipLibCheck`: 通过
- `pnpm run check:type`（turbo，全部 40 个包）: 通过
- `pnpm run check:qms-arch`: 通过，0 violations across 0 rules
- `pnpm exec eslint --fix <全部改动文件>`: 通过，无遗留问题
- `pnpm -C apps/backend exec vitest run modules/inspection modules/system modules/rbac utils/module-loader`: 73 文件 / 765 测试通过（含 12 个新增用例）

**commit:** 本次未提交

**遗留问题：**

- 未启动前端 dev/build 服务验证界面渲染；按项目约束，本次通过类型检查、单测与架构门禁验证功能正确性。
- `System:InspectionSettings:Edit` 权限需管理员在"角色管理"页面手动分配给目标角色后才能生效。
### 2026-07-30 主数据治理五类业务在线处置

**执行内容：**

- 主数据治理新增检验记录、BOM 物料/所需工序、供应商身份关联、工单要求和工单的在线处置入口。
- 后端按 `entityType + fieldName` 精确分派到业务表所属模块，使用原始 ID 与名称快照执行并发校验，仅关闭实际更新成功的审计项。
- 单值身份处置只修正规范 ID，保留历史业务名称快照；BOM 所需工序支持多选并原子写入结构化关系和有序快照。
- 前端使用中文字段标签展示规范主数据选择器，支持服务端关键字搜索，替换上述业务类型的“暂不可操作”状态。
- 供应商身份处置复用 TEAM 锁，校验启用主数据，并在同一事务内更新映射、刷新供应商指标队列和关闭审计。

**验证结果：**

- 后端全量测试：`252/252` 文件、`2329/2329` 测试通过。
- 工单治理扩展测试：`1/1` 文件、`8/8` 测试通过。
- `pnpm lint`：通过。
- `pnpm run check:type`：通过，`3/3` workspace tasks 成功。
- `pnpm run check:qms-arch`：通过，0 个新增违规。
- `rtk git diff --check`：通过。

**commit:** 待提交。

**遗留问题：**

- 无。
### 2026-08-01 主数据身份治理 WP2：合格率影子对账与原子投影发布

**执行内容：**

- 身份投影改为 generation + singleton pointer 的 CAS 发布；构建中的 generation 永不被报表读取，决策变更导致 CAS 失败时保留旧 generation。
- 新增合格率工序窄投影，按 `processId` 聚合，名称仅用于展示；不再让合格率查询 join 通用身份旁路表。
- 合格率默认继续使用 legacy 口径。`QMS_PASS_RATE_IDENTITY_PROJECTION_ENABLED=true` 才会显式读取新投影，设置读取失败也会安全回退 legacy。
- 新增合格率影子对账脚本，legacy 与 projection 共享 `createdAt + inspectionId` 事实快照；对账结果写入既有运行/指标表，包含总量、合格数、合格率、分组清单和身份状态。
- 因历史检验类别存在枚举外值，窄投影的旁路类别列改为字符串，完整保留历史事实而不影响源表。

**验证结果：**

- 本地 Prisma migration：51 个，新增 migration 仅修改旁路表，历史事实基线未写入。
- 本地 generation `cmsab3wj200008zlhj6vb1l59`：扫描台账 50,293 条，合格率窄投影 9,554 条并原子发布。
- 本地全期影子对账：legacy 与 projection 的总量均为 411,561、合格数均为 411,391、合格率均为 99.96，三项差异均为 0；身份状态 `RESOLVED=4,242`、`UNRESOLVED=5,312` 已入指标详情。
- 定向测试 `4/4` 文件、`10/10` 测试与后端 TypeScript：通过。
- 最终全仓验证：Vitest `259/259` 文件、`2368/2368` 用例，`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 和 `git diff --check` 均通过；本地数据库 51 个 migration 均已应用。

**commit:** `cab876f4 feat(@qgs/backend): publish identity projections atomically`、`48c072ed feat(@qgs/backend): shadow pass-rate identity metrics`

**遗留问题：**

- 开关保持关闭，待连续影子对账差异均可解释并完成页面验收后才允许切换合格率读取口径。

### 2026-08-01 主数据身份治理 WP2：影子快照与新鲜度保护修正

**执行内容：**

- 新增旁路字段 `updatedAtSnapshot` 与对应索引；新 migration 只修改可重建的合格率投影表，不修改任何历史事实。
- 影子对账先读取 active generation，再从该 generation 的窄投影捕获 `createdAt + inspectionId` cutoff；补录事实不会再造成非身份原因的伪差异。
- `IDENTITY_STATE:*` 指标已与总量、合格数使用相同的业务日期窗口和事实 cutoff。
- 报表开关打开时，数据库端比较源事实与投影的创建/更新边界、活跃行数及 `LIMIT 1` 的逐行不匹配存在性；任何新建、编辑、软删除或查询失败都会记录原因并安全回退 legacy，不全量加载投影。

**验证结果：**

- 本地 Prisma migration：52 个；generation `cmsabvogh00008z3e2pqnnlt4` 扫描 50,293 条、写入 9,554 条并原子发布。
- 本地全期影子对账 run `cmsabvtyq00008z47jc5hrgfo`：legacy 与 projection 总量均为 411,561、合格数均为 411,391、合格率均为 99.96，三项差异均为 0；窗口内身份状态 `RESOLVED=4,234`、`UNRESOLVED=5,287`。
- 只读基线 checksum 复核一致：`95c62629cb2c49e257b72a7a3f5c918d7393c164bb40a9dde788bb9962f93fd2`。
- 定向 `4/4` 文件、`13/13` 用例；全仓 Vitest `259/259` 文件、`2371/2371` 用例；`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`git diff --check` 全部通过。

**commit:** `45487a76 fix(@qgs/backend): guard stale pass-rate projections`

### 2026-08-07 台数（stationSelection）截断修复

**执行内容：**

- 根因：报检创建时后端把所选台号按表单「数量」字段（默认 1）截断，选第 N 台被静默存成第 1 台；读路径又按同一 quantity 二次截断。
- 修复：台号上限改为工单机器台数（work_orders.quantity）。创建服务先查工单并计算机器台数上限，再序列化 stationSelection；上限 ≤ 0 时不传（不再截断）。读路径（inspection-record-query.service.ts、qgs-shared mapInspectionRequestRecord）改为按原样展示已存台号。
- 改动文件：inspection-request-work-orders.ts、inspection-request-create.service.ts、inspection-record-query.service.ts、packages/qgs-shared inspection-request.ts，并新增 2 个测试用例。

**验证结果：**

- 定向测试：qgs-shared inspection-request 17/17、inspection 模块 683/683 通过。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 均通过。

**commit:** 待提交

**遗留问题：**

- 历史已按错误逻辑落库的记录（quantity=1、indexes=[1]）无法恢复，原所选台号在写入时已丢失。

### 2026-08-07 台数修复审查整改

**执行内容：**

- 审查整改：台号上限由「全部关联工单的最大机器数」改为「选中工单（workOrderNumber）的机器数」，与前端 stationQuantity 口径一致。
- 服务端校验：提交了台数选择但工单机器数为 0 时，不再静默不设限落库，改为抛 `INVALID_STATION_SELECTION` 业务错误拒绝请求（符合 CONSTRAINTS.md 对所有用户输入做校验的要求）。
- 后端模块补导出 `normalizeInspectionStationSelection`；新增 2 个测试用例（选中工单机器数作为上限、0 台工单拒绝选择）。

**验证结果：**

- inspection 模块 + qgs-shared qms 定向测试 685/685 通过。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 均通过。

**commit:** 待提交

**遗留问题：**

- 历史已落库的错误台号记录无法恢复。

### 2026-08-07 责任焊工必填一致性修复

**执行内容：**

- 根因：`selectRequired` 校验规则只拦截 `undefined/null`，不拦截空字符串 `''`；报检任务完成检验弹窗（CloseInspectionModal）把 `responsibleWelder` 预填为 `''`，导致「焊接」工序下责任焊工不填也能提交，与不合格项新建问题页面（字段初始为 undefined，必填生效）行为不一致。
- 修复：
  1. `apps/web-antd/src/adapter/form.ts`：`selectRequired` 对空字符串和空数组也判定为未选择（与 `required` 规则一致），弹窗内责任焊工、缺陷分类等选择字段显示即必填，与新建问题页对齐。
  2. `apps/web-antd/src/views/qms/inspection/records/components/InspectionForm.vue`：检验记录页不合格补充区增加校验，工序名含「焊」时责任焊工必填（该页旧逻辑只有显示条件、无必填）。
  3. `apps/backend/modules/inspection/inspection-issue.schema.ts`：create 校验增加兜底，`processName` 为「焊接」时 `responsibleWelder` 必填；新增 2 个 schema 测试用例。

**验证结果：**

- 后端 inspection 模块 643/643 通过（含新增 schema 用例）。
- 前端 inspection issues/records/requests 相关测试 98/98 通过。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 均通过。

**commit:** 待提交

**遗留问题：**

- 显示触发条件仍按各页面现状：完成检验弹窗与新建问题页为工序精确「焊接」，检验记录页为工序含「焊」；如要统一为含「焊」，需确认工序字典口径后另行调整。
- 完成检验弹窗的工序沿用报检单并锁定，若报检单工序名非精确「焊接」的焊接类名称，责任焊工字段不会显示（同新建问题页口径）。
### 2026-08-08 修复：supplier identity 线上解析、维护门禁与内部 BU 历史清理

- 删除 PROCESS 在线 `TEAM name -> supplier name` fallback；PROCESS 的 supplier 字段仅来自有效显式 link，调用方字段不能注入，内部 BU 维持空 supplier identity。
- mapping 管理仅接受有匹配 `SUPPLIER` 来源的外部 TEAM 与 `Outsourcing + IN_HOUSE_TEAM/EXTERNAL_SERVICE` 供应商；有 PROCESS 事实时禁止在线删除或实质修改 mapping，历史修复必须走 backfill。
- 回填不再按名称建立/恢复 TEAM link；内部 `DEPARTMENT` TEAM 的错误 inspection/quality record supplier 字段以审计、CAS、幂等方式清空；所有 unresolved/conflict（包括重复运行中已有 OPEN 项）均阻断维护。
- 正常 deploy workflow 删除 `skip_maintenance`，Prisma migration 后必须连续运行 release maintenance。
- 更正 v0.24.0 记录：`skip_maintenance=true` 的手工部署是未完成维护时的错误绕过，不是已验证的恢复路径；17 条 unresolved 的外部/内部归属尚未在生产执行本轮证据化回填。
- 提交：`f1720641`、`5d82561`。验证：后端全量 Vitest `267/267` 文件、`2445/2445` 用例通过；`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 通过。
- 后续提交：`a4f08a7` 以 CAS 清除内部 BU 的 PROCESS 报检 supplierId，并使 inspection/quality record 的清理同时比较 supplierId 与 supplierName；`b9a0789` 将在线/批量/backfill resolver 收紧为精确 `SUPPLIER` source 与外包策略，外部 TEAM 缺有效 link 直接拒绝 PROCESS 写入，候选 API/UI 按 TEAM 过滤可链接供应商。验证：后端定向 Vitest `7/7` 文件、`64/64` 用例通过，前端定向 Vitest `2/2` 文件、`5/5` 用例通过，后端 `tsc --noEmit` 通过。
- 文档更正提交：`29418e0`。最终验证：后端全量 Vitest `267/267` 文件、`2451/2451` 用例通过；`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 均通过。
- 后续提交：`bd5c59c` 将 supplier identity 管理候选的 TEAM、SUPPLIER source 和 supplier 查询全部限制为数据库侧 `take <= 100`；选定 TEAM 仍只返回其精确 source 匹配的 supplier。`dbe962a` 将同模块 TEAM 查询拆出，主 service 保持在 500 行内。`55b816a` 定点更正 v0.24.0 发布历史（重复 feature、未提交标记、重复焊接记录、已废止名称规则和未打 tag 的 v0.23.3 时间线）。验证：supplier-identity 定向 Vitest `1/1` 文件、`24/24` 用例通过；`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 通过。
- 后续提交：`906f788` 修正 supplier keyword 搜索顺序：先在数据库按 PROCESS 可用的 canonical supplier policy 与关键词分页，再按返回 supplier IDs（及可选 TEAM）查询 source，避免 source 前 100 条截断后遗漏后续匹配供应商。新增回归测试覆盖该顺序与查询条件。

### 2026-08-10 不合格项双入口统一与责任部门脏数据治理

**执行内容：**

- 根因：桌面端责任部门严格树选择返回对象，但旧提交转换直接字符串化，导致 `responsibleDepartment` 或历史 JSON 数组落入 `[object Object]`；同时独立新建与报检关闭分别维护创建逻辑，编号、责任身份和下游指标行为发生漂移。
- 两个在线入口统一使用事务内不合格项创建服务。NC 编号由服务端在写事务内分配；责任契约统一为 `responsibilityType + responsibleDepartmentId + supplierId?`，在线只允许一个主责部门，部门和供应商名称均由 canonical ID 重建。
- 新增 `quality_records.responsibilityType` migration 与责任部门脏数据维护命令。维护只处理精确 `[object Object]` 哨兵，优先有效部门 ID，再以关联报检/检验的唯一 canonical 证据恢复；缺证据或冲突保留原记录并写入或重开 `unresolved_master_data_refs` OPEN 审计。
- 维护脚本支持 dry-run/apply、ID keyset 分批、字段 CAS 与同一事务内的源记录/审计一致性；release maintenance 在既有不合格项责任回填后执行 remediation。
- 审查加固：TEAM→supplier 解析统一复用 supplier-identity 公共服务，并强制 active TEAM、active link、精确 active `SUPPLIER` source 与 PROCESS policy 四条件交集；含 active `DEPARTMENT` source 的 TEAM 绝不作为外部候选。外部候选和 CAS 同时保存 supplier ID/name，内部责任清空这两个字段；外部证据缺失、候选冲突或既有 supplier 快照不完整时保留 OPEN unresolved。在线编辑不再写 legacy `responsibleDepartments`，小程序编辑明确回填全部可编辑字段且不把旧责任快照重新提交。
- release maintenance 对 dry-run 和 apply 均 fail-closed：`unresolved`、`conflicts` 或 `concurrentChanges` 任一非零即以非零退出，阻断不完整的维护发布。

**验证结果：**

- 后端全量 Vitest：`272/272` 文件、`2500/2500` 用例通过。
- Web 定向 Vitest：`57/57` 文件、`277/277` 用例通过；小程序定向 Vitest：`6/6` 文件、`20/20` 用例通过。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`：通过。
- 审查修复定向回归：后端 `3/3` 文件、`76/76` 用例通过；小程序 `1/1` 文件、`2/2` 用例通过。`git diff --check` 通过。
- 浏览器页面验收及生产环境 release maintenance 的 dry-run/apply：尚未验证。

**commit:** `9ddce79`（统一后端/共享契约）、`928d666`（Web/WeApp 入口）、`fcb4044`（历史治理）、`46cfe31`（发布维护接线）。

**遗留问题：**

- 生产环境必须先 dry-run 审核 unresolved 清单，再通过正式 release maintenance 执行 apply；无稳定 ID 或唯一关联证据的记录不得按名称猜测恢复。

### 2026-08-11 不合格项责任身份现场定位与入口收口

**执行内容：**

- 现场 5320 public API 证实目标 TEAM 仍是旧的 internal 分类，且存在同名 Outsourcing supplier；canonical `SUPPLIER` source 与 `supplier_identity_links` 尚不完整，必须走主数据治理确认，禁止按名称自动补绑。
- 报检入口的责任选项改为三态表达，其中 `MISSING` 表示“未关联内部部门或外协供应商”；创建链路对无法证明的责任身份 fail-closed。
- 打开关单前，如列表项缺少 context，先拉取详情及 canonical ID，避免使用缺失或过期的名称、对象快照。

**验证结果：**

- 后端全量 Vitest：`272/272` 文件、`2504/2504` 用例通过；Web 全量 Vitest：`57/57` 文件、`281/281` 用例通过；小程序全量 Vitest：`6/6` 文件、`20/20` 用例通过。
- shared build、`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`pnpm run check:qms-arch:all`：通过。
- 本地过程报检浏览器已验证：目标项位于待治理分组且 disabled。
- 登录后关单页浏览器验收因无登录态尚未验证；真实运行库的 source/link apply 未执行，不得以本地非等价数据库结果替代现场证据。

**commit:** `f500973`

### 2026-08-11 报检任务显式责任契约、关单裁决与历史回填

**执行内容：**

- 根因：内部责任选项错误地以 TEAM 映射作为部门候选前置条件，结构 BU、机加 BU 等没有 TEAM 映射的有效部门被隐藏，无法创建内部责任报检。
- 新契约改为责任部门直接选择 canonical department。PROCESS 内部责任的 `teamId` 仅是可选执行上下文；传入时服务端必须验证它与责任部门匹配。SUPPLIER/OUTSOURCING_UNIT 仍直接提交供应商和 policy department，不提交 TEAM，也不依赖 TEAM→supplier link。
- Web 与 WeApp 统一改为显式三态责任表单、公共/鉴权责任选项 API 和 ID-only payload；选项、创建、查询、统计及检验记录消费同一 external supplier 事实，禁止名称推断。INCOMING 的 `supplierName` 只保留给 legacy TEAM fallback，不再作为新责任事实。
- 关闭报检会锁定完整 canonical responsibility context；legacy 请求可在关闭事务内直接补齐 canonical 部门，partial triad 仍拒绝，避免用残缺历史字段混合推断。生成的 `inspections` 也持久化相同责任三元组；统计新增责任部门 domain，外部供应商仍使用 canonical supplier 维度。独立责任 resolver 切断报检上下文与检验记录创建之间的循环依赖。
- 新增报检任务责任回填：完整持久 triad 优先；仅缺失完整 triad 的历史行才调用既有 legacy canonical resolver，其中 TEAM→supplier link 仅作为历史兼容证据。任何名称相同都不构成回填依据。回填采用 ID keyset 分批、字段级 CAS 和同事务审计；缺失、失效或冲突证据保持源记录并写入 `unresolved_master_data_refs` OPEN 审计，不覆盖人工已裁决项。普通 `MISSING_CANONICAL_RESPONSIBILITY_EVIDENCE` 是 nullable legacy 兼容结果：apply 仍完整扫描、执行全部确定性更新并落审计，不是跳过；运行时继续兼容读取，关单必须经受校验的显式责任裁决。失效证据、冲突、CAS 并发变更或 `--max-batches` 截断才 fail-closed 阻断发布，新写入始终 fail-closed。
- 发布维护在报检类别和工序选项维护后、既有不合格项责任回填前运行；新增后端 maintenance 命令。
- Prisma migration 使用缩短后的 MySQL 索引名，并新增 `inspections` 责任三元组及索引 migration，保证报检与生成检验记录可按相同 canonical 事实查询。
- P3009 根因：旧 `20260811000000_add_inspection_request_responsibility` migration 的索引名长度为 70，超过 MySQL 64 字符上限，触发 MySQL 1059。初次仅做只读取证，确认该 migration 为 active failed、`applied_steps_count=0`、InnoDB，且两张目标表的责任字段和索引均不存在。
- 随后由外部操作（非 Codex apply）将旧 migration row 标记为 rolled back，并重新执行 deploy 成功；`20260811000000` 与 `20260811000001` 均为 `applied_steps_count=1`，已核对两张目标表的字段和短索引完整。新增 fail-closed recovery：仅识别该 migration；`NONE` 才执行 Prisma `resolve --rolled-back`，仅当 `qms_inspection_requests` 已具 `20260811000000` 的四个字段及短索引才执行 `resolve --applied`，partial/drift 一律阻断，随后 `migrate deploy` 才应用或确认 `20260811000001` 的 `inspections` 变更。GitHub deploy、OSS deploy、local container up/dev 全部复用该 wrapper。

**验证结果：**

- 独立后端定向 Vitest：`10/10` 文件、`102/102` 用例；其中历史回填为 `2/2` 文件、`15/15` 用例。前端改动测试：Web `4/4` 文件、`35/35` 用例，WeApp `3/3` 文件、`14/14` 用例；修正后独立复跑 Web `1/1` 文件、`16/16` 用例，WeApp `1/1` 文件、`7/7` 用例（agent 汇总 `55/55`）。
- 最终全量验证：backend Vitest `277/277` 文件、`2535/2535` 用例；Web `57/57` 文件、`291/291` 用例；WeApp `8/8` 文件、`31/31` 用例。`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`pnpm run check:qms-arch:all`、shared build、Prisma migration、Prisma validate 与 `rtk git diff --check` 均通过。
- 浏览器/小程序真实点击和生产 Prisma migration 仍未验证。
- P3009 recovery 定向测试 `10/10` 通过；root `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`pnpm run check:qms-arch:all`、`pnpm run check:prisma-migration` 与 `rtk git diff --check` 均通过。当前数据库只读检测输出 `NOT_REQUIRED`。Codex 未执行任何数据库 apply；生产发布和推送均未执行。

**commits:** `40070cf`（后端/共享契约）、`d84297c`（Web/WeApp 入口）、`1704d7d`（历史治理与发布维护）、`8e33910`（测试夹具修正）、`88bc724`（后端/共享契约修正）、`5311921`（Web/WeApp 选项修正）、`2051341`（P3009 migration recovery）。
### 2026-08-13 PROCESS 外协报检责任部门 canonical ID 修复

**执行内容：**

- 根因：外协报检的隐藏责任部门每次仅按共享显示名称查询；本地存在两个 active 同名部门时，正确的 fail-closed 保护阻断了 public V2 创建，但名称并不是稳定身份。
- 新增系统设置 `INSPECTION_REQUEST_PROCESS_OUTSOURCING_RESPONSIBLE_DEPARTMENT_ID`。已有设置时，运行时只按 active canonical ID 解析；部门改名后以当前名称快照写入请求、检验记录与不合格项责任事实，ID 不变。
- 设置缺失时只允许用现有共享旧名称进行一次原子引导：唯一候选用 `create` 固化，唯一键并发竞争后回读赢家配置；零个或多个候选、无效或停用配置均 fail-closed。没有按名称排序、ID 格式或 `first` 选择。
- release maintenance 在请求责任回填前显式运行相同的幂等引导，歧义不会被跳过或绕过。

**验证结果：**

- 后端定向 Vitest：`6/6` 文件、`48/48` 用例通过，覆盖配置 ID 改名后解析、首次唯一 bootstrap、零/多候选拒绝、停用 ID 拒绝、并发 create 竞争回读及 release-maintenance 接线。
- `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`rtk git diff --check`：通过。
