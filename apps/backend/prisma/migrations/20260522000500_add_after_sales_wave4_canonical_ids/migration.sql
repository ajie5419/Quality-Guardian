ALTER TABLE `after_sales`
  ADD COLUMN `productTypeId` VARCHAR(191) NULL,
  ADD COLUMN `productSubtypeId` VARCHAR(191) NULL,
  ADD COLUMN `failureTypeId` VARCHAR(191) NULL,
  ADD COLUMN `failureCauseId` VARCHAR(191) NULL;

CREATE INDEX `after_sales_productTypeId_idx` ON `after_sales`(`productTypeId`);
CREATE INDEX `after_sales_productSubtypeId_idx` ON `after_sales`(`productSubtypeId`);
CREATE INDEX `after_sales_failureTypeId_idx` ON `after_sales`(`failureTypeId`);
CREATE INDEX `after_sales_failureCauseId_idx` ON `after_sales`(`failureCauseId`);
