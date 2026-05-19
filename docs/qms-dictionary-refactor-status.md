# QMS Dictionary Refactor Status

Updated: 2026-05-19 (All planned migration scopes completed)

## Summary

本轮已完成字典化治理主链路：

1. 后端字典服务增加类型白名单、重复键保护、数据库唯一约束和缓存失效策略。
2. 前端迁移模块统一通过 `useDictionaryOptions` 加载状态/工序字典。
3. ESLint 新规则已覆盖本轮全部迁移目录，禁止回退到旧硬编码入口。
4. 已补关键单测覆盖后端字典服务与前端映射函数。

## Implemented Scope

### Backend

- Service:
  - `apps/backend/services/dictionary.service.ts`
- API:
  - `apps/backend/api/system/dictionary/index.post.ts`
  - `apps/backend/api/system/dictionary/[id].put.ts`
- Data migration:
  - `apps/backend/prisma/migrate-dictionaries.mjs`
- Schema:
  - `apps/backend/prisma/schema.prisma`

Implemented controls:

1. `SUPPORTED_DICT_TYPES` 白名单（当前 10 类）：
   - `supplier_status`
   - `metrology_inspection_status`
   - `after_sales_status`
   - `inspection_issue_status`
   - `quality_loss_status`
   - `quality_loss_type`
   - `inspection_process_name`
   - `planning_project_status`
   - `supervision_project_status`
   - `supervision_issue_status`
2. `create/update/list/getOptions` 均执行类型校验。
3. `create/update` 增加 `dictType + dictKey + isDeleted=false` 重复键保护，冲突抛 `DUPLICATE_DICT_KEY`。
4. 数据库增加唯一约束：`@@unique([dictType, dictKey, isDeleted])`。
5. 迁移脚本在加唯一索引前先软删除重复活跃记录，确保可平滑落地。
6. 字典改动后按类型失效缓存，防止脏读。

### Frontend

Shared layer:

- `apps/web-antd/src/views/qms/shared/composables/useDictionaryOptions.ts`
- `apps/web-antd/src/views/qms/shared/constants/inspection-process-fallback.ts`

Migrated status dictionary modules:

1. `views/qms/supplier/**`
2. `views/qms/metrology/**`
3. `views/qms/after-sales/**`
4. `views/qms/inspection/issues/**`
5. `views/qms/quality-loss/**`
6. `views/qms/supervision/**`
7. `views/qms/planning/itp/**` (project status)
8. `views/qms/planning/dfmea/**` (project status)

Migrated process dictionary modules:

1. `views/qms/inspection/issues/**`
2. `views/qms/inspection/requests/**`
3. `views/qms/inspection/records/**`
4. `views/qms/planning/bom/**`
5. `views/qms/planning/inspection-forms/**`
6. `views/qms/workspace/**`
7. `views/qms/planning/itp/**` (item process step)

## ESLint Guardrails

File:

- `internal/lint-configs/eslint-config/src/custom-config.ts`

Rules added:

1. 审计日志禁止 `details: \`${...}\`` 直写，强制模板化路径。
2. 已迁移状态模块禁止导入本地 `STATUS_OPTIONS` 常量。
3. 已迁移工序模块禁止从 `inspection/records/config` 直接导入 `getProcessOptions`。
4. 本轮新增目录（supervision / planning itp / planning dfmea）已纳入强约束。

## Tests Added

Backend:

- `apps/backend/services/__tests__/dictionary.service.test.ts`
- `apps/backend/services/__tests__/dictionary-api-mapping.test.ts`

Covers:

1. unsupported dictType rejection
2. duplicate key rejection on create
3. duplicate key rejection on update
4. cache-hit path for options
5. db-query + cache-set path for options
6. cache invalidation after create
7. newly supported supervision/planning dictType acceptance
8. API layer mapping for validation/conflict/paging responses

Frontend:

1. `apps/web-antd/src/views/qms/supplier/data.test.ts`
2. `apps/web-antd/src/views/qms/inspection/records/config.test.ts`
3. `apps/web-antd/src/views/qms/after-sales/constants.test.ts`
4. `apps/web-antd/src/views/qms/inspection/issues/constants.test.ts`
5. `apps/web-antd/src/views/qms/supervision/constants.test.ts`

