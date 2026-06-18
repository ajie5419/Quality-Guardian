-- Add createdBy ownership column to loss-bearing tables
-- Phase 1 Step 1 — required for quality-loss data-scope and PUT ownership guard

ALTER TABLE `after_sales` ADD COLUMN `createdBy` VARCHAR(64) NULL;
ALTER TABLE `quality_records` ADD COLUMN `createdBy` VARCHAR(64) NULL;
ALTER TABLE `quality_losses` ADD COLUMN `createdBy` VARCHAR(64) NULL;

-- Backfill historical rows so SELF/DEPT scope users do not get an empty list
UPDATE `after_sales` SET `createdBy` = 'system' WHERE `createdBy` IS NULL;
UPDATE `quality_records` SET `createdBy` = 'system' WHERE `createdBy` IS NULL;
UPDATE `quality_losses` SET `createdBy` = 'system' WHERE `createdBy` IS NULL;
UPDATE `vehicle_commissioning_issues` SET `createdBy` = 'system' WHERE `createdBy` IS NULL;

CREATE INDEX `after_sales_createdBy_idx` ON `after_sales`(`createdBy`);
CREATE INDEX `quality_records_createdBy_idx` ON `quality_records`(`createdBy`);
CREATE INDEX `quality_losses_createdBy_idx` ON `quality_losses`(`createdBy`);
