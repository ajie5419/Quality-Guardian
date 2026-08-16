# welder 模块

## 职责

焊工资质台账与评分：焊工主数据维护、评分刷新（独立 worker）与导出。

## 文件结构

```
welder/
├── welder.service.ts                # 焊工台账主服务
├── welder.ts                        # 写入数据构造/列表查询纯函数
├── welder.schema.ts                 # 校验 schema
├── welder-score-refresh.service.ts  # 评分刷新入口
└── welder-score-worker.service.ts   # 评分 worker（持久队列消费）
```

## 对外接口

- `WelderService` — 焊工台账
- `WelderScoreRefreshService` — 评分刷新

## 依赖

- `~/utils/prisma`
- `~/utils/redis` — 队列
- `~/modules/inspection` — 焊工关联检验数据（评分来源）

## 特殊约束

- 评分重算走持久队列 + worker，不在请求进程内全量重算
- 写操作经 `sanitizeWelderWriteData` 白名单清洗
