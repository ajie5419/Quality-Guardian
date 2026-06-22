# code_map.md — Quality Guardian 业务模块地图

本文件是项目的代码导航索引。新增/重构业务模块或对外接口时，必须同步更新本文件（见末尾"维护规则"）。

## 后端业务模块（`apps/backend/modules/`）

每个模块按域自包含；外部只能通过 `index.ts` 访问。

- **after-sales/** — 售后反馈单：登记、状态流转、责任部门与处理人跟踪
- **ai/** — AI 能力接入（对话/补全等通过 API 层暴露）
- **dashboard/** — 质量驾驶舱数据聚合与看板指标
- **data-scope/** — 数据权限过滤引擎（按部门/本人控制查询范围）
- **dept/** — 部门组织架构 CRUD
- **dictionary/** — 系统字典数据维护（枚举值、下拉选项）
- **file-storage/** — QMS 文件中心：文档上传、存储与分类
- **inspection/** — 检验域核心：检验记录、不合格品、报检任务、模板、归档同步
- **knowledge/** — 质量知识库：文档分类与知识条目
- **metrology/** — 计量器具全生命周期：台账、借用归还、检定计划、到期提醒
- **planning/** — 质量策划：BOM、DFMEA、ITP、项目文档管理
- **quality-loss/** — 质量损失记录与分析：金额、缺陷分级、供应商关联、趋势。读路径走物化表 `quality_loss_index`（见 `docs/after-sales-quality-loss.md`）
- **rbac/** — 角色权限控制：角色分配与菜单/按钮授权
- **report/** — 质量报表生成与路由（多维度报表输出）
- **supervision/** — 质量监督检查：立项→任务分配→问题跟踪→报告
- **supplier/** — 供应商质量评分：指标快照、全量排序、黑名单/观察期
- **system/** — 系统配置与基础设置
- **system-log/** — 系统操作日志记录与审计
- **task-dispatch/** — ITP 任务派发与流转：分配、状态推进、归档联动
- **user/** — 用户账号、认证（登录/刷新/微信小程序登录绑定）、个人偏好
- **vehicle-commissioning/** — 车辆调试验收管理（含审批流）
- **welder/** — 焊工资质台账与评分
- **work-order/** — 生产工单：创建、状态流转、数据权限过滤
- **work-order-requirement/** — 工单质量要求汇总（关联工单的质检附件与条目）

## 后端 API 路由

### 顶层（`apps/backend/api/`）

- **ai/** — AI 对话/补全接口
- **auth/** — 登录、登出、token 刷新、注册与回调（公开路径）
- **files/** — 通用文件上传与下载代理
- **menu/** — 动态菜单树查询（依据用户权限）
- **qms/** — QMS 业务路由聚合入口
- **system/** — 系统级管理接口（用户、角色、部门、字典）
- **telegram/** — Telegram Bot 通知推送
- **uploads/** — 文件上传端点
- **webhook/** — 外部系统回调接收

### QMS 子路由（`apps/backend/api/qms/`）

- **admin/** — QMS 后台管理（含 master-data 基础数据维护）
- **after-sales/** — 售后单 CRUD 与图表聚合
- **ai/** — QMS 域内 AI 辅助
- **common/** — 跨模块公共接口（合格率、损失趋势等）
- **dashboard/** — 驾驶舱指标数据
- **inspection/** — 检验记录、不合格品、模板与报检
- **knowledge/** — 知识库分类与条目
- **metrology/** — 计量器具台账、借用、检定计划
- **planning/** — BOM/DFMEA/ITP/项目文档
- **public/** — 无鉴权公开接口（如计量借用、扫码报检）
- **quality-loss/** — 质量损失记录
- **reports/** — 报表生成与查询
- **supervision/** — 监督检查项目、任务、问题
- **supplier/** — 供应商评分列表、快照排序与统计
- **task-dispatch/** — ITP 任务派发与状态
- **vehicle-commissioning/** — 车辆调试验收
- **welder/** — 焊工台账与评分
- **work-order/** — 工单接口
- **workspace/** — 工作台聚合（当前用户待办汇总）

## 前端业务视图（`apps/web-antd/src/views/`）

- **\_core/** — 框架核心视图：登录、404/fallback
- **dashboard/** — 工作台首页（workspace 看板）
- **mobile/** — 移动端精简视图：任务列表、派发、检验结果录入
- **qms/** — QMS 业务视图（下级见下表）
- **system/** — 系统管理：用户、角色、部门、字典、菜单、操作日志、监控

### `views/qms/` 子目录

- **after-sales/** — 售后反馈管理
- **dashboard/** — 质量驾驶舱大屏
- **file-center/** — 文件中心
- **inspection/** — 检验记录与不合格品
- **knowledge/** — 知识库浏览与管理
- **metrology/** — 计量器具管理
- **outsourcing/** — 外协/外包质量（后端无独立模块，共用 inspection）
- **planning/** — 质量策划（BOM/DFMEA/ITP）
- **quality-loss/** — 质量损失统计
- **reports/** — 报表查看与导出
- **shared/** — QMS 内跨页面共享组件/工具
- **supervision/** — 监督检查管理
- **supplier/** — 供应商质量评分与外协评分
- **vehicle-commissioning/** — 车辆调试验收
- **welder/** — 焊工管理
- **work-order/** — 工单管理
- **workspace/** — 用户工作台（个人待办）

## 共享包

- **`packages/qgs-shared/`** — 前后端同构共享：业务 DTO 类型、枚举、状态机常量、参数校验工具与领域模型

## 微信小程序（`apps/weapp/`）

基于 uni-app (Vue 3) 的微信小程序，面向一线质检人员。

- **pages/login/** — 微信登录 + 账号绑定
- **pages/home/** — 首页统计卡片与快捷入口
- **pages/request/** — 报检申请提交
- **pages/tasks/** — 检验任务列表与详情（含派单）
- **pages/inspect/** — 检验结果录入（含拍照上传）
- **pages/records/** — 我的检验记录

后端 API 复用现有端点，新增微信认证端点（`api/auth/wx-login`、`wx-bind`、`wx-refresh`）。详细文档见 `docs/weapp-development.md`。

## 维护规则

本文件随代码演进；过时即失去导航价值。

**必须更新本文件的场景：**

1. 新增 `apps/backend/modules/<name>/` — 在"后端业务模块"加一行
2. 删除或合并模块 — 删除/合并对应行
3. 新增顶层 API 路由目录（`apps/backend/api/<name>/` 或 `apps/backend/api/qms/<name>/`） — 在对应分组加一行
4. 新增前端 `apps/web-antd/src/views/<name>/` 顶层目录或 `views/qms/<name>/` 子目录 — 在前端视图加一行
5. 模块业务范围发生显著变化（如领域职责重新划分） — 修订对应描述

**不需要更新的场景：**

- 模块内部新增/删除文件
- 现有目录下新增单个 `.get.ts` / `.post.ts` 等具体端点文件
- 重构、改名同一目录下的内部 service

**描述写法：**

- 单行 ≤30 个汉字
- 写"做什么"，不写"怎么做"
- 与对应模块的 `ARCHITECTURE.md` 或 `<module>.module.ts` 菜单标题保持一致

**与 commit 的关系：**

新增模块/路由的 commit 必须同时修改 `code_map.md`。提交前自检：`git diff --name-only HEAD` 若包含 `apps/backend/modules/*/` 新目录或 `apps/backend/api/*/` 新目录，`code_map.md` 必须出现在改动列表中。
