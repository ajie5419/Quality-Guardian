# 测试标准

## 测试框架

单元测试用 Vitest，版本以 workspace catalog 为准，当前配置在仓库根 `vitest.config.ts`。Web E2E 用仓库已声明的 Playwright，正式配置在 `apps/web-antd/playwright.config.ts`。

## 运行命令

```bash
rtk vitest run apps/backend                              # 后端全量
rtk vitest run apps/backend/modules/supplier/supplier.service.test.ts  # 定向
pnpm exec vitest --watch                                 # 监听模式
rtk vitest run scripts/e2e/safety.test.mjs                 # 隔离环境守卫的纯函数测试
pnpm test:e2e                                            # 真实 Web E2E，全生命周期
```

## 文件位置

单元测试文件放在被测代码同目录，命名 `{name}.test.ts`（纯 JavaScript 工具可用 `.test.mjs`）：

```
modules/supplier/
├── supplier.service.ts
└── supplier.service.test.ts
```

跨页面的 Web 用户流程集中放在 `apps/web-antd/e2e/*.spec.ts`；辅助报告代码也在该目录。它们由 Playwright 执行，根 Vitest 明确排除此目录，不按单测执行。`scripts/e2e/` 是测试编排及安全守卫，守卫单测与实现相邻，由 Vitest 执行。不得把 E2E 分散到业务 Service 旁边，也不得用通用 `__tests__/` 集中业务单测。

## 什么需要测试

1. **Service 层的业务逻辑** — 尤其是条件分支、计算、状态流转
2. **纯函数工具** — 数据转换、格式化、校验函数
3. **复杂查询构建** — where 条件拼装逻辑

## 什么不需要测试

1. 简单的 CRUD 透传（Prisma 本身已测过）
2. API 路由文件（通过集成测试或手动验证）
3. 类型定义和常量

