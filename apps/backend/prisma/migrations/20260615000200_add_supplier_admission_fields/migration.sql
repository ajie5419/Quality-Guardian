ALTER TABLE `suppliers`
  ADD COLUMN `recognizedAt` DATETIME(3) NULL,
  ADD COLUMN `manufacturerNature` VARCHAR(191) NULL,
  ADD COLUMN `admissionDocuments` LONGTEXT NULL;

CREATE INDEX `suppliers_recognizedAt_idx` ON `suppliers`(`recognizedAt`);
