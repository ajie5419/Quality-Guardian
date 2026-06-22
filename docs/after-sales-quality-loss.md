# 售后 / 质量损失 / 报表 — 模块契约

> 本文档记录 2026-06-18 Phase 1 / 2 重构后这三个模块之间的边界、写入门、读路径与默认决策。改这条链路之前请先读完本文档。

## 默认决策（已锁定）

| 编号 | 内容 |
|---|---|
| D1 | 报表"售后损失" KPI = `grossCost − recovered`（净损失），不是总成本 |
| D2 | 售后入列损失条件 = `isClaim = true OR (materialCost + laborTravelCost) > 0`，与 commissioning 一致 |
| D3 | 一张售后单只对应一个供应商。多供应商分摊本轮不做 |

## 数据流向

```
┌─ after_sales (External 源)
├─ quality_records (Internal 源)
├─ vehicle_commissioning_issues (Commissioning 源)
└─ quality_losses (Manual 源)
        │
        ▼ 每次源表写入后调
  QualityLossIndexService.upsertFromXxx()  ← 唯一写入门
        │
        ▼
  quality_loss_index (物化索引表)
        │
        ▼ 读路径
  QualityLossService.getAllLosses / getLossSummary
    / getDashboardSummary / getYearlyCharts / getDrillDown
        │
        ▼
  前端 quality-loss 列表 / Dashboard / 钻取
```

## 物化表 `quality_loss_index`

每行一条索引（按 `(source, sourcePk)` 唯一），字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | VARCHAR(64) PK | 显示 ID。Manual 用 `QL-<pk>`, Internal 用 `INT-<pk>`, External 用 `EXT-<pk>`, Commissioning 用 `DA-<pk>` |
| `source` | VARCHAR(16) | `Manual` / `Internal` / `External` / `Commissioning` |
| `sourcePk` | VARCHAR(64) | 源表主键 |
| `occurDate` | DATETIME(3) | 发生日期，列表默认按此降序 |
| `amount` | DECIMAL(10,2) | 损失金额（D2 决策后才会进入索引） |
| `actualClaim` | DECIMAL(10,2) | 已追偿金额 |
| `status` | VARCHAR(32) | 原始源表状态字符串（未归一化） |
| `projectName` / `workOrderNumber` / `respDept` / `partName` / `description` | 显示字段 |
| `supplierBrandId` | 仅 External 有值（Phase 3 Step 15 会全面切到 ID） |
| `createdBy` | 用于数据权限 SELF 过滤 |
| `isDeleted` | 软删，源行去激活时索引同步 `isDeleted=true` |
| `indexedAt` | 索引行最后一次写入时间，用于排查漂移 |

## 写入门契约

`QualityLossIndexService` 是 `quality_loss_index` 的**唯一写入门**。任何修改 4 个源表的代码路径都必须在主写入完成后调用对应的 `upsertFromXxx`：

| 源 | 写入门 | D2 准入条件 |
|---|---|---|
| External (after_sales) | `upsertFromAfterSales(row)` | `row.isClaim OR (materialCost + laborTravelCost) > 0` |
| Internal (quality_records) | `upsertFromInternal(row)` | `row.lossAmount > 0` |
| Commissioning (vehicle_commissioning_issues) | `upsertFromCommissioning(row)` | `row.isClaim OR row.lossAmount > 0` |
| Manual (quality_losses) | `upsertFromManual(row)` | `row.amount > 0` |

不满足准入条件时索引行会被 soft-delete（`isDeleted=true`）。源表软删时通过 `softDeleteSource / softDeleteSourceMany` 同步。

**禁止**直接对 `quality_loss_index` 表写 SQL；任何聚合需求要么走源表写入门，要么明确扩展 `QualityLossIndexService`。

## 状态机锁定（D 决策的延伸）

`PUT /api/qms/quality-loss/{id}` 跨源带 `status` 字段时返回 `400 BAD_REQUEST`（错误信息："该来源的状态请回到对应业务页面修改"）。三个下游 service 的 `updateQualityLossFields` 签名也已收紧，类型上不再接受 status，防止未来回归。

- 改 External 源 status → 回售后单 PUT
- 改 Internal 源 status → 回不合格品 PUT
- 改 Commissioning 源 status → 回调试验收问题 PUT
- 改 Manual 源 status → 在质量损失页直接改（这是 Manual 唯一允许的 status 路径）

## 数据权限

- 中间件 `apps/backend/middleware/4.data-scope.ts` 已纳入 `/api/qms/quality-loss` 前缀
- `quality-loss.module.ts` 声明 `deptFields=['respDept']`、`selfFields=['createdBy']`、`selfFallsBackToDept=true`
- `DataScopeService.buildQualityLossIndexWhere` 用于索引表查询；列表 / 仪表板 / 钻取都自动带数据权限过滤
- `PUT /api/qms/quality-loss/{id}` 在 service 入口按 source 查 createdBy / respDept，与当前 user 比对，失败返回 403

