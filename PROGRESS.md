# 项目进度

## 当前状态

- 最新 commit: `8f81a61` (docs: rebuild project documentation system)
- 测试状态: 38 文件 / 225 测试全部通过
- Lint: 通过

## 已完成

- [x] 项目文档体系重建（AGENTS.md、CONSTRAINTS.md、模块 ARCHITECTURE.md）
- [x] 确定目标架构：3 层（api → modules → utils）
- [x] 确定精简方案全部范围
- [x] 逐模块代码审计完成

## 进行中

- [ ] 后端精简重构（方案已定，待执行）

## 精简方案（完整范围）

### 阶段一：清理死代码

1. 删 core/（module-registry + master-data + validation 移到 utils）
2. 删 services/（31 个兼容壳），替换 158 个 API 文件 import
3. 删 scripts/（39 个治理脚本），精简 root scripts/
4. 删 packages/qgs-domain/（死代码，仅 2 处引用）
5. 删 packages/qg-enums/（合并到 qgs-shared）
6. constants/、schemas/ 并入 modules/
7. 精简 package.json check 链路（20+ → 4）

### 阶段二：路由瘦身

8. 133 个直接 import prisma 的路由 → 逻辑提取到 modules/
9. 11 个 200+ 行路由 → 拆到 service
10. 65 个 as any / as Record → 加 zod schema

### 阶段三：模块逻辑优化

11. inspection 拆分（2251 行 → 4 个文件）：
    - inspection.service.ts — 检验记录 CRUD
    - inspection-template.service.ts — 模板绑定
    - inspection-archive.service.ts — 归档任务
    - quality-record.service.ts — 质量记录
12. supplier 拆分（677 行 → 2 个文件）：
    - supplier.service.ts — CRUD + 查询
    - supplier-scoring.ts — 评分纯函数
13. after-sales 拆分：
    - getStats(220 行) 拆成 KPI/趋势/格式化三个函数
    - getChartAggregation 的 6 路 switch 改为数据驱动
14. dashboard 重构：
    - 不再直接查 5 张其他模块的表，改为调各模块 service
    - getStats(180 行) 拆分
15. quality-loss 重构：
    - 不再直接查 4 张其他模块的表
    - getAllLossesUnpaginated(160 行) 拆分
16. 合并薄模块：
    - auth（54 行）→ 合并到 user/
    - preference（125 行）→ 合并到 user/
    - welder-score（95 行）→ 合并到 welder/
    - master-data-rename（37 行）→ 删除
    - base（276 行）→ 删除，通用方法内联到调用方

### 阶段四：修复安全与正确性问题

17. system 模块 SQL 注入修复（$queryRawUnsafe + 字符串拼接）
18. user 模块硬编码 placeholder 密码修复
19. ID 生成统一改为 cuid（dept、rbac、user 用 Date.now() 不防碰撞）
20. Prisma schema 补全缺失表（user_preferences、audit_logs 字段），消除 as any
21. system 模块 execSync 改为异步执行

### 阶段五：消除跨模块直接查表

22. 提取共享工具：部门树遍历（4 处重复）→ utils/dept-tree.ts
23. dashboard 改为调各模块 service 获取统计
24. quality-loss 改为调各模块 service
25. supplier 评分聚合改为调各模块 service
26. report 改为调各模块 service
27. welder-score 改为调 inspection 模块获取质量记录
28. work-order 改为调 work-order-requirement 模块获取需求汇总
29. vehicle-commissioning 改为调 system-log 获取审计日志

### 阶段六：性能问题修复

30. supplier.findAll 全量加载 + 内存分页 → DB 层聚合 + 分页
31. metrology.getList 全量加载 → DB 层分页
32. welder.findAll 全表查询算统计 → 统计缓存或 DB 聚合
33. quality-loss 全量加载 → DB 层聚合
34. dashboard.getStats 11 个并行查询 → 缓存 + 按需刷新
35. vehicle-commissioning.getDailyReports 全表扫描 → 结构化存储 + 索引
36. file-storage.registerReferencesFromAttachments N+1 → 批量查询

### 阶段七：utils/ 归位

37. 业务相关 utils 迁入对应 modules/（40+ 文件）
38. Excel 解析逻辑提取为共享工具 utils/excel-parser.ts

### 阶段八：CI + 架构守护

39. 更新 .github/workflows/ci-gate.yml（16 job → 5 job）
40. 重写 scripts/check-qms-architecture.sh（执行新架构规则）

### 阶段九：模块自治（消除手动维护点）

41. 引入 xxx.module.ts 声明文件（menus、dataScope、audit、idResolution）
42. 实现 utils/module-loader.ts：启动时自动扫描
43. 删除 utils/menu-bootstrap.ts（1144 行）
44. DataScopeService 去掉硬编码白名单
45. 审计日志改为声明式
46. 主数据 ID 解析下沉到 service 层

### 阶段十：遗留清理

47. rbac 双写遗留清理（legacy JSON + 新关系表统一为新表）
48. report 模块 import 路径修复
49. dictionary 缓存一致性修复
50. file-storage 策略模式重构（local/OSS）
51. system-log 审计日志改为软删除
52. dept 字段别名统一（remark/description、orderNo/sort）

## 已知问题

- services/ 兼容壳被 158 个 API 文件引用，删除前需批量替换
- API 层存在 133 个文件直接 import prisma，需逐个提取到 service
- core/master-data/governance-write 被多个 API 调用，需替换为简单查找
- 8 个模块存在跨模块直接查表，需逐步解耦
- 7 个模块存在全量加载到内存的性能问题

## 下一步

阶段一 → 二 → 三 → 四 → 五 → 六 → 七 → 八 → 九 → 十
