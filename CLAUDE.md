# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Session startup

Before any non-trivial change, read in this order:

1. `CONSTRAINTS.md` — hard rules; violation blocks merge
2. `code_map.md` — business module map (backend modules / API routes / frontend views); use it to locate which module owns a domain
3. `PROGRESS.md` — current state, baseline file counts (used for anomaly detection)
4. `apps/backend/modules/<name>/ARCHITECTURE.md` if touching that module

**Keep `code_map.md` in sync.** When adding a new business module (`apps/backend/modules/<name>/`), a new top-level API route directory (`apps/backend/api/<name>/` or `apps/backend/api/qms/<name>/`), or a new frontend view directory (`apps/web-antd/src/views/<name>/` or `views/qms/<name>/`), update `code_map.md` in the same commit. Internal file additions inside an existing module do not require updates. See the "维护规则" section at the bottom of `code_map.md` for the full rule.

After any stage of work, append to `CHANGELOG.md` (what changed, verification result, commit hash, leftovers). This is part of the execution flow, not optional documentation.

Code, comments, and commit messages are in English. Prose docs and conversation are Chinese.

## Stack and layout

Monorepo (pnpm + turbo). Two apps, one shared package:

- `apps/backend` — Nitro (H3) + Prisma 6.2 + MySQL 8, file-based routes
- `apps/web-antd` — Vue 3.5 + Ant Design Vue 4 + Vite 6
- `packages/qgs-shared` — shared types/enums/pure domain functions

Path aliases:

- `~` → `apps/backend` (used in backend imports and vitest)
- `#` → `apps/web-antd/src`

Node `>=20.10`, pnpm `10.12.4`. **Only pnpm** — `npm`/`yarn` are blocked by `preinstall`.

## Common commands

Root-level (turbo orchestrates apps):

```bash
pnpm dev                 # all apps
pnpm dev:antd            # backend + web-antd only
pnpm build               # all apps (NODE_OPTIONS=--max-old-space-size=8192)
pnpm lint                # full lint (vsh)
pnpm check:type          # turbo run typecheck (tsc/vue-tsc per app)
pnpm check:qms-arch      # architecture guardrail (see below)
pnpm check               # circular + dep + type + qms-arch (full pre-merge gate)
pnpm test:unit           # vitest run (DOM)
```

Backend-specific (run from repo root):

```bash
pnpm --dir apps/backend dev                              # nitro dev on PORT=5320
pnpm --dir apps/backend exec tsc --noEmit                # backend typecheck
pnpm --dir apps/backend exec vitest run                  # all backend tests
pnpm --dir apps/backend exec vitest run path/to.test.ts  # single file
pnpm --dir apps/backend exec vitest --watch              # watch mode
pnpm --dir apps/backend exec prisma migrate deploy       # apply migrations
pnpm --dir apps/backend exec prisma migrate dev --name <desc>
pnpm --dir apps/backend exec prisma generate
```

**Quality gates:** Before committing, run `pnpm lint && pnpm run check:type && pnpm run check:qms-arch`. Lefthook automatically fixes and re-stages matching files in `pre-commit`; `pre-push` runs typecheck and the changed-file QMS architecture check; CI runs the full lint, typecheck, architecture, test, migration, and secret-scan gates. Commitlint enforces the commit message format.

## Backend architecture (the part that takes reading multiple files to understand)

Three layers, strict separation enforced by `scripts/check-qms-architecture.sh`:

```
api/        thin handlers (auth + parse + call service); ≤50 lines/file; never imports prisma
modules/    all business logic; one directory per domain; ≤500 lines/file
utils/      generic infrastructure only (prisma, logger, response, jwt, redis, …)
```

A route handler is a fixed shape: `verifyAccessToken` → parse/validate body via zod → call `modules/<x>/<x>.service` → return `useResponseSuccess(...)` (or `usePageResponseSuccess`/`useListResponseSuccess`). Errors go through `try/catch` with `logApiError`. See `docs/api-conventions.md` for the template.

Modules are self-contained. Each module exports through its own `index.ts`; **other modules must not import internal files** (`modules/A/foo.ts` from `modules/B/`). Cross-module data access goes through the other module's service. The architecture check enforces this.

Each module declares itself via `<module>.module.ts` (menus, dataScope, audit actions, idResolution) and is registered in `apps/backend/utils/module-loader.ts` (`MODULE_DECLARATIONS` array). Adding a new module without registering it there means the framework-level features (menu generation, data scope, audit) won't see it.

