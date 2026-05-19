# QMS Dictionary Runbook

Updated: 2026-05-19

## Scope

This runbook defines the operational steps for adding or changing QMS dictionary types and dictionary values across backend, frontend, and migration pipelines.

## Source of Truth

1. Shared whitelist:
   - `packages/qgs-shared/src/modules/qms/dictionary.ts`
   - `QMS_DICTIONARY_TYPES`
2. Backend validation:
   - `apps/backend/services/dictionary.service.ts`
   - `SUPPORTED_DICT_TYPES` must be derived from shared whitelist only.
3. Frontend runtime usage:
   - QMS pages use `useDictionaryOptions`.
   - System dictionary admin page loads types from:
   - `GET /system/dictionary/types`

## Preconditions

1. Repository is up to date.
2. Database backup exists before production migration.
3. CI checks are green in the source branch.
4. Redis is reachable in production (dictionary options cache uses Redis with local fallback tolerance).

## Supported API Surface

1. `GET /system/dictionary/types`
   - Return allowed dictionary types for admin UI and integration checks.
2. `GET /system/dictionary/list`
   - Paged dictionary entries.
3. `GET /system/dictionary/options?dictType=...`
   - Enabled dictionary options for business modules.
4. `POST /system/dictionary`
5. `PUT /system/dictionary/:id`
6. `DELETE /system/dictionary/:id`

## Add New Dictionary Type

1. Update shared whitelist:
   - Edit `packages/qgs-shared/src/modules/qms/dictionary.ts`.
   - Add value in `QMS_DICTIONARY_TYPES`.
   - Add label in `QMS_DICTIONARY_TYPE_LABELS`.
   - Add key in `QMS_DICTIONARY_TYPE_KEYS` if frontend modules will consume it.
2. Add migration seed:
   - Update `apps/backend/prisma/migrate-dictionaries.mjs` `DEFAULT_DICTIONARIES`.
3. Wire frontend usage:
   - Use `useDictionaryOptions` with `QMS_DICTIONARY_TYPE_KEYS.<key>`.
   - Route mapping through `mapDictionaryOptions*` helper; keep fallback behavior stable.
4. Add tests:
   - Backend: `apps/backend/services/__tests__/dictionary.service.test.ts`.
   - API mapping: `apps/backend/services/__tests__/dictionary-api-mapping.test.ts`.
   - Frontend: mapper/fallback tests in touched modules.
5. Run governance checks (see CI Gates section).

## Add or Modify Dictionary Values (Operational)

1. Preferred path:
   - Use system dictionary admin page (`/system/dictionary`) or system API.
2. Validation rules:
   - `dictType` must be in whitelist.
   - `dictKey` is unique under active records (`dictType + dictKey + isDeleted=0`).
   - `dictValue` cannot be empty.
3. Cache behavior:
   - On create/update/delete, Redis key `qms:dict:options:<dictType>` is invalidated automatically.

## Migration Execution

1. Dry run:
   - `pnpm --dir apps/backend exec node prisma/migrate-dictionaries.mjs --dry-run`
2. Real run:
   - `pnpm --dir apps/backend exec node prisma/migrate-dictionaries.mjs`
3. Validate:
   - Confirm unique index exists:
     - `dictionaries_dictType_dictKey_isDeleted_uidx`
   - Confirm no active duplicate (`dictType + dictKey + isDeleted=0`).
4. Idempotency:
   - Re-run migration once and confirm no additional data/index changes.

## Duplicate Handling Rule

When duplicate active keys exist, migration keeps the latest record by:

1. `updatedAt` DESC
2. `createdAt` DESC
3. `id` DESC

All older duplicates are soft-deleted (`isDeleted=1`, `updatedBy=system`).

## Rollback

1. Data rollback:
   - Restore database from backup if business data is impacted.
2. Code rollback:
   - Revert dictionary-related commits and redeploy.
3. Cache recovery:
   - Trigger dictionary cache invalidation by updating affected dictionary values via API, or flush redis keys under `qms:dict:options:*`.
4. Consistency re-check:
   - Re-run `check:dict-governance` and `check:audit-template-governance` after rollback deploy.

## CI Gates

Must pass:

1. `pnpm run lint`
2. `pnpm run check:type`
3. `pnpm run check:i18n`
4. `pnpm run check:dict-governance`
5. `pnpm run check:dict-label-fallback`
6. `pnpm run check:audit-template-governance`
7. Relevant unit tests

Current expected i18n result:

1. `pnpm run check:i18n` must print:
   - `PASS namespace/json checks`
   - `PASS key parity checks`
2. Any i18n baseline regression is treated as release blocker.

## Runtime Checks (Post-Deploy)

1. API checks:
   - `GET /system/dictionary/types` returns expected whitelist set.
   - `GET /system/dictionary/options?dictType=<type>` returns non-empty values for seeded types.
2. Cache checks:
   - Update a dictionary value, then fetch options and confirm latest value is returned.
3. UI checks:
   - Dictionary admin type dropdown shows backend-driven types.
   - QMS module status/process dropdowns still render labels with fallback.

## Troubleshooting

1. `VALIDATION:不支持的字典类型`
   - `dictType` not in shared whitelist.
2. `DUPLICATE_DICT_KEY`
   - Active key already exists for the same `dictType`.
3. Migration DB connection failure
   - Check `DATABASE_URL`, DB availability, network ACL.
4. Dictionary admin dropdown missing a type
   - Check `/system/dictionary/types` response first.
   - Verify shared whitelist and backend deployment version are aligned.
5. Stale dictionary options after update
   - Verify Redis invalidation permissions.
   - Manually delete `qms:dict:options:<dictType>` and retry.

## Related Docs

1. `docs/qms-dictionary-refactor-status.md`
2. `docs/quality-guardian-api.md`
