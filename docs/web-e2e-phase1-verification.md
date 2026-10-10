# Quality Guardian Web E2E 第一阶段验收记录

> **历史快照，非当前验收结果。** 本文记录早期三例版本，源码哈希 `85d6def62585881d9e7db7a030c0e1616d1c042bd42279d162c5ad71c993bd1c`。后续 seed、配置、报告器、编排与业务测试已有变化，以下检查和范围说明不能作为当前代码的通过证据。当前 58 例（报检含鉴权20＋售后4＋计量6＋监督6＋供应商8＋质量损失5＋工单管理5＋检验管理4）联合验证、BUG 修复及清理证据统一见 [当前验收报告](web-e2e-verification.md) 和 [覆盖矩阵](web-e2e-business-coverage.md)。原记录保留供追溯。

## 1. 提交基线与工作区状态

- **开工提交基线 (HEAD)**：`3659414212510f09cc63f3ac856d6ec6dbe6135e`
- **分支**：`main`
- **保护既有改动**：本阶段保留工作树中既有未提交改动，未执行 `git commit`、`git push`、`git merge`、部署或分支保护调整。

## 2. 修改文件清单

| 文件 | 变更说明 |
| --- | --- |
| `package.json` | 根 `test:e2e` 命令改为 `pnpm --dir apps/web-antd run test:e2e`，由编排脚本统一生命周期 |
| `turbo.json` | 配置 `test:e2e.cache: false`，避免 E2E 结果被 Turbo 缓存 |
| `vitest.config.ts` | 排除 `apps/web-antd/e2e/**`，避免单测将 Playwright 规格误当单测运行 |
| `.gitignore` | 忽略 `output/playwright/` 测试产物目录 |
| `apps/web-antd/package.json` | 增加 `"test:e2e": "node ../../scripts/e2e/run.mjs"` |
| `apps/web-antd/vite.config.mts` | 支持 `QGS_E2E_MODE=isolated` 代理到动态后端端口，关闭 mock 插件 |
| `internal/vite-config/src/config/application.ts` | 隔离模式下禁用 `envDir` 加载，仅消费进程中的安全环境变量 |
| `internal/vite-config/src/utils/env.ts` | 隔离模式阻止读取任何 `.env` 文件 |
| `docs/testing.md` | 补充 Web E2E 第一阶段规范：单测 mock DB 与 E2E 真实环境分工、macOS container 隔离准则 |
| `apps/web-antd/playwright.config.ts` | **(新增)** Playwright 配置，强制要求 `isolated` 模式、单 worker、禁用非脱敏 trace/video |
| `apps/web-antd/e2e/auth-and-request.spec.ts` | **(新增)** 3 个核心用例：错误密码拒绝、登录/登出保护、UI创建报检单+列表与刷新后详情核验 |
| `apps/web-antd/e2e/reporter.ts` | **(新增)** 安全 reporter，生成脱敏 `report.json` / `report.html`，遮蔽 token 与凭据 |
| `apps/backend/scripts/e2e-seed.ts` | **(新增)** 最小前置数据 seed（部门/用户/角色/数据权限/工序/部件/字典/工单/BOM），不建报检单 |
| `scripts/e2e/run.mjs` | **(新增)** 全生命周期隔离编排：动态凭据、端口、安全校验、临时迁移、启动、执行、清理 |
| `scripts/e2e/safety.mjs` | **(新增)** 数据库与资源安全守卫（host/port/db/user/owner/label 多重校验） |
| `scripts/e2e/safety.test.mjs` | **(新增)** 16 项纯函数安全规则单测 |
| `scripts/e2e/backend-build.mjs` | **(新增)** 临时后端构建脚本，基于隔离目录进行 Nitro 构建 |

## 3. 运行环境

- **操作系统/架构**：macOS (Darwin arm64)
- **Node.js**：v22.22.3
- **包管理器**：pnpm 10.12.4
- **容器引擎**：macOS 原生 Contained (`container CLI version 1.0.0 (build: release, commit: ee848e3)`)
- **镜像**：`docker.io/library/mysql:8.0` (mysqld Ver 8.0.46), `docker.io/library/redis:alpine` (Redis server v=8.8.0)
- **浏览器**：Playwright 1.53.2 (`.cache/playwright/chromium-1179`, Chromium 138.0.7204.23)