Covers:

- 字典映射与 fallback 行为
- 状态颜色继承
- 工序去重合并与 process-only 映射
- 监造项目/问题状态字典映射与颜色规则

## Remaining Work

本轮计划范围内剩余项：`0`。

后续仅建议做增量治理：

1. 新增业务枚举时同步走字典化流程（后端白名单 + 种子 + 前端接入 + ESLint 规则）。
2. 继续收敛 i18n 额外 key（baseline-guarded `extra`），减少跨语言冗余。

## Operational Docs

1. Runbook: `docs/qms-dictionary-runbook.md`
2. Status baseline: `docs/qms-dictionary-refactor-status.md`

## Migration Drill Record

Date: 2026-05-19

1. Root cause fixed:
   - `migrate-dictionaries.mjs --dry-run` failed when `dictionaries` table did not exist.
   - Cause: script still queried duplicate rows and seed existence before table creation in dry-run mode.
   - Fix: short-circuit dry-run path when table is absent, print planned seed list directly.
2. Dry-run result:
   - `would create dictionaries table`
   - `would add index dictionaries_dictType_idx`
   - `would add index dictionaries_dictType_status_idx`
   - `would add index dictionaries_dictType_dictKey_idx`
   - `would add unique index dictionaries_dictType_dictKey_isDeleted_uidx`
   - `would seed` entries for all 10 dictionary types.
3. Real-run result:
   - migration completed successfully.
   - dictionaries table row count: `53`
   - active duplicate groups (`dictType + dictKey + isDeleted=0`): `0`
   - unique index confirmed: `dictionaries_dictType_dictKey_isDeleted_uidx`
4. Idempotency check:
   - re-run migration: completed with no additional changes.

## Dictionary Mapping Hardening

Date: 2026-05-19

1. Unified dictionary label fallback:
   - `after-sales`, `inspection/issues`, `supplier`, `metrology` status mappers now use:
   - `label = dictValue || dictKey`
   - This prevents empty labels when dictionary values are missing.
2. Added test coverage:
   - `apps/web-antd/src/views/qms/metrology/data.test.ts` (new)
   - updated:
     - `apps/web-antd/src/views/qms/after-sales/constants.test.ts`
     - `apps/web-antd/src/views/qms/inspection/issues/constants.test.ts`
     - `apps/web-antd/src/views/qms/supplier/data.test.ts`
   - New cases assert fallback-to-`dictKey` when `dictValue` is empty.
3. Verification:
   - frontend targeted tests pass
   - `lint`, backend/frontend `typecheck`, `check:dict-governance`, `check:i18n` pass

## CI Gate Extension

Date: 2026-05-19

1. Added script:
   - `scripts/check-dictionary-label-fallback.mjs`
   - enforces dictionary mappers to use `label: item.dictValue || item.dictKey`
2. Added npm script:
   - `check:dict-label-fallback`
   - included in root `check` chain
3. Added CI job:
   - `.github/workflows/ci-gate.yml`
   - `Dictionary Label Fallback Check`
4. Current status:
   - local run: `[dict-label-fallback] PASS scanned=191`

## DictType Constantization

Date: 2026-05-19

1. Added shared dictType keys:
   - `packages/qgs-shared/src/modules/qms/dictionary.ts`
   - `QMS_DICTIONARY_TYPE_KEYS` (typed with `QmsDictionaryType`)
2. Migrated dictType usage in already-migrated QMS modules:
   - replaced inline literals (`dictType: 'xxx'`) with
   - `dictType: QMS_DICTIONARY_TYPE_KEYS.xxx`
3. Extended governance checks:
   - `scripts/check-dictionary-governance.mjs`
   - now parses both literal and `QMS_DICTIONARY_TYPE_KEYS.*` usage
   - added guard to reject inline `mapOptions` implementations that bypass `mapDictionaryOptions*` helpers
4. ESLint hard constraint:
   - `internal/lint-configs/eslint-config/src/custom-config.ts`
   - in migrated directories, `dictType` literal property is forbidden
5. Verification:
   - `lint` pass
   - `apps/web-antd typecheck` pass
   - `apps/backend typecheck` pass
   - `check:dict-governance` pass
   - `check:dict-label-fallback` pass

