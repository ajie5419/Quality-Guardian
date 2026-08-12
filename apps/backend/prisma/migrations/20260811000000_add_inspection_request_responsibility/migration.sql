-- Persist the canonical responsibility selected at request creation.  Existing
-- rows remain nullable and are resolved through the legacy compatibility path.
ALTER TABLE `qms_inspection_requests`
  ADD COLUMN `supplierName` VARCHAR(191) NULL,
  ADD COLUMN `responsibilityType` VARCHAR(191) NULL,
  ADD COLUMN `responsibleDepartmentId` VARCHAR(191) NULL,
  ADD COLUMN `responsibleDepartment` VARCHAR(191) NULL,
  ADD INDEX `qms_inspection_requests_resp_dept_idx` (`responsibilityType`, `responsibleDepartmentId`);
