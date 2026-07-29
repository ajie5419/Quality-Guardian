ALTER TABLE `inspections`
  ADD COLUMN `partName` VARCHAR(191) NULL,
  ADD COLUMN `partId` VARCHAR(191) NULL;

CREATE INDEX `inspections_partId_idx`
  ON `inspections`(`partId`);
