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
- Name keys normalize Unicode compatibility forms, case, whitespace, punctuation, and separators to detect collisions. Active aliases are unique by `teamId + nameKey`; a collision blocks online create or rename and never selects a merge target.
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

An existing source link wins. A unique trusted legacy source claim may restore a source link. Otherwise reconciliation creates a new TEAM or persists an ambiguity audit. Exact or normalized name similarity alone never establishes identity ownership. A retired TEAM with the same normalized name and an existing historical name-key owner are ambiguity evidence, so reconciliation records them instead of attempting a conflicting create.

The deleted name bootstrap must not return. It collapsed source identities into mutable names and could neither distinguish duplicate names nor preserve rename history.

## Explicit merge

Confirmed duplicates are merged only through `merge-team-identities.ts` with `TEAM_IDENTITY_MAINTENANCE_MODE=1`, backend writes stopped, explicit source and target IDs, an operator, and a reason.

The maintenance runner uses a durable, resumable state machine:

1. validates both TEAM IDs and supplier-link compatibility, claims unique participant locks, and quarantines the source in one transaction;
2. claims a `RUNNING` execution lease with an attempt token, allowing an expired or failed attempt to be resumed without allowing an older attempt to overwrite newer state;
3. migrates canonical IDs for inspection requests, inspections, welders, and work-order requirements without rewriting their name snapshots, then migrates supplier links, aliases, name keys, and source links in independently committed groups;
4. stores cumulative reference counts in the same transaction as each group, so retries count previously committed and newly migrated rows exactly once;
5. verifies that no source references remain, retires the source, completes the audit, and releases participant locks in one transaction.

Each reference batch uses a compare-and-set predicate and aborts when its applied row count differs from the scanned row count. Supplier-link migration classifies active and soft-deleted source/target states and re-reads after a unique-key race. There is no online merge API because merge execution still requires maintenance mode with application writes stopped.

TEAM option reads bypass Redis, so TEAM mutations do not depend on distributed cache invalidation for correctness. Generic dictionary options retain their existing cache behavior for non-TEAM dictionary types.

Record-only merges (`migrateReferences=false`) register the canonical mapping and retire the source without rewriting any business row. Historical rows keep their original IDs; read paths resolve them through the completed merge mapping (`TeamIdentityService.resolveCanonicalIds`) before aggregation and name hydration, so statistics merge duplicates without touching history. Release maintenance runs `merge-confirmed-team-duplicates.ts --apply`, which plans record-only merges only when a canonical is supported by an exact active department leaf name, a live source link, or an explicit business-confirmed rule; groups without evidence remain ambiguity audits for the manual disposition queue.

## Statistics contract

TEAM statistics group by `teamId`. Current names are resolved in one batch after aggregation. Rows with a missing ID use one unresolved bucket; a non-empty invalid ID remains a separate unresolved row containing that ID. This preserves evidence without guessing or merging unrelated identities.

IDs registered as sources in a completed merge resolve to their canonical team before grouping; the merge mapping never rewrites historical rows.

## Regression guards

- `B-ID6` prevents inspection-request statistics from reading TEAM, supplier, or process name snapshots as identity inputs.
- `B-ID7` requires generic dictionary mutations to invoke the TEAM guard and rejects TEAM bootstrap scripts.
- TEAM service and merge tests cover collision keys, rename history, concurrency, maintenance mode, reference migration, idempotency, and supplier-link conflicts.
