# QMS Refactor Change Groups

Updated: 2026-05-19

## Group 1: Dictionary Governance Foundation

Scope:

1. Shared dictionary whitelist and keys.
2. Backend dictionary service validation/cache invalidation.
3. Dictionary migration script/index constraints.
4. Dictionary governance scripts and CI gates.

Representative files:

1. `packages/qgs-shared/src/modules/qms/dictionary.ts`
2. `apps/backend/services/dictionary.service.ts`
3. `apps/backend/prisma/migrate-dictionaries.mjs`
4. `scripts/check-dictionary-governance.mjs`
5. `scripts/check-dictionary-label-fallback.mjs`
6. `.github/workflows/ci-gate.yml`

## Group 2: Audit Template Hardening

Scope:

1. `recordAuditLog` template-first support.
2. API + service audit details migration to `detailsTemplate/detailsVariables`.
3. Governance script + ESLint hard constraints.

Representative files:

1. `apps/backend/services/system-log.service.ts`
2. `apps/backend/api/qms/**` touched audit endpoints
3. `apps/backend/services/after-sales.service.ts`
4. `apps/backend/services/inspection.service.ts`
5. `apps/backend/services/quality-loss.service.ts`
6. `apps/backend/services/vehicle-commissioning.service.ts`
7. `scripts/check-audit-template-governance.mjs`
8. `internal/lint-configs/eslint-config/src/custom-config.ts`

## Group 3: Frontend Dictionary Migration

Scope:

1. Migrated QMS modules to `useDictionaryOptions`.
2. Process fallback normalization.
3. DictType literal removal using `QMS_DICTIONARY_TYPE_KEYS`.

Representative files:

1. `apps/web-antd/src/views/qms/**`
2. `apps/web-antd/src/views/qms/shared/composables/useDictionaryOptions.ts`
3. `apps/web-antd/src/views/qms/shared/constants/inspection-process-fallback.ts`

## Group 4: Dictionary Admin and Ops Closure

Scope:

1. New backend type source endpoint.
2. Dictionary admin page dynamic type loading.
3. Runbook/status docs alignment.

Representative files:

1. `apps/backend/api/system/dictionary/types.get.ts`
2. `apps/web-antd/src/api/system/dictionary.ts`
3. `apps/web-antd/src/views/system/dictionary/index.vue`
4. `apps/web-antd/src/views/system/dictionary/composables/useDictionaryTypeOptions.ts`
5. `docs/qms-dictionary-runbook.md`
6. `docs/qms-dictionary-refactor-status.md`

## Group 5: I18n Strict Parity

Scope:

1. Key parity closure across `en-US` and `zh-CN`.
2. Baseline tightened to zero diff.
3. English locale semantics normalized (no Chinese values in `en-US`).

Representative files:

1. `apps/web-antd/src/locales/langs/en-US/common.json`
2. `apps/web-antd/src/locales/langs/en-US/qms.json`
3. `scripts/i18n-key-diff-baseline.json`
4. `scripts/check-i18n-consistency.mjs`

## Release Checklist

1. `pnpm run lint`
2. `pnpm --dir apps/backend run typecheck`
3. `pnpm --dir apps/web-antd run typecheck`
4. `pnpm run check:dict-governance`
5. `pnpm run check:dict-label-fallback`
6. `pnpm run check:audit-template-governance`
7. `pnpm run check:i18n`
