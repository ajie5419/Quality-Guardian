-- AlterTable
ALTER TABLE `processes` ADD COLUMN `supplierSource` VARCHAR(20) NOT NULL DEFAULT 'Supplier';

-- Backfill the historical machined incoming process to the outsourcing supplier
-- source so renaming the process does not change the request supplier options.
UPDATE `processes` SET `supplierSource` = 'Outsourcing' WHERE TRIM(`name`) = '机加成品件' AND `isDeleted` = 0;
