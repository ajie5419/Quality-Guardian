# 供应商质量评分白皮书（草案 v1）

- 文档版本：`v1.0`
- 生效日期：`2026-02-14`
- 适用模块：`QMS / 供应商管理`

## 1. 目标

建立可解释、可复核、可调参的供应商质量评分体系，用于：

- 供应商准入/观察/冻结决策辅助
- 质量风险排序与跟踪
- 供应商画像中的分数拆解展示

## 2. 评分范围与周期

- 评分范围：`0-100`
- 统计窗口：近 12 个月
- 评分对象：供应商主数据 `suppliers.name` 匹配的质量记录

## 3. 总分结构（加权）

总分计算公式：

```text
总分 = 来料质量*40% + 工程质量*25% + 售后质量*25% + 稳定性*10%
```

权重参数：

| 分项     | 权重 |
| -------- | ---- |
| 来料质量 | 0.40 |
| 工程质量 | 0.25 |
| 售后质量 | 0.25 |
| 稳定性   | 0.10 |

## 4. 分项定义

### 4.1 来料质量分（IncomingScore）

- 来料通过率：`qualifiedCount / incomingBatchCount`
- 来料失败批次率：`failCount / incomingBatchCount`

```text
IncomingScore = 100 * (0.7*通过率 + 0.3*(1-失败批次率))
```

说明：无来料数据时默认 100 分。

### 4.2 工程质量分（EngineeringScore）

- 严重度加权：`A*1 + B*0.5 + C*0.2`
- 严重度指数：`min(1, 严重度加权 / 3)`
- 损失指数：`min(1, 工程损失 / 20000)`

```text
EngineeringScore = 100 * (1 - 0.3*严重度指数 - 0.7*损失指数)
```

### 4.3 售后质量分（AfterSalesScore）

- 严重度加权：`A*1 + B*0.5 + C*0.2`
- 严重度指数：`min(1, 严重度加权 / 3)`
- 损失指数：`min(1, 售后损失 / 20000)`

```text
AfterSalesScore = 100 * (1 - 0.3*严重度指数 - 0.7*损失指数)
```

### 4.4 稳定性分（StabilityScore）

- 连续重大异常风险：`consecutiveBigFailures / 3`（截断到 1）
- 严重问题占比（A/B）
- 未关闭问题占比（工程未 `CLOSED` + 售后未 `RESOLVED/COMPLETED/CLOSED/CANCELLED`）

```text
StabilityScore = 100 * (1 - 0.4*连续风险 - 0.3*严重占比 - 0.3*未关闭占比)
```

## 5. 状态建议规则（自动）

仅对当前状态为 `Qualified` 的供应商触发自动建议：

### 5.1 Frozen（冻结）

需要同时满足样本门槛后才触发：

- 问题总数 `>= 3`
- 且 `连续重大异常 >= 3` 或 `单笔损失 > 80000`

### 5.2 Observation（观察）

满足任一条件：

- 总分 `< 75`
- 来料批次 `>= 5` 且来料合格率 `< 90%`
- 问题总数 `>= 3` 且（严重占比 `>= 0.7` 或 未关闭占比 `>= 0.7`）

## 6. 等级映射

- A：`>= 90`
- B：`80-89`
- C：`65-79`
- D：`< 65`

## 7. 可解释性输出字段

后端返回并在前端展示：

- `qualityScore`
- `incomingScore`
- `engineeringScore`
- `afterSalesScore`
- `stabilityScore`
- `incomingQualifiedRate`
- `engineeringIssueCount`
- `afterSalesIssueCount`
- `totalEngineeringLoss`
- `totalAfterSalesLoss`

## 8. 设计原则

- 小样本保护：单/双问题不直接触发冻结
- 损失优先：损失权重高于严重度（70% vs 30%）
- 状态与分数分离：状态用于决策，分数用于排序与趋势

## 9. 已知边界

- 名称匹配依赖 `supplierName/supplierBrand` 文本一致性
- 历史手工状态可能与自动建议不一致

## 10. 后续计划

- 增加规则版本化与生效历史
- 增加 10 个标准样本自动回归测试
- 在画像中增加扣分明细（按记录）