历史数据 `createdBy='system'`（migration 期间 backfill）。SELF scope 用户首次部署后看不到旧数据 —— 业务侧需要：
- 给历史数据手工归属（UPDATE quality_records SET createdBy='<userId>' WHERE ...）
- 或给相关角色配置 ALL data scope policy

## 报表 KPI 契约

`AfterSalesIntegrationService.getReportPeriodMetrics({ start, end })` 返回：

```ts
{
  grossCost: number;   // SUM(materialCost + laborTravelCost)
  recovered: number;   // SUM(actualClaim)
  netLoss: number;     // grossCost - recovered
}
```

周报 / 月报"售后损失"取 `netLoss`（D1）。KPI desc 是"售后总成本扣减已追偿"。

## 部署 checklist

每次涉及本模块的部署：

1. `pnpm -C apps/backend exec prisma migrate deploy` 应用 pending migration
2. 重启后端进程（让 Prisma client 加载新 schema）
3. 触发 `qms-quality-loss-backfill` 容器一次性同步索引表（deploy workflow 自动）
4. 监控容器完成（数据量大时 1-2 分钟），完成后容器自动退出

## 端到端冒烟（手测）

部署后跑一次确认链路：

```bash
# 1. 创建一条售后单
curl -X POST http://localhost:5320/api/qms/after-sales \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"workOrderNumber":"WO-1","materialCost":100,"laborTravelCost":50,"isClaim":true}'

# 2. 索引表应该有同步行
mysql> SELECT id, source, amount, actualClaim, isDeleted FROM quality_loss_index
       WHERE sourcePk = '<as-id>';
# 期望: amount=150, actualClaim=0, isDeleted=0

# 3. 通过 quality-loss PUT 更新 actualClaim
curl -X PUT http://localhost:5320/api/qms/quality-loss/EXT-<sn> \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"lossSource":"External","actualClaim":80,"pk":"<as-id>"}'

# 4. 索引行 actualClaim 同步
mysql> SELECT actualClaim FROM quality_loss_index WHERE sourcePk = '<as-id>';
# 期望: 80

# 5. 周报 KPI = netLoss
curl http://localhost:5320/api/qms/report/summary?type=weekly \
  -H "Authorization: Bearer $TOKEN"
# 期望: 售后损失 = 150 - 80 = 70

# 6. 非 owner 用户改他人记录被 403
curl -X PUT http://localhost:5320/api/qms/quality-loss/EXT-<sn> \
  -H "Authorization: Bearer $OTHER_TOKEN" \
  -d '{"lossSource":"External","actualClaim":99,"pk":"<as-id>"}'
# 期望: 403 FORBIDDEN

# 7. 跨源带 status 被 400
curl -X PUT http://localhost:5320/api/qms/quality-loss/EXT-<sn> \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"lossSource":"External","status":"Closed","pk":"<as-id>"}'
# 期望: 400 BAD_REQUEST

# 8. 把 cost / isClaim 都置零，记录从损失列表消失
curl -X PUT http://localhost:5320/api/qms/after-sales/<as-id> \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"materialCost":0,"laborTravelCost":0,"isClaim":false}'
mysql> SELECT isDeleted FROM quality_loss_index WHERE sourcePk = '<as-id>';
# 期望: isDeleted=1
```

## 已知 paper cuts（不阻塞）

- `api/qms/quality-loss/[id].put.ts` 46 行，距 50 行限只剩 4 行余量。后续往这路由加分支前先抽 helper
- `QualityLossDataScopeService.apply` / `sortFilteredByScope` 在读路径已不用，仅自身测试调；未删，留作未来潜在需求
- Phase 3 待办：supplier 评分异步化（Step 14）、supplierBrand → supplierBrandId 收敛（Step 15）、after-sales 对外只读 facade（Step 16）

## 相关代码（按热度）

- `apps/backend/modules/quality-loss/quality-loss-index.service.ts` — 唯一写入门
- `apps/backend/modules/quality-loss/quality-loss.service.ts` — 读路径主体
- `apps/backend/modules/quality-loss/quality-loss-route-update.service.ts` — PUT ownership guard + 状态机锁
- `apps/backend/modules/after-sales/after-sales-integration.service.ts` — 售后对外只读门（含 getReportPeriodMetrics）
- `apps/backend/modules/report/report-summary.service.ts` — 周报 / 月报 KPI 组装
- `apps/backend/prisma/migrations/20260618000100..20260622000200` — 本轮所有 schema 变更
