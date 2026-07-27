# TEAM identity module

## Responsibility

The `team` module owns the canonical identity lifecycle for production teams and resident supplier teams. A TEAM remains the same entity when its display name changes. Two TEAM rows remain different entities until an explicit, audited merge moves one ID into the other.

The canonical ID is `dictionaries.id` for rows whose `dictType` is `team`. `dictKey` and `dictValue` are current display values, not relationship keys.

## Owned identity records

| Record | Purpose |
| --- | --- |
| `dictionaries` with `dictType=team` | Canonical TEAM row and stable ID |
| `team_identity_name_keys` | Unique normalized collision key owned by one TEAM ID |
| `team_identity_aliases` | Canonical and historical display names for audit and discovery |
| `team_identity_sources` | Stable `DEPARTMENT`, `SUPPLIER`, or `MANUAL` source ownership |
| `team_identity_merges` | Idempotent merge audit, reference counts, operator, reason, and completion state |

`supplier_identity_links` belongs to the supplier-identity module. It maps a TEAM ID to a supplier ID but never changes which module owns either identity.

## Identity invariants

- Business rows, statistics, events, and mappings use TEAM IDs. Names are display snapshots only.
- Name keys normalize Unicode compatibility forms, case, whitespace, punctuation, and separators to detect collisions. A collision blocks online create or rename; it does not select a merge target.
- Renaming keeps the same TEAM ID, stores the previous name as a historical alias, and promotes the new canonical alias.
- Near-name groups are ambiguity signals only. Reconciliation persists them for review and never merges them automatically.
- Generic dictionary create, update, and delete endpoints reject `dictType=team`. TEAM mutations go through `TeamIdentityService`.
- Retirement is allowed only for an active, non-system TEAM with no protected supplier identity link.

## Public service boundary

Other modules import only from `~/modules/team` and use:

- `TeamIdentityService.resolveById()` for an active identity required by an online write.
- `TeamIdentityService.resolveNamesByIds()` for batched display-name hydration after an ID-based query or aggregation.
- `TeamIdentityService.listOptions()` for ID-valued selectors.
- `TeamIdentityService.create()`, `update()`, and `retire()` for system-admin management.

Internal write, alias, name-key, reference migration, and merge helpers are not public module APIs.

## Reconciliation

Release maintenance runs `reconcile-team-identities.ts --apply` after schema migration and while backend writes are stopped.

Reconciliation trusts only stable source IDs:

- active leaf department ID -> TEAM ID;
- supplier ID whose inspection policy uses TEAM identity -> TEAM ID;
- a legacy remark only when `managedBy=system:team-dictionary-bootstrap` and every source has a valid `department:<id>` or `supplier:<id>` shape.

An existing source link wins. A unique trusted legacy source claim may restore a source link. Otherwise reconciliation creates a new TEAM or persists an ambiguity audit. Exact or normalized name similarity alone never establishes identity ownership.

The deleted name bootstrap must not return. It collapsed source identities into mutable names and could neither distinguish duplicate names nor preserve rename history.

## Explicit merge

Confirmed duplicates are merged only through `merge-team-identities.ts` with `TEAM_IDENTITY_MAINTENANCE_MODE=1`, backend writes stopped, explicit source and target IDs, an operator, and a reason.

One database transaction:

1. validates both TEAM IDs and supplier-link compatibility;
2. creates an idempotent pending audit and quarantines the source;
3. migrates inspection requests, inspections, welders, work-order requirements, supplier links, aliases, name keys, and source links in bounded batches;
4. verifies that no source references remain;
5. retires the source and completes the audit with reference counts.

Any error rolls back the merge. There is no online merge API because concurrent business writes would make the reference move non-atomic at the application boundary.

## Statistics contract

TEAM statistics group by `teamId`. Current names are resolved in one batch after aggregation. Rows with a missing ID use one unresolved bucket; a non-empty invalid ID remains a separate unresolved row containing that ID. This preserves evidence without guessing or merging unrelated identities.

## Regression guards

- `B-ID6` prevents inspection-request statistics from reading TEAM, supplier, or process name snapshots as identity inputs.
- `B-ID7` requires generic dictionary mutations to invoke the TEAM guard and rejects TEAM bootstrap scripts.
- TEAM service and merge tests cover collision keys, rename history, concurrency, maintenance mode, reference migration, idempotency, and supplier-link conflicts.