## 测试编写模式

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    tableName: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('ServiceName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should do something specific', async () => {
    vi.mocked(prisma.tableName.findMany).mockResolvedValue([]);
    const result = await ServiceName.method();
    expect(result).toEqual(expected);
  });
});
```

## 硬规则

1. **单元测试** mock 数据库，不连真实 DB；**隔离 Web E2E** 必须使用真实 MySQL/Redis，不得 mock 业务响应或改用共享开发/生产数据库。
2. 每个 test case 只验证一个行为
3. 测试描述用英文，写清楚 input → output
4. 新增业务逻辑必须附带测试，纯重构不要求

报检创建、检验完成与关联不合格项的样板、事务和权限反例清单见 [日常开发指引](development-workflow.md)。日常推荐检查先运行 `pnpm run check:daily`；输出仅为建议，不能代替提交门禁。

## Web 核心业务 E2E 与长期执行要求

按用户 2026-10-08 新授权，每次修改或新增都必须评估影响，补齐或更新受影响 E2E 并实际执行根 `pnpm test:e2e`。代码改动至少执行桌面 Web 核心业务套件；新增入口、权限或状态路径必须增加对应 UI 操作与落库断言。纯文档或没有运行行为变化的改动也记录 E2E 执行和结果。仅解释/调查/审查且没有修改仍保持只读。资源缺失、配置错误、服务未就绪、seed 失败或用例失败均明确未验收，不能用单测/静态检查/旧结果替代，更不能静默 skip。

当前桌面套件为 44 例：报检 20 例（登录 3 例基础场景、5 例核心业务、12 例报检分支）、售后 4 例（成功闭环、权限隔离、分类/版本异常、丢失响应后重试）、计量 6 例（台账、借还两阶段、停用/超期拒绝、只读写权限、检定计划、弱网/并发）、监督 6 例（项目登记/编辑/软删、计划任务与日报完成、整改验证关闭、创建者及角色拒绝、终态非法写拒绝、延迟重试/同键冲突/并发幂等）及供应商独立治理 8 例（生命周期与原ID恢复、三种外协模式类别与身份策略、角色与部门数据隔离、版本并发与丢失更新防护、丢响应重试与同名防重、外协专属角色类别守卫）。状态以 [统一验收报告](web-e2e-verification.md) 的当前源码实测为准，完整路径见 [覆盖矩阵](web-e2e-business-coverage.md)。业务成功写入必须走 UI；seed 只初始化角色、权限、部门、主数据、菜单等前置条件，不生成被测报检/派工/检验/不合格/售后/计量/监督/供应商记录。非法参数及越权拒绝可使用真实 HTTP，不能代替成功闭环的 UI 操作。

本任务真实 E2E 检出的业务 BUG 必须及时最小根因修复、补局部单测、保留原断言复验并登记前后证据；未复验不得称已修复。授权不外扩到生产操作或无关重构。项目规则以 [项目档案第 7 节](PROJECT_GUIDE.md#7-常用命令与提交门禁从仓库根执行) 为准。本批不接 CI、不含移动端或微信小程序。

```bash
pnpm test:e2e                                    # 全部58例
QGS_E2E_SCOPE=inspection pnpm test:e2e            # 报检20例
QGS_E2E_SCOPE=inspection-branches pnpm test:e2e   # 报检分支12例
QGS_E2E_SCOPE=inspection-management pnpm test:e2e # 检验管理补齐4例
QGS_E2E_SCOPE=after-sales pnpm test:e2e           # 售后4例
QGS_E2E_SCOPE=metrology pnpm test:e2e             # 计量6例
QGS_E2E_SCOPE=metrology-risk pnpm test:e2e        # 借还与检定计划2例
QGS_E2E_SCOPE=metrology-ledger pnpm test:e2e      # 台账1例
QGS_E2E_SCOPE=supervision pnpm test:e2e          # 监督6例
QGS_E2E_SCOPE=supervision-project pnpm test:e2e  # 项目公共helper1例
QGS_E2E_SCOPE=supervision-risk pnpm test:e2e     # 权限/延迟重试与并发2例
QGS_E2E_SCOPE=supplier pnpm test:e2e             # 供应商治理8例
QGS_E2E_SCOPE=supplier-lifecycle pnpm test:e2e   # 供应商生命周期1例
QGS_E2E_SCOPE=supplier-risk pnpm test:e2e        # 供应商权限与类别守卫2例
QGS_E2E_SCOPE=quality-loss pnpm test:e2e         # 质量损失5例
QGS_E2E_SCOPE=quality-loss-lifecycle pnpm test:e2e  # 质量损失闭环1例
QGS_E2E_SCOPE=quality-loss-risk pnpm test:e2e    # 质量损失权限与状态机2例
QGS_E2E_SCOPE=work-order pnpm test:e2e           # 工单管理5例
QGS_E2E_SCOPE=work-order-lifecycle pnpm test:e2e # 工单生命周期1例
QGS_E2E_SCOPE=work-order-risk pnpm test:e2e      # 工单权限与重复状态2例
```

监督以实际 `/qms/supervision` 的项目/计划/日报/问题流程为准；不虚构审批。读权限共享，写权限为创建者所有权与 RBAC，不能套用报检的部门隔离。处理表单每次打开生成新请求键，丢响应保留原键；服务端使用现有幂等事务，在5分钟内重放原结果并检查当前所有权，同键不同payload返回409。立即重试仍可能被全局3秒防重拒绝；超过窗口后必须核验原ID和完整数据不变。新键相同内容的合法后续跟进允许新增。未带键的既有调用保持旧行为，不声称已获得同样的幂等保证。

### macOS 原生容器运行

使用 Contained 所调用的 Apple `container` CLI，无需 Docker。先确认原生容器系统已可用、镜像 `mysql:8.0` / `redis:alpine` 可获得，项目依赖已安装。安装本项目 Playwright 对应的浏览器：

```bash
PLAYWRIGHT_BROWSERS_PATH="$PWD/.cache/playwright" pnpm exec playwright install chromium
pnpm test:e2e
```

根命令直接调用 Web 包的 `test:e2e`，由 `scripts/e2e/run.mjs` 编排；不用 Turbo 缓存测试结果。无需创建或读取任何 `.env`。脚本不会启动或停止容器系统，不修改已有容器/卷和现有前后端服务。缺引擎、浏览器、镜像、配置、服务未就绪或 seed 失败均非零退出，不能静默 skip。直接启动 Playwright 配置但缺少专用环境时会拒绝执行；根入口按 scope 检查实际报告恰有 49/20/12/4/6/2/1/8/5 例且全部通过，零例、少例、skip 都失败。新增用例时同步更新入口数量守卫及矩阵，不能删除用例或放宽断言来取得通过。

### 数据库与资源隔离

- 每次生成独立运行 ID、数据库、MySQL 账号、数据库/Redis/JWT/登录凭据；凭据仅在内存中生成，通过子进程环境及 `container -e KEY` 注入，不写凭据文件、不把值放在 CLI 参数中。
- 显式 `QGS_E2E_MODE=isolated` 与 `NODE_ENV=test`，只准 `127.0.0.1`，四个本次独占端口均动态分配。第一阶段只支持本机原生容器；CI host 接入留第二阶段，当前不接受远端 host。
- 每次迁移/seed 前校验运行 owner、数据库、账号、端口及现场容器 ID、owner label、允许镜像和 loopback 端口绑定；连接就绪时同时核对数据库实际名称与 MySQL 当前账号。仅有数据库名称 `_test` 后缀不足以通过。
- 不继承调用者的数据库、云存储、通知或 JWT 环境。后端源码仅按明确目录复制到临时目录，排除 `.env*`，禁用 Nitro dotenv 加载；Web 的 Vite 环境加载在隔离模式只读进程环境，`envDir=false` 且关闭 mock 插件。
- seed 建立两个启用部门、报检/调度用户、同部门两个真实 QC、异部门调度及只读用户，采用 RBAC V2 链接及明确的 ALL/DEPT 策略；QC 具有 Close 和自己创建的不合格项 Edit 权限，异部门策略保存实际部门 ID。部件、工序及 PROCESS/INCOMING 可用选项、启用供应商、缺陷一级/二级分类、客户字典、工单、BOM 和菜单父节点都是真实 canonical 数据。所有主键动态 cuid；BOM 使用 `master_parts.id`，工序选项使用 `processes.id`，客户快照配对字典 ID，不使用 super 豁免，也不制造 TEAM/供应商映射。
- seed 只接受新库，初始化后报检单计数必须为 0。记录 `seed.json` 的实际 canonical IDs，UI 创建响应逐项核对这些 ID。每次运行销毁自己的数据库容器，不提供共享库重置或通用删除入口。
- Nitro 构建显式保留测试环境，停用现有源码中 `NODE_ENV=test` 的后台 scheduler/worker 分支。前后端、上传文件、数据库和 Redis 都属于本次运行；正常、失败或 SIGINT/SIGTERM 均进入清理，不清理别人的资源。容器删除前再次核对 owner，清理后核对所有状态的容器、进程退出与端口关闭，记录原有容器/卷前后清单。SIGKILL/断电不执行 JavaScript finally，须按记录的 ID 与现场 owner 人工核验后回收，禁止全局 prune。

### Schema 基线与迁移边界

仓库最早迁移直接 ALTER 既有 `inspections`，缺少可从空库重放的初始基线。直接对空库执行原有 `migrate deploy` 会报 P3018 / MySQL 1146。这是存量迁移历史边界，不能由本阶段 E2E 通过推定解决。

E2E 通过 Prisma `migrate diff --from-empty --to-schema-datamodel <临时 schema> --script` 从当前实际 schema **自动生成**临时基线迁移，然后在归属检查后执行 `migrate deploy`。不手写建表 SQL、不使用 `db push`、不改仓库历史迁移。该方式验证当前 schema 下的业务运行，不验证历史迁移升级或生产发布。

### 证据、失败对照与保密

每次证据写入 `output/playwright/<runId>/`（已忽略），含 `run.json`（版本、源文件哈希、执行命令/退出码、独立目标、清理）、`seed.json`（非秘密前置 IDs）、`report.json` / `report.html`、登录/退出/重开详情截图，以及 `api.log` / `web.log` / `playwright.log` 和编排节点日志。HTML 是只含脱敏结果的专用报告，不包含 Playwright 原始请求/步骤序列。

扩展流程另保存只读业务快照 `state-<stage>-<requestId>.json`，用于核对真实 request / dispatch / inspection / issue / link 终态及拒绝/重试前后不变。仅拦截已发送至真实后端的响应并 `abort` 来模拟弱网，不返回模拟成功响应。当前全局防重中间件会在 3 秒内拒绝重复写；创建的业务幂等窗口为 5 分钟，重试必须同时验证快速拒绝和窗口后原记录回放。编排的 `durationMs` 为包含建环境、构建、测试和清理的实测总耗时；各测试 `duration` 只表示 Playwright 用例时间。

原始 trace/video 会携带密码、Cookie 或 bearer token，第一阶段关闭；失败截图遮盖输入框，预先抑制 Playwright 自动输入值快照，日志/文本报告统一脱敏。不得把未脱敏 trace 用作交付证据。

```bash
QGS_E2E_NEGATIVE_CONTROL=1 pnpm test:e2e  # 详情断言故意失败，根命令必须退出 1
pnpm test:e2e                           # 正常必须退出 0，44 例全部通过
QGS_E2E_FAULT=seed pnpm test:e2e          # 故意缺少专用登录身份，seed 必须阻断
```

独立重复运行需要不同 runId/数据库/账号/端口，且各自 `requestsBeforeUI=0`、创建后列表唯一一行。不能复用旧工作树的通过证据；用 `run.json` 中 `sourceFiles` / `sourceSha256` 和当前文件哈希比对。当前统一验证记录见 [桌面 Web 四模块验收报告](web-e2e-verification.md)；[第一阶段三例记录](web-e2e-phase1-verification.md)仅为历史快照。同一交付中只补写这些运行的报告、源码未变时，可以如实引用该交付已经执行的 E2E，不把历史版本结果冒充当前结果。
