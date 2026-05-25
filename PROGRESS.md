# 项目进度

## 当前状态

- 最新 commit: `8f81a61` (docs: rebuild project documentation system)
- 测试状态: 38 文件 / 225 测试全部通过
- Lint: 通过

## 已完成

- [x] 项目文档体系重建（AGENTS.md、CONSTRAINTS.md、模块 ARCHITECTURE.md）
- [x] 确定目标架构：3 层（api → modules → utils）
- [x] 确定精简方案全部范围

## 进行中

- [ ] 后端精简重构（方案已定，待执行）

## 精简方案（完整范围）

### 阶段一：清理死代码

1. 删 core/（module-registry + master-data + validation 移到 utils）
2. 删 services/（31 个兼容壳），替换 158 个 API 文件 import
3. 删 scripts/（39 个治理脚本），精简 root scripts/
4. 删 packages/qgs-domain/（死代码，0 处引用）
5. 删 packages/qg-enums/（合并到 qgs-shared）
6. constants/、schemas/ 并入 modules/
7. 精简 package.json check 链路（20+ → 4）

### 阶段三：模块逻辑优化

11. inspection 拆分（2251 行 → 4 个文件）：
    - inspection.service.ts — 检验记录 CRUD
    - inspection-template.service.ts — 模板绑定
    - inspection-archive.service.ts — 归档任务
    - quality-record.service.ts — 质量记录
12. supplier 拆分（677 行 → 2 个文件）：
    - supplier.service.ts — CRUD + 查询
    - supplier-scoring.ts — 评分纯函数
13. 合并薄模块：
    - auth（54 行）→ 合并到 user/
    - preference（125 行）→ 合并到 user/
    - welder-score（95 行）→ 合并到 welder/
    - master-data-rename（37 行）→ 删除
    - base（276 行）→ 删除，通用方法内联到调用方

### 阶段四：utils/ 归位

14. 业务相关 utils 迁入对应 modules/（40+ 文件）

### 阶段五：CI + 架构守护

15. 更新 .github/workflows/ci-gate.yml（16 job → 5 job）
16. 重写 scripts/check-qms-architecture.sh（执行新架构规则）

## 已知问题

- services/ 兼容壳被 158 个 API 文件引用，删除前需批量替换
- API 层存在 133 个文件直接 import prisma，需逐个提取到 service
- core/master-data/governance-write 被多个 API 调用，删除前需替换为简单查找

## 下一步

执行阶段一（清理死代码）→ 阶段二（路由瘦身）→ 阶段三（模块优化）→ 阶段四（utils 归位）→ 阶段五（CI 守护）
