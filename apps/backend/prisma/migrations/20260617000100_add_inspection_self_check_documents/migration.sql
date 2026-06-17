ALTER TABLE `inspections`
  ADD COLUMN `selfCheckDocuments` LONGTEXT NULL,
  ADD COLUMN `hasSelfCheckDocuments` BOOLEAN NOT NULL DEFAULT false;