## Mapper Simplification

Date: 2026-05-19

1. Simplified page-level `mapOptions` calls:
   - removed `options && options.length > 0 ? ... : fallbackOptions` branching
   - now delegates fallback handling to `mapDictionaryOptions*` helpers directly
2. Metrology edit modal:
   - removed local inline mapper
   - now reuses `mapDictionaryOptionsToMetrologyStatus`
3. Governance hardening:
   - `check-dictionary-governance.mjs` now fails if page code branches on dictionary length in `mapOptions`
4. Verification:
   - `check:dict-governance` pass
   - `check:dict-label-fallback` pass
   - `lint` pass
   - `apps/web-antd typecheck` pass

## Inspection Process Fallback Normalization

Date: 2026-05-19

1. Root cause:
   - Multiple QMS pages cloned process fallback options inline with
   - `INSPECTION_PROCESS_FALLBACK_OPTIONS.map((item) => ({ ...item }))`
   - This duplicated clone logic and made future fallback policy updates easy to miss.
2. Refactor:
   - Added shared helper:
   - `cloneInspectionProcessFallbackOptions()`
   - in `apps/web-antd/src/views/qms/shared/constants/inspection-process-fallback.ts`
   - Replaced all page-level inline clone usage with the shared helper in:
     - `inspection/issues` (schema + search form + page)
     - `inspection/records` (form schema + form page)
     - `inspection/requests` (entry page + composable)
     - `planning/itp` (item modal)
     - `planning/bom` (edit modal)
     - `workspace` (aggregate drawer)
3. Governance outcome:
   - `rg "INSPECTION_PROCESS_FALLBACK_OPTIONS"` now only matches the shared constant module itself.
4. Verification:
   - `pnpm run lint` pass
   - `pnpm --dir apps/web-antd run typecheck` pass
   - `pnpm --dir apps/backend run typecheck` pass
   - `pnpm run check:dict-governance` pass
   - `pnpm run check:dict-label-fallback` pass
   - `pnpm run check:i18n` pass (baseline-guarded warnings only)
   - `pnpm --dir apps/web-antd exec vitest run src/views/qms/inspection/records/config.test.ts src/views/qms/inspection/issues/constants.test.ts` pass

## Audit Template Review

本轮已全量复查 `apps/backend/**` 审计日志写法：

1. 未发现新增 `details: \`${...}\`` 直写违规点。
2. 现有实现均走 `detailsTemplate + detailsVariables` 或 `renderAuditTemplateText`。
3. ESLint 规则仍保持阻断状态，后续新增违规可在 CI 直接拦截。

## Audit Template Governance Hardening

Date: 2026-05-19

1. Root cause:
   - 部分接口仍采用 `details: renderAuditTemplateText(...)`，虽然文本正确，但未保留模板结构，难以做后续合规模板治理。
2. Service-level fix:
   - `SystemLogService.recordAuditLog` 已支持：
   - `detailsTemplate` + `detailsVariables`
   - 并在 service 内统一渲染 `details`。
3. API migration:
   - 以下接口已从 `details` 字符串迁移到结构化模板参数：
     - `apps/backend/api/qms/after-sales/[id].put.ts`
     - `apps/backend/api/qms/after-sales/index.post.ts`
     - `apps/backend/api/qms/inspection/issues/[id].put.ts`
     - `apps/backend/api/qms/inspection/issues/index.post.ts`
     - `apps/backend/api/qms/quality-loss/[id].put.ts`
     - `apps/backend/api/qms/quality-loss/index.post.ts`
     - `apps/backend/api/qms/inspection/requests/[id]/close.post.ts`
4. Governance gate:
   - 新增 `scripts/check-audit-template-governance.mjs`
   - 检查 `apps/backend/api/**` 与 `apps/backend/services/**` 中：
     - `SystemLogService.recordAuditLog(...)`
     - `recordBusinessAuditLog(...)`
   - 禁止仅传 `details` 而不传 `detailsTemplate`。
   - 新增 npm script：`check:audit-template-governance`
   - 已接入根 `check` 链路。
