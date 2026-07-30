# Part master module

## Responsibility

`part-master` owns the canonical material identity space. It is the only module allowed to create, rename, enable, disable, restore, or soft-delete `master_parts` rows.

Business modules consume material identities through `index.ts`. They must not query or mutate `master_parts` directly and must not infer a material ID from a submitted display name. Generic governance infrastructure may inspect the table for historical reconciliation, but all canonical material writes are delegated to this module.

## Identity contract

- Business relations persist `partId`; `partName` is a historical or display snapshot.
- Creating a previously soft-deleted name restores the original material ID.
- Renaming, disabling, or deleting a material does not rewrite historical business records.
- Disabled and soft-deleted materials are excluded from option search.
- `assertActive` is the write-contract guard for modules that persist a material reference.
- BOM writes resolve an active material by `partId` or exact name through this module. Exact names reuse the global identity across work orders; new names create one identity before the BOM row is committed.

## API boundaries

- Management APIs require `System:PartMaster:List` or `System:PartMaster:Edit`.
- Authenticated business clients may remotely search active materials.
- Public request entry may remotely search active materials, but it must provide a bounded keyword and receives only `id` and `name`.
- No public endpoint creates, updates, restores, or deletes materials.

The service accepts an optional Prisma transaction client for approval workflows. This keeps canonical material creation and the approving business transition atomic without transferring table ownership to the caller.
