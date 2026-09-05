# metric-governance 模块

## 职责

维护业务 Metric Definition 的稳定 Code、元数据、版本、生命周期、Owner 状态和审计轨迹。模块只治理 Definition，不计算、缓存、投影或返回任何业务指标值。

## 文件结构

```
metric-governance/
├── metric-governance.service.ts       # 生命周期、CAS、版本创建和审计
├── metric-governance-validation.ts    # 输入与不可执行元数据校验
├── metric-governance-readiness.ts     # ACTIVE 前置证据、Owner、Policy 校验
├── metric-governance-finalization.ts  # 审批证据到 DRAFT Registry 的幂等固化
├── metric-governance-bootstrap.ts     # 首批 DRAFT Definition 的幂等 bootstrap
├── metric-governance.types.ts         # Definition 输入与受限枚举
├── metric-governance.module.ts        # module audit action declaration
└── index.ts                           # 对外唯一入口
```

## 不变量

- `metricCode` 全局唯一且稳定；名称不是主键。
- `metric_definition_versions` 只允许 create，禁止 update/delete；每个 Definition 内的 version 唯一。
- `currentVersion` 是当前业务语义版本，`revision` 是并发 CAS 修订号，两者不可混用。
- 只有 `DRAFT` Definition 可原地更新；所有 Definition 状态变更和更新使用 `status + revision` 的 `updateMany` CAS。
- `ACTIVE` 公式或口径变化只能通过新建 Version，不允许直接覆盖；物理删除一律禁止，废止使用 `DEPRECATED`。
- Definition 不保存或执行 SQL、JavaScript、表达式或 DSL；`formulaType` 仅是不可执行的语义标签。
- `BUSINESS_DECISION_REQUIRED` 的当前 Version 不得激活；Owner 未确认时必须 `ownerDeptId=null` 与 `ownerStatus=UNCONFIRMED`。
- `ACTIVE` 必须由当前 Version 的不可变 Approval Evidence、Decision Trace、有效生效日和至少一条确认的 BUSINESS Owner assignment 共同支撑；Definition 汇总状态不能替代 Owner assignment。
- `metric_policy_dependencies.status=PENDING` 必须阻断激活；Policy / Data Owner 可以显式保存为 `UNKNOWN`，不得为满足校验伪造组织 ID。
- Canonical lineage 指向 Canonical Definition Version，而不是仅指向 Definition，避免没有 Version 的 successor 被消费。
- 审计复用 `SystemLogService.auditLog`，覆盖 CREATE、UPDATE_DRAFT、ACTIVATE、NEW_VERSION、DEPRECATE、OWNER_CHANGE。

## 数据权限边界

本模块的 RBAC 只管理 Definition 元数据的读取和变更。`scopePolicy` 记录指标值应使用的范围语义，但绝不修改、替代或绕过来源模块现有的 DataScope / AnalyticsAccessContext。Dashboard、Report、projection 和 Worker 继续是指标值的独立消费者或生产者。

## Bootstrap 边界

bootstrap 以 `metricCode` 幂等识别首批 10 项，只创建缺失的 `DRAFT/v1` Definition。它不修改已存在 Definition、不补写 Version、不自动激活冲突项，也不在 Prisma migration SQL 中植入业务定义数据。

## PHASE-1.7A 治理模型边界

- `metric_approval_evidences` 是 Decision ID 到 Version 的追加式审计行，保存批准状态、选项、定义、来源和 `Human Business Approval`；Version 上的 trace 字段仅用于快速追溯，不能替代 evidence row。
- `metric_owner_assignments` 允许 BUSINESS / POLICY / DATA 多责任归属。业务负责人可确认文本责任标签而不填写不存在的 `ownerDeptId`；联合责任保留为一个批准标签，不强行拆成虚构部门。
- `metric_canonical_mappings` 保留 legacy Definition 到 Canonical Version 的 lineage，不删除 legacy Definition，也不写入或重算历史指标值。
- 模块不自动执行 finalization；PHASE-1.7 的显式治理动作才可调用 finalization，且其结果仍是 `DRAFT`，不触发 Dashboard、Report、Projection 或 DataScope 迁移。