5. Verification:
   - `pnpm run lint` pass
   - `pnpm --dir apps/backend run typecheck` pass
   - `pnpm --dir apps/web-antd run typecheck` pass
   - `pnpm run check:dict-governance` pass
   - `pnpm run check:dict-label-fallback` pass
   - `pnpm run check:audit-template-governance` pass
   - `pnpm run check:i18n` pass (baseline-guarded warnings only)

## Audit Template Full-Coverage Closure (Services)

Date: 2026-05-19

1. Extended migration scope:
   - 完成 service 层审计调用从 `details` 迁移到模板化参数：
     - `apps/backend/services/after-sales.service.ts`
     - `apps/backend/services/inspection.service.ts`
     - `apps/backend/services/quality-loss.service.ts`
     - `apps/backend/services/vehicle-commissioning.service.ts`
2. Template source normalization:
   - service 层统一改为使用 `AUDIT_TEMPLATES.*` + `detailsVariables`，避免再次出现 `renderAuditTemplate(...)` 后再回填字符串。
3. Governance extension:
   - `check-audit-template-governance` 扫描范围从 `apps/backend/api/**` 扩展到 `apps/backend/services/**`。
   - 当前扫描量：`312` 文件。
4. Verification:
   - `pnpm run lint` pass
   - `pnpm --dir apps/backend run typecheck` pass
   - `pnpm --dir apps/web-antd run typecheck` pass
   - `pnpm run check:dict-governance` pass
   - `pnpm run check:dict-label-fallback` pass
   - `pnpm run check:audit-template-governance` pass
   - `pnpm run check:i18n` pass (baseline-guarded warnings only)

## I18n & CI Hardening Increment

Date: 2026-05-19

1. i18n parity fix:
   - 补齐 `zh-CN/qms.json` 缺失 key：
     - `supplier.code`
     - `supplier.stats`
   - baseline 更新：
     - `scripts/i18n-key-diff-baseline.json`
     - `qms.json::zh-CN.missingCount` 从 `2` 收敛到 `0`。
2. CI gate extension:
   - `.github/workflows/ci-gate.yml` 新增独立 job：
     - `Audit Template Governance Check`
     - 执行 `pnpm run check:audit-template-governance`
3. Verification:
   - `pnpm run check:i18n` pass
   - `pnpm run lint` pass
   - `pnpm --dir apps/backend run typecheck` pass
   - `pnpm --dir apps/web-antd run typecheck` pass
   - `pnpm run check:dict-governance` pass
   - `pnpm run check:dict-label-fallback` pass
   - `pnpm run check:audit-template-governance` pass

## ESLint Hard Constraint Extension

Date: 2026-05-19

1. Added lint hard constraints:
   - `internal/lint-configs/eslint-config/src/custom-config.ts`
   - 在 `apps/backend/api/**` 与 `apps/backend/services/**` 中新增 `no-restricted-syntax` 规则：
     - 禁止 `recordAuditLog({... details: ...})`
     - 禁止 `recordBusinessAuditLog({... details: ...})`
   - 强制改用 `detailsTemplate + detailsVariables`。
2. Rationale:
   - 脚本门禁可防 CI 回退，但 ESLint 约束可以在开发时即时阻断，降低回退成本。
3. Verification:
   - `pnpm run lint` pass
   - `pnpm --dir apps/backend run typecheck` pass
   - `pnpm --dir apps/web-antd run typecheck` pass
   - `pnpm run check:dict-governance` pass
   - `pnpm run check:dict-label-fallback` pass
   - `pnpm run check:audit-template-governance` pass
   - `pnpm run check:i18n` pass

## Dictionary Admin Dynamic Type Source

Date: 2026-05-19

1. Root cause:
   - 字典管理页 `dictType` 下拉仍依赖前端静态常量，存在与后端白名单漂移风险。
2. Backend change:
   - 新增接口：
     - `apps/backend/api/system/dictionary/types.get.ts`
   - 新增服务方法：
     - `DictionaryService.getSupportedTypes()`
   - 返回后端白名单类型列表，前端无需手工维护类型集合。
