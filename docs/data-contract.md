# 数据契约规范（Data Contract）

> 本文件是 Quality Guardian **数据层约束的权威文档**：字段治理、错误码、命名规则、前端数据消费、字段影响面。任何 AI 或人改数据相关代码前必须读本文件。状态：本文件为**规范成文**阶段；标注「待自动化」的条目将由架构门禁/脚本逐步强制执行（见文末路线图）。

---

## 1. 核心原则

**数据在系统里流动的方式，和代码一样受约束。** 本项目历史上"字段治理滞后 8 个月"的教训源于：数据字段的使用方式没有在创建时就被约束。本规范的目标是——**新字段一出生就登记，新错误码一出现就入字典，新联动一发生就可见**。

三个铁律：

1. **字段必须登记**：任何跨表复用、跨模块引用、或作为查询/统计条件的 name 字段，必须登记进 `apps/backend/utils/master-data-fields.ts`，否则属于"未治理字段"，禁止新增。
2. **代码必须引用而非硬编码**：业务值（名称、ID、枚举、字典项）只能来自登记过的 canonical 来源或 `@qgs/shared` 共享枚举，禁止在代码里写死。
3. **前后端必须同契约**：请求/响应字段、错误码、状态枚举，前后端只能消费同一份定义（`@qgs/shared` + 响应助手）。

---

## 2. 字段治理登记（P0）

### 2.1 什么是"受控字段"

满足以下任一条件的字段**必须登记**到 `master-data-fields.ts`：

- 同一业务名称被 **2 张以上业务表**引用（如 `supplierName` 出现在 inspections / quality_records / supervision_projects）
- 该字段会出现在**查询条件 / 统计分组 / 报表维度**（如 projectName 按事业部统计）
- 该字段来自**主数据/字典**（供应商、部门、工序、物料、项目、客户、缺陷类型等）
- 该字段是**派生值**（从多表聚合而来，如 projectName 从 4 张表派生）

### 2.2 新增受控字段的强制流程

```
发现新 name 字段需要跨表复用
        │
        ▼
① 在 master-data-fields.ts 登记（source + canonical + targets + 策略）
        │
        ▼
② 决定写策略：writeStrategy = dual-write（写 ID + 快照名称）或 name-only
        │
        ▼
③ 决定读策略：readStrategy = canonical-first（优先按 ID 解析）或 name-only
        │
        ▼
④ 决定 onlineWritePolicy = id-required（线上写必须带 ID）
        │
        ▼
⑤ 表结构：业务表加 <name> + <name>Id 两列（或既有快照列 + 新 ID 列）
        │
        ▼
⑥ 写路径接 governed-write（buildGovernedXxxWriteFields）或等价守卫
        │
        ▼
⑦ 统计/报表按 canonical ID 聚合，禁止按名称归并
```

### 2.3 登记字段的必需元数据

每个登记条目必须包含（见 `master-data-fields.ts` 现有 40+ 条为模板）：

| 字段 | 含义 | 示例 |
| --- | --- | --- |
| `key` | 治理键（全局唯一） | `supplierName` |
| `source` | 名称来源（表/字典/派生） | `{type:'table', table:'suppliers'}` |
| `canonical` | canonical 表与 ID/名称列 | `{table:'suppliers', idColumn:'id', nameColumn:'name'}` |
| `targets` | 引用该名称的所有表+列 | inspections.supplierName/supplierId 等 |
| `writeStrategy` | `dual-write` / `name-only` | `dual-write` |
| `readStrategy` | `canonical-first` / `name-only` | `canonical-first` |
| `backfillPolicy` | `canonical-id` / `none` | `canonical-id` |
| `auditPolicy` | 审计级别 | `canonical-id-and-orphan` |
| `rolloutWave` | 治理批次 | 0-8 |

### 2.4 待自动化（P0 门禁）

- [ ] 架构门禁新增规则：新增跨表 name 字段但未登记 `master-data-fields.ts` → 拦截
- [ ] 门禁校验：受控字段的查询/统计必须按 canonical ID 聚合（现有 B-ID1/B-ID4/B-ID8/B-ID9 基础上扩大覆盖面）

---

## 3. 错误码字典（P0）

### 3.1 现状问题

`response.ts` 只有 `code: 0 / -1` 两个值；`BusinessError.code` 目前是自由字符串。前端无法可靠地按错误类型分级提示（warning / error / notification）。

