ALTER TABLE `work_order_requirements`
  ADD COLUMN `responsibleTeamId` VARCHAR(191) NULL;

CREATE INDEX `work_order_requirements_responsibleTeamId_idx`
  ON `work_order_requirements` (`responsibleTeamId`);

ALTER TABLE `suppliers`
  ADD COLUMN `productNameId` VARCHAR(191) NULL,
  ADD COLUMN `projectId` VARCHAR(191) NULL;

CREATE INDEX `suppliers_productNameId_idx`
  ON `suppliers` (`productNameId`);

CREATE INDEX `suppliers_projectId_idx`
  ON `suppliers` (`projectId`);

ALTER TABLE `quality_records`
  ADD COLUMN `rootCauseId` VARCHAR(191) NULL;

CREATE INDEX `quality_records_rootCauseId_idx`
  ON `quality_records` (`rootCauseId`);
