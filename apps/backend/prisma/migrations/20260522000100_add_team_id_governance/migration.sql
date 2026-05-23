ALTER TABLE `inspections`
  ADD COLUMN `teamId` VARCHAR(191) NULL,
  ADD INDEX `inspections_teamId_idx`(`teamId`);

ALTER TABLE `qms_inspection_requests`
  ADD COLUMN `teamId` VARCHAR(191) NULL,
  ADD INDEX `qms_inspection_requests_teamId_idx`(`teamId`);

ALTER TABLE `welders`
  ADD COLUMN `teamId` VARCHAR(191) NULL,
  ADD INDEX `welders_teamId_idx`(`teamId`);