3. Frontend change:
   - API 增加 `getDictionaryTypes()`：
     - `apps/web-antd/src/api/system/dictionary.ts`
   - 字典管理页改为启动时动态加载类型：
     - `apps/web-antd/src/views/system/dictionary/index.vue`
   - 仍保留 `QMS_DICTIONARY_TYPE_OPTIONS` 作为兜底，避免接口异常时页面不可用。
4. Test coverage:
   - `apps/backend/services/__tests__/dictionary-api-mapping.test.ts`
   - 新增 `types.get` 成功映射用例。
5. Verification:
   - `pnpm --dir apps/backend exec vitest run services/__tests__/dictionary-api-mapping.test.ts` pass
   - `pnpm run lint` pass
   - `pnpm --dir apps/backend run typecheck` pass
   - `pnpm --dir apps/web-antd run typecheck` pass
   - `pnpm run check:dict-governance` pass
   - `pnpm run check:dict-label-fallback` pass
   - `pnpm run check:audit-template-governance` pass
   - `pnpm run check:i18n` pass

## Runbook Operational Closure

Date: 2026-05-19

1. Updated runbook:
   - `docs/qms-dictionary-runbook.md`
   - 新增并校准内容：
     - source-of-truth 定义（shared whitelist / backend validation / frontend runtime）
     - `/system/dictionary/types` API operational usage
     - post-deploy runtime checks
     - CI gate 更新（含 `check:dict-label-fallback` 与 `check:audit-template-governance`）
     - rollback 后一致性复检步骤
2. Status doc cleanup:
   - 移除过期 TODO（“后续可补 types 接口”），改为已完成状态。
3. Verification:
   - `pnpm run lint` pass
   - `pnpm run check:dict-governance` pass
   - `pnpm run check:dict-label-fallback` pass
   - `pnpm run check:audit-template-governance` pass
   - `pnpm run check:i18n` pass
   - `pnpm --dir apps/backend run typecheck` pass
   - `pnpm --dir apps/web-antd run typecheck` pass

## I18n Key Parity Closure

Date: 2026-05-19

1. Root cause:
   - `en-US` 相比 `zh-CN` 存在大量缺失 key，`check:i18n` 依赖 baseline 警告兜底。
2. Fix:
   - 同步补齐 `en-US/common.json` 与 `en-US/qms.json` 的缺失 key（结构对齐到 `zh-CN`）。
   - 收紧 baseline：
     - `scripts/i18n-key-diff-baseline.json`
     - `common.json::zh-CN.extraCount` 从 `24` 收敛到 `0`
     - `qms.json::zh-CN.extraCount` 从 `508` 收敛到 `0`
3. Outcome:
   - `check:i18n` 从 baseline-guarded WARN 变为严格 `PASS key parity checks`。
4. Verification:
   - `pnpm run check:i18n` pass
   - `pnpm run lint` pass
   - `pnpm --dir apps/backend run typecheck` pass
   - `pnpm --dir apps/web-antd run typecheck` pass
   - `pnpm run check:dict-governance` pass
   - `pnpm run check:dict-label-fallback` pass
   - `pnpm run check:audit-template-governance` pass

## Final Closure (All Planned Work Completed)

Date: 2026-05-19

Completed plan items:

1. i18n semantic hardening:
   - `en-US` locale values normalized; `check:i18n` now strict pass.
2. Dictionary admin test coverage:
   - frontend composable tests for dynamic type loading and fallback.
   - backend API mapping tests for `types.get` success/unauthorized/error paths.
3. Governance strictness:
   - i18n checker no longer relies on baseline guard behavior.
4. Change grouping for review/release:
   - `docs/qms-refactor-change-groups.md` added.

Verification snapshot:

1. `pnpm run lint` pass
2. `pnpm --dir apps/backend run typecheck` pass
3. `pnpm --dir apps/web-antd run typecheck` pass
4. `pnpm run check:dict-governance` pass
5. `pnpm run check:dict-label-fallback` pass
6. `pnpm run check:audit-template-governance` pass
7. `pnpm run check:i18n` pass (`PASS key parity checks`)
8. `pnpm --dir apps/backend exec vitest run services/__tests__/dictionary-api-mapping.test.ts` pass
9. `pnpm --dir apps/web-antd exec vitest run src/views/system/dictionary/composables/useDictionaryTypeOptions.test.ts` pass