Cross-cutting concerns are framework-handled, not service-handled:

- **Auth** — `middleware/3.auth.ts` verifies the access token for everything except a small public-path allowlist (`/api/auth/login`, `/api/qms/public/`, `/api/uploads/`, etc). Sets `event.context.user` and `event.context.userId`.
- **Data scope** — `middleware/4.data-scope.ts` resolves per-user scope and sets `event.context.dataScope` for paths under `QMS_MODULE_PREFIXES` (currently `after-sales`, `inspection`, `supplier`, `work-order`). Adding a new scoped module means extending that list — otherwise enforce ownership manually in the service.
- **Audit / id resolution** — declared in `<module>.module.ts`, applied by the framework.

Response shape is fixed (`{ code, data, error, message }`); only use the helpers in `utils/response.ts`. Do not return raw objects.

## Critical rules (from CONSTRAINTS.md — see that file for the full list)

- **Errors**: throw `new BusinessError(code, message, httpStatus)` (`utils/business-error.ts`). Do not throw `new Error('VALIDATION:...')` or other prefixed string errors — the legacy converter exists only for transition.
- **Concurrency**: any "findFirst → check status → write" sequence must do the status check _inside_ `$transaction`, or use `updateMany({ where: { id, status: ... } })` and check `count`. Check-then-write across transaction boundaries is a race and is rejected in review.
- **Ownership for delete/put**: when not covered by the data-scope middleware list, the service entry must verify `createdBy`/`orgId` against the current user.
- **Soft delete**: every query on a softdeletable table includes `where: { isDeleted: false }`.
- **IDs**: cuid only (`@paralleldrive/cuid2` or Prisma `@default(cuid())`); `Date.now()` for IDs is blocked.
- **Type safety**: no `as any`, no `!` non-null assertions, no `as unknown as T` outside test files. `as const` is fine.
- **Logging**: use `createModuleLogger`. `console.log/warn/error` are blocked by the arch check.
- **Silent catch**: `catch {}` and `catch (e) {}` are forbidden — at minimum log via `logger.error(error, 'context')` before deciding to rethrow.
- **Raw SQL**: parameterized only; `$queryRawUnsafe` + template strings is blocked.

## Tests

Vitest 3.2.4. Test files live next to the code (`foo.service.ts` + `foo.service.test.ts`); a centralized `__tests__/` directory is forbidden by the arch check. Mock `~/utils/prisma`, never hit a real DB. `as any` is allowed in test files for mocks. See `docs/testing.md` for the standard mocking template.

## Database

Prisma is the single source of truth (`apps/backend/prisma/schema.prisma`). Schema changes go through `prisma migrate dev` only — never hand-edit migration SQL or the DB. Migration name format: `YYYYMMDDHHMMSS_short_english_desc`. Migrations must not contain business-data writes (use a separate script). Tables include the standard `id`/`createdAt`/`updatedAt`/`isDeleted`/`createdBy` fields. Each table comment-tags its owning module: `// @module <name>`.

## Production constraints to keep in mind

App server is 2-core / 4 GB. Do not load full tables into memory and paginate in JS — paginate at the DB layer (`skip`/`take`), aggregate via `groupBy`/`aggregate`. Page size cap is 100. File storage is Aliyun OSS in production; absent OSS env vars, files fall back to local `uploads/` and are lost on restart.

## Architecture guardrail script

`scripts/check-qms-architecture.sh` (run via `pnpm check:qms-arch`) enforces the rules above on changed files (`--changed`, default) or the whole tree (`--all`). It blocks: legacy directories (`services/`, `core/module-registry/`, `core/master-data/`); api files importing prisma or exceeding 50 lines; modules files exceeding 500 lines; `(prisma.x as any)`; `execSync`; `Date.now()` for IDs; `console.*`; `as any`/`!` outside tests; cross-module non-`index.ts` imports; Chinese string literals as conditional branches; `$queryRawUnsafe` + template strings. A baseline file (`scripts/qms-architecture-baseline.txt`) suppresses pre-existing hits — new violations still fail.

## When in doubt

Read the actual file before claiming behavior. The code, prisma schema, and `<module>.module.ts` files are authoritative; `PROGRESS.md` baselines are anomaly thresholds, not feature inventories.
