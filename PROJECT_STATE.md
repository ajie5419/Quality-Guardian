# PROJECT_STATE — Quality Guardian 项目状态日报

> **本文件是"现在到哪一步了"的唯一权威。** 每次 AI 会话开工先读本文件；完成工作后必须更新本文件。硬数据段（版本/模块数/文件数）由 `pnpm run docs:sync` 自动生成，**禁止手写**；AI 只维护"进度 / 最近变更 / 待办"三段。

## 硬数据（自动生成，勿手改）

<!-- docs:sync-start -->
- 最后同步时间: 2026-08-17 08:51
- 版本: 0.27.0
- 后端模块数: 33
- 模块 TS 文件数: 674
- 后端测试文件数: 297
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
- [ ] 数据契约自动化：命名规则检测（P2，文档约束先行）
- [ ] 完成不合格品项剩余设备验收（真机、实际新增提交、照片上传、分页、草稿、账号切换）
- [ ] 通过正式发布链路执行不合格项责任类型 migration 与 remediation（先 dry-run 审核 OPEN unresolved 清单）
- [ ] 完成 supplier identity wave 生产回填与健康检查（此前 17 条 PROCESS supplier identity 被错误绕过）
- [ ] 使用已登录业务账号验收秦皇岛吉兴机械制造供应商画像的 7 月 8 日数据
- [ ] 治理售后反馈部门、检验归档、BOM 项目和文档项目剩余的 18 条缺失身份
- [ ] 将单进程 EventEmitter 替换为可持久化、跨实例、可重试的事件机制
- [x] 上传文件类型可配置化（匿名上传白名单收紧，默认纯图片，可切图片+PDF）
- [ ] 其他待办详见 PROGRESS.md 待办段

---

## 交接检查清单（每个 AI 会话离开前）

- [ ] 硬数据段执行过 `pnpm run docs:sync`（或确认无新增/删除模块、版本未变）
- [ ] 「当前进度」反映实际状态
- [ ] 「最近变更」顶部插入了本次变更
- [ ] 「待办」勾选/新增了对应项
- [ ] `CHANGELOG.md` 已追加记录
