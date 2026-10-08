import { fileURLToPath } from 'node:url';

/**
 * Presentation only: keep detectors, baseline counts and machine records intact.
 * Related rules share a remedy so failure output stays readable.
 */
export const ruleHelp = {};

function register(rules, reason, fix, example, reference) {
  for (const rule of rules.split(' ')) {
    ruleHelp[rule] = { reason, fix, example, reference };
  }
}

register(
  'R1 R2',
  '页面直接请求会绕开统一认证、错误处理与响应解包。',
  '把请求放入 #/api 下的封装，页面只调用业务 API 函数。',
  "import { getInspectionRequests } from '#/api/qms/inspection-request';",
  'docs/data-contract.md',
);
register(
  'R3 B-R2 B-S1',
  '文件超过职责层的行数上限或历史基线上限。',
  '按查询、写入、schema 或 UI 组件职责拆分；路由只保留认证、校验、服务调用和响应。不要提高 baseline。',
  'API <= 50 lines; module source <= 500 lines; index.vue <= 500 lines',
  'docs/PROJECT_GUIDE.md',
);
register(
  'B-D1',
  '旧目录破坏当前模块化入口。',
  '将业务代码归入 modules/<domain>，通过 index.ts 暴露；先核对调用方再移除旧目录。',
  'apps/backend/modules/inspection/index.ts',
  'code_map.md',
);
register(
  'B-R1',
  '路由直接访问数据库，绕开领域服务与权限边界。',
  '移除路由中的 Prisma import，把查询或写入移到所属模块 Service。',
  "import { InspectionService } from '~/modules/inspection';",
  'docs/api-conventions.md',
);
register(
  'B-R3 B-T1 B-T2 B-T3 B-S2',
  '类型断言掩盖了未经校验的输入或缺失值。',
  '对输入使用 Zod parse/safeParse；为数据库与服务返回值声明真实类型；先判断空值再使用。',
  'const body = bodySchema.parse(await readBody(event));',
  'docs/development-workflow.md',
);
register(
  'B-S3',
  '同步进程调用会阻塞后端事件循环。',
  '使用异步 execFile/spawn，并等待结果和处理失败。',
  'const exec = promisify(execFile); await exec(command, args);',
  'CONSTRAINTS.md',
);
register(
  'B-S4',
  '时间戳无法提供受控的唯一业务身份。',
  '用 Prisma @default(cuid()) 或 cuid2 创建 ID；计时用途无需修改。',
  'id String @id @default(cuid())',
  'CONSTRAINTS.md',
);
register(
  'B-S5 B-E1 B-E2',
  '日志缺失或 console 输出无法保留统一错误上下文。',
  '使用 createModuleLogger；catch 记录原始错误后再决定抛出或返回；API 使用 logApiError。',
  "logger.error({ err: error }, 'Operation failed');",
  'docs/PROJECT_GUIDE.md',
);
register(
  'B-M1',
  '跨模块引用内部文件会形成隐式依赖。',
  '在目标模块 index.ts 导出公开能力，调用方从模块入口导入。',
  "import { SupplierService } from '~/modules/supplier';",
  'code_map.md',
);
register(
  'B-M2',
  '中文展示名称会变化，不能决定业务分支。',
  '使用 @qgs/shared 的业务枚举；主数据比较 canonical ID。',
  'request.status === INSPECTION_REQUEST_STATUS.CLOSED',
  'docs/data-contract.md',
);
register(
  'B-EC',
  '自由字符串错误码无法被客户端稳定识别。',
  '使用共享 ErrorCode；确需新码时先在共享字典登记。',
  "throw new BusinessError(ErrorCode.CONFLICT, '状态已变化', 409);",
  'docs/data-contract.md',
);
register(
  'B-GF',
  '新增名称字段未登记其来源、身份及读写策略。',
  '在 master-data-fields.ts 登记 source/canonical/targets，并接入 governed-write；不要增加豁免。',
  'apps/backend/utils/master-data-fields.ts',
  'docs/data-contract.md',
);
register(
  'B-ID1 B-ID2 B-ID3 B-ID4 B-ID5 B-ID6 B-ID7 B-ID8 B-ID9',
  '主数据名称被当作身份，或写入/事件缺少 canonical ID。',
  '选项、Map、关联及聚合按 ID；服务端按有效 ID 重建名称快照；TEAM 写入走身份服务，名称解析仅限已审查导入入口。',
  "supplierId + supplierName; groupBy({ by: ['supplierId'] })",
  'docs/master-data-identity-governance.md',
);
register(
  'B-SEC1',
  'Unsafe SQL 与字符串插值组合存在注入风险。',
  '使用 Prisma 参数化 $queryRaw，并保留 DataScope 条件。',
  'prisma.$queryRaw(Prisma.sql(["SELECT id FROM suppliers WHERE id = ", ""], id))',
  'CONSTRAINTS.md',
);
register(
  'B-MAP1',
  '新增模块、路由或视图目录未同步导航索引。',
  '在 code_map.md 对应分组登记目录职责；模块内部新增文件无需新增模块条目。',
  '**inspection/** — 检验记录、不合格项与报检任务',
  'code_map.md',
);
register(
  'B-TEST1 B-TEST2',
  '测试集中存放或缺少同名被测源码，难以定位归属。',
  '把测试放在源码旁，保留相同文件名主干；已有合法孤立测试由原 baseline 管理。',
  'foo.service.ts + foo.service.test.ts',
  'docs/testing.md',
);
register(
  'B-TEST3',
  '单元测试导入 Prisma 却没有 mock，可能连接真实数据库。',
  '在同一测试文件 vi.mock("~/utils/prisma")，只提供被测方法需要的 delegate。',
  "vi.mock('~/utils/prisma', () => ({ default: { suppliers: { findMany: vi.fn() } } }));",
  'docs/testing.md',
);
register(
  'B-AUTH1 B-AUTH2',
  '写入口缺少声明授权，或前端使用未登记权限码。',
  '使用现有共享权限码并调用 authorizeWrite/requireSystemAdmin；新增权限在模块声明中登记。public 例外仅按现有契约处理。',
  'await authorizeWrite(event, INSPECTION_REQUEST_PERMISSION_CODES.CLOSE);',
  'docs/permission-module.md',
);
register(
  'B-N1 B-N2 B-N3',
  'Schema 字段命名不符合共享数据契约。',
  '布尔字段用 is/has，时间字段用 At 或已登记语义时间名，标量字段用 camelCase；数据库列名通过 @map 保留。',
  'isDeleted Boolean @default(false); createdAt DateTime',
  'docs/data-contract.md',
);
register(
  'B-MF',
  '聚合实现未登记，或技术指标文档与代码登记不一致。',
  '同步 docs/metrics-registry.md 与 utils/metrics-registry.ts 的实现 ID、位置与口径；业务指标治理仍独立执行。',
  'apps/backend/utils/metrics-registry.ts',
  'docs/metrics-registry.md',
);
register(
  'R-GET',
  'GET 中的写入或初始化会让读取产生业务副作用。',
  '移除 GET 写入；初始化移入已授权的维护流程，业务写入使用授权写端点。',
  'GET -> query service; POST -> authorized write service',
  'docs/api-conventions.md',
);
register(
  'R-SCOPE R-SCOPE-AGG R-SCOPE-RAW',
  '受保护的读写缺少对象范围，裸 ID 不证明访问权限。',
  '使用 Scoped Repository 或领域 DataScope 构造器；统计和参数化 SQL 同样带范围。不要添加 allow marker 逃避检查。',
  'repo.updateAccessible({ where: { id, isDeleted: false, status: expectedStatus }, data }, access)',
  'docs/permission-module.md',
);
register(
  'R-SM',
  '状态写入缺少当前状态条件，可能被并发请求覆盖。',
  '在事务中使用受控状态机及带原状态的 CAS，检查 count 为 0 时返回冲突，同时保留对象范围。',
  'where: { id, status: expectedStatus, isDeleted: false }; if (count === 0) throw conflict;',
  'docs/development-workflow.md',
);
register(
  'R-CLOSE-EFFECT',
  '附件先读后合并再写可能丢失并发更新。',
  '沿用关闭副作用服务：documents/selfCheckDocuments 的原快照作为 CAS 条件，失败重新读取后有限重试。',
  'where: { id, documents: previousDocuments, selfCheckDocuments: previousSelfCheckDocuments }',
  'apps/backend/modules/inspection/ARCHITECTURE.md',
);
register(
  'R-IDEMPOTENCY',
  '受保护的创建入口未经过统一幂等 claim/replay 事务。',
  '复用 withRequestIdempotency 和已登记 operationKey；创建与 claim 同事务，副作用只在首次提交后执行。',
  'apps/backend/modules/inspection/inspection-request-create.post.service.ts',
  'docs/idempotency.md',
);
register(
  'R-BOUNDED-READ R-DB-AGGREGATION',
  '列表、导出或统计在内存处理无界业务数据。',
  '列表/导出在 DB 中分页并限制 take；统计使用已登记且带范围的 groupBy/aggregate。',
  'findMany({ where, skip, take: Math.min(pageSize, 100), orderBy })',
  'CONSTRAINTS.md',
);

export function formatRuleHelp(rules) {
  return [...new Set(rules)]
    .map((rule) => {
      const help = ruleHelp[rule];
      if (!help) {
        throw new Error(`No repair guidance registered for ${rule}`);
      }
      return `规则 ${rule} 原因：${help.reason}\n  修复：${help.fix}\n  范例：${help.example}\n  参考：${help.reference}`;
    })
    .join('\n\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${formatRuleHelp(process.argv.slice(2))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
