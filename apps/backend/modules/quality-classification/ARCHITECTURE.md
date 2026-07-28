# Quality classification module

## Responsibility

`quality-classification` owns the two-level quality classification trees used by inspection issues and after-sales records. It is the only module allowed to create, rename, enable, disable, restore, sort, or soft-delete these identities.

Other modules consume classifications through `index.ts`. They must not query the owned tables directly or infer an identity from a display name during online writes.

## Scopes

Each category belongs to exactly one immutable scope:

| Scope                     | Business meaning         |
| ------------------------- | ------------------------ |
| `INSPECTION_ISSUE_DEFECT` | Inspection issue defect  |
| `AFTER_SALES_PRODUCT`     | After-sales product type |
| `AFTER_SALES_DEFECT`      | After-sales defect       |

The same name may exist in different scopes. A subcategory belongs to one category, and its code and name are unique within that parent.

## Data ownership

- `quality_classification_categories`: scope-level category identities.
- `quality_classification_subcategories`: child identities linked to one category.

Both tables use stable codes, display names, sort order, status, and soft deletion. Codes are immutable after creation. If a create request omits a code, the service generates one. Creating an identity that was previously soft-deleted restores its original ID and code.

Deleting a category does not delete its children. This preserves the complete tree so restoring the category restores access to its existing child identities. Active reads and write validation always require both levels to be enabled and not deleted.

## Business references

New business writes use dedicated V2 foreign keys:

- `quality_records.defectCategoryId` and `defectSubcategoryId`;
- `after_sales.productCategoryId` and `productSubcategoryId`;
- `after_sales.defectCategoryId` and `defectSubcategoryId`.

The legacy `*TypeId` and `*SubtypeId` columns remain during migration compatibility. Names remain historical display snapshots; IDs are the canonical identity and aggregation key.

## Public service boundary

- `listActiveTree(scope)` returns options for business forms.
- `assertSelection(scope, categoryId, subcategoryId)` rejects inactive, deleted, cross-scope, or mismatched parent-child selections.
- `findActiveCategoryByCode(scope, code)` supports stable semantic lookups such as the vehicle-product report category.
- `resolveCategoryNamesByIds(scope, ids)` and `resolveSubcategoryNamesByIds(scope, ids)` batch-resolve historical display names without excluding disabled or deleted identities.
- `resolveActiveSelectionByNames(scope, categoryName, subcategoryName)` is a strict import adapter. It never guesses or falls back across scopes.

Management routes require `System:QualityClassification:List` or `System:QualityClassification:Edit`. All inputs use Zod, deletion is soft, and the migration contains structure only; initial identities belong in idempotent release maintenance.
