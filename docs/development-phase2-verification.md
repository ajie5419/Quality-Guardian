# 研发降负第二阶段验证记录

日期：2026-10-08。基线：`codex/remove-dept-rank@6ad199065c4131bfd74947919411cbb80aa890ac`。第二阶段门禁已通过，按授权执行独立本地提交；未推送、未改写第一阶段提交。

## 第一阶段提交与证据边界

第一阶段本地提交：

```text
6ad199065c4131bfd74947919411cbb80aa890ac
chore(project): add dev daily check router and qms arch error guidance
```

已核对该提交只包含 12 个专项文件：`CHANGELOG.md`、`PROGRESS.md`、`PROJECT_STATE.md`、`docs/api-conventions.md`、`docs/development-workflow.md`、`docs/testing.md`、`package.json`、`scripts/check-daily.mjs`、`scripts/check-daily.test.mjs`、`scripts/check-qms-architecture.sh`、`scripts/check-qms-architecture.test.ts`、`scripts/qms-rule-help.mjs`。不含 `.gitignore`、`docs/PROJECT_GUIDE.md` 或第二阶段 Commitlint 修改。

以下为会话中实际执行的命令及可访问证据，不用本轮复测冒充历史验证：

| 实际执行 | 可核对结果 |
| --- | --- |
| `pnpm run check:docs-drift; pnpm run check:qms-arch; rtk vitest run scripts/check-daily.test.mjs scripts/check-qms-architecture.test.ts scripts/ci-gate.test.ts` | 整组 shell 退出码 0；docs-drift 与架构输出 PASS，测试 47 PASS；未单独记录前两条命令的退出码 |
| 再次单独执行上述 `rtk vitest run ...` | 退出码 0，47 PASS |
| `echo 'chore(project): add dev daily check router and qms arch error guidance' \| pnpm exec commitlint --edit /dev/stdin` | 退出码 0，实际提交消息通过 CLI 校验 |
| `rtk git add`，逐项指定上述 12 个文件 | 退出码 0；暂存清单核对不含两处既有脏改动 |
| `rtk git commit -m "chore(project): add dev daily check router and qms arch error guidance"` | 退出码 0，返回 `6ad1990`；RTK 仅输出提交摘要，无逐项 hooks 日志 |

**历史验证缺口**：提交当轮未留有完整 `pnpm lint` 与 `check:type` 重跑证据。前轮第一阶段实现时确实运行过 `pnpm run check:type`，退出码 0，3 项 Turbo 缓存命中且 weapp 自身脚本跳过；这不证明提交当轮完整四项门禁均已执行。不能将成功提交或本轮检查当作历史门禁、逐项 hooks 通过的证明。

本轮发现原 `commit-msg` 配置 `pnpm exec commitlint --edit $1` 没有使用 Lefthook 传入的消息文件。单独给 hook 提供非法消息文件时，CLI 回退读取默认消息，错误返回 0。此证据只证明参数接线缺陷，不能据此断言全部历史 Git 提交都绕过了 Commitlint。现在改为 `pnpm exec commitlint --edit "{1}"`，使用实际 hook 验证合法消息为 0、非法消息为 1，并覆盖含空格的文件路径；该定向补测本身没有创建新提交。

## 第二阶段修改

| 文件 | 改动 |
| --- | --- |
| `scripts/check-docs-drift.sh` | D1 提供同步、diff 审阅、复验三步指引；D2/D3 提供人工地图维护指引；缺状态文件与缺模块架构说明分别给出可行路径 |
| `scripts/sync-project-state.sh` | 复用已有 Node 进行唯一标记块替换；拒绝缺失、重复或倒置标记，保留块外人工说明及原换行；不新增 Python 依赖 |
| `scripts/check-daily.mjs` | 明示未执行 docs-drift，只提供条件式同步建议；推荐受影响脚本和 Commitlint 的定向测试 |
| `scripts/check-daily.test.mjs` | 在真实陈旧文档场景证明仅输出建议，不执行检查器或同步，不改文档 |
| `scripts/check-docs-drift.test.ts` | 真实文件系统正反例，包含实际漂移、同步后恢复、人工说明保留、缺文档与标记异常 |
| `internal/lint-configs/commitlint-config/index.mjs` | 从同一允许集合生成完整 scope 列表与示例，取消固定应用/共享包名分组；允许集合与其他规则不变 |
| `internal/lint-configs/commitlint-config/index.test.ts` | 实际工作区全部包名、原有别名、空 scope、非法 scope、包移除/改名提示、CLI 与真实 commit-msg hook 验证 |
| `eslint.config.mjs` | 仅新增根 `.dsh-project-memory/**` 全局忽略，不忽略嵌套同名目录或业务源码 |
| `lefthook.yml` | 仅修复 commit-msg 消息文件参数接线；保留其他 hook 与门禁 |
| `docs/development-workflow.md` | 补充数字同步、缺文档处置和提交 scope 报错的使用说明 |
| 本文件、`CHANGELOG.md`、`PROGRESS.md`、`PROJECT_STATE.md` | 记录阶段状态、验证结果与历史证据缺口；不手写或刷新未变化的统计数字 |

开工时 Commitlint 的未提交修改与上一轮本专项补丁一致，已在该在途修改上完成。`.gitignore` 与 `docs/PROJECT_GUIDE.md` 使用开工 SHA-256 比较确认逐字节未变；实现开工时暂存区为空，HEAD 为第一阶段提交。

## 第二阶段验证

从仓库根执行：

```bash
rtk vitest run scripts/check-daily.test.mjs scripts/check-docs-drift.test.ts internal/lint-configs/commitlint-config/index.test.ts scripts/check-qms-architecture.test.ts scripts/ci-gate.test.ts
```

