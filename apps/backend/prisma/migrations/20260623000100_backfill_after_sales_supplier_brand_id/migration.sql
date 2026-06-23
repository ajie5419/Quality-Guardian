-- Step 15a: backfill after_sales.supplierBrandId from suppliers.name lookup.
-- Idempotent — only fills rows where supplierBrandId is missing and the
-- supplierBrand string matches a known suppliers.name. Rows whose
-- supplierBrand cannot be matched stay with NULL supplierBrandId and
-- will be reported by the companion script for manual reconciliation.

UPDATE `after_sales` AS `a`
JOIN `suppliers` AS `s` ON `s`.`name` = `a`.`supplierBrand`
SET `a`.`supplierBrandId` = `s`.`id`
WHERE `a`.`supplierBrandId` IS NULL
  AND `a`.`supplierBrand` IS NOT NULL
  AND `a`.`supplierBrand` <> ''
  AND `s`.`isDeleted` = 0;
