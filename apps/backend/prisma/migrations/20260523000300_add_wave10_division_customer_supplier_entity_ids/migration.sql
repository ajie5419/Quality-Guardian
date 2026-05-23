ALTER TABLE `work_orders`
  ADD COLUMN `divisionId` VARCHAR(191) NULL,
  ADD COLUMN `customerNameId` VARCHAR(191) NULL;

CREATE INDEX `work_orders_divisionId_idx`
  ON `work_orders` (`divisionId`);

CREATE INDEX `work_orders_customerNameId_idx`
  ON `work_orders` (`customerNameId`);

ALTER TABLE `quality_records`
  ADD COLUMN `divisionId` VARCHAR(191) NULL;

CREATE INDEX `quality_records_divisionId_idx`
  ON `quality_records` (`divisionId`);

ALTER TABLE `after_sales`
  ADD COLUMN `divisionId` VARCHAR(191) NULL,
  ADD COLUMN `customerNameId` VARCHAR(191) NULL;

CREATE INDEX `after_sales_divisionId_idx`
  ON `after_sales` (`divisionId`);

CREATE INDEX `after_sales_customerNameId_idx`
  ON `after_sales` (`customerNameId`);

ALTER TABLE `quality_plans`
  ADD COLUMN `customerId` VARCHAR(191) NULL;

CREATE INDEX `quality_plans_customerId_idx`
  ON `quality_plans` (`customerId`);

ALTER TABLE `suppliers`
  ADD COLUMN `nameId` VARCHAR(191) NULL;

CREATE INDEX `suppliers_nameId_idx`
  ON `suppliers` (`nameId`);