退出码 0，5 个文件、60 项测试通过。其中本阶段 daily/docs/scope 为 18 项，其余 42 项复验第一阶段架构与 CI 接线。

| 验证命令 | 退出码与范围 |
| --- | --- |
| `pnpm run check:docs-drift` | 0；真实工作区数字与地图一致 |
| `pnpm run check:qms-arch` | 0；原历史债务基线保留，新违规仍阻断 |
| `pnpm run check:type` | 0；3 项任务完成，未命中 Turbo 缓存；weapp 仍是原有 skip，不算该端类型验收 |
| `pnpm exec eslint scripts/check-daily.mjs scripts/check-daily.test.mjs scripts/check-docs-drift.test.ts internal/lint-configs/commitlint-config/index.mjs internal/lint-configs/commitlint-config/index.test.ts` | 0；全部本阶段 JS/TS 代码与测试 |
| `bash -n scripts/check-docs-drift.sh scripts/sync-project-state.sh` | 0；两份 shell 脚本语法 |
| `pnpm run check:daily -- --base HEAD` | 0；只生成建议，不测漂移、不自动同步 |
| 目标文件 `pnpm exec prettier --check` 与 `rtk git diff --check` | 0；格式与 diff 检查 |

反例验证：

- 实际增加模块/TS 文件并修改版本后，D1 返回 1，给出 `docs:sync → diff → docs-drift`；检查本身不写状态文件。执行同步后返回 0，人工说明和 CRLF 换行保持原样，复验返回 0。
- code_map 缺项、引用已删除模块或文件缺失均返回 1；数字同步不改地图，也不能使这些违规通过。
- PROJECT_STATE 缺失时检查和同步均失败；缺模块 ARCHITECTURE 仍仅提示、返回 0，阻断等级不变。
- 同步标记缺失、重复或倒置时返回 1，原文件完整保留。
- 全部实际包名、7 个原有通用 scope 与空 scope 放行；`tooling`、不存在的包和错误大小写仍阻断。假设包改名或移除的提示样例不会列出固定的旧应用包名。
- CLI 非法 scope、类型、空主题和过长标题均返回 1；真实 commit-msg hook 的合法/非法消息分别返回 0/1。

本地原始输出和逐条退出码保存在临时证据目录： `/var/folders/c5/40f_dvrx0bz9qp74_7849b4c0000gn/T/qgs-phase2-evidence-R5r7zS`，包含 `checks.json`、检查日志及保护文件开工哈希。目录可能被系统清理，测试命令与用例留在仓库中可重复执行。

## 第二阶段提交与门禁解除（2026-10-08）

用户已明确授权方案 1：在 `eslint.config.mjs` 中补充最小全局忽略规则 `['.dsh-project-memory/**']`，不扩大忽略到业务代码，不删除或格式化本地生成目录，解除全量 `pnpm lint` 阻塞，并完成第二阶段独立本地提交，不推送；保留 `.gitignore` 与 `docs/PROJECT_GUIDE.md` 既有改动。

目标提交文件共 14 个（第二阶段原 13 个专项文件 + `eslint.config.mjs`）：

1. `eslint.config.mjs`
2. `internal/lint-configs/commitlint-config/index.mjs`
3. `internal/lint-configs/commitlint-config/index.test.ts`
4. `lefthook.yml`
5. `scripts/check-docs-drift.sh`
6. `scripts/check-docs-drift.test.ts`
7. `scripts/sync-project-state.sh`
8. `scripts/check-daily.mjs`
9. `scripts/check-daily.test.mjs`
10. `docs/development-workflow.md`
11. `docs/development-phase2-verification.md`
12. `CHANGELOG.md`
13. `PROGRESS.md`
14. `PROJECT_STATE.md`

| 提交前实际门禁/检查命令 | 退出码与结果 |
| --- | --- |
| `pnpm lint` | **0**；Prettier 格式检查通过，ESLint 全量扫描通过，无报错（`.dsh-project-memory/**` 已安全忽略） |
| `pnpm run check:type` | 0；3 项 Turbo 任务完成（缓存命中），weapp 仍为原有 skip，不算该端类型验收 |
| `pnpm run check:qms-arch` | 0；历史 baseline 保留，无新增违规 |
| `pnpm run check:docs-drift` | 0；状态事实与 code_map 双向一致 |
| `rtk vitest run scripts/check-daily.test.mjs scripts/check-docs-drift.test.ts internal/lint-configs/commitlint-config/index.test.ts scripts/check-qms-architecture.test.ts scripts/ci-gate.test.ts` | 0；60 PASS、0 FAIL |
| `bash -n scripts/check-docs-drift.sh scripts/sync-project-state.sh` | 0 |
| `pnpm run check:daily -- --base HEAD` | 0；只打印建议 |
| `rtk git diff --check` | 0 |

开工基线与两处既有保护文件（`.gitignore`、`docs/PROJECT_GUIDE.md`）经 SHA-256 比对确认逐字节未变。

## 未验证范围与回退边界

此前全量 lint 因本地生成目录失败；按用户授权加入仅针对仓库根目录的忽略后，全量 lint 与四项提交门禁均已通过。没有运行全量业务测试、真实业务页面/移动端、数据库、生产或 GitHub CI；未执行 pre-push，也未推送。没有重演第一阶段真实提交的 pre-commit 全流程，不将当前 commit-msg 补测视为历史 hooks 证据。

本阶段无业务数据写入、不改架构 baseline、不变更 scope 允许集合。回退时只撤销表中本阶段改动，保留第一阶段提交和开工时两处既有差异。第二阶段实现、定向验证及必需提交门禁已完成；实际提交 hash 和 hooks 结果在成果提交后追加到本文，避免将尚未执行的操作写成已通过。
