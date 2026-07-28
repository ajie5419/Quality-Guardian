# Process master module

## Responsibility

`process-master` owns the global process identity space and inspection-request process visibility. It is the only module allowed to create, rename, enable, disable, restore, or soft-delete `processes` rows.

Other modules consume this module through `index.ts`. They must not query or mutate process tables directly and must not recreate process identities from display names.

## Data ownership

- `processes`: canonical process identities shared by inspection records, nonconformance items, ITP, inspection templates, BOM configuration, Web, and WeChat clients.
- `inspection_request_process_options`: independent visibility and order for each `category + processId` pair.

`processes.inspectionRequestCategory` is a release-compatibility column from the previous model. New online behavior does not read it. It can be removed only in a later migration after all deployed versions no longer depend on it.

## Identity contract

- Business relations persist `processId`; `processName` is only a historical or display snapshot.
- Creating a previously soft-deleted name restores the original process ID.
- Renaming, disabling, hiding, or deleting a process does not rewrite historical business records.
- The legacy `inspection_process_name` dictionary is not an editable process source.
- No API may infer a process ID from a submitted name or use a name as an aggregation key.

## Inspection-request configuration

Every process may have one option row for each supported category:

| Category   | Meaning                           |
| ---------- | --------------------------------- |
| `PROCESS`  | Process inspection request entry  |
| `INCOMING` | Incoming inspection request entry |

The two selections are independent. A process may be enabled for both categories, one category, or neither category. `work_order_requirements` never acts as a visibility list.

Saving selections is transactional. Submission uses the same `category + processId + isEnabled` rule as option loading, preventing hidden options from being submitted through a crafted request.

## Deployment and history

The Prisma migration creates only the option table and foreign key. Ordered release maintenance then adds missing option rows with `createMany + skipDuplicates` before the new application starts.

This deployment sequence is additive and preserves production history:

- existing process IDs remain unchanged;
- existing inspection requests, records, issues, templates, and ITP rows remain searchable and aggregatable;
- repeated maintenance never overwrites administrator visibility choices;
- no runtime name fallback or hard-coded process list exists.

## Public API boundaries

- Management APIs require inspection-settings access and expose CRUD plus transactional selection saving.
- `/api/qms/common/process-options` exposes active global process options to authenticated business modules.
- Public request entry exposes only enabled options for the requested inspection category.

All inputs use Zod schemas, all deletions are soft deletes, and cross-module consumers use `ProcessMasterService` through the module export.
