# 列表关键词搜索共享 helper

## 日期

2026-05-29

## 需求描述

QMS 后台列表的关键词搜索散落在 8 个模块,每处都手写 `where.OR = [{ field: { contains: keyword } }, ...]`,字段命名与是否 trim 不一致, 改一处搜索行为要动一片。本次做**纯重构**:在现有 `utils/query-helpers.ts` 抽出一个泛型 helper,把这些「单关键词 → 多字段 OR」收敛到一处,统一行为、便于测试。

**零行为变化、零性能目标。** 按当前业务量(约 2 万条/年,查询恒带 category+year 索引过滤, 单分区仅数千行),`LIKE` 子集扫描是个位数毫秒,无性能问题;明确**不引入 FULLTEXT/搜索引擎** (过度设计)。helper 内部统一 `.trim()` 是唯一的归一化差异(见兼容性)。

## 涉及模块

inspection(记录查询、public 查询)、work-order、supplier、metrology、supervision、file-storage、dictionary。

**不涉及**:welder(其 `searchOr` 混入 team 子查询,非纯简单 OR)、inspection-issue-list(复杂部门解析 AND+模糊)。

## 数据库变更

无。不碰 schema.prisma,不新增 migration,不新增索引。

## 改动文件

新增 helper(加到既有文件,不新建 utils 文件,不触发 check:qms-arch 白名单):

- `apps/backend/utils/query-helpers.ts` — 新增 `buildKeywordOr`
- `apps/backend/utils/query-helpers.test.ts` — 新增/追加单测

替换调用点(统一改法见实现细节):

- `apps/backend/modules/inspection/inspection-record-query.service.ts`
- `apps/backend/modules/inspection/inspection-public-query.service.ts`
- `apps/backend/modules/work-order/work-order.service.ts`
- `apps/backend/modules/supplier/supplier.service.ts`
- `apps/backend/modules/metrology/metrology.service.ts`
- `apps/backend/modules/supervision/supervision-project.service.ts`
- `apps/backend/modules/file-storage/file-asset-query.ts`
- `apps/backend/modules/dictionary/dictionary.service.ts`

执行后:

- `CHANGELOG.md` — 记录执行结果(做了什么/验证结果/commit hash/遗留问题)

## 实现细节

### helper 定义(`utils/query-helpers.ts` 末尾,与 `buildDateRangeFilter` 同级)

```ts
export function buildKeywordOr<F extends string>(
  keyword: string | null | undefined,
  fields: readonly F[],
): { OR: Array<Record<F, { contains: string }>> } | undefined {
  const kw = String(keyword ?? '').trim();
  if (!kw || fields.length === 0) return undefined;
  return {
    OR: fields.map(
      (field) =>
        ({ [field]: { contains: kw } }) as Record<F, { contains: string }>,
    ),
  };
}
```

- 返回 `undefined` 表示无关键词;调用方据此决定是否写入 where。
- 不修改入参 where,只产出 OR 片段。
- `as Record<...>` 属类型收窄,非 `as any`,符合 CONSTRAINTS 类型安全规范。

### 统一替换模式

把各调用点手写的 `where.OR = [ ... ]` 改为:

```ts
const keywordOr = buildKeywordOr(<keywordExpr>, [<fields>] as const);
if (keywordOr) Object.assign(where, keywordOr);
```

各调用点的关键词表达式与字段清单(**字段顺序保持原样,行为等价**):

| 文件 | 关键词表达式 | 字段 |
| --- | --- | --- |
| inspection-record-query.service.ts | `keyword` | workOrderNumber, projectName, supplierName, inspector |
| inspection-public-query.service.ts | `params.keyword` | workOrderNumber, projectName |
| work-order.service.ts | `keyword`(原 `.trim()` 由 helper 接管) | workOrderNumber, projectName |
| supplier.service.ts | `keyword` | name, contact, email, phone |
| metrology.service.ts | `params.keyword`(原 `.trim()` 由 helper 接管) | instrumentName, instrumentCode, model, usingUnit |
| supervision-project.service.ts | `params.keyword` | projectName, projectType, workOrderNumber, supplierName |
| file-asset-query.ts | `keyword`(已 trim) | originalName, storedName, objectKey, sha256 |
| dictionary.service.ts | `keyword`(已规范化) | dictKey, dictValue |

### 单测(`utils/query-helpers.test.ts`)

覆盖 `buildKeywordOr`:

- 空串 / `null` / `undefined` / 纯空格 → 返回 `undefined`
- 空字段数组 → `undefined`
- 单字段、多字段 → OR 结构正确,且 `contains` 值已 trim
- OR 项数 == 字段数,键名与字段一致

## 兼容性

- supplier / supervision 原本未对关键词 trim,迁移后会被 trim(首尾空格不再参与匹配)。这是有意的归一化,视为等价改进,需在 commit message / CHANGELOG 点明。
- 其余调用点行为完全等价(work-order / metrology 原本就 trim,file / dictionary 调用前已处理)。
- 软删除 `isDeleted: false` 等其他 where 条件由各调用点原有逻辑保留,helper 不介入。

## 验证(CONSTRAINTS「完成定义」)

```bash
pnpm lint && pnpm run check:type && pnpm run check:qms-arch   # 提交前门禁
pnpm --dir apps/backend exec vitest run                       # 单测含新 helper 用例
```

- 抽查行为等价:对每个迁移模块带关键词调一次列表查询,结果与改造前一致 (重点确认 supplier / supervision 的 trim 变更不影响正常命中)。
- 按 CONSTRAINTS「强制 commit 节奏」:helper + 单测一个 commit,调用点替换可按模块分批 commit, 每步跑自检命令。
