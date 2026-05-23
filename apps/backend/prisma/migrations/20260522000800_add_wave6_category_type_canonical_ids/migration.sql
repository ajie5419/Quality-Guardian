ALTER TABLE `quality_records`
  ADD COLUMN `categoryId` VARCHAR(191) NULL;

CREATE INDEX `quality_records_categoryId_idx`
  ON `quality_records` (`categoryId`);

ALTER TABLE `suppliers`
  ADD COLUMN `categoryId` VARCHAR(191) NULL;

CREATE INDEX `suppliers_categoryId_idx`
  ON `suppliers` (`categoryId`);

ALTER TABLE `supervision_projects`
  ADD COLUMN `projectTypeId` VARCHAR(191) NULL;

CREATE INDEX `supervision_projects_projectTypeId_idx`
  ON `supervision_projects` (`projectTypeId`);

ALTER TABLE `standard_documents`
  ADD COLUMN `categoryId` VARCHAR(191) NULL;

CREATE INDEX `standard_documents_categoryId_idx`
  ON `standard_documents` (`categoryId`);
