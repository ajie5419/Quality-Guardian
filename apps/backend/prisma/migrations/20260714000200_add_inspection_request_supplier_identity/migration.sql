ALTER TABLE `qms_inspection_requests`
  ADD COLUMN `supplierId` VARCHAR(191) NULL,
  ADD INDEX `qms_inspection_requests_supplierId_idx`(`supplierId`);

ALTER TABLE `qms_inspection_requests`
  ADD CONSTRAINT `qms_inspection_requests_supplierId_fkey`
  FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
