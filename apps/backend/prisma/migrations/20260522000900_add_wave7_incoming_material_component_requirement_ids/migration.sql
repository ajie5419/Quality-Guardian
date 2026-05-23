ALTER TABLE `inspections`
  ADD COLUMN `incomingTypeId` VARCHAR(191) NULL,
  ADD COLUMN `materialNameId` VARCHAR(191) NULL;

CREATE INDEX `inspections_incomingTypeId_idx`
  ON `inspections` (`incomingTypeId`);

CREATE INDEX `inspections_materialNameId_idx`
  ON `inspections` (`materialNameId`);

ALTER TABLE `qms_inspection_requests`
  ADD COLUMN `componentId` VARCHAR(191) NULL;

CREATE INDEX `qms_inspection_requests_componentId_idx`
  ON `qms_inspection_requests` (`componentId`);

ALTER TABLE `work_order_requirements`
  ADD COLUMN `requirementId` VARCHAR(191) NULL;

CREATE INDEX `work_order_requirements_requirementId_idx`
  ON `work_order_requirements` (`requirementId`);