### 3.2 目标契约

统一错误码为 **枚举 + 白名单**，前后端共享定义：

```typescript
// @qgs/shared —— 错误码字典（待建）
export const ErrorCode = {
  VALIDATION: 'VALIDATION', // 参数校验失败 → 表单级提示
  NOT_FOUND: 'NOT_FOUND', // 资源不存在 → 404 语义
  FORBIDDEN: 'FORBIDDEN', // 无权限 → 403 语义
  UNAUTHORIZED: 'UNAUTHORIZED', // 未登录/过期 → 跳登录
  CONFLICT: 'CONFLICT', // 状态冲突/并发 → 刷新后重试
  BUSINESS: 'BUSINESS', // 通用业务错误 → warning 提示
  INTERNAL: 'INTERNAL', // 内部错误 → error 提示 + 记录
} as const;
```

### 3.3 规则

1. `throw new BusinessError(code, message, httpStatus)` 的 `code` **必须是 `ErrorCode` 枚举成员**，禁止自由字符串（`throw new Error('VALIDATION:...')` 已禁止，`BusinessError('任意字符串')` 同样禁止）。
2. `response.ts` 将 `BusinessError.code` 透传到响应顶层 `code` 字段（现有行为），前端按字典分级：
   - `VALIDATION` → 表单字段级 warning
   - `FORBIDDEN` / `UNAUTHORIZED` → 权限类 error + 可能的跳转
   - `CONFLICT` → 提示用户刷新后重试
   - 其他 → 通用 error 提示
3. 新错误码必须加入 `ErrorCode` 字典（集中定义），禁止在业务代码里发明新字符串。

### 3.4 待自动化（P0 门禁）

- [ ] 在 `@qgs/shared` 建 `ErrorCode` 枚举
- [ ] 架构门禁新增规则：`new BusinessError(<非枚举字面量>)` → 拦截（AST 检测）

---

## 4. 字段命名规则（P2）

### 4.1 通用规则

1. **响应/请求字段**：camelCase（`responsibleDepartmentId`，不是 `resp_dept_id`）。
2. **主数据引用成对**：业务表同时存 `name` 快照 + `nameId` canonical 引用（如 `supplierName` + `supplierId`），禁止只存 name 不存 ID（现状个别历史表例外，需治理推进）。
3. **布尔字段**：`is` / `has` 前缀（`isDeleted`、`isClaim`）。
4. **时间字段**：`At` 后缀（`createdAt`、`nextCalibrationDate`）。
5. **避免同义异名**：同一概念在跨表时尽量一致；历史不一致（如 `respDept` vs `responsibleDepartment`）需在治理登记中显式映射，**禁止新增第三套名字**。

### 4.2 治理登记与命名的关系

- 新字段命名时，先查 `master-data-fields.ts` 是否已有同概念治理键；已有则复用其 `name` + `nameId` 命名模式。
- 同名概念的 ID 列命名：`<fieldKey>Id`（如 `supplierId`、`projectId`、`partId`）。

### 4.3 自动化（P2，2026-08-17 落地）

- [x] 架构门禁新增字段命名检测（scripts/check-field-naming.mjs，规则 B-N1/B-N2/B-N3，挂入 `pnpm run check:qms-arch`）：
  - **B-N1**：Boolean 标量字段必须 `is`/`has` 前缀（`isDeleted`、`hasOwner`）
  - **B-N2**：DateTime 标量字段必须 `At` 后缀，或符合语义时间例外（`date`、`*Date`、`*Until`、`*Time`、`*AtCutoff`、`*AtSnapshot`）
  - **B-N3**：标量字段名必须 camelCase（禁止下划线；关系字段随表名不受限）
- 存量不合规字段（5 个 Boolean + 8 个 snake_case）已入 baseline 放行，**新增字段即拦截**；`--changed` 模式仅在 schema.prisma 变更时检查

---

## 5. 前端数据消费约束（P1）

适用 `apps/web-antd`（桌面 Web）与 `apps/weapp`（小程序）。

### 5.1 必须

