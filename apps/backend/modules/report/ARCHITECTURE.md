# report 模块

## 职责

质量报表生成与路由：多维度报表输出、合格率投影与对账、日报/周报摘要。

## 文件结构

```
report/
├── report.service.ts                      # 报表主服务
├── report-route.service.ts                # 报表路由
├── report-summary.service.ts / report-daily-summary.service.ts  # 汇总/日报
├── pass-rate.ts / pass-rate-process.ts    # 合格率计算
├── pass-rate-projection*.service.ts       # 合格率投影（物化/影子对账）
├── pass-rate-issue-summary.service.ts     # 不合格项合格率汇总
├── pass-rate-trend.get.service.ts         # 合格率趋势
└── vehicle-failure-rate*.service.ts       # 车辆故障率
```

## 对外接口

- `ReportService` / `ReportRouteService` — 报表查询与路由
- 合格率投影、趋势、故障率、日报服务

## 依赖

- `~/utils/prisma`
- `~/modules/quality-loss` / `~/modules/inspection` / `~/modules/after-sales` — 数据来源（只读）
- `~/utils/canonical-master-data` — 身份解析

## 特殊约束

- 合格率投影重建走持久队列 + 独立 worker，与请求进程隔离
- 统计按 canonical ID 聚合，透传身份状态（已解析/待治理/失效）
- 阴影对账与发布门禁（WP3 六窗口）
