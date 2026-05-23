ALTER TABLE `after_sales`
  ADD COLUMN `supplierBrandId` VARCHAR(191) NULL;

CREATE INDEX `after_sales_supplierBrandId_idx`
  ON `after_sales` (`supplierBrandId`);

ALTER TABLE `metrology_borrow_records`
  ADD COLUMN `borrowerNameId` VARCHAR(191) NULL;

CREATE INDEX `metrology_borrow_records_borrowerNameId_idx`
  ON `metrology_borrow_records` (`borrowerNameId`);
