ALTER TABLE `quality_records`
  ADD COLUMN `responsibilityType` VARCHAR(32) NULL,
  ADD INDEX `quality_records_responsibilityType_idx`(`responsibilityType`);
