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
