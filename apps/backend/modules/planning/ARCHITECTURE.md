# planning 模块

## 职责

质量策划：BOM 管理、DFMEA、ITP、项目文档。含 BOM 工序身份治理。

## 文件结构

```
planning/
├── bom.ts / planning-bom.service.ts        # BOM 管理与查询
├── planning-bom-governance-resolution.service.ts  # BOM 治理裁决
├── bom-import-governance.ts / bom-process-identities.ts  # 导入与工序身份
├── dfmea.ts                                # DFMEA
├── itp.ts                                  # ITP 检验计划
└── planning-bom.service.ts                 # BOM 主服务
```

## 对外接口

- `PlanningBomService` — BOM 管理
- `PlanningBomGovernanceResolutionService` — BOM 工序身份治理
- BOM / DFMEA / ITP 查询与导入服务

## 依赖

- `~/utils/prisma`
- `~/modules/process-master` — 全局工序主数据
- `~/modules/task-dispatch` — ITP 任务联动
- `~/modules/file-storage` — 项目文档附件

## 特殊约束

- BOM 工序必须引用 canonical `processId`（身份治理强制，V2 契约）
- 历史无身份数据由治理脚本回填，冲突 fail-closed