## 4. 最终代码验证记录（三轮独立运行）

所有运行均基于完全相同的源码哈希（`sourceSha256: 85d6def62585881d9e7db7a030c0e1616d1c042bd42279d162c5ad71c993bd1c`）。

| 运行 ID | 类型 | 执行命令 | 退出码 | 用例结果 | 实际测试耗时 (Playwright) | 独立数据库 / 端口 |
| --- | --- | --- | --- | --- | --- | --- |
| `6b29ea6607bfb4a5fa4355b3` | 正常运行 1 | `pnpm test:e2e` | 0 | 3/3 passed | 14,567 ms | `qgs_e2e_6b29ea6607bfb4a5fa4355b3` (MySQL: 65067, Redis: 65070) |
| `ea5ddbb2f581672123ba950e` | 故意失败对照 | `QGS_E2E_NEGATIVE_CONTROL=1 pnpm test:e2e` | 1 | 2 passed, 1 failed | 16,178 ms | `qgs_e2e_ea5ddbb2f581672123ba950e` (MySQL: 65335, Redis: 65338) |
| `d4ce036dabe8b0e9e5e1537a` | 恢复正常运行 2 | `pnpm test:e2e` | 0 | 3/3 passed | 14,523 ms | `qgs_e2e_d4ce036dabe8b0e9e5e1537a` (MySQL: 49293, Redis: 49295) |

### 故障注入结果说明 (`ea5ddbb2f581672123ba950e`)

在第 3 个用例（重开详情核验）故意注入不存在的哨兵文本断言 `INTENTIONALLY ABSENT E2E SENTINEL`。

- **结果**：Playwright 准确报错 `Timed out 1000ms waiting for expect(locator).toContainText(expected)`，该用例 fail，前 2 个用例 pass。
- **总退出码**：1，成功捕获失败，未发生静默 skip。
- **随后**：清理逻辑正常执行，全部容器与端口按预定规则安全回收。

## 5. 产物与脱敏报告路径

- **正常运行 1**：`output/playwright/6b29ea6607bfb4a5fa4355b3/`
  - 结构化证据：`run.json`, `seed.json`
  - 测试报告：`report.json`, `report.html`
  - 脱敏截图：`login-rejected.png`, `login-success.png`, `logged-out.png`, `request-reopened.png`
  - 进程日志：`api.log`, `web.log`, `playwright.log`, `backend-build.log`
- **故意失败对照**：`output/playwright/ea5ddbb2f581672123ba950e/`
  - 失败遮罩截图：`failure-5be201ba04e9ebfe34fe-4c8651817c7ba286f9f3.png`
- **恢复正常运行 2**：`output/playwright/d4ce036dabe8b0e9e5e1537a/`
  - 包含完整的 4 张业务流程全量截图与日志。

## 6. 资源与端口回收核验

- **原有容器/卷保护**：执行前已有容器 `ut-postgres` 及卷 `qms-container-mysql-data`、`qms-container-redis-data` 原样保留，未受任何改动或清理影响。
- **专属资源清理**：3 次运行的所有 `qgs-e2e-*` 容器均已从现场删除（`container list --all` 确认不存在）。
- **进程与端口**：所有测试进程组已完全退出；12 个测试分配端口经 `lsof` 检测无任何残留监听（LISTEN 为空）。

## 7. 相称静态检查结果

- `rtk vitest run scripts/e2e/safety.test.mjs`：16/16 passed
- `pnpm exec eslint`（改动相关脚本与配置）：0 errors, 0 warnings
- `pnpm --dir apps/backend exec tsc --noEmit`：0 errors
- `pnpm --dir apps/web-antd run typecheck`：0 errors
- `pnpm run check:qms-arch`（changed 模式）：0 errors

## 8. 未验证范围说明

1. 业务流程：仅覆盖第一阶段范围（登录/登出鉴权 + 过程报检单 UI 创建与详情核验），派工、检验记录录入、不合格品处理、关闭流程留待后续阶段。
2. 端形态：仅验证桌面 Web (Chrome)，未涉及移动端（H5 / 微信小程序）。
3. CI 与持续集成：第一阶段仅在本地 macOS 原生容器环境运行，不修改现有 GitHub Actions 工作流。
