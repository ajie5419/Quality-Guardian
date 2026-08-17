-- AlterTable: archive fields for remaining 10y-retention tables (data lifecycle)
ALTER TABLE `after_sales` ADD COLUMN `archivedAt` DATETIME(3) NULL,
    ADD COLUMN `retainUntil` DATETIME(3) NULL;

ALTER TABLE `quality_losses` ADD COLUMN `archivedAt` DATETIME(3) NULL,
    ADD COLUMN `retainUntil` DATETIME(3) NULL;

ALTER TABLE `work_orders` ADD COLUMN `archivedAt` DATETIME(3) NULL,
    ADD COLUMN `retainUntil` DATETIME(3) NULL;

ALTER TABLE `measuring_instruments` ADD COLUMN `archivedAt` DATETIME(3) NULL,
    ADD COLUMN `retainUntil` DATETIME(3) NULL;
