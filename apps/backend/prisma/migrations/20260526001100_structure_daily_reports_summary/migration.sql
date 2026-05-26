ALTER TABLE `daily_reports`
  ADD COLUMN `projectName` VARCHAR(191) NULL,
  ADD COLUMN `workOrderNumber` VARCHAR(191) NULL,
  ADD COLUMN `reportText` LONGTEXT NULL;

CREATE INDEX `daily_reports_projectName_idx` ON `daily_reports`(`projectName`);
CREATE INDEX `daily_reports_workOrderNumber_idx` ON `daily_reports`(`workOrderNumber`);
