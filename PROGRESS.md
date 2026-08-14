# 项目进度

## 当前状态

- 历史报检任务关闭责任裁决已完成：关闭契约新增独立顶层 canonical `responsibility`，完整请求只校验而不可覆盖，partial/missing 请求可在同一关闭事务内按主数据、类别/TEAM policy 与字段级 CAS 补齐。状态锁后会重读 category、teamId 和责任字段，避免按锁前快照裁决；PASS/FAIL 共用最终责任事实，FAIL 的 linkedIssue 与已有 linked NC 都必须精确匹配。旧 FAIL 客户端仅在缺少顶层字段时使用 linkedIssue fallback，PASS 不猜测。桌面、H5 和小程序均已适配；H5 PASS 强制附件，FAIL 提交完整不合格项表单。实现提交：`2dd47b0c`、`97b32657`、`804b0d08`、`ac08e6ff`；其中 `ac08e6ff` 在全量验收中将旧测试 fixture 对齐既有生产 supplier category 契约。最终验证：后端全量 Vitest `288/288` 文件、`2610/2610` 用例，Web happy-dom Vitest `148/148` 文件、`328/328` 用例，WeApp Vitest `10/10` 文件、`48/48` 用例；`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`pnpm run check:qms-arch:all` 和 `rtk git diff --check HEAD~5..HEAD` 均 PASS。未运行真实 MySQL 并发、前端 dev/build/start 或真实页面验收。
- 不合格项编辑责任部门的第三次根因修复已完成：此前 `title/value` 树映射本身正确，但 `IssueFormFields` 的编辑态完整 schema 重建会覆盖先前异步注入的 `treeData`，因此回填 `dept-1770026473133` 时 TreeSelect 找不到节点而显示原始 ID。现在完整 schema 构造始终携带当前部门树，并同时保留责任类型、责任部门和供应商的锁定态；提交值继续是 primitive canonical ID，不按名称猜测。回归覆盖真实 TreeSelect 异步显示、编辑态最终 schema、显式 ID 编辑回填与锁定态。验证：Web 定向 Vitest `5/5` 文件、`18/18` 用例，`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`rtk git diff --check` 均 PASS。未运行 dev/build/start 或真实浏览器页面验收；实现提交：`b15fec9`。
- 本轮不合格项与报检关单修复已完成：不合格编号开关中文展示；责任部门 `TreeSelect` 以 `title` 展示名称、以 `value` 保持 canonical ID；报检 FAIL 关单表单按报检类别提供选项（`INCOMING` 三类，`PROCESS` 仅内部部门和外协单位），服务端拒绝 `PROCESS + SUPPLIER`。历史已派单的部分责任 identity 可在 FAIL 关闭时由显式、主数据验证的 canonical IDs 在同一事务补齐，名称快照按主数据刷新，type/departmentId/supplierId 冲突仍 fail-closed；PASS 只有 identity 完整时才能按 IDs 刷新快照，无 identity 仍拒绝。责任解析返回必填 `supplierCategory`，关单类别校验不再重复查询供应商。实现提交：`abf51d0`、`47c7540`。验证：Web 定向 Vitest `4/4` 文件、`26/26` 用例，backend 定向 Vitest `6/6`、`76/76`，以及 `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`rtk git diff --check` 均 PASS；无业务遗留阻塞。未启动本地服务，因此 `localhost:5173` 实页验收未执行。
- 不合格项新建表单的责任部门 `TreeSelect` 已修复为显式 `label/value/children` 映射：异步选项加载、编辑回填和预填均用 canonical `responsibleDepartmentId` 对应的部门名称展示，提交值仍是 ID，未按名称猜测或改写 identity。`Generate NC Number` 开关已移除拉伸状态文字，并抵消统一 `w-full` 后恢复紧凑显示；编辑态不显示该开关。实现提交：`a8f36b7`。验证：Web happy-dom Vitest `61/61` 文件、`313/313` 用例，`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 与 `rtk git diff --check` 均 PASS。未运行 dev/build/start，未完成真实页面验收。
- 本轮不合格编号已收敛为“重要问题的可选正式标识”：独立新建、报检任务 FAIL 关闭和普通检验记录 FAIL 三个入口均使用 `generateNcNumber`，关闭即写 `nonConformanceNumber=NULL`，开启才在后端事务内编号；客户端不能提交、编辑或清空编号。未编号项可由具备 `QMS:Inspection:Issues:AssignNcNumber` 权限的用户一次性补号，已编号项保持不可修改、不可重新生成。普通检验记录与关联问题同一 Prisma 事务提交，失败整体回滚；报检关单在事务锁后复用已有 `linkedIssueId`，重复/并发 FAIL 不再新建、覆盖或重号。关单同时强制关闭权限与任务归属（非系统管理员仅限当前派发检验员）；所有提交后附件、审计和评分副作用均 best-effort。编号器、导入、nullable 类型契约与售后测试 fixture 已同步修复。实现提交：`9cc90993`、`bb88eda3`、`2000d63c`、`2f79dfe4`。最终验证：backend 全量 Vitest `288/288` 文件、`2595/2595` 用例，Web happy-dom `61/61`、`312/312`，WeApp `10/10`、`46/46`；`pnpm lint`、`check:type`、`check:qms-arch`、`check:qms-arch:all`、Prisma migration、shared build 与 diff 均 PASS。未读取凭据，真实 MySQL 并发集成未运行；前端 dev/build/start、真实页面验收和生产发布均未执行。
- 部门改名在线展示已收敛为 `responsibleDepartmentId`/`respDeptId` 的 active canonical read model：检验记录、不合格项、售后列表/详情/统计/图表、日报和周报均通过 `DeptService` 批量解析当前部门名，不批量改写持久化快照。责任部门筛选将 current-name 命中的 active IDs 与 legacy 快照条件在同一数据库谓词中执行，因此 count、分页和导出语义一致；无 ID 行保留快照，失效或软删 ID 明确保持 unresolved，不按名称猜测。Web 实际优先消费的 legacy 多值责任部门数组也会以当前名称替换主项，避免列表与详情回显旧名。后端定向 Vitest `10/10` 文件、`119/119` 用例及 `pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`rtk git diff --check` 均通过；实现提交：`85e49d4`。未运行 dev/build/start，未推送或发布。
- PROCESS 内部报检的业务“班组”已收敛为 canonical `responsibleDepartment`：Web/WeApp 入口不再展示或提交执行 TEAM，V2 后端拒绝 `team/teamId`。PROCESS 仅允许内部部门或外协单位；外协入口隐藏责任部门，创建事务从 shared 既有外协责任部门策略唯一解析活跃 canonical 部门，缺失/重名 fail-closed。请求 API 和检验记录 API 共用同一后端展示规则：PROCESS 内部显示责任部门，PROCESS 外协显示 canonical `supplierName`，外部/历史行仍返回真实 TEAM；绝不伪造 TEAM ID。关单事务以报检任务完整 R（责任类型、部门 ID/名称、供应商 ID/名称）为唯一事实，逐条投影新建多工单记录、空事实的显式关联记录和 FAIL 不合格项；partial/conflict fail-closed，PASS legacy 无 R 阻断。历史 inspection 自身缺失时仅在关联报检任务唯一同部门时兼容展示，冲突保持空。未运行 dev/build/start，未提交或发布。
- 报检详情身份展示已按持久化类别分离：`INCOMING` 使用详情 API 已透传的 `supplierName` 显示“供应商”，缺失快照显示 `-`；`PROCESS + INTERNAL_DEPARTMENT` 显示责任部门这一业务班组，其他 PROCESS 记录保持真实 `team`。前端不再把供应商名称写入或回退到班组字段。
- 报检入口责任部门默认值已在 Web 与 WeApp 统一：`OUTSOURCING_UNIT` 仅在完整选项中唯一精确匹配 canonical `生产 OBU` 时预选该部门，`SUPPLIER` 对 `采购部` 同理。共享纯函数保留同一责任类型的手动选择；空字段在选项未加载、零匹配或重名时保持未选并由提交校验 fail-closed，不硬编码部门 ID。
- 最新变更: qgs v0.24.0 已发布（PR #94 合并、release PR #92 合并、tag `qgs-v0.24.0`）。tag deploy 曾因 17 条 PROCESS supplier identity unresolved 被维护门禁拦截，随后错误地以 `skip_maintenance=true` 完成部署；该绕过没有证明 17 条记录均为有效外包事实，不能再按“补 link 即可解决”处理。后续修复规定：内部 BU 的 supplier 字段必须清空；只有具有确定性 SUPPLIER 来源的外部 TEAM 才能建 link；其他记录继续阻断并待证据化处置。
- 本轮独立验收修复已完成：画像/评分 supplier→TEAM 查询、在线与回填的 PROCESS 判定、内部字段清理审计和软删关联恢复均统一为 active TEAM + active exact SUPPLIER source + active PROCESS-policy link。DEPARTMENT+SUPPLIER 双来源不再被清理为内部，而是作为无效关联/未解析外部事实阻断；回填源 CAS 与 cleared/resolved/unresolved 审计位于同一事务。实现提交：`f9e325a1`、`d57a8303`、`ebc98eba`、`38e379bf`、`4fa20802`。
- `supplier_identity_links` 已具备系统设置管理 UI、动态菜单权限声明和管理员专用 canonical 选项 API；列表、创建、编辑、删除、客户端校验及加载/错误/空态均已接入。前端复用共享 `isSystemAdmin`，并与菜单同步识别 `super` 角色及 `*`/`["*"]` 通配权限，服务端 CRUD 继续只允许系统管理员。
- 合格率投影重建已与 Web 请求进程隔离，管理员点击只写持久队列，由独立 worker 消费；门禁失败时前端始终允许关闭投影并立即回退 legacy，避免重建资源耗尽影响登录。
- 维护脚本 `classify-historical-identity-unresolved` 已按用户指令移除：其尾部的全量投影重建在 1GB 本地 MySQL 容器上导致资源耗尽卡死；未分类项留在处置队列，投影基础设施保留。
- 本轮不合格项双入口统一已完成代码集成：独立新建与报检关闭收敛到同一事务创建服务，NC 编号由服务端事务内分配，责任事实使用 `responsibilityType + responsibleDepartmentId + supplierId?` 的 canonical ID 契约并限定一个主责部门。`quality_records.responsibilityType` migration、`[object Object]` 精确哨兵治理、release maintenance 接入均已实现。审查后，TEAM→supplier 修复候选与在线 resolver 统一为 active TEAM + active link + exact active `SUPPLIER` source + PROCESS-policy supplier 的四条件交集；`DEPARTMENT+SUPPLIER` 双来源为冲突。维护脚本以同一字段级 CAS 写入/清空 supplier 事实，并在 dry-run 与 apply 对 unresolved、conflict、并发 CAS 失败统一 fail-closed。小程序编辑完整恢复业务字段且只提交 canonical responsibility；在线编辑不再写 `responsibleDepartments`。实现提交：`9ddce79`、`928d666`、`fcb4044`、`46cfe31`。最终门禁已通过：后端全量 Vitest `272/272` 文件、`2500/2500` 用例，Web 定向 Vitest `57/57` 文件、`277/277` 用例，小程序定向 Vitest `6/6` 文件、`20/20` 用例；`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 均通过。桌面/移动端浏览器页面验收和生产 dry-run/apply 尚未验证。
- 现场 5320 public API 已确认目标 TEAM 仍为旧的 internal 分类，且存在同名 Outsourcing supplier；两者缺少完整 canonical `SUPPLIER` source/link 证据，必须通过主数据治理处置，不得按名称补绑。报检选项收敛为三态，其中 `MISSING` 表示“未关联内部部门或外协供应商”；创建入口 fail-closed。打开关单前，列表项缺少 context 时先拉取详情及 canonical ID。验证：后端全量 `272/272` 文件、`2504/2504` 用例，Web 全量 `57/57` 文件、`281/281` 用例，小程序全量 `6/6` 文件、`20/20` 用例，shared build，`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`pnpm run check:qms-arch:all` 均通过；本地过程报检浏览器已确认目标项位于待治理分组且 disabled。登录后关单页浏览器验收因无登录态尚未验证，真实运行库 source/link apply 未执行；实现提交：`f500973`。
- 报检任务责任部门选项根因已修复：旧内部候选错误依赖 TEAM 映射，导致结构 BU、机加 BU 等有效部门不显示；责任部门现直接选择 canonical department，PROCESS `teamId` 仅为可选执行上下文且传入必须匹配。legacy 关单在事务内直接补齐部门，partial triad 仍拒绝；`inspections` 持久化同一责任三元组，统计新增责任部门 domain，独立 resolver 切断循环依赖。INCOMING `supplierName` 仅作 legacy TEAM fallback。实现提交：`40070cf`、`d84297c`、`1704d7d`、`8e33910`、`88bc724`、`5311921`。最终门禁已通过：backend 全量 `277/277` 文件、`2535/2535` 用例，Web `57/57`、`291/291`，WeApp `8/8`、`31/31`；`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch`、`pnpm run check:qms-arch:all`、shared build、Prisma migration、Prisma validate 和 diff 均 PASS。浏览器/小程序真实点击和生产 Prisma migration 尚未验证。
- P3009 migration recovery 已完成并 fail-closed：旧请求责任 migration 的 70 字符索引名超过 MySQL 64 字符限制，触发 MySQL 1059。初次只读取证为 active failed、`applied_steps_count=0`、InnoDB，目标字段/索引均不存在；后续外部操作（非 Codex apply）将旧 row rolled back 后重新 deploy 成功，`20260811000000/00001` 均 `applied_steps_count=1`，两表字段与短索引已核对。recovery wrapper 只识别该 migration，`NONE` 执行 Prisma `resolve --rolled-back`，仅 `qms_inspection_requests` 的 00000 四字段及短索引完整时执行 `resolve --applied`，partial/drift 阻断；随后 `migrate deploy` 才应用或确认 00001 的 `inspections` 变更。GitHub/OSS/local container up/dev 统一复用。实现提交：`2051341`。验证：recovery `10/10`，root lint/type/arch/arch-all/prisma-migration/diff 均 PASS，当前 DB 只读输出 `NOT_REQUIRED`。Codex 未执行数据库 apply，生产发布/推送未做；浏览器/小程序真实点击仍未验证。
- 报检入口责任契约已与不合格问题报告对齐并完成浏览器验收：进货/过程两个入口都可显式选择三类责任类型；责任部门对任何类型都是可选 canonical department 下拉，不再按「采购部/生产 OBU」固定名称匹配，也不再展示「责任部门策略加载中」；PROCESS 内部 `teamId` 保持「执行班组（选填）」，提交与必填提示不再要求班组；外部类型提交时服务端校验 canonical 供应商类别与责任类型一致。实现提交：`6744d71`（后端/共享契约）、`d775ffc`（Web 入口）、`ed8508f`（WeApp 入口）。验证：backend 全量 `279/279` 文件、`2551/2551` 用例，Web `58/58`、`297/297`，WeApp `8/8`、`34/34`；`pnpm lint`、`check:type`、`check:qms-arch`、`check:qms-arch:all`、`check:prisma-migration`、shared build 与 diff 均 PASS；本地浏览器已验证三类切换与控件状态，无控制台错误；真实提交报检与生产验证未做。
- 代码审查三项修复已完成：关单弹窗 legacy 外部责任按政策部门名（采购部/生产 OBU）唯一匹配，零/多匹配 fail-closed，不再取全量列表第一个部门；不合格项更新支持部分责任字段，合并当前三元组后校验；NC 编号分配改为事务内 CAS 循环消除并发重复。实现提交：`80dc2f4`（后端）、`cabfdf1`（Web）。验证：backend 全量 `279/279` 文件、`2554/2554` 用例，Web `59/59`、`301/301`，WeApp `8/8`、`34/34`；lint/type/arch/arch-all/prisma-migration/diff 均 PASS。未推送、未发布；真实浏览器关单与生产验证未做。
- 检验记录“复检合格”展示已完成：Web 记录列表/详情在 `result=PASS` 且关联不合格项（`issueStatus !== NONE`）时显示复检合格，小程序“我的记录”在 PASS 且存在 linkedIssue 时显示复检合格徽标；判定收敛为纯函数。实现提交：`311e3a7`（Web）、`99a9d11`（WeApp）。验证：Web 全量 `60/60` 文件、`305/305` 用例，WeApp `9/9`、`39/39`；lint/type/arch/arch-all/prisma-migration/diff 均 PASS。未推送、未发布；真实页面展示与生产验证未做。
- 测试状态: 本轮后端全仓 Vitest `267/267` 文件、`2461/2461` 用例通过；`pnpm lint`、`pnpm run check:type`、`pnpm run check:qms-arch` 和 `pnpm run check:qms-arch:all` 均通过。前端未运行 dev/build/start。
- Lint: 通过（0 error，0 warning）
- Typecheck: 0 error（3/3 workspace tasks；weapp 自身脚本为项目既有 skip）
- 模块 TS 文件数: 617（含测试）
- 当前版本: `0.24.0`

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
- [x] 工单要求跟踪补齐带 RBAC 与数据范围校验的编辑、软删除及图标化确认/撤销操作；确认权限独立，QC 可确认
- [x] 售后质量搜索项按业务字段补齐（项目、责任部门、经办人、缺陷、供应商和日期范围）
- [x] 售后质量搜索增加部件名称，列表与全量导出共用查询参数
- [x] 报检任务电脑版与移动版派单只显示启用的 `QC` 检验员，后端同步强制校验
- [x] 调试验收问题台账增加带 RBAC 校验的软删除操作（附件、质量损失索引和审计同步处理）
- [x] 调试验收问题台账的一级导出和二级编辑、删除、日志使用带提示的图标按钮
- [x] 本地 Apple Container 开发启动脚本改用有界端口探测，避免 macOS `lsof` 内核阻塞
- [x] supplier identity governance wave（供应商画像、评分、检验、不合格项、售后评分、TEAM 映射、存量回填与 unresolved 审计）
- [x] `supplier_identity_links` 系统设置管理 UI（管理员菜单、canonical 选项、查看、新增、编辑、删除、权限与前端校验）
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
- [x] PROCESS 外协报检隐藏责任部门的 canonical ID 设置（首次唯一旧名称原子引导、改名稳定、并发与歧义 fail-closed、发布维护门禁）
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
- [ ] 通过正式发布链路执行不合格项责任类型 migration 与 `[object Object]` remediation：先 dry-run 审核 OPEN unresolved 清单，再 apply 并核对无错误责任部门显示、NC 编号及质量损失索引。
- [x] 核对事业部生产回填汇总（工单修复 142 条，不合格项修复 46 条，无冲突和并发覆盖）
- [ ] 人工处置事业部回填遗留的 124 条工单和不合格项侧 8 个无法解析计数
- [ ] 完成 supplier identity wave 的生产回填与健康检查：v0.24.0 的 migration 已执行，但 maintenance 被 17 条未核实的 PROCESS supplier identity 阻断后又被错误绕过；本轮修复上线后必须通过正常发布链路重新运行。
- [ ] 使用已登录业务账号验收秦皇岛吉兴机械制造有限公司供应商画像的 7 月 8 日不合格项、手工工程问题、进货合格率和完整历史项目
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