1. **类型/枚举必须来自 `@qgs/shared`**：DTO、状态枚举、错误码、状态机常量，禁止在 `views/` 里重复定义或手写字符串字面量。
2. **请求必须走统一封装**：Web 用 `#/api` 下的封装（`useRequest` 系列），禁止裸 `axios`/`fetch`；小程序用 `api/request.ts`（自动注入 token、401 刷新）。
3. **表单项字段必须与后端 DTO 一致**：提交的 payload 字段名/类型必须与 `@qgs/shared` DTO 对齐，禁止前端自造字段名。
4. **状态/枚举展示用共享枚举**：列表状态、严重度、类别等通过 `@qgs/shared` 枚举的 `label/options` 方法渲染，禁止硬编码中文映射。

### 5.2 禁止

1. **禁止**在 `views/` 中硬编码业务值（部门 ID、供应商 ID、工序名、字典 key）。
2. **禁止**前端根据名称猜测 ID 或根据 ID 拼接名称（身份解析由后端 canonical 服务完成，前端只展示后端返回的 `name` + `id` 对）。
3. **禁止**在前端拼接多个已分页结果再过滤/排序（应改后端查询参数）。
4. **禁止**把表单校验逻辑与业务状态机耦合在组件里（状态流转后端为准）。

### 5.3 待自动化（P1 门禁）

- [ ] 前端代码检查：`views/qms/**` 禁止裸 `axios`/`fetch`、禁止 import `@qgs/shared` 之外的重复枚举定义
- [ ] 前端禁止硬编码已登记受控字段的 name 值

---

## 6. 字段影响面查询（P1）

### 6.1 问题

改一个字段（如 `supplierName`）可能波及：schema → 治理登记 → service → 前端 N 页 → 报表 → 统计。目前靠人工 grep，容易漏。

### 6.2 目标工具（待建）

```bash
pnpm run where:field <fieldName>
# 输出：
# 1. 治理登记（master-data-fields.ts 中 source/canonical/targets）
# 2. 后端引用（schema.prisma + modules/ 中的列/字段使用）
# 3. 前端引用（views/ + api/ 中的字段使用）
# 4. 统计/报表引用（groupBy/orderBy/聚合使用点）
# 5. 受影响模块清单（按模块聚合，供 code_map 联动）
```

### 6.3 字段改动强制 checklist（成文先行）

改任何受控字段前，必须确认以下影响面并同步修改：

1. `prisma/schema.prisma`（列定义）
2. `master-data-fields.ts`（治理登记，若有变化）
3. `governed-write.ts` 映射（若是写路径）
4. 后端 service / 统计 / 报表（canonical ID 聚合点）
5. `@qgs/shared` DTO（前后端契约）
6. 前端 `views/` 消费页 + 表单项
7. `code_map.md`（若涉模块职责变化）
8. 历史数据回填（若有存量数据，走 release maintenance）

### 6.4 待自动化（P1 脚本）

- [x] `scripts/where-field.mjs` 实现影响面查询（六层扫描：治理登记/schema/后端/shared/前端/WeApp）
- [x] 挂入 `pnpm run where:field`

---

## 7. 落地路线图

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 成文 | 本文件（字段治理/错误码/命名/前端/影响面） | ✅ 已落地 |
| P0-a | `@qgs/shared` 建 `ErrorCode` 枚举 | ✅ `packages/qgs-shared/src/enums/error-code.ts`（9 个 code + ERROR_UX_LEVEL 分级 + isErrorCode） |
| P0-b | 架构门禁：BusinessError 错误码白名单 | ✅ 规则 `B-EC`（check-qms-source-rules.mjs），存量 170 处已入 baseline，新增自由字符串拦截 |
| P0-c | 架构门禁：新增跨表 name 字段必须登记治理文件 | ✅ 规则 `B-GF`（scripts/check-governed-fields.py），增量检查：复用治理字段到未登记表 / 全新跨表字段 → 拦截 |
| P1-a | `where:field` 影响面查询脚本 | ✅ `scripts/where-field.mjs` + `pnpm run where:field <字段>`（六层扫描） |
| P1-b | 前端共享类型/禁裸请求门禁 | ✅ 规则 `R2`（views/qms 禁裸 axios/fetch），存量已 baseline，新增拦截 |
| P2 | 命名规则自动化检测 | ✅ 规则 `B-N1`/`B-N2`/`B-N3`（scripts/check-field-naming.mjs），存量 13 处入 baseline，新增字段即拦截 |

> 已落地项通过 `pnpm run check:qms-arch`（含 B-EC/B-GF/R2）与 `pnpm run check:docs-drift` 强制执行。
