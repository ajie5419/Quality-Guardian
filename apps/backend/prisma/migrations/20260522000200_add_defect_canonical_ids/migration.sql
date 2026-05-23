ALTER TABLE `quality_records`
  ADD COLUMN `defectTypeId` VARCHAR(191) NULL,
  ADD COLUMN `defectSubtypeId` VARCHAR(191) NULL,
  ADD INDEX `quality_records_defectTypeId_idx`(`defectTypeId`),
  ADD INDEX `quality_records_defectSubtypeId_idx`(`defectSubtypeId`);

ALTER TABLE `after_sales`
  ADD COLUMN `defectTypeId` VARCHAR(191) NULL,
  ADD COLUMN `defectSubtypeId` VARCHAR(191) NULL,
  ADD INDEX `after_sales_defectTypeId_idx`(`defectTypeId`),
  ADD INDEX `after_sales_defectSubtypeId_idx`(`defectSubtypeId`);
