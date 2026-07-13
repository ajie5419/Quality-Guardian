-- Reconcile legacy supplierBrandId values with the suppliers table.
-- Earlier governance metadata could write IDs from the supplier_brand
-- dictionary even though this column is the canonical suppliers.id link.
UPDATE `after_sales` AS `a`
JOIN `suppliers` AS `s`
  ON `s`.`name` = `a`.`supplierBrand`
  AND `s`.`isDeleted` = 0
SET `a`.`supplierBrandId` = `s`.`id`
WHERE `a`.`supplierBrand` IS NOT NULL
  AND `a`.`supplierBrand` <> ''
  AND (
    `a`.`supplierBrandId` IS NULL
    OR `a`.`supplierBrandId` <> `s`.`id`
  );
